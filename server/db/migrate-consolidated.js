#!/usr/bin/env node

/**
 * Consolidated Database Migration Script
 *
 * Executes all database migrations in the correct sequence with:
 * - Dependency tracking
 * - Status recording
 * - Error handling and recovery
 * - Detailed logging
 *
 * Usage:
 *   node migrate-consolidated.js              # Run all migrations
 *   node migrate-consolidated.js --status     # Show migration status
 *   node migrate-consolidated.js --reset      # Reset migration history
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './connection.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';

// Load environment variables
if (!process.env.DATABASE_URL) {
  dotenv.config();
}

// Disable SSL certificate validation for Railway Postgres
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migration status enum
const MigrationStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
};

/**
 * Migration registry with execution sequence
 */
const migrations = [
  // Phase 1: Schema (external SQL file)
  {
    name: 'schema-creation',
    version: '000',
    description: 'Create base schema from schema.sql',
    depends_on: [],
    critical: true,
    execute: async () => {
      const schemaPath = path.join(__dirname, 'schema.sql');
      try {
        const schemaSQL = await fs.readFile(schemaPath, 'utf8');
        await db.query(schemaSQL);
        logInfo('✓ Base schema created successfully');
        return true;
      } catch (error) {
        if (error.code === 'ENOENT') {
          logWarn('⚠️  schema.sql not found, skipping');
          return true;
        }
        throw error;
      }
    },
  },

  // Phase 2: Performance Indexes
  {
    name: 'add-performance-indexes',
    version: '001',
    description: 'Add performance indexes to shipments table',
    depends_on: ['schema-creation'],
    execute: async () => {
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_shipments_warehouse ON shipments(receiving_warehouse)',
        'CREATE INDEX IF NOT EXISTS idx_shipments_status_week ON shipments(latest_status, week_number)',
        'CREATE INDEX IF NOT EXISTS idx_shipments_status_warehouse ON shipments(latest_status, receiving_warehouse)',
        'CREATE INDEX IF NOT EXISTS idx_shipments_order_ref ON shipments(order_ref)',
        'CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_shipments_inspection_status ON shipments(inspection_status)',
        'CREATE INDEX IF NOT EXISTS idx_shipments_receiving_status ON shipments(receiving_status)',
      ];

      for (const indexQuery of indexes) {
        try {
          await db.query(indexQuery);
        } catch (error) {
          if (!error.message?.includes('already exists')) {
            throw error;
          }
        }
      }
      logInfo('✓ Performance indexes created');
      return true;
    },
  },

  // Phase 3: Column Additions
  {
    name: 'add-available-bins',
    version: '002',
    description: 'Add available_bins column to warehouse_capacity table',
    depends_on: ['schema-creation'],
    execute: async () => {
      const checkResult = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name='warehouse_capacity' AND column_name='available_bins'`
      );

      if (checkResult.rows.length > 0) {
        logInfo('  → available_bins column already exists');
        return true;
      }

      await db.query(
        `ALTER TABLE warehouse_capacity ADD COLUMN available_bins INTEGER DEFAULT 0`
      );

      const warehouses = [
        { name: 'PRETORIA', bins: 650 },
        { name: 'KLAPMUTS', bins: 384 },
        { name: 'OFFSITE', bins: 384 },
      ];

      for (const warehouse of warehouses) {
        const result = await db.query(
          'SELECT * FROM warehouse_capacity WHERE warehouse_name = $1',
          [warehouse.name]
        );

        if (result.rows.length === 0) {
          await db.query(
            `INSERT INTO warehouse_capacity (warehouse_name, bins_used, available_bins, updated_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
            [warehouse.name, 0, warehouse.bins]
          );
        }
      }
      logInfo('✓ available_bins column added');
      return true;
    },
  },

  {
    name: 'add-total-capacity',
    version: '003',
    description: 'Add total_capacity column to warehouse_capacity table',
    depends_on: ['schema-creation'],
    execute: async () => {
      const checkResult = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name='warehouse_capacity' AND column_name='total_capacity'`
      );

      if (checkResult.rows.length > 0) {
        logInfo('  → total_capacity column already exists');
        return true;
      }

      await db.query(
        `ALTER TABLE warehouse_capacity ADD COLUMN total_capacity INTEGER DEFAULT 0`
      );

      const warehouses = [
        { name: 'PRETORIA', capacity: 650 },
        { name: 'KLAPMUTS', capacity: 384 },
        { name: 'OFFSITE', capacity: 384 },
      ];

      for (const warehouse of warehouses) {
        const result = await db.query(
          'SELECT * FROM warehouse_capacity WHERE warehouse_name = $1',
          [warehouse.name]
        );

        if (result.rows.length === 0) {
          await db.query(
            `INSERT INTO warehouse_capacity (warehouse_name, total_capacity, bins_used, available_bins, updated_at)
             VALUES ($1, $2, 0, $2, CURRENT_TIMESTAMP)`,
            [warehouse.name, warehouse.capacity]
          );
        }
      }
      logInfo('✓ total_capacity column added');
      return true;
    },
  },

  {
    name: 'add-password-reset',
    version: '004',
    description: 'Add password reset token columns to users table',
    depends_on: ['schema-creation'],
    execute: async () => {
      const checkResult = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name='users' AND column_name='reset_token'`
      );

      if (checkResult.rows.length > 0) {
        logInfo('  → Password reset columns already exist');
        return true;
      }

      await db.query(`
        ALTER TABLE users
        ADD COLUMN reset_token VARCHAR(255),
        ADD COLUMN reset_token_expiry TIMESTAMP;
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token)
        WHERE reset_token IS NOT NULL;
      `);

      logInfo('✓ Password reset columns added');
      return true;
    },
  },

  // Phase 4: Table Creations
  {
    name: 'add-notifications-tables',
    version: '005',
    description: 'Create notification preferences, logs, and digest queue tables',
    depends_on: ['schema-creation'],
    execute: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS notification_preferences (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          notify_shipment_arrival BOOLEAN DEFAULT true,
          notify_inspection_failed BOOLEAN DEFAULT true,
          notify_inspection_passed BOOLEAN DEFAULT true,
          notify_warehouse_capacity BOOLEAN DEFAULT true,
          notify_delayed_shipment BOOLEAN DEFAULT true,
          notify_post_arrival_update BOOLEAN DEFAULT true,
          notify_workflow_assigned BOOLEAN DEFAULT true,
          email_enabled BOOLEAN DEFAULT true,
          email_frequency VARCHAR(50) DEFAULT 'immediate',
          email_address TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notification_log (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          event_type VARCHAR(100) NOT NULL,
          shipment_id TEXT,
          subject TEXT NOT NULL,
          message TEXT NOT NULL,
          status VARCHAR(50) DEFAULT 'sent',
          delivery_method VARCHAR(50) DEFAULT 'email',
          sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          error_message TEXT,
          FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS notification_digest_queue (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          event_type VARCHAR(100) NOT NULL,
          shipment_id TEXT,
          event_data JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP WITH TIME ZONE,
          FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);
        CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(sent_at);
        CREATE INDEX IF NOT EXISTS idx_notification_log_event ON notification_log(event_type);
        CREATE INDEX IF NOT EXISTS idx_digest_queue_user ON notification_digest_queue(user_id);
        CREATE INDEX IF NOT EXISTS idx_digest_queue_processed ON notification_digest_queue(processed_at);
      `);

      logInfo('✓ Notification tables created');
      return true;
    },
  },

  {
    name: 'add-refresh-tokens-table',
    version: '006',
    description: 'Create refresh_tokens table for JWT token refresh',
    depends_on: ['schema-creation'],
    execute: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          revoked_at TIMESTAMP WITH TIME ZONE,
          ip_address VARCHAR(45),
          user_agent TEXT,
          CONSTRAINT no_revoked_tokens CHECK (revoked_at IS NULL)
        );

        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
      `);

      logInfo('✓ Refresh tokens table created');
      return true;
    },
  },

  {
    name: 'add-supplier-accounts',
    version: '007',
    description: 'Create supplier portal tables (accounts and documents)',
    depends_on: ['schema-creation'],
    execute: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS supplier_accounts (
          id SERIAL PRIMARY KEY,
          supplier_id TEXT NOT NULL UNIQUE REFERENCES suppliers(id) ON DELETE CASCADE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          is_verified BOOLEAN DEFAULT false,
          verified_at TIMESTAMP WITH TIME ZONE,
          last_login TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT true
        );

        CREATE TABLE IF NOT EXISTS supplier_documents (
          id SERIAL PRIMARY KEY,
          shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
          document_type VARCHAR(50) NOT NULL,
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER,
          mime_type VARCHAR(100),
          uploaded_by TEXT NOT NULL,
          uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          description TEXT,
          is_verified BOOLEAN DEFAULT false,
          verified_by TEXT,
          verified_at TIMESTAMP WITH TIME ZONE
        );

        CREATE INDEX IF NOT EXISTS idx_supplier_accounts_email ON supplier_accounts(email);
        CREATE INDEX IF NOT EXISTS idx_supplier_accounts_supplier_id ON supplier_accounts(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_documents_shipment ON supplier_documents(shipment_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_documents_supplier ON supplier_documents(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_documents_type ON supplier_documents(document_type);
      `);

      // Add portal_enabled column to suppliers
      const checkResult = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name='suppliers' AND column_name='portal_enabled'`
      );

      if (checkResult.rows.length === 0) {
        await db.query(
          `ALTER TABLE suppliers ADD COLUMN portal_enabled BOOLEAN DEFAULT true`
        );
      }

      logInfo('✓ Supplier portal tables created');
      return true;
    },
  },

  {
    name: 'add-archives-table',
    version: '008',
    description: 'Create archives table for archived shipments',
    depends_on: ['schema-creation'],
    execute: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS archives (
          id SERIAL PRIMARY KEY,
          file_name VARCHAR(255) NOT NULL UNIQUE,
          archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          total_shipments INTEGER NOT NULL DEFAULT 0,
          data JSONB NOT NULL,
          created_by VARCHAR(255),
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_archives_archived_at ON archives(archived_at);
        CREATE INDEX IF NOT EXISTS idx_archives_file_name ON archives(file_name);
      `);

      logInfo('✓ Archives table created');
      return true;
    },
  },

  // Phase 5: Referential Integrity & Constraints
  {
    name: 'add-referential-integrity',
    version: '009',
    description: 'Add foreign key constraints and audit columns',
    depends_on: ['schema-creation', 'add-notifications-tables', 'add-supplier-accounts'],
    execute: async () => {
      const client = await db.getPool().connect();
      try {
        await client.query('BEGIN');

        // Add foreign key constraints safely
        const constraints = [
          {
            table: 'shipments',
            column: 'inspected_by',
            ref_table: 'users',
            ref_column: 'id',
            name: 'fk_shipments_inspected_by',
          },
          {
            table: 'shipments',
            column: 'received_by',
            ref_table: 'users',
            ref_column: 'id',
            name: 'fk_shipments_received_by',
          },
          {
            table: 'shipments',
            column: 'rejected_by',
            ref_table: 'users',
            ref_column: 'id',
            name: 'fk_shipments_rejected_by',
          },
          {
            table: 'supplier_documents',
            column: 'verified_by',
            ref_table: 'users',
            ref_column: 'id',
            name: 'fk_supplier_documents_verified_by',
          },
        ];

        for (const constraint of constraints) {
          const checkResult = await client.query(
            `SELECT constraint_name FROM information_schema.table_constraints
             WHERE table_name = $1 AND constraint_name = $2`,
            [constraint.table, constraint.name]
          );

          if (checkResult.rows.length === 0) {
            const colCheck = await client.query(
              `SELECT column_name FROM information_schema.columns
               WHERE table_name = $1 AND column_name = $2`,
              [constraint.table, constraint.column]
            );

            if (colCheck.rows.length > 0) {
              await client.query(`
                ALTER TABLE ${constraint.table}
                ADD CONSTRAINT ${constraint.name}
                FOREIGN KEY (${constraint.column})
                REFERENCES ${constraint.ref_table}(${constraint.ref_column})
                ON DELETE SET NULL
              `);
            }
          }
        }

        // Add soft-delete columns
        const tables = ['shipments', 'suppliers', 'users'];
        for (const tableName of tables) {
          const checkResult = await client.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_name = $1 AND column_name = 'deleted_at'`,
            [tableName]
          );

          if (checkResult.rows.length === 0) {
            await client.query(
              `ALTER TABLE ${tableName}
               ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE`
            );
          }
        }

        // Add audit columns
        const auditCheck = await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'users' AND column_name = 'created_by'`
        );

        if (auditCheck.rows.length === 0) {
          await client.query(
            `ALTER TABLE users
             ADD COLUMN created_by VARCHAR(255),
             ADD COLUMN updated_by VARCHAR(255)`
          );
        }

        await client.query('COMMIT');
        logInfo('✓ Referential integrity constraints added');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  },

  // Phase 6: Data Migrations
  {
    name: 'backfill-week-dates',
    version: '010',
    description: 'Backfill selected_week_date from week_number',
    depends_on: ['schema-creation'],
    execute: async () => {
      const getWeekNumber = (date) => {
        const d = new Date(
          Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
        );
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      };

      const getWeekStartDate = (weekNumber, year) => {
        const jan4 = new Date(year, 0, 4);
        const week1Monday = new Date(jan4);
        week1Monday.setDate(jan4.getDate() - jan4.getDay() + 1);
        const weekStart = new Date(week1Monday);
        weekStart.setDate(week1Monday.getDate() + (weekNumber - 1) * 7);
        return weekStart;
      };

      const calculateWeekDate = (weekNumber) => {
        if (!weekNumber || weekNumber < 1 || weekNumber > 53) return null;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentWeek = getWeekNumber(now);
        const currentMonth = now.getMonth();

        let targetYear = currentYear;
        if (currentMonth === 11 && weekNumber <= 10) {
          targetYear = currentYear + 1;
        } else if (currentMonth === 0 && weekNumber >= 45) {
          targetYear = currentYear - 1;
        } else if (weekNumber < currentWeek - 20) {
          targetYear = currentYear + 1;
        } else if (weekNumber > currentWeek + 20) {
          targetYear = currentYear - 1;
        }

        const weekStartDate = getWeekStartDate(weekNumber, targetYear);
        return weekStartDate.toISOString().split('T')[0];
      };

      const result = await db.query(
        'SELECT id, week_number FROM shipments WHERE week_number IS NOT NULL AND selected_week_date IS NULL'
      );

      let updated = 0;
      for (const shipment of result.rows) {
        const selectedWeekDate = calculateWeekDate(shipment.week_number);
        if (selectedWeekDate) {
          await db.query(
            'UPDATE shipments SET selected_week_date = $1 WHERE id = $2',
            [selectedWeekDate, shipment.id]
          );
          updated++;
        }
      }

      logInfo(`✓ Backfilled ${updated} shipments with week dates`);
      return true;
    },
  },

  {
    name: 'fix-supplier-names',
    version: '011',
    description: 'Fix supplier name inconsistencies',
    depends_on: ['schema-creation'],
    execute: async () => {
      const fixes = [
        { old: 'AB Mauri ', new: 'AB Mauri' },
        { old: 'Aromsa', new: 'AROMSA' },
        { old: 'Shakti Chemicals', new: 'SHAKTI CHEMICALS' },
        { old: ' Sacco', new: 'SACCO' },
        { old: 'Deltaris', new: 'QUERCYL' },
      ];

      for (const fix of fixes) {
        await db.query(
          `UPDATE suppliers SET name = $1, updated_at = CURRENT_TIMESTAMP
           WHERE name = $2`,
          [fix.new, fix.old]
        );
      }

      logInfo('✓ Supplier names fixed');
      return true;
    },
  },

  {
    name: 'fix-shipment-supplier-names',
    version: '012',
    description: 'Fix shipment supplier name inconsistencies',
    depends_on: ['schema-creation', 'fix-supplier-names'],
    execute: async () => {
      await db.query(
        `UPDATE shipments SET supplier = $1, updated_at = CURRENT_TIMESTAMP
         WHERE supplier = $2`,
        ['SHAKTI CHEMICALS', 'Shakti Chemicals']
      );

      logInfo('✓ Shipment supplier names fixed');
      return true;
    },
  },

  {
    name: 'add-rejection-migration',
    version: '013',
    description: 'Add rejection fields to shipments table',
    depends_on: ['schema-creation'],
    execute: async () => {
      // This migration requires add-rejection-fields.sql
      // For now, we skip it as it's optional
      logInfo('  → Rejection migration skipped (requires external SQL)');
      return true;
    },
  },

  {
    name: 'add-costing-tables',
    version: '014',
    description: 'Create import cost estimate and exchange rate tables with multi-product support',
    depends_on: ['schema-creation'],
    execute: async () => {
      // Create import_cost_estimates table if it doesn't exist
      const tableCheck = await db.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name='import_cost_estimates'`
      );

      if (tableCheck.rows.length === 0) {
        logInfo('  Creating import_cost_estimates table...');
        await db.query(`
          CREATE TABLE import_cost_estimates (
            id VARCHAR(255) PRIMARY KEY,
            shipment_id VARCHAR(255),
            supplier_id VARCHAR(255),
            reference_number VARCHAR(100),
            country_of_destination VARCHAR(100) DEFAULT 'South Africa',
            country_of_origin VARCHAR(100),
            port_of_loading VARCHAR(100),
            port_of_discharge VARCHAR(50),
            shipping_line VARCHAR(100),
            routing VARCHAR(255),
            frequency VARCHAR(50),
            transit_time_days INTEGER,
            inco_terms VARCHAR(20),
            inco_term_place VARCHAR(100),
            container_type VARCHAR(50),
            quantity INTEGER DEFAULT 1,
            hs_code VARCHAR(50),
            gross_weight_kg NUMERIC(12,2),
            total_gross_weight_kg NUMERIC(12,2),
            origin_rate_usd NUMERIC(12,2),
            ocean_freight_rate_usd NUMERIC(12,2),
            commodity VARCHAR(255),
            invoice_value_usd NUMERIC(14,2) DEFAULT 0,
            invoice_value_eur NUMERIC(14,2) DEFAULT 0,
            customs_value_zar NUMERIC(14,2) DEFAULT 0,
            supplier_name VARCHAR(255),
            validity_date DATE,
            costing_date DATE DEFAULT CURRENT_DATE,
            payment_terms VARCHAR(100),
            roe_origin NUMERIC(12,6),
            roe_eur NUMERIC(12,6),
            roe_customs NUMERIC(12,6),
            products JSONB DEFAULT '[]'::jsonb,
            origin_charge_usd NUMERIC(12,2) DEFAULT 0,
            origin_charge_eur NUMERIC(12,2) DEFAULT 0,
            origin_charge_zar NUMERIC(14,2) DEFAULT 0,
            total_origin_charges_zar NUMERIC(14,2) DEFAULT 0,
            local_cartage_cpt_klapmuts_20ton_zar NUMERIC(12,2) DEFAULT 0,
            local_cartage_cpt_klapmuts_28ton_zar NUMERIC(12,2) DEFAULT 0,
            transport_dbn_to_pretoria_20ft_zar NUMERIC(12,2) DEFAULT 0,
            transport_dbn_to_pretoria_40ft_zar NUMERIC(12,2) DEFAULT 0,
            transport_dbn_to_whs_zar NUMERIC(12,2) DEFAULT 0,
            unpack_reload_zar NUMERIC(12,2) DEFAULT 0,
            storage_zar NUMERIC(12,2) DEFAULT 0,
            storage_days INTEGER DEFAULT 0,
            warehouse_handling_rate_per_kg_zar NUMERIC(8,2) DEFAULT 0.62,
            warehouse_handling_events NUMERIC(5,2) DEFAULT 2,
            warehouse_storage_rate_per_kg_month_zar NUMERIC(8,2) DEFAULT 0.82,
            warehouse_storage_months NUMERIC(5,2) DEFAULT 1,
            warehouse_chargeable_weight_kg NUMERIC(12,2) DEFAULT 0,
            warehouse_handling_fee_zar NUMERIC(12,2) DEFAULT 0,
            warehouse_storage_fee_zar NUMERIC(12,2) DEFAULT 0,
            warehouse_charges_subtotal_zar NUMERIC(14,2) DEFAULT 0,
            outlying_depot_surcharge_zar NUMERIC(12,2) DEFAULT 0,
            local_cartage_dbn_whs_pretoria_opt_a_zar NUMERIC(12,2) DEFAULT 0,
            local_cartage_dbn_whs_pretoria_opt_b_zar NUMERIC(12,2) DEFAULT 0,
            local_cartage_dbn_whs_pretoria_6m_zar NUMERIC(12,2) DEFAULT 0,
            local_cartage_dbn_whs_pretoria_12m_zar NUMERIC(12,2) DEFAULT 0,
            transport_pe_coega_to_pretoria_zar NUMERIC(12,2) DEFAULT 0,
            transport_plz_to_east_london_zar NUMERIC(12,2) DEFAULT 0,
            local_charges_subtotal_zar NUMERIC(14,2) DEFAULT 0,
            shipping_line_charges_zar NUMERIC(12,2) DEFAULT 0,
            cargo_dues_20ft_zar NUMERIC(12,2) DEFAULT 0,
            cargo_dues_40ft_zar NUMERIC(12,2) DEFAULT 0,
            cto_fee_zar NUMERIC(12,2) DEFAULT 0,
            port_health_inspection_zar NUMERIC(12,2) DEFAULT 0,
            daff_inspection_zar NUMERIC(12,2) DEFAULT 0,
            state_vet_cancellation_fee_zar NUMERIC(12,2) DEFAULT 0,
            jnb_turn_in_zar NUMERIC(12,2) DEFAULT 0,
            plz_turn_in_zar NUMERIC(12,2) DEFAULT 0,
            handover_fee_zar NUMERIC(12,2) DEFAULT 0,
            destination_charges_subtotal_zar NUMERIC(14,2) DEFAULT 0,
            duties_zar NUMERIC(12,2) DEFAULT 0,
            customs_vat_zar NUMERIC(12,2) DEFAULT 0,
            customs_declaration_zar NUMERIC(12,2) DEFAULT 0,
            agency_fee_zar NUMERIC(12,2) DEFAULT 0,
            agency_fee_percentage NUMERIC(5,2) DEFAULT 3.5,
            agency_fee_min NUMERIC(12,2) DEFAULT 1187,
            customs_duty_not_applicable BOOLEAN DEFAULT false,
            customs_subtotal_zar NUMERIC(14,2) DEFAULT 0,
            total_shipping_cost_zar NUMERIC(14,2) DEFAULT 0,
            total_in_warehouse_cost_zar NUMERIC(14,2) DEFAULT 0,
            total_landed_cost_zar NUMERIC(14,2) DEFAULT 0,
            all_in_warehouse_cost_per_kg_zar NUMERIC(12,4) DEFAULT 0,
            overhead_cost_per_kg_zar NUMERIC(12,4) DEFAULT 0,
            manual_previous_cost_per_kg_zar NUMERIC(12,4) DEFAULT 0,
            manual_previous_cost_date DATE,
            last_mile_service_type VARCHAR(50),
            last_mile_route VARCHAR(100),
            last_mile_weight_kg NUMERIC(12,2) DEFAULT 0,
            last_mile_fuel_levy_percent NUMERIC(5,2) DEFAULT 0,
            last_mile_manual_charge_zar NUMERIC(12,2) DEFAULT 0,
            last_mile_extra_charges_zar NUMERIC(12,2) DEFAULT 0,
            last_mile_charges_subtotal_zar NUMERIC(14,2) DEFAULT 0,
            last_mile_charges JSONB DEFAULT '[]'::jsonb,
            status VARCHAR(50) DEFAULT 'draft',
            notes TEXT,
            created_by VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        logInfo('  ✓ Created import_cost_estimates table');

        // Create indexes
        await db.query(`CREATE INDEX IF NOT EXISTS idx_cost_estimates_shipment ON import_cost_estimates(shipment_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_cost_estimates_supplier ON import_cost_estimates(supplier_id)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_cost_estimates_date ON import_cost_estimates(costing_date)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_cost_estimates_status ON import_cost_estimates(status)`);
        logInfo('  ✓ Created indexes');
      } else {
        // Table exists, add new columns if missing
        const addColumnIfNotExists = async (columnDef) => {
          const colName = columnDef.split(' ')[0];
          const checkResult = await db.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_name='import_cost_estimates' AND column_name=$1`,
            [colName]
          );
          if (checkResult.rows.length === 0) {
            await db.query(`ALTER TABLE import_cost_estimates ADD COLUMN ${columnDef}`);
            logInfo(`  ✓ Added column: ${colName}`);
            return true;
          }
          return false;
        };

        await addColumnIfNotExists('country_of_origin VARCHAR(100)');
        await addColumnIfNotExists('port_of_loading VARCHAR(100)');
        await addColumnIfNotExists('roe_customs NUMERIC(12,6)');
        await addColumnIfNotExists("products JSONB DEFAULT '[]'::jsonb");
        await addColumnIfNotExists('last_mile_service_type VARCHAR(50)');
        await addColumnIfNotExists('last_mile_route VARCHAR(100)');
        await addColumnIfNotExists('last_mile_weight_kg NUMERIC(12,2) DEFAULT 0');
        await addColumnIfNotExists('last_mile_fuel_levy_percent NUMERIC(5,2) DEFAULT 0');
        await addColumnIfNotExists('last_mile_manual_charge_zar NUMERIC(12,2) DEFAULT 0');
        await addColumnIfNotExists('last_mile_extra_charges_zar NUMERIC(12,2) DEFAULT 0');
        await addColumnIfNotExists('last_mile_charges_subtotal_zar NUMERIC(14,2) DEFAULT 0');
        await addColumnIfNotExists("last_mile_charges JSONB DEFAULT '[]'::jsonb");
        await addColumnIfNotExists('warehouse_handling_rate_per_kg_zar NUMERIC(8,2) DEFAULT 0.62');
        await addColumnIfNotExists('warehouse_handling_events NUMERIC(5,2) DEFAULT 2');
        await addColumnIfNotExists('warehouse_storage_rate_per_kg_month_zar NUMERIC(8,2) DEFAULT 0.82');
        await addColumnIfNotExists('warehouse_storage_months NUMERIC(5,2) DEFAULT 1');
        await addColumnIfNotExists('warehouse_chargeable_weight_kg NUMERIC(12,2) DEFAULT 0');
        await addColumnIfNotExists('warehouse_handling_fee_zar NUMERIC(12,2) DEFAULT 0');
        await addColumnIfNotExists('warehouse_storage_fee_zar NUMERIC(12,2) DEFAULT 0');
        await addColumnIfNotExists('warehouse_charges_subtotal_zar NUMERIC(14,2) DEFAULT 0');
        await addColumnIfNotExists('handover_fee_zar NUMERIC(12,2) DEFAULT 0');
        await addColumnIfNotExists('total_landed_cost_zar NUMERIC(14,2) DEFAULT 0');
        await addColumnIfNotExists('overhead_cost_per_kg_zar NUMERIC(12,4) DEFAULT 0');
        await addColumnIfNotExists('manual_previous_cost_per_kg_zar NUMERIC(12,4) DEFAULT 0');
        await addColumnIfNotExists('manual_previous_cost_date DATE');
        await addColumnIfNotExists('air_edi_fee_zar NUMERIC(12,2) DEFAULT 0');
        await addColumnIfNotExists('air_import_documentation_zar NUMERIC(12,2) DEFAULT 0');
        await addColumnIfNotExists('airline_landside_delivery_zar NUMERIC(12,2) DEFAULT 0');
      }

      // Create exchange_rate_cache table if it doesn't exist
      const rateTableCheck = await db.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name='exchange_rate_cache'`
      );

      if (rateTableCheck.rows.length === 0) {
        logInfo('  Creating exchange_rate_cache table...');
        await db.query(`
          CREATE TABLE exchange_rate_cache (
            id SERIAL PRIMARY KEY,
            currency_pair VARCHAR(10) NOT NULL UNIQUE,
            rate NUMERIC(12,6) NOT NULL,
            source VARCHAR(100),
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        logInfo('  ✓ Created exchange_rate_cache table');
      }

      logInfo('✓ Costing tables migration complete');
      return true;
    },
  },

  // Phase 8: Company Announcements
  {
    name: 'create-announcements-table',
    version: '021',
    description: 'Create announcements table for company news ticker items',
    depends_on: ['schema-creation'],
    execute: async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS announcements (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          link TEXT,
          active BOOLEAN DEFAULT true,
          expires_at TIMESTAMP WITH TIME ZONE,
          created_by TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active) WHERE active = true;
        CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements(expires_at);
      `);

      logInfo('✓ Announcements table created');
      return true;
    },
  },
];

/**
 * Initialize migration tracking table
 */
async function initializeMigrationTracking() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS migration_history (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        error_message TEXT,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE,
        duration_ms INTEGER,
        UNIQUE(name, version)
      );
    `);

    logInfo('✓ Migration tracking initialized');
  } catch (error) {
    logError('Failed to initialize migration tracking', error);
  }
}

