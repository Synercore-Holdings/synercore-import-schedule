/**
 * Shipment Routes
 * Handles CRUD operations for shipments with full type safety
 */

import path from 'path';
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { AppError } from '../utils/AppError.ts';
import { asyncHandler } from '../middleware/errorHandler.ts';
import { requireAdmin } from '../middleware/auth.ts';
import { createMultipleFileUpload, handleUploadError, validateFilesPresent } from '../middleware/fileUpload.js';
import ShipmentController, {
  type CreateShipmentRequest,
  type UpdateShipmentRequest,
  type ShipmentFilterParams,
  type BulkImportShipment
} from '../controllers/ShipmentController.js';
import type { BodyRequest } from '../types/api.js';
import { AuditRepository } from '../db/repositories/AuditRepository.ts';

const damagePhotoUpload = createMultipleFileUpload();

const router = Router();

/**
 * Validation for create shipment
 */
const validateCreateShipment = [
  body('orderRef').trim().notEmpty().withMessage('Order reference is required'),
  body('supplier').trim().notEmpty().withMessage('Supplier is required'),
  body('quantity').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  body('weekNumber').optional({ nullable: true }).isInt({ min: 1, max: 53 }).withMessage('Week number must be 1-53'),
  body('notes').optional().trim(),
  body('finalPod').optional().trim(),
  body('latestStatus').optional().trim(),
  body('productName').optional().trim(),
  body('cbm').optional({ nullable: true }),
  body('palletQty').optional({ nullable: true }),
  body('receivingWarehouse').optional().trim(),
  body('forwardingAgent').optional().trim(),
  body('vesselName').optional().trim(),
  body('bolNumber').optional().trim(),
  body('containerNumber').optional().trim(),
  body('shippingLine').optional().trim(),
  body('incoterm').optional().trim(),
  body('selectedWeekDate').optional({ nullable: true }),
  body('createdAt').optional(),
  body('updatedAt').optional(),
  body('shipmentType').optional().isIn(['international', 'local', 'iwt']).withMessage('Invalid shipment type'),
  body('sourceWarehouse').optional().trim(),
  body('sourcePalletRef').optional().trim(),
  body('batchLot').optional().trim(),
  body('releaseNumber').optional().trim(),
  body('actualArrivalDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid actual arrival date')
];

/**
 * Validation for update shipment
 */
const validateUpdateShipment = [
  body('latestStatus')
    .optional()
    .isIn([
      // Shipping schedule statuses
      'planned_airfreight',
      'planned_seafreight',
      'in_transit_airfreight',
      'in_transit_seafreight',
      'air_customs_clearance',
      'in_transit_roadway',
      'in_transit_seaway',
      'in_transit_last_mile',
      'moored',
      'berth_working',
      'berth_complete',
      'gated_in_port',
      'arrived_pta',
      'arrived_klm',
      'arrived_offsite',
      'delayed_port',
      'delayed_customs',
      'delayed_documents',
      'delayed_supplier',
      'cancelled',
      // Post-arrival workflow statuses
      'clearing_customs',
      'in_warehouse',
      'unloading',
      'inspection_pending',
      'inspecting',
      'inspection_in_progress',
      'inspection_passed',
      'inspection_failed',
      'receiving_goods',
      'receiving',
      'received',
      'stored',
      'archived'
    ])
    .withMessage('Invalid shipment status'),
  body('notes').optional().trim(),
  body('quantity').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  // Additional fields that frontend sends during amendment
  body('supplier').optional().trim(),
  body('orderRef').optional().trim(),
  body('finalPod').optional().trim(),
  body('cbm').optional(),
  body('palletQty').optional(),
  body('weekNumber').optional(),
  body('productName').optional().trim(),
  body('receivingWarehouse').optional().trim(),
  body('forwardingAgent').optional().trim(),
  body('vesselName').optional().trim(),
  body('bolNumber').optional().trim(),
  body('containerNumber').optional().trim(),
  body('shippingLine').optional().trim(),
  body('incoterm').optional().trim(),
  body('selectedWeekDate').optional(),
  body('updatedAt').optional(),
  body('reminderDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid reminder date'),
  body('reminderNote').optional({ nullable: true }).trim(),
  body('sourceWarehouse').optional().trim(),
  body('sourcePalletRef').optional().trim(),
  body('batchLot').optional().trim(),
  body('releaseNumber').optional().trim(),
  body('actualArrivalDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid actual arrival date')
];

