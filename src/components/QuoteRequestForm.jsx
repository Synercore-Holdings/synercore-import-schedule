import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { getApiUrl } from '../config/api';
import { authFetch } from '../utils/authFetch';
import { useNotification } from '../contexts/NotificationContext';
import { generateQuoteRequestPDF, VOLUMETRIC_FACTORS, calcVolumetricWeight } from '../utils/quoteRequestPdf';
import { CONTAINER_TYPES, PORTS_OF_LOADING, AFRICAN_PORTS } from '../utils/costingCalculations';
import { groupRatesByRoute, convertToUSD } from '../utils/quoteRequestRates';
import * as XLSX from 'xlsx';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Doughnut, Bar as BarChart, Line as LineChart } from 'react-chartjs-2';

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
const EMPTY_RATE_FORM = { quoted_rate: '', quoted_rate_non_stackable: '', quoted_currency: 'USD', quote_reference: '', quoted_transit_days: '', quote_notes: '' };

const TRANSPORT_LABELS = { sea: 'Sea', air: 'Air', road: 'Road' };

// Month-bucketing convention shared with ForwarderCarrierReport/WarehouseStored —
// "YYYY-MM" keyed off when the request was created.
const getMonthKey = (req) => {
  if (!req?.created_at) return null;
  const d = new Date(req.created_at);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key) => new Date(`${key}-01`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

// Falls back to the legacy single cargo_description/hs_code fields for
// requests created before the multi-product Products section existed.
const productSummary = (req) => {
  if (req.products && req.products.length > 0) {
    return req.products.map(p => p.hs_code ? `${p.name} (HS ${p.hs_code})` : p.name).join('; ');
  }
  return req.cargo_description || '';
};

// Days since a "sent" request last changed status — approximates when it was sent,
// since there's no dedicated sent_at column. Used to flag forwarders going quiet.
const daysSinceSent = (req) => {
  const d = new Date(req.updated_at || req.created_at);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};
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

const EMPTY_PRODUCT_LINE = { name: '', hs_code: '', qty: '', weight_kg: '', value: '', value_currency: 'USD' };

const EMPTY_FORM = {
  forwarder_name: '', forwarder_email: '', transport_mode: 'sea', container_type: '', incoterm: '',
  origin: '', destination: '', collection_address: '', supplier_name: '', products: [{ ...EMPTY_PRODUCT_LINE }],
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
  products: (req.products && req.products.length > 0)
    ? req.products.map(p => ({ name: p.name || '', hs_code: p.hs_code || '', qty: p.qty ?? '', weight_kg: p.weight_kg ?? '', value: p.value ?? '', value_currency: p.value_currency || 'USD' }))
    : [{ name: req.cargo_description || '', hs_code: req.hs_code || '', qty: '', weight_kg: '', value: '', value_currency: 'USD' }],
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
const ROW_MENU_WIDTH = 170;

function RowActionsMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    // Closing on scroll/resize avoids the menu drifting away from its trigger
    // button, since its position is computed once (in fixed viewport coords)
    // rather than tracked continuously.
    const handleDismiss = () => setOpen(false);
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open]);

  const visibleItems = items.filter(Boolean);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = visibleItems.length * 33 + 8;
      const openUpward = window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight;
      setMenuPos({
        left: Math.min(Math.max(rect.right - ROW_MENU_WIDTH, 8), window.innerWidth - ROW_MENU_WIDTH - 8),
        top: openUpward ? rect.top - menuHeight - 4 : rect.bottom + 4,
      });
    }
    setOpen(o => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        title="More actions"
        aria-label="More actions"
        style={{
          padding: '5px 9px', backgroundColor: 'var(--surface-2)', color: 'var(--text-700)',
          border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1,
        }}
      >
        ⋯
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', top: menuPos.top, left: menuPos.left, backgroundColor: 'white',
          border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 2000, width: ROW_MENU_WIDTH, overflow: 'hidden',
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
        </div>,
        document.body
      )}
    </>
  );
}

