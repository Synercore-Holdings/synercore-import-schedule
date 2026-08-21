export const ShipmentStatus = {
  PLANNED_AIRFREIGHT: 'planned_airfreight',
  PLANNED_SEAFREIGHT: 'planned_seafreight',
  IN_TRANSIT_AIRFREIGHT: 'in_transit_airfreight',
  AIR_CUSTOMS_CLEARANCE: 'air_customs_clearance',
  IN_TRANSIT_ROADWAY: 'in_transit_roadway',
  IN_TRANSIT_SEAWAY: 'in_transit_seaway',
  MOORED: 'moored',
  BERTH_WORKING: 'berth_working',
  BERTH_COMPLETE: 'berth_complete',
  GATED_IN_PORT: 'gated_in_port',
  ARRIVED_PTA: 'arrived_pta',
  ARRIVED_KLM: 'arrived_klm',
  ARRIVED_OFFSITE: 'arrived_offsite',
  DELAYED_PORT: 'delayed_port',
  DELAYED_CUSTOMS: 'delayed_customs',
  DELAYED_DOCUMENTS: 'delayed_documents',
  DELAYED_SUPPLIER: 'delayed_supplier',
  CANCELLED: 'cancelled',
  // Post-arrival workflow states
  UNLOADING: 'unloading',
  INSPECTION_PENDING: 'inspection_pending',
  INSPECTING: 'inspecting',
  INSPECTION_FAILED: 'inspection_failed',
  INSPECTION_PASSED: 'inspection_passed',
  RECEIVING: 'receiving',
  RECEIVED: 'received',
  STORED: 'stored',
  ARCHIVED: 'archived',
  SOLD: 'sold'
};

export const InspectionStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  PASSED: 'passed',
  FAILED: 'failed',
  REQUIRES_REVIEW: 'requires_review'
};

export const ReceivingStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  PARTIAL: 'partial',
  COMPLETED: 'completed',
  DISCREPANCY: 'discrepancy'
};

export const ShipmentPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// ========== Centralized Status Groups ==========
// Use these instead of defining ad-hoc status arrays in components.

/** All delayed sub-type statuses */
export const DELAYED_STATUSES = [
  ShipmentStatus.DELAYED_PORT,
  ShipmentStatus.DELAYED_CUSTOMS,
  ShipmentStatus.DELAYED_DOCUMENTS,
  ShipmentStatus.DELAYED_SUPPLIER,
];

/** Check if a status is any delayed sub-type */
export const isDelayedStatus = (status) => DELAYED_STATUSES.includes(status);

/** Statuses for shipments in the post-arrival workflow */
export const POST_ARRIVAL_STATUSES = [
  ShipmentStatus.ARRIVED_PTA,
  ShipmentStatus.ARRIVED_KLM,
  ShipmentStatus.ARRIVED_OFFSITE,
  ShipmentStatus.UNLOADING,
  ShipmentStatus.INSPECTION_PENDING,
  ShipmentStatus.INSPECTING,
  ShipmentStatus.INSPECTION_PASSED,
  ShipmentStatus.INSPECTION_FAILED,
  ShipmentStatus.RECEIVING,
  ShipmentStatus.RECEIVED,
];

/** Statuses that are actively in-transit (shown in shipping schedule) */
export const IN_TRANSIT_STATUSES = [
  ShipmentStatus.PLANNED_AIRFREIGHT,
  ShipmentStatus.PLANNED_SEAFREIGHT,
  ShipmentStatus.IN_TRANSIT_AIRFREIGHT,
  ShipmentStatus.AIR_CUSTOMS_CLEARANCE,
  ShipmentStatus.IN_TRANSIT_ROADWAY,
  ShipmentStatus.IN_TRANSIT_SEAWAY,
  ShipmentStatus.MOORED,
  ShipmentStatus.BERTH_WORKING,
  ShipmentStatus.BERTH_COMPLETE,
  ShipmentStatus.GATED_IN_PORT,
  ...DELAYED_STATUSES,
];

/** Arrival statuses only (subset of post-arrival) */
export const ARRIVAL_STATUSES = [
  ShipmentStatus.ARRIVED_PTA,
  ShipmentStatus.ARRIVED_KLM,
  ShipmentStatus.ARRIVED_OFFSITE,
];

/** Pre-arrival statuses used for overdue detection */
export const PRE_ARRIVAL_STATUSES = [
  ShipmentStatus.PLANNED_AIRFREIGHT,
  ShipmentStatus.PLANNED_SEAFREIGHT,
  ShipmentStatus.IN_TRANSIT_AIRFREIGHT,
  ShipmentStatus.AIR_CUSTOMS_CLEARANCE,
  ShipmentStatus.IN_TRANSIT_ROADWAY,
  ShipmentStatus.IN_TRANSIT_SEAWAY,
  ShipmentStatus.MOORED,
  ShipmentStatus.BERTH_WORKING,
  ShipmentStatus.BERTH_COMPLETE,
  ShipmentStatus.GATED_IN_PORT,
];

