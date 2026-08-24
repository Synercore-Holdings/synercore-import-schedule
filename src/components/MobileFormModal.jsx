import React, { useState } from 'react';
import './MobileFormModal.css';

/**
 * Mobile Form Modal Component
 *
 * A bottom-sheet style modal optimized for mobile forms
 * Features:
 * - Slide-up animation from bottom
 * - Touch-friendly form inputs
 * - Keyboard-aware positioning
 * - Simple form validation
 * - Loading and error states
 */

export function MobileFormModal({
  title,
  isOpen,
  onClose,
  onSubmit,
  children,
  loading = false,
  error = null,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel'
}) {
  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="mobile-modal-backdrop" onClick={handleBackdropClick} aria-modal="true" role="dialog">
      <div className="mobile-modal-content">
        {/* Modal Header */}
        <div className="mobile-modal-header">
          <h2 className="mobile-modal-title">{title}</h2>
          <button
            className="mobile-modal-close"
            onClick={onClose}
            aria-label="Close modal"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mobile-form-error" role="alert">
            <span className="error-icon">⚠️</span>
            <span className="error-message">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mobile-form">
          <div className="mobile-form-body">
            {children}
          </div>

          {/* Form Footer */}
          <div className="mobile-form-footer">
            <button
              type="button"
              className="mobile-form-btn secondary"
              onClick={onClose}
              disabled={loading}
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              className="mobile-form-btn primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="btn-spinner"></span>
                  <span>Submitting...</span>
                </>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Status Update Form Component
 * Mobile-optimized form for updating shipment status
 */
export function StatusUpdateForm({
  currentStatus,
  onStatusChange,
  availableStatuses = [
    { id: 'in_transit_airfreight', label: '✈️ In Transit - Air' },
    { id: 'in_transit_seaway', label: '🚢 In Transit - Sea' },
    { id: 'in_transit_roadway', label: '🚚 In Transit - Road' },
    { id: 'in_transit_last_mile', label: '🚛 In Transit - Last Mile' },
    { id: 'arrived_pta', label: '📦 Arrived - PTA' },
    { id: 'arrived_klm', label: '📦 Arrived - KLM' },
    { id: 'arrived_offsite', label: '📦 Arrived - Offsite' },
    { id: 'stored', label: '🏪 Stored' },
    { id: 'received', label: '✅ Received' },
    { id: 'inspection_passed', label: '✓ Inspection Passed' },
    { id: 'inspection_failed', label: '❌ Inspection Failed' }
  ]
}) {
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onStatusChange({
      status: selectedStatus,
      notes: notes.trim()
    });
  };

  return (
    <form onSubmit={handleSubmit} className="status-update-form">
      <div className="form-group">
        <label className="form-label">New Status</label>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="form-select"
          required
        >
          <option value="">Select a status...</option>
          {availableStatuses.map(status => (
            <option key={status.id} value={status.id}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Notes (Optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any notes about this status update..."
          className="form-textarea"
          rows={4}
          maxLength={500}
        />
        <div className="form-helper">
          {notes.length}/500 characters
        </div>
      </div>
    </form>
  );
}

/**
 * Quick Action Form Component
 * Mobile-optimized form for quick actions on shipments
 */
export function QuickActionForm({
  shipmentId,
  shipmentRef,
  onAction
}) {
  const [action, setAction] = useState('');
  const [comment, setComment] = useState('');

  const actions = [
    { id: 'expedite', label: '🚀 Expedite Shipment', icon: '🚀' },
    { id: 'inspect', label: '🔍 Request Inspection', icon: '🔍' },
    { id: 'hold', label: '⏸️ Hold Shipment', icon: '⏸️' },
    { id: 'release', label: '✅ Release Hold', icon: '✅' },
    { id: 'redirect', label: '🔄 Change Destination', icon: '🔄' }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!action) return;

    onAction({
      shipmentId,
      action,
      comment: comment.trim()
    });
  };

  return (
    <form onSubmit={handleSubmit} className="quick-action-form">
      <div className="form-group">
        <label className="form-label">Select Action</label>
        <div className="action-buttons">
          {actions.map(a => (
            <button
              key={a.id}
              type="button"
              className={`action-btn ${action === a.id ? 'active' : ''}`}
              onClick={() => setAction(a.id)}
              aria-pressed={action === a.id}
            >
              <span className="action-icon">{a.icon}</span>
              <span className="action-label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {action && (
        <div className="form-group">
          <label className="form-label">Add Comment</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={`Comment for: ${actions.find(a => a.id === action)?.label}`}
            className="form-textarea"
            rows={3}
            maxLength={300}
          />
          <div className="form-helper">
            {comment.length}/300 characters
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * Filter Form Component
 * Mobile-optimized filters for shipment list
 */
export function FilterForm({
  filters,
  onFilterChange,
  onClose
}) {
  const [tempFilters, setTempFilters] = useState(filters);

  const handleChange = (filterKey, value) => {
    setTempFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
  };

  const handleApply = () => {
    onFilterChange(tempFilters);
    onClose();
  };

  const handleReset = () => {
    setTempFilters({
      status: '',
      supplier: '',
      warehouse: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  return (
    <div className="filter-form">
      <div className="form-group">
        <label className="form-label">Status</label>
        <select
          value={tempFilters.status}
          onChange={(e) => handleChange('status', e.target.value)}
          className="form-select"
        >
          <option value="">All Statuses</option>
          <option value="planned">Planned</option>
          <option value="in_transit">In Transit</option>
          <option value="arrived">Arrived</option>
          <option value="stored">Stored</option>
          <option value="received">Received</option>
          <option value="inspection_passed">Inspection Passed</option>
          <option value="inspection_failed">Inspection Failed</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Supplier</label>
        <input
          type="text"
          value={tempFilters.supplier}
          onChange={(e) => handleChange('supplier', e.target.value)}
          placeholder="Enter supplier name..."
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Warehouse</label>
        <select
          value={tempFilters.warehouse}
          onChange={(e) => handleChange('warehouse', e.target.value)}
          className="form-select"
        >
          <option value="">All Warehouses</option>
          <option value="PTA">PTA</option>
          <option value="KLM">KLM</option>
          <option value="OFFSITE">OFFSITE</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Date Range</label>
        <input
          type="date"
          value={tempFilters.dateFrom}
          onChange={(e) => handleChange('dateFrom', e.target.value)}
          className="form-input"
        />
        <input
          type="date"
          value={tempFilters.dateTo}
          onChange={(e) => handleChange('dateTo', e.target.value)}
          className="form-input"
          style={{ marginTop: '8px' }}
        />
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="mobile-form-btn secondary"
          onClick={handleReset}
        >
          Reset
        </button>
        <button
          type="button"
          className="mobile-form-btn primary"
          onClick={handleApply}
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
}

export default MobileFormModal;
