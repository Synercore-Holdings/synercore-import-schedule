// Promotes an announced transshipment vessel to the actual vessel once its
// date arrives: Expected Next Vessel -> Vessel Name, expected fields cleared,
// change logged to vessel_history (same as the "It's happened now" button).
//
// expected_vessel_date is free text (forwarders sometimes give "~Oct 5" or
// "TBC"), so only real YYYY-MM-DD dates — what the form's date picker saves —
// are acted on. "Today" is South African time.
//
// Uses `new CronJob` — the installed `cron` package has no cron.schedule().
import { CronJob } from 'cron';
import pool from '../db/connection.js';
import { logInfo, logError } from '../utils/logger.js';

const TIMEZONE = 'Africa/Johannesburg';
const SYSTEM_USER = 'System (expected vessel date reached)';

let job = null;

export async function promoteDueExpectedVessels() {
  try {
    const result = await pool.query(
      `WITH due AS (
         SELECT id, vessel_name AS old_vessel, TRIM(expected_next_vessel) AS new_vessel
         FROM shipments
         WHERE COALESCE(TRIM(expected_next_vessel), '') <> ''
           AND expected_vessel_date ~ '^\\d{4}-\\d{2}-\\d{2}'
           AND LEFT(expected_vessel_date, 10)::date <= (NOW() AT TIME ZONE $1)::date
           AND latest_status IS DISTINCT FROM 'archived'
         FOR UPDATE
       ),
       promoted AS (
         UPDATE shipments s
         SET vessel_name = due.new_vessel,
             expected_next_vessel = NULL,
             expected_vessel_date = NULL,
             updated_at = NOW(),
             updated_by = NULL,
             updated_by_username = $2
         FROM due
         WHERE s.id = due.id
         RETURNING s.id, due.old_vessel, due.new_vessel
       ),
       logged AS (
         INSERT INTO vessel_history (shipment_id, old_vessel_name, new_vessel_name, changed_by, changed_by_username)
         SELECT id, old_vessel, new_vessel, NULL, $2
         FROM promoted
         WHERE old_vessel IS DISTINCT FROM new_vessel
       )
       SELECT id, old_vessel, new_vessel FROM promoted`,
      [TIMEZONE, SYSTEM_USER]
    );

    if (result.rowCount > 0) {
      logInfo('Promoted expected vessels whose date has arrived', {
        count: result.rowCount,
        shipments: result.rows.map(r => `${r.id}: ${r.old_vessel || '—'} -> ${r.new_vessel}`),
      });
    }
    return result.rows;
  } catch (error) {
    logError('Expected vessel promotion failed', error);
    return [];
  }
}

export const ExpectedVesselScheduler = {
  // Hourly (so a date entered as today/past switches within the hour), plus
  // once at startup to catch up on anything due while the server was down.
  initializeJobs() {
    job = new CronJob('5 * * * *', promoteDueExpectedVessels, null, true, TIMEZONE);
    promoteDueExpectedVessels();
  },

  stopAllJobs() {
    if (job) job.stop();
    job = null;
  },
};

export default ExpectedVesselScheduler;
