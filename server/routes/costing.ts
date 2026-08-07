/**
 * Import Costing Routes
 * API endpoints for cost estimates and exchange rates
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import CostingController from '../controllers/CostingController.js';
import { authenticateToken } from '../middleware/security.js';
import { requireAdmin } from '../middleware/auth.ts';
import { logInfo, logError } from '../utils/logger.js';
import EmailService from '../services/emailService.js';

const router = Router();

// Helper: wrap async handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Helper: validate request
const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

const createCostEstimateValidation = [
  body('supplier_name').optional({ nullable: true }).trim(),
  body('customer_name').optional({ nullable: true }).trim(),
  body('customer_id').optional({ nullable: true }).trim(),
  body('direction').optional({ nullable: true }).isIn(['import', 'export']).withMessage('direction must be import or export'),
  body('port_of_discharge').optional({ nullable: true }).trim(),
  body('container_type').optional({ nullable: true }).trim(),
  body('reference_number').optional({ nullable: true }).trim(),
  body('manual_previous_cost_per_kg_zar').optional({ nullable: true }).isFloat({ min: 0, max: 1000000 }).withMessage('Manual previous cost/kg must be between 0 and 1,000,000'),
  body('manual_previous_cost_date').optional({ nullable: true }).isISO8601().withMessage('Manual previous cost date must be a valid date'),
  body('shipping_line').optional({ nullable: true }).trim(),
  body('commodity').optional({ nullable: true }).trim(),
  body('notes').optional({ nullable: true }).trim(),
  // Financial field validation - prevent unreasonable values
  body('invoice_value_usd').optional({ nullable: true }).isFloat({ min: 0, max: 100000000 }).withMessage('Invoice value must be between 0 and 100,000,000'),
  body('exchange_rate').optional({ nullable: true }).isFloat({ min: 0.01, max: 1000 }).withMessage('Exchange rate must be between 0.01 and 1,000'),
  body('freight_cost_usd').optional({ nullable: true }).isFloat({ min: 0, max: 10000000 }).withMessage('Freight cost must be between 0 and 10,000,000'),
  body('insurance_usd').optional({ nullable: true }).isFloat({ min: 0, max: 10000000 }).withMessage('Insurance must be between 0 and 10,000,000'),
  body('customs_duty_percent').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('Customs duty must be between 0% and 100%'),
  body('vat_rate').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('VAT rate must be between 0% and 100%'),
];

const updateCostEstimateValidation = [
  param('id').isString().notEmpty(),
  ...createCostEstimateValidation,
];

// ==================== COST ESTIMATE ROUTES ====================

/**
 * GET /api/costing
 * Get all cost estimates with optional filtering
 */
router.get(
  '/',
  authenticateToken,
  [
    query('status').optional().isIn(['draft', 'final', 'archived']),
    query('supplierId').optional().isString(),
    query('shipmentId').optional().isString(),
    query('direction').optional().isIn(['import', 'export']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 5000 }),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await CostingController.getCostEstimates({
      status: req.query.status as string,
      supplierId: req.query.supplierId as string,
      shipmentId: req.query.shipmentId as string,
      direction: req.query.direction as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    });

    res.json(result);
  })
);

/**
 * GET /api/costing/by-shipment/:shipmentId
 * Get cost estimates for a specific shipment
 */
router.get(
  '/by-shipment/:shipmentId',
  authenticateToken,
  [param('shipmentId').isString().notEmpty()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const estimates = await CostingController.getByShipment(req.params.shipmentId);
    res.json({ data: estimates });
  })
);

/**
 * GET /api/costing/:id
 * Get a single cost estimate
 */
router.get(
  '/:id',
  authenticateToken,
  [param('id').isString().notEmpty()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const estimate = await CostingController.getCostEstimate(req.params.id);
    if (!estimate) {
      return res.status(404).json({ error: 'Cost estimate not found' });
    }
    res.json({ data: estimate });
  })
);

/**
 * POST /api/costing
 * Create a new cost estimate
 */
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  createCostEstimateValidation,
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const estimate = await CostingController.createCostEstimate({
      ...req.body,
      created_by: userId,
    });

    logInfo(`Cost estimate created: ${estimate.id}`);
    res.status(201).json({ data: estimate, message: 'Cost estimate created successfully' });
  })
);

/**
 * PUT /api/costing/:id
 * Update a cost estimate
 */
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  updateCostEstimateValidation,
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const estimate = await CostingController.updateCostEstimate(req.params.id, req.body);
    logInfo(`Cost estimate updated: ${req.params.id}`);
    res.json({ data: estimate, message: 'Cost estimate updated successfully' });
  })
);

