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
        container_type VARCHAR(30),
        incoterm VARCHAR(20),
        origin VARCHAR(255),
        destination VARCHAR(255),
        collection_address TEXT,
        supplier_name VARCHAR(255),
        cargo_description TEXT,
        hs_code VARCHAR(50),
        products JSONB DEFAULT '[]'::jsonb,
        dg_classification VARCHAR(10) DEFAULT 'non_dg',
        gross_weight_kg NUMERIC,
        length_cm NUMERIC,
        width_cm NUMERIC,
        height_cm NUMERIC,
        volume_cbm NUMERIC,
        pallet_count INTEGER,
        cargo_value NUMERIC,
        cargo_value_currency VARCHAR(10) DEFAULT 'USD',
        cargo_ready_date VARCHAR(20),
        required_date VARCHAR(20),
        notes TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        quoted_rate NUMERIC,
        quoted_rate_non_stackable NUMERIC,
        quoted_currency VARCHAR(10) DEFAULT 'USD',
        quote_reference VARCHAR(100),
        quoted_transit_days INTEGER,
        quote_notes TEXT,
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_by_username VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS collection_address TEXT;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS dg_classification VARCHAR(10) DEFAULT 'non_dg';`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS length_cm NUMERIC;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS width_cm NUMERIC;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS height_cm NUMERIC;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quoted_rate NUMERIC;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quoted_currency VARCHAR(10) DEFAULT 'USD';`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quote_reference VARCHAR(100);`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quoted_transit_days INTEGER;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quote_notes TEXT;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS cargo_value NUMERIC;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS cargo_value_currency VARCHAR(10) DEFAULT 'USD';`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS container_type VARCHAR(30);`);
    // Air freight only: forwarders often quote a cheaper "stackable" rate and a premium
    // "non-stackable" rate for cargo that can't be stacked in the hold — quoted_rate holds
    // the stackable figure (kept comparable with sea/road's single-rate shape) and this
    // column holds the non-stackable premium alongside it.
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quoted_rate_non_stackable NUMERIC;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS updated_by_username VARCHAR(255);`);
    await pool.query(`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS products JSONB DEFAULT '[]'::jsonb;`);
    // Allow "TBC" as a value — was DATE, now a free-form string so undecided dates can be recorded
    await pool.query(`ALTER TABLE quote_requests ALTER COLUMN cargo_ready_date TYPE VARCHAR(20) USING cargo_ready_date::text;`);
    await pool.query(`ALTER TABLE quote_requests ALTER COLUMN required_date TYPE VARCHAR(20) USING required_date::text;`);

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
