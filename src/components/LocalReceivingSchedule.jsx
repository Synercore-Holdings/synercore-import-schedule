import React, { useState, useMemo, useEffect, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../utils/authFetch';
import { authUtils } from '../utils/auth';
import { getApiUrl } from '../config/api';
import { useNotification } from '../contexts/NotificationContext';
import { STATUS_COLORS } from '../types/shipment';
import {
  Truck, AlertTriangle, CalendarClock, Package, Search, Store, AlertOctagon,
} from 'lucide-react';

const LocalFileUpload = lazy(() => import('./LocalFileUpload'));

const WAREHOUSES = ['PRETORIA', 'KLAPMUTS', 'OFFSITE'];

const LOCAL_STATUSES = [
  { value: 'in_transit_roadway', label: 'In Transit Road', group: 'Transit' },
  { value: 'arrived_pta', label: 'Arrived PTA', group: 'Arrived' },
  { value: 'arrived_klm', label: 'Arrived KLM', group: 'Arrived' },
  { value: 'arrived_offsite', label: 'Arrived Offsite', group: 'Arrived' },
  { value: 'unloading', label: 'Unloading', group: 'Post-Arrival' },
  { value: 'inspection_pending', label: 'Inspection Pending', group: 'Post-Arrival' },
  { value: 'inspecting', label: 'Inspecting', group: 'Post-Arrival' },
  { value: 'inspection_passed', label: 'Inspection Passed', group: 'Post-Arrival' },
  { value: 'inspection_failed', label: 'Inspection Failed', group: 'Post-Arrival' },
  { value: 'receiving', label: 'Receiving', group: 'Warehouse' },
  { value: 'stored', label: 'Stored', group: 'Warehouse' },
  { value: 'delayed_supplier', label: 'Delayed - Supplier', group: 'Delayed' },
  { value: 'delayed_documents', label: 'Delayed - Documents', group: 'Delayed' },
  { value: 'cancelled', label: 'Cancelled', group: 'Other' },
];

const STAT_CARDS = [
  { key: 'total', status: null, label: 'Total Local', icon: Truck, ring: 'ring-accent', tint: 'rgba(5,150,105,0.1)' },
  { key: 'overdue', status: 'overdue', label: 'Overdue', icon: AlertTriangle, ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
  { key: 'due_this_week', status: 'due_this_week', label: 'Due This Week', icon: CalendarClock, ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
  { key: 'in_transit_roadway', status: 'in_transit_roadway', label: 'In Transit', icon: Truck, ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
  { key: 'arrived', status: 'arrived', label: 'Arrived', icon: Package, ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
  { key: 'post_arrival', status: 'post_arrival', label: 'Post-Arrival', icon: Search, ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
  { key: 'stored', status: 'stored', label: 'Stored', icon: Store, ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
  { key: 'delayed', status: 'delayed', label: 'Delayed', icon: AlertOctagon, ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
];

function LocalReceivingSchedule({ shipments, onCreateShipment, onUpdateShipment, onDeleteShipment, onFileUpload, loading }) {
  const { showSuccess, showError, confirm: confirmAction } = useNotification();
  const isAdmin = authUtils.getUser()?.role === 'admin';
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
    supplier: '',
    productName: '',
    quantity: '',
    palletQty: '',
    receivingWarehouse: '',
    carrier: '',
    expectedArrival: '',
    dateShipped: '',
    latestStatus: 'in_transit_roadway',
    notes: '',
  });

  // Filter to local shipments only (show all statuses including post-arrival)
  const localShipments = useMemo(() =>
    shipments.filter(s => s.shipmentType === 'local'),
    [shipments]
  );

  // Fetch truck info for local shipments
  useEffect(() => {
    const arrived = localShipments.filter(s =>
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
  }, [localShipments]);

  // Date helpers (used by stats, sorting, and overdue detection)
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

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const endOfWeek = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + (7 - d.getDay()));
    return d;
  }, [today]);

  const isOverdue = (s) => {
    if (['arrived_pta', 'arrived_klm', 'arrived_offsite', 'unloading', 'inspection_pending',
         'inspecting', 'inspection_passed', 'receiving', 'stored'].includes(s.latestStatus)) return false;
    const expected = parseExpectedDate(s.vesselName);
    if (!expected) return false;
    return expected < today;
  };

  const isDueThisWeek = (s) => {
    if (!['in_transit_roadway'].includes(s.latestStatus)) return false;
    const expected = parseExpectedDate(s.vesselName);
    if (!expected) return false;
    return expected >= today && expected <= endOfWeek;
  };

  // Stats
  const stats = useMemo(() => {
    const arrivedStatuses = ['arrived_pta', 'arrived_klm', 'arrived_offsite'];
    const postArrivalStatuses = ['unloading', 'inspection_pending', 'inspecting', 'inspection_passed', 'inspection_failed', 'receiving'];
    const delayedStatuses = ['delayed_supplier', 'delayed_documents', 'delayed_port', 'delayed_customs'];
    return {
      total: localShipments.length,
      overdue: localShipments.filter(s => isOverdue(s)).length,
      due_this_week: localShipments.filter(s => isDueThisWeek(s)).length,
      in_transit_roadway: localShipments.filter(s => s.latestStatus === 'in_transit_roadway').length,
      arrived: localShipments.filter(s => arrivedStatuses.includes(s.latestStatus)).length,
      post_arrival: localShipments.filter(s => postArrivalStatuses.includes(s.latestStatus)).length,
      stored: localShipments.filter(s => s.latestStatus === 'stored').length,
      delayed: localShipments.filter(s => delayedStatuses.includes(s.latestStatus)).length,
    };
  }, [localShipments, today, endOfWeek]);

  // Filter
  const filtered = useMemo(() => {
    let list = localShipments;

    if (statusFilter) {
      const arrivedStatuses = ['arrived_pta', 'arrived_klm', 'arrived_offsite'];
      const postArrivalStatuses = ['unloading', 'inspection_pending', 'inspecting', 'inspection_passed', 'inspection_failed', 'receiving'];
      const delayedStatuses = ['delayed_supplier', 'delayed_documents', 'delayed_port', 'delayed_customs'];
      if (statusFilter === 'overdue') {
        list = list.filter(s => isOverdue(s));
      } else if (statusFilter === 'due_this_week') {
        list = list.filter(s => isDueThisWeek(s));
      } else if (statusFilter === 'arrived') {
        list = list.filter(s => arrivedStatuses.includes(s.latestStatus));
      } else if (statusFilter === 'post_arrival') {
        list = list.filter(s => postArrivalStatuses.includes(s.latestStatus));
      } else if (statusFilter === 'delayed') {
        list = list.filter(s => delayedStatuses.includes(s.latestStatus));
      } else {
        list = list.filter(s => s.latestStatus === statusFilter);
      }
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(s =>
        (s.orderRef || '').toLowerCase().includes(q) ||
        (s.supplier || '').toLowerCase().includes(q) ||
        (s.productName || '').toLowerCase().includes(q)
      );
    }

    // Sort by earliest expected date first, no-date at bottom
    list.sort((a, b) => {
      const dateA = parseExpectedDate(a.vesselName);
      const dateB = parseExpectedDate(b.vesselName);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA - dateB;
    });

    return list;
  }, [localShipments, statusFilter, searchTerm, today, endOfWeek]);

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
    orderRef: '', supplier: '', productName: '', quantity: '', palletQty: '',
    receivingWarehouse: '', carrier: '', expectedArrival: '', dateShipped: '', latestStatus: 'in_transit_roadway', notes: '',
  });

  const handleCreate = async () => {
    if (!form.orderRef || !form.supplier) {
      showError('Order Ref and Supplier are required');
      return;
    }
    setActionLoading(true);
    try {
      await onCreateShipment({
        orderRef: form.orderRef,
        supplier: form.supplier,
        productName: form.productName,
        quantity: form.quantity ? Number(form.quantity) : undefined,
        palletQty: form.palletQty ? Number(form.palletQty) : undefined,
        receivingWarehouse: form.receivingWarehouse,
        forwardingAgent: form.carrier, // use forwarding_agent field for carrier
        latestStatus: form.latestStatus,
        notes: form.notes,
        vesselName: form.expectedArrival || '', // store expected arrival in vessel_name for local
        dateShipped: form.dateShipped || '',
        shipmentType: 'local',
      });
      showSuccess('Local shipment created');
      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      showError(err.message || 'Failed to create shipment');
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (s) => {
    setEditingShipment(s);
    setForm({
      orderRef: s.orderRef || '',
      supplier: s.supplier || '',
      productName: s.productName || '',
      quantity: s.quantity || '',
      palletQty: s.palletQty || '',
      receivingWarehouse: s.receivingWarehouse || '',
      carrier: s.forwardingAgent || '',
      expectedArrival: s.vesselName || '', // stored in vessel_name for local
      dateShipped: s.dateShipped ? new Date(s.dateShipped).toISOString().split('T')[0] : '',
      latestStatus: s.latestStatus || 'in_transit_roadway',
      notes: s.notes || '',
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!editingShipment) return;
    setActionLoading(true);
    try {
      await onUpdateShipment(editingShipment.id, {
        orderRef: form.orderRef,
        supplier: form.supplier,
        productName: form.productName,
        quantity: form.quantity ? Number(form.quantity) : undefined,
        palletQty: form.palletQty ? Number(form.palletQty) : undefined,
        receivingWarehouse: form.receivingWarehouse,
        forwardingAgent: form.carrier,
        latestStatus: form.latestStatus,
        notes: form.notes,
        vesselName: form.expectedArrival || '',
        dateShipped: form.dateShipped || '',
      });
      showSuccess('Shipment updated');
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
      title: 'Delete Shipment',
      message: 'Are you sure you want to delete this local shipment?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'warning',
    });
    if (!confirmed) return;
    try {
      await onDeleteShipment(id);
      showSuccess('Shipment deleted');
    } catch (err) {
      showError(err.message);
    }
  };

  const handleClearAll = async () => {
    if (!isAdmin) return;
    const count = localShipments.length;
    if (count === 0) {
      showError('No local shipments to clear');
      return;
    }
    const confirmed = await confirmAction({
      title: 'Clear All Local Shipments',
      message: `Permanently delete all ${count} local shipment${count === 1 ? '' : 's'}? This cannot be undone.`,
      confirmText: 'Clear All',
      cancelText: 'Cancel',
      type: 'warning',
    });
    if (!confirmed) return;
    setActionLoading(true);
    let deleted = 0;
    let failed = 0;
    for (const s of localShipments) {
      try {
        await onDeleteShipment(s.id);
        deleted++;
      } catch {
        failed++;
      }
    }
    setActionLoading(false);
    if (failed === 0) {
      showSuccess(`Cleared ${deleted} local shipment${deleted === 1 ? '' : 's'}`);
    } else {
      showError(`Cleared ${deleted}, failed ${failed}`);
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

  // SVG icon helpers for action buttons
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
      {[
        { key: 'orderRef', label: 'Order / Ref *', placeholder: 'e.g. APO0012345' },
        { key: 'supplier', label: 'Supplier *', placeholder: 'Supplier name' },
        { key: 'productName', label: 'Product', placeholder: 'Product description' },
      ].map(f => (
        <div key={f.key}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>{f.label}</label>
          <input type="text" value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
            className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder={f.placeholder} />
        </div>
      ))}

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
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Carrier</label>
        <input type="text" value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })}
          className="input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. DSV, DHL, AGX" />
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
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Destination Warehouse</label>
        <select value={form.receivingWarehouse} onChange={e => setForm({ ...form, receivingWarehouse: e.target.value })}
          className="select" style={{ width: '100%', boxSizing: 'border-box' }}>
          <option value="">Select warehouse...</option>
          {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Status</label>
        <select value={form.latestStatus} onChange={e => setForm({ ...form, latestStatus: e.target.value })}
          className="select" style={{ width: '100%', boxSizing: 'border-box' }}>
          {(() => {
            const groups = {};
            LOCAL_STATUSES.forEach(st => {
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
      {/* Header row: title left, action right */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-900)', fontSize: '1.2rem', lineHeight: 1.3 }}>
            Local Receiving Schedule
          </h2>
          <p style={{ margin: '2px 0 0', color: 'var(--text-500)', fontSize: '0.8rem' }}>
            Track local deliveries, road shipments, and inter-warehouse transfers
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isAdmin && (
            <button
              className="btn btn-danger"
              style={{ fontSize: '0.82rem', padding: '7px 14px' }}
              onClick={handleClearAll}
              disabled={actionLoading || localShipments.length === 0}
              title="Delete all local shipments (admin only)"
            >
              Clear All
            </button>
          )}
          <button className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={() => { resetForm(); setShowCreateModal(true); }}>
            + New Local Shipment
          </button>
        </div>
      </div>

      {/* Compact toolbar: stat chips + search + import — one unified zone */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem',
        flexWrap: 'wrap', padding: '6px 0',
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      }}>
        {/* Stat chips — inline, minimal */}
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

        {/* Spacer */}
        <div style={{ flex: 1, minWidth: 8 }} />

        {/* Right group: search + import, visually connected */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Filter chip — inline next to search when active */}
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

          {/* Search with icon */}
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
              placeholder="Search..."
            />
          </div>

          {/* Import button — compact, sits with search */}
          <button
            onClick={() => document.getElementById('local-import-toggle')?.click()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--surface)', cursor: 'pointer', fontSize: '0.78rem',
              fontWeight: 500, color: 'var(--text-600)', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--text-400)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            title="Import from Excel file"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import
          </button>
        </div>
      </div>

      {/* File Import — collapsible panel, triggered by Import button above */}
      <React.Suspense fallback={null}>
        <LocalFileUpload onFileUpload={onFileUpload} loading={loading} />
      </React.Suspense>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: '0.35rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-500)' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-500)' }}>
            No local shipments found. Click "+ New Local Shipment" to add one.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Order Ref</th>
                  <th>Supplier</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Pallets</th>
                  <th>Carrier</th>
                  <th>Expected</th>
                  <th>Warehouse</th>
                  <th>Truck</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const overdue = isOverdue(s);
                  const dueThisWeek = !overdue && isDueThisWeek(s);
                  const statusColor = STATUS_COLORS[s.latestStatus] || '#6c757d';
                  return (
                  <tr key={s.id} style={
                    overdue ? { boxShadow: 'inset 3px 0 0 var(--danger)' }
                    : dueThisWeek ? { boxShadow: 'inset 3px 0 0 #d97706' }
                    : {}
                  }>
                    <td style={{ fontWeight: 600 }}>{s.orderRef || '-'}</td>
                    <td>{s.supplier || '-'}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.productName || ''}>{s.productName || '-'}</td>
                    <td>{s.quantity || '-'}</td>
                    <td>{s.palletQty ? (Math.round(s.palletQty) || 1) : '-'}</td>
                    <td>{s.forwardingAgent || '-'}</td>
                    <td>
                      <span style={{ fontWeight: overdue || dueThisWeek ? 600 : 400, color: overdue ? 'var(--danger)' : dueThisWeek ? '#d97706' : 'inherit' }}>
                        {formatDate(s.vesselName)}
                      </span>
                      {overdue && (
                        <span style={{
                          display: 'inline-block', marginLeft: 6, fontSize: '0.6rem', fontWeight: 700,
                          padding: '1px 5px', borderRadius: 4,
                          backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--danger)',
                          verticalAlign: 'middle', letterSpacing: '0.3px',
                        }}>OVERDUE</span>
                      )}
                      {dueThisWeek && (
                        <span style={{
                          display: 'inline-block', marginLeft: 6, fontSize: '0.6rem', fontWeight: 700,
                          padding: '1px 5px', borderRadius: 4,
                          backgroundColor: 'rgba(245,158,11,0.1)', color: '#d97706',
                          verticalAlign: 'middle', letterSpacing: '0.3px',
                        }}>THIS WEEK</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>{s.receivingWarehouse || '-'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-500)' }}>
                      {truckInfoMap[s.id] ? (
                        <span>{truckInfoMap[s.id].carrier}{truckInfoMap[s.id].vehicle_reg ? ` (${truckInfoMap[s.id].vehicle_reg})` : ''}</span>
                      ) : '-'}
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                        {/* Status dot */}
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
                          onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 2px 6px ${statusColor}28`; e.currentTarget.style.borderColor = `${statusColor}60`; }}
                          onMouseLeave={e => { e.currentTarget.style.boxShadow = `0 1px 3px ${statusColor}18`; e.currentTarget.style.borderColor = `${statusColor}30`; }}
                        >
                        {(() => {
                          const groups = {};
                          LOCAL_STATUSES.forEach(st => {
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
                          title="Edit shipment"
                        ><EditIcon /></button>
                        <button
                          className="btn btn-ghost danger"
                          style={{ padding: '5px 7px', fontSize: '0.8rem', borderRadius: 6 }}
                          onClick={() => handleDelete(s.id)}
                          title="Delete shipment"
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

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', width: '90%', maxWidth: '480px',
            maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border)'
          }}>
            <h3 style={{ margin: '0 0 1rem', color: 'var(--text-900)' }}>New Local Shipment</h3>
            {renderFormFields()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)} disabled={actionLoading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={actionLoading}>
                {actionLoading ? 'Creating...' : 'Create Shipment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingShipment && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', width: '90%', maxWidth: '480px',
            maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border)'
          }}>
            <h3 style={{ margin: '0 0 1rem', color: 'var(--text-900)' }}>Edit Local Shipment</h3>
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

export default LocalReceivingSchedule;
