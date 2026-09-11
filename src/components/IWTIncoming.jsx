import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../utils/authFetch';
import { getApiUrl } from '../config/api';
import { useNotification } from '../contexts/NotificationContext';
import { STATUS_COLORS } from '../types/shipment';
import { Repeat, Truck, Package, Search, Store } from 'lucide-react';

const WAREHOUSES = ['PRETORIA', 'KLAPMUTS', 'OFFSITE'];

const IWT_STATUSES = [
  { value: 'in_transit_roadway', label: 'In Transit Road', group: 'Transit' },
  { value: 'arrived_klm', label: 'Arrived Klapmuts', group: 'Arrived' },
  { value: 'arrived_pta', label: 'Arrived Pretoria', group: 'Arrived' },
  { value: 'arrived_offsite', label: 'Arrived Offsite', group: 'Arrived' },
  { value: 'unloading', label: 'Unloading', group: 'Post-Arrival' },
  { value: 'inspection_pending', label: 'Inspection Pending', group: 'Post-Arrival' },
  { value: 'inspecting', label: 'Inspecting', group: 'Post-Arrival' },
  { value: 'inspection_passed', label: 'Inspection Passed', group: 'Post-Arrival' },
  { value: 'inspection_failed', label: 'Inspection Failed', group: 'Post-Arrival' },
  { value: 'receiving', label: 'Receiving', group: 'Warehouse' },
  { value: 'stored', label: 'Stored', group: 'Warehouse' },
  { value: 'cancelled', label: 'Cancelled', group: 'Other' },
];