/** Current week number (non-ISO, matches Dashboard formula) */
export const getCurrentWeek = () => {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  return Math.ceil((((now - yearStart) / 86400000) + yearStart.getDay() + 1) / 7);
};

/**
 * Check if a shipment is overdue (pre-arrival + past its scheduled week).
 * Prefers selectedWeekDate (a real date) over comparing raw week numbers,
 * since a week number alone can't tell week 1 of next year apart from week 1
 * of the current year — a bare `weekNumber < currentWeek` check flags a
 * shipment planned for early next year as already overdue.
 */
export const isOverdue = (shipment, currentWeek) => {
  const status = shipment.latestStatus || shipment.latest_status;
  if (!PRE_ARRIVAL_STATUSES.includes(status)) return false;

  const weekDate = shipment.selectedWeekDate || shipment.selected_week_date;
  if (weekDate) {
    const d = new Date(weekDate);
    if (!isNaN(d)) {
      const weekEnd = new Date(d);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return weekEnd < new Date();
    }
  }

  // Fallback when no selectedWeekDate is set — still year-ambiguous.
  const wk = parseInt(shipment.weekNumber || shipment.week_number) || 0;
  return wk > 0 && currentWeek != null && wk < currentWeek;
};

/** Statuses hidden from the shipping schedule */
export const SHIPPING_EXCLUDED_STATUSES = [
  ...POST_ARRIVAL_STATUSES,
  ShipmentStatus.STORED,
  ShipmentStatus.ARCHIVED,
  ShipmentStatus.SOLD,
];

/** All valid status values (for validation) */
export const ALL_STATUSES = Object.values(ShipmentStatus);

// ========== Centralized Status Labels ==========

export const STATUS_LABELS = {
  [ShipmentStatus.PLANNED_AIRFREIGHT]: 'Planned Airfreight',
  [ShipmentStatus.PLANNED_SEAFREIGHT]: 'Planned Seafreight',
  [ShipmentStatus.IN_TRANSIT_AIRFREIGHT]: 'In Transit Air',
  [ShipmentStatus.AIR_CUSTOMS_CLEARANCE]: 'Air Customs Clearance',
  [ShipmentStatus.IN_TRANSIT_ROADWAY]: 'In Transit Road',
  [ShipmentStatus.IN_TRANSIT_SEAWAY]: 'In Transit Sea',
  [ShipmentStatus.MOORED]: 'Moored',
  [ShipmentStatus.BERTH_WORKING]: 'Berth Working',
  [ShipmentStatus.BERTH_COMPLETE]: 'Berth Complete',
  [ShipmentStatus.GATED_IN_PORT]: 'Gated In Port',
  [ShipmentStatus.ARRIVED_PTA]: 'Arrived PTA',
  [ShipmentStatus.ARRIVED_KLM]: 'Arrived KLM',
  [ShipmentStatus.ARRIVED_OFFSITE]: 'Arrived Offsite',
  [ShipmentStatus.DELAYED_PORT]: 'Delayed - Port',
  [ShipmentStatus.DELAYED_CUSTOMS]: 'Delayed - Customs',
  [ShipmentStatus.DELAYED_DOCUMENTS]: 'Delayed - Documents',
  [ShipmentStatus.DELAYED_SUPPLIER]: 'Delayed - Supplier',
  [ShipmentStatus.CANCELLED]: 'Cancelled',
  [ShipmentStatus.UNLOADING]: 'Unloading',
  [ShipmentStatus.INSPECTION_PENDING]: 'Inspection Pending',
  [ShipmentStatus.INSPECTING]: 'Inspecting',
  [ShipmentStatus.INSPECTION_PASSED]: 'Inspection Passed',
  [ShipmentStatus.INSPECTION_FAILED]: 'Inspection Failed',
  [ShipmentStatus.RECEIVING]: 'Receiving',
  [ShipmentStatus.RECEIVED]: 'Received',
  [ShipmentStatus.STORED]: 'Stored',
  [ShipmentStatus.ARCHIVED]: 'Archived',
  [ShipmentStatus.SOLD]: 'Sold',
};

// ========== Centralized Status Colors ==========

