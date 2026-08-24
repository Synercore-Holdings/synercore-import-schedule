// server/middleware/validation.js
import { body, param, query, validationResult } from 'express-validator';

// Middleware to check validation results
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorArray = errors.array();
    console.error('[VALIDATION] Request failed validation:', {
      method: req.method,
      path: req.path,
      body: req.body,
      errors: errorArray
    });
    return res.status(400).json({
      error: 'Validation failed',
      details: errorArray.map(e => ({
        field: e.param,
        msg: e.msg,
        value: e.value
      }))
    });
  }
  next();
};

// Common validation rules
export const validateEmail = body('email')
  .optional()
  .isEmail()
  .withMessage('Must be a valid email address')
  .normalizeEmail();

export const validatePassword = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters long')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
  .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');

export const validateUsername = body('username')
  .isLength({ min: 3, max: 50 })
  .withMessage('Username must be between 3 and 50 characters')
  .matches(/^[a-zA-Z0-9_-]+$/)
  .withMessage('Username can only contain letters, numbers, hyphens, and underscores');

// Auth validation rules
export const validateRegister = [
  validateUsername,
  validateEmail,
  validatePassword,
  body('fullName')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Full name must be less than 100 characters')
    .trim(),
  validate
];

export const validateLogin = [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

export const validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  validate
];

export const validateUserUpdate = [
  param('id').notEmpty().withMessage('User ID is required').trim(),
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, hyphens, and underscores'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('fullName')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Full name must be less than 100 characters')
    .trim(),
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Role must be either "user" or "admin"'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  validate
];

export const validateResetPassword = [
  param('id').notEmpty().withMessage('User ID is required').trim(),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  validate
];

// Shipment validation rules
export const validateShipmentCreate = [
  body('orderRef')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Order reference must be less than 100 characters')
    .trim(),
  body('supplier')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Supplier must be less than 100 characters')
    .trim(),
  body('quantity')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Quantity must be a positive number'),
  body('cbm')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('CBM must be a positive number'),
  body('palletQty')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Pallet quantity must be a positive number'),
  body('weekNumber')
    .optional()
    .isInt({ min: 1, max: 53 })
    .withMessage('Week number must be between 1 and 53'),
  body('finalPod')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Final POD must be less than 100 characters')
    .trim(),
  body('latestStatus')
    .optional()
    .isIn([
      // Frontend statuses - matches src/types/shipment.js ShipmentStatus
      'planned_airfreight',
      'planned_seafreight',
      'in_transit_airfreight',
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
      // Post-arrival workflow states
      'unloading',
      'inspection_pending',
      'inspecting',
      'inspection_failed',
      'inspection_passed',
      'receiving',
      'received',
      'stored'
    ])
    .withMessage('Invalid status'),
  validate
];

// Supplier validation rules
export const validateSupplierCreate = [
  body('name')
    .notEmpty()
    .withMessage('Supplier name is required')
    .isLength({ max: 200 })
    .withMessage('Supplier name must be less than 200 characters')
    .trim(),
  body('contactPerson')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Contact person must be less than 100 characters')
    .trim(),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('phone')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Phone must be less than 50 characters')
    .trim(),
  body('address')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters')
    .trim(),
  validate
];

export const validateSupplierUpdate = [
  param('id').notEmpty().withMessage('Supplier ID is required').trim(),
  body('name')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Supplier name must be less than 200 characters')
    .trim(),
  body('contactPerson')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Contact person must be less than 100 characters')
    .trim(),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('phone')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Phone must be less than 50 characters')
    .trim(),
  body('address')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters')
    .trim(),
  body('country')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Country must be less than 100 characters')
    .trim(),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters')
    .trim(),
  validate
];

