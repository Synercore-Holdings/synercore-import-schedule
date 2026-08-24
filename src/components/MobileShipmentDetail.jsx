import React, { useState } from 'react';
import './MobileShipmentDetail.css';

/**
 * Mobile Shipment Detail Component
 *
 * Displays detailed shipment information in a mobile-friendly layout
 * Features:
 * - Full shipment details with timeline
 * - Status history tracking
 * - Document list with download capability
 * - Mobile-optimized tabs for different sections
 * - Related shipments carousel
 */

export function MobileShipmentDetail({
  shipment,
  onBack,
  onStatusChange,
  onDownloadDocument,
  relatedShipments = []
}) {
  const [activeTab, setActiveTab] = useState('overview');

  const getStatusColor = (status) => {
    const statusColors = {
      'planned_airfreight': '#6c757d',
      'planned_seafreight': '#6c757d',
      'planned_roadway': '#6c757d',
      'in_transit_airfreight': '#ffc107',
      'in_transit_seaway': '#ffc107',
      'in_transit_roadway': '#ffc107',
      'in_transit_last_mile': '#ffc107',
      'moored': '#ffc107',
      'berth_working': '#ffc107',
      'berth_complete': '#17a2b8',
      'gated_in_port': '#0097A7',
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

  if (!shipment) {
    return (
      <div className="mobile-detail-empty">
        <p>No shipment selected</p>
      </div>
    );
  }

  return (
    <div className="mobile-shipment-detail">
      {/* Header with back button */}
      <div className="detail-header">
        <button className="detail-back-btn" onClick={onBack} aria-label="Go back">
          ← Back
        </button>
        <h1 className="detail-title">{shipment.orderRef}</h1>
        <div className="detail-spacer"></div>
      </div>

      {/* Status Banner */}
      <div className="status-banner" style={{ borderLeftColor: getStatusColor(shipment.latestStatus) }}>
        <div className="status-badge" style={{ backgroundColor: getStatusColor(shipment.latestStatus) }}>
          {formatStatus(shipment.latestStatus).split(' ')[0]}
        </div>
        <div className="status-info">
          <p className="status-label">{formatStatus(shipment.latestStatus)}</p>
          {shipment.updatedAt && (
            <p className="status-time">
              Updated {new Date(shipment.updatedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="detail-tabs">
        <button
          className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`detail-tab ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          Timeline
        </button>
        <button
          className={`detail-tab ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Documents
        </button>
      </div>

      {/* Tab Content */}
      <div className="detail-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="detail-section">
            {/* Basic Information */}
            <div className="detail-card">
              <h2 className="card-title">Shipment Information</h2>
              <div className="detail-grid">
                <div className="detail-row">
                  <span className="detail-label">Order Reference</span>
                  <span className="detail-value">{shipment.orderRef}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Product</span>
                  <span className="detail-value">{shipment.productName}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Quantity</span>
                  <span className="detail-value">{shipment.quantity} units</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Pallets</span>
                  <span className="detail-value">{shipment.palletQty ? (Math.round(shipment.palletQty) || 1) : '-'}</span>
                </div>
              </div>
            </div>

            {/* Supplier & Location */}
            <div className="detail-card">
              <h2 className="card-title">Supplier & Destination</h2>
              <div className="detail-grid">
                <div className="detail-row">
                  <span className="detail-label">Supplier</span>
                  <span className="detail-value">{shipment.supplier}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Warehouse</span>
                  <span className="detail-value">{shipment.receivingWarehouse}</span>
                </div>
                {shipment.incoterm && (
                  <div className="detail-row">
                    <span className="detail-label">Incoterm</span>
                    <span className="detail-value">{shipment.incoterm}</span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-label">Week</span>
                  <span className="detail-value">
                    {shipment.weekNumber ? `W${shipment.weekNumber}` : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="detail-card">
              <h2 className="card-title">Timeline</h2>
              <div className="detail-grid">
                {shipment.createdAt && (
                  <div className="detail-row">
                    <span className="detail-label">Created</span>
                    <span className="detail-value">
                      {new Date(shipment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {shipment.updatedAt && (
                  <div className="detail-row">
                    <span className="detail-label">Last Updated</span>
                    <span className="detail-value">
                      {new Date(shipment.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="detail-actions">
              <button className="detail-action-btn primary" onClick={() => onStatusChange(shipment.id)}>
                Update Status
              </button>
              <button className="detail-action-btn secondary">
                Share
              </button>
            </div>
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="detail-section">
            <div className="detail-card">
              <h2 className="card-title">Status History</h2>
              <div className="timeline">
                {shipment.statusHistory && shipment.statusHistory.length > 0 ? (
                  shipment.statusHistory.map((entry, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-marker"></div>
                      <div className="timeline-content">
                        <p className="timeline-status">{formatStatus(entry.status)}</p>
                        <p className="timeline-date">
                          {new Date(entry.timestamp).toLocaleDateString()}
                          {' '}
                          at{' '}
                          {new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        {entry.notes && <p className="timeline-notes">{entry.notes}</p>}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="timeline-empty">No history available</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="detail-section">
            <div className="detail-card">
              <h2 className="card-title">Documents</h2>
              {shipment.documents && shipment.documents.length > 0 ? (
                <div className="document-list">
                  {shipment.documents.map((doc, idx) => (
                    <div key={idx} className="document-item">
                      <div className="document-icon">
                        {doc.type === 'pdf' ? '📄' : doc.type === 'image' ? '🖼️' : '📎'}
                      </div>
                      <div className="document-info">
                        <p className="document-name">{doc.name}</p>
                        <p className="document-meta">
                          {doc.size && <span>{doc.size}</span>}
                          {doc.uploadedAt && (
                            <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                          )}
                        </p>
                      </div>
                      <button
                        className="document-download"
                        onClick={() => onDownloadDocument(doc.id)}
                        aria-label={`Download ${doc.name}`}
                      >
                        ⬇️
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="document-empty">No documents available</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Related Shipments */}
      {relatedShipments.length > 0 && (
        <div className="detail-section related-section">
          <div className="detail-card">
            <h2 className="card-title">Related Shipments</h2>
            <div className="related-carousel">
              {relatedShipments.slice(0, 3).map(related => (
                <div key={related.id} className="related-item">
                  <div className="related-ref">{related.orderRef}</div>
                  <div className="related-status" style={{ backgroundColor: getStatusColor(related.latestStatus) }}>
                    {formatStatus(related.latestStatus).split(' ')[0]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shipment Detail Modal Variant
 * For displaying details in a modal context
 */
export function MobileShipmentDetailModal({
  shipment,
  isOpen,
  onClose,
  onStatusChange,
  onDownloadDocument,
  relatedShipments = []
}) {
  if (!isOpen) return null;

  return (
    <div className="detail-modal-backdrop" onClick={onClose} aria-modal="true" role="dialog">
      <div className="detail-modal-content" onClick={e => e.stopPropagation()}>
        <MobileShipmentDetail
          shipment={shipment}
          onBack={onClose}
          onStatusChange={onStatusChange}
          onDownloadDocument={onDownloadDocument}
          relatedShipments={relatedShipments}
        />
      </div>
    </div>
  );
}

export default MobileShipmentDetail;
