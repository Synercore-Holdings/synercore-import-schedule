/**
 * Shipment Controller
 * Handles all shipment-related business logic
 */

import type { Shipment, ShipmentStatus } from '../types/index.js';
import { AppError } from '../utils/AppError.ts';
import { shipmentRepository } from '../db/repositories/index.js';
import archiveService from '../services/archiveService.js';
import { getPool, queryAll, queryOne, transaction } from '../db/connection.js';

/**
 * Create shipment request body
 */
export interface CreateShipmentRequest {
  orderRef: string;
  supplier: string;
  quantity?: number;
  weekNumber?: number;
  notes?: string;
  finalPod?: string;
  latestStatus?: string;
  productName?: string;
  cbm?: number;
  palletQty?: number;
  receivingWarehouse?: string;
  forwardingAgent?: string;
  vesselName?: string;
  bolNumber?: string;
  incoterm?: string;
  selectedWeekDate?: string;
  shipmentType?: 'international' | 'local' | 'iwt';
  sourceWarehouse?: string;
  sourcePalletRef?: string;
  batchLot?: string;
  releaseNumber?: string;
  actualArrivalDate?: string | null;
}

/**
 * Update shipment request body
 */
export interface UpdateShipmentRequest {
  latestStatus?: ShipmentStatus;
  notes?: string;
  quantity?: number;
  supplier?: string;
  orderRef?: string;
  finalPod?: string;
  cbm?: number;
  palletQty?: number;
  weekNumber?: number;
  productName?: string;
  receivingWarehouse?: string;
  forwardingAgent?: string;
  vesselName?: string;
  bolNumber?: string;
  incoterm?: string;
  selectedWeekDate?: string;
  updatedAt?: string;
  reminderDate?: string | null;
  reminderNote?: string | null;
  sourceWarehouse?: string;
  sourcePalletRef?: string;
  batchLot?: string;
  releaseNumber?: string;
  actualArrivalDate?: string | null;
  warehouseSince?: string | null;
}

/**
 * Shipment filter parameters
 */
export interface ShipmentFilterParams {
  status?: ShipmentStatus;
  supplier?: string;
  weekNumber?: number;
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
}

/**
 * Bulk import shipment data (camelCase from frontend/spreadsheet)
 */
export interface BulkImportShipment {
  id?: string;
  supplier: string;
  orderRef?: string;
  finalPod?: string;
  latestStatus?: string;
  weekNumber?: number;
  productName?: string;
  quantity?: number;
  cbm?: number;
  palletQty?: number;
  receivingWarehouse?: string;
  notes?: string;
  forwardingAgent?: string;
  incoterm?: string;
  vesselName?: string;
  bolNumber?: string;
  selectedWeekDate?: string;
  updatedAt?: string;
  reminderDate?: string;
  reminderNote?: string;
  shipmentType?: 'international' | 'local';
}

/**
 * File archive metadata
 */
export interface FileArchiveInfo {
  fileName: string;
  archivedAt?: string;
  totalShipments: number;
}

/**
 * File archive data (full contents)
 */
export interface FileArchiveData {
  archivedAt: string;
  totalShipments: number;
  data: Partial<Shipment>[];
}

/**
 * Search result
 */
export interface SearchResult {
  data: any[];
  total: number;
  query: string;
}

/**
 * Shipment Controller Class
 */
