-- Shipments table
CREATE TABLE IF NOT EXISTS shipments (
  id VARCHAR(255) PRIMARY KEY,
  supplier VARCHAR(255) NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  order_ref VARCHAR(255),
  final_pod VARCHAR(255),
  latest_status VARCHAR(50),
  week_number VARCHAR(10),
  product_name VARCHAR(500),
  quantity NUMERIC,
  cbm NUMERIC,
  pallet_qty NUMERIC,
  receiving_warehouse VARCHAR(255),
  notes TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  forwarding_agent VARCHAR(255),
  incoterm VARCHAR(50),
  vessel_name VARCHAR(255),
  selected_week_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Post-arrival workflow fields
  unloading_start_date TIMESTAMP,
  unloading_completed_date TIMESTAMP,
  inspection_date TIMESTAMP,
  inspection_status VARCHAR(50),
  inspection_notes TEXT,
  inspected_by VARCHAR(255),
  receiving_date TIMESTAMP,
  -- Manually entered by a user once they learn the consignment physically
  -- arrived, independent of when the receiving workflow is run in the app.
  actual_arrival_date TIMESTAMP,
  receiving_status VARCHAR(50),
  receiving_notes TEXT,
  received_by VARCHAR(255),
  received_quantity NUMERIC,
  discrepancies TEXT,
  -- Rejection/Return workflow fields
  rejection_date TIMESTAMP,
  rejection_reason TEXT,
  rejected_by VARCHAR(255),
  -- Inter-Warehouse Transfer (IWT) fields
  source_warehouse VARCHAR(255),
  source_pallet_ref VARCHAR(255),
  batch_lot VARCHAR(255),
  release_number VARCHAR(255)
);

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  country VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warehouse capacity table
CREATE TABLE IF NOT EXISTS warehouse_capacity (
  warehouse_name VARCHAR(255) PRIMARY KEY,
  total_capacity INTEGER DEFAULT 0,
  bins_used INTEGER NOT NULL DEFAULT 0,
  available_bins INTEGER DEFAULT 0,
  updated_by VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Warehouse capacity history (audit trail)
CREATE TABLE IF NOT EXISTS warehouse_capacity_history (
  id SERIAL PRIMARY KEY,
  warehouse_name VARCHAR(255) NOT NULL,
  bins_used INTEGER NOT NULL,
  previous_value INTEGER,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_warehouse_capacity_history_warehouse ON warehouse_capacity_history(warehouse_name);
CREATE INDEX IF NOT EXISTS idx_warehouse_capacity_history_date ON warehouse_capacity_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_shipments_supplier ON shipments(supplier);
CREATE INDEX IF NOT EXISTS idx_shipments_supplier_id ON shipments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(latest_status);
CREATE INDEX IF NOT EXISTS idx_shipments_week ON shipments(week_number);
CREATE INDEX IF NOT EXISTS idx_shipments_updated ON shipments(updated_at);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

-- Additional indexes for common filter combinations and lookups
CREATE INDEX IF NOT EXISTS idx_shipments_warehouse ON shipments(receiving_warehouse);
CREATE INDEX IF NOT EXISTS idx_shipments_status_week ON shipments(latest_status, week_number);
CREATE INDEX IF NOT EXISTS idx_shipments_status_warehouse ON shipments(latest_status, receiving_warehouse);
CREATE INDEX IF NOT EXISTS idx_shipments_order_ref ON shipments(order_ref);
CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments(created_at);
CREATE INDEX IF NOT EXISTS idx_shipments_inspection_status ON shipments(inspection_status);
CREATE INDEX IF NOT EXISTS idx_shipments_receiving_status ON shipments(receiving_status);

-- Initialize default warehouses if they don't exist
INSERT INTO warehouse_capacity (warehouse_name, total_capacity, bins_used, available_bins, updated_at)
VALUES
  ('PRETORIA', 650, 0, 650, CURRENT_TIMESTAMP),
  ('KLAPMUTS', 384, 0, 384, CURRENT_TIMESTAMP),
  ('Offsite', 384, 0, 384, CURRENT_TIMESTAMP)
ON CONFLICT (warehouse_name) DO NOTHING;
