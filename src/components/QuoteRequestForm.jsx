import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getApiUrl } from '../config/api';
import { authFetch } from '../utils/authFetch';
import { useNotification } from '../contexts/NotificationContext';
import { generateQuoteRequestPDF, VOLUMETRIC_FACTORS, calcVolumetricWeight } from '../utils/quoteRequestPdf';
import { CONTAINER_TYPES, PORTS_OF_LOADING, AFRICAN_PORTS } from '../utils/costingCalculations';
import { groupRatesByRoute } from '../utils/quoteRequestRates';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Doughnut, Bar as BarChart } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement,
  Title, Tooltip, Legend, Filler,
);

const STATUS_STYLES = {
  draft: { backgroundColor: '#f3f4f6', color: '#6b7280' },
  sent: { backgroundColor: '#dbeafe', color: '#1e40af' },
  quoted: { backgroundColor: '#dcfce7', color: '#166534' },
  expired: { backgroundColor: '#fef3c7', color: '#92400e' },
  cancelled: { backgroundColor: '#fef2f2', color: '#dc2626' },
};

// "quoted" internally = rate received, request complete — shown to the user as "Completed"
const STATUS_LABELS = {
  all: 'All', draft: 'Draft', sent: 'Sent', quoted: 'Completed', expired: 'Expired', cancelled: 'Cancelled',
};

const CURRENCIES = ['USD', 'ZAR', 'EUR', 'GBP'];
const EMPTY_RATE_FORM = { quoted_rate: '', quoted_currency: 'USD', quote_reference: '', quoted_transit_days: '', quote_notes: '' };

const TRANSPORT_LABELS = { sea: 'Sea', air: 'Air', road: 'Road' };
const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

// EXW: forwarder collects from the supplier's premises, so we need the full
// pickup address, and delivery is always into one of our two warehouses.
const RECEIVING_WAREHOUSES = [
  'Klapmuts: 58 Main Road, Klapmuts, Cape Town, 7625',
  'Pretoria: Unit 9 Steyns Industrial Park, 433 van Riebeeck Street, Hermanstad, Pretoria, 0001',
];

// Same key used by ImportCosting.jsx so a port added there or here shows up in both places.
const CUSTOM_IMPORT_PORTS_KEY = 'synercore_custom_import_ports';

const normalizePortOptions = (ports) => {
  const seen = new Set();
  return (ports || [])
    .filter(port => port?.value && port?.label)
    .filter(port => {
      const key = String(port.value).toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.label.localeCompare(b.label));
};

const EMPTY_FORM = {
  forwarder_name: '', forwarder_email: '', transport_mode: 'sea', container_type: '', incoterm: '',
  origin: '', destination: '', collection_address: '', supplier_name: '', cargo_description: '', hs_code: '',
  dg_classification: 'non_dg', gross_weight_kg: '', length_cm: '', width_cm: '', height_cm: '',
  pallet_count: '', cargo_value: '', cargo_value_currency: 'USD',
  cargo_ready_date: '', required_date: '', notes: '',
};

// Total CBM = L x W x H (cm) / 1,000,000 x quantity of pallets/packages at those dimensions
const calcVolumeCbm = (length_cm, width_cm, height_cm, pallet_count) => {
  const l = parseFloat(length_cm), w = parseFloat(width_cm), h = parseFloat(height_cm);
  const qty = parseFloat(pallet_count) || 1;
  if (!l || !w || !h) return null;
  return Math.round((l * w * h / 1000000) * qty * 1000) / 1000;
};

const toDateInput = (d) => {
  if (!d) return '';
  if (d === 'TBC') return 'TBC';
  if (typeof d === 'string') return d.slice(0, 10);
  try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
};

const toFormState = (req) => ({
  forwarder_name: req.forwarder_name || '',
  forwarder_email: req.forwarder_email || '',
  transport_mode: req.transport_mode || 'sea',
  container_type: req.container_type || '',
  incoterm: req.incoterm || '',
  origin: req.origin || '',
  destination: req.destination || '',
  collection_address: req.collection_address || '',
  supplier_name: req.supplier_name || '',
  cargo_description: req.cargo_description || '',
  hs_code: req.hs_code || '',
  dg_classification: req.dg_classification || 'non_dg',
  gross_weight_kg: req.gross_weight_kg ?? '',
  length_cm: req.length_cm ?? '',
  width_cm: req.width_cm ?? '',
  height_cm: req.height_cm ?? '',
  pallet_count: req.pallet_count ?? '',
  cargo_value: req.cargo_value ?? '',
  cargo_value_currency: req.cargo_value_currency || 'USD',
  cargo_ready_date: toDateInput(req.cargo_ready_date),
  required_date: toDateInput(req.required_date),
  notes: req.notes || '',
});

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem',
};
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' };
const fieldWrap = { marginBottom: '0.85rem' };

