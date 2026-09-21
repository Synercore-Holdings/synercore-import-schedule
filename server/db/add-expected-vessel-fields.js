// Migration: Add expected_next_vessel / expected_vessel_date columns to shipments
// Lets staff note a transshipment they already know is coming (forwarder gave
// advance notice of the vessel that will pick up the cargo after an
// intermediate-port transshipment) without touching vessel_name -- which stays
// the actual current vessel used for live tracking links -- until it's confirmed.
import pool from './connection.js';

async function addExpectedVesselFields() {
  try {
    await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS expected_next_vessel VARCHAR(255);`);
    // Free-text, not DATE -- forwarders often only give an estimate ("~Oct 5", "TBC")
    await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS expected_vessel_date VARCHAR(50);`);

    console.log('✓ Expected vessel fields migration complete');
  } catch (error) {
    console.error('Error adding expected vessel fields:', error.message);
    throw error;
  }
}

export default addExpectedVesselFields;
