import React, { useState, useMemo, useRef } from 'react';
import {
  calculateAllTotals,
  formatCurrency,
  formatNumber,
} from '../utils/costingCalculations';
import { generateReportPDF as generateReportPDFUtil } from '../utils/costingPdf';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Transport mode badge component
const MODE_BADGE_STYLES = {
  sea: { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  air: { bg: '#ede9fe', fg: '#7c3aed', border: '#c4b5fd' },
  road: { bg: '#fef3c7', fg: '#b45309', border: '#fcd34d' },
};
const ModeBadge = ({ mode }) => {
  const style = MODE_BADGE_STYLES[mode] || MODE_BADGE_STYLES.sea;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '9999px',
      fontSize: '0.7rem',
      fontWeight: '700',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      backgroundColor: style.bg,
      color: style.fg,
      border: `1px solid ${style.border}`,
    }}>
      {mode.toUpperCase()}
    </span>
  );
};

function CostingReportsPanel({ estimates, onClose }) {
  const [selectedProduct, setSelectedProduct] = useState('all');
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [transportModeFilter, setTransportModeFilter] = useState('all'); // 'all', 'sea', 'air'
  const chartRef = useRef(null);

  // Filter estimates by transport mode first
  const modeFilteredEstimates = useMemo(() => {
    if (transportModeFilter === 'all') return estimates;
    return estimates.filter(est => (est.transport_mode || 'sea') === transportModeFilter);
  }, [estimates, transportModeFilter]);

  // Get unique products from estimates - filtered by selected supplier and transport mode
  const allProducts = useMemo(() => {
    const productSet = new Set();
    modeFilteredEstimates.forEach(est => {
      if (selectedSupplier !== 'all' && est.supplier_name !== selectedSupplier) return;
      (est.products || []).forEach(p => {
        if (p.name) productSet.add(p.name);
      });
    });
    return Array.from(productSet).sort();
  }, [modeFilteredEstimates, selectedSupplier]);

  // Get unique suppliers from filtered estimates
  const allSuppliers = useMemo(() => {
    const supplierSet = new Set();
    modeFilteredEstimates.forEach(est => {
      if (est.supplier_name) supplierSet.add(est.supplier_name);
    });
    return Array.from(supplierSet).sort();
  }, [modeFilteredEstimates]);

  // Build per-supplier, per-mode aggregation for chart + table
  const supplierAnalysis = useMemo(() => {
    // Collect data keyed by supplier, split by mode
    const data = {}; // { supplierName: { sea: {...}, air: {...}, combined: {...} } }

    modeFilteredEstimates.forEach(est => {
      const supplier = est.supplier_name || 'Unknown';
      const mode = est.transport_mode || 'sea';
      const products = est.products || [];

      if (selectedSupplier !== 'all' && supplier !== selectedSupplier) return;

      const relevantProducts = selectedProduct === 'all'
        ? products
        : products.filter(p => p.name === selectedProduct);

      if (relevantProducts.length === 0 && selectedProduct !== 'all') return;

      if (!data[supplier]) {
        const empty = () => ({ totalCost: 0, totalWeight: 0, costPerKg: 0, estimateCount: 0, totalInvoiceValue: 0 });
        data[supplier] = { sea: empty(), air: empty(), road: empty(), combined: empty() };
      }

      const totals = calculateAllTotals(est);
      const productWeight = relevantProducts.reduce((sum, p) => sum + (parseFloat(p.weight_kg) || 0), 0);
      const productValue = relevantProducts.reduce((sum, p) => sum + (parseFloat(p.invoice_value) || 0), 0);
      const totalWeight = products.reduce((sum, p) => sum + (parseFloat(p.weight_kg) || 0), 0);

      const weightRatio = totalWeight > 0 && selectedProduct !== 'all'
        ? productWeight / totalWeight
        : 1;

      const cost = (totals.total_landed_cost_zar || totals.total_in_warehouse_cost_zar || 0) * weightRatio;
      const weight = productWeight || totalWeight;

      // Add to mode bucket
      const bucket = data[supplier][mode];
      bucket.totalCost += cost;
      bucket.totalWeight += weight;
      bucket.totalInvoiceValue += productValue;
      bucket.estimateCount += 1;

      // Add to combined bucket
      const combined = data[supplier].combined;
      combined.totalCost += cost;
      combined.totalWeight += weight;
      combined.totalInvoiceValue += productValue;
      combined.estimateCount += 1;
    });

    // Calculate cost per kg
    Object.values(data).forEach(supplier => {
      ['sea', 'air', 'road', 'combined'].forEach(key => {
        const d = supplier[key];
        d.costPerKg = d.totalWeight > 0 ? d.totalCost / d.totalWeight : 0;
      });
    });

    // Sort by combined total cost descending
    const sorted = Object.entries(data)
      .sort(([, a], [, b]) => b.combined.totalCost - a.combined.totalCost);

    return sorted; // [ [supplierName, { sea, air, combined }], ... ]
  }, [modeFilteredEstimates, selectedProduct, selectedSupplier]);

  // Determine if we should show split sea/air series or single series
  const hasBothModes = useMemo(() => {
    if (transportModeFilter !== 'all') return false;
    let hasSea = false, hasAir = false;
    for (const [, data] of supplierAnalysis) {
      if (data.sea.estimateCount > 0) hasSea = true;
      if (data.air.estimateCount > 0) hasAir = true;
      if (hasSea && hasAir) return true;
    }
    return false;
  }, [supplierAnalysis, transportModeFilter]);

  // Build chart datasets
  const chartData = useMemo(() => {
    const labels = supplierAnalysis.map(([name]) => name);

    if (transportModeFilter === 'all' && hasBothModes) {
      // Split bars: sea total cost + air total cost, plus combined cost/kg line
      return {
        labels,
        datasets: [
          {
            label: 'Sea Freight Cost (ZAR)',
            data: supplierAnalysis.map(([, d]) => d.sea.totalCost),
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 2,
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Air Freight Cost (ZAR)',
            data: supplierAnalysis.map(([, d]) => d.air.totalCost),
            backgroundColor: 'rgba(124, 58, 237, 0.8)',
            borderColor: 'rgb(124, 58, 237)',
            borderWidth: 2,
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Cost per KG (ZAR)',
            data: supplierAnalysis.map(([, d]) => d.combined.costPerKg),
            backgroundColor: 'rgba(245, 158, 11, 0.8)',
            borderColor: 'rgb(245, 158, 11)',
            borderWidth: 2,
            borderRadius: 4,
            yAxisID: 'y1',
          }
        ],
      };
    }

    // Single mode (or all with only one mode present): original style
    const modeColor = transportModeFilter === 'air'
      ? { bg: 'rgba(124, 58, 237, 0.8)', border: 'rgb(124, 58, 237)' }
      : transportModeFilter === 'road'
        ? { bg: 'rgba(180, 83, 9, 0.8)', border: 'rgb(180, 83, 9)' }
        : { bg: 'rgba(59, 130, 246, 0.8)', border: 'rgb(59, 130, 246)' };

    return {
      labels,
      datasets: [
        {
          label: 'Total Cost (ZAR)',
          data: supplierAnalysis.map(([, d]) => d.combined.totalCost),
          backgroundColor: modeColor.bg,
          borderColor: modeColor.border,
          borderWidth: 2,
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Cost per KG (ZAR)',
          data: supplierAnalysis.map(([, d]) => d.combined.costPerKg),
          backgroundColor: 'rgba(245, 158, 11, 0.8)',
          borderColor: 'rgb(245, 158, 11)',
          borderWidth: 2,
          borderRadius: 4,
          yAxisID: 'y1',
        }
      ],
    };
  }, [supplierAnalysis, transportModeFilter, hasBothModes]);

  // Build table rows — when showing 'all' and both modes exist, break out per-mode rows
  const tableRows = useMemo(() => {
    const rows = [];
    supplierAnalysis.forEach(([name, data]) => {
      if (transportModeFilter === 'all' && hasBothModes) {
        // Show per-mode rows if the supplier has estimates in that mode
        if (data.sea.estimateCount > 0) {
          rows.push({ name, mode: 'sea', ...data.sea });
        }
        if (data.air.estimateCount > 0) {
          rows.push({ name, mode: 'air', ...data.air });
        }
        if (data.road.estimateCount > 0) {
          rows.push({ name, mode: 'road', ...data.road });
        }
      } else {
        // Single mode row
        const mode = transportModeFilter !== 'all'
          ? transportModeFilter
          : (data.sea.estimateCount > 0 ? 'sea' : data.air.estimateCount > 0 ? 'air' : 'road');
        rows.push({ name, mode, ...data.combined });
      }
    });
    return rows;
  }, [supplierAnalysis, transportModeFilter, hasBothModes]);

  // Sea vs Air comparison data — grouped by supplier + product
  const seaVsAirComparisons = useMemo(() => {
    if (transportModeFilter !== 'all') return [];

    // Key: "supplier|||product" → { sea: { totalCost, totalWeight }, air: { ... } }
    const map = {};

    estimates.forEach(est => {
      const supplier = est.supplier_name || 'Unknown';
      const mode = est.transport_mode || 'sea';
      // This comparison is specifically sea vs air -- road estimates have no
      // bucket here (see map[key] init below) and would otherwise throw.
      if (mode !== 'sea' && mode !== 'air') return;
      const products = est.products || [];
      const totals = calculateAllTotals(est);
      const totalWeight = products.reduce((s, p) => s + (parseFloat(p.weight_kg) || 0), 0);

      products.forEach(p => {
        const productName = p.name || 'Unknown';
        const key = `${supplier}|||${productName}`;
        if (!map[key]) {
          map[key] = {
            supplier,
            product: productName,
            sea: { totalCost: 0, totalWeight: 0, count: 0 },
            air: { totalCost: 0, totalWeight: 0, count: 0 },
          };
        }

        const pWeight = parseFloat(p.weight_kg) || 0;
        const weightRatio = totalWeight > 0 ? pWeight / totalWeight : 0;
        const cost = (totals.total_landed_cost_zar || totals.total_in_warehouse_cost_zar || 0) * weightRatio;

        const bucket = map[key][mode];
        bucket.totalCost += cost;
        bucket.totalWeight += pWeight;
        bucket.count += 1;
      });
    });

    // Only keep combos that have BOTH sea and air
    return Object.values(map)
      .filter(item => item.sea.count > 0 && item.air.count > 0)
      .map(item => {
        const seaCostPerKg = item.sea.totalWeight > 0 ? item.sea.totalCost / item.sea.totalWeight : 0;
        const airCostPerKg = item.air.totalWeight > 0 ? item.air.totalCost / item.air.totalWeight : 0;
        const diffZar = item.air.totalCost - item.sea.totalCost;
        const diffPct = item.sea.totalCost > 0 ? ((item.air.totalCost - item.sea.totalCost) / item.sea.totalCost) * 100 : 0;
        const seaCheaper = item.sea.totalCost <= item.air.totalCost;
        return {
          supplier: item.supplier,
          product: item.product,
          seaTotalCost: item.sea.totalCost,
          seaCostPerKg,
          airTotalCost: item.air.totalCost,
          airCostPerKg,
          diffZar,
          diffPct,
          seaCheaper,
        };
      })
      .sort((a, b) => Math.abs(b.diffZar) - Math.abs(a.diffZar));
  }, [estimates, transportModeFilter]);

  // Legacy-compatible supplierDetails for PDF generation
  const getSupplierChartData = useMemo(() => {
    return {
      labels: chartData.labels,
      datasets: chartData.datasets,
      supplierDetails: supplierAnalysis.map(([name, data]) => ({
        name,
        ...data.combined,
      })),
    };
  }, [chartData, supplierAnalysis]);

  // Filtered estimates for PDF generation (exclude archived + respect transport mode filter)
  const filteredEstimates = useMemo(() => {
    return estimates.filter(est => {
      if (est.status === 'archived') return false;
      if (transportModeFilter !== 'all' && (est.transport_mode || 'sea') !== transportModeFilter) return false;
      return true;
    });
  }, [estimates, transportModeFilter]);

  const generateReportPDF = async () => {
    await generateReportPDFUtil({
      chartData: getSupplierChartData,
      selectedProduct,
      selectedSupplier,
      transportModeFilter,
      chartRef,
      filteredEstimates,
    });
  };

  // Mode toggle button style helper
  const modeButtonStyle = (value) => ({
    padding: '6px 14px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.8rem',
    letterSpacing: '0.02em',
    backgroundColor:
      transportModeFilter === value
        ? value === 'sea' ? '#1d4ed8'
          : value === 'air' ? '#7c3aed'
          : value === 'road' ? '#b45309'
          : '#374151'
        : '#f3f4f6',
    color: transportModeFilter === value ? 'white' : '#6b7280',
    transition: 'all 0.15s ease',
  });

  return (
    <div className="dash-panel" style={{ marginBottom: '1.5rem', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f5f3ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ margin: 0, color: '#5b21b6', fontSize: '1.1rem' }}>Cost Analysis by Supplier</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Transport Mode Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-500)' }}>Mode:</label>
              <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '2px solid #e5e7eb' }}>
                <button type="button" onClick={() => setTransportModeFilter('all')} style={modeButtonStyle('all')}>
                  All
                </button>
                <button type="button" onClick={() => setTransportModeFilter('sea')} style={modeButtonStyle('sea')}>
                  Sea
                </button>
                <button type="button" onClick={() => setTransportModeFilter('air')} style={modeButtonStyle('air')}>
                  Air
                </button>
                <button type="button" onClick={() => setTransportModeFilter('road')} style={modeButtonStyle('road')}>
                  Road
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-500)' }}>Supplier:</label>
              <select
                value={selectedSupplier}
                onChange={(e) => {
                  setSelectedSupplier(e.target.value);
                  setSelectedProduct('all'); // Reset product when supplier changes
                }}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  minWidth: '150px',
                }}
              >
                <option value="all">All Suppliers</option>
                {allSuppliers.map(supplier => (
                  <option key={supplier} value={supplier}>{supplier}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-500)' }}>Product:</label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  minWidth: '150px',
                }}
              >
                <option value="all">All Products</option>
                {allProducts.map(product => (
                  <option key={product} value={product}>{product}</option>
                ))}
              </select>
            </div>
            <button
              onClick={generateReportPDF}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Print PDF
            </button>
          </div>
        </div>
      </div>
      <div style={{ padding: '1rem' }}>
        {chartData.labels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af' }}>
            No data available for the selected filters.
          </div>
        ) : (
          <>
            <div style={{ height: '350px', marginBottom: '1.5rem' }}>
              <Bar
                ref={chartRef}
                data={{
                  labels: chartData.labels,
                  datasets: chartData.datasets,
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: {
                    mode: 'index',
                    intersect: false,
                  },
                  plugins: {
                    legend: {
                      position: 'top',
                    },
                    title: {
                      display: true,
                      text: `${selectedSupplier === 'all' ? 'All Suppliers' : selectedSupplier} | ${selectedProduct === 'all' ? 'All Products' : selectedProduct}${transportModeFilter !== 'all' ? ` | ${transportModeFilter === 'sea' ? 'Sea Freight' : 'Air Freight'}` : ''}`,
                      font: { size: 14 }
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const value = context.raw;
                          return `${context.dataset.label}: R ${formatNumber(value, 2)}`;
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      type: 'linear',
                      display: true,
                      position: 'left',
                      stacked: false,
                      title: {
                        display: true,
                        text: 'Total Cost (ZAR)'
                      },
                      ticks: {
                        callback: function(value) {
                          return 'R ' + formatNumber(value, 0);
                        }
                      }
                    },
                    y1: {
                      type: 'linear',
                      display: true,
                      position: 'right',
                      title: {
                        display: true,
                        text: 'Cost per KG (ZAR)'
                      },
                      grid: {
                        drawOnChartArea: false,
                      },
                      ticks: {
                        callback: function(value) {
                          return 'R ' + formatNumber(value, 2);
                        }
                      }
                    },
                  },
                }}
              />
            </div>

            {/* Summary Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Supplier</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Mode</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Estimates</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Total Weight</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Total Cost</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Cost/KG</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, idx) => (
                    <tr key={`${row.name}-${row.mode}-${idx}`} style={{ backgroundColor: idx % 2 === 0 ? 'white' : 'var(--surface-2)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '500' }}>{row.name}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <ModeBadge mode={row.mode} />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{row.estimateCount}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatNumber(row.totalWeight)} kg</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>{formatCurrency(row.totalCost)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#d97706' }}>{formatCurrency(row.costPerKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sea vs Air Comparison */}
            {seaVsAirComparisons.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#f5f3ff',
                  borderRadius: '8px 8px 0 0',
                  borderBottom: '2px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <h4 style={{ margin: 0, color: '#5b21b6', fontSize: '0.95rem' }}>Sea vs Air Cost Comparison</h4>
                  <span style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    fontWeight: '400',
                  }}>
                    ({seaVsAirComparisons.length} product{seaVsAirComparisons.length !== 1 ? 's' : ''} with both modes)
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Supplier</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Product</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', borderBottom: '2px solid #e5e7eb', color: '#1d4ed8' }}>Sea Total</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', borderBottom: '2px solid #e5e7eb', color: '#1d4ed8' }}>Sea /KG</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', borderBottom: '2px solid #e5e7eb', color: '#7c3aed' }}>Air Total</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', borderBottom: '2px solid #e5e7eb', color: '#7c3aed' }}>Air /KG</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Difference</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #e5e7eb' }}>Recommendation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seaVsAirComparisons.map((row, idx) => {
                        const diffColor = row.seaCheaper ? '#059669' : '#7c3aed';
                        return (
                          <tr key={`${row.supplier}-${row.product}-${idx}`} style={{ backgroundColor: idx % 2 === 0 ? 'white' : 'var(--surface-2)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: '500' }}>{row.supplier}</td>
                            <td style={{ padding: '10px 12px' }}>{row.product}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1d4ed8', fontWeight: '500' }}>{formatCurrency(row.seaTotalCost)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1d4ed8' }}>{formatCurrency(row.seaCostPerKg)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#7c3aed', fontWeight: '500' }}>{formatCurrency(row.airTotalCost)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#7c3aed' }}>{formatCurrency(row.airCostPerKg)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: diffColor }}>
                              {row.diffZar >= 0 ? '+' : ''}{formatCurrency(row.diffZar)}
                              <span style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.8 }}>
                                ({row.diffPct >= 0 ? '+' : ''}{formatNumber(row.diffPct, 1)}%)
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '3px 10px',
                                borderRadius: '9999px',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                letterSpacing: '0.03em',
                                backgroundColor: row.seaCheaper ? '#d1fae5' : '#ede9fe',
                                color: row.seaCheaper ? '#065f46' : '#5b21b6',
                                border: `1px solid ${row.seaCheaper ? '#6ee7b7' : '#c4b5fd'}`,
                              }}>
                                {row.seaCheaper ? 'Sea Cheaper' : 'Air Cheaper'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default CostingReportsPanel;