// Manually-maintained exchange rates, used to compare quotes given in
// different currencies. Deliberately admin-set rather than a live feed —
// see server/routes/fxRates.ts for why.
function FxRatesModal({ fxRateRows, savingFxRate, onSave, onClose }) {
  const rateMap = Object.fromEntries(fxRateRows.map(r => [r.currency, r]));
  const [drafts, setDrafts] = useState({});

  const currenciesToMaintain = CURRENCIES.filter(c => c !== 'USD');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200, backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{ backgroundColor: 'white', borderRadius: '10px', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: '#0f172a' }}>FX Rates</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-500)' }}>
          Units of each currency per 1 USD. Used to compare quotes across currencies — set manually, so a rate is only ever what someone deliberately entered.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {currenciesToMaintain.map(currency => {
            const existing = rateMap[currency];
            const draft = drafts[currency] ?? (existing ? String(existing.rate_to_usd) : '');
            return (
              <div key={currency} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ ...labelStyle, marginBottom: 0, width: '50px' }}>{currency}</label>
                  <input
                    type="number" min="0.0001" step="any" style={{ ...inputStyle, flex: 1 }}
                    value={draft}
                    onChange={e => setDrafts(prev => ({ ...prev, [currency]: e.target.value }))}
                    placeholder={`e.g. 18.50 (1 USD = 18.50 ${currency})`}
                  />
                  <button
                    type="button"
                    disabled={!draft || Number(draft) <= 0 || savingFxRate === currency}
                    onClick={() => onSave(currency, draft)}
                    style={{
                      padding: '8px 14px', background: 'var(--navy-900)', color: 'white', border: 'none',
                      borderRadius: '6px', cursor: (!draft || Number(draft) <= 0) ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem', fontWeight: 600, opacity: (!draft || Number(draft) <= 0) ? 0.5 : 1,
                    }}
                  >
                    {savingFxRate === currency ? 'Saving...' : 'Save'}
                  </button>
                </div>
                {existing && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-500)', marginTop: '6px' }}>
                    Last set by {existing.updated_by_username || 'unknown'} on {new Date(existing.updated_at).toLocaleString('en-ZA')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" onClick={onClose} style={{
            padding: '8px 16px', background: 'var(--navy-900)', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
          }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function QuoteRequestForm({ onClose }) {
  const { confirm: confirmAction, showSuccess, showError } = useNotification();
  const [searchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingMeta, setEditingMeta] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [rateModalReq, setRateModalReq] = useState(null);
  const [rateForm, setRateForm] = useState(EMPTY_RATE_FORM);
  const [savingRate, setSavingRate] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareAllRequests, setCompareAllRequests] = useState([]);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [monthFilter, setMonthFilter] = useState('');
  const [dashboardMonthFilter, setDashboardMonthFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [trendRoute, setTrendRoute] = useState('');
  const [bestQuoteIds, setBestQuoteIds] = useState(new Set());
  const [suppliers, setSuppliers] = useState([]);
  const [showCustomSupplier, setShowCustomSupplier] = useState(false);
  const [fxRateRows, setFxRateRows] = useState([]);
  const [showFxModal, setShowFxModal] = useState(false);
  const [savingFxRate, setSavingFxRate] = useState(null);
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

  const fetchFxRates = async () => {
    try {
      const response = await authFetch(getApiUrl('/api/fx-rates'));
      if (response.ok) {
        const result = await response.json();
        setFxRateRows(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch FX rates:', err);
    }
  };

  useEffect(() => {
    fetchFxRates();
  }, []);

  const fxRates = useMemo(
    () => Object.fromEntries(fxRateRows.map(r => [r.currency, Number(r.rate_to_usd)])),
    [fxRateRows]
  );

  const handleSaveFxRate = async (currency, rateToUsd) => {
    setSavingFxRate(currency);
    try {
      const response = await authFetch(getApiUrl(`/api/fx-rates/${currency}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate_to_usd: rateToUsd }),
      });
      if (response.ok) {
        await fetchFxRates();
        showSuccess?.(`${currency} rate updated`);
      } else {
        const err = await response.json().catch(() => ({}));
        showError?.(err.error || 'Failed to save rate');
      }
    } catch (err) {
      console.error('Failed to save FX rate:', err);
      showError?.('Failed to save rate');
    } finally {
      setSavingFxRate(null);
    }
  };

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

  const availableMonths = useMemo(() => {
    const months = new Set();
    requests.forEach(r => { const m = getMonthKey(r); if (m) months.add(m); });
    return [...months].sort().reverse();
  }, [requests]);

  const displayedRequests = useMemo(() => {
    let list = requests;
    if (monthFilter) list = list.filter(r => getMonthKey(r) === monthFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(r => [r.forwarder_name, r.supplier_name, r.origin, r.destination, r.quote_reference, `QR-${String(r.id).padStart(5, '0')}`]
        .some(v => (v || '').toLowerCase().includes(q)));
    }

    const { key, direction } = sortConfig;
    const dir = direction === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (key === 'quoted_rate') { av = av ? Number(av) : null; bv = bv ? Number(bv) : null; }
      if (av === null || av === undefined || av === '') return 1;
      if (bv === null || bv === undefined || bv === '') return -1;
      if (key === 'created_at') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      if (av > bv) return dir;
      if (av < bv) return -dir;
      return 0;
    });
  }, [requests, monthFilter, searchQuery, sortConfig]);

  const toggleSort = (key) => {
    setSortConfig(prev => prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'quoted_rate' ? 'asc' : 'desc' });
  };

  // Shared with Compare Rates — grouped by route so "best" only compares like-for-like quotes.
  const fetchQuotedGroups = async () => {
    const response = await authFetch(getApiUrl('/api/quote-requests?status=quoted'));
    if (!response.ok) throw new Error('Failed to load quoted requests');
    const result = await response.json();
    return groupRatesByRoute(result.data || [], fxRates);
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
      const response = await authFetch(getApiUrl('/api/quote-requests'));
      if (response.ok) {
        const result = await response.json();
        setCompareAllRequests(result.data || []);
      } else {
        showError?.('Failed to load rate comparison');
      }
    } catch (err) {
      console.error('Failed to fetch rate comparison:', err);
      showError?.('Failed to load rate comparison');
    } finally {
      setLoadingCompare(false);
    }
  };

  const dashboardAvailableMonths = useMemo(() => {
    const months = new Set();
    compareAllRequests.forEach(r => { const m = getMonthKey(r); if (m) months.add(m); });
    return [...months].sort().reverse();
  }, [compareAllRequests]);

  // Dashboard stats for the Compare Rates modal — status mix, per-route best-rate
  // groups, and air stackability impact all respect the selected month; the 6-month
  // trend chart deliberately doesn't (it exists to show the cross-month picture).
  const compareDashboard = useMemo(() => {
    const filtered = dashboardMonthFilter
      ? compareAllRequests.filter(r => getMonthKey(r) === dashboardMonthFilter)
      : compareAllRequests;

    const statusCounts = { draft: 0, sent: 0, quoted: 0, expired: 0, cancelled: 0 };
    filtered.forEach(r => {
      if (statusCounts[r.status] !== undefined) statusCounts[r.status]++;
    });

    const routeGroups = groupRatesByRoute(filtered.filter(r => r.status === 'quoted' && r.quoted_rate), fxRates);

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

    // Air freight stackability impact — forwarders often quote a premium for cargo
    // that can't be stacked in the hold; surfaced so the business can see what that
    // premium is actually costing, route by route.
    const airStackabilityQuotes = filtered.filter(r =>
      r.transport_mode === 'air' && r.status === 'quoted' && r.quoted_rate && r.quoted_rate_non_stackable
    );
    const stackabilityPremiums = airStackabilityQuotes.map(r =>
      ((Number(r.quoted_rate_non_stackable) - Number(r.quoted_rate)) / Number(r.quoted_rate)) * 100
    );
    const avgStackabilityPremiumPct = stackabilityPremiums.length
      ? stackabilityPremiums.reduce((sum, p) => sum + p, 0) / stackabilityPremiums.length
      : null;

    // Forwarder win rate — of the routes with a rate on record, what % did each
    // forwarder come in cheapest on (plus their avg quoted transit days, so
    // "cheapest" can be weighed against "slowest"). Respects whatever Period is
    // selected, so switching between "All Time" and a single month gives the
    // overall and the per-month view with the same chart.
    const forwarderStats = {};
    routeGroups.forEach(g => {
      g.entries.forEach((entry, idx) => {
        const name = entry.forwarder_name;
        if (!forwarderStats[name]) forwarderStats[name] = { wins: 0, quotes: 0, transitDays: [] };
        forwarderStats[name].quotes++;
        if (idx === 0) forwarderStats[name].wins++;
        if (entry.quoted_transit_days) forwarderStats[name].transitDays.push(Number(entry.quoted_transit_days));
      });
    });
    const forwarderWinRates = Object.entries(forwarderStats)
      .map(([name, s]) => ({
        name, wins: s.wins, quotes: s.quotes,
        pct: routeGroups.length ? (s.wins / routeGroups.length) * 100 : 0,
        avgTransitDays: s.transitDays.length ? s.transitDays.reduce((a, b) => a + b, 0) / s.transitDays.length : null,
      }))
      .sort((a, b) => b.pct - a.pct);

    // Cost savings from picking the cheapest quote vs. the average of the
    // alternatives on the same route. Same-currency routes total directly (no
    // FX rate needed); mixed-currency routes only count once a manually-set FX
    // rate makes the comparison apples-to-apples, converted to USD.
    const savingsByCurrency = {};
    let convertedSavingsUsd = 0;
    let mixedRoutesSkippedForFx = 0;
    routeGroups.filter(g => g.entries.length > 1).forEach(g => {
      if (!g.mixedCurrency) {
        const best = Number(g.entries[0].quoted_rate);
        const others = g.entries.slice(1).map(e => Number(e.quoted_rate));
        const avgOthers = others.reduce((sum, v) => sum + v, 0) / others.length;
        const savings = avgOthers - best;
        if (savings > 0) {
          const currency = g.entries[0].quoted_currency;
          savingsByCurrency[currency] = (savingsByCurrency[currency] || 0) + savings;
        }
        return;
      }
      if (!g.convertedForComparison) {
        mixedRoutesSkippedForFx++;
        return;
      }
      const bestUsd = convertToUSD(g.entries[0].quoted_rate, g.entries[0].quoted_currency, fxRates);
      const othersUsd = g.entries.slice(1).map(e => convertToUSD(e.quoted_rate, e.quoted_currency, fxRates));
      const avgOthersUsd = othersUsd.reduce((sum, v) => sum + v, 0) / othersUsd.length;
      const savingsUsd = avgOthersUsd - bestUsd;
      if (savingsUsd > 0) convertedSavingsUsd += savingsUsd;
    });

    // Rate trend per route — always all-time regardless of Period, since a
    // single month rarely has more than one data point to trend against.
    const routeTrendMap = new Map();
    compareAllRequests.filter(r => r.status === 'quoted' && r.quoted_rate).forEach(r => {
      const key = `${(r.origin || '').trim().toLowerCase()}|${(r.destination || '').trim().toLowerCase()}|${r.transport_mode}`;
      if (!routeTrendMap.has(key)) {
        routeTrendMap.set(key, { label: `${r.origin || '—'} → ${r.destination || '—'} (${TRANSPORT_LABELS[r.transport_mode] || r.transport_mode})`, entries: [] });
      }
      routeTrendMap.get(key).entries.push(r);
    });
    const routeTrendOptions = [...routeTrendMap.entries()]
      .filter(([, v]) => v.entries.length > 1)
      .map(([key, v]) => ({ key, label: v.label, count: v.entries.length }))
      .sort((a, b) => b.count - a.count);

    return {
      statusCounts,
      openCount: statusCounts.draft + statusCounts.sent,
      routeGroups,
      routesTracked: routeGroups.length,
      multiQuoteRoutes: routeGroups.filter(g => g.entries.length > 1).length,
      monthLabels: monthKeys.map(m => m.label),
      monthCounts: monthKeys.map(m => monthCounts[m.key]),
      airStackabilityQuotes,
      avgStackabilityPremiumPct,
      airChartLabels: airStackabilityQuotes.map(r => `${r.forwarder_name} (${r.origin}→${r.destination})`),
      airStackableData: airStackabilityQuotes.map(r => Number(r.quoted_rate)),
      airNonStackableData: airStackabilityQuotes.map(r => Number(r.quoted_rate_non_stackable)),
      forwarderWinRates,
      savingsByCurrency,
      convertedSavingsUsd,
      mixedRoutesSkippedForFx,
      routeTrendMap,
      routeTrendOptions,
    };
  }, [compareAllRequests, dashboardMonthFilter, fxRates]);

  // Rate trend for the selected route — separate memo since it depends on
  // trendRoute without needing to recompute the whole dashboard.
  const selectedTrend = useMemo(() => {
    const key = trendRoute || compareDashboard.routeTrendOptions[0]?.key;
    const route = key ? compareDashboard.routeTrendMap.get(key) : null;
    if (!route) return null;
    const sorted = [...route.entries].sort((a, b) =>
      new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at)
    );
    return {
      key,
      label: route.label,
      labels: sorted.map(r => new Date(r.updated_at || r.created_at).toLocaleDateString('en-ZA', { month: 'short', day: '2-digit' })),
      rates: sorted.map(r => Number(r.quoted_rate)),
      forwarders: sorted.map(r => r.forwarder_name),
      currency: sorted[0]?.quoted_currency,
    };
  }, [compareDashboard.routeTrendMap, compareDashboard.routeTrendOptions, trendRoute]);

  const handleFieldChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // Gross Weight and Value of Goods auto-populate from the product lines once
  // any line carries a weight/value — otherwise they stay plain manually-typed
  // totals, so requests without a line-item breakdown still work as before.
  const productWeightKey = form.products.map(p => p.weight_kg).join('|');
  useEffect(() => {
    const weightSum = form.products.reduce((sum, p) => sum + (parseFloat(p.weight_kg) || 0), 0);
    if (weightSum > 0) handleFieldChange('gross_weight_kg', String(weightSum));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productWeightKey]);

  const productValueKey = form.products.map(p => `${p.value}|${p.value_currency}`).join('|');
  useEffect(() => {
    const matching = form.products.filter(p => p.value_currency === form.cargo_value_currency);
    const valueSum = matching.reduce((sum, p) => sum + (parseFloat(p.value) || 0), 0);
    if (valueSum > 0) handleFieldChange('cargo_value', String(valueSum));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productValueKey, form.cargo_value_currency]);

  const updateProductLine = (idx, field, value) => setForm(prev => ({
    ...prev,
    products: prev.products.map((p, i) => i === idx ? { ...p, [field]: value } : p),
  }));

  const addProductLine = () => setForm(prev => ({ ...prev, products: [...prev.products, { ...EMPTY_PRODUCT_LINE }] }));

  const removeProductLine = (idx) => setForm(prev => ({
    ...prev,
    products: prev.products.length > 1 ? prev.products.filter((_, i) => i !== idx) : prev.products,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.forwarder_name.trim()) return;
    setSaving(true);
    const isEdit = editingId !== null;
    try {
      const payload = {
        ...form,
        products: form.products.filter(p => p.name.trim()),
        volume_cbm: calcVolumeCbm(form.length_cm, form.width_cm, form.height_cm, form.pallet_count),
      };
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
    setEditingMeta(req);
    setForm(toFormState(req));
    setIsViewMode(false);
    setShowCustomSupplier(false);
    setShowCustomOrigin(false);
    setShowCustomDestination(false);
    setShowForm(true);
  };

  const handleViewClick = (req) => {
    setEditingId(req.id);
    setEditingMeta(req);
    setForm(toFormState(req));
    setIsViewMode(true);
    setShowCustomSupplier(false);
    setShowCustomOrigin(false);
    setShowCustomDestination(false);
    setShowForm(true);
  };

  const handleCopyClick = (req) => {
    setEditingId(null);
    setEditingMeta(null);
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

  const handleWithdrawRate = async (req) => {
    if (!(await confirmAction({
      title: 'Withdraw Rate',
      message: 'This clears the captured rate and moves the request back to "Sent", as if no rate had been received. Continue?',
      type: 'danger',
      confirmText: 'Withdraw',
    }))) return;
    try {
      const response = await authFetch(getApiUrl(`/api/quote-requests/${req.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'sent',
          quoted_rate: '', quoted_rate_non_stackable: '', quote_reference: '', quoted_transit_days: '', quote_notes: '',
        }),
      });
      if (response.ok) {
        await fetchRequests();
        showSuccess?.('Rate withdrawn — request moved back to Sent');
      } else {
        const err = await response.json().catch(() => ({}));
        showError?.(err.error || 'Failed to withdraw rate');
      }
    } catch (err) {
      console.error('Failed to withdraw rate:', err);
      showError?.('Failed to withdraw rate');
    }
  };

  const handleOpenRateModal = (req) => {
    setRateModalReq(req);
    setRateForm({
      quoted_rate: req.quoted_rate ?? '',
      quoted_rate_non_stackable: req.quoted_rate_non_stackable ?? '',
      quoted_currency: req.quoted_currency || 'USD',
      quote_reference: req.quote_reference || '',
      quoted_transit_days: req.quoted_transit_days ?? '',
      quote_notes: req.quote_notes || '',
    });
  };

  const handleSaveRate = async (e) => {
    e.preventDefault();
    if (!rateModalReq) return;

    // Number(''/null/undefined) is 0, so this also catches an explicit "0" —
    // string truthiness alone ("0" is a non-empty, truthy string) let a fake
    // zero rate slip through before.
    let payload = { ...rateForm };
    const hasStackable = Number(payload.quoted_rate) > 0;
    const hasNonStackable = Number(payload.quoted_rate_non_stackable) > 0;
    if (rateModalReq.transport_mode === 'air') {
      if (!hasStackable && !hasNonStackable) {
        showError?.('Enter at least one rate (stackable or non-stackable), greater than 0');
        return;
      }
      // A forwarder who only quotes one figure isn't necessarily quoting the
      // stackable rate — whichever box it landed in is THE rate for this quote,
      // so it belongs in quoted_rate (the field everything else compares on).
      if (!hasStackable) {
        payload = { ...payload, quoted_rate: payload.quoted_rate_non_stackable, quoted_rate_non_stackable: '' };
      }
    } else if (!hasStackable) {
      showError?.('Enter a rate greater than 0');
      return;
    }

    setSavingRate(true);
    try {
      const response = await authFetch(getApiUrl(`/api/quote-requests/${rateModalReq.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, status: 'quoted' }),
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

  const handleExportExcel = (list) => {
    const rows = list.map(r => ({
      'Ref': `QR-${String(r.id).padStart(5, '0')}`,
      'Forwarder': r.forwarder_name,
      'Forwarder Email': r.forwarder_email || '',
      'Origin': r.origin || '',
      'Destination': r.destination || '',
      'Mode': TRANSPORT_LABELS[r.transport_mode] || r.transport_mode,
      'Incoterm': r.incoterm || '',
      'Supplier': r.supplier_name || '',
      'Cargo': productSummary(r),
      'Status': STATUS_LABELS[r.status] || r.status,
      'Quote Ref': r.quote_reference || '',
      'Rate': r.quoted_rate || '',
      'Non-Stackable Rate': r.quoted_rate_non_stackable || '',
      'Currency': r.quoted_currency || '',
      'Transit Days': r.quoted_transit_days || '',
      'Date': r.created_at ? new Date(r.created_at).toLocaleDateString('en-ZA') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quote Requests');
    XLSX.writeFile(wb, `freight-quote-requests-${new Date().toISOString().split('T')[0]}.xlsx`);
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
            onClick={() => { setEditingId(null); setEditingMeta(null); setForm(EMPTY_FORM); setIsViewMode(false); setShowCustomSupplier(false); setShowCustomOrigin(false); setShowCustomDestination(false); setShowForm(true); }}
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search forwarder, supplier, route, ref..."
              style={{ padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #d1d5db', minWidth: '220px' }}
            />
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-500)' }}>Period:</label>
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              style={{ padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #d1d5db', minWidth: '150px' }}
            >
              <option value="">All Time</option>
              {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button
              onClick={() => handleExportExcel(displayedRequests)}
              disabled={displayedRequests.length === 0}
              style={{
                padding: '7px 14px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--navy-900)',
                backgroundColor: 'white', color: 'var(--navy-900)', fontWeight: 600,
                cursor: displayedRequests.length === 0 ? 'not-allowed' : 'pointer', opacity: displayedRequests.length === 0 ? 0.5 : 1,
              }}
            >
              Export
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)' }}>Loading...</div>
        ) : displayedRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
            No {statusFilter === 'all' ? '' : statusFilter} quote requests found{monthFilter ? ` for ${monthLabel(monthFilter)}` : ''}.
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
                  <th
                    style={{ padding: '12px 16px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('quoted_rate')}
                  >
                    Rate Received {sortConfig.key === 'quoted_rate' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    style={{ padding: '12px 16px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('created_at')}
                  >
                    Date {sortConfig.key === 'created_at' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedRequests.map(req => (
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
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{productSummary(req) || '—'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500',
                        ...(STATUS_STYLES[req.status] || STATUS_STYLES.draft)
                      }}>
                        {STATUS_LABELS[req.status] || req.status}
                      </span>
                      {req.status === 'sent' && daysSinceSent(req) >= 3 && (
                        <div style={{
                          marginTop: '4px', fontSize: '0.65rem', fontWeight: 700,
                          color: daysSinceSent(req) >= 7 ? '#dc2626' : '#92400e',
                        }}>
                          {daysSinceSent(req)}d waiting{daysSinceSent(req) >= 7 ? ' — overdue' : ''}
                        </div>
                      )}
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
                          <div style={{ fontWeight: 600, color: 'var(--navy-900)' }}>
                            {req.quoted_currency} {Number(req.quoted_rate).toLocaleString()}
                            {req.transport_mode === 'air' && req.quoted_rate_non_stackable && (
                              <span style={{ fontWeight: 500, color: 'var(--text-500)' }}> (stackable)</span>
                            )}
                          </div>
                          {req.transport_mode === 'air' && req.quoted_rate_non_stackable && (
                            <div style={{ fontSize: '0.75rem', color: '#92400e' }}>
                              {req.quoted_currency} {Number(req.quoted_rate_non_stackable).toLocaleString()} non-stackable
                              {' '}(+{(((req.quoted_rate_non_stackable - req.quoted_rate) / req.quoted_rate) * 100).toFixed(0)}%)
                            </div>
                          )}
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
                          req.status === 'quoted' ? { label: 'Withdraw Rate', onClick: () => handleWithdrawRate(req), danger: true } : null,
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
          position: 'fixed', inset: 0, zIndex: 1100,
          backgroundColor: 'white', overflow: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10,
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>
                {isViewMode
                  ? `View Quote Request QR-${String(editingId).padStart(5, '0')} (Read Only)`
                  : editingId ? `Edit Quote Request QR-${String(editingId).padStart(5, '0')}` : 'New Quote Request'}
              </h2>
              {editingMeta && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: 'var(--text-500)' }}>
                  Created by {editingMeta.requested_by_username || 'unknown'} on {new Date(editingMeta.created_at).toLocaleString('en-ZA')}
                  {editingMeta.updated_by_username && editingMeta.updated_at && editingMeta.updated_at !== editingMeta.created_at && (
                    <> · last updated by {editingMeta.updated_by_username} on {new Date(editingMeta.updated_at).toLocaleString('en-ZA')}</>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); setIsViewMode(false); }}
              style={{
                background: 'rgba(0,0,0,0.05)', border: '1px solid #d1d5db',
                color: '#374151', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer',
                fontSize: '0.85rem', fontWeight: 500,
              }}
            >
              ✕ Close
            </button>
          </div>

          <div style={{ padding: '1.5rem', flex: 1, maxWidth: '800px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
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
                  <label style={labelStyle}>DG Classification</label>
                  <select style={inputStyle} value={form.dg_classification} onChange={e => handleFieldChange('dg_classification', e.target.value)}>
                    <option value="non_dg">Non-DG</option>
                    <option value="dg">DG (Dangerous Goods)</option>
                  </select>
                </div>
                <div />

                <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Products</label>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-500)', marginBottom: '6px' }}>
                    Gross Weight and Value of Goods below are calculated automatically from the lines here.
                  </div>
                  {form.products.map((line, idx) => {
                    const miniLabel = { fontSize: '0.65rem', color: 'var(--text-500)', marginBottom: '2px', display: 'block' };
                    return (
                    <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 32px', gap: '0.5rem', marginBottom: '0.4rem' }}>
                        <div>
                          <label style={miniLabel}>Product</label>
                          <input style={inputStyle} placeholder="Product name" value={line.name} onChange={e => updateProductLine(idx, 'name', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>HS Code</label>
                          <input style={inputStyle} placeholder="HS Code" value={line.hs_code} onChange={e => updateProductLine(idx, 'hs_code', e.target.value)} />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProductLine(idx)}
                          disabled={form.products.length === 1}
                          title="Remove product"
                          style={{
                            padding: 0, height: '36px', alignSelf: 'end', backgroundColor: form.products.length === 1 ? '#f3f4f6' : '#fef2f2',
                            color: form.products.length === 1 ? '#9ca3af' : 'var(--danger)', border: '1px solid #d1d5db',
                            borderRadius: '6px', cursor: form.products.length === 1 ? 'not-allowed' : 'pointer', fontSize: '0.9rem',
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '70px 90px 90px 70px', gap: '0.5rem' }}>
                        <div>
                          <label style={miniLabel}>Qty</label>
                          <input type="number" min="0" step="any" style={inputStyle} placeholder="Qty" value={line.qty} onChange={e => updateProductLine(idx, 'qty', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>Weight (kg)</label>
                          <input type="number" min="0" step="any" style={inputStyle} placeholder="Weight" value={line.weight_kg} onChange={e => updateProductLine(idx, 'weight_kg', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>Value</label>
                          <input type="number" min="0" step="any" style={inputStyle} placeholder="Value" value={line.value} onChange={e => updateProductLine(idx, 'value', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>Currency</label>
                          <select style={inputStyle} value={line.value_currency} onChange={e => updateProductLine(idx, 'value_currency', e.target.value)}>
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={addProductLine}
                    style={{ padding: '6px 12px', backgroundColor: 'var(--surface-2)', color: 'var(--text-700)', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    + Add Product
                  </button>
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Gross Weight (kg)</label>
                  <input type="number" min="0" step="any" style={inputStyle} value={form.gross_weight_kg} onChange={e => handleFieldChange('gross_weight_kg', e.target.value)} />
                  {form.products.some(p => parseFloat(p.weight_kg) > 0) && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-500)', marginTop: '4px' }}>
                      Auto-calculated from product line weights
                    </div>
                  )}
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Value of Goods</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="number" min="0" step="any" style={{ ...inputStyle, flex: 1 }} value={form.cargo_value} onChange={e => handleFieldChange('cargo_value', e.target.value)} />
                    <select style={{ ...inputStyle, width: '90px' }} value={form.cargo_value_currency} onChange={e => handleFieldChange('cargo_value_currency', e.target.value)}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {(() => {
                    const linesWithValue = form.products.filter(p => parseFloat(p.value) > 0);
                    if (linesWithValue.length === 0) return null;
                    const otherCurrencyCount = linesWithValue.filter(p => p.value_currency !== form.cargo_value_currency).length;
                    return (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-500)', marginTop: '4px' }}>
                        {otherCurrencyCount < linesWithValue.length && <div>Auto-calculated from product line values</div>}
                        {otherCurrencyCount > 0 && (
                          <div>
                            {otherCurrencyCount} product line{otherCurrencyCount > 1 ? 's' : ''} valued in a different currency, not included above.
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
                  <label style={labelStyle}>{rateModalReq.transport_mode === 'air' ? 'Rate (Stackable)' : 'Rate *'}</label>
                  <input
                    type="number" min="0.01" step="any" required={rateModalReq.transport_mode !== 'air'} style={inputStyle}
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

                {rateModalReq.transport_mode === 'air' && (
                  <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Rate (Non-Stackable)</label>
                    <input
                      type="number" min="0.01" step="any" style={inputStyle}
                      value={rateForm.quoted_rate_non_stackable}
                      onChange={e => setRateForm(prev => ({ ...prev, quoted_rate_non_stackable: e.target.value }))}
                      placeholder="Only if the forwarder quoted a separate non-stackable rate"
                    />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-500)', marginTop: '4px' }}>
                      Fill in whichever rate(s) the forwarder actually gave you — if it's just one figure, either box is fine.
                    </div>
                    {rateForm.quoted_rate && rateForm.quoted_rate_non_stackable && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-500)', marginTop: '4px' }}>
                        {(((rateForm.quoted_rate_non_stackable - rateForm.quoted_rate) / rateForm.quoted_rate) * 100).toFixed(1)}% premium over the stackable rate
                      </div>
                    )}
                  </div>
                )}

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

      {showFxModal && (
        <FxRatesModal
          fxRateRows={fxRateRows}
          savingFxRate={savingFxRate}
          onSave={handleSaveFxRate}
          onClose={() => setShowFxModal(false)}
        />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-500)' }}>Period:</label>
              <select
                value={dashboardMonthFilter}
                onChange={e => setDashboardMonthFilter(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #d1d5db', minWidth: '150px' }}
              >
                <option value="">All Time</option>
                {dashboardAvailableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setShowFxModal(true)}
                style={{
                  background: 'white', border: '1px solid var(--navy-900)', color: 'var(--navy-900)',
                  padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                }}
              >
                FX Rates
              </button>
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
                  {Object.entries(compareDashboard.savingsByCurrency).map(([currency, amount]) => (
                    <div className="stat-card ring-success" key={currency}>
                      <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>{currency} {amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>Saved vs. Avg Alternative</p>
                    </div>
                  ))}
                  {compareDashboard.convertedSavingsUsd > 0 && (
                    <div className="stat-card ring-success">
                      <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>USD {compareDashboard.convertedSavingsUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>Saved on Mixed-Currency Routes</p>
                    </div>
                  )}
                </div>

                {compareDashboard.mixedRoutesSkippedForFx > 0 && (
                  <div style={{ marginBottom: '1.25rem', fontSize: '0.75rem', color: 'var(--text-500)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚠️ {compareDashboard.mixedRoutesSkippedForFx} mixed-currency route{compareDashboard.mixedRoutesSkippedForFx > 1 ? 's are' : ' is'} excluded from savings — missing an FX rate.
                    <button
                      type="button"
                      onClick={() => setShowFxModal(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--navy-900)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit' }}
                    >
                      Set FX Rates
                    </button>
                  </div>
                )}

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

                {compareDashboard.forwarderWinRates.length > 0 && (
                  <div className="dash-panel" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-900)' }}>Forwarder Win Rate</h4>
                      <span style={{ fontSize: 11, color: 'var(--text-500)' }}>
                        % of routes where they came in with the cheapest rate{dashboardMonthFilter ? ` — ${monthLabel(dashboardMonthFilter)}` : ' — all time'}
                      </span>
                    </div>
                    <div style={{ height: 260 }}>
                      <BarChart
                        data={{
                          labels: compareDashboard.forwarderWinRates.map(f => f.name),
                          datasets: [{
                            data: compareDashboard.forwarderWinRates.map(f => f.pct),
                            backgroundColor: '#22c55e', borderRadius: 4,
                          }],
                        }}
                        options={{
                          responsive: true, maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              callbacks: {
                                label: (ctx) => {
                                  const f = compareDashboard.forwarderWinRates[ctx.dataIndex];
                                  return `${f.pct.toFixed(0)}% (${f.wins} of ${compareDashboard.routeGroups.length} routes)`;
                                },
                              },
                            },
                          },
                          scales: {
                            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                            y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
                          },
                        }}
                      />
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: 16 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-500)', borderBottom: '1px solid #eee' }}>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Forwarder</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Win Rate</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Quotes</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Avg Transit Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareDashboard.forwarderWinRates.map(f => (
                          <tr key={f.name} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 8px' }}>{f.name}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{f.pct.toFixed(0)}%</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-500)' }}>{f.quotes}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-500)' }}>{f.avgTransitDays !== null ? f.avgTransitDays.toFixed(1) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedTrend && (
                  <div className="dash-panel" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: '1rem', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-900)' }}>Rate Trend by Route</h4>
                      <select
                        value={selectedTrend.key}
                        onChange={e => setTrendRoute(e.target.value)}
                        style={{ padding: '5px 8px', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      >
                        {compareDashboard.routeTrendOptions.map(o => (
                          <option key={o.key} value={o.key}>{o.label} ({o.count} quotes)</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ height: 260 }}>
                      <LineChart
                        data={{
                          labels: selectedTrend.labels,
                          datasets: [{
                            label: selectedTrend.currency,
                            data: selectedTrend.rates,
                            borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)',
                            fill: true, tension: 0.2, pointRadius: 4,
                          }],
                        }}
                        options={{
                          responsive: true, maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              callbacks: {
                                label: (ctx) => `${selectedTrend.forwarders[ctx.dataIndex]}: ${selectedTrend.currency} ${ctx.parsed.y.toLocaleString()}`,
                              },
                            },
                          },
                          scales: { x: { grid: { display: false } }, y: { beginAtZero: false } },
                        }}
                      />
                    </div>
                  </div>
                )}

                {compareDashboard.airStackabilityQuotes.length > 0 && (
                  <div className="dash-panel" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-900)' }}>Air Freight — Stackability Impact</h4>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                        Avg +{compareDashboard.avgStackabilityPremiumPct.toFixed(0)}% for non-stackable cargo
                      </span>
                    </div>
                    <div style={{ height: 260 }}>
                      <BarChart
                        data={{
                          labels: compareDashboard.airChartLabels,
                          datasets: [
                            { label: 'Stackable', data: compareDashboard.airStackableData, backgroundColor: '#3b82f6', borderRadius: 4 },
                            { label: 'Non-Stackable', data: compareDashboard.airNonStackableData, backgroundColor: '#f59e0b', borderRadius: 4 },
                          ],
                        }}
                        options={{
                          responsive: true, maintainAspectRatio: false,
                          plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } } },
                          scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { beginAtZero: true } },
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#0f172a' }}>Best Rate by Route</h4>

            {!loadingCompare && compareDashboard.routeGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
                No completed requests with a rate yet{dashboardMonthFilter ? ' for this month' : ' — add a rate to a request to see it here'}.
              </div>
            ) : !loadingCompare && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {compareDashboard.routeGroups.map((group, i) => (
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
                      <div style={{ padding: '6px 14px', backgroundColor: group.convertedForComparison ? '#eff6ff' : '#fef3c7', color: group.convertedForComparison ? '#1e40af' : '#92400e', fontSize: '0.7rem', fontWeight: 600 }}>
                        {group.convertedForComparison
                          ? '✓ Different currencies — BEST determined using manually-set FX rates'
                          : '⚠️ Rates below are in different currencies — set FX Rates to compare accurately'}
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
                              {entry.transport_mode === 'air' && entry.quoted_rate_non_stackable && (
                                <div style={{ fontSize: '0.7rem', fontWeight: 500, color: '#92400e' }}>
                                  {entry.quoted_currency} {Number(entry.quoted_rate_non_stackable).toLocaleString()} non-stackable
                                </div>
                              )}
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