// Warehouse capacity validation
export const validateWarehouseCapacity = [
  param('warehouseName')
    .notEmpty()
    .withMessage('Warehouse name is required')
    .isLength({ max: 100 })
    .withMessage('Warehouse name must be less than 100 characters')
    .trim(),
  body('binsUsed')
    .isInt({ min: 0 })
    .withMessage('Bins used must be a non-negative integer'),
  body('capacity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Capacity must be a positive integer'),
  validate
];

// Query parameter validation
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  validate
];

export const validateShipmentQuery = [
  query('sortBy')
    .optional()
    .isIn([
      'updated_at',
      'created_at',
      'estimatedArrival',
      'orderRef',
      'supplier',
      'finalPod',
      'latestStatus',
      'weekNumber',
      'productName',
      'quantity',
      'cbm',
      'palletQty',
      'receivingWarehouse',
      'forwardingAgent',
      'vesselName'
    ])
    .withMessage('Invalid sort field'),
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc'),
  query('status')
    .optional()
    .isIn([
      // Frontend statuses - matches src/types/shipment.js ShipmentStatus
      'planned_airfreight',
      'planned_seafreight',
      'in_transit_airfreight',
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
      // Post-arrival workflow states
      'unloading',
      'inspection_pending',
      'inspecting',
      'inspection_failed',
      'inspection_passed',
      'receiving',
      'received',
      'stored'
    ])
    .withMessage('Invalid status'),
  validate
];

// ID validation
export const validateId = [
  param('id')
    .notEmpty()
    .withMessage('ID is required')
    .trim(),
  validate
];

// Quote validation rules
export const validateQuoteCreate = [
  body('forwarder')
    .notEmpty()
    .withMessage('Forwarder is required')
    .isIn(['dhl', 'dsv', 'afrigistics'])
    .withMessage('Forwarder must be one of: dhl, dsv, afrigistics')
    .trim(),
  body('fileName')
    .notEmpty()
    .withMessage('File name is required')
    .isLength({ max: 255 })
    .withMessage('File name must be less than 255 characters'),
  validate
];

// Notification validation rules
export const validateNotificationCreate = [
  body('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .trim(),
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ max: 1000 })
    .withMessage('Message must be less than 1000 characters'),
  body('type')
    .optional()
    .isIn(['info', 'warning', 'error', 'success'])
    .withMessage('Type must be one of: info, warning, error, success'),
  validate
];

// Email import validation rules
export const validateEmailImportConfig = [
  body('host')
    .notEmpty()
    .withMessage('Email host is required')
    .isLength({ max: 255 })
    .withMessage('Host must be less than 255 characters'),
  body('user')
    .notEmpty()
    .withMessage('Email user is required')
    .isEmail()
    .withMessage('User must be a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('port')
    .optional()
    .isInt({ min: 1, max: 65535 })
    .withMessage('Port must be between 1 and 65535'),
  validate
];

// Warehouse capacity validation
export const validateWarehouseCapacityUpdate = [
  body('binsUsed')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Bins used must be a non-negative integer'),
  body('capacity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Capacity must be a positive integer'),
  validate
];

export const validateWarehouseTotalCapacityUpdate = [
  param('warehouseName')
    .notEmpty()
    .withMessage('Warehouse name is required')
    .isLength({ max: 100 })
    .withMessage('Warehouse name must be less than 100 characters')
    .trim(),
  body('totalCapacity')
    .isInt({ min: 0 })
    .withMessage('Total capacity must be a non-negative integer'),
  validate
];

// Scheduler validation rules
export const validateSchedulerConfig = [
  body('jobName')
    .notEmpty()
    .withMessage('Job name is required')
    .isLength({ max: 255 })
    .withMessage('Job name must be less than 255 characters'),
  body('cronExpression')
    .notEmpty()
    .withMessage('Cron expression is required')
    .isLength({ max: 100 })
    .withMessage('Cron expression must be less than 100 characters'),
  body('enabled')
    .optional()
    .isBoolean()
    .withMessage('Enabled must be a boolean'),
  validate
];