/**
 * DELETE /api/costing/:id
 * Delete a cost estimate
 */
router.delete(
  '/:id',
  authenticateToken,
  requireAdmin,
  [param('id').isString().notEmpty()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    await CostingController.deleteCostEstimate(req.params.id);
    logInfo(`Cost estimate deleted: ${req.params.id}`);
    res.json({ message: 'Cost estimate deleted successfully' });
  })
);

/**
 * POST /api/costing/:id/duplicate
 * Duplicate a cost estimate
 */
router.post(
  '/:id/duplicate',
  authenticateToken,
  requireAdmin,
  [param('id').isString().notEmpty()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const estimate = await CostingController.duplicateCostEstimate(req.params.id);
    logInfo(`Cost estimate duplicated: ${req.params.id} -> ${estimate.id}`);
    res.status(201).json({ data: estimate, message: 'Cost estimate duplicated successfully' });
  })
);

/**
 * POST /api/costing/:id/link-shipment
 * Link cost estimate to a shipment
 */
router.post(
  '/:id/link-shipment',
  authenticateToken,
  requireAdmin,
  [
    param('id').isString().notEmpty(),
    body('shipmentId').isString().notEmpty(),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const estimate = await CostingController.linkToShipment(req.params.id, req.body.shipmentId);
    logInfo(`Cost estimate ${req.params.id} linked to shipment ${req.body.shipmentId}`);
    res.json({ data: estimate, message: 'Cost estimate linked to shipment' });
  })
);

/**
 * DELETE /api/costing/:id/link-shipment
 * Unlink cost estimate from shipment
 */
router.delete(
  '/:id/link-shipment',
  authenticateToken,
  requireAdmin,
  [param('id').isString().notEmpty()],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const estimate = await CostingController.unlinkFromShipment(req.params.id);
    logInfo(`Cost estimate ${req.params.id} unlinked from shipment`);
    res.json({ data: estimate, message: 'Cost estimate unlinked from shipment' });
  })
);

// ==================== EXCHANGE RATE ROUTES ====================

/**
 * GET /api/costing/exchange-rate/current
 * Get current USD/ZAR exchange rate
 */
router.get(
  '/exchange-rate/current',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const rate = await CostingController.getExchangeRate();
    res.json({ data: rate });
  })
);

/**
 * POST /api/costing/exchange-rate/refresh
 * Force refresh exchange rate from API
 */
router.post(
  '/exchange-rate/refresh',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const rate = await CostingController.refreshExchangeRate();
    logInfo('Exchange rate refreshed');
    res.json({ data: rate, message: 'Exchange rate refreshed' });
  })
);

/**
 * POST /api/costing/exchange-rate/manual
 * Set manual exchange rate
 */
router.post(
  '/exchange-rate/manual',
  authenticateToken,
  requireAdmin,
  [body('rate').isFloat({ min: 0 })],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const rate = await CostingController.setManualExchangeRate(req.body.rate);
    logInfo(`Manual exchange rate set: ${req.body.rate}`);
    res.json({ data: rate, message: 'Exchange rate set manually' });
  })
);

/**
 * POST /api/costing/calculate
 * Calculate totals without saving (for live preview)
 */
router.post(
  '/calculate',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const totals = CostingController.calculateAllTotals(req.body);
    res.json({ data: totals });
  })
);

/**
 * POST /api/costing/:id/send-email
 * Send cost estimate via email with PDF attachment
 */
router.post(
  '/:id/send-email',
  authenticateToken,
  [
    param('id').isString().notEmpty(),
    body('toEmail').isEmail().withMessage('Valid email address required'),
    body('pdfBase64').isString().notEmpty().withMessage('PDF data required'),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const { toEmail, pdfBase64 } = req.body;
    const user = (req as any).user;

    // Get the estimate details
    const estimate = await CostingController.getCostEstimate(req.params.id);
    if (!estimate) {
      return res.status(404).json({ error: 'Cost estimate not found' });
    }

    // Send the email
    const senderName = user?.username || user?.name || 'Synercore Team';
    const result = await EmailService.sendCostEstimateEmail(toEmail, estimate, pdfBase64, senderName);

    if (result.success) {
      logInfo(`Cost estimate ${req.params.id} emailed to ${toEmail}`);
      res.json({ message: 'Email sent successfully', messageId: result.messageId });
    } else {
      logError(`Failed to email cost estimate ${req.params.id}: ${result.error}`);
      res.status(500).json({ error: 'Failed to send email', details: result.error });
    }
  })
);

export default router;