export const STATUS_COLORS = {
  [ShipmentStatus.PLANNED_AIRFREIGHT]: '#6c757d',
  [ShipmentStatus.PLANNED_SEAFREIGHT]: '#6c757d',
  [ShipmentStatus.IN_TRANSIT_AIRFREIGHT]: '#ffc107',
  [ShipmentStatus.AIR_CUSTOMS_CLEARANCE]: '#fd7e14',
  [ShipmentStatus.IN_TRANSIT_ROADWAY]: '#ffc107',
  [ShipmentStatus.IN_TRANSIT_SEAWAY]: '#ffc107',
  [ShipmentStatus.MOORED]: '#AB47BC',
  [ShipmentStatus.BERTH_WORKING]: '#8E24AA',
  [ShipmentStatus.BERTH_COMPLETE]: '#17a2b8',
  [ShipmentStatus.GATED_IN_PORT]: '#0097A7',
  [ShipmentStatus.ARRIVED_PTA]: '#28a745',
  [ShipmentStatus.ARRIVED_KLM]: '#28a745',
  [ShipmentStatus.ARRIVED_OFFSITE]: '#28a745',
  [ShipmentStatus.DELAYED_PORT]: '#dc3545',
  [ShipmentStatus.DELAYED_CUSTOMS]: '#c62828',
  [ShipmentStatus.DELAYED_DOCUMENTS]: '#e65100',
  [ShipmentStatus.DELAYED_SUPPLIER]: '#d32f2f',
  [ShipmentStatus.CANCELLED]: '#9E9E9E',
  [ShipmentStatus.UNLOADING]: '#FF9800',
  [ShipmentStatus.INSPECTION_PENDING]: '#9C27B0',
  [ShipmentStatus.INSPECTING]: '#673AB7',
  [ShipmentStatus.INSPECTION_PASSED]: '#4CAF50',
  [ShipmentStatus.INSPECTION_FAILED]: '#dc3545',
  [ShipmentStatus.RECEIVING]: '#00BCD4',
  [ShipmentStatus.RECEIVED]: '#8BC34A',
  [ShipmentStatus.STORED]: '#007bff',
  [ShipmentStatus.ARCHIVED]: '#6c757d',
  [ShipmentStatus.SOLD]: '#059669',
};

export const Incoterms = {
  EXW: 'EXW', // Ex Works
  FCA: 'FCA', // Free Carrier
  CPT: 'CPT', // Carriage Paid To
  CIP: 'CIP', // Carriage and Insurance Paid To
  DAP: 'DAP', // Delivered At Place
  DPU: 'DPU', // Delivered At Place Unloaded
  DDP: 'DDP', // Delivered Duty Paid
  FAS: 'FAS', // Free Alongside Ship
  FOB: 'FOB', // Free On Board
  CFR: 'CFR', // Cost and Freight
  CIF: 'CIF'  // Cost, Insurance and Freight
};