/**
 * Record migration execution
 */
async function recordMigration(name, version, status, error, durationMs) {
  try {
    await db.query(
      `INSERT INTO migration_history (name, version, status, error_message, executed_at, completed_at, duration_ms)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6)
       ON CONFLICT (name, version) DO UPDATE SET
         status = EXCLUDED.status,
         error_message = EXCLUDED.error_message,
         completed_at = EXCLUDED.completed_at,
         duration_ms = EXCLUDED.duration_ms`,
      [
        name,
        version,
        status,
        error || null,
        status === MigrationStatus.COMPLETED ? new Date().toISOString() : null,
        durationMs || 0,
      ]
    );
  } catch (err) {
    logError('Failed to record migration', err);
  }
}

/**
 * Show migration status
 */
async function showStatus() {
  try {
    const result = await db.query(
      `SELECT name, version, status, executed_at, completed_at, duration_ms, error_message
       FROM migration_history
       ORDER BY version ASC`
    );

    console.log('\n📊 Migration History:\n');
    if (result.rows.length === 0) {
      console.log('No migrations have been executed yet.\n');
      return;
    }

    result.rows.forEach((row) => {
      const status = row.status;
      const icon =
        status === 'COMPLETED'
          ? '✅'
          : status === 'FAILED'
            ? '❌'
            : status === 'SKIPPED'
              ? '⏭️ '
              : '⏳';

      console.log(`${icon} ${row.name} (v${row.version})`);
      console.log(`   Status: ${status}`);
      if (row.completed_at) {
        console.log(`   Completed: ${new Date(row.completed_at).toLocaleString()}`);
      }
      if (row.duration_ms) {
        console.log(`   Duration: ${row.duration_ms}ms`);
      }
      if (row.error_message) {
        console.log(`   Error: ${row.error_message}`);
      }
      console.log();
    });
  } catch (error) {
    logError('Failed to show status', error);
  }
}

