import React from 'react';
import './MobileShipmentCard.css';

/**
 * Mobile Shipment Card Component
 *
 * Displays shipment information in a mobile-friendly card format
 * Features:
 * - Compact layout with key information
 * - Status badge with color coding
 * - Touch-friendly buttons
 * - Expandable details
 */

export function MobileShipmentCard({
  shipment,
  onViewDetails,
  onStatusChange,
  compact = false
}) {
  const getStatusColor = (status) => {
    const statusColors = {
      'planned_airfreight': '#6c757d',
      'planned_seafreight': '#6c757d',
      'planned_roadway': '#6c757d',
      'in_transit_airfreight': '#ffc107',
      'in_transit_seaway': '#ffc107',
      'in_transit_roadway': '#ffc107',
      'in_transit_last_mile': '#ffc107',
      'arrived_pta': '#17a2b8',
      'arrived_klm': '#17a2b8',
      'arrived_offsite': '#17a2b8',
      'stored': '#007bff',
      'received': '#28a745',
      'inspection_failed': '#dc3545',
      'inspection_passed': '#20c997'
    };
    return statusColors[status] || '#6c757d';
  };

  const formatStatus = (status) => {
    const statusLabels = {
      'planned_airfreight': '✈️ Planned - Air',
      'planned_seafreight': '🚢 Planned - Sea',
      'planned_roadway': '🚚 Planned - Road',
      'in_transit_airfreight': '✈️ In Transit - Air',
      'in_transit_seaway': '🚢 In Transit - Sea',
      'in_transit_roadway': '🚚 In Transit - Road',
      'in_transit_last_mile': '🚛 In Transit - Last Mile',
      'moored': '⚓ Moored',
      'berth_working': '⚙️ Berth - Working',
      'berth_complete': '✅ Berth - Complete',
      'gated_in_port': '🛣️ Gated In Port',
      'arrived_pta': '📦 Arrived - PTA',
      'arrived_klm': '📦 Arrived - KLM',
      'arrived_offsite': '📦 Arrived - Offsite',
      'stored': '🏪 Stored',
      'received': '✅ Received',
      'inspection_failed': '❌ Inspection Failed',
      'inspection_passed': '✓ Inspection Passed'
    };
    return statusLabels[status] || status;
  };

  if (compact) {
    return (
      <div className="shipment-card-compact">
        <div className="card-header-compact">
          <div className="card-order-ref">{shipment.orderRef}</div>
          <div
            className="status-badge"
            style={{ backgroundColor: getStatusColor(shipment.latestStatus) }}
          >
            {formatStatus(shipment.latestStatus).split(' ')[0]}
          </div>
        </div>
        <button
          className="card-view-btn"
          onClick={() => onViewDetails(shipment.id)}
        >
          View Details →
        </button>
      </div>
    );
  }

  return (
    <div className="shipment-card">
      {/* Card Header */}
      <div className="card-header">
        <div className="card-title-section">
          <h3 className="card-title">{shipment.orderRef}</h3>
          <p className="card-product">{shipment.productName}</p>
        </div>
        <div
          className="status-badge"
          style={{ backgroundColor: getStatusColor(shipment.latestStatus) }}
        >
          {formatStatus(shipment.latestStatus)}
        </div>
      </div>

      {/* Card Body */}
      <div className="card-body">
        <div className="info-grid">
          {/* Quantity */}
          <div className="info-item">
            <span className="info-label">📦 Qty</span>
            <span className="info-value">{shipment.quantity} units</span>
          </div>

          {/* Pallets */}
          <div className="info-item">
            <span className="info-label">📍 Pallets</span>
            <span className="info-value">{shipment.palletQty ? (Math.round(shipment.palletQty) || 1) : '-'}</span>
          </div>

          {/* Warehouse */}
          <div className="info-item">
            <span className="info-label">🏪 Warehouse</span>
            <span className="info-value">{shipment.receivingWarehouse}</span>
          </div>

          {/* Week */}
          <div className="info-item">
            <span className="info-label">📅 Week</span>
            <span className="info-value">
              {shipment.weekNumber ? `W${shipment.weekNumber}` : '-'}
            </span>
          </div>

          {/* Supplier */}
          <div className="info-item full-width">
            <span className="info-label">🏢 Supplier</span>
            <span className="info-value">{shipment.supplier}</span>
          </div>

          {/* Incoterm */}
          {shipment.incoterm && (
            <div className="info-item full-width">
              <span className="info-label">📋 Incoterm</span>
              <span className="info-value">{shipment.incoterm}</span>
            </div>
          )}
        </div>

        {/* Dates */}
        {(shipment.createdAt || shipment.updatedAt) && (
          <div className="dates-section">
            {shipment.createdAt && (
              <div className="date-item">
                <span className="date-label">Created:</span>
                <span className="date-value">
                  {new Date(shipment.createdAt).toLocaleDateString()}
                </span>
              </div>
            )}
            {shipment.updatedAt && (
              <div className="date-item">
                <span className="date-label">Updated:</span>
                <span className="date-value">
                  {new Date(shipment.updatedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="card-footer">
        <button
          className="card-btn primary"
          onClick={() => onViewDetails(shipment.id)}
        >
          View Details
        </button>
        {onStatusChange && (
          <button
            className="card-btn secondary"
            onClick={() => onStatusChange(shipment.id)}
          >
            Update Status
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Shipment Card List Component
 * Renders multiple shipment cards with loading and empty states
 */
export function ShipmentCardList({
  shipments,
  onViewDetails,
  onStatusChange,
  loading = false,
  empty = false,
  compact = false
}) {
  if (loading) {
    return (
      <div className="shipment-list loading">
        <div className="loading-spinner">Loading shipments...</div>
      </div>
    );
  }

  if (empty || !shipments || shipments.length === 0) {
    return (
      <div className="shipment-list empty">
        <div className="empty-state">
          <p className="empty-icon">📦</p>
          <p className="empty-message">No shipments found</p>
          <p className="empty-hint">Try adjusting your filters</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shipment-list">
      {shipments.map(shipment => (
        <MobileShipmentCard
          key={shipment.id}
          shipment={shipment}
          onViewDetails={onViewDetails}
          onStatusChange={onStatusChange}
          compact={compact}
        />
      ))}
    </div>
  );
}

export default MobileShipmentCard;
