// Migration: Add quote_requests table
import pool from './connection.js';

async function createQuoteRequestsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_requests (
        id SERIAL PRIMARY KEY,
        requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        requested_by_username VARCHAR(255) NOT NULL,
        forwarder_name VARCHAR(255) NOT NULL,
        forwarder_email VARCHAR(255),
        transport_mode VARCHAR(20) DEFAULT 'sea',
        incoterm VARCHAR(20),
        origin VARCHAR(255),
        destination VARCHAR(255),
        collection_address TEXT,
        supplier_name VARCHAR(255),
        cargo_description TEXT,
        hs_code VARCHAR(50),
        gross_weight_kg NUMERIC,
        volume_cbm NUMERIC,
        pallet_count INTEGER,
        cargo_ready_date DATE,
        required_date DATE,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS collection_address TEXT;`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON quote_requests(status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_quote_requests_user ON quote_requests(requested_by);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_quote_requests_created ON quote_requests(created_at);`);

    console.log('✓ Quote requests table migration complete');
  } catch (error) {
    console.error('Error creating quote_requests table:', error.message);
    throw error;
  }
}

export default createQuoteRequestsTable;
