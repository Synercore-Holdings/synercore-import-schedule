import React, { useState, useEffect } from 'react';
import useFormDraft from '../hooks/useFormDraft';
import { getApiUrl } from '../config/api';
import { authFetch } from '../utils/authFetch';
import { authUtils } from '../utils/auth';
import {
  calculateAllTotals,
  formatNumber,
  lookupOceanFreightRate,
  EXPORT_PORTS_OF_LOADING,
  WORLD_PORTS,
  SA_AIRPORTS,
  WORLD_AIRPORTS,
} from '../utils/costingCalculations';
import { generateEstimatePDF, generateEstimatePDFBase64 } from '../utils/costingPdf';
import { useNotification } from '../contexts/NotificationContext';
import CostingReportsPanel from './CostingReportsPanel';
import CostingEstimatesTable from './CostingEstimatesTable';
import CostingFormSections from './CostingFormSections';
import { EmailEstimateModal } from './CostingModals';

const EXPORTER_NAME = 'African Food Industries';

const INITIAL_FORM_STATE = {
  transport_mode: 'sea',
  reference_number: '',
  direction: 'export',
  // Origin: South Africa
  country_of_origin: 'South Africa',
  port_of_loading: 'Cape Town',
  // Destination: customer's country (free text for now)
  country_of_destination: '',
  port_of_discharge: '',
  load_type: 'FCL',
  shipping_line: '',
  routing: '',
  frequency: '',
  transit_time_days: 30,
  inco_terms: 'FOB',
  inco_term_place: 'Cape Town',
  container_type: "20' Dry Container",
  quantity: 1,
  // Supplier/customer
  supplier_name: EXPORTER_NAME, // We are the exporter (fixed)
  customer_name: '',
  validity_date: '',
  costing_date: new Date().toISOString().split('T')[0],
  payment_terms: '',
  roe_origin: '',
  roe_eur: '',
  // Ocean Freight
  ocean_freight_usd: 0,
  ocean_freight_eur: 0,
  // Origin Charges
  origin_charge_usd: 0,
  origin_charge_eur: 0,
  // Local Charges (SA origin cartage / pre-carriage)
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
  // Export Charges (replaces Destination Charges in export mode).
  // Defaults seeded from the AQ-1122 40FT PTA → Durban quote.
  export_landside_charges_zar: 0,
  export_declaration_zar: 630,     // SAD500 per declaration (AQ-1122)
  vgm_zar: 1100,
  cto_navis_fee_zar: 150,          // CTO
  navis_gp_zar: 250,
  export_cargo_dues_zar: 891.25,
  disbursement_fee_zar: 431.55,    // AQ-1122: @ 1.4% actual (above R325 min)
  disbursement_fee_percentage: 1.4,
  disbursement_fee_min: 325,
  // AQ-1122 itemised lines
  terminal_handling_zar: 4172,
  carbon_emission_zar: 0,
  container_seal_zar: 60,
  electronic_release_fee_zar: 160,
  merchant_haulage_zar: 1519,
  navis_release_fee_zar: 350,
  document_courier_zar: 560,
  courier_fuel_surcharge_zar: 218.40,
  certificate_of_origin_zar: 235,
  // USD-quoted lines (auto-convert via roe_origin)
  ebol_fee_usd: 75,
  isps_fee_usd: 14,
  telex_release_usd: 0,
  // Products being exported
  products: [
    { _id: Date.now(), name: '', hs_code: '', pack_size: '', pack_type: '', weight_kg: 0, rate_per_kg: 0, duty_percent: 0, duty_schedule1_percent: 0, currency: 'ZAR', invoice_value: 0 }
  ],
  // Customs & Duties (export side — minimal; agency fee defaults to its R1187 minimum)
  roe_customs: '',
  customs_declaration_zar: 0,
  agency_fee_percentage: 3.5,
  agency_fee_min: 1270,            // AQ-1122: @ 3.5% min R1270
  agency_fee_zar: 1270,
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
  last_mile_charges: [
    { _id: Date.now() + 1, service_type: '', route: '', weight_kg: 0, fuel_levy_percent: 0, manual_charge_zar: 0, extra_charges_zar: 0 }
  ],
  notes: '',
  status: 'draft',
  presentation_currency: 'USD', // 'USD' or 'EUR' — drives the foreign-currency conversion of landed totals
};