const STAT_CARDS = [
  { key: 'total', status: null, label: 'Total IWT', icon: Repeat, ring: 'ring-accent', tint: 'rgba(5,150,105,0.1)' },
  { key: 'in_transit_roadway', status: 'in_transit_roadway', label: 'In Transit', icon: Truck, ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'arrived', status: 'arrived', label: 'Arrived', icon: Package, ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
  { key: 'post_arrival', status: 'post_arrival', label: 'Post-Arrival', icon: Search, ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
  { key: 'stored', status: 'stored', label: 'Stored', icon: Store, ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
];

const DEFAULT_SOURCE = 'OFFSITE';
const DEFAULT_DESTINATION = 'KLAPMUTS';

function IWTIncoming({ shipments, onCreateShipment, onUpdateShipment, onDeleteShipment, loading }) {
  const { showSuccess, showError, confirm: confirmAction } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || null;
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [truckInfoMap, setTruckInfoMap] = useState({});

  const [form, setForm] = useState({
    orderRef: '',
    productName: '',
    quantity: '',
    palletQty: '',
    sourceWarehouse: DEFAULT_SOURCE,
    receivingWarehouse: DEFAULT_DESTINATION,
    sourcePalletRef: '',
    batchLot: '',
    releaseNumber: '',
    carrier: '',
    expectedArrival: '',
    dateShipped: '',
    latestStatus: 'in_transit_roadway',
    notes: '',
  });

  const iwtShipments = useMemo(() =>
    shipments.filter(s => s.shipmentType === 'iwt'),
    [shipments]
  );

  useEffect(() => {
    const arrived = iwtShipments.filter(s =>
      ['arrived_pta', 'arrived_klm', 'arrived_offsite', 'unloading', 'inspection_pending'].includes(s.latestStatus)
    );
    if (arrived.length === 0) return;

    const fetchTruckInfo = async () => {
      const map = {};
      await Promise.all(arrived.map(async (s) => {
        try {
          const res = await authFetch(getApiUrl(`/api/docks/truck-for-shipment/${s.id}`));
          if (res.ok) {
            const info = await res.json();
            if (info) map[s.id] = info;
          }
        } catch { /* ignore */ }
      }));
      setTruckInfoMap(map);
    };
    fetchTruckInfo();
  }, [iwtShipments]);

  const parseExpectedDate = (d) => {
    if (!d) return null;
    try {
      const num = Number(d);
      if (!isNaN(num) && num > 30000 && num < 60000) {
        const excelEpoch = new Date(1899, 11, 30);
        return new Date(excelEpoch.getTime() + num * 86400000);
      }
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) return parsed;
      return null;
    } catch { return null; }
  };

  const stats = useMemo(() => {
    const arrivedStatuses = ['arrived_pta', 'arrived_klm', 'arrived_offsite'];
    const postArrivalStatuses = ['unloading', 'inspection_pending', 'inspecting', 'inspection_passed', 'inspection_failed', 'receiving'];
    return {
      total: iwtShipments.length,
      in_transit_roadway: iwtShipments.filter(s => s.latestStatus === 'in_transit_roadway').length,
      arrived: iwtShipments.filter(s => arrivedStatuses.includes(s.latestStatus)).length,
      post_arrival: iwtShipments.filter(s => postArrivalStatuses.includes(s.latestStatus)).length,
      stored: iwtShipments.filter(s => s.latestStatus === 'stored').length,
    };
  }, [iwtShipments]);

  const filtered = useMemo(() => {
    let list = iwtShipments;

    if (statusFilter) {
      const arrivedStatuses = ['arrived_pta', 'arrived_klm', 'arrived_offsite'];
      const postArrivalStatuses = ['unloading', 'inspection_pending', 'inspecting', 'inspection_passed', 'inspection_failed', 'receiving'];
      if (statusFilter === 'arrived') {
        list = list.filter(s => arrivedStatuses.includes(s.latestStatus));
      } else if (statusFilter === 'post_arrival') {
        list = list.filter(s => postArrivalStatuses.includes(s.latestStatus));
      } else {
        list = list.filter(s => s.latestStatus === statusFilter);
      }
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(s =>
        (s.orderRef || '').toLowerCase().includes(q) ||
        (s.productName || '').toLowerCase().includes(q) ||
        (s.sourcePalletRef || '').toLowerCase().includes(q) ||
        (s.batchLot || '').toLowerCase().includes(q) ||
        (s.releaseNumber || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const dateA = parseExpectedDate(a.vesselName);
      const dateB = parseExpectedDate(b.vesselName);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA - dateB;
    });

    return list;
  }, [iwtShipments, statusFilter, searchTerm]);

  const handleStatusCardClick = (status) => {
    const params = new URLSearchParams(searchParams);
    if (status === null || statusFilter === status) {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    setSearchParams(params, { replace: true });
  };

  const resetForm = () => setForm({
    orderRef: '', productName: '', quantity: '', palletQty: '',
    sourceWarehouse: DEFAULT_SOURCE, receivingWarehouse: DEFAULT_DESTINATION,
    sourcePalletRef: '', batchLot: '', releaseNumber: '',
    carrier: '', expectedArrival: '', dateShipped: '', latestStatus: 'in_transit_roadway', notes: '',
  });

  const handleCreate = async () => {
    if (!form.orderRef) {
      showError('Reference / IWT Number is required');
      return;
    }
    if (!form.sourceWarehouse || !form.receivingWarehouse) {
      showError('Source and destination warehouses are required');
      return;
    }
    if (form.sourceWarehouse === form.receivingWarehouse) {
      showError('Source and destination warehouses must be different');
      return;
    }
    setActionLoading(true);
    try {
      // Supplier field is required by the backend; for internal transfers,
      // use the source warehouse label so the list view and audit log remain readable.
      const supplierLabel = `Internal Transfer — ${form.sourceWarehouse}`;

      await onCreateShipment({
        orderRef: form.orderRef,
        supplier: supplierLabel,
        productName: form.productName,
        quantity: form.quantity ? Number(form.quantity) : undefined,
        palletQty: form.palletQty ? Number(form.palletQty) : undefined,
        sourceWarehouse: form.sourceWarehouse,
        receivingWarehouse: form.receivingWarehouse,
        sourcePalletRef: form.sourcePalletRef,
        batchLot: form.batchLot,
        releaseNumber: form.releaseNumber,
        forwardingAgent: form.carrier,
        latestStatus: form.latestStatus,
        notes: form.notes,
        vesselName: form.expectedArrival || '',
        dateShipped: form.dateShipped || '',
        shipmentType: 'iwt',
      });
      showSuccess('IWT transfer created');
      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      showError(err.message || 'Failed to create IWT transfer');
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (s) => {
    setEditingShipment(s);
    setForm({
      orderRef: s.orderRef || '',
      productName: s.productName || '',
      quantity: s.quantity || '',
      palletQty: s.palletQty || '',
      sourceWarehouse: s.sourceWarehouse || DEFAULT_SOURCE,
      receivingWarehouse: s.receivingWarehouse || DEFAULT_DESTINATION,
      sourcePalletRef: s.sourcePalletRef || '',
      batchLot: s.batchLot || '',
      releaseNumber: s.releaseNumber || '',
      carrier: s.forwardingAgent || '',
      expectedArrival: s.vesselName || '',
      dateShipped: s.dateShipped ? new Date(s.dateShipped).toISOString().split('T')[0] : '',
      latestStatus: s.latestStatus || 'in_transit_roadway',
      notes: s.notes || '',
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!editingShipment) return;
    if (form.sourceWarehouse === form.receivingWarehouse) {
      showError('Source and destination warehouses must be different');
      return;
    }
    setActionLoading(true);
    try {
      await onUpdateShipment(editingShipment.id, {
        orderRef: form.orderRef,
        supplier: `Internal Transfer — ${form.sourceWarehouse}`,
        productName: form.productName,
        quantity: form.quantity ? Number(form.quantity) : undefined,
        palletQty: form.palletQty ? Number(form.palletQty) : undefined,
        sourceWarehouse: form.sourceWarehouse,
        receivingWarehouse: form.receivingWarehouse,
        sourcePalletRef: form.sourcePalletRef,
        batchLot: form.batchLot,
        releaseNumber: form.releaseNumber,
        forwardingAgent: form.carrier,
        latestStatus: form.latestStatus,
        notes: form.notes,
        vesselName: form.expectedArrival || '',
        dateShipped: form.dateShipped || '',
      });
      showSuccess('IWT transfer updated');
      setShowEditModal(false);
      setEditingShipment(null);
      resetForm();
    } catch (err) {
      showError(err.message || 'Failed to update');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirmAction({
      title: 'Delete IWT Transfer',
      message: 'Are you sure you want to delete this IWT transfer?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'warning',
    });
    if (!confirmed) return;
    try {
      await onDeleteShipment(id);
      showSuccess('IWT transfer deleted');
    } catch (err) {
      showError(err.message);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await onUpdateShipment(id, { latestStatus: newStatus });
      showSuccess('Status updated');
    } catch (err) {
      showError(err.message);
    }
  };

  const statCards = STAT_CARDS.map(c => ({
    ...c,
    value: c.status === null ? stats.total : stats[c.key] || 0,
  })).filter(c => c.status === null || c.value > 0);

  const formatDate = (d) => {
    if (!d) return '-';
    const parsed = parseExpectedDate(d);
    if (parsed) return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
    return String(d);
  };

  const EditIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
      <path d="m15 5 4 4"/>
    </svg>
  );
  const TrashIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
    </svg>
  );

  const renderFormFields = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>
          Reference / IWT Number *
        </label>
        <input type="text" value={form.orderRef} onChange={e => setForm({ ...form, orderRef: e.target.value })}
          className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. IWT-2026-001" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>
            Source Warehouse *
          </label>
          <select value={form.sourceWarehouse} onChange={e => setForm({ ...form, sourceWarehouse: e.target.value })}
            className="select" style={{ width: '100%', boxSizing: 'border-box' }}>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>
            Destination Warehouse *
          </label>
          <select value={form.receivingWarehouse} onChange={e => setForm({ ...form, receivingWarehouse: e.target.value })}
            className="select" style={{ width: '100%', boxSizing: 'border-box' }}>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Product</label>
        <input type="text" value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })}
          className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="Product description" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Quantity</label>
          <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
            className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="0" />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Pallets</label>
          <input type="number" value={form.palletQty} onChange={e => setForm({ ...form, palletQty: e.target.value })}
            className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="0" />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>
          Source Pallet Reference
        </label>
        <input type="text" value={form.sourcePalletRef} onChange={e => setForm({ ...form, sourcePalletRef: e.target.value })}
          className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="Offsite pallet reference" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Batch / Lot</label>
          <input type="text" value={form.batchLot} onChange={e => setForm({ ...form, batchLot: e.target.value })}
            className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. LOT-2026-045" />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Release Number</label>
          <input type="text" value={form.releaseNumber} onChange={e => setForm({ ...form, releaseNumber: e.target.value })}
            className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. REL-00123" />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Carrier / Driver</label>
        <input type="text" value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })}
          className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. Internal truck, driver name" />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Expected Delivery Date</label>
        <input type="date" value={form.expectedArrival} onChange={e => setForm({ ...form, expectedArrival: e.target.value })}
          className="input" style={{ width: '100%', boxSizing: 'border-box' }} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Date Shipped</label>
        <input type="date" value={form.dateShipped} onChange={e => setForm({ ...form, dateShipped: e.target.value })}
          className="input" style={{ width: '100%', boxSizing: 'border-box' }} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Status</label>
        <select value={form.latestStatus} onChange={e => setForm({ ...form, latestStatus: e.target.value })}
          className="select" style={{ width: '100%', boxSizing: 'border-box' }}>
          {(() => {
            const groups = {};
            IWT_STATUSES.forEach(st => {
              if (!groups[st.group]) groups[st.group] = [];
              groups[st.group].push(st);
            });
            return Object.entries(groups).map(([group, statuses]) => (
              <optgroup key={group} label={group}>
                {statuses.map(st => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </optgroup>
            ));
          })()}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Notes</label>
        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
          className="input" style={{ width: '100%', minHeight: '50px', boxSizing: 'border-box', resize: 'vertical' }}
          placeholder="Additional notes..." />
      </div>
    </div>
  );

  return (
    <div className="window-content">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-900)', fontSize: '1.2rem', lineHeight: 1.3 }}>
            IWT Incoming
          </h2>
          <p style={{ margin: '2px 0 0', color: 'var(--text-500)', fontSize: '0.8rem' }}>
            Inter-warehouse transfers (e.g. Offsite → Klapmuts K58). Transfers flow through the Post-Arrival Workflow on arrival.
          </p>
        </div>
        <button className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={() => { resetForm(); setShowCreateModal(true); }}>
          + New IWT Transfer
        </button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem',
        flexWrap: 'wrap', padding: '6px 0',
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      }}>
        {statCards.map(card => (
          <button key={card.key}
            className={statusFilter === card.status ? 'active' : ''}
            onClick={() => handleStatusCardClick(card.status)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)',
              background: statusFilter === card.status ? 'var(--accent-100)' : 'var(--surface)',
              cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
              color: statusFilter === card.status ? 'var(--accent)' : 'var(--text-700)',
              outline: statusFilter === card.status ? '2px solid var(--accent)' : 'none',
              outlineOffset: -1, transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>{(() => { const I = card.icon; return <I size={14} strokeWidth={2} />; })()}</span>
            <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{card.value}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-500)', fontWeight: 500 }}>{card.label}</span>
          </button>
        ))}

        <div style={{ flex: 1, minWidth: 8 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {statusFilter && (
            <div style={{
              padding: '3px 8px', backgroundColor: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.25)', borderRadius: 12,
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', whiteSpace: 'nowrap',
            }}>
              <span style={{ color: 'var(--info)', fontWeight: 600 }}>
                {statusFilter.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <button onClick={() => { const p = new URLSearchParams(searchParams); p.delete('status'); setSearchParams(p, { replace: true }); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-400)', fontSize: '0.85rem', lineHeight: 1, padding: 0 }}
                title="Clear filter">&times;</button>
            </div>
          )}

          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: 8, pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input"
              style={{ width: 200, boxSizing: 'border-box', fontSize: '0.8rem', padding: '4px 10px 4px 26px' }}
              placeholder="Search ref, pallet, batch..."
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: '0.35rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-500)' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-500)' }}>
            No IWT transfers found. Click "+ New IWT Transfer" to add one.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Source → Dest</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Pallets</th>
                  <th>Pallet Ref</th>
                  <th>Batch / Lot</th>
                  <th>Release #</th>
                  <th>Expected</th>
                  <th>Truck</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const statusColor = STATUS_COLORS[s.latestStatus] || '#6c757d';
                  return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.orderRef || '-'}</td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <span style={{ fontWeight: 600 }}>{s.sourceWarehouse || '-'}</span>
                      <span style={{ color: 'var(--text-400)', margin: '0 4px' }}>→</span>
                      <span style={{ fontWeight: 600 }}>{s.receivingWarehouse || '-'}</span>
                    </td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.productName || ''}>{s.productName || '-'}</td>
                    <td>{s.quantity || '-'}</td>
                    <td>{s.palletQty ? (Math.round(s.palletQty) || 1) : '-'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{s.sourcePalletRef || '-'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{s.batchLot || '-'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{s.releaseNumber || '-'}</td>
                    <td>{formatDate(s.vesselName)}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-500)' }}>
                      {truckInfoMap[s.id] ? (
                        <span>{truckInfoMap[s.id].carrier}{truckInfoMap[s.id].vehicle_reg ? ` (${truckInfoMap[s.id].vehicle_reg})` : ''}</span>
                      ) : (s.forwardingAgent || '-')}
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                        <span style={{
                          position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)',
                          width: 6, height: 6, borderRadius: '50%', backgroundColor: statusColor,
                          pointerEvents: 'none', zIndex: 1,
                        }} />
                        <select
                          value={s.latestStatus}
                          onChange={e => handleStatusChange(s.id, e.target.value)}
                          style={{
                            padding: '3px 22px 3px 18px', borderRadius: '12px',
                            border: `1.5px solid ${statusColor}30`,
                            fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                            backgroundColor: `${statusColor}14`,
                            color: statusColor,
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='${encodeURIComponent(statusColor)}' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 7px center',
                            lineHeight: 1.3,
                            boxShadow: `0 1px 3px ${statusColor}18`,
                            letterSpacing: '0.01em',
                            transition: 'box-shadow 0.15s, border-color 0.15s',
                          }}
                        >
                        {(() => {
                          const groups = {};
                          IWT_STATUSES.forEach(st => {
                            if (!groups[st.group]) groups[st.group] = [];
                            groups[st.group].push(st);
                          });
                          return Object.entries(groups).map(([group, statuses]) => (
                            <optgroup key={group} label={group}>
                              {statuses.map(st => (
                                <option key={st.value} value={st.value}>{st.label}</option>
                              ))}
                            </optgroup>
                          ));
                        })()}
                        </select>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '2px' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '5px 7px', fontSize: '0.8rem', borderRadius: 6 }}
                          onClick={() => openEdit(s)}
                          title="Edit transfer"
                        ><EditIcon /></button>
                        <button
                          className="btn btn-ghost danger"
                          style={{ padding: '5px 7px', fontSize: '0.8rem', borderRadius: 6 }}
                          onClick={() => handleDelete(s.id)}
                          title="Delete transfer"
                        ><TrashIcon /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', width: '90%', maxWidth: '520px',
            maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--border)'
          }}>
            <h3 style={{ margin: '0 0 1rem', color: 'var(--text-900)' }}>New IWT Transfer</h3>
            {renderFormFields()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)} disabled={actionLoading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={actionLoading}>
                {actionLoading ? 'Creating...' : 'Create Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingShipment && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', width: '90%', maxWidth: '520px',
            maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--border)'
          }}>
            <h3 style={{ margin: '0 0 1rem', color: 'var(--text-900)' }}>Edit IWT Transfer</h3>
            {renderFormFields()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost" onClick={() => { setShowEditModal(false); setEditingShipment(null); }} disabled={actionLoading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpdate} disabled={actionLoading}>
                {actionLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IWTIncoming;