export class ShipmentController {
  /**
   * Get all shipments with filtering and pagination
   */
  static async getShipments(params: ShipmentFilterParams): Promise<{
    shipments: Shipment[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    // Handle search
    if (params.search) {
      const results = await shipmentRepository.search(params.search);
      return {
        shipments: results.slice(offset, offset + limit),
        pagination: {
          page,
          limit,
          total: results.length,
          pages: Math.ceil(results.length / limit)
        }
      };
    }

    // Get filtered shipments
    const filter: Record<string, any> = {};
    if (params.status) filter.latest_status = params.status;
    if (params.supplier) filter.supplier = params.supplier;
    if (params.weekNumber) filter.week_number = params.weekNumber;

    const [shipments, total] = await Promise.all([
      shipmentRepository.findAll({ filter, pagination: { page, limit } }),
      shipmentRepository.count(filter)
    ]);

    return {
      shipments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single shipment by ID
   */
  static async getShipment(id: string): Promise<Shipment> {
    const shipment = await shipmentRepository.findById(id);

    if (!shipment) {
      throw AppError.notFound(`Shipment with ID ${id} not found`);
    }

    return shipment;
  }

  /**
   * Create new shipment
   */
  static async createShipment(data: CreateShipmentRequest): Promise<Shipment> {
    // Validate order reference doesn't already exist
    const existing = await shipmentRepository.findByOrderRef(data.orderRef);
    if (existing) {
      throw AppError.conflict(`Shipment with order reference ${data.orderRef} already exists`);
    }

    // Default status per shipment type
    const defaultStatus =
      data.shipmentType === 'iwt' ? 'in_transit_roadway'
      : data.shipmentType === 'local' ? 'in_transit_roadway'
      : 'planned_airfreight';

    // Create shipment with all fields
    const shipment = await shipmentRepository.create({
      id: `ship_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      order_ref: data.orderRef,
      supplier: data.supplier,
      quantity: data.quantity || null,
      latest_status: (data.latestStatus || defaultStatus) as ShipmentStatus,
      shipment_type: data.shipmentType || 'international',
      week_number: data.weekNumber || null,
      notes: data.notes || null,
      final_pod: data.finalPod || null,
      product_name: data.productName || null,
      cbm: data.cbm || null,
      pallet_qty: data.palletQty || null,
      receiving_warehouse: data.receivingWarehouse || null,
      forwarding_agent: data.forwardingAgent || null,
      vessel_name: data.vesselName || null,
      bol_number: data.bolNumber || null,
      incoterm: data.incoterm || null,
      selected_week_date: data.selectedWeekDate ? new Date(data.selectedWeekDate) : null,
      // Captured once and never updated afterward — supplier performance
      // metrics benchmark against this instead of week_number/selected_week_date,
      // which get overwritten whenever the shipment is rescheduled.
      original_week_number: data.weekNumber || null,
      original_selected_week_date: data.selectedWeekDate ? new Date(data.selectedWeekDate) : null,
      source_warehouse: data.sourceWarehouse || null,
      source_pallet_ref: data.sourcePalletRef || null,
      batch_lot: data.batchLot || null,
      release_number: data.releaseNumber || null,
      actual_arrival_date: data.actualArrivalDate ? new Date(data.actualArrivalDate) : null,
      created_at: new Date(),
      updated_at: new Date()
    } as Partial<Shipment>);

    return shipment;
  }

  /**
   * Update shipment
   */
  static async updateShipment(id: string, data: UpdateShipmentRequest): Promise<Shipment> {
    // Verify shipment exists
    const existing = await this.getShipment(id);

    // Convert camelCase to snake_case for database
    const dbData: Record<string, any> = {
      updated_at: new Date()
    };

    if (data.latestStatus !== undefined) {
      dbData.latest_status = data.latestStatus;
    }
    if (data.quantity !== undefined) {
      dbData.quantity = data.quantity;
    }
    if (data.notes !== undefined) {
      dbData.notes = data.notes;
    }
    if (data.supplier !== undefined) {
      dbData.supplier = data.supplier;
    }
    if (data.orderRef !== undefined) {
      dbData.order_ref = data.orderRef;
    }
    if (data.finalPod !== undefined) {
      dbData.final_pod = data.finalPod;
    }
    if (data.cbm !== undefined) {
      dbData.cbm = data.cbm;
    }
    if (data.palletQty !== undefined) {
      dbData.pallet_qty = data.palletQty;
    }
    if (data.weekNumber !== undefined) {
      dbData.week_number = data.weekNumber;
    }
    if (data.productName !== undefined) {
      dbData.product_name = data.productName;
    }
    if (data.receivingWarehouse !== undefined) {
      dbData.receiving_warehouse = data.receivingWarehouse;
      // Warehouse reassigned via manual edit — track when it started sitting
      // here, distinct from receiving_date (kept as the original goods-receipt
      // date for supplier lead-time metrics). Skipped if the caller already
      // sent an explicit warehouseSince below.
      if (data.receivingWarehouse !== (existing as any).receiving_warehouse && data.warehouseSince === undefined) {
        dbData.warehouse_since = new Date();
      }
    }
    if (data.forwardingAgent !== undefined) {
      dbData.forwarding_agent = data.forwardingAgent;
    }
    if (data.vesselName !== undefined) {
      dbData.vessel_name = data.vesselName;
    }
    if (data.bolNumber !== undefined) {
      dbData.bol_number = data.bolNumber;
    }
    if (data.incoterm !== undefined) {
      dbData.incoterm = data.incoterm;
    }
    if (data.selectedWeekDate !== undefined) {
      dbData.selected_week_date = data.selectedWeekDate;
    }
    if ((data as any).receivingDate !== undefined) {
      dbData.receiving_date = (data as any).receivingDate;
    }
    if (data.warehouseSince !== undefined) {
      dbData.warehouse_since = data.warehouseSince;
    }
    if (data.actualArrivalDate !== undefined) {
      dbData.actual_arrival_date = data.actualArrivalDate || null;
    }
    if (data.reminderDate !== undefined) {
      dbData.reminder_date = data.reminderDate || null;
    }
    if (data.reminderNote !== undefined) {
      dbData.reminder_note = data.reminderNote || null;
    }
    if (data.sourceWarehouse !== undefined) {
      dbData.source_warehouse = data.sourceWarehouse || null;
    }
    if (data.sourcePalletRef !== undefined) {
      dbData.source_pallet_ref = data.sourcePalletRef || null;
    }
    if (data.batchLot !== undefined) {
      dbData.batch_lot = data.batchLot || null;
    }
    if (data.releaseNumber !== undefined) {
      dbData.release_number = data.releaseNumber || null;
    }

    // Update shipment
    const shipment = await shipmentRepository.update(id, dbData as Partial<Shipment>);

    return shipment;
  }

  /**
   * Update shipment status
   */
  static async updateShipmentStatus(
    id: string,
    status: ShipmentStatus,
    notes?: string
  ): Promise<Shipment> {
    // Verify shipment exists
    await this.getShipment(id);

    // Update status
    const shipment = await shipmentRepository.updateStatus(id, status, notes);

    return shipment;
  }

  /**
   * Delete shipment
   */
  static async deleteShipment(id: string): Promise<void> {
    // Verify shipment exists
    await this.getShipment(id);

    // Delete shipment
    const deleted = await shipmentRepository.delete(id);

    if (!deleted) {
      throw AppError.internal('Failed to delete shipment');
    }
  }

  /**
   * Archive shipment
   */
  static async archiveShipment(id: string): Promise<Shipment> {
    // Verify shipment exists
    await this.getShipment(id);

    return shipmentRepository.archive(id);
  }

  /**
   * Unarchive shipment
   */
  static async unarchiveShipment(id: string): Promise<Shipment> {
    // Verify shipment exists
    await this.getShipment(id);

    return shipmentRepository.unarchive(id);
  }

  /**
   * Get shipment statistics
   */
  static async getStatistics(): Promise<{
    total: number;
    stored: number;
    inTransit: number;
    arrived: number;
    archived: number;
  }> {
    return shipmentRepository.getStatistics();
  }

  /**
   * Get shipments by status
   */
  static async getShipmentsByStatus(status: ShipmentStatus): Promise<Shipment[]> {
    return shipmentRepository.findByStatus(status);
  }

  /**
   * Get shipments by supplier
   */
  static async getShipmentsBySupplier(supplier: string): Promise<Shipment[]> {
    return shipmentRepository.findBySupplier(supplier);
  }

  /**
   * Get shipments by week
   */
  static async getShipmentsByWeek(weekNumber: number): Promise<Shipment[]> {
    return shipmentRepository.findByWeek(weekNumber);
  }

  /**
   * Get post-arrival shipments (shipments that have arrived and are in workflow)
   */
  static async getPostArrivalShipments(): Promise<Shipment[]> {
    const postArrivalStates = [
      'arrived_pta',
      'arrived_klm',
      'arrived_offsite',
      'unloading',
      'inspection_pending',
      'inspecting',
      'inspection_failed',
      'inspection_passed',
      'receiving',
      'received'
    ] as ShipmentStatus[];

    return shipmentRepository.findByStatuses(postArrivalStates);
  }

  /**
   * Get archived shipments
   */
  static async getArchives(): Promise<Shipment[]> {
    return shipmentRepository.findArchived();
  }

  /**
   * Start unloading workflow
   */
  static async startUnloading(id: string): Promise<Shipment> {
    // Verify shipment exists
    const shipment = await this.getShipment(id);

    // Verify shipment is in a valid arrival state
    const validStates = ['arrived_pta', 'arrived_klm', 'arrived_offsite'];
    if (!validStates.includes(shipment.latest_status)) {
      throw AppError.conflict(
        `Shipment must be in one of these states to start unloading: ${validStates.join(', ')}`
      );
    }

    // Update status to unloading
    const updated = await shipmentRepository.update(id, {
      latest_status: 'unloading' as ShipmentStatus,
      unloading_start_date: new Date(),
      updated_at: new Date()
    } as Partial<Shipment>);

    return updated;
  }

  /**
   * Complete unloading workflow
   */
  static async completeUnloading(id: string): Promise<Shipment> {
    // Verify shipment exists
    const shipment = await this.getShipment(id);

    // Verify shipment is in unloading state
    if (shipment.latest_status !== 'unloading') {
      throw AppError.conflict('Shipment must be in unloading state to complete unloading');
    }

    // Update status to inspection_pending
    const updated = await shipmentRepository.update(id, {
      latest_status: 'inspection_pending' as ShipmentStatus,
      unloading_completed_date: new Date(),
      updated_at: new Date()
    } as Partial<Shipment>);

    return updated;
  }

  /**
   * Start inspection workflow
   */
  static async startInspection(
    id: string,
    inspectedBy?: string
  ): Promise<Shipment> {
    // Verify shipment exists
    const shipment = await this.getShipment(id);

    // Verify shipment is in inspection_pending state
    if (shipment.latest_status !== 'inspection_pending') {
      throw AppError.conflict('Shipment must be in inspection_pending state to start inspection');
    }

    // Update status to inspecting
    const updated = await shipmentRepository.update(id, {
      latest_status: 'inspecting' as ShipmentStatus,
      inspection_status: 'in_progress',
      inspected_by: inspectedBy || '',
      inspection_date: new Date(),
      updated_at: new Date()
    } as Partial<Shipment>);

    return updated;
  }

  /**
   * Complete inspection workflow
   */
  static async completeInspection(
    id: string,
    passed: boolean,
    notes?: string,
    inspectedBy?: string
  ): Promise<Shipment> {
    // Verify shipment exists
    const shipment = await this.getShipment(id);

    // Verify shipment is in inspecting state
    if (shipment.latest_status !== 'inspecting') {
      throw AppError.conflict('Shipment must be in inspecting state to complete inspection');
    }

    // Update status based on inspection result
    const updated = await shipmentRepository.update(id, {
      latest_status: (passed ? 'inspection_passed' : 'inspection_failed') as ShipmentStatus,
      inspection_status: passed ? 'passed' : 'failed',
      inspection_notes: notes || '',
      inspected_by: inspectedBy || shipment.inspected_by || '',
      updated_at: new Date()
    } as Partial<Shipment>);

    return updated;
  }

  /**
   * Start receiving workflow
   */
  static async startReceiving(
    id: string,
    receivedBy?: string
  ): Promise<Shipment> {
    // Verify shipment exists
    const shipment = await this.getShipment(id);

    // Verify shipment is in inspection_passed state
    if (shipment.latest_status !== 'inspection_passed') {
      throw AppError.conflict('Shipment must have passed inspection to start receiving');
    }

    // Update status to receiving
    const updated = await shipmentRepository.update(id, {
      latest_status: 'receiving' as ShipmentStatus,
      receiving_status: 'in_progress',
      received_by: receivedBy || '',
      receiving_date: new Date(),
      updated_at: new Date()
    } as Partial<Shipment>);

    return updated;
  }

  /**
   * Complete receiving workflow
   */
  static async completeReceiving(
    id: string,
    receivedQuantity?: number,
    receivedBy?: string,
    binLocation?: string,
    discrepancies?: string,
    receivingNotes?: string
  ): Promise<Shipment> {
    // Verify shipment exists
    const shipment = await this.getShipment(id);

    // Verify shipment is in receiving state
    if (shipment.latest_status !== 'receiving') {
      throw AppError.conflict('Shipment must be in receiving state to complete receiving');
    }

    // Update status to stored (auto-advance past received)
    const updateData: Record<string, any> = {
      latest_status: 'stored' as ShipmentStatus,
      receiving_status: 'completed',
      received_quantity: receivedQuantity,
      received_by: receivedBy || shipment.received_by || '',
      updated_at: new Date()
    };
    if (binLocation !== undefined) updateData.bin_location = binLocation;
    if (discrepancies !== undefined) updateData.discrepancies = discrepancies;
    if (receivingNotes !== undefined) updateData.receiving_notes = receivingNotes;

    const updated = await shipmentRepository.update(id, updateData as Partial<Shipment>);

    return updated;
  }

  // ─── Goods Receiving Endpoints ───

  /**
   * Get shipments ready for receiving (passed inspection)
   */
  static async getReceivingQueue(): Promise<Shipment[]> {
    return shipmentRepository.findByStatus('inspection_passed' as ShipmentStatus);
  }

  /**
   * Get shipments currently being received
   */
  static async getActiveReceiving(): Promise<Shipment[]> {
    return shipmentRepository.findByStatus('receiving' as ShipmentStatus);
  }

  /**
   * Get recently received shipments (last N days)
   */
  static async getRecentlyReceived(days: number = 7): Promise<Shipment[]> {
    return queryAll<Shipment>(
      `SELECT * FROM shipments
       WHERE latest_status IN ('received', 'stored')
         AND receiving_date >= NOW() - ($1 || ' days')::interval
       ORDER BY receiving_date DESC`,
      [days]
    );
  }

  /**
   * Get receiving summary stats for today
   */
  static async getReceivingSummary(): Promise<{
    pendingReceiving: number;
    activeReceiving: number;
    receivedToday: number;
    discrepanciesToday: number;
  }> {
    const result = await queryOne<{
      pending: string;
      active: string;
      received_today: string;
      discrepancies_today: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE latest_status = 'inspection_passed')::int as pending,
        COUNT(*) FILTER (WHERE latest_status = 'receiving')::int as active,
        COUNT(*) FILTER (WHERE latest_status IN ('received', 'stored') AND receiving_date::date = CURRENT_DATE)::int as received_today,
        COUNT(*) FILTER (WHERE latest_status IN ('received', 'stored') AND receiving_date::date = CURRENT_DATE AND discrepancies IS NOT NULL AND discrepancies != '')::int as discrepancies_today
      FROM shipments`
    );

    return {
      pendingReceiving: parseInt(result?.pending || '0', 10),
      activeReceiving: parseInt(result?.active || '0', 10),
      receivedToday: parseInt(result?.received_today || '0', 10),
      discrepanciesToday: parseInt(result?.discrepancies_today || '0', 10),
    };
  }

  /**
   * Generate a GRN (Goods Received Note) number for a shipment
   */
  static async generateGRN(id: string): Promise<Shipment> {
    const shipment = await this.getShipment(id);

    if (shipment.grn_number) {
      return shipment; // Already has a GRN
    }

    if (!['received', 'stored'].includes(shipment.latest_status)) {
      throw AppError.conflict('Shipment must be received to generate a GRN');
    }

    // Generate GRN: GRN-YYYYMMDD-NNN
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::int as count FROM shipments WHERE grn_number LIKE $1`,
      [`GRN-${today}-%`]
    );
    const seq = (parseInt(countResult?.count || '0', 10) + 1).toString().padStart(3, '0');
    const grnNumber = `GRN-${today}-${seq}`;

    const updated = await shipmentRepository.update(id, {
      grn_number: grnNumber,
      updated_at: new Date()
    } as Partial<Shipment>);

    return updated;
  }

  /**
   * Admin: complete entire workflow in one step
   */
  static async adminCompleteWorkflow(id: string, adminName: string): Promise<Shipment> {
    const shipment = await this.getShipment(id);

    // Must be in a post-arrival status (not already stored/cancelled)
    const validStates = [
      'arrived_pta', 'arrived_klm', 'arrived_offsite',
      'unloading', 'inspection_pending', 'inspecting',
      'inspection_passed', 'inspection_failed',
      'receiving', 'received'
    ];
    if (!validStates.includes(shipment.latest_status)) {
      throw AppError.conflict('Shipment must be in a post-arrival workflow state');
    }

    const now = new Date();
    const updated = await shipmentRepository.update(id, {
      latest_status: 'stored' as ShipmentStatus,
      unloading_start_date: shipment.unloading_start_date || now,
      unloading_completed_date: shipment.unloading_completed_date || now,
      inspection_status: 'passed',
      inspection_date: shipment.inspection_date || now,
      inspected_by: shipment.inspected_by || adminName,
      inspection_notes: shipment.inspection_notes || 'Admin skip — all steps completed',
      receiving_status: 'completed',
      receiving_date: shipment.receiving_date || now,
      received_by: shipment.received_by || adminName,
      received_quantity: shipment.received_quantity || shipment.quantity,
      updated_at: now
    } as Partial<Shipment>);

    return updated;
  }

  /**
   * Split a shipment across warehouses.
   *
   * Used by the Stored Stock "Move" action when only a portion of a shipment
   * is physically moving to another warehouse. Runs inside a transaction so
   * the source reduction and the destination insert either both succeed or
   * both roll back — no more half-moved stock.
   *
   * If moveQty + movePallets cover the whole source, this collapses into a
   * simple warehouse update on the source row (no split row created).
   *
   * Deliberately skips the order_ref uniqueness check that createShipment
   * enforces — by design the split row shares its source's order_ref, since
   * they represent the same physical shipment.
   */
  static async splitShipment(
    id: string,
    destination: string,
    moveQty: number,
    movePallets: number
  ): Promise<{ source: Shipment; split: Shipment | null }> {
    if (!destination || typeof destination !== 'string') {
      throw AppError.unprocessable('Destination warehouse is required');
    }
    if (!(moveQty > 0) || !(movePallets > 0)) {
      throw AppError.unprocessable('moveQty and movePallets must be positive numbers');
    }

    const source = await this.getShipment(id);
    const totalQty = Number(source.quantity) || 0;
    const totalPallets = Math.round(Number(source.pallet_qty) || 0) || 1;

    if (moveQty > totalQty) {
      throw AppError.unprocessable(`moveQty ${moveQty} exceeds source quantity ${totalQty}`);
    }
    if (movePallets > totalPallets) {
      throw AppError.unprocessable(`movePallets ${movePallets} exceeds source pallet count ${totalPallets}`);
    }

    const isFullMove = moveQty >= totalQty && movePallets >= totalPallets;

    return transaction(async (client) => {
      const now = new Date();

      if (isFullMove) {
        // Whole shipment moves — just update the receiving_warehouse on the source.
        const updated = await client.query(
          `UPDATE shipments
           SET receiving_warehouse = $1, updated_at = $2, warehouse_since = $2
           WHERE id = $3
           RETURNING *`,
          [destination, now, id]
        );
        return { source: updated.rows[0] as Shipment, split: null };
      }

      // Partial move — reduce source, insert a split row at the destination.
      const remainQty = totalQty - moveQty;
      const remainPallets = Math.max(totalPallets - movePallets, 1);

      const updatedSource = await client.query(
        `UPDATE shipments
         SET quantity = $1, pallet_qty = $2, updated_at = $3
         WHERE id = $4
         RETURNING *`,
        [remainQty, remainPallets, now, id]
      );

      const splitId = `ship_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const splitNote = `Partial move from ${source.receiving_warehouse || 'unknown'}`;

      const insertedSplit = await client.query(
        `INSERT INTO shipments (
          id, supplier, order_ref, final_pod, latest_status, week_number,
          product_name, quantity, cbm, pallet_qty, receiving_warehouse, notes,
          forwarding_agent, incoterm, vessel_name, selected_week_date,
          shipment_type, created_at, updated_at,
          inspection_date, inspection_status, inspection_notes, inspected_by,
          receiving_date, receiving_status, receiving_notes, received_by, received_quantity,
          warehouse_since
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25, $26, $27, $28,
          $29
        ) RETURNING *`,
        [
          splitId,
          source.supplier,
          source.order_ref,
          source.final_pod,
          'stored',
          source.week_number,
          source.product_name,
          moveQty,
          source.cbm,
          movePallets,
          destination,
          splitNote,
          source.forwarding_agent,
          source.incoterm,
          source.vessel_name,
          source.selected_week_date,
          (source as any).shipment_type || 'international',
          now,
          now,
          source.inspection_date,
          source.inspection_status,
          source.inspection_notes,
          source.inspected_by,
          source.receiving_date,
          source.receiving_status,
          source.receiving_notes,
          source.received_by,
          moveQty,
          now,
        ]
      );

      return {
        source: updatedSource.rows[0] as Shipment,
        split: insertedSplit.rows[0] as Shipment,
      };
    });
  }

  /**
   * Mark stored/offsite stock as sold (partial or full).
   * Removes the sold quantity from active storage; a partial sale
   * leaves the remainder in place and records the sold portion as
   * its own 'sold' row for reporting.
   */
  static async sellShipment(
    id: string,
    soldQty: number,
    soldPallets: number,
    notes?: string,
    asoNumber?: string
  ): Promise<{ source: Shipment; sold: Shipment }> {
    if (!(soldQty > 0) || !(soldPallets > 0)) {
      throw AppError.unprocessable('soldQty and soldPallets must be positive numbers');
    }

    const source = await this.getShipment(id);
    const totalQty = Number(source.quantity) || 0;
    const totalPallets = Math.round(Number(source.pallet_qty) || 0) || 1;

    if (soldQty > totalQty) {
      throw AppError.unprocessable(`soldQty ${soldQty} exceeds available quantity ${totalQty}`);
    }
    if (soldPallets > totalPallets) {
      throw AppError.unprocessable(`soldPallets ${soldPallets} exceeds available pallet count ${totalPallets}`);
    }

    const isFullSale = soldQty >= totalQty && soldPallets >= totalPallets;
    const soldNote = notes ? `Sold: ${notes}` : `Sold from ${source.receiving_warehouse || 'unknown'}`;

    return transaction(async (client) => {
      const now = new Date();

      if (isFullSale) {
        const updated = await client.query(
          `UPDATE shipments
           SET latest_status = 'sold', notes = $1, aso_number = $2, updated_at = $3
           WHERE id = $4
           RETURNING *`,
          [soldNote, asoNumber || null, now, id]
        );
        return { source: updated.rows[0] as Shipment, sold: updated.rows[0] as Shipment };
      }

      // Partial sale — reduce source, insert a sold row recording what left storage.
      const remainQty = totalQty - soldQty;
      const remainPallets = Math.max(totalPallets - soldPallets, 1);

      const updatedSource = await client.query(
        `UPDATE shipments
         SET quantity = $1, pallet_qty = $2, updated_at = $3
         WHERE id = $4
         RETURNING *`,
        [remainQty, remainPallets, now, id]
      );

      const soldId = `ship_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const insertedSold = await client.query(
        `INSERT INTO shipments (
          id, supplier, order_ref, final_pod, latest_status, week_number,
          product_name, quantity, cbm, pallet_qty, receiving_warehouse, notes,
          forwarding_agent, incoterm, vessel_name, selected_week_date,
          shipment_type, created_at, updated_at,
          inspection_date, inspection_status, inspection_notes, inspected_by,
          receiving_date, receiving_status, receiving_notes, received_by, received_quantity,
          aso_number
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25, $26, $27, $28,
          $29
        ) RETURNING *`,
        [
          soldId,
          source.supplier,
          source.order_ref,
          source.final_pod,
          'sold',
          source.week_number,
          source.product_name,
          soldQty,
          source.cbm,
          soldPallets,
          source.receiving_warehouse,
          soldNote,
          source.forwarding_agent,
          source.incoterm,
          source.vessel_name,
          source.selected_week_date,
          (source as any).shipment_type || 'international',
          now,
          now,
          source.inspection_date,
          source.inspection_status,
          source.inspection_notes,
          source.inspected_by,
          source.receiving_date,
          source.receiving_status,
          source.receiving_notes,
          source.received_by,
          soldQty,
          asoNumber || null,
        ]
      );

      return {
        source: updatedSource.rows[0] as Shipment,
        sold: insertedSold.rows[0] as Shipment,
      };
    });
  }

  // ─── File-based archive operations (migrated from shipmentsController.js) ───

  /**
   * Get list of file-based archives with metadata
   */
  static async getFileArchives(): Promise<FileArchiveInfo[]> {
    const fileNames = await archiveService.getArchivedFiles();
    const archives = await Promise.all(
      fileNames.map(async (fileName) => {
        const stats = await archiveService.getArchivedData(fileName);
        return {
          fileName,
          archivedAt: stats?.archivedAt,
          totalShipments: stats?.totalShipments || 0
        };
      })
    );
    return archives;
  }

  /**
   * Get specific archive data by filename
   */
  static async getFileArchiveData(fileName: string): Promise<FileArchiveData> {
    const archiveData = await archiveService.getArchivedData(fileName);
    if (!archiveData) {
      throw AppError.notFound(`Archive '${fileName}' not found`);
    }
    return archiveData;
  }

  /**
   * Update archive data
   */
  static async updateFileArchive(
    fileName: string,
    data: Partial<Shipment>[]
  ): Promise<{ fileName: string; totalShipments: number }> {
    if (!data || !Array.isArray(data)) {
      throw AppError.unprocessable('Invalid data format: expected an array');
    }
    return archiveService.updateArchiveData(fileName, data);
  }

  /**
   * Rename archive
   */
  static async renameFileArchive(
    fileName: string,
    newName: string
  ): Promise<{ oldFileName: string; newFileName: string; customName: string }> {
    if (!newName || newName.trim() === '') {
      throw AppError.unprocessable('New name is required');
    }
    return archiveService.renameArchiveFile(fileName, newName.trim());
  }

  // ─── Bulk import (migrated from shipmentsController.js) ───

  /**
   * Bulk import shipments, skipping duplicates by order_ref.
   * Runs inside a transaction for atomicity.
   */
  static async bulkImport(
    shipmentsData: BulkImportShipment[]
  ): Promise<{ imported: number; skipped: number; skippedRefs: string[]; importedRefs: string[]; emptyRows: number }> {
    // Filter out empty rows (no supplier)
    const validData = shipmentsData.filter(s => s.supplier && s.supplier.trim());
    const emptyRows = shipmentsData.length - validData.length;

    return transaction(async (client) => {
      // Get existing order_refs to skip duplicates
      const existingResult = await client.query(
        'SELECT order_ref FROM shipments WHERE order_ref IS NOT NULL'
      );
      const existingRefs = new Set(existingResult.rows.map((r: any) => r.order_ref));

      // Split incoming shipments into new vs duplicates
      const newShipments = validData.filter(s => !s.orderRef || !existingRefs.has(s.orderRef));
      const skippedShipments = validData.filter(s => s.orderRef && existingRefs.has(s.orderRef));
      const skipped = skippedShipments.length;
      const skippedRefs = skippedShipments.map(s => s.orderRef);

      // Insert only new shipments
      for (const shipment of newShipments) {
        const id = shipment.id || `ship_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await client.query(
          `INSERT INTO shipments (
            id, supplier, order_ref, final_pod, latest_status, week_number,
            product_name, quantity, cbm, pallet_qty, receiving_warehouse, notes, updated_at,
            forwarding_agent, incoterm, vessel_name, bol_number, selected_week_date,
            reminder_date, reminder_note, shipment_type,
            original_week_number, original_selected_week_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
          [
            id,
            shipment.supplier,
            shipment.orderRef || null,
            shipment.finalPod || null,
            shipment.latestStatus || null,
            shipment.weekNumber || null,
            shipment.productName || null,
            shipment.quantity || null,
            shipment.cbm || null,
            shipment.palletQty || null,
            shipment.receivingWarehouse || null,
            shipment.notes || null,
            shipment.updatedAt || new Date().toISOString(),
            shipment.forwardingAgent || null,
            shipment.incoterm || null,
            shipment.vesselName || null,
            shipment.bolNumber || null,
            shipment.selectedWeekDate || null,
            shipment.reminderDate || null,
            shipment.reminderNote || null,
            shipment.shipmentType || 'international',
            // Captured once at import and never updated afterward — see
            // original_week_number comment in createShipment.
            shipment.weekNumber || null,
            shipment.selectedWeekDate || null
          ]
        );
      }

      return {
        imported: newShipments.length,
        skipped,
        skippedRefs,
        importedRefs: newShipments.map(s => s.orderRef || 'N/A'),
        emptyRows,
      };
    });
  }

  // ─── Full-text search (migrated from inline route handler) ───

  /**
   * Full-text search across shipments using PostgreSQL ts_vector + ILIKE fallback
   */
  static async searchShipments(
    q: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<SearchResult> {
    if (!q.trim()) {
      return { data: [], total: 0, query: q };
    }

    const cappedLimit = Math.min(limit, 100);

    const dataRows = await queryAll(
      `SELECT *, ts_rank(search_vector, plainto_tsquery('english', $1)) AS rank
       FROM shipments
       WHERE search_vector @@ plainto_tsquery('english', $1)
          OR order_ref ILIKE $2
          OR supplier ILIKE $2
          OR product_name ILIKE $2
          OR vessel_name ILIKE $2
       ORDER BY rank DESC, updated_at DESC
       LIMIT $3 OFFSET $4`,
      [q, `%${q}%`, cappedLimit, offset]
    );

    const countRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*) FROM shipments
       WHERE search_vector @@ plainto_tsquery('english', $1)
          OR order_ref ILIKE $2
          OR supplier ILIKE $2
          OR product_name ILIKE $2
          OR vessel_name ILIKE $2`,
      [q, `%${q}%`]
    );

    return {
      data: dataRows,
      total: parseInt(countRow?.count || '0', 10),
      query: q
    };
  }
}

export default ShipmentController;
