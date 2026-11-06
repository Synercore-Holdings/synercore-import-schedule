// Migration: Add shipment_status_history table
// Logs every change to a shipment's latest_status so time-in-status can be
// measured — e.g. how long a vessel sat at Delayed - Port before berthing,
// and how long Berth Working took until Berth Complete. Status is written
// from ~20 places (form, table dropdown, bulk update, post-arrival workflow,
// archive...), so capture happens in a Postgres trigger rather than in each
// code path. Also maintains shipments.status_changed_at ("in this status
// since") for live counters and alerts without fetching the history.
import pool from './connection.js';

async function createStatusHistoryTable() {
  try {
    // First, so ShipmentRepository's column list (which selects it) can't
    // break if a later step here fails.
    await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP WITH TIME ZONE;`);

    const existed = await pool.query(`SELECT to_regclass('public.shipment_status_history') AS t`);
    const isFirstRun = !existed.rows[0].t;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_status_history (
        id SERIAL PRIMARY KEY,
        shipment_id VARCHAR(255) NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
        from_status VARCHAR(50),
        to_status VARCHAR(50) NOT NULL,
        changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        changed_by_username VARCHAR(255),
        -- 'live' = recorded by the trigger; 'backfill' = reconstructed from
        -- audit_log (time = when it was saved); 'seed' = status the shipment
        -- was already in when tracking started (time = estimate); 'manual' =
        -- a missed status a user added afterwards
        source VARCHAR(20) NOT NULL DEFAULT 'live',
        -- Set when a user corrects changed_at (status often updated after the fact)
        original_changed_at TIMESTAMP WITH TIME ZONE,
        edited_by_username VARCHAR(255),
        edited_at TIMESTAMP WITH TIME ZONE
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_status_history_shipment ON shipment_status_history(shipment_id, changed_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_status_history_to_status ON shipment_status_history(to_status);`);

    await pool.query(`
      CREATE OR REPLACE FUNCTION shipments_status_changed_at() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' OR NEW.latest_status IS DISTINCT FROM OLD.latest_status THEN
          NEW.status_changed_at := NOW();
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      CREATE OR REPLACE FUNCTION shipments_log_status_change() RETURNS trigger AS $$
      BEGIN
        IF NEW.latest_status IS NULL THEN
          RETURN NULL;
        END IF;
        -- History is secondary: never let a logging failure block the shipment save
        BEGIN
          IF TG_OP = 'INSERT' THEN
            INSERT INTO shipment_status_history (shipment_id, from_status, to_status, changed_at)
            VALUES (NEW.id, NULL, NEW.latest_status, COALESCE(NEW.status_changed_at, NOW()));
          ELSIF NEW.latest_status IS DISTINCT FROM OLD.latest_status THEN
            INSERT INTO shipment_status_history (shipment_id, from_status, to_status, changed_at)
            VALUES (NEW.id, OLD.latest_status, NEW.latest_status, COALESCE(NEW.status_changed_at, NOW()));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'shipment_status_history insert failed for %: %', NEW.id, SQLERRM;
        END;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      DROP TRIGGER IF EXISTS trg_shipments_status_changed_at ON shipments;
      CREATE TRIGGER trg_shipments_status_changed_at
        BEFORE INSERT OR UPDATE OF latest_status ON shipments
        FOR EACH ROW EXECUTE FUNCTION shipments_status_changed_at();
      DROP TRIGGER IF EXISTS trg_shipments_log_status_change ON shipments;
      CREATE TRIGGER trg_shipments_log_status_change
        AFTER INSERT OR UPDATE OF latest_status ON shipments
        FOR EACH ROW EXECUTE FUNCTION shipments_log_status_change();
    `);

    if (isFirstRun) {
      await backfillFromAuditLog();
      await seedCurrentStatuses();
    }

    console.log('✓ Shipment status history migration complete');
  } catch (error) {
    console.error('Error creating shipment_status_history table:', error.message);
    throw error;
  }
}

// One-off reconstruction of past status changes from audit_log. Only edits
// made through PUT /api/shipments/:id (shipment form, table status dropdown,
// bulk status update) logged the request body there — post-arrival workflow
// steps and PATCH /:id/status never did — so this is a partial, best-effort
// trail. Consecutive saves with the same status collapse into one entry.
async function backfillFromAuditLog() {
  const auditExists = await pool.query(`SELECT to_regclass('public.audit_log') AS t`);
  if (!auditExists.rows[0].t) return;

  const result = await pool.query(`
    WITH status_saves AS (
      SELECT
        a.entity_id AS shipment_id,
        a.changes->>'latestStatus' AS status,
        a.created_at,
        a.user_id,
        a.username,
        a.id
      FROM audit_log a
      JOIN shipments s ON s.id = a.entity_id
      WHERE a.entity_type = 'shipment'
        AND a.action = 'update'
        AND a.changes ? 'latestStatus'
        AND COALESCE(a.changes->>'latestStatus', '') <> ''
    ),
    with_prev AS (
      SELECT *, LAG(status) OVER (PARTITION BY shipment_id ORDER BY created_at, id) AS prev_status
      FROM status_saves
    )
    INSERT INTO shipment_status_history
      (shipment_id, from_status, to_status, changed_at, changed_by, changed_by_username, source)
    SELECT w.shipment_id, w.prev_status, w.status, w.created_at,
           (SELECT u.id FROM users u WHERE u.id = w.user_id), w.username, 'backfill'
    FROM with_prev w
    WHERE w.prev_status IS DISTINCT FROM w.status
  `);

  console.log(`✓ Backfilled ${result.rowCount} status changes from audit log`);
}

// Every shipment whose trail doesn't end in its current status (no history at
// all, or changed by a path that never hit audit_log) gets one 'seed' entry
// for the status it's in now, timed at updated_at — the best available
// estimate, flagged as such in the UI so staff can correct it (e.g. the real
// day a vessel went to Delayed - Port). Then sets status_changed_at from each
// shipment's latest entry.
async function seedCurrentStatuses() {
  const result = await pool.query(`
    INSERT INTO shipment_status_history (shipment_id, from_status, to_status, changed_at, source)
    SELECT s.id, last.to_status, s.latest_status,
           GREATEST(COALESCE(s.updated_at, s.created_at, NOW()), COALESCE(last.changed_at, '-infinity')),
           'seed'
    FROM shipments s
    LEFT JOIN LATERAL (
      SELECT to_status, changed_at FROM shipment_status_history h
      WHERE h.shipment_id = s.id
      ORDER BY changed_at DESC, id DESC LIMIT 1
    ) last ON true
    WHERE s.latest_status IS NOT NULL
      AND last.to_status IS DISTINCT FROM s.latest_status
  `);

  await pool.query(`
    UPDATE shipments s
    SET status_changed_at = h.changed_at
    FROM (
      SELECT DISTINCT ON (shipment_id) shipment_id, to_status, changed_at
      FROM shipment_status_history
      ORDER BY shipment_id, changed_at DESC, id DESC
    ) h
    WHERE h.shipment_id = s.id
      AND h.to_status = s.latest_status
      AND s.status_changed_at IS NULL
  `);

  console.log(`✓ Seeded ${result.rowCount} current statuses into status history`);
}

export default createStatusHistoryTable;
