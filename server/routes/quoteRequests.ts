/**
 * Quote Requests Routes
 * API endpoints for requesting and tracking freight rate quotes from forwarders/shipping agents
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.ts';
import pool from '../db/connection.js';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

const TRANSPORT_MODES = ['sea', 'air', 'road'];
const STATUSES = ['draft', 'sent', 'quoted', 'expired', 'cancelled'];
const DG_CLASSIFICATIONS = ['dg', 'non_dg'];

// ==================== QUOTE REQUEST ROUTES ====================

/**
 * POST /api/quote-requests
 * Create a new freight quote request
 */
router.post(
  '/',
  authenticateToken,
  [
    body('forwarder_name').trim().notEmpty().withMessage('Forwarder name is required'),
    body('forwarder_email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Invalid email'),
    body('transport_mode').optional().isIn(TRANSPORT_MODES),
    body('incoterm').optional({ nullable: true }).trim(),
    body('origin').optional({ nullable: true }).trim(),
    body('destination').optional({ nullable: true }).trim(),
    body('collection_address').optional({ nullable: true }).trim(),
    body('supplier_name').optional({ nullable: true }).trim(),
    body('cargo_description').optional({ nullable: true }).trim(),
    body('hs_code').optional({ nullable: true }).trim(),
    body('dg_classification').optional().isIn(DG_CLASSIFICATIONS),
    body('gross_weight_kg').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('length_cm').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('width_cm').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('height_cm').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('volume_cbm').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('pallet_count').optional({ checkFalsy: true }).isInt({ min: 0 }),
    body('cargo_ready_date').optional({ checkFalsy: true }).isISO8601(),
    body('required_date').optional({ checkFalsy: true }).isISO8601(),
    body('notes').optional({ nullable: true }).trim(),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      forwarder_name, forwarder_email, transport_mode = 'sea', incoterm,
      origin, destination, collection_address, supplier_name, cargo_description, hs_code,
      dg_classification = 'non_dg', gross_weight_kg, length_cm, width_cm, height_cm, volume_cbm,
      pallet_count, cargo_ready_date, required_date, notes,
    } = req.body;
    const userId = req.user!.id;
    const username = req.user!.username;

    const result = await pool.query(
      `INSERT INTO quote_requests (
        requested_by, requested_by_username, forwarder_name, forwarder_email, transport_mode,
        incoterm, origin, destination, collection_address, supplier_name, cargo_description, hs_code,
        dg_classification, gross_weight_kg, length_cm, width_cm, height_cm, volume_cbm, pallet_count,
        cargo_ready_date, required_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *`,
      [
        userId, username, forwarder_name, forwarder_email || null, transport_mode,
        incoterm || null, origin || null, destination || null, collection_address || null, supplier_name || null,
        cargo_description || null, hs_code || null, dg_classification, gross_weight_kg || null,
        length_cm || null, width_cm || null, height_cm || null, volume_cbm || null,
        pallet_count || null, cargo_ready_date || null, required_date || null, notes || null,
      ]
    );

    res.status(201).json({ data: result.rows[0] });
  })
);

/**
 * GET /api/quote-requests
 * List all quote requests (optional status filter)
 */
router.get(
  '/',
  authenticateToken,
  [query('status').optional().isIn(STATUSES)],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const statusFilter = req.query.status as string | undefined;

    let queryText = 'SELECT * FROM quote_requests';
    const params: any[] = [];

    if (statusFilter) {
      params.push(statusFilter);
      queryText += ` WHERE status = $${params.length}`;
    }

    queryText += ' ORDER BY created_at DESC';

    const result = await pool.query(queryText, params);
    res.json({ data: result.rows });
  })
);

/**
 * PUT /api/quote-requests/:id
 * Update a quote request (status, notes, or any captured field)
 */
router.put(
  '/:id',
  authenticateToken,
  [
    param('id').isInt(),
    body('status').optional().isIn(STATUSES),
    body('forwarder_name').optional().trim().notEmpty(),
    body('forwarder_email').optional({ checkFalsy: true }).trim().isEmail(),
    body('transport_mode').optional().isIn(TRANSPORT_MODES),
    body('dg_classification').optional().isIn(DG_CLASSIFICATIONS),
    body('notes').optional({ nullable: true }).trim(),
    body('quoted_rate').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('quoted_currency').optional({ nullable: true }).trim(),
    body('quote_reference').optional({ nullable: true }).trim(),
    body('quoted_transit_days').optional({ checkFalsy: true }).isInt({ min: 0 }),
    body('quote_notes').optional({ nullable: true }).trim(),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const allowedFields = [
      'forwarder_name', 'forwarder_email', 'transport_mode', 'incoterm', 'origin', 'destination',
      'collection_address', 'supplier_name', 'cargo_description', 'hs_code', 'dg_classification',
      'gross_weight_kg', 'length_cm', 'width_cm', 'height_cm', 'volume_cbm', 'pallet_count',
      'cargo_ready_date', 'required_date', 'notes', 'status',
      'quoted_rate', 'quoted_currency', 'quote_reference', 'quoted_transit_days', 'quote_notes',
    ];

    const updates: string[] = [];
    const params: any[] = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        params.push(req.body[field] === '' ? null : req.body[field]);
        updates.push(`${field} = $${params.length}`);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    params.push(id);
    const result = await pool.query(
      `UPDATE quote_requests SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote request not found' });
    }

    res.json({ data: result.rows[0] });
  })
);

/**
 * DELETE /api/quote-requests/:id
 */
router.delete(
  '/:id',
  authenticateToken,
  [param('id').isInt()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM quote_requests WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote request not found' });
    }

    res.json({ message: 'Quote request deleted' });
  })
);

export default router;