/**
 * Validation error handler
 */
const handleValidationErrors = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = AppError.unprocessable('Validation failed', {
      fields: errors.array().map((err: any) => ({
        field: err.param || err.path,
        message: err.msg,
        value: err.value
      }))
    });
    res.status(error.statusCode).json(error.toJSON());
    return false;
  }
  return true;
};

/**
 * GET /api/shipments
 * Get all shipments with filtering and pagination
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const params: ShipmentFilterParams = {
      status: (req.query.status as any) || undefined,
      supplier: (req.query.supplier as string) || undefined,
      weekNumber: req.query.weekNumber ? parseInt(req.query.weekNumber as string, 10) : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      search: (req.query.search as string) || undefined
    };

    const result = await ShipmentController.getShipments(params);

    res.status(200).json({
      data: result.shipments,
      pagination: result.pagination
    });
  })
);

/**
 * POST /api/shipments
 * Create new shipment
 */
router.post(
  '/',
  validateCreateShipment,
  asyncHandler(async (req: BodyRequest<CreateShipmentRequest>, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const {
      orderRef,
      supplier,
      quantity,
      weekNumber,
      notes,
      finalPod,
      latestStatus,
      productName,
      cbm,
      palletQty,
      receivingWarehouse,
      forwardingAgent,
      vesselName,
      incoterm,
      selectedWeekDate,
      shipmentType,
      sourceWarehouse,
      sourcePalletRef,
      batchLot,
      releaseNumber
    } = req.body;

    const shipment = await ShipmentController.createShipment({
      orderRef,
      supplier,
      quantity,
      weekNumber,
      notes,
      finalPod,
      latestStatus,
      productName,
      cbm,
      palletQty,
      receivingWarehouse,
      forwardingAgent,
      vesselName,
      incoterm,
      selectedWeekDate,
      shipmentType,
      sourceWarehouse,
      sourcePalletRef,
      batchLot,
      releaseNumber,
    });

    const user = (req as any).user;
    if (user) {
      AuditRepository.logAudit(user.id, user.username || user.email, 'create', 'shipment', shipment.id, shipment.orderRef || orderRef, { orderRef, supplier, quantity });
    }

    res.status(201).json({
      data: shipment,
      message: 'Shipment created successfully'
    });
  })
);

/**
 * POST /api/shipments/bulk-import
 * Bulk import shipments (merges with existing, skips duplicates by order_ref)
 */
router.post(
  '/bulk-import',
  requireAdmin,
  asyncHandler(async (req: BodyRequest<BulkImportShipment[]>, res: Response) => {
    const result = await ShipmentController.bulkImport(req.body);
    res.status(200).json({
      success: true,
      message: `Imported ${result.imported} new shipments, skipped ${result.skipped} duplicates`,
      imported: result.imported,
      skipped: result.skipped,
      skippedRefs: result.skippedRefs,
      importedRefs: result.importedRefs,
      emptyRows: result.emptyRows,
      totalInFile: req.body.length,
    });
  })
);

/**
 * GET /api/shipments/statistics
 * Get shipment statistics
 */
router.get(
  '/statistics',
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await ShipmentController.getStatistics();

    res.status(200).json({
      data: stats
    });
  })
);

/**
 * GET /api/shipments/archives
 * Get archived shipments (file-based archives)
 */
router.get(
  '/archives',
  asyncHandler(async (_req: Request, res: Response) => {
    const archives = await ShipmentController.getFileArchives();
    res.json(archives);
  })
);

/**
 * GET /api/shipments/archives/:fileName
 * Get specific archive data
 */
router.get(
  '/archives/:fileName',
  asyncHandler(async (req: Request, res: Response) => {
    const archiveData = await ShipmentController.getFileArchiveData(req.params.fileName!);
    res.json(archiveData);
  })
);

/**
 * PUT /api/shipments/archives/:fileName
 * Update archive data
 */
router.put(
  '/archives/:fileName',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ShipmentController.updateFileArchive(req.params.fileName!, req.body.data);
    res.json({
      success: true,
      message: 'Archive updated successfully',
      fileName: result.fileName,
      totalShipments: result.totalShipments
    });
  })
);

