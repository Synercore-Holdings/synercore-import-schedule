import React from 'react';
import ResizableModal from './ResizableModal';
import ShipmentTimeline from './ShipmentTimeline';
import { isAirfreight } from '../utils/shipmentConstants';

const labelStyle = {
  display: 'block',
  marginBottom: '0.25rem',
  fontWeight: '600',
  color: '#555',
  fontSize: '0.8rem',
  textTransform: 'uppercase',
};

const valueStyle = { fontSize: '1rem', color: '#222' };

const OrderDetailsModal = ({ isOpen, shipment, onClose }) => {
  if (!isOpen || !shipment) return null;

  return (
    <ResizableModal
      title={`Order Details — ${shipment.orderRef}`}
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={600}
      minWidth={400}
      minHeight={350}
    >
      <ShipmentTimeline shipment={shipment} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Supplier</label>
          <span style={valueStyle}>{shipment.supplier || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Order/Ref</label>
          <span style={valueStyle}>{shipment.orderRef || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Product Name</label>
          <span style={valueStyle}>
            {shipment.productName
              ? shipment.productName.split(';').map((p, i) => (
                  <span key={i}>{p.trim()}{i < shipment.productName.split(';').length - 1 && <br />}</span>
                ))
              : '—'}
          </span>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <span className={`status-badge status-${shipment.latestStatus}`} style={{
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '0.8rem',
            fontWeight: '500',
            textTransform: 'uppercase'
          }}>
            {shipment.latestStatus?.replace(/_/g, ' ') || '—'}
          </span>
        </div>
        <div>
          <label style={labelStyle}>Quantity</label>
          <span style={valueStyle}>{shipment.quantity != null ? Number(shipment.quantity).toLocaleString() : '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Pallet Qty</label>
          <span style={valueStyle}>{shipment.palletQty ? (Math.round(shipment.palletQty) || 1) : '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>CBM</label>
          <span style={valueStyle}>{shipment.cbm || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Week Number</label>
          <span style={valueStyle}>{shipment.weekNumber || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Final POD</label>
          <span style={valueStyle}>{shipment.finalPod || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Receiving Warehouse</label>
          <span style={valueStyle}>{shipment.receivingWarehouse || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Incoterm</label>
          <span style={valueStyle}>{shipment.incoterm || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Forwarding Agent</label>
          <span style={valueStyle}>{shipment.forwardingAgent || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Shipping Line</label>
          <span style={valueStyle}>{shipment.shippingLine || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>{isAirfreight(shipment.latestStatus, shipment.forwardingAgent, shipment.vesselName) ? 'AWB Number' : 'Vessel Name'}</label>
          <span style={valueStyle}>{shipment.vesselName || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>BOL Number</label>
          <span style={valueStyle}>{shipment.bolNumber || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Container Number</label>
          <span style={valueStyle}>{shipment.containerNumber || '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Created</label>
          <span style={valueStyle}>{shipment.createdAt ? new Date(shipment.createdAt).toLocaleDateString() : '—'}</span>
        </div>
        <div>
          <label style={labelStyle}>Actual Arrival Date</label>
          <span style={valueStyle}>{shipment.actualArrivalDate ? new Date(shipment.actualArrivalDate).toLocaleDateString() : '—'}</span>
        </div>
        {shipment.notes && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Notes</label>
            <span style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{shipment.notes}</span>
          </div>
        )}
        {shipment.reminderDate && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Reminder</label>
            <span style={valueStyle}>
              {new Date(shipment.reminderDate).toLocaleDateString()}
              {shipment.reminderNote ? ` — ${shipment.reminderNote}` : ''}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <button
          onClick={onClose}
          style={{
            padding: '0.6rem 1.5rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#545b62'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#6c757d'}
        >
          Close
        </button>
      </div>
    </ResizableModal>
  );
};

export default OrderDetailsModal;
