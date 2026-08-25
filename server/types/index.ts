/**
 * Central type definitions for Synercore Import Schedule
 * Provides shared types across server, database, and API
 */

/**
 * User roles in the system
 */
export type UserRole = 'user' | 'admin' | 'supplier';

/**
 * Shipment status progression through warehouse
 */
export type ShipmentStatus =
  | 'planned_airfreight'
  | 'planned_seafreight'
  | 'in_transit_airfreight'
  | 'air_customs_clearance'
  | 'in_transit_roadway'
  | 'in_transit_seaway'
  | 'in_transit_last_mile'
  | 'moored'
  | 'berth_working'
  | 'berth_complete'
  | 'gated_in_port'
  | 'arrived_pta'
  | 'arrived_klm'
  | 'arrived_offsite'
  | 'delayed'
  | 'cancelled'
  | 'unloading'
  | 'inspection_pending'
  | 'inspecting'
  | 'inspection_passed'
  | 'inspection_failed'
  | 'receiving'
  | 'received'
  | 'stored'
  | 'archived'
  | 'sold';

/**
 * Notification types
 */
export type NotificationType = 'info' | 'warning' | 'error' | 'success';

/**
 * Notification status
 */
export type NotificationStatus = 'unread' | 'read';

/**
 * User database model
 */
export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  supplier_id?: string;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
}

/**
 * User in API responses (without password)
 */
export interface UserResponse {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  supplier_id?: string;
  created_at: string;
}

/**
 * Supplier database model
 */
export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone?: string;
  country?: string;
  contact_person?: string;
  payment_terms?: string;
  performance_rating?: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Shipment database model
 */
export interface Shipment {
  id: string;
  order_ref: string;
  supplier_id?: string;
  supplier: string;
  quantity: number;
  latest_status: ShipmentStatus;
  week_number?: number;
  selected_week_date?: Date;
  original_week_number?: number;
  original_selected_week_date?: Date;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  archived_at?: Date;
  // Post-arrival workflow fields
  unloading_start_date?: Date;
  unloading_completed_date?: Date;
  inspection_date?: Date;
  inspection_status?: string;
  inspection_notes?: string;
  inspected_by?: string;
  receiving_date?: Date;
  actual_arrival_date?: Date;
  warehouse_since?: Date;
  receiving_status?: string;
  receiving_notes?: string;
  received_by?: string;
  received_quantity?: number;
  discrepancies?: string;
  // Rejection/Return workflow fields
  rejection_date?: Date;
  rejection_reason?: string;
  rejected_by?: string;
  // Rejection claim tracking fields (supplier credit/refund follow-up)
  claim_status?: string;
  claim_reference?: string;
  claim_notes?: string;
  claim_updated_at?: Date;
  claim_updated_by?: string;
  // Reminder fields
  reminder_date?: string | null;
  reminder_note?: string | null;
  // Shipment type
  shipment_type?: 'international' | 'local';
}

/**
 * Quote database model
 */
export interface Quote {
  id: string;
  supplier_id: string;
  product_name: string;
  quantity: number;
  price: number;
  currency?: string;
  valid_until?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Warehouse capacity database model
 */
export interface WarehouseCapacity {
  id: string;
  location: string;
  total_capacity: number;
  available_bins: number;
  used_capacity: number;
  last_updated: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Notification database model
 */
export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  message: string;
  status: NotificationStatus;
  related_shipment_id?: string;
  created_at: Date;
  read_at?: Date;
}

/**
 * Refresh token database model
 */
export interface RefreshToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  created_at: Date;
}

/**
 * Authentication tokens
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * JWT payload for access token
 */
export interface JwtPayload {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Express Request with user authentication
 */
export interface AuthenticatedRequest {
  user?: JwtPayload;
  requestId?: string;
}

/**
 * API Error response
 */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: Record<string, any>;
  timestamp: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Standard API response
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

/**
 * Email configuration
 */
export interface EmailConfig {
  emailAddress: string;
  password: string;
  host: string;
  port: number;
  tls?: boolean;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  time?: string;
}

/**
 * Validation error details
 */
export interface ValidationErrorDetails {
  field: string;
  message: string;
  value?: any;
}

/**
 * Log context for structured logging
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  timestamp?: string;
  [key: string]: any;
}

/**
 * Database query result wrapper
 */
export interface DbResult<T> {
  rows: T[];
  rowCount: number;
}

/**
 * Supplier performance metrics
 */
export interface SupplierMetrics {
  supplierId: string;
  supplierName: string;
  totalShipments: number;
  onTimeDeliveries: number;
  defectiveItems: number;
  averageRating: number;
}

/**
 * Report filter options
 */
export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  status?: ShipmentStatus;
  supplier?: string;
  type?: 'shipments' | 'suppliers' | 'weekly' | 'monthly';
}

/**
 * Archive database model
 */
export interface Archive {
  id?: string;
  file_name: string;
  archived_at: Date;
  total_shipments: number;
  data: any;
}

/**
 * Archive statistics
 */
export interface ArchiveStats {
  eligibleForArchive: number;
  totalArrived: number;
  eligibleShipments: Array<{
    id: string;
    supplier: string;
    orderRef: string;
    arrivedDate: Date;
    daysOld: number;
  }>;
}

/**
 * Archive result
 */
export interface ArchiveResult {
  archived: number;
  remaining: Shipment[];
  archiveFileName?: string;
}

/**
 * WebSocket events and data structures
 */

/**
 * Ship viewing metadata
 */
export interface ShipmentViewer {
  userId?: string | null;
  socketId: string;
  timestamp: string;
}

/**
 * Shipment update event data
 */
export interface ShipmentUpdateEvent {
  shipmentId: string;
  status?: string;
  statusChangedAt?: Date;
  changedBy?: string;
  shipment?: Partial<Shipment>;
  inspectionStatus?: string;
  inventory?: {
    pallets: number;
    cartons: number;
    items: number;
    weight: number;
    warehouseLocation: string;
  };
  rejectionReason?: string;
  rejectionDetails?: any;
  timestamp: string;
}

/**
 * Document upload event data
 */
export interface DocumentUploadEvent {
  id: string;
  fileName: string;
  documentType: string;
  fileSize?: number;
  uploadedAt: Date;
  uploadedBy: string;
  isVerified: boolean;
  uploadedBySupplier?: boolean;
  timestamp: string;
}

/**
 * Warehouse capacity event data
 */
export interface WarehouseCapacityEvent {
  location: string;
  totalCapacity: number;
  availableBins: number;
  usedCapacity: number;
  timestamp: string;
}

/**
 * User viewing notification
 */
export interface UserViewingNotification {
  userId?: string | null;
  socketId: string;
  timestamp: string;
}

/**
 * User disconnected notification
 */
export interface UserDisconnectedNotification {
  userId?: string | null;
  socketId: string;
  viewersCount: number;
  timestamp: string;
}

/**
 * Socket context with authentication
 */
export interface AuthenticatedSocket {
  userId?: string | null;
  userRole: 'user' | 'admin' | 'supplier' | 'guest';
  socketId: string;
}