/**
 * PUT /api/shipments/archives/:fileName/rename
 * Rename archive
 */
router.put(
  '/archives/:fileName/rename',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ShipmentController.renameFileArchive(req.params.fileName!, req.body.newName);
    res.json({
      success: true,
      message: 'Archive renamed successfully',
      oldFileName: result.oldFileName,
      newFileName: result.newFileName,
      customName: result.customName
    });
  })
);

/**
 * GET /api/shipments/post-arrival
 * Get post-arrival shipments (shipments that have arrived and are in workflow)
 */
router.get(
  '/post-arrival',
  asyncHandler(async (_req: Request, res: Response) => {
    const shipments = await ShipmentController.getPostArrivalShipments();
    res.status(200).json(shipments);
  })
);

/**
 * GET /api/shipments/search
 * Full-text search across shipments
 */
router.get(
  '/search',
  asyncHandler(async (req: Request, res: Response) => {
    const q = (req.query.q as string || '').trim();
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const result = await ShipmentController.searchShipments(q, limit, offset);
    res.json(result);
  })
);

/**
 * POST /api/shipments/bulk/archive
 * Archive multiple shipments
 */
router.post(
  '/bulk/archive',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const id of ids) {
      try {
        const shipment = await ShipmentController.archiveShipment(id);
        results.push({ id, success: true });

        const user = (req as any).user;
        if (user) {
          AuditRepository.logAudit(user.id, user.username || user.email, 'archive', 'shipment', id, shipment.orderRef || id, { bulkAction: true });
        }
      } catch (err) {
        results.push({ id, success: false, error: (err as Error).message });
      }
    }

    res.json({ results, archived: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
  })
);

/**
 * POST /api/shipments/bulk/delete
 * Delete multiple shipments
 */
router.post(
  '/bulk/delete',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const id of ids) {
      try {
        await ShipmentController.deleteShipment(id);
        results.push({ id, success: true });

        const user = (req as any).user;
        if (user) {
          AuditRepository.logAudit(user.id, user.username || user.email, 'delete', 'shipment', id, id, { bulkAction: true });
        }
      } catch (err) {
        results.push({ id, success: false, error: (err as Error).message });
      }
    }

    res.json({ results, deleted: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
  })
);

/**
 * POST /api/shipments/bulk/restore
 * Restore multiple shipments from archive
 */
router.post(
  '/bulk/restore',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const id of ids) {
      try {
        const shipment = await ShipmentController.unarchiveShipment(id);
        results.push({ id, success: true });

        const user = (req as any).user;
        if (user) {
          AuditRepository.logAudit(user.id, user.username || user.email, 'restore', 'shipment', id, shipment.orderRef || id, { bulkAction: true });
        }
      } catch (err) {
        results.push({ id, success: false, error: (err as Error).message });
      }
    }

    res.json({ results, restored: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
  })
);

// ─── Goods Receiving Routes ───

/**
 * GET /api/shipments/receiving/queue
 * Get shipments ready for receiving (passed inspection)
 */
router.get(
  '/receiving/queue',
  asyncHandler(async (_req: Request, res: Response) => {
    const shipments = await ShipmentController.getReceivingQueue();
    res.json(shipments);
  })
);

/**
 * GET /api/shipments/receiving/active
 * Get shipments currently being received
 */
router.get(
  '/receiving/active',
  asyncHandler(async (_req: Request, res: Response) => {
    const shipments = await ShipmentController.getActiveReceiving();
    res.json(shipments);
  })
);

/**
 * GET /api/shipments/receiving/recent
 * Get recently received shipments
 */
router.get(
  '/receiving/recent',
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string, 10) || 7;
    const shipments = await ShipmentController.getRecentlyReceived(days);
    res.json(shipments);
  })
);

/**
 * GET /api/shipments/receiving/summary
 * Get receiving summary stats
 */
router.get(
  '/receiving/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    const summary = await ShipmentController.getReceivingSummary();
    res.json(summary);
  })
);

/**
 * GET /api/shipments/:id
 * Get single shipment by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const shipment = await ShipmentController.getShipment(req.params.id!);

    res.status(200).json({
      data: shipment
    });
  })
);

/**
 * PUT /api/shipments/:id
 * Update shipment
 */
