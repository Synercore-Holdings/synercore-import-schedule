import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import useFormDraft from '../hooks/useFormDraft';
import { getApiUrl } from '../config/api';
import { authFetch } from '../utils/authFetch';
import { authUtils } from '../utils/auth';
import {
  calculateAllTotals,
  formatCurrency,
  formatNumber,
  lookupOceanFreightRate,
  AFRICAN_PORTS,
  PORTS_OF_LOADING,
} from '../utils/costingCalculations';
import { generateEstimatePDF, generateEstimatePDFBase64 } from '../utils/costingPdf';
import { useNotification } from '../contexts/NotificationContext';
import CostingReportsPanel from './CostingReportsPanel';
import CostingEstimatesTable from './CostingEstimatesTable';
import CostingFormSections from './CostingFormSections';
import { EmailEstimateModal, RequestCostingModal } from './CostingModals';
import CostingRequests from './CostingRequests';

const INITIAL_FORM_STATE = {
  transport_mode: 'sea', // 'sea' or 'air'
  reference_number: '',
  manual_previous_cost_per_kg_zar: 0,
  manual_previous_cost_date: '',
  // Origin details
  country_of_origin: '',
  port_of_loading: '',
  // Destination details
  country_of_destination: 'South Africa',
  port_of_discharge: 'CPT',
  load_type: 'FCL',
  shipping_line: '',
  routing: '',
  frequency: '',
  transit_time_days: 30,
  inco_terms: 'CIF',
  inco_term_place: 'CPT',
  container_type: "20' Dry Container",
  quantity: 1,
  supplier_name: '',
  validity_date: '',
  costing_date: new Date().toISOString().split('T')[0],
  payment_terms: '',
  roe_origin: '',  // USD/ZAR
  roe_eur: '',     // EUR/ZAR
  // Ocean Freight
  ocean_freight_usd: 0,
  ocean_freight_eur: 0,
  // Origin Charges
  origin_charge_usd: 0,
  origin_charge_eur: 0,
  // Local Charges (Transport/Cartage) - Default rates from AFI rate sheet
  local_cartage_cpt_klapmuts_20ton_zar: 6970,
  local_cartage_cpt_klapmuts_28ton_zar: 7500,
  transport_dbn_to_pretoria_20ft_zar: 16640,
  transport_dbn_to_pretoria_40ft_zar: 20380,
  transport_dbn_to_whs_zar: 5350,
  unpack_reload_zar: 5430,
  storage_zar: 15,
  storage_days: 0,
  warehouse_handling_rate_per_kg_zar: 0.62,
  warehouse_handling_events: 2,
  warehouse_storage_rate_per_kg_month_zar: 0.82,
  warehouse_storage_months: 1,
  warehouse_chargeable_weight_kg: 0,
  outlying_depot_surcharge_zar: 964,
  local_cartage_dbn_whs_pretoria_opt_a_zar: 17000,
  local_cartage_dbn_whs_pretoria_opt_b_zar: 19260,
  local_cartage_dbn_whs_pretoria_6m_zar: 10370,
  local_cartage_dbn_whs_pretoria_12m_zar: 14330,
  transport_pe_coega_to_pretoria_zar: 0,
  // Destination Charges (Port/Shipping) - Default rates from AFI rate sheet
  shipping_line_charges_zar: 0,
  cargo_dues_20ft_zar: 1879.72,
  cargo_dues_40ft_zar: 3759.42,
  cto_fee_zar: 360,
  port_health_inspection_zar: 620,
  daff_inspection_zar: 620,
  state_vet_cancellation_fee_zar: 290,
  jnb_turn_in_zar: 0,
  bill_of_lading_fee_zar: 0,
  manifest_filing_zar: 0,
  currency_adjustment_factor_zar: 0,
  degrouping_zar: 0,
  edi_fee_zar: 0,
  communication_dest_zar: 0,
  documentation_fee_dest_zar: 0,
  cfs_lcl_handling_out_zar: 0,
  delivery_release_order_zar: 0,
  cartage_dest_zar: 0,
  fuel_surcharge_dest_zar: 0,
  agency_fee_dest_zar: 0,
  handover_fee_zar: 0,
  facility_fee_zar: 0,
  // Products - each product in the container
  products: [
    { _id: Date.now(), name: '', hs_code: '', pack_size: '', pack_type: '', weight_kg: 0, rate_per_kg: 0, duty_percent: 0, duty_schedule1_percent: 0, currency: 'USD', invoice_value: 0 }
  ],
  // Customs & Duties
  roe_customs: '',  // ROE for customs calculation
  customs_declaration_zar: 590,
  agency_fee_percentage: 3.5,
  agency_fee_min: 1187,
  // Airfreight fields
  airline_name: '',
  flight_number: '',
  airport_of_departure: '',
  airport_of_arrival: '',
  actual_weight_kg: 0,
  dimensions_length_cm: 0,
  dimensions_width_cm: 0,
  dimensions_height_cm: 0,
  number_of_pieces: 1,
  volumetric_divisor: 6000,
  airfreight_usd: 0,
  airfreight_eur: 0,
  airfreight_origin_charges_usd: 0,
  airfreight_origin_charges_eur: 0,
  fuel_surcharge_usd: 0,
  fuel_surcharge_eur: 0,
  security_surcharge_usd: 0,
  security_surcharge_eur: 0,
  screening_fee_zar: 0,
  awb_fee_zar: 0,
  airline_handling_fee_zar: 0,
  airport_transfer_fee_zar: 0,
  cartage_airport_to_whs_zar: 0,
  air_edi_fee_zar: 0,
  air_import_documentation_zar: 0,
  airline_landside_delivery_zar: 0,
  airfreight_insurance_percent: 0,
  // Last Mile Charges - AFI/ALLMARK April 2026
  last_mile_service_type: '',
  last_mile_route: '',
  last_mile_weight_kg: 0,
  last_mile_fuel_levy_percent: 0,
  last_mile_manual_charge_zar: 0,
  last_mile_extra_charges_zar: 0,
  last_mile_charges: [
    { _id: Date.now() + 1, service_type: '', route: '', weight_kg: 0, fuel_levy_percent: 0, manual_charge_zar: 0, extra_charges_zar: 0 }
  ],
  // Metadata
  notes: '',
  status: 'draft',
};

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