export class Shipment {
  constructor({
    id,
    supplier,
    orderRef,
    finalPod,
    latestStatus = ShipmentStatus.PLANNED_AIRFREIGHT,
    weekNumber,
    selectedWeekDate = null,
    productName,
    quantity,
    palletQty = 0,
    receivingWarehouse,
    forwardingAgent = '',
    vesselName = '',
    incoterm = '',
    priority = ShipmentPriority.MEDIUM,
    notes = '',
    // Post-arrival workflow fields
    inspectionStatus = InspectionStatus.NOT_STARTED,
    receivingStatus = ReceivingStatus.NOT_STARTED,
    inspectionNotes = '',
    receivingNotes = '',
    inspectedBy = '',
    receivedBy = '',
    inspectionDate = null,
    receivingDate = null,
    actualArrivalDate = null,
    receivedQuantity = null,
    discrepancies = [],
    unloadingStartDate = null,
    unloadingCompletedDate = null,
    // Reminder fields
    reminderDate = null,
    reminderNote = ''
  }) {
    this.id = id;
    this.supplier = supplier;
    this.orderRef = orderRef;
    this.finalPod = finalPod;
    this.latestStatus = latestStatus;
    this.weekNumber = weekNumber;
    this.selectedWeekDate = selectedWeekDate;
    this.productName = productName;
    this.quantity = quantity;
    this.palletQty = palletQty;
    this.receivingWarehouse = receivingWarehouse;
    this.forwardingAgent = forwardingAgent;
    this.vesselName = vesselName;
    this.incoterm = incoterm;
    this.priority = priority;
    this.notes = notes;

    // Post-arrival workflow fields
    this.inspectionStatus = inspectionStatus;
    this.receivingStatus = receivingStatus;
    this.inspectionNotes = inspectionNotes;
    this.receivingNotes = receivingNotes;
    this.inspectedBy = inspectedBy;
    this.receivedBy = receivedBy;
    this.inspectionDate = inspectionDate;
    this.receivingDate = receivingDate;
    this.actualArrivalDate = actualArrivalDate;
    this.receivedQuantity = receivedQuantity;
    this.discrepancies = discrepancies;
    this.unloadingStartDate = unloadingStartDate;
    this.unloadingCompletedDate = unloadingCompletedDate;

    // Reminder fields
    this.reminderDate = reminderDate;
    this.reminderNote = reminderNote;

    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  updateStatus(newStatus) {
    this.latestStatus = newStatus;
    this.updatedAt = new Date();
  }

  isDelayed() {
    return DELAYED_STATUSES.includes(this.latestStatus);
  }

  isArrived() {
    return this.latestStatus === ShipmentStatus.ARRIVED_PTA || this.latestStatus === ShipmentStatus.ARRIVED_KLM || this.latestStatus === ShipmentStatus.ARRIVED_OFFSITE;
  }

  isInPostArrivalWorkflow() {
    const postArrivalStates = [
      ShipmentStatus.UNLOADING,
      ShipmentStatus.INSPECTION_PENDING,
      ShipmentStatus.INSPECTING,
      ShipmentStatus.INSPECTION_FAILED,
      ShipmentStatus.INSPECTION_PASSED,
      ShipmentStatus.RECEIVING,
      ShipmentStatus.RECEIVED,
      ShipmentStatus.STORED
    ];
    return postArrivalStates.includes(this.latestStatus);
  }

  startUnloading() {
    this.latestStatus = ShipmentStatus.UNLOADING;
    this.unloadingStartDate = new Date();
    this.updatedAt = new Date();
  }

  completeUnloading() {
    this.latestStatus = ShipmentStatus.INSPECTION_PENDING;
    this.unloadingCompletedDate = new Date();
    this.updatedAt = new Date();
  }

  startInspection(inspectedBy = '') {
    this.latestStatus = ShipmentStatus.INSPECTING;
    this.inspectionStatus = InspectionStatus.IN_PROGRESS;
    this.inspectedBy = inspectedBy;
    this.inspectionDate = new Date();
    this.updatedAt = new Date();
  }

  completeInspection(passed = true, notes = '', inspectedBy = '') {
    this.inspectionStatus = passed ? InspectionStatus.PASSED : InspectionStatus.FAILED;
    this.latestStatus = passed ? ShipmentStatus.INSPECTION_PASSED : ShipmentStatus.INSPECTION_FAILED;
    this.inspectionNotes = notes;
    if (inspectedBy) this.inspectedBy = inspectedBy;
    this.updatedAt = new Date();
  }

  startReceiving(receivedBy = '') {
    this.latestStatus = ShipmentStatus.RECEIVING;
    this.receivingStatus = ReceivingStatus.IN_PROGRESS;
    this.receivedBy = receivedBy;
    this.receivingDate = new Date();
    this.updatedAt = new Date();
  }

  completeReceiving(receivedQuantity, notes = '', receivedBy = '', discrepancies = []) {
    this.receivedQuantity = receivedQuantity;
    this.receivingNotes = notes;
    this.discrepancies = discrepancies;
    if (receivedBy) this.receivedBy = receivedBy;

    if (discrepancies.length > 0) {
      this.receivingStatus = ReceivingStatus.DISCREPANCY;
    } else if (receivedQuantity < this.quantity) {
      this.receivingStatus = ReceivingStatus.PARTIAL;
    } else {
      this.receivingStatus = ReceivingStatus.COMPLETED;
      this.latestStatus = ShipmentStatus.RECEIVED;
    }
    this.updatedAt = new Date();
  }

  markAsStored() {
    this.latestStatus = ShipmentStatus.STORED;
    this.updatedAt = new Date();
  }

  getCurrentWeek() {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.ceil((((now - yearStart) / 86400000) + yearStart.getDay() + 1) / 7);
    return weekNumber;
  }

  getWorkflowProgress() {
    const states = [
      ShipmentStatus.ARRIVED_PTA,
      ShipmentStatus.ARRIVED_KLM,
      ShipmentStatus.UNLOADING,
      ShipmentStatus.INSPECTION_PENDING,
      ShipmentStatus.INSPECTING,
      ShipmentStatus.INSPECTION_PASSED,
      ShipmentStatus.RECEIVING,
      ShipmentStatus.RECEIVED,
      ShipmentStatus.STORED
    ];

    const currentIndex = states.indexOf(this.latestStatus);
    return {
      currentStep: currentIndex + 1,
      totalSteps: states.length,
      percentage: Math.round(((currentIndex + 1) / states.length) * 100)
    };
  }
}