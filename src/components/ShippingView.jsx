import React, { useMemo, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import ShipmentTable from './ShipmentTable';
import { SHIPPING_EXCLUDED_STATUSES, DELAYED_STATUSES, isDelayedStatus, isOverdue, getCurrentWeek } from '../types/shipment';

const FileUpload = lazy(() => import('./FileUpload'));

// Static card definitions — only value/active are dynamic
const STAT_CARD_DEFS = [
  { key: 'total', status: null, label: 'Total Shipments', icon: '\u{1F4E6}', ring: 'ring-accent', tint: 'rgba(5,150,105,0.1)' },
  { key: 'tbc', status: 'tbc', label: 'TBC', icon: '\u2754', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)', alwaysShow: true },
  { key: 'planned_airfreight', status: 'planned_airfreight', label: 'Planned Airfreight', icon: '\u2708\uFE0F', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
  { key: 'planned_seafreight', status: 'planned_seafreight', label: 'Planned Seafreight', icon: '\u{1F6A2}', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
  { key: 'in_transit_airfreight', status: 'in_transit_airfreight', label: 'In Transit Air', icon: '\u2708\uFE0F', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'in_transit_roadway', status: 'in_transit_roadway', label: 'In Transit Road', icon: '\u{1F69B}', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'in_transit_seaway', status: 'in_transit_seaway', label: 'In Transit Sea', icon: '\u{1F30A}', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'in_transit_last_mile', status: 'in_transit_last_mile', label: 'In Transit Last Mile', icon: '\u{1F69B}', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'moored', status: 'moored', label: 'Moored', icon: '\u2693', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'berth_working', status: 'berth_working', label: 'Berth Working', icon: '\u{1F3D7}\uFE0F', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'berth_complete', status: 'berth_complete', label: 'Berth Complete', icon: '\u2705', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'gated_in_port', status: 'gated_in_port', label: 'Gated In Port', icon: '\u{1F6E3}\uFE0F', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'arrived_pta', status: 'arrived_pta', label: 'Arrived PTA', icon: '\u{1F3E2}', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
  { key: 'arrived_klm', status: 'arrived_klm', label: 'Arrived KLM', icon: '\u{1F3E2}', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
  { key: 'unloading', status: 'unloading', label: 'Unloading', icon: '\u{1F4E6}', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
  { key: 'inspection_pending', status: 'inspection_pending', label: 'Inspection Pending', icon: '\u{1F50D}', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
  { key: 'inspecting', status: 'inspecting', label: 'Inspecting', icon: '\u{1F50D}', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
  { key: 'inspection_failed', status: 'inspection_failed', label: 'Inspection Failed', icon: '\u274C', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
  { key: 'inspection_passed', status: 'inspection_passed', label: 'Inspection Passed', icon: '\u2705', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
  { key: 'receiving', status: 'receiving', label: 'Receiving', icon: '\u{1F4E5}', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'received', status: 'received', label: 'Received', icon: '\u2705', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
  { key: 'stored', status: 'stored', label: 'Stored', icon: '\u{1F3EA}', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
  { key: 'delayed_port', status: 'delayed_port', label: 'Delayed - Port', icon: '\u2693', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
  { key: 'delayed_customs', status: 'delayed_customs', label: 'Delayed - Customs', icon: '\u{1F9F3}', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
  { key: 'delayed_documents', status: 'delayed_documents', label: 'Delayed - Documents', icon: '\u{1F4C4}', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
  { key: 'delayed_supplier', status: 'delayed_supplier', label: 'Delayed - Supplier', icon: '\u{1F3ED}', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
  { key: 'cancelled', status: 'cancelled', label: 'Cancelled', icon: '\u274C', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
];

const isTbcShipment = (shipment) => {
  const tbcFields = [
    shipment.orderRef,
    shipment.productName,
    shipment.finalPod,
    shipment.receivingWarehouse,
    shipment.forwardingAgent,
    shipment.vesselName,
    shipment.incoterm,
    shipment.notes,
  ];

  return tbcFields.some((field) => {
    const value = String(field || '').trim().toUpperCase();
    return value === 'TBC' || value.includes(' TBC') || value.includes('TBC ') || value.includes('TO BE CONFIRMED');
  });
};

function ShippingView({ shipments, suppliers = [], onFileUpload, onUpdateShipment, onDeleteShipment, onCreateShipment, loading }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || null;
  const globalSearchTerm = searchParams.get('search') || '';

  const handleStatusCardClick = (status) => {
    const params = new URLSearchParams(searchParams);
    if (status === null || statusFilter === status) {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    setSearchParams(params, { replace: true });
  };

  const clearStatusFilter = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('status');
    setSearchParams(params, { replace: true });
  };

  const clearGlobalSearch = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('search');
    setSearchParams(params, { replace: true });
  };

  // Only show international shipments, hide post-arrival/stored/archived
  let shippingShipments = shipments.filter(s =>
    (s.shipmentType || 'international') === 'international' &&
    !SHIPPING_EXCLUDED_STATUSES.includes(s.latestStatus)
  );

  if (statusFilter) {
    const META_FILTERS = {
      in_transit: ['in_transit_airfreight', 'in_transit_roadway', 'in_transit_seaway', 'in_transit_last_mile'],
      arrived: ['arrived_pta', 'arrived_klm', 'arrived_offsite'],
      planned: ['planned_airfreight', 'planned_seafreight'],
      delayed: ['delayed_port', 'delayed_customs', 'delayed_documents', 'delayed_supplier'],
    };

    if (statusFilter === 'tbc') {
      shippingShipments = shippingShipments.filter(isTbcShipment);
    } else if (statusFilter === 'delayed') {
      // Include both explicit delayed statuses AND overdue shipments (pre-arrival past their week)
      const currentWeek = getCurrentWeek();
      shippingShipments = shippingShipments.filter(s =>
        DELAYED_STATUSES.includes(s.latestStatus) ||
        isOverdue(s, currentWeek)
      );
    } else {
      const matchStatuses = META_FILTERS[statusFilter] || [statusFilter];
      shippingShipments = shippingShipments.filter(s => matchStatuses.includes(s.latestStatus));
    }
  }

  // Count unique ORDER/REF - duplicates count as 1 shipment
  // Normalise orderRef (trim + upper) so whitespace/casing typos don't
  // inflate the per-status counts.
  const stats = useMemo(() => {
    const norm = (r) => (r || '').trim().toUpperCase();
    const uniqueOrderRefs = new Set(
      shippingShipments.map(s => norm(s.orderRef)).filter(Boolean)
    );
    const statusOrderRefs = {};
    shippingShipments.forEach(s => {
      const ref = norm(s.orderRef);
      if (s.latestStatus && ref) {
        if (!statusOrderRefs[s.latestStatus]) {
          statusOrderRefs[s.latestStatus] = new Set();
        }
        statusOrderRefs[s.latestStatus].add(ref);
      }
    });

    const result = {
      total: uniqueOrderRefs.size,
      tbc: 0,
      planned_airfreight: 0, planned_seafreight: 0,
      in_transit_airfreight: 0, in_transit_roadway: 0, in_transit_seaway: 0, in_transit_last_mile: 0,
      moored: 0, berth_working: 0, berth_complete: 0, gated_in_port: 0,
      arrived_pta: 0, arrived_klm: 0, arrived_offsite: 0,
      unloading: 0, inspection_pending: 0, inspecting: 0,
      inspection_failed: 0, inspection_passed: 0,
      receiving: 0, received: 0, stored: 0,
      delayed_port: 0, delayed_customs: 0, delayed_documents: 0, delayed_supplier: 0,
      cancelled: 0
    };

    Object.keys(statusOrderRefs).forEach(status => {
      if (result.hasOwnProperty(status)) {
        result[status] = statusOrderRefs[status].size;
      }
    });

    result.tbc = new Set(
      shippingShipments
        .filter(isTbcShipment)
        .map(s => norm(s.orderRef))
        .filter(Boolean)
    ).size;

    return result;
  }, [shippingShipments]);

  const statCards = useMemo(() =>
    STAT_CARD_DEFS
      .map(def => ({ ...def, value: def.status === null ? stats.total : stats[def.status] || 0 }))
      .filter(card => card.status === null || card.alwaysShow || card.value > 0),
    [stats]
  );

  return (
    <div className="window-content">
      {/* stat cards */}
      <div className="stats-grid">
        {statCards.map(card => (
            <div key={card.key}
              className={`stat-card ${card.ring} clickable ${statusFilter === card.status ? 'active' : ''}`}
              onClick={() => card.status === null ? clearStatusFilter() : handleStatusCardClick(card.status)}
            >
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
                backgroundColor: card.tint, marginBottom: 6,
              }}>
                {card.icon}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                {card.value}
              </h3>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                {card.label}
              </p>
            </div>
          ))
        }
      </div>

      {/* summary info pills */}
      {(() => {
        const delayedTotal = (stats.delayed_port || 0) + (stats.delayed_customs || 0) + (stats.delayed_documents || 0) + (stats.delayed_supplier || 0);
        const inTransitTotal = (stats.in_transit_airfreight || 0) + (stats.in_transit_roadway || 0) + (stats.in_transit_seaway || 0) + (stats.in_transit_last_mile || 0);
        const arrivedTotal = (stats.arrived_pta || 0) + (stats.arrived_klm || 0);
        const inspectionPending = stats.inspection_pending || 0;
        return (delayedTotal > 0 || inTransitTotal > 0 || arrivedTotal > 0 || inspectionPending > 0) ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
            {delayedTotal > 0 && <span className="pill pill-bad">{delayedTotal} Delayed</span>}
            {inTransitTotal > 0 && <span className="pill pill-info">{inTransitTotal} In Transit</span>}
            {arrivedTotal > 0 && <span className="pill pill-ok">{arrivedTotal} Arrived</span>}
            {inspectionPending > 0 && <span className="pill pill-warn">{inspectionPending} Pending Inspection</span>}
          </div>
        ) : null;
      })()}

      {/* current filter chip */}
      {statusFilter && (
        <div style={{
          margin: '1rem 0',
          padding: '0.75rem 1rem',
          backgroundColor: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ color: 'var(--info)', fontWeight: 'bold' }}>
            Filtered by: {statusFilter.replace(/_/g, ' ').toUpperCase()}
          </span>
          <button
            onClick={clearStatusFilter}
            className="btn btn-sm"
            style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
          >
            Clear Filter
          </button>
        </div>
      )}

      <FileUpload onFileUpload={onFileUpload} loading={loading} />

      <ShipmentTable
        shipments={shippingShipments}
        suppliers={suppliers}
        onUpdateShipment={onUpdateShipment}
        onDeleteShipment={onDeleteShipment}
        onCreateShipment={onCreateShipment}
        loading={loading}
        globalSearchTerm={globalSearchTerm}
        onClearGlobalSearch={clearGlobalSearch}
      />
    </div>
  );
}

export default ShippingView;
