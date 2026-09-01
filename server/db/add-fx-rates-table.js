// Migration: Add fx_rates table
// Manually-maintained exchange rates (to USD) — deliberately not a live feed,
// so a rate used in a cost comparison is always one someone explicitly set,
// never one that silently went stale.
import pool from './connection.js';

async function createFxRatesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fx_rates (
        currency VARCHAR(10) PRIMARY KEY,
        rate_to_usd NUMERIC NOT NULL,
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_by_username VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      INSERT INTO fx_rates (currency, rate_to_usd)
      VALUES ('USD', 1)
      ON CONFLICT (currency) DO NOTHING;
    `);

    console.log('✓ FX rates table migration complete');
  } catch (error) {
    console.error('Error creating fx_rates table:', error.message);
    throw error;
  }
}

export default createFxRatesTable;
