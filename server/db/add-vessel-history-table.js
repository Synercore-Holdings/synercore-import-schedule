// Migration: Add vessel_history table
// Logs each change to a shipment's vessel_name so staff can see the trail
// left by a mid-voyage transshipment (e.g. booked on MSC SHANGHAI, later
// discharged and reloaded onto MSC EDNA) instead of losing the original
// vessel the moment someone overwrites the field.
import pool from './connection.js';

async function createVesselHistoryTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vessel_history (
        id SERIAL PRIMARY KEY,
        shipment_id VARCHAR(255) NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
        old_vessel_name VARCHAR(255),
        new_vessel_name VARCHAR(255),
        changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        changed_by_username VARCHAR(255),
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_vessel_history_shipment ON vessel_history(shipment_id);`);

    console.log('✓ Vessel history table migration complete');
  } catch (error) {
    console.error('Error creating vessel_history table:', error.message);
    throw error;
  }
}

export default createVesselHistoryTable;