router.put(
  '/:id',
  validateUpdateShipment,
  asyncHandler(async (req: BodyRequest<UpdateShipmentRequest>, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const shipment = await ShipmentController.updateShipment(req.params.id!, req.body);

    const user = (req as any).user;
    if (user) {
      AuditRepository.logAudit(user.id, user.username || user.email, 'update', 'shipment', req.params.id!, shipment.orderRef || req.params.id!, req.body);
    }

    res.status(200).json({
      data: shipment,
      message: 'Shipment updated successfully'
    });
  })
);

/**
 * PATCH /api/shipments/:id/status
 * Update shipment status
 */
router.patch(
  '/:id/status',
  body('status')
    .notEmpty()
    .isIn([
      'planned_airfreight',
      'planned_seafreight',
      'in_transit_airfreight',
      'in_transit_seafreight',
      'arrived_klm',
      'arrived_pta',
      'delayed_port',
      'delayed_customs',
      'delayed_documents',
      'delayed_supplier',
      'clearing_customs',
      'in_warehouse',
      'unloading',
      'inspection_pending',
      'inspecting',
      'inspection_in_progress',
      'inspection_passed',
      'inspection_failed',
      'receiving_goods',
      'receiving',
      'received',
      'stored',
      'archived'
    ])
    .withMessage('Invalid shipment status'),
  body('notes').optional().trim(),
  asyncHandler(async (req: BodyRequest<{ status: string; notes?: string }>, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const shipment = await ShipmentController.updateShipmentStatus(
      req.params.id!,
      req.body.status as any,
      req.body.notes
    );

    res.status(200).json({
      data: shipment,
      message: 'Shipment status updated successfully'
    });
  })
);

