// server/index.js
import dotenv from 'dotenv';

// Load environment variables from .env file (only if DATABASE_URL not already provided)
// Railway automatically sets DATABASE_URL, so we skip .env in production
if (!process.env.DATABASE_URL) {
  dotenv.config();
}

import pdfRouter from './routes/pdf.routes.js';

// Initialize Sentry early for error tracking
import { initializeSentry, getSentryRequestHandler, getSentryErrorHandler } from './config/sentry.js';
initializeSentry();

// Validate environment variables early
import { validateEnvironment, logEnvironmentInfo } from './utils/envValidator.ts';
try {
  validateEnvironment();
} catch (error) {
  logError('Environment validation failed', error);
  // Note: Not calling process.exit(1) immediately - let server start with health endpoint
}

// SSL certificate validation (only disable for local development)
// Railway Postgres connections are handled securely in db/connection.js
if (process.env.NODE_ENV === 'development' && process.env.DISABLE_SSL_VERIFY === 'true') {
  logWarn('SSL certificate validation is disabled for development');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import http from 'http';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';

import shipmentsRouter from './routes/shipments.ts';
import suppliersRouter from './routes/suppliers.ts';
import customersRouter from './routes/customers.ts';
import quotesRouter from './routes/quotes.ts';
import reportsRouter from './routes/reports.ts';
import emailImportRouter from './routes/emailImport.ts';
import adminRouter from './routes/admin.ts';
import warehouseCapacityRouter from './routes/warehouseCapacity.ts';
import authRouter from './routes/auth.ts';
import notificationsRouter from './routes/notifications.ts';
import schedulerAdminRouter from './routes/schedulerAdmin.ts';
import supplierPortalRouter from './routes/supplierPortal.ts';
import costingRouter from './routes/costing.ts';
import costingRequestsRouter from './routes/costingRequests.ts';
import auditRouter from './routes/audit.ts';
import newsRouter from './routes/news.ts';
import bolAuditRouter from './routes/bolAudit.ts';
import docksRouter from './routes/docks.ts';

import { helmetConfig, apiRateLimiter, authRateLimiter, createRateLimiter, authenticateToken } from './middleware/security.js';
import { csrfProtection } from './middleware/csrf.js';
import { createSingleFileUpload, createMultipleFileUpload, handleUploadError, validateFilesPresent, verifyUploadPermission, generateSafeFilename } from './middleware/fileUpload.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { logger, logInfo, logWarn, logError, logServerStart } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.ts';
import socketManager from './websocket/socketManager.ts';

// __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ============ CORS - Whitelist allowed origins ============ */
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:5173',
  'https://synercore-import-schedule.vercel.app',
  process.env.FRONTEND_URL,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
].filter(Boolean); // Remove any undefined/null values

const app = express();
// ✅ Railway health check — MUST bypass all middleware
app.use((req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/health/')) {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma, X-Requested-With');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return res.status(200).send('OK');
  }
  next();
});
const PORT = process.env.PORT || 5001;



// Create HTTP server for Socket.io compatibility
const httpServer = http.createServer(app);

logger.info('CORS origins configured', { origins: allowedOrigins });

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logWarn('CORS request blocked from unlisted origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Explicitly handle OPTIONS for browsers that need it
app.options('*', cors(corsOptions));

// Swagger UI - Available for documentation at /api-docs
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    url: '/api-docs/swagger.json'
  }
}));

