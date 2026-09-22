// Migration: track who last updated a shipment, and per-user "last viewed"
// timestamps -- lets staff see at a glance whether a row has changed since
// they last looked at it, instead of re-checking rows they've already seen.
import pool from './connection.js';

async function addShipmentViews() {
  try {
    await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS updated_by TEXT;`);
    await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS updated_by_username VARCHAR(255);`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_views (
        id SERIAL PRIMARY KEY,
        shipment_id VARCHAR(255) NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (shipment_id, user_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_shipment_views_user ON shipment_views(user_id);`);

    console.log('✓ Shipment views migration complete');
  } catch (error) {
    console.error('Error adding shipment views:', error.message);
    throw error;
  }
}

export default addShipmentViews;