const createCustomPortOption = (name) => {
  const label = String(name || '').trim();
  if (!label) return null;
  return { value: label, label: `${label} (Custom)` };
};

const getEstimateDateValue = (estimate) => {
  const value = estimate.costing_date || estimate.created_at || '';
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatEstimateDate = (estimate) => {
  const value = estimate.costing_date || estimate.created_at;
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatPercentChange = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const getPeriodLabel = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!startDate || !endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '-';

  const days = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  if (days < 45) return `${days} day${days === 1 ? '' : 's'}`;

  const months = Math.round(days / 30.4375);
  if (months < 18) return `${months} month${months === 1 ? '' : 's'}`;

  const years = Math.round((months / 12) * 10) / 10;
  return `${years} year${years === 1 ? '' : 's'}`;
};

function ReferenceChangeView({ estimates, onClose }) {
  const referenceRows = useMemo(() => {
    const groups = new Map();

    (estimates || [])
      .filter(est => est.status !== 'archived' && String(est.reference_number || '').trim())
      .forEach(est => {
        const reference = String(est.reference_number || '').trim();
        const totals = calculateAllTotals(est);
        const landedPerKg = parseFloat(totals.all_in_warehouse_cost_per_kg_zar) || 0;
        const totalLanded = parseFloat(totals.total_landed_cost_zar) || 0;
        const manualPreviousCostPerKg = parseFloat(est.manual_previous_cost_per_kg_zar) || 0;
        const item = {
          est,
          reference,
          landedPerKg,
          totalLanded,
          manualPreviousCostPerKg,
          manualPreviousCostDate: est.manual_previous_cost_date,
        };
        groups.set(reference.toLowerCase(), [...(groups.get(reference.toLowerCase()) || []), item]);
      });

    return Array.from(groups.values())
      .filter(group => group.length > 1 || group.some(item => item.manualPreviousCostPerKg > 0))
      .flatMap(group => {
        const sorted = group.sort((a, b) => {
          const dateDiff = getEstimateDateValue(a.est) - getEstimateDateValue(b.est);
          if (dateDiff !== 0) return dateDiff;
          return String(a.est.id || '').localeCompare(String(b.est.id || ''));
        });

        return sorted.map((item, index) => {
          const previous = index > 0 ? sorted[index - 1] : null;
          const baselineCostPerKg = previous?.landedPerKg || item.manualPreviousCostPerKg || 0;
          const baselineLabel = previous ? 'Previous costing' : item.manualPreviousCostPerKg > 0 ? 'Historical baseline' : '';
          const baselineDate = previous ? (previous.est.costing_date || previous.est.created_at) : item.manualPreviousCostDate;
          const currentDate = item.est.costing_date || item.est.created_at;
          const periodLabel = baselineCostPerKg > 0 ? getPeriodLabel(baselineDate, currentDate) : '-';
          const changePercent = baselineCostPerKg > 0
            ? ((item.landedPerKg - baselineCostPerKg) / baselineCostPerKg) * 100
            : null;
          return { ...item, previous, baselineCostPerKg, baselineLabel, baselineDate, periodLabel, changePercent, runNumber: index + 1, runCount: sorted.length };
        });
      })
      .sort((a, b) => {
        const latestA = getEstimateDateValue(a.est);
        const latestB = getEstimateDateValue(b.est);
        return latestB - latestA;
      });
  }, [estimates]);

  const latestChanges = referenceRows.filter(row => row.baselineCostPerKg > 0);
  const averageChange = latestChanges.length > 0
    ? latestChanges.reduce((sum, row) => sum + (row.changePercent || 0), 0) / latestChanges.length
    : null;
  const increases = latestChanges.filter(row => row.changePercent > 0).length;
  const decreases = latestChanges.filter(row => row.changePercent < 0).length;

  return (
    <div className="dash-panel" style={{ marginBottom: '1rem', overflow: 'hidden' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#111827' }}>Reference Cost Changes</h3>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.82rem' }}>
            Compares landed cost/kg against the previous costing, or a manual previous price when entered.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: '#f3f4f6', color: '#374151', fontSize: '0.78rem', fontWeight: 600 }}>
            {latestChanges.length} comparisons
          </span>
          <span style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: '#ecfdf5', color: '#047857', fontSize: '0.78rem', fontWeight: 600 }}>
            {decreases} decreases
          </span>
          <span style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '0.78rem', fontWeight: 600 }}>
            {increases} increases
          </span>
          <span style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: 600 }}>
            Avg {formatPercentChange(averageChange)}
          </span>
          <button
            onClick={onClose}
            style={{ padding: '7px 12px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}
          >
            Close
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Reference</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Date</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Supplier</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Current Cost/KG</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Previous Cost/KG</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Period</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Change</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Total Landed</th>
            </tr>
          </thead>
          <tbody>
            {referenceRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#9ca3af' }}>
                  No repeated references found yet.
                </td>
              </tr>
            ) : (
              referenceRows.map((row) => {
                const isIncrease = row.changePercent > 0;
                const isDecrease = row.changePercent < 0;
                return (
                  <tr key={`${row.est.id}-${row.runNumber}`} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px 16px', color: '#111827', fontWeight: 600 }}>
                      {row.reference}
                      <div style={{ marginTop: '2px', color: '#6b7280', fontSize: '0.72rem', fontWeight: 500 }}>
                        {row.runNumber} of {row.runCount}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6b7280', whiteSpace: 'nowrap' }}>{formatEstimateDate(row.est)}</td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>{row.est.supplier_name || '-'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#d97706', fontWeight: 600 }}>{formatCurrency(row.landedPerKg)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>
                      {row.baselineCostPerKg > 0 ? (
                        <>
                          <div>{formatCurrency(row.baselineCostPerKg)}</div>
                          {row.baselineLabel && (
                            <div style={{ marginTop: '2px', fontSize: '0.72rem', color: '#9ca3af' }}>{row.baselineLabel}</div>
                          )}
                          {row.baselineDate && (
                            <div style={{ marginTop: '2px', fontSize: '0.72rem', color: '#9ca3af' }}>
                              {new Date(row.baselineDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                          )}
                        </>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>
                      {row.periodLabel !== '-' ? `Over ${row.periodLabel}` : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        minWidth: '72px',
                        padding: '5px 8px',
                        borderRadius: '6px',
                        backgroundColor: isIncrease ? '#fef2f2' : isDecrease ? '#ecfdf5' : '#f3f4f6',
                        color: isIncrease ? '#b91c1c' : isDecrease ? '#047857' : '#6b7280',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                      }}>
                        {row.baselineCostPerKg > 0 ? formatPercentChange(row.changePercent) : 'Base'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{formatCurrency(row.totalLanded)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportCosting() {
  const [searchParams] = useSearchParams();
  const { showSuccess, showError, confirm: confirmAction } = useNotification();
  const currentUser = authUtils.getUser();
  const isAdmin = currentUser?.role === 'admin';
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formExpanded, setFormExpanded] = useState(true);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [editingId, setEditingId] = useState(null);
  const { clearDraft: clearCostingDraft, confirmClose: confirmCloseCosting } = useFormDraft(
    `costing_${editingId || 'new'}`, formData, setFormData, { enabled: showForm }
  );
  const [calculatedTotals, setCalculatedTotals] = useState({});
  const [exchangeRate, setExchangeRate] = useState(null);
  const [_rateLoading, setRateLoading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailEstimate, setEmailEstimate] = useState(null);
  const [showReports, setShowReports] = useState(false);
  const [showReferenceChanges, setShowReferenceChanges] = useState(false);
  const [customImportPorts, setCustomImportPorts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_IMPORT_PORTS_KEY) || '[]');
    } catch {
      return [];
    }
  });

  // Costing request state (for non-admin users)
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [myRequests, setMyRequests] = useState([]);

  // Admin request queue state
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [showRequests, setShowRequests] = useState(false);
  const initialTransportModeFilter = ['sea', 'air'].includes(searchParams.get('mode'))
    ? searchParams.get('mode')
    : 'all';

  const importPortOptions = normalizePortOptions([...PORTS_OF_LOADING, ...customImportPorts]);
  const importDischargePortOptions = normalizePortOptions([...AFRICAN_PORTS, ...customImportPorts]);

  const addCustomImportPort = (portName, field) => {
    const newPort = createCustomPortOption(portName);
    if (!newPort) return false;

    setCustomImportPorts(prev => {
      const exists = prev.some(port => String(port.value).toUpperCase() === newPort.value.toUpperCase());
      const next = exists ? prev : normalizePortOptions([...prev, newPort]);
      localStorage.setItem(CUSTOM_IMPORT_PORTS_KEY, JSON.stringify(next));
      return next;
    });
    handleInputChange(field, newPort.value);
    return true;
  };

  // Warn before leaving with unsaved form data
  useEffect(() => {
    if (!showForm) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [showForm]);

  // Fetch estimates on mount
  useEffect(() => {
    fetchEstimates();
    fetchExchangeRate();
    fetchSuppliers();
    if (!isAdmin) fetchMyRequests();
    if (isAdmin) fetchPendingRequestCount();
  }, []);

  // Recalculate totals when form data changes
  useEffect(() => {
    const totals = calculateAllTotals(formData);
    setCalculatedTotals(totals);
  }, [formData]);

  useEffect(() => {
    if (!showForm || !exchangeRate?.rate || parseFloat(formData.roe_origin) > 0) return;
    setFormData(prev => ({
      ...prev,
      roe_origin: parseFloat(prev.roe_customs) || exchangeRate.rate,
    }));
  }, [showForm, exchangeRate, formData.roe_origin, formData.roe_customs]);

  // Auto-sync Origin Charges with Products in Container totals under FOB/FCA/EXW.
  // Under these Incoterms, origin value is the FOB goods value (buyer's customs basis),
  // not a separate forwarder fee — so it tracks the Products totals directly.
  useEffect(() => {
    if (!showForm) return;
    const incoTerms = (formData.inco_terms || '').toUpperCase();
    if (!['FOB', 'FCA', 'EXW'].includes(incoTerms)) return;

    const products = formData.products || [];
    const invoiceTotalUsd = products.reduce(
      (sum, p) => sum + ((!p.currency || p.currency === 'USD') ? (parseFloat(p.invoice_value) || 0) : 0),
      0
    );
    const invoiceTotalEur = products.reduce(
      (sum, p) => sum + ((p.currency === 'EUR') ? (parseFloat(p.invoice_value) || 0) : 0),
      0
    );

    const currentUsd = parseFloat(formData.origin_charge_usd) || 0;
    const currentEur = parseFloat(formData.origin_charge_eur) || 0;

    if (Math.abs(currentUsd - invoiceTotalUsd) > 0.01 || Math.abs(currentEur - invoiceTotalEur) > 0.01) {
      setFormData(prev => ({
        ...prev,
        origin_charge_usd: invoiceTotalUsd,
        origin_charge_eur: invoiceTotalEur,
      }));
    }
  }, [formData.products, formData.inco_terms, showForm]);

  const fetchEstimates = async () => {
    try {
      setLoading(true);
      const response = await authFetch(getApiUrl('/api/costing?direction=import&limit=5000'));
      if (response.ok) {
        const result = await response.json();
        setEstimates(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch estimates:', err);
      setError('Failed to load cost estimates');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyRequests = async () => {
    try {
      const response = await authFetch(getApiUrl('/api/costing-requests'));
      if (response.ok) {
        const result = await response.json();
        setMyRequests(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch costing requests:', err);
    }
  };

  const fetchPendingRequestCount = async () => {
    try {
      const response = await authFetch(getApiUrl('/api/costing-requests?status=pending'));
      if (response.ok) {
        const result = await response.json();
        setPendingRequestCount((result.data || []).length);
      }
    } catch (err) {
      console.error('Failed to fetch pending request count:', err);
    }
  };

  const handleSubmitRequest = async (formData) => {
    try {
      const response = await authFetch(getApiUrl('/api/costing-requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setShowRequestModal(false);
        fetchMyRequests();
      } else {
        setError('Failed to submit costing request');
      }
    } catch (err) {
      console.error('Failed to submit costing request:', err);
      setError('Failed to submit costing request');
    }
  };

  const fetchExchangeRate = async () => {
    try {
      setRateLoading(true);
      const response = await authFetch(getApiUrl('/api/costing/exchange-rate/current'));
      if (response.ok) {
        const result = await response.json();
        setExchangeRate(result.data);
        if (result.data?.rate && !formData.roe_origin) {
          setFormData(prev => ({ ...prev, roe_origin: result.data.rate }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch exchange rate:', err);
    } finally {
      setRateLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await authFetch(getApiUrl('/api/suppliers'));
      if (response.ok) {
        const result = await response.json();
        setSuppliers(result.data || result || []);
      }
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
    }
  };

  const createSupplier = async () => {
    if (!newSupplierName.trim()) return;
    try {
      const response = await authFetch(getApiUrl('/api/suppliers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSupplierName.trim() }),
      });
      if (response.ok) {
        const result = await response.json();
        const newSupplier = result.data || result;
        // Add to suppliers list and select it
        setSuppliers(prev => [...prev, newSupplier]);
        setFormData(prev => ({ ...prev, supplier_name: newSupplier.name }));
        setShowAddSupplier(false);
        setNewSupplierName('');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create supplier');
      }
    } catch (err) {
      console.error('Failed to create supplier:', err);
      setError('Failed to create supplier');
    }
  };



  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'last_mile_service_type') {
        updated.last_mile_route = '';
      }
      if (field === 'inco_terms' && ['FOB', 'FCA', 'EXW'].includes(String(value || '').toUpperCase())) {
        const currentOceanFreightUsd = parseFloat(updated.ocean_freight_usd) || 0;
        const currentOceanFreightEur = parseFloat(updated.ocean_freight_eur) || 0;
        if (updated.transport_mode !== 'air' && currentOceanFreightUsd === 0 && currentOceanFreightEur === 0) {
          const rate = lookupOceanFreightRate(
            updated.port_of_loading,
            updated.shipping_line,
            updated.container_type
          );
          if (rate !== null) {
            updated.ocean_freight_usd = rate;
          }
        }
      }
      // Auto-fill ocean freight when port, shipping line, or container type changes
      if (field === 'port_of_loading' || field === 'shipping_line' || field === 'container_type') {
        const rate = lookupOceanFreightRate(
          field === 'port_of_loading' ? value : updated.port_of_loading,
          field === 'shipping_line' ? value : updated.shipping_line,
          field === 'container_type' ? value : updated.container_type
        );
        if (rate !== null) {
          updated.ocean_freight_usd = rate;
        }
      }
      return updated;
    });
  };

  const addLastMileCharge = () => {
    setFormData(prev => ({
      ...prev,
      last_mile_charges: [
        ...(prev.last_mile_charges || []),
        { _id: Date.now() + Math.random(), service_type: '', route: '', weight_kg: 0, fuel_levy_percent: 0, manual_charge_zar: 0, extra_charges_zar: 0 }
      ],
    }));
  };

  const removeLastMileCharge = (index) => {
    setFormData(prev => {
      const nextCharges = (prev.last_mile_charges || []).filter((_, i) => i !== index);
      return {
        ...prev,
        last_mile_charges: nextCharges.length > 0
          ? nextCharges
          : [{ _id: Date.now() + Math.random(), service_type: '', route: '', weight_kg: 0, fuel_levy_percent: 0, manual_charge_zar: 0, extra_charges_zar: 0 }],
      };
    });
  };

  const updateLastMileCharge = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      last_mile_charges: (prev.last_mile_charges || []).map((item, i) => {
        if (i !== index) return item;
        const updatedItem = { ...item, [field]: value };
        if (field === 'service_type') {
          updatedItem.route = '';
        }
        return updatedItem;
      }),
    }));
  };

  // Product helpers
  const addProduct = () => {
    setFormData(prev => ({
      ...prev,
      products: [
        ...prev.products,
        { _id: Date.now() + Math.random(), name: '', hs_code: '', pack_size: '', pack_type: '', weight_kg: 0, rate_per_kg: 0, duty_percent: 0, duty_schedule1_percent: 0, currency: 'USD', invoice_value: 0 }
      ]
    }));
  };

  const removeProduct = (index) => {
    setFormData(prev => {
      const newProducts = prev.products.filter((_, i) => i !== index);
      return {
        ...prev,
        products: newProducts,
      };
    });
  };

  const updateProduct = (index, field, value) => {
    setFormData(prev => {
      const newProducts = prev.products.map((item, i) => {
        if (i !== index) return item;

        const updatedItem = { ...item, [field]: value };

        // Auto-calculate invoice_value when weight or rate_per_kg changes
        if (field === 'weight_kg' || field === 'rate_per_kg') {
          const weight = field === 'weight_kg' ? (parseFloat(value) || 0) : (parseFloat(item.weight_kg) || 0);
          const rate = field === 'rate_per_kg' ? (parseFloat(value) || 0) : (parseFloat(item.rate_per_kg) || 0);
          updatedItem.invoice_value = Math.round(weight * rate * 100) / 100;
        }

        return updatedItem;
      });

      return {
        ...prev,
        products: newProducts,
      };
    });
  };

  // Calculate total weight from all products
  const getTotalWeight = () => {
    return (formData.products || []).reduce((sum, p) => sum + (parseFloat(p.weight_kg) || 0), 0);
  };

  // Calculate product customs values
  const calculateProductCustomsValues = (product) => {
    const roeCustoms = parseFloat(formData.roe_customs) || parseFloat(formData.roe_origin) || 0;
    const roeEur = parseFloat(formData.roe_eur) || 0;
    const invoiceValue = parseFloat(product.invoice_value) || 0;
    const dutyPercent = parseFloat(product.duty_percent) || 0;
    const dutySchedule1Percent = parseFloat(product.duty_schedule1_percent) || 0;
    const currency = product.currency || 'USD';

    // Convert to ZAR based on currency
    let roe = roeCustoms;
    if (currency === 'EUR') roe = roeEur;
    if (currency === 'ZAR') roe = 1;

    const customsValue = invoiceValue * roe;
    const totalDuties = customsValue * (dutyPercent / 100);
    const schedule1Duty = customsValue * (dutySchedule1Percent / 100);
    const totalVat = (customsValue + totalDuties + schedule1Duty) * 0.15;

    return { customsValue, totalDuties, schedule1Duty, totalVat, roe };
  };

  // Calculate product cost allocation (shipping costs allocated by weight)
  const calculateProductAllocation = (product) => {
    const totalWeight = getTotalWeight();
    const productWeight = parseFloat(product.weight_kg) || 0;
    const weightRatio = totalWeight > 0 ? productWeight / totalWeight : 0;

    // For CIF/CIP/CFR terms, ocean freight and origin charges are already in
    // the product price — only allocate local + destination charges
    const incoTerms = (formData.inco_terms || '').toUpperCase();
    const freightIncluded = ['CIF', 'CIP', 'CFR'].includes(incoTerms);
    let shippingToAllocate;
    if (formData.transport_mode === 'air') {
      shippingToAllocate = freightIncluded
        ? (calculatedTotals.air_local_charges_subtotal_zar || 0)
          + (calculatedTotals.warehouse_charges_subtotal_zar || 0)
          + (calculatedTotals.airfreight_insurance_zar || 0)
        : Math.max((calculatedTotals.total_shipping_cost_zar || 0) - (calculatedTotals.last_mile_charges_subtotal_zar || 0), 0);
    } else if (freightIncluded) {
      shippingToAllocate = (calculatedTotals.local_charges_subtotal_zar || 0)
        + (calculatedTotals.destination_charges_subtotal_zar || 0);
    } else {
      shippingToAllocate = Math.max((calculatedTotals.total_shipping_cost_zar || 0) - (calculatedTotals.last_mile_charges_subtotal_zar || 0), 0);
    }
    const allocatedShippingCost = shippingToAllocate * weightRatio;

    // Get customs values for this product
    const customs = calculateProductCustomsValues(product);
    // VAT excluded - not charged to clients
    const productCustomsCost = customs.totalDuties + customs.schedule1Duty;

    // Transport cost per kg = allocated shipping / weight
    const transportCostPerKg = productWeight > 0 ? allocatedShippingCost / productWeight : 0;

    // Total landed cost = product value (customs value) + duties + allocated shipping
    const totalProductCost = customs.customsValue + productCustomsCost + allocatedShippingCost;
    const costPerKg = productWeight > 0 ? totalProductCost / productWeight : 0;

    return { weightRatio, allocatedShippingCost, transportCostPerKg, productCustomsCost, totalProductCost, costPerKg };
  };

  // Calculate customs totals from all products
  const getCustomsTotals = () => {
    let totalCustomsValue = 0;
    let totalDuties = 0;
    let totalSchedule1Duty = 0;
    let totalVat = 0;

    (formData.products || []).forEach(product => {
      const values = calculateProductCustomsValues(product);
      totalCustomsValue += values.customsValue;
      totalDuties += values.totalDuties;
      totalSchedule1Duty += values.schedule1Duty;
      totalVat += values.totalVat;
    });

    return { totalCustomsValue, totalDuties, totalSchedule1Duty, totalVat };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Clean data - convert empty strings to null for numeric fields
      const cleanedData = { ...formData };
      Object.keys(cleanedData).forEach(key => {
        if (cleanedData[key] === '') {
          cleanedData[key] = null;
        }
      });
      // Filter out display-only fields (prefixed with underscore)
      const dbTotals = {};
      Object.keys(calculatedTotals).forEach(key => {
        if (!key.startsWith('_')) {
          dbTotals[key] = calculatedTotals[key];
        }
      });
      const dataToSend = { ...cleanedData, ...dbTotals };
      const url = editingId
        ? getApiUrl(`/api/costing/${editingId}`)
        : getApiUrl('/api/costing');

      const response = await authFetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });

      if (response.ok) {
        clearCostingDraft();
        setShowForm(false);
        setEditingId(null);
        setFormData(INITIAL_FORM_STATE);
        fetchEstimates();
      } else {
        const errorData = await response.json();
        console.error('Save error details:', errorData);
        let detailMsg = '';
        if (Array.isArray(errorData.details)) {
          detailMsg = errorData.details.map(d => `${d.path || d.param}: ${d.msg || d.message}`).join(', ');
        } else if (typeof errorData.details === 'string') {
          detailMsg = errorData.details;
        }
        setError(detailMsg || errorData.error || errorData.message || 'Failed to save cost estimate');
      }
    } catch (err) {
      console.error('Failed to save estimate:', err);
      setError('Failed to save cost estimate');
    }
  };

  const normalizeEstimateForForm = (estimate) => {
    const fallbackUsdRate = parseFloat(estimate.roe_origin)
      || parseFloat(estimate.roe_customs)
      || parseFloat(exchangeRate?.rate)
      || '';

    return {
      ...INITIAL_FORM_STATE,
      ...estimate,
      roe_origin: fallbackUsdRate,
    };
  };

  const handleEdit = (estimate) => {
    setFormData({
      ...normalizeEstimateForForm(estimate),
    });
    setEditingId(estimate.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction({ title: 'Delete Cost Estimate', message: 'Are you sure you want to delete this cost estimate?', type: 'danger', confirmText: 'Delete' }))) return;

    try {
      const response = await authFetch(getApiUrl(`/api/costing/${id}`), {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchEstimates();
      }
    } catch (err) {
      console.error('Failed to delete estimate:', err);
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const response = await authFetch(getApiUrl(`/api/costing/${id}/duplicate`), {
        method: 'POST',
      });
      if (response.ok) {
        fetchEstimates();
      }
    } catch (err) {
      console.error('Failed to duplicate estimate:', err);
    }
  };

  const getReferenceChangeForEstimate = (targetEstimate) => {
    const reference = String(targetEstimate?.reference_number || '').trim();
    if (!reference) return null;

    const group = (estimates || [])
      .filter(est => est.status !== 'archived' && String(est.reference_number || '').trim().toLowerCase() === reference.toLowerCase())
      .map(est => {
        const totals = calculateAllTotals(est);
        return {
          est,
          landedPerKg: parseFloat(totals.all_in_warehouse_cost_per_kg_zar) || 0,
          totalLanded: parseFloat(totals.total_landed_cost_zar) || 0,
          manualPreviousCostPerKg: parseFloat(est.manual_previous_cost_per_kg_zar) || 0,
          manualPreviousCostDate: est.manual_previous_cost_date,
        };
      })
      .sort((a, b) => {
        const dateDiff = getEstimateDateValue(a.est) - getEstimateDateValue(b.est);
        if (dateDiff !== 0) return dateDiff;
        return String(a.est.id || '').localeCompare(String(b.est.id || ''));
      });

    const index = group.findIndex(item => item.est.id === targetEstimate.id);
    if (index < 0) return null;

    const item = group[index];
    const previous = index > 0 ? group[index - 1] : null;
    const baselineCostPerKg = previous?.landedPerKg || item.manualPreviousCostPerKg || 0;
    if (baselineCostPerKg <= 0) return null;

    const baselineLabel = previous ? 'Previous costing' : 'Historical baseline';
    const baselineDate = previous ? (previous.est.costing_date || previous.est.created_at) : item.manualPreviousCostDate;
    const currentDate = item.est.costing_date || item.est.created_at;
    const changePercent = ((item.landedPerKg - baselineCostPerKg) / baselineCostPerKg) * 100;

    return {
      reference,
      currentCostPerKg: item.landedPerKg,
      baselineCostPerKg,
      baselineLabel,
      baselineDate,
      currentDate,
      periodLabel: getPeriodLabel(baselineDate, currentDate),
      changePercent,
    };
  };

  const withReferenceChange = (estimate) => ({
    ...estimate,
    _referenceChange: getReferenceChangeForEstimate(estimate),
  });

  const generatePDF = (estimate) => generateEstimatePDF(withReferenceChange(estimate));

  const generatePDFBase64 = (estimate) => generateEstimatePDFBase64(withReferenceChange(estimate));

  // Send email with PDF attachment
  const sendEstimateEmail = async (emailTo, estimate) => {
    if (!emailTo || !estimate) return;

    try {
      const pdfBase64 = generatePDFBase64(estimate);

      const response = await authFetch(getApiUrl(`/api/costing/${estimate.id}/send-email`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toEmail: emailTo,
          pdfBase64: pdfBase64,
        }),
      });

      if (response.ok) {
        showSuccess('Email sent successfully!');
        setShowEmailModal(false);
        setEmailEstimate(null);
      } else {
        const data = await response.json();
        showError(`Failed to send email: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error sending email:', err);
      showError('Failed to send email. Please try again.');
    }
  };

  const resetForm = () => {
    clearCostingDraft();
    setFormData(INITIAL_FORM_STATE);
    setEditingId(null);
    if (exchangeRate?.rate) {
      setFormData(prev => ({ ...prev, roe_origin: exchangeRate.rate }));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading cost estimates...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div className="brand-strip" />
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '0.75rem', paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-900)' }}>Import Costing</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--text-500)', fontSize: '0.8rem' }}>
            Sea & Air Freight Import Cost Comparison
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {exchangeRate && (
            <div style={{ padding: '8px 12px', backgroundColor: '#f0f9ff', borderRadius: '6px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-500)' }}>Market Rate: </span>
              <strong>{formatNumber(exchangeRate.rate, 4)}</strong>
              <span style={{ color: '#888', marginLeft: '4px', fontSize: '0.75rem' }}>(ref only - use Finex SA)</span>
            </div>
          )}
          <button
            onClick={() => {
              setShowReports(!showReports);
              if (!showReports) setShowReferenceChanges(false);
            }}
            style={{
              padding: '10px 20px', backgroundColor: showReports ? '#7c3aed' : '#8b5cf6', color: 'white',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500'
            }}
          >
            {showReports ? '✕ Close Reports' : '📊 Reports'}
          </button>
          <button
            onClick={() => {
              setShowReferenceChanges(!showReferenceChanges);
              if (!showReferenceChanges) setShowReports(false);
            }}
            style={{
              padding: '10px 20px', backgroundColor: showReferenceChanges ? '#0f766e' : '#14b8a6', color: 'white',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500'
            }}
          >
            {showReferenceChanges ? 'Close Changes' : 'Reference Changes'}
          </button>
          {isAdmin ? (
            <>
              <button
                onClick={() => setShowRequests(true)}
                style={{
                  position: 'relative',
                  padding: '10px 20px', backgroundColor: '#1e40af', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500'
                }}
              >
                Requests
                {pendingRequestCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '-8px', right: '-8px',
                    backgroundColor: '#dc2626', color: 'white',
                    borderRadius: '50%', minWidth: '20px', height: '20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: '700',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    padding: '0 4px',
                  }}>
                    {pendingRequestCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                style={{
                  padding: '10px 20px', backgroundColor: '#059669', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500'
                }}
              >
                + New Estimate
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowRequestModal(true)}
              style={{
                padding: '10px 20px', backgroundColor: '#f59e0b', color: 'white',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500'
              }}
            >
              Request Costing
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', marginBottom: '1rem' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>x</button>
        </div>
      )}

      {/* Pending Requests Banner (non-admin) */}
      {!isAdmin && myRequests.filter(r => r.status === 'pending').length > 0 && (
        <div style={{ padding: '12px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem', color: '#92400e' }}>
          You have <strong>{myRequests.filter(r => r.status === 'pending').length}</strong> pending costing request(s). An admin will prepare them for you.
        </div>
      )}

      {/* Reports Section */}
      {showReports && (
        <CostingReportsPanel estimates={estimates} onClose={() => setShowReports(false)} />
      )}

      {showReferenceChanges && (
        <ReferenceChangeView estimates={estimates} onClose={() => setShowReferenceChanges(false)} />
      )}

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
          alignItems: formExpanded ? 'stretch' : 'flex-start',
          padding: formExpanded ? 0 : '1rem', zIndex: 1000, overflowY: 'auto'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: formExpanded ? 0 : '12px',
            width: formExpanded ? '100vw' : '95%',
            maxWidth: formExpanded ? '100vw' : '1400px',
            minWidth: formExpanded ? '100vw' : '600px',
            height: formExpanded ? '100vh' : '90vh',
            minHeight: '400px',
            overflow: 'auto',
            boxShadow: formExpanded ? 'none' : '0 25px 50px -12px rgba(0,0,0,0.25)',
            resize: formExpanded ? 'none' : 'both',
            transition: 'all 0.2s ease',
          }}>
            {/* Form Header */}
            <div style={{
              padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0, color: '#0f172a' }}>
                  {editingId ? 'Edit Cost Estimate' : 'New Cost Estimate'}
                </h3>
                <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '2px solid #e5e7eb' }}>
                  <button
                    type="button"
                    onClick={() => handleInputChange('transport_mode', 'sea')}
                    style={{
                      padding: '6px 16px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem',
                      backgroundColor: formData.transport_mode === 'sea' ? '#1d4ed8' : '#f3f4f6',
                      color: formData.transport_mode === 'sea' ? 'white' : '#6b7280',
                    }}
                  >
                    Sea Freight
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInputChange('transport_mode', 'air')}
                    style={{
                      padding: '6px 16px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem',
                      backgroundColor: formData.transport_mode === 'air' ? '#7c3aed' : '#f3f4f6',
                      color: formData.transport_mode === 'air' ? 'white' : '#6b7280',
                    }}
                  >
                    Air Freight
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setFormExpanded(!formExpanded)}
                  title={formExpanded ? 'Collapse form' : 'Expand form'}
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-700)', fontWeight: 500 }}
                >
                  {formExpanded ? '⊖ Collapse' : '⊕ Expand'}
                </button>
                <button
                  onClick={() => confirmCloseCosting(() => { setShowForm(false); setEditingId(null); setFormExpanded(false); })}
                  style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-500)' }}
                >
                  x
                </button>
              </div>
            </div>

            <CostingFormSections
              formData={formData}
              calculatedTotals={calculatedTotals}
              editingId={editingId}
              suppliers={suppliers}
              exchangeRate={exchangeRate}
              onInputChange={handleInputChange}
              onAddProduct={addProduct}
              onRemoveProduct={removeProduct}
                onUpdateProduct={updateProduct}
                onAddLastMileCharge={addLastMileCharge}
                onRemoveLastMileCharge={removeLastMileCharge}
                onUpdateLastMileCharge={updateLastMileCharge}
                onSubmit={handleSubmit}
              onCancel={() => confirmCloseCosting(() => { setShowForm(false); setEditingId(null); })}
              showAddSupplier={showAddSupplier}
              onToggleAddSupplier={setShowAddSupplier}
              newSupplierName={newSupplierName}
              onNewSupplierNameChange={setNewSupplierName}
              onCreateSupplier={createSupplier}
              getTotalWeight={getTotalWeight}
              getCustomsTotals={getCustomsTotals}
              calculateProductCustomsValues={calculateProductCustomsValues}
              calculateProductAllocation={calculateProductAllocation}
              originPortOptions={importPortOptions}
              dischargePortOptions={importDischargePortOptions}
              onAddOriginPort={(portName) => addCustomImportPort(portName, 'port_of_loading')}
              onAddDischargePort={(portName) => addCustomImportPort(portName, 'port_of_discharge')}
            />
          </div>
        </div>
      )}

      {/* Estimates Table */}
      <CostingEstimatesTable
        estimates={estimates}
        isAdmin={isAdmin}
        initialTransportModeFilter={initialTransportModeFilter}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onGeneratePDF={generatePDF}
        onEmailEstimate={(est) => { setEmailEstimate(est); setShowEmailModal(true); }}
      />

      {/* Email Modal */}
      <EmailEstimateModal
        isOpen={showEmailModal}
        estimate={emailEstimate}
        onClose={() => { setShowEmailModal(false); setEmailEstimate(null); }}
        onSend={sendEstimateEmail}
      />

      {/* Request Costing Modal (non-admin) */}
      <RequestCostingModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        onSubmit={handleSubmitRequest}
      />

      {/* Admin Costing Requests Queue */}
      {showRequests && (
        <CostingRequests onClose={() => { setShowRequests(false); fetchPendingRequestCount(); }} />
      )}
    </div>
  );
}

export default ImportCosting;