/**
 * DELETE /api/shipments/:id
 * Delete shipment
 */
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    await ShipmentController.deleteShipment(req.params.id!);

    const user = (req as any).user;
    if (user) {
      AuditRepository.logAudit(user.id, user.username || user.email, 'delete', 'shipment', req.params.id!, req.params.id!, null);
    }

    res.status(200).json({
      message: 'Shipment deleted successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/archive
 * Archive shipment
 */
router.post(
  '/:id/archive',
  asyncHandler(async (req: Request, res: Response) => {
    const shipment = await ShipmentController.archiveShipment(req.params.id!);

    const user = (req as any).user;
    if (user) {
      AuditRepository.logAudit(user.id, user.username || user.email, 'archive', 'shipment', req.params.id!, shipment.orderRef || req.params.id!, { status: 'archived' });
    }

    res.status(200).json({
      data: shipment,
      message: 'Shipment archived successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/unarchive
 * Unarchive shipment
 */
router.post(
  '/:id/unarchive',
  asyncHandler(async (req: Request, res: Response) => {
    const shipment = await ShipmentController.unarchiveShipment(req.params.id!);

    const user = (req as any).user;
    if (user) {
      AuditRepository.logAudit(user.id, user.username || user.email, 'restore', 'shipment', req.params.id!, shipment.orderRef || req.params.id!, { status: 'restored' });
    }

    res.status(200).json({
      data: shipment,
      message: 'Shipment unarchived successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/restore
 * Restore shipment from archive (alias for unarchive)
 */
router.post(
  '/:id/restore',
  asyncHandler(async (req: Request, res: Response) => {
    const shipment = await ShipmentController.unarchiveShipment(req.params.id!);

    const user = (req as any).user;
    if (user) {
      AuditRepository.logAudit(user.id, user.username || user.email, 'restore', 'shipment', req.params.id!, shipment.orderRef || req.params.id!, { status: 'restored from archive' });
    }

    res.status(200).json({
      data: shipment,
      message: 'Shipment restored successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/start-unloading
 * Start unloading workflow
 */
router.post(
  '/:id/start-unloading',
  asyncHandler(async (req: Request, res: Response) => {
    const shipment = await ShipmentController.startUnloading(req.params.id!);

    res.status(200).json({
      data: shipment,
      message: 'Unloading started successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/complete-unloading
 * Complete unloading workflow
 */
router.post(
  '/:id/complete-unloading',
  asyncHandler(async (req: Request, res: Response) => {
    const shipment = await ShipmentController.completeUnloading(req.params.id!);

    res.status(200).json({
      data: shipment,
      message: 'Unloading completed successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/start-inspection
 * Start inspection workflow
 */
router.post(
  '/:id/start-inspection',
  body('inspectedBy').optional().trim(),
  asyncHandler(async (req: BodyRequest<{ inspectedBy?: string }>, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const shipment = await ShipmentController.startInspection(
      req.params.id!,
      req.body.inspectedBy
    );

    res.status(200).json({
      data: shipment,
      message: 'Inspection started successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/complete-inspection
 * Complete inspection workflow
 */
router.post(
  '/:id/complete-inspection',
  body('passed').isBoolean().withMessage('passed must be a boolean'),
  body('notes').optional().trim(),
  body('inspectedBy').optional().trim(),
  asyncHandler(async (req: BodyRequest<{ passed: boolean; notes?: string; inspectedBy?: string }>, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const shipment = await ShipmentController.completeInspection(
      req.params.id!,
      req.body.passed,
      req.body.notes,
      req.body.inspectedBy
    );

    res.status(200).json({
      data: shipment,
      message: 'Inspection completed successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/start-receiving
 * Start receiving workflow
 */
router.post(
  '/:id/start-receiving',
  body('receivedBy').optional().trim(),
  asyncHandler(async (req: BodyRequest<{ receivedBy?: string }>, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const shipment = await ShipmentController.startReceiving(
      req.params.id!,
      req.body.receivedBy
    );

    res.status(200).json({
      data: shipment,
      message: 'Receiving started successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/complete-receiving
 * Complete receiving workflow
 */
router.post(
  '/:id/complete-receiving',
  body('receivedQuantity').optional().isInt({ min: 0 }).withMessage('Received quantity must be a non-negative integer'),
  body('receivedBy').optional().trim(),
  body('binLocation').optional().trim(),
  body('discrepancies').optional().trim(),
  body('receivingNotes').optional().trim(),
  asyncHandler(async (req: BodyRequest<{ receivedQuantity?: number; receivedBy?: string; binLocation?: string; discrepancies?: string; receivingNotes?: string }>, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const shipment = await ShipmentController.completeReceiving(
      req.params.id!,
      req.body.receivedQuantity,
      req.body.receivedBy,
      req.body.binLocation,
      req.body.discrepancies,
      req.body.receivingNotes
    );

    res.status(200).json({
      data: shipment,
      message: 'Receiving completed successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/generate-grn
 * Generate a Goods Received Note number for a shipment
 */
router.post(
  '/:id/generate-grn',
  asyncHandler(async (req: Request, res: Response) => {
    const shipment = await ShipmentController.generateGRN(req.params.id!);
    res.status(200).json({
      data: shipment,
      message: `GRN generated: ${shipment.grn_number}`
    });
  })
);

/**
 * POST /api/shipments/:id/split
 * Split a stored shipment across warehouses (partial or full move).
 * Body: { destination: string, moveQty: number, movePallets: number }
 */
router.post(
  '/:id/split',
  body('destination').trim().notEmpty().withMessage('Destination warehouse is required'),
  body('moveQty').isFloat({ gt: 0 }).withMessage('moveQty must be a positive number'),
  body('movePallets').isFloat({ gt: 0 }).withMessage('movePallets must be a positive number'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const { destination, moveQty, movePallets } = req.body as {
      destination: string;
      moveQty: number;
      movePallets: number;
    };

    const result = await ShipmentController.splitShipment(
      req.params.id!,
      destination,
      Number(moveQty),
      Number(movePallets)
    );

    const user = (req as any).user;
    if (user) {
      AuditRepository.logAudit(
        user.id,
        user.username || user.email,
        'split',
        'shipment',
        req.params.id!,
        (result.source as any).order_ref || req.params.id!,
        { destination, moveQty, movePallets, splitId: result.split ? (result.split as any).id : null }
      );
    }

    res.status(200).json({
      data: result,
      message: result.split
        ? `Split ${moveQty} qty / ${movePallets} pallets to ${destination}`
        : `Moved all stock to ${destination}`,
    });
  })
);

/**
 * POST /api/shipments/:id/sell
 * Mark stored/offsite stock as sold (partial or full).
 * Body: { soldQty: number, soldPallets: number, notes?: string, asoNumber?: string }
 */
router.post(
  '/:id/sell',
  body('soldQty').isFloat({ gt: 0 }).withMessage('soldQty must be a positive number'),
  body('soldPallets').isFloat({ gt: 0 }).withMessage('soldPallets must be a positive number'),
  body('notes').optional().trim(),
  body('asoNumber').optional().trim(),
  asyncHandler(async (req: Request, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const { soldQty, soldPallets, notes, asoNumber } = req.body as {
      soldQty: number;
      soldPallets: number;
      notes?: string;
      asoNumber?: string;
    };

    const result = await ShipmentController.sellShipment(
      req.params.id!,
      Number(soldQty),
      Number(soldPallets),
      notes,
      asoNumber
    );

    const user = (req as any).user;
    if (user) {
      AuditRepository.logAudit(
        user.id,
        user.username || user.email,
        'sell',
        'shipment',
        req.params.id!,
        (result.source as any).order_ref || req.params.id!,
        { soldQty, soldPallets, notes, asoNumber, soldId: result.sold ? (result.sold as any).id : null }
      );
    }

    res.status(200).json({
      data: result,
      message: `Marked ${soldQty} qty / ${soldPallets} pallets as sold`,
    });
  })
);

/**
 * POST /api/shipments/:id/admin-complete
 * Admin: complete entire workflow in one step
 */
router.post(
  '/:id/admin-complete',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const shipment = await ShipmentController.adminCompleteWorkflow(
      req.params.id!,
      req.user.username || req.user.email || 'Admin'
    );

    res.status(200).json({
      data: shipment,
      message: 'Workflow completed by admin'
    });
  })
);

/**
 * POST /api/shipments/:id/reject-shipment
 * Reject a failed-inspection shipment and return it to the supplier
 */
router.post(
  '/:id/reject-shipment',
  body('rejectionReason').trim().notEmpty().withMessage('Rejection reason is required'),
  body('rejectedBy').optional().trim(),
  asyncHandler(async (req: BodyRequest<{ rejectionReason: string; rejectedBy?: string }>, res: Response) => {
    if (!handleValidationErrors(req, res)) return;

    const shipment = await ShipmentController.rejectShipment(
      req.params.id!,
      req.body.rejectionReason,
      req.body.rejectedBy
    );

    res.status(200).json({
      data: shipment,
      message: 'Shipment rejected successfully'
    });
  })
);

/**
 * POST /api/shipments/:id/damage-photos
 * Upload one or more photos of damaged goods for a failed-inspection shipment
 */
router.post(
  '/:id/damage-photos',
  damagePhotoUpload.array('photos', 10),
  handleUploadError,
  validateFilesPresent,
  asyncHandler(async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[]) || [];
    const photos = await ShipmentController.uploadDamagePhotos(
      req.params.id!,
      files,
      req.user?.username || req.user?.email
    );

    res.status(201).json({
      data: photos,
      message: `${photos.length} photo(s) uploaded successfully`
    });
  })
);

/**
 * GET /api/shipments/:id/damage-photos
 * List damage photos recorded against a shipment
 */
router.get(
  '/:id/damage-photos',
  asyncHandler(async (req: Request, res: Response) => {
    const photos = await ShipmentController.getDamagePhotos(req.params.id!);
    res.status(200).json({ data: photos });
  })
);

/**
 * GET /api/shipments/:id/damage-photos/:photoId
 * Stream a single damage photo's file back
 */
router.get(
  '/:id/damage-photos/:photoId',
  asyncHandler(async (req: Request, res: Response) => {
    const photo = await ShipmentController.getDamagePhoto(req.params.id!, req.params.photoId!);
    res.setHeader('Content-Type', photo.mime_type || 'application/octet-stream');
    res.sendFile(path.resolve(photo.file_path));
  })
);

/**
 * DELETE /api/shipments/:id/damage-photos/:photoId
 * Remove a damage photo
 */
router.delete(
  '/:id/damage-photos/:photoId',
  asyncHandler(async (req: Request, res: Response) => {
    await ShipmentController.deleteDamagePhoto(req.params.id!, req.params.photoId!);
    res.status(200).json({ message: 'Damage photo deleted successfully' });
  })
);

export default router;