// Secondary row actions tucked behind a "⋯" menu so the Actions column doesn't
// wrap across several lines of buttons. Defined at module scope so its open/
// closed state doesn't reset on every QuoteRequestForm re-render.
function RowActionsMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const visibleItems = items.filter(Boolean);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="More actions"
        aria-label="More actions"
        style={{
          padding: '5px 9px', backgroundColor: 'var(--surface-2)', color: 'var(--text-700)',
          border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1,
        }}
      >
        ⋯
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, backgroundColor: 'white',
          border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 20, minWidth: 150, overflow: 'hidden',
        }}>
          {visibleItems.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { item.onClick(); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                border: 'none', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', backgroundColor: 'white',
                cursor: 'pointer', fontSize: '0.75rem', color: item.danger ? 'var(--danger)' : 'var(--text-700)',
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteRequestForm({ onClose }) {
  const { confirm: confirmAction, showSuccess, showError } = useNotification();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [rateModalReq, setRateModalReq] = useState(null);
  const [rateForm, setRateForm] = useState(EMPTY_RATE_FORM);
  const [savingRate, setSavingRate] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareGroups, setCompareGroups] = useState([]);
  const [compareAllRequests, setCompareAllRequests] = useState([]);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [bestQuoteIds, setBestQuoteIds] = useState(new Set());
  const [suppliers, setSuppliers] = useState([]);
  const [showCustomSupplier, setShowCustomSupplier] = useState(false);
  const [customPorts, setCustomPorts] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CUSTOM_IMPORT_PORTS_KEY) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  const [showCustomOrigin, setShowCustomOrigin] = useState(false);
  const [showCustomDestination, setShowCustomDestination] = useState(false);

  const originPortOptions = normalizePortOptions([...PORTS_OF_LOADING, ...customPorts]);
  const destinationPortOptions = normalizePortOptions([...AFRICAN_PORTS, ...customPorts]);

  const addCustomPort = (portName) => {
    const label = String(portName || '').trim();
    if (!label) return;
    setCustomPorts(prev => {
      const exists = prev.some(p => String(p.value).toUpperCase() === label.toUpperCase());
      const next = exists ? prev : [...prev, { value: label, label: `${label} (Custom)` }];
      try { localStorage.setItem(CUSTOM_IMPORT_PORTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const response = await authFetch(getApiUrl('/api/suppliers'));
        if (response.ok) {
          const result = await response.json();
          const names = (result.data || result || []).map(s => s?.name).filter(Boolean);
          setSuppliers([...new Set(names)].sort());
        }
      } catch (err) {
        console.error('Failed to fetch suppliers:', err);
      }
    };
    fetchSuppliers();
  }, []);

  const handleSupplierChange = (value) => {
    if (value === 'ADD_NEW') {
      setShowCustomSupplier(true);
      handleFieldChange('supplier_name', '');
    } else {
      setShowCustomSupplier(false);
      handleFieldChange('supplier_name', value);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const url = statusFilter === 'all'
        ? getApiUrl('/api/quote-requests')
        : getApiUrl(`/api/quote-requests?status=${statusFilter}`);
      const response = await authFetch(url);
      if (response.ok) {
        const result = await response.json();
        setRequests(result.data || []);
      } else {
        setError('Failed to load quote requests');
      }
    } catch (err) {
      console.error('Failed to fetch quote requests:', err);
      setError('Failed to load quote requests');
    } finally {
      setLoading(false);
    }
    refreshBestQuoteIds();
  };

  // Shared with Compare Rates — grouped by route so "best" only compares like-for-like quotes.
  const fetchQuotedGroups = async () => {
    const response = await authFetch(getApiUrl('/api/quote-requests?status=quoted'));
    if (!response.ok) throw new Error('Failed to load quoted requests');
    const result = await response.json();
    return groupRatesByRoute(result.data || []);
  };

  const refreshBestQuoteIds = async () => {
    try {
      const groups = await fetchQuotedGroups();
      setBestQuoteIds(new Set(groups.map(g => g.entries[0]?.id).filter(Boolean)));
    } catch (err) {
      console.error('Failed to fetch best quotes:', err);
    }
  };

  const handleOpenCompare = async () => {
    setShowCompare(true);
    setLoadingCompare(true);
    try {
      const [groups, allResponse] = await Promise.all([
        fetchQuotedGroups(),
        authFetch(getApiUrl('/api/quote-requests')),
      ]);
      setCompareGroups(groups);
      if (allResponse.ok) {
        const result = await allResponse.json();
        setCompareAllRequests(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch rate comparison:', err);
      showError?.('Failed to load rate comparison');
    } finally {
      setLoadingCompare(false);
    }
  };

  // Dashboard stats for the Compare Rates modal — status mix and a monthly
  // received-rates trend, on top of the per-route comparison groups.
  const compareDashboard = useMemo(() => {
    const statusCounts = { draft: 0, sent: 0, quoted: 0, expired: 0, cancelled: 0 };
    compareAllRequests.forEach(r => {
      if (statusCounts[r.status] !== undefined) statusCounts[r.status]++;
    });

    const monthKeys = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-ZA', { month: 'short' }) });
    }
    const monthCounts = Object.fromEntries(monthKeys.map(m => [m.key, 0]));
    compareAllRequests
      .filter(r => r.status === 'quoted' && r.quoted_rate)
      .forEach(r => {
        const d = new Date(r.updated_at || r.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthCounts[key] !== undefined) monthCounts[key]++;
      });

    return {
      statusCounts,
      openCount: statusCounts.draft + statusCounts.sent,
      routesTracked: compareGroups.length,
      multiQuoteRoutes: compareGroups.filter(g => g.entries.length > 1).length,
      monthLabels: monthKeys.map(m => m.label),
      monthCounts: monthKeys.map(m => monthCounts[m.key]),
    };
  }, [compareAllRequests, compareGroups]);

  const handleFieldChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.forwarder_name.trim()) return;
    setSaving(true);
    const isEdit = editingId !== null;
    try {
      const payload = { ...form, volume_cbm: calcVolumeCbm(form.length_cm, form.width_cm, form.height_cm, form.pallet_count) };
      const url = isEdit ? getApiUrl(`/api/quote-requests/${editingId}`) : getApiUrl('/api/quote-requests');
      const response = await authFetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const result = await response.json();
        setShowForm(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        await fetchRequests();
        generateQuoteRequestPDF(result.data);
        showSuccess?.(isEdit ? 'Quote request updated — PDF downloaded' : 'Quote request created — PDF downloaded');
      } else {
        const err = await response.json().catch(() => ({}));
        showError?.(err.error || `Failed to ${isEdit ? 'update' : 'create'} quote request`);
      }
    } catch (err) {
      console.error(`Failed to ${isEdit ? 'update' : 'create'} quote request:`, err);
      showError?.(`Failed to ${isEdit ? 'update' : 'create'} quote request`);
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (req) => {
    setEditingId(req.id);
    setForm(toFormState(req));
    setIsViewMode(false);
    setShowCustomSupplier(false);
    setShowCustomOrigin(false);
    setShowCustomDestination(false);
    setShowForm(true);
  };

  const handleViewClick = (req) => {
    setEditingId(req.id);
    setForm(toFormState(req));
    setIsViewMode(true);
    setShowCustomSupplier(false);
    setShowCustomOrigin(false);
    setShowCustomDestination(false);
    setShowForm(true);
  };

  const handleCopyClick = (req) => {
    setEditingId(null);
    setForm({ ...toFormState(req), forwarder_name: '', forwarder_email: '' });
    setIsViewMode(false);
    setShowCustomSupplier(false);
    setShowCustomOrigin(false);
    setShowCustomDestination(false);
    setShowForm(true);
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      const response = await authFetch(getApiUrl(`/api/quote-requests/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (response.ok) fetchRequests();
    } catch (err) {
      console.error('Failed to update request:', err);
    }
  };

  const handleOpenRateModal = (req) => {
    setRateModalReq(req);
    setRateForm({
      quoted_rate: req.quoted_rate ?? '',
      quoted_currency: req.quoted_currency || 'USD',
      quote_reference: req.quote_reference || '',
      quoted_transit_days: req.quoted_transit_days ?? '',
      quote_notes: req.quote_notes || '',
    });
  };

  const handleSaveRate = async (e) => {
    e.preventDefault();
    if (!rateModalReq) return;
    setSavingRate(true);
    try {
      const response = await authFetch(getApiUrl(`/api/quote-requests/${rateModalReq.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rateForm, status: 'quoted' }),
      });
      if (response.ok) {
        setRateModalReq(null);
        await fetchRequests();
        showSuccess?.('Rate captured — request marked complete');
      } else {
        const err = await response.json().catch(() => ({}));
        showError?.(err.error || 'Failed to save rate');
      }
    } catch (err) {
      console.error('Failed to save rate:', err);
      showError?.('Failed to save rate');
    } finally {
      setSavingRate(false);
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction({ title: 'Delete Quote Request', message: 'Are you sure you want to delete this request?', type: 'danger', confirmText: 'Delete' }))) return;
    try {
      const response = await authFetch(getApiUrl(`/api/quote-requests/${id}`), { method: 'DELETE' });
      if (response.ok) fetchRequests();
    } catch (err) {
      console.error('Failed to delete request:', err);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'white', overflow: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Freight Quote Requests</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-500)', fontSize: '0.8rem' }}>Request and track rates from forwarders/shipping agents</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setIsViewMode(false); setShowCustomSupplier(false); setShowCustomOrigin(false); setShowCustomDestination(false); setShowForm(true); }}
            style={{
              background: 'var(--navy-900)', border: 'none', color: 'white',
              padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            }}
          >
            + New Quote Request
          </button>
          <button
            onClick={handleOpenCompare}
            style={{
              background: 'white', border: '1px solid var(--navy-900)', color: 'var(--navy-900)',
              padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            }}
          >
            Compare Rates
          </button>
          <button
            onClick={() => onClose ? onClose() : window.history.back()}
            style={{
              background: 'rgba(0,0,0,0.05)', border: '1px solid #d1d5db',
              color: '#374151', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 500,
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem', flex: 1 }}>
        {error && (
          <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', marginBottom: '1rem' }}>
            {error}
            <button onClick={() => setError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>x</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {['all', 'draft', 'sent', 'quoted', 'expired', 'cancelled'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: '8px 16px',
                backgroundColor: statusFilter === status ? 'var(--navy-900)' : 'var(--surface-2)',
                color: statusFilter === status ? 'white' : 'var(--text-700)',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '0.85rem', fontWeight: statusFilter === status ? '600' : '400',
              }}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)' }}>Loading...</div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
            No {statusFilter === 'all' ? '' : statusFilter} quote requests found.
          </div>
        ) : (
          <div className="dash-panel" style={{ padding: 0, overflow: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Ref</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Forwarder</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Route</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Supplier</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Mode</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Incoterm</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Cargo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Quote Ref</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Rate Received</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.8rem' }}>QR-{String(req.id).padStart(5, '0')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 500 }}>{req.forwarder_name}</div>
                      {req.forwarder_email && <div style={{ fontSize: '0.75rem', color: 'var(--text-500)' }}>{req.forwarder_email}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                      {req.origin || '—'} → {req.destination || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>{req.supplier_name || '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem' }}>{TRANSPORT_LABELS[req.transport_mode] || req.transport_mode}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem' }}>{req.incoterm || '—'}</td>
                    <td style={{ padding: '12px 16px', maxWidth: '220px' }}>
                      {req.dg_classification === 'dg' && (
                        <span style={{
                          display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem',
                          fontWeight: 700, backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                          marginBottom: '4px',
                        }}>
                          DG
                        </span>
                      )}
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{req.cargo_description || '—'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500',
                        ...(STATUS_STYLES[req.status] || STATUS_STYLES.draft)
                      }}>
                        {STATUS_LABELS[req.status] || req.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-500)' }}>
                      {req.quote_reference || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem' }}>
                      {req.quoted_rate ? (
                        <div>
                          {bestQuoteIds.has(req.id) && (
                            <span style={{
                              display: 'inline-block', fontSize: '0.65rem', fontWeight: 700, color: '#166534',
                              backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '4px', marginBottom: '3px',
                            }}>
                              BEST
                            </span>
                          )}
                          <div style={{ fontWeight: 600, color: 'var(--navy-900)' }}>{req.quoted_currency} {Number(req.quoted_rate).toLocaleString()}</div>
                          {req.quoted_transit_days && <div style={{ fontSize: '0.7rem', color: 'var(--text-500)' }}>{req.quoted_transit_days} days transit</div>}
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-500)' }}>
                      {new Date(req.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'flex-start' }}>
                        <button
                          onClick={() => handleViewClick(req)}
                          style={{ padding: '5px 8px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                        >
                          View
                        </button>
                        {(req.status === 'draft' || req.status === 'sent') && (
                          <button
                            onClick={() => handleOpenRateModal(req)}
                            style={{ padding: '5px 8px', backgroundColor: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                          >
                            Add Rate
                          </button>
                        )}
                        {req.status === 'quoted' && (
                          <button
                            onClick={() => handleOpenRateModal(req)}
                            style={{ padding: '5px 8px', backgroundColor: 'var(--surface-2)', color: 'var(--text-700)', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                          >
                            Edit Rate
                          </button>
                        )}
                        <RowActionsMenu items={[
                          { label: 'Edit', onClick: () => handleEditClick(req) },
                          { label: 'Copy to New Request', onClick: () => handleCopyClick(req) },
                          { label: 'Download PDF', onClick: () => generateQuoteRequestPDF(req) },
                          req.status === 'draft' ? { label: 'Mark Sent', onClick: () => handleUpdateStatus(req.id, 'sent') } : null,
                          (req.status === 'draft' || req.status === 'sent') ? { label: 'Cancel', onClick: () => handleUpdateStatus(req.id, 'cancelled') } : null,
                          { label: 'Delete', onClick: () => handleDelete(req.id), danger: true },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '10px', maxWidth: '640px', width: '100%',
            maxHeight: '90vh', overflow: 'auto', padding: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#0f172a' }}>
              {isViewMode
                ? `View Quote Request QR-${String(editingId).padStart(5, '0')} (Read Only)`
                : editingId ? `Edit Quote Request QR-${String(editingId).padStart(5, '0')}` : 'New Quote Request'}
            </h3>
            {isViewMode && (
              <div style={{ padding: '8px 12px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: 600, borderRadius: '6px', marginBottom: '0.75rem' }}>
                🔒 Read-only view — this request cannot be edited from here.
              </div>
            )}
            <form onSubmit={isViewMode ? (e) => e.preventDefault() : handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem', ...(isViewMode ? { pointerEvents: 'none', opacity: 0.85 } : {}) }}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Forwarder / Agent Name *</label>
                  <input style={inputStyle} value={form.forwarder_name} onChange={e => handleFieldChange('forwarder_name', e.target.value)} required />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Forwarder Email</label>
                  <input type="email" style={inputStyle} value={form.forwarder_email} onChange={e => handleFieldChange('forwarder_email', e.target.value)} />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Transport Mode</label>
                  <select
                    style={inputStyle}
                    value={form.transport_mode}
                    onChange={e => {
                      const mode = e.target.value;
                      setForm(prev => ({ ...prev, transport_mode: mode, container_type: mode === 'air' ? '' : prev.container_type }));
                      setShowCustomOrigin(false);
                      setShowCustomDestination(false);
                    }}
                  >
                    <option value="sea">Sea</option>
                    <option value="air">Air</option>
                    <option value="road">Road</option>
                  </select>
                </div>
                {form.transport_mode !== 'air' && (
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Container Type</label>
                    <select style={inputStyle} value={form.container_type} onChange={e => handleFieldChange('container_type', e.target.value)}>
                      <option value="">— Select —</option>
                      {CONTAINER_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                      <option value="LCL">LCL / Not Containerized</option>
                    </select>
                  </div>
                )}
                <div style={fieldWrap}>
                  <label style={labelStyle}>Incoterm</label>
                  <select
                    style={inputStyle}
                    value={form.incoterm}
                    onChange={e => {
                      const nextIncoterm = e.target.value;
                      const wasExw = form.incoterm === 'EXW';
                      const isExw = nextIncoterm === 'EXW';
                      setForm(prev => ({
                        ...prev,
                        incoterm: nextIncoterm,
                        // reset destination when toggling EXW so a free-text value
                        // isn't mistaken for one of the fixed warehouse addresses (or vice versa)
                        destination: wasExw !== isExw ? '' : prev.destination,
                        collection_address: isExw ? prev.collection_address : '',
                      }));
                      setShowCustomDestination(false);
                    }}
                  >
                    <option value="">—</option>
                    {INCOTERMS.map(term => <option key={term} value={term}>{term}</option>)}
                  </select>
                </div>

                <div style={{ ...fieldWrap, gridColumn: form.incoterm === 'EXW' ? '1 / -1' : 'auto' }}>
                  <label style={labelStyle}>Origin</label>
                  {form.transport_mode === 'sea' ? (
                    (!editingId && !showCustomOrigin) ? (
                      <select
                        style={inputStyle}
                        value={form.origin}
                        onChange={e => {
                          if (e.target.value === 'ADD_NEW') { setShowCustomOrigin(true); handleFieldChange('origin', ''); }
                          else handleFieldChange('origin', e.target.value);
                        }}
                      >
                        <option value="">Select a port...</option>
                        {originPortOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        <option value="ADD_NEW">+ Add New Port</option>
                      </select>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          style={{ ...inputStyle, flex: 1 }}
                          value={form.origin}
                          onChange={e => handleFieldChange('origin', e.target.value)}
                          onBlur={() => { if (!editingId && showCustomOrigin && form.origin.trim()) addCustomPort(form.origin.trim()); }}
                          placeholder={editingId ? 'Port / city, country' : 'Enter new port name'}
                          autoFocus={!editingId && showCustomOrigin}
                        />
                        {!editingId && showCustomOrigin && (
                          <button
                            type="button"
                            onClick={() => { setShowCustomOrigin(false); handleFieldChange('origin', ''); }}
                            title="Back to port dropdown"
                            aria-label="Back to port dropdown"
                            style={{ padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            ↩
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <input style={inputStyle} value={form.origin} onChange={e => handleFieldChange('origin', e.target.value)} placeholder="Port / city, country" />
                  )}
                </div>

                {form.incoterm === 'EXW' && (
                  <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Collection Address (Full Address) *</label>
                    <textarea
                      style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }}
                      value={form.collection_address}
                      onChange={e => handleFieldChange('collection_address', e.target.value)}
                      placeholder="Full pickup address at the supplier's premises"
                      required={form.incoterm === 'EXW'}
                    />
                  </div>
                )}

                <div style={{ ...fieldWrap, gridColumn: form.incoterm === 'EXW' ? '1 / -1' : 'auto' }}>
                  <label style={labelStyle}>Destination {form.incoterm === 'EXW' && '(Delivery Warehouse)'}</label>
                  {form.incoterm === 'EXW' ? (
                    <select style={inputStyle} value={form.destination} onChange={e => handleFieldChange('destination', e.target.value)} required>
                      <option value="">— Select warehouse —</option>
                      {RECEIVING_WAREHOUSES.map(addr => <option key={addr} value={addr}>{addr}</option>)}
                    </select>
                  ) : form.transport_mode === 'sea' ? (
                    (!editingId && !showCustomDestination) ? (
                      <select
                        style={inputStyle}
                        value={form.destination}
                        onChange={e => {
                          if (e.target.value === 'ADD_NEW') { setShowCustomDestination(true); handleFieldChange('destination', ''); }
                          else handleFieldChange('destination', e.target.value);
                        }}
                      >
                        <option value="">Select a port...</option>
                        {destinationPortOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        <option value="ADD_NEW">+ Add New Port</option>
                      </select>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          style={{ ...inputStyle, flex: 1 }}
                          value={form.destination}
                          onChange={e => handleFieldChange('destination', e.target.value)}
                          onBlur={() => { if (!editingId && showCustomDestination && form.destination.trim()) addCustomPort(form.destination.trim()); }}
                          placeholder={editingId ? 'Port / city, country' : 'Enter new port name'}
                          autoFocus={!editingId && showCustomDestination}
                        />
                        {!editingId && showCustomDestination && (
                          <button
                            type="button"
                            onClick={() => { setShowCustomDestination(false); handleFieldChange('destination', ''); }}
                            title="Back to port dropdown"
                            aria-label="Back to port dropdown"
                            style={{ padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            ↩
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <input style={inputStyle} value={form.destination} onChange={e => handleFieldChange('destination', e.target.value)} placeholder="Port / city, country" />
                  )}
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Supplier</label>
                  {(!editingId && !showCustomSupplier) ? (
                    <select style={inputStyle} value={form.supplier_name} onChange={e => handleSupplierChange(e.target.value)}>
                      <option value="">Select a supplier...</option>
                      {suppliers.map(name => <option key={name} value={name}>{name}</option>)}
                      <option value="ADD_NEW">+ Add New Supplier</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        value={form.supplier_name}
                        onChange={e => handleFieldChange('supplier_name', e.target.value)}
                        placeholder={editingId ? 'Supplier name' : 'Enter new supplier name'}
                        autoFocus={!editingId && showCustomSupplier}
                      />
                      {!editingId && showCustomSupplier && (
                        <button
                          type="button"
                          onClick={() => { setShowCustomSupplier(false); handleFieldChange('supplier_name', ''); }}
                          title="Back to supplier dropdown"
                          aria-label="Back to supplier dropdown"
                          style={{ padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          ↩
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>HS Code</label>
                  <input style={inputStyle} value={form.hs_code} onChange={e => handleFieldChange('hs_code', e.target.value)} />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>DG Classification</label>
                  <select style={inputStyle} value={form.dg_classification} onChange={e => handleFieldChange('dg_classification', e.target.value)}>
                    <option value="non_dg">Non-DG</option>
                    <option value="dg">DG (Dangerous Goods)</option>
                  </select>
                </div>
                <div />

                <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Cargo Description</label>
                  <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={form.cargo_description} onChange={e => handleFieldChange('cargo_description', e.target.value)} />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Gross Weight (kg)</label>
                  <input type="number" min="0" step="any" style={inputStyle} value={form.gross_weight_kg} onChange={e => handleFieldChange('gross_weight_kg', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Value of Goods</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="number" min="0" step="any" style={{ ...inputStyle, flex: 1 }} value={form.cargo_value} onChange={e => handleFieldChange('cargo_value', e.target.value)} />
                    <select style={{ ...inputStyle, width: '90px' }} value={form.cargo_value_currency} onChange={e => handleFieldChange('cargo_value_currency', e.target.value)}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Dimensions per Pallet/Package (cm) — Length x Width x Height x Qty</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem' }}>
                    <input type="number" min="0" step="any" style={inputStyle} placeholder="Length" value={form.length_cm} onChange={e => handleFieldChange('length_cm', e.target.value)} />
                    <input type="number" min="0" step="any" style={inputStyle} placeholder="Width" value={form.width_cm} onChange={e => handleFieldChange('width_cm', e.target.value)} />
                    <input type="number" min="0" step="any" style={inputStyle} placeholder="Height" value={form.height_cm} onChange={e => handleFieldChange('height_cm', e.target.value)} />
                    <input type="number" min="0" step="1" style={inputStyle} placeholder="Qty" value={form.pallet_count} onChange={e => handleFieldChange('pallet_count', e.target.value)} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-500)', marginTop: '4px' }}>
                    = {calcVolumeCbm(form.length_cm, form.width_cm, form.height_cm, form.pallet_count) ?? '—'} CBM total
                    {(() => {
                      const cbm = calcVolumeCbm(form.length_cm, form.width_cm, form.height_cm, form.pallet_count);
                      const volKg = calcVolumetricWeight(cbm, form.transport_mode);
                      return volKg
                        ? ` ≈ ${volKg} kg volumetric (${TRANSPORT_LABELS[form.transport_mode]} factor: ${VOLUMETRIC_FACTORS[form.transport_mode]} kg/m³)`
                        : '';
                    })()}
                  </div>
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Cargo Ready Date</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="date"
                      style={{ ...inputStyle, flex: 1 }}
                      value={form.cargo_ready_date === 'TBC' ? '' : form.cargo_ready_date}
                      disabled={form.cargo_ready_date === 'TBC'}
                      onChange={e => handleFieldChange('cargo_ready_date', e.target.value)}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-700)', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={form.cargo_ready_date === 'TBC'}
                        onChange={e => handleFieldChange('cargo_ready_date', e.target.checked ? 'TBC' : '')}
                      />
                      TBC
                    </label>
                  </div>
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Required Delivery Date</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="date"
                      style={{ ...inputStyle, flex: 1 }}
                      value={form.required_date === 'TBC' ? '' : form.required_date}
                      disabled={form.required_date === 'TBC'}
                      onChange={e => handleFieldChange('required_date', e.target.value)}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-700)', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={form.required_date === 'TBC'}
                        onChange={e => handleFieldChange('required_date', e.target.checked ? 'TBC' : '')}
                      />
                      TBC
                    </label>
                  </div>
                </div>

                <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Notes / Special Instructions</label>
                  <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={form.notes} onChange={e => handleFieldChange('notes', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                {isViewMode ? (
                  <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setIsViewMode(false); }} style={{
                    padding: '8px 16px', background: 'var(--navy-900)', color: 'white', border: 'none',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                  }}>
                    Close
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} style={{
                      padding: '8px 16px', background: 'rgba(0,0,0,0.05)', border: '1px solid #d1d5db',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
                    }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={saving} style={{
                      padding: '8px 16px', background: 'var(--navy-900)', color: 'white', border: 'none',
                      borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600,
                      opacity: saving ? 0.7 : 1,
                    }}>
                      {saving ? 'Saving...' : editingId ? 'Save Changes & Download PDF' : 'Create & Download PDF'}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {rateModalReq && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '10px', maxWidth: '480px', width: '100%',
            maxHeight: '90vh', overflow: 'auto', padding: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: '#0f172a' }}>
              Add Rate Received
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-500)' }}>
              QR-{String(rateModalReq.id).padStart(5, '0')} — {rateModalReq.forwarder_name}
            </p>
            <form onSubmit={handleSaveRate}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 1rem' }}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Rate *</label>
                  <input
                    type="number" min="0" step="any" required style={inputStyle}
                    value={rateForm.quoted_rate}
                    onChange={e => setRateForm(prev => ({ ...prev, quoted_rate: e.target.value }))}
                  />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Currency</label>
                  <select
                    style={inputStyle}
                    value={rateForm.quoted_currency}
                    onChange={e => setRateForm(prev => ({ ...prev, quoted_currency: e.target.value }))}
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Forwarder's Quote Reference</label>
                  <input
                    style={inputStyle}
                    value={rateForm.quote_reference}
                    onChange={e => setRateForm(prev => ({ ...prev, quote_reference: e.target.value }))}
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Transit Days</label>
                  <input
                    type="number" min="0" step="1" style={inputStyle}
                    value={rateForm.quoted_transit_days}
                    onChange={e => setRateForm(prev => ({ ...prev, quoted_transit_days: e.target.value }))}
                  />
                </div>
                <div />

                <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }}
                    value={rateForm.quote_notes}
                    onChange={e => setRateForm(prev => ({ ...prev, quote_notes: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setRateModalReq(null)} style={{
                  padding: '8px 16px', background: 'rgba(0,0,0,0.05)', border: '1px solid #d1d5db',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
                }}>
                  Cancel
                </button>
                <button type="submit" disabled={savingRate} style={{
                  padding: '8px 16px', background: 'var(--success)', color: 'white', border: 'none',
                  borderRadius: '6px', cursor: savingRate ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600,
                  opacity: savingRate ? 0.7 : 1,
                }}>
                  {savingRate ? 'Saving...' : 'Save & Mark Complete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCompare && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          backgroundColor: 'white', overflow: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10,
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Freight Quote Rates Dashboard</h2>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--text-500)', fontSize: '0.8rem' }}>
                Rates received from forwarders, grouped by origin, destination, and mode
              </p>
            </div>
            <button
              onClick={() => setShowCompare(false)}
              style={{
                background: 'rgba(0,0,0,0.05)', border: '1px solid #d1d5db',
                color: '#374151', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer',
                fontSize: '0.85rem', fontWeight: 500,
              }}
            >
              ✕ Close
            </button>
          </div>

          <div style={{ padding: '1.5rem', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
            {loadingCompare ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)' }}>Loading...</div>
            ) : (
              <>
                <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
                  <div className="stat-card ring-success">
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>{compareDashboard.statusCounts.quoted}</h3>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>Rates Received</p>
                  </div>
                  <div className="stat-card ring-warning">
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>{compareDashboard.openCount}</h3>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>Awaiting a Rate</p>
                  </div>
                  <div className="stat-card ring-info">
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>{compareDashboard.routesTracked}</h3>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>Routes Tracked</p>
                  </div>
                  <div className="stat-card">
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>{compareDashboard.multiQuoteRoutes}</h3>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>Routes With Multiple Quotes</p>
                  </div>
                </div>

                {compareAllRequests.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="dash-panel">
                      <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-900)' }}>Requests by Status</h4>
                      <div style={{ height: 260 }}>
                        <Doughnut
                          data={{
                            labels: ['Draft', 'Sent', 'Completed', 'Expired', 'Cancelled'],
                            datasets: [{
                              data: [
                                compareDashboard.statusCounts.draft, compareDashboard.statusCounts.sent,
                                compareDashboard.statusCounts.quoted, compareDashboard.statusCounts.expired,
                                compareDashboard.statusCounts.cancelled,
                              ],
                              backgroundColor: ['#9ca3af', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444'],
                              borderWidth: 2,
                            }],
                          }}
                          options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } }}
                        />
                      </div>
                    </div>
                    <div className="dash-panel">
                      <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-900)' }}>Rates Received — Last 6 Months</h4>
                      <div style={{ height: 260 }}>
                        <BarChart
                          data={{
                            labels: compareDashboard.monthLabels,
                            datasets: [{ data: compareDashboard.monthCounts, backgroundColor: '#3b82f6', borderRadius: 4 }],
                          }}
                          options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#0f172a' }}>Best Rate by Route</h4>

            {!loadingCompare && compareGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
                No completed requests with a rate yet — add a rate to a request to see it here.
              </div>
            ) : !loadingCompare && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {compareGroups.map((group, i) => (
                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', backgroundColor: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--navy-900)' }}>
                        {group.origin} → {group.destination}
                        <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-500)' }}>
                          ({TRANSPORT_LABELS[group.transport_mode] || group.transport_mode})
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-500)' }}>{group.entries.length} quote{group.entries.length > 1 ? 's' : ''}</span>
                    </div>
                    {group.mixedCurrency && (
                      <div style={{ padding: '6px 14px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.7rem', fontWeight: 600 }}>
                        ⚠️ Rates below are in different currencies — compare with care
                      </div>
                    )}
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {group.entries.map((entry, idx) => (
                          <tr key={entry.id} style={{ borderTop: idx > 0 ? '1px solid #eee' : 'none', backgroundColor: idx === 0 ? '#f0fdf4' : 'white' }}>
                            <td style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                              {idx === 0 && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#166534', backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>
                                  BEST
                                </span>
                              )}
                              {entry.forwarder_name}
                            </td>
                            <td style={{ padding: '8px 14px', fontSize: '0.85rem', fontWeight: 600, textAlign: 'right' }}>
                              {entry.quoted_currency} {Number(entry.quoted_rate).toLocaleString()}
                            </td>
                            <td style={{ padding: '8px 14px', fontSize: '0.75rem', color: 'var(--text-500)', textAlign: 'right' }}>
                              {entry.quoted_transit_days ? `${entry.quoted_transit_days} days` : ''}
                            </td>
                            <td style={{ padding: '8px 14px', fontSize: '0.75rem', color: 'var(--text-500)', textAlign: 'right' }}>
                              QR-{String(entry.id).padStart(5, '0')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default QuoteRequestForm;
