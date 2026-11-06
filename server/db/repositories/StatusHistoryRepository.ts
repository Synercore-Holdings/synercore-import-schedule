import pool from '../connection.js';
import { logError } from '../../utils/logger.js';
import { AppError } from '../../utils/AppError.ts';

export interface StatusHistoryEntry {
  id: number;
  shipment_id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  changed_by: string | null;
  changed_by_username: string | null;
  source: 'live' | 'backfill' | 'seed' | 'manual';
  original_changed_at: string | null;
  edited_by_username: string | null;
  edited_at: string | null;
}

// Rows are written by the shipments trigger (see add-status-history-table.js);
// this repository only reads, attributes and corrects them.
export class StatusHistoryRepository {
  static async getByShipment(shipmentId: string): Promise<StatusHistoryEntry[]> {
    const result = await pool.query(
      `SELECT * FROM shipment_status_history WHERE shipment_id = $1 ORDER BY changed_at ASC, id ASC`,
      [shipmentId]
    );
    return result.rows;
  }

  /**
   * The trigger can't see who made the change — fill in the user on the
   * entry it just wrote, for code paths that know the user.
   */
  static async attributeLatest(
    shipmentId: string,
    userId: string | null,
    username: string | null
  ): Promise<void> {
    try {
      await pool.query(
        `UPDATE shipment_status_history SET changed_by = $2, changed_by_username = $3
         WHERE id = (
           SELECT id FROM shipment_status_history
           WHERE shipment_id = $1 AND source = 'live' AND changed_by_username IS NULL
             AND changed_at > NOW() - INTERVAL '1 minute'
           ORDER BY changed_at DESC, id DESC LIMIT 1
         )`,
        [shipmentId, userId, username]
      );
    } catch (error) {
      logError('Failed to attribute status history entry', error);
    }
  }

  /**
   * Correct when a status change actually happened (staff often update the
   * status after the event). Keeps the first recorded time for reference and
   * re-syncs shipments.status_changed_at if this is the current-status entry.
   */
  static async updateChangedAt(
    shipmentId: string,
    entryId: number,
    changedAt: Date,
    editedBy: string | null
  ): Promise<StatusHistoryEntry | null> {
    // The newest entry is the current status — keep it newest, so an edit
    // can't make an older status look current (or vice versa)
    const order = await pool.query(
      `SELECT id, to_status, changed_at FROM shipment_status_history
       WHERE shipment_id = $1 ORDER BY changed_at DESC, id DESC LIMIT 2`,
      [shipmentId]
    );
    const [newest, previous] = order.rows;
    if (newest && newest.id === entryId) {
      if (previous && changedAt.getTime() <= new Date(previous.changed_at).getTime()) {
        throw AppError.badRequest(`The current status must stay after ${previous.to_status.replace(/_/g, ' ')} (${new Date(previous.changed_at).toISOString().slice(0, 16).replace('T', ' ')} UTC)`);
      }
    } else if (newest && changedAt.getTime() >= new Date(newest.changed_at).getTime()) {
      throw AppError.badRequest('This time must be before the current status started');
    }

    const result = await pool.query(
      `UPDATE shipment_status_history
       SET original_changed_at = COALESCE(original_changed_at, changed_at),
           changed_at = $3,
           edited_by_username = $4,
           edited_at = NOW()
       WHERE id = $2 AND shipment_id = $1
       RETURNING *`,
      [shipmentId, entryId, changedAt, editedBy]
    );
    if (!result.rows[0]) return null;

    await pool.query(
      `UPDATE shipments s
       SET status_changed_at = h.changed_at
       FROM (
         SELECT to_status, changed_at FROM shipment_status_history
         WHERE shipment_id = $1
         ORDER BY changed_at DESC, id DESC LIMIT 1
       ) h
       WHERE s.id = $1 AND h.to_status = s.latest_status`,
      [shipmentId]
    );

    return result.rows[0];
  }

  /**
   * Record a status the shipment went through that nobody set at the time
   * (e.g. it was delayed at port for 3 days before berthing, found out
   * afterwards). Must fall before the current-status entry so it can't
   * displace the status the shipment is actually in now.
   */
  static async addManual(
    shipmentId: string,
    status: string,
    changedAt: Date,
    userId: string | null,
    username: string | null
  ): Promise<StatusHistoryEntry> {
    const latest = await pool.query(
      `SELECT changed_at FROM shipment_status_history
       WHERE shipment_id = $1 ORDER BY changed_at DESC, id DESC LIMIT 1`,
      [shipmentId]
    );
    if (!latest.rows[0]) {
      throw AppError.badRequest('This shipment has no status history yet');
    }
    if (changedAt.getTime() >= new Date(latest.rows[0].changed_at).getTime()) {
      throw AppError.badRequest('A missed status must be before the current status. To change the current status, use the status dropdown, then edit its time.');
    }

    const result = await pool.query(
      `INSERT INTO shipment_status_history
         (shipment_id, from_status, to_status, changed_at, changed_by, changed_by_username, source)
       VALUES ($1::varchar,
         (SELECT to_status FROM shipment_status_history
          WHERE shipment_id = $1::varchar AND changed_at <= $3 ORDER BY changed_at DESC, id DESC LIMIT 1),
         $2, $3, $4, $5, 'manual')
       RETURNING *`,
      [shipmentId, status, changedAt, userId, username]
    );
    return result.rows[0];
  }

  /**
   * Remove a manually added entry (only those — recorded changes stay).
   */
  static async deleteManual(shipmentId: string, entryId: number): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM shipment_status_history WHERE id = $2 AND shipment_id = $1 AND source = 'manual'`,
      [shipmentId, entryId]
    );
    return (result.rowCount || 0) > 0;
  }

  /**
   * History for every shipment that has passed through a port status, with
   * the shipment fields the Port Delays report groups by. Includes archived
   * shipments so completed port calls still count.
   */
  static async getPortHistory(): Promise<any[]> {
    const result = await pool.query(
      `SELECT
         s.id, s.order_ref, s.supplier, s.product_name, s.vessel_name,
         s.forwarding_agent, s.shipping_line, s.final_pod, s.latest_status,
         s.status_changed_at,
         COALESCE(json_agg(json_build_object(
           'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
           'changed_at', h.changed_at, 'changed_by_username', h.changed_by_username,
           'source', h.source, 'edited_at', h.edited_at
         ) ORDER BY h.changed_at, h.id), '[]') AS history
       FROM shipments s
       JOIN shipment_status_history h ON h.shipment_id = s.id
       WHERE s.id IN (
         SELECT shipment_id FROM shipment_status_history
         WHERE to_status IN ('moored', 'delayed_port', 'berth_working', 'berth_complete')
       )
       GROUP BY s.id`
    );
    return result.rows;
  }
}

export default StatusHistoryRepository;