// Swagger JSON endpoint
app.get('/api-docs/swagger.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});



// Add request ID middleware early (for all requests)
app.use(requestIdMiddleware);

// Add Sentry request handler for error tracking (after requestIdMiddleware, before other middleware)
app.use(getSentryRequestHandler());

// Apply helmet security headers
app.use(helmetConfig);

// Apply rate limiting to all API routes
app.use('/api', apiRateLimiter);

// CSRF protection — require Authorization or X-Requested-With on state-changing requests
app.use('/api', csrfProtection);

/* ---------------- Parsers ---------------- */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/* ---------------- Uploads ---------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/* ---------------- Readiness gate ---------------- */
let isReady = false;


// Only gate /api/* (allow /health, static, etc.)
app.use('/api', (req, res, next) => {
  if (!isReady) return res.status(503).json({ ready: false });
  next();
});

/* ---------------- Routers ---------------- */
// Public routes (no auth required) - with stricter rate limiting for auth endpoints
app.use('/api/auth', authRateLimiter, authRouter);
app.use('/api/warehouse-capacity', warehouseCapacityRouter); // Has mixed auth requirements
app.use('/api/pdf', pdfRouter);

// Protected routes (auth required)
app.use('/api/shipments', authenticateToken, shipmentsRouter);
app.use('/api/suppliers', authenticateToken, suppliersRouter);
app.use('/api/customers', authenticateToken, customersRouter);
app.use('/api/quotes', authenticateToken, quotesRouter);
app.use('/api/reports', authenticateToken, reportsRouter);
app.use('/api/email-import', authenticateToken, emailImportRouter);
app.use('/api/admin', authenticateToken, adminRouter);
app.use('/api/admin/scheduler', schedulerAdminRouter); // Auth required within router
app.use('/api/notifications', notificationsRouter); // Auth required within router
app.use('/api/supplier', supplierPortalRouter); // Supplier portal routes (auth within router)
app.use('/api/costing', costingRouter); // Import costing routes (auth within router)
app.use('/api/costing-requests', costingRequestsRouter); // Costing request routes (auth within router)
app.use('/api/audit', authenticateToken, auditRouter);
app.use('/api/bol-audit', authenticateToken, bolAuditRouter);
app.use('/api/docks', authenticateToken, docksRouter);
app.use('/api/news', newsRouter); // Public - freight news feed proxy

/* ---------------- Endpoints ---------------- */
// Create upload instances
const multipleFileUpload = createMultipleFileUpload(10);
const singleFileUpload = createSingleFileUpload();
const uploadRateLimiter = createRateLimiter(60 * 60 * 1000, 50); // 50 uploads per hour per IP

/**
 * POST /api/documents/upload - Upload multiple documents for a supplier
 * Requires: Authenticated user (admin or supplier), supplierId in body
 * Validates: File type, MIME type, file size, permissions
 */
app.post('/api/documents/upload',
  uploadRateLimiter,
  authenticateToken,
  verifyUploadPermission,
  multipleFileUpload.array('documents', 10),
  validateFilesPresent,
  async (req, res, next) => {
    try {
      const { supplierId } = req.body;

      const documentsDir = path.join(__dirname, 'uploads', 'documents', supplierId);
      await fs.mkdir(documentsDir, { recursive: true });

      const uploadedFiles = [];
      for (const file of req.files) {
        const filename = generateSafeFilename(file.originalname);
        await fs.writeFile(path.join(documentsDir, filename), file.buffer);
        uploadedFiles.push({
          filename,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date().toISOString(),
          supplierId,
          downloadUrl: `/api/suppliers/${supplierId}/documents/${filename}`,
        });
      }
      res.json(uploadedFiles);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/upload-excel - Upload single Excel file for bulk import
 * Requires: Authenticated user (admin)
 * Validates: File type (Excel only), MIME type, file size
 */
app.post('/api/upload-excel',
  uploadRateLimiter,
  authenticateToken,
  singleFileUpload.single('file'),
  validateFilesPresent,
  (req, res) => {
    try {
      res.json({
        message: 'File uploaded successfully',
        filename: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/* ---------------- Static (prod) ---------------- */
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../dist/index.html')));
}

/* ---------------- 404 & Error handler ---------------- */
// Upload error handler (must come before generic error handler)
app.use(handleUploadError);

// 404 handler (before error handler)
app.use((req, res, _next) => {
  res.status(404).json({
    error: 'Not Found',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

// Sentry error handler (must be before custom error handler)
app.use(getSentryErrorHandler());

// Centralized error handler (must be last)
app.use(errorHandler);

/* ---------------- Async boot ---------------- */
async function start() {
  logger.info('Server starting', { version: 'latest' });
  try {
    // Start listening IMMEDIATELY for Railway health checks
    // Bind to 0.0.0.0 to accept external connections on Railway
    httpServer.listen(PORT, '0.0.0.0', () => {
      logServerStart(PORT, process.env.NODE_ENV || 'production');
      logger.info('Initializing database and services in background...');
    });

    // Handle server errors
    httpServer.on('error', (err) => {
      logError('Server error', err, { code: err.code });
      if (err.code === 'EADDRINUSE') {
        logError('Port already in use', null, { port: PORT });
      }
    });

    // Initialize database connection pool
    const { getPool } = await import('./db/connection.js');
    getPool(); // Force pool creation on startup
    logger.info('Database pool initialized');

    // Run database migrations on startup
    try {
      const addAvailableBinsColumn = await import('./db/add-available-bins.js');
      await addAvailableBinsColumn.default();
    } catch (error) {
      logWarn('Migration warning', { error: error.message });
    }

    try {
      const addTotalCapacityColumn = await import('./db/add-total-capacity.js');
      await addTotalCapacityColumn.default();
    } catch (error) {
      logWarn('Migration warning', { error: error.message });
    }

    try {
      const addRefreshTokensTable = await import('./db/add-refresh-tokens-table.js');
      await addRefreshTokensTable.default();
    } catch (error) {
      logWarn('Migration warning', { error: error.message });
    }

    try {
      const addNotificationsTables = await import('./db/add-notifications-tables.js');
      await addNotificationsTables.default();
    } catch (error) {
      logWarn('Migration warning', { error: error.message });
    }

    try {
      const addSupplierAccountsTables = await import('./db/add-supplier-accounts.js');
      await addSupplierAccountsTables.default();
    } catch (error) {
      logWarn('Migration warning', { error: error.message });
    }

    try {
      const addCostingColumns = await import('./db/add-costing-columns.js');
      await addCostingColumns.default();
    } catch (error) {
      logWarn('Costing migration warning', { error: error.message });
    }

    try {
      const addCustomersTable = await import('./db/add-customers-table.js');
      await addCustomersTable.default();
    } catch (error) {
      logWarn('Customers migration warning', { error: error.message });
    }

    try {
      const addCostingRequestsTable = await import('./db/add-costing-requests-table.js');
      await addCostingRequestsTable.default();
    } catch (error) {
      logWarn('Costing requests migration warning', { error: error.message });
    }

    try {
      const { addPerformanceIndexes } = await import('./db/add-performance-indexes.js');
      await addPerformanceIndexes();
    } catch (error) {
      logWarn('Performance indexes warning', { error: error.message });
    }

    // Add reminder columns to shipments
    try {
      await getPool().query(`
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS reminder_date DATE;
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS reminder_note TEXT;
        CREATE INDEX IF NOT EXISTS idx_shipments_reminder_date ON shipments(reminder_date) WHERE reminder_date IS NOT NULL;
      `);
      logger.info('Reminder columns ready');
    } catch (error) {
      logWarn('Reminder columns migration warning', { error: error.message });
    }

    // Add Inter-Warehouse Transfer (IWT) columns to shipments
    try {
      await getPool().query(`
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS source_warehouse VARCHAR(255);
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS source_pallet_ref VARCHAR(255);
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS batch_lot VARCHAR(255);
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS release_number VARCHAR(255);
      `);
      logger.info('IWT columns ready');
    } catch (error) {
      logWarn('IWT columns migration warning', { error: error.message });
    }

    // Add ASO number column to shipments (links sold stock back to a sales order)
    try {
      await getPool().query(`
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS aso_number VARCHAR(255);
      `);
      logger.info('ASO number column ready');
    } catch (error) {
      logWarn('ASO number column migration warning', { error: error.message });
    }

    // Add original_week_number/original_selected_week_date to shipments.
    // Week/selectedWeekDate get overwritten whenever a shipment is rescheduled,
    // so on-time/lead-time metrics were measuring drift from the latest edit
    // instead of the original commitment. These are set once at creation and
    // never touched again, giving supplier performance metrics a stable baseline.
    try {
      await getPool().query(`
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS original_week_number VARCHAR(10);
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS original_selected_week_date TIMESTAMP;
      `);
      logger.info('Original week columns ready');
    } catch (error) {
      logWarn('Original week columns migration warning', { error: error.message });
    }

    // Add actual_arrival_date to shipments: manually entered by a user once
    // they learn the consignment physically arrived, independent of
    // receiving_date (stamped only when the receiving workflow is run,
    // which can lag well behind actual arrival) so OTD/lead-time metrics
    // can benchmark against a true arrival date instead of processing lag.
    try {
      await getPool().query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS actual_arrival_date TIMESTAMP`);
      logger.info('Actual arrival date column ready');
    } catch (error) {
      logWarn('Actual arrival date column migration warning', { error: error.message });
    }

    // Add full-text search_vector column + GIN index + trigger to shipments.
    // ShipmentController.searchShipments queries this column; without it every
    // /api/shipments/search request returns 500 with "column does not exist".
    try {
      await getPool().query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS search_vector tsvector`);
      await getPool().query(`CREATE INDEX IF NOT EXISTS idx_shipments_search_vector ON shipments USING gin(search_vector)`);
      // Backfill any rows that have no vector yet
      await getPool().query(`
        UPDATE shipments SET search_vector =
          to_tsvector('english',
            COALESCE(order_ref, '') || ' ' ||
            COALESCE(supplier, '') || ' ' ||
            COALESCE(product_name, '') || ' ' ||
            COALESCE(final_pod, '') || ' ' ||
            COALESCE(vessel_name, '') || ' ' ||
            COALESCE(forwarding_agent, '') || ' ' ||
            COALESCE(notes, '') || ' ' ||
            COALESCE(receiving_warehouse, '')
          )
        WHERE search_vector IS NULL
      `);
      // Keep the vector in sync on insert / update
      await getPool().query(`
        CREATE OR REPLACE FUNCTION shipments_search_vector_update() RETURNS trigger AS $$
        BEGIN
          NEW.search_vector :=
            to_tsvector('english',
              COALESCE(NEW.order_ref, '') || ' ' ||
              COALESCE(NEW.supplier, '') || ' ' ||
              COALESCE(NEW.product_name, '') || ' ' ||
              COALESCE(NEW.final_pod, '') || ' ' ||
              COALESCE(NEW.vessel_name, '') || ' ' ||
              COALESCE(NEW.forwarding_agent, '') || ' ' ||
              COALESCE(NEW.notes, '') || ' ' ||
              COALESCE(NEW.receiving_warehouse, '')
            );
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await getPool().query(`DROP TRIGGER IF EXISTS trg_shipments_search_vector ON shipments`);
      await getPool().query(`
        CREATE TRIGGER trg_shipments_search_vector
          BEFORE INSERT OR UPDATE ON shipments
          FOR EACH ROW
          EXECUTE FUNCTION shipments_search_vector_update()
      `);
      logger.info('Shipments full-text search_vector ready');
    } catch (error) {
      logWarn('search_vector migration warning', { error: error.message });
    }

    // Create announcements table if it doesn't exist
    try {
      const { getPool } = await import('./db/connection.js');
      await getPool().query(`
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
        ALTER TABLE announcements ADD COLUMN IF NOT EXISTS description TEXT;
      `);
      logger.info('Announcements table ready');
    } catch (error) {
      logWarn('Announcements table warning', { error: error.message });
    }

    // Create audit_log table if it doesn't exist
    try {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          username VARCHAR(255) NOT NULL,
          action VARCHAR(50) NOT NULL,
          entity_type VARCHAR(50) NOT NULL,
          entity_id TEXT NOT NULL,
          entity_label TEXT,
          changes JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log(entity_type);
        CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON audit_log(entity_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
        ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
        ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
      `);
      logger.info('Audit log table ready');
    } catch (error) {
      logWarn('Audit log table warning', { error: error.message });
    }

    // Create costing_requests table if it doesn't exist
    try {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS costing_requests (
          id SERIAL PRIMARY KEY,
          requested_by TEXT NOT NULL,
          requested_by_username VARCHAR(255) NOT NULL,
          supplier_name VARCHAR(255),
          product_description TEXT,
          priority VARCHAR(20) DEFAULT 'normal',
          notes TEXT,
          status VARCHAR(20) DEFAULT 'pending',
          admin_notes TEXT,
          handled_by TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_costing_requests_status ON costing_requests(status);
        CREATE INDEX IF NOT EXISTS idx_costing_requests_user ON costing_requests(requested_by);
        CREATE INDEX IF NOT EXISTS idx_costing_requests_created ON costing_requests(created_at);
      `);
      logger.info('Costing requests table ready');
    } catch (error) {
      logWarn('Costing requests table warning', { error: error.message });
    }

    // Create bol_audits table for Bill of Lading auditing
    try {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS bol_audits (
          id SERIAL PRIMARY KEY,
          bol_number VARCHAR(100) NOT NULL,
          shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
          supplier_name VARCHAR(255),
          carrier_name VARCHAR(255),
          vessel_name VARCHAR(255),
          voyage_number VARCHAR(100),
          port_of_loading VARCHAR(255),
          port_of_discharge VARCHAR(255),
          consignee TEXT,
          shipper TEXT,
          notify_party TEXT,
          description_of_goods TEXT,
          container_numbers JSONB,
          gross_weight_kg NUMERIC(12,3),
          volume_cbm NUMERIC(10,3),
          number_of_packages INTEGER,
          freight_charges_usd NUMERIC(14,2),
          declared_value_usd NUMERIC(14,2),
          issue_date DATE,
          ship_on_board_date DATE,
          payment_terms VARCHAR(20),
          incoterm VARCHAR(10),
          notes TEXT,
          audit_status VARCHAR(20) DEFAULT 'pending',
          audit_notes TEXT,
          discrepancies JSONB,
          weight_verified BOOLEAN DEFAULT false,
          charges_verified BOOLEAN DEFAULT false,
          documents_verified BOOLEAN DEFAULT false,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          audited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          audited_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bol_audits_status ON bol_audits(audit_status);
        CREATE INDEX IF NOT EXISTS idx_bol_audits_bol_number ON bol_audits(bol_number);
        CREATE INDEX IF NOT EXISTS idx_bol_audits_supplier ON bol_audits(supplier_name);
        CREATE INDEX IF NOT EXISTS idx_bol_audits_shipment ON bol_audits(shipment_id);
        CREATE INDEX IF NOT EXISTS idx_bol_audits_created ON bol_audits(created_at);

        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS raw_pdf_text TEXT;
        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS extraction_confidence JSONB;
        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS pdf_filename VARCHAR(255);
        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS benchmark_rate_per_kg NUMERIC(10,4);
        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS expected_freight_usd NUMERIC(14,2);
        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS freight_variance_usd NUMERIC(14,2);
        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS weight_variance_kg NUMERIC(12,3);
        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS weight_variance_pct NUMERIC(8,2);
        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false;
        ALTER TABLE bol_audits ADD COLUMN IF NOT EXISTS container_type VARCHAR(10);
      `);
      logger.info('BOL audits table ready');
    } catch (error) {
      logWarn('BOL audits table warning', { error: error.message });
    }

    // Create freight_benchmarks table for contracted rate comparison
    try {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS freight_benchmarks (
          id SERIAL PRIMARY KEY,
          carrier_name VARCHAR(255),
          port_of_loading VARCHAR(255) NOT NULL,
          port_of_discharge VARCHAR(255) NOT NULL,
          rate_per_kg_usd NUMERIC(10,4),
          rate_per_cbm_usd NUMERIC(10,2),
          min_charge_usd NUMERIC(12,2),
          full_rate_usd NUMERIC(12,2),
          rate_20fcl_usd NUMERIC(12,2),
          rate_40fcl_usd NUMERIC(12,2),
          currency VARCHAR(10) DEFAULT 'USD',
          transport_mode VARCHAR(20) DEFAULT 'sea',
          valid_from DATE,
          valid_until DATE,
          notes TEXT,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_freight_benchmarks_route ON freight_benchmarks(port_of_loading, port_of_discharge);
        CREATE INDEX IF NOT EXISTS idx_freight_benchmarks_carrier ON freight_benchmarks(carrier_name);
        ALTER TABLE freight_benchmarks ADD COLUMN IF NOT EXISTS full_rate_usd NUMERIC(12,2);
        ALTER TABLE freight_benchmarks ADD COLUMN IF NOT EXISTS rate_20fcl_usd NUMERIC(12,2);
        ALTER TABLE freight_benchmarks ADD COLUMN IF NOT EXISTS rate_40fcl_usd NUMERIC(12,2);
        ALTER TABLE freight_benchmarks ADD COLUMN IF NOT EXISTS rate_20gp_usd NUMERIC(12,2);
        ALTER TABLE freight_benchmarks ADD COLUMN IF NOT EXISTS rate_40gp_usd NUMERIC(12,2);
        ALTER TABLE freight_benchmarks ADD COLUMN IF NOT EXISTS rate_40hc_usd NUMERIC(12,2);
      `);
      logger.info('Freight benchmarks table ready');
    } catch (error) {
      logWarn('Freight benchmarks table warning', { error: error.message });
    }

    // Clearing rate benchmarks (AGX etc.) + invoice tables
    try {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS clearing_rate_benchmarks (
          id SERIAL PRIMARY KEY,
          description VARCHAR(255) NOT NULL,
          unit_rate_zar NUMERIC(12,2) NOT NULL,
          per_type VARCHAR(50) DEFAULT 'per container',
          vat_applicable BOOLEAN DEFAULT true,
          agent_name VARCHAR(255) DEFAULT 'AGX',
          category VARCHAR(50),
          route VARCHAR(255),
          valid_from DATE,
          valid_until DATE,
          notes TEXT,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_clearing_benchmarks_desc ON clearing_rate_benchmarks(description);
        CREATE INDEX IF NOT EXISTS idx_clearing_benchmarks_agent ON clearing_rate_benchmarks(agent_name);

        CREATE TABLE IF NOT EXISTS bol_invoices (
          id SERIAL PRIMARY KEY,
          bol_audit_id INTEGER REFERENCES bol_audits(id) ON DELETE SET NULL,
          invoice_number VARCHAR(100),
          invoice_type VARCHAR(20) NOT NULL DEFAULT 'clearing',
          agent_name VARCHAR(255),
          account_no VARCHAR(50),
          file_ref VARCHAR(100),
          invoice_date DATE,
          due_date DATE,
          subtotal NUMERIC(14,2),
          vat NUMERIC(14,2),
          total NUMERIC(14,2),
          currency VARCHAR(10) DEFAULT 'ZAR',
          raw_text TEXT,
          pdf_filename VARCHAR(255),
          matched_bol_number VARCHAR(100),
          importer VARCHAR(255),
          vessel VARCHAR(255),
          mobl VARCHAR(100),
          hobl VARCHAR(100),
          container_numbers JSONB,
          audit_status VARCHAR(20) DEFAULT 'pending',
          total_variance NUMERIC(14,2),
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bol_invoices_bol ON bol_invoices(bol_audit_id);
        CREATE INDEX IF NOT EXISTS idx_bol_invoices_number ON bol_invoices(invoice_number);

        CREATE TABLE IF NOT EXISTS bol_invoice_line_items (
          id SERIAL PRIMARY KEY,
          bol_invoice_id INTEGER NOT NULL REFERENCES bol_invoices(id) ON DELETE CASCADE,
          description VARCHAR(255),
          vat_code VARCHAR(5),
          roe NUMERIC(12,6),
          foreign_amount NUMERIC(14,2),
          local_amount NUMERIC(14,2),
          vat_amount NUMERIC(14,2),
          benchmark_rate NUMERIC(12,2),
          variance_amount NUMERIC(14,2),
          variance_pct NUMERIC(8,2),
          benchmark_id INTEGER REFERENCES clearing_rate_benchmarks(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON bol_invoice_line_items(bol_invoice_id);
      `);
      logger.info('Clearing benchmarks and invoice tables ready');
    } catch (error) {
      logWarn('Clearing/invoice tables warning', { error: error.message });
    }

    // Create docks and truck_arrivals tables for dock management
    try {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS docks (
          id SERIAL PRIMARY KEY,
          dock_number VARCHAR(20) NOT NULL,
          warehouse VARCHAR(50) NOT NULL,
          status VARCHAR(30) DEFAULT 'available',
          current_truck_id INTEGER,
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(dock_number, warehouse)
        );
        CREATE INDEX IF NOT EXISTS idx_docks_warehouse ON docks(warehouse);
        CREATE INDEX IF NOT EXISTS idx_docks_status ON docks(status);
      `);

      // Seed default docks if empty
      const dockCount = await getPool().query('SELECT COUNT(*)::int as count FROM docks');
      if (parseInt(dockCount.rows[0].count, 10) === 0) {
        const dockSeeds = [
          ['Dock 1', 'PRETORIA'], ['Dock 2', 'PRETORIA'], ['Dock 3', 'PRETORIA'], ['Dock 4', 'PRETORIA'],
          ['Dock 1', 'KLAPMUTS'], ['Dock 2', 'KLAPMUTS'],
          ['Dock 1', 'OFFSITE'],
        ];
        for (const [dockNumber, warehouse] of dockSeeds) {
          await getPool().query(
            'INSERT INTO docks (dock_number, warehouse) VALUES ($1, $2) ON CONFLICT (dock_number, warehouse) DO NOTHING',
            [dockNumber, warehouse]
          );
        }
      }

      await getPool().query(`
        CREATE TABLE IF NOT EXISTS truck_arrivals (
          id SERIAL PRIMARY KEY,
          shipment_id VARCHAR(255) REFERENCES shipments(id) ON DELETE SET NULL,
          carrier VARCHAR(255),
          driver_name VARCHAR(255),
          driver_phone VARCHAR(50),
          vehicle_reg VARCHAR(50),
          expected_arrival TIMESTAMP WITH TIME ZONE,
          actual_arrival TIMESTAMP WITH TIME ZONE,
          dock_id INTEGER REFERENCES docks(id) ON DELETE SET NULL,
          status VARCHAR(30) DEFAULT 'scheduled',
          queue_position INTEGER,
          check_in_time TIMESTAMP WITH TIME ZONE,
          check_out_time TIMESTAMP WITH TIME ZONE,
          notes TEXT,
          created_by VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_truck_arrivals_shipment ON truck_arrivals(shipment_id);
        CREATE INDEX IF NOT EXISTS idx_truck_arrivals_dock ON truck_arrivals(dock_id);
        CREATE INDEX IF NOT EXISTS idx_truck_arrivals_status ON truck_arrivals(status);
        CREATE INDEX IF NOT EXISTS idx_truck_arrivals_expected ON truck_arrivals(expected_arrival);
      `);

      // Add warehouse column to truck_arrivals
      await getPool().query(`
        ALTER TABLE truck_arrivals ADD COLUMN IF NOT EXISTS warehouse VARCHAR(50);
      `);

      // Add bin_location, grn_number, and shipment_type columns to shipments
      await getPool().query(`
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS bin_location VARCHAR(50);
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS grn_number VARCHAR(50);
        ALTER TABLE shipments ADD COLUMN IF NOT EXISTS shipment_type VARCHAR(20) DEFAULT 'international';
      `);
      await getPool().query(`CREATE INDEX IF NOT EXISTS idx_shipments_type ON shipments(shipment_type);`);

      // Migrate any shipments stuck at 'received' or 'archived' → 'stored'
      const migratedReceived = await getPool().query(
        `UPDATE shipments SET latest_status = 'stored', updated_at = NOW() WHERE latest_status = 'received'`
      );
      if (migratedReceived.rowCount > 0) {
        logger.info(`Migrated ${migratedReceived.rowCount} shipments from received → stored`);
      }
      const migratedArchived = await getPool().query(
        `UPDATE shipments SET latest_status = 'stored', updated_at = NOW() WHERE latest_status = 'archived'`
      );
      if (migratedArchived.rowCount > 0) {
        logger.info(`Migrated ${migratedArchived.rowCount} shipments from archived → stored`);
      }

      // Cleanup: remove international suppliers mistakenly imported as local
      const cleanedUp = await getPool().query(
        `DELETE FROM shipments WHERE shipment_type = 'local' AND UPPER(TRIM(supplier)) IN (
          'SACCO S.R.L', 'QIDA CHEMICAL CO. LTD', 'SHAKTI CHEMICALS',
          'AROMSA BESIN AROMA VE KATKI MADDELERI SAN. VE TIC. A.S.',
          'AROMSA BESİN AROMA VE KATKI MADDELERİ SAN. VE TİC. A.Ş.',
          'AB MAURI', 'ECOLEX SDN. BHD', 'MARCEL CARRAGEENAN', 'TRISTAR GLOBAL SDN. BHD'
        )`
      );
      if (cleanedUp.rowCount > 0) {
        logger.info(`Cleaned up ${cleanedUp.rowCount} international suppliers from local shipments`);
      }

      // Fix local shipments: convert Excel serial date numbers in vessel_name to YYYY-MM-DD
      const fixedSerialDates = await getPool().query(
        `UPDATE shipments SET
           vessel_name = TO_CHAR(DATE '1899-12-30' + CAST(TRIM(vessel_name) AS INTEGER), 'YYYY-MM-DD'),
           updated_at = NOW()
         WHERE shipment_type = 'local'
           AND vessel_name IS NOT NULL
           AND TRIM(vessel_name) ~ '^[0-9]{4,5}$'`
      );
      if (fixedSerialDates.rowCount > 0) {
        logger.info(`Converted ${fixedSerialDates.rowCount} Excel serial dates to YYYY-MM-DD in local shipments`);
      }
      // Also fix notes that still contain serial dates (move to vessel_name)
      const fixedNotes = await getPool().query(
        `UPDATE shipments SET
           vessel_name = TO_CHAR(DATE '1899-12-30' + CAST(TRIM(notes) AS INTEGER), 'YYYY-MM-DD'),
           notes = NULL,
           updated_at = NOW()
         WHERE shipment_type = 'local'
           AND (vessel_name IS NULL OR TRIM(vessel_name) = '')
           AND notes IS NOT NULL
           AND TRIM(notes) ~ '^[0-9]{4,5}$'`
      );
      if (fixedNotes.rowCount > 0) {
        logger.info(`Moved ${fixedNotes.rowCount} serial dates from notes to vessel_name in local shipments`);
      }

      // Create truck_shipments junction table (many-to-many: one truck can carry multiple shipments)
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS truck_shipments (
          id SERIAL PRIMARY KEY,
          truck_id INTEGER NOT NULL REFERENCES truck_arrivals(id) ON DELETE CASCADE,
          shipment_id VARCHAR(255) NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(truck_id, shipment_id)
        );
        CREATE INDEX IF NOT EXISTS idx_truck_shipments_truck ON truck_shipments(truck_id);
        CREATE INDEX IF NOT EXISTS idx_truck_shipments_shipment ON truck_shipments(shipment_id);
      `);

      // Migrate existing single shipment_id data into junction table
      await getPool().query(`
        INSERT INTO truck_shipments (truck_id, shipment_id)
        SELECT id, shipment_id FROM truck_arrivals
        WHERE shipment_id IS NOT NULL
        ON CONFLICT (truck_id, shipment_id) DO NOTHING;
      `);

      logger.info('Docks, truck_arrivals, and truck_shipments tables ready');
    } catch (error) {
      logWarn('Docks/truck_arrivals migration warning', { error: error.message });
    }

    // Add destination charge columns to import_cost_estimates
    try {
      const destCols = [
        'bill_of_lading_fee_zar NUMERIC(12,2) DEFAULT 0',
        'manifest_filing_zar NUMERIC(12,2) DEFAULT 0',
        'currency_adjustment_factor_zar NUMERIC(12,2) DEFAULT 0',
        'degrouping_zar NUMERIC(12,2) DEFAULT 0',
        'edi_fee_zar NUMERIC(12,2) DEFAULT 0',
        'communication_dest_zar NUMERIC(12,2) DEFAULT 0',
        'documentation_fee_dest_zar NUMERIC(12,2) DEFAULT 0',
        'cfs_lcl_handling_out_zar NUMERIC(12,2) DEFAULT 0',
        'delivery_release_order_zar NUMERIC(12,2) DEFAULT 0',
        'cartage_dest_zar NUMERIC(12,2) DEFAULT 0',
        'fuel_surcharge_dest_zar NUMERIC(12,2) DEFAULT 0',
        'agency_fee_dest_zar NUMERIC(12,2) DEFAULT 0',
        'handover_fee_zar NUMERIC(12,2) DEFAULT 0',
        'facility_fee_zar NUMERIC(12,2) DEFAULT 0',
      ];
      for (const colDef of destCols) {
        const colName = colDef.split(' ')[0];
        const check = await getPool().query(
          `SELECT 1 FROM information_schema.columns WHERE table_name='import_cost_estimates' AND column_name=$1`, [colName]
        );
        if (check.rows.length === 0) {
          await getPool().query(`ALTER TABLE import_cost_estimates ADD COLUMN ${colDef}`);
          logger.info(`Added column ${colName} to import_cost_estimates`);
        }
      }
    } catch (error) {
      logWarn('Destination charge columns migration warning', { error: error.message });
    }

    // Initialize notification scheduler
    try {
      const { default: NotificationScheduler } = await import('./jobs/notificationScheduler.js');
      NotificationScheduler.initializeJobs();
      logger.info('Notification scheduler initialized');
    } catch (error) {
      logWarn('Notification scheduler warning', { error: error.message });
    }

    // Initialize POPIA retention scheduler
    try {
      const { default: RetentionScheduler } = await import('./jobs/retentionScheduler.js');
      RetentionScheduler.initializeJobs();
      logger.info('Retention scheduler initialized');
    } catch (error) {
      logWarn('Retention scheduler warning', { error: error.message });
    }

    // Initialize Socket.io for real-time updates
try {
  socketManager.initialize(httpServer);
  logger.info('WebSocket (Socket.io) initialized');
} catch (error) {
  logWarn('Socket.io initialization warning', { error: error.message });
}

// ✅ THIS IS CRITICAL
isReady = true;
logger.info('Full initialization complete');

} catch (e) {
    logError('FATAL: failed to initialize', e);
    isReady = true; // degraded but alive
    logWarn('Server running with degraded functionality');
  }
} // ✅ THIS CLOSING BRACE IS CRITICAL


start().catch(e => {
  logError('FATAL: start() promise rejected', e);
  isReady = true; // degraded but service remains alive
  logWarn('Server in emergency mode');
});


export default app;