function ExportCosting() {
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
    `export_costing_${editingId || 'new'}`, formData, setFormData, { enabled: showForm }
  );
  const [calculatedTotals, setCalculatedTotals] = useState({});
  const [exchangeRate, setExchangeRate] = useState(null);
  const [, setRateLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailEstimate, setEmailEstimate] = useState(null);
  const [showReports, setShowReports] = useState(false);

  useEffect(() => {
    if (!showForm) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [showForm]);

  useEffect(() => {
    fetchEstimates();
    fetchExchangeRate();
    fetchCustomers();
  }, []);

  useEffect(() => {
    const totals = calculateAllTotals(formData);
    setCalculatedTotals(totals);
  }, [formData]);

  useEffect(() => {
    if (!showForm) return;
    const incoTerms = (formData.inco_terms || '').toUpperCase();
    if (!['FOB', 'FCA', 'EXW'].includes(incoTerms)) return;

    const products = formData.products || [];
    const sumByCurrency = (cur) => products.reduce(
      (sum, p) => sum + ((p.currency === cur) ? (parseFloat(p.invoice_value) || 0) : 0),
      0
    );
    const sumUsd = sumByCurrency('USD');
    const sumEur = sumByCurrency('EUR');
    const sumZar = sumByCurrency('ZAR');

    const roeUsd = parseFloat(formData.roe_origin) || 0;
    const roeEur = parseFloat(formData.roe_eur) || 0;
    const presentation = formData.presentation_currency === 'EUR' ? 'EUR' : 'USD';

    // ZAR-priced products fold into the presentation currency's origin charge,
    // converted via that currency's ROE.
    let invoiceTotalUsd = sumUsd;
    let invoiceTotalEur = sumEur;
    if (presentation === 'USD' && roeUsd > 0) invoiceTotalUsd += sumZar / roeUsd;
    if (presentation === 'EUR' && roeEur > 0) invoiceTotalEur += sumZar / roeEur;

    const currentUsd = parseFloat(formData.origin_charge_usd) || 0;
    const currentEur = parseFloat(formData.origin_charge_eur) || 0;

    if (Math.abs(currentUsd - invoiceTotalUsd) > 0.01 || Math.abs(currentEur - invoiceTotalEur) > 0.01) {
      setFormData(prev => ({
        ...prev,
        origin_charge_usd: Math.round(invoiceTotalUsd * 100) / 100,
        origin_charge_eur: Math.round(invoiceTotalEur * 100) / 100,
      }));
    }
  }, [formData.products, formData.inco_terms, formData.presentation_currency, formData.roe_origin, formData.roe_eur, showForm]);

  const fetchEstimates = async () => {
    try {
      setLoading(true);
      const response = await authFetch(getApiUrl('/api/costing?direction=export&limit=5000'));
      if (response.ok) {
        const result = await response.json();
        setEstimates(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch export estimates:', err);
      setError('Failed to load export cost estimates');
    } finally {
      setLoading(false);
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

  const fetchCustomers = async () => {
    try {
      const response = await authFetch(getApiUrl('/api/customers'));
      if (response.ok) {
        const result = await response.json();
        setCustomers(result.data || result || []);
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    }
  };

  const createCustomer = async () => {
    if (!newCustomerName.trim()) return;
    try {
      const response = await authFetch(getApiUrl('/api/customers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCustomerName.trim() }),
      });
      if (response.ok) {
        const result = await response.json();
        const newCustomer = result.data || result;
        setCustomers(prev => [...prev, newCustomer]);
        setFormData(prev => ({ ...prev, customer_name: newCustomer.name }));
        setShowAddCustomer(false);
        setNewCustomerName('');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create customer');
      }
    } catch (err) {
      console.error('Failed to create customer:', err);
      setError('Failed to create customer');
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
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

  const addProduct = () => {
    setFormData(prev => ({
      ...prev,
      products: [
        ...prev.products,
        { _id: Date.now() + Math.random(), name: '', hs_code: '', pack_size: '', pack_type: '', weight_kg: 0, rate_per_kg: 0, duty_percent: 0, duty_schedule1_percent: 0, currency: 'ZAR', invoice_value: 0 }
      ]
    }));
  };

  const removeProduct = (index) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index),
    }));
  };

  const updateProduct = (index, field, value) => {
    setFormData(prev => {
      const newProducts = prev.products.map((item, i) => {
        if (i !== index) return item;
        const updatedItem = { ...item, [field]: value };
        if (field === 'weight_kg' || field === 'rate_per_kg') {
          const weight = field === 'weight_kg' ? (parseFloat(value) || 0) : (parseFloat(item.weight_kg) || 0);
          const rate = field === 'rate_per_kg' ? (parseFloat(value) || 0) : (parseFloat(item.rate_per_kg) || 0);
          updatedItem.invoice_value = Math.round(weight * rate * 100) / 100;
        }
        return updatedItem;
      });
      return { ...prev, products: newProducts };
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
        if (field === 'service_type') updatedItem.route = '';
        return updatedItem;
      }),
    }));
  };

  const getTotalWeight = () =>
    (formData.products || []).reduce((sum, p) => sum + (parseFloat(p.weight_kg) || 0), 0);

  const calculateProductCustomsValues = (product) => {
    const roeCustoms = parseFloat(formData.roe_customs) || parseFloat(formData.roe_origin) || 0;
    const roeEur = parseFloat(formData.roe_eur) || 0;
    const invoiceValue = parseFloat(product.invoice_value) || 0;
    const dutyPercent = parseFloat(product.duty_percent) || 0;
    const dutySchedule1Percent = parseFloat(product.duty_schedule1_percent) || 0;
    const currency = product.currency || 'USD';

    let roe = roeCustoms;
    if (currency === 'EUR') roe = roeEur;
    if (currency === 'ZAR') roe = 1;

    const customsValue = invoiceValue * roe;
    const totalDuties = customsValue * (dutyPercent / 100);
    const schedule1Duty = customsValue * (dutySchedule1Percent / 100);
    const totalVat = (customsValue + totalDuties + schedule1Duty) * 0.15;

    return { customsValue, totalDuties, schedule1Duty, totalVat, roe };
  };

  const calculateProductAllocation = (product) => {
    const totalWeight = getTotalWeight();
    const productWeight = parseFloat(product.weight_kg) || 0;
    const weightRatio = totalWeight > 0 ? productWeight / totalWeight : 0;

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

    const customs = calculateProductCustomsValues(product);
    const productCustomsCost = customs.totalDuties + customs.schedule1Duty;
    const transportCostPerKg = productWeight > 0 ? allocatedShippingCost / productWeight : 0;
    const totalProductCost = customs.customsValue + productCustomsCost + allocatedShippingCost;
    const costPerKg = productWeight > 0 ? totalProductCost / productWeight : 0;

    return { weightRatio, allocatedShippingCost, transportCostPerKg, productCustomsCost, totalProductCost, costPerKg };
  };

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
      const cleanedData = { ...formData, direction: 'export', supplier_name: EXPORTER_NAME };
      Object.keys(cleanedData).forEach(key => {
        if (cleanedData[key] === '') cleanedData[key] = null;
      });
      const dbTotals = {};
      Object.keys(calculatedTotals).forEach(key => {
        if (!key.startsWith('_')) dbTotals[key] = calculatedTotals[key];
      });
      const dataToSend = { ...cleanedData, ...dbTotals, direction: 'export' };
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
        setError(detailMsg || errorData.error || errorData.message || 'Failed to save export cost estimate');
      }
    } catch (err) {
      console.error('Failed to save estimate:', err);
      setError('Failed to save export cost estimate');
    }
  };

  const handleEdit = (estimate) => {
    setFormData({
      ...INITIAL_FORM_STATE,
      ...estimate,
    });
    setEditingId(estimate.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction({
      title: 'Delete Export Cost Estimate',
      message: 'Are you sure you want to delete this export cost estimate?',
      type: 'danger',
      confirmText: 'Delete',
    }))) return;
    try {
      const response = await authFetch(getApiUrl(`/api/costing/${id}`), { method: 'DELETE' });
      if (response.ok) fetchEstimates();
    } catch (err) {
      console.error('Failed to delete estimate:', err);
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const response = await authFetch(getApiUrl(`/api/costing/${id}/duplicate`), { method: 'POST' });
      if (response.ok) fetchEstimates();
    } catch (err) {
      console.error('Failed to duplicate estimate:', err);
    }
  };

  const generatePDF = (estimate) => generateEstimatePDF(estimate);
  const generatePDFBase64 = (estimate) => generateEstimatePDFBase64(estimate);

  const sendEstimateEmail = async (emailTo, estimate) => {
    if (!emailTo || !estimate) return;
    try {
      const pdfBase64 = generatePDFBase64(estimate);
      const response = await authFetch(getApiUrl(`/api/costing/${estimate.id}/send-email`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: emailTo, pdfBase64 }),
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
        <p>Loading export cost estimates...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div className="brand-strip" />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '0.75rem', paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-900)' }}>Export Costing</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--text-500)', fontSize: '0.8rem' }}>
            {EXPORTER_NAME} — Sea & Air Freight Export Cost Breakdown
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {exchangeRate && (
            <div style={{ padding: '8px 12px', backgroundColor: '#f0f9ff', borderRadius: '6px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-500)' }}>ZAR / USD: </span>
              <strong>{formatNumber(exchangeRate.rate, 4)}</strong>
              {exchangeRate.rate > 0 && (
                <span style={{ color: 'var(--text-500)', marginLeft: '6px' }}>
                  (1 ZAR ≈ {formatNumber(1 / exchangeRate.rate, 5)} USD)
                </span>
              )}
              <span style={{ color: '#888', marginLeft: '4px', fontSize: '0.75rem' }}>(ref only - use Finex SA)</span>
            </div>
          )}
          <button
            onClick={() => setShowReports(!showReports)}
            style={{
              padding: '10px 20px', backgroundColor: showReports ? '#7c3aed' : '#8b5cf6', color: 'white',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500',
            }}
          >
            {showReports ? '✕ Close Reports' : '📊 Reports'}
          </button>
          {isAdmin && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              style={{
                padding: '10px 20px', backgroundColor: '#059669', color: 'white',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500',
              }}
            >
              + New Estimate
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

      {showReports && (
        <CostingReportsPanel estimates={estimates} onClose={() => setShowReports(false)} />
      )}

      {showForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
          alignItems: formExpanded ? 'stretch' : 'flex-start',
          padding: formExpanded ? 0 : '1rem', zIndex: 1000, overflowY: 'auto',
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
            <div style={{
              padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0, color: '#0f172a' }}>
                  {editingId ? 'Edit Export Cost Estimate' : 'New Export Cost Estimate'}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Show landed in:</span>
                  <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '2px solid #e5e7eb' }}>
                    <button
                      type="button"
                      onClick={() => handleInputChange('presentation_currency', 'USD')}
                      style={{
                        padding: '6px 14px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem',
                        backgroundColor: formData.presentation_currency === 'USD' ? '#059669' : '#f3f4f6',
                        color: formData.presentation_currency === 'USD' ? 'white' : '#6b7280',
                      }}
                    >
                      USD
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInputChange('presentation_currency', 'EUR')}
                      style={{
                        padding: '6px 14px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem',
                        backgroundColor: formData.presentation_currency === 'EUR' ? '#059669' : '#f3f4f6',
                        color: formData.presentation_currency === 'EUR' ? 'white' : '#6b7280',
                      }}
                    >
                      EUR
                    </button>
                  </div>
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
              suppliers={customers}
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
              showAddSupplier={showAddCustomer}
              onToggleAddSupplier={setShowAddCustomer}
              newSupplierName={newCustomerName}
              onNewSupplierNameChange={setNewCustomerName}
              onCreateSupplier={createCustomer}
              getTotalWeight={getTotalWeight}
              getCustomsTotals={getCustomsTotals}
              calculateProductCustomsValues={calculateProductCustomsValues}
              calculateProductAllocation={calculateProductAllocation}
              partyLabel="Customer"
              partyField="customer_name"
              originPortOptions={EXPORT_PORTS_OF_LOADING}
              dischargePortOptions={WORLD_PORTS}
              departureAirportOptions={SA_AIRPORTS}
              arrivalAirportOptions={WORLD_AIRPORTS}
            />
          </div>
        </div>
      )}

      <CostingEstimatesTable
        estimates={estimates}
        isAdmin={isAdmin}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onGeneratePDF={generatePDF}
        onEmailEstimate={(est) => { setEmailEstimate(est); setShowEmailModal(true); }}
        isExport
      />

      <EmailEstimateModal
        isOpen={showEmailModal}
        estimate={emailEstimate}
        onClose={() => { setShowEmailModal(false); setEmailEstimate(null); }}
        onSend={sendEstimateEmail}
      />
    </div>
  );
}

export default ExportCosting;