/**
 * Reset migration history
 */
async function resetMigrations() {
  try {
    await db.query('DELETE FROM migration_history');
    logInfo('✓ Migration history reset');
  } catch (error) {
    logError('Failed to reset migrations', error);
  }
}

/**
 * Run all migrations
 */
async function runMigrations() {
  try {
    console.log('\n🔄 Starting database migrations...\n');

    // Test database connection
    try {
      await db.query('SELECT 1');
      logInfo('✓ Database connection successful\n');
    } catch (error) {
      logError('❌ Database connection failed', error);
      process.exit(1);
    }

    // Initialize tracking
    await initializeMigrationTracking();
    console.log();

    let completed = 0;
    let failed = 0;
    let skipped = 0;

    for (const migration of migrations) {
      const startTime = Date.now();

      try {
        await recordMigration(
          migration.name,
          migration.version,
          MigrationStatus.RUNNING
        );

        logInfo(`[${migration.version}] ${migration.name}: ${migration.description}`);

        const success = await migration.execute();

        const duration = Date.now() - startTime;
        await recordMigration(
          migration.name,
          migration.version,
          MigrationStatus.COMPLETED,
          null,
          duration
        );

        if (!success) {
          skipped++;
        } else {
          completed++;
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);

        await recordMigration(
          migration.name,
          migration.version,
          MigrationStatus.FAILED,
          errorMsg,
          duration
        );

        logError(
          `[${migration.version}] ${migration.name} failed: ${errorMsg}`,
          error
        );

        // Don't stop on non-critical migrations
        if (!migration.critical) {
          failed++;
          continue;
        } else {
          throw error;
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(
      `✅ Migration completed: ${completed} successful, ${failed} failed, ${skipped} skipped`
    );
    console.log(`${'='.repeat(60)}\n`);

    // Show detailed status
    await showStatus();

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    logError('Migration failed', error);
    process.exit(1);
  }
}

// Main entry point
const command = process.argv[2];

(async () => {
  if (command === '--status') {
    await initializeMigrationTracking();
    await showStatus();
    process.exit(0);
  } else if (command === '--reset') {
    await initializeMigrationTracking();
    await resetMigrations();
    process.exit(0);
  } else {
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  DATABASE_URL not set, skipping migration');
      process.exit(0);
    }

    await runMigrations();
  }
})();
