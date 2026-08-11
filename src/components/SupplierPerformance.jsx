import React, { useMemo, useState, useEffect } from 'react';
import { SupplierMetrics } from '../utils/supplierMetrics';
import { authFetch } from '../utils/authFetch';
import { getApiUrl } from '../config/api';
import { calculateAllTotals } from '../utils/costingCalculations';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line as LineChart, Doughnut, Bar as BarChart } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement,
  Title, Tooltip, Legend, Filler,
);

// ---- Reusable wrappers (same pattern as Dashboard) ----
const ChartCard = ({ title, subtitle, children, style }) => (
  <div className="dash-panel" style={style}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-900)' }}>{title}</h4>
      {subtitle && <span style={{ fontSize: 11, color: 'var(--text-500)' }}>{subtitle}</span>}
    </div>
    {children}
  </div>
);

const ChartEmpty = ({ label }) => (
  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-500)', fontSize: 13 }}>{label}</div>
);

// ---- KPI Card ----
const KpiCard = ({ label, value, suffix, color, subtext }) => (
  <div className="dash-panel" style={{ flex: '1 1 200px', minWidth: 180, textAlign: 'center', padding: '20px 16px' }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 32, fontWeight: 800, color: color || 'var(--text-900)', lineHeight: 1.1 }}>
      {value}{suffix && <span style={{ fontSize: 16, fontWeight: 600 }}>{suffix}</span>}
    </div>
    {subtext && <div style={{ fontSize: 11, color: 'var(--text-500)', marginTop: 6 }}>{subtext}</div>}
  </div>
);

// ---- Grade badge ----
const GradeBadge = ({ grade }) => {
  const colors = { A: '#28a745', B: '#ffc107', C: '#dc3545' };
  const labels = { A: 'Excellent', B: 'Good', C: 'Needs Improvement' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 700,
      backgroundColor: `${colors[grade] || '#6b7280'}20`,
      color: colors[grade] || '#6b7280',
      border: `1px solid ${colors[grade] || '#6b7280'}40`,
    }}>
      {grade} — {labels[grade] || 'N/A'}
    </span>
  );
};

// ---- Trend indicator ----
const TrendArrow = ({ trend }) => {
  if (!trend || trend.length < 2) return <span style={{ color: 'var(--text-500)', fontSize: 12 }}>--</span>;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  const diff = last - prev;
  if (diff > 0) return <span style={{ color: '#28a745', fontSize: 13, fontWeight: 700 }}>+{diff}%</span>;
  if (diff < 0) return <span style={{ color: '#dc3545', fontSize: 13, fontWeight: 700 }}>{diff}%</span>;
  return <span style={{ color: 'var(--text-500)', fontSize: 12 }}>0%</span>;
};

// ---- Line colors for top suppliers ----
const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function SupplierPerformance({ shipments }) {
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [sortCol, setSortCol] = useState('onTimePercent');
  const [sortDir, setSortDir] = useState('desc');
  const [costingData, setCostingData] = useState(null);

  // Fetch costing estimates (optional — non-blocking)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(getApiUrl('/api/costing?limit=5000'));
        if (res.ok && !cancelled) {
          const data = await res.json();
          setCostingData(data.data || data);
        }
      } catch {
        // Silently ignore — cost chart will show empty
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Unique supplier names ----
  const supplierNames = useMemo(() => {
    const names = new Set();
    (shipments || []).forEach(s => {
      if (s.supplier) names.add(s.supplier.trim());
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [shipments]);

  // ---- Compute metrics per supplier ----
  const allMetrics = useMemo(() => {
    return supplierNames.map(name => SupplierMetrics.calculateAllMetrics(shipments, name));
  }, [shipments, supplierNames]);

  // ---- Filtered metrics (when a single supplier is selected) ----
  const filteredMetrics = useMemo(() => {
    if (selectedSupplier === 'all') return allMetrics;
    return allMetrics.filter(m => m.supplierName === selectedSupplier);
  }, [allMetrics, selectedSupplier]);

  // ---- Aggregated KPIs ----
  const kpis = useMemo(() => {
    const active = filteredMetrics.filter(m => m.totalShipments > 0);
    if (active.length === 0) return { avgOnTime: 0, avgPassRate: 0, avgLeadTime: null, grades: { A: 0, B: 0, C: 0 } };

    const avgOnTime = Math.round(active.reduce((s, m) => s + m.onTimePercent, 0) / active.length);
    const withPassRate = active.filter(m => m.passRatePercent !== null);
    const avgPassRate = withPassRate.length > 0
      ? Math.round(withPassRate.reduce((s, m) => s + m.passRatePercent, 0) / withPassRate.length)
      : null;
    const withLead = active.filter(m => m.avgLeadTime !== null);
    const avgLeadTime = withLead.length > 0
      ? Math.round(withLead.reduce((s, m) => s + m.avgLeadTime, 0) / withLead.length)
      : null;

    const grades = { A: 0, B: 0, C: 0 };
    active.forEach(m => { if (m.grade?.grade) grades[m.grade.grade] = (grades[m.grade.grade] || 0) + 1; });

    return { avgOnTime, avgPassRate, avgLeadTime, grades };
  }, [filteredMetrics]);

  // ---- On-time color helper ----
  const onTimeColor = (pct) => pct >= 85 ? '#28a745' : pct >= 70 ? '#ffc107' : '#dc3545';

  // ---- Chart 1: On-Time Delivery by Supplier (horizontal bar) ----
  const onTimeChartData = useMemo(() => {
    const sorted = [...filteredMetrics].filter(m => m.totalShipments > 0).sort((a, b) => a.onTimePercent - b.onTimePercent);
    return {
      labels: sorted.map(m => m.supplierName),
      datasets: [{
        label: 'On-Time %',
        data: sorted.map(m => m.onTimePercent),
        backgroundColor: sorted.map(m => m.grade?.color || '#6b7280'),
        borderRadius: 4,
        barThickness: 20,
      }],
    };
  }, [filteredMetrics]);

  const onTimeChartOptions = useMemo(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x}%` } },
    },
    scales: {
      x: { min: 0, max: 100, ticks: { callback: v => `${v}%` }, grid: { color: 'rgba(0,0,0,0.06)' } },
      y: { grid: { display: false }, ticks: { font: { size: 11 } } },
    },
  }), []);

  // ---- Chart 2: Lead Time Trend (line, top 5 suppliers) ----
  const leadTimeTrendData = useMemo(() => {
    const top5 = [...allMetrics]
      .filter(m => m.totalShipments > 0)
      .sort((a, b) => b.totalShipments - a.totalShipments)
      .slice(0, 5);

    // Build weekly labels from last 12 weeks
    const weeks = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const wn = SupplierMetrics.getWeekNumber(d);
      weeks.push(`W${wn}`);
    }

    const datasets = top5.map((m, idx) => {
      const trend = SupplierMetrics.calculateMetricTrend(shipments, m.supplierName, 'onTime', 84);
      // Pad to 12 entries
      const padded = Array(12).fill(null);
      trend.slice(-12).forEach((v, i) => { padded[12 - trend.slice(-12).length + i] = v; });
      return {
        label: m.supplierName,
        data: padded,
        borderColor: LINE_COLORS[idx % LINE_COLORS.length],
        backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] + '20',
        tension: 0.3,
        pointRadius: 3,
        fill: false,
      };
    });

    return { labels: weeks, datasets };
  }, [allMetrics, shipments]);

  const leadTimeTrendOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` } },
    },
    scales: {
      y: { min: 0, max: 100, ticks: { callback: v => `${v}%` }, grid: { color: 'rgba(0,0,0,0.06)' } },
      x: { grid: { display: false } },
    },
  }), []);

  // ---- Chart 3: Grade Distribution (doughnut) ----
  const gradeChartData = useMemo(() => {
    const activeMetrics = filteredMetrics.filter(m => m.totalShipments > 0);
    const gradeCount = { A: 0, B: 0, C: 0 };
    activeMetrics.forEach(m => { if (m.grade?.grade) gradeCount[m.grade.grade]++; });
    const ungraded = activeMetrics.length - gradeCount.A - gradeCount.B - gradeCount.C;
    return {
      labels: ['A — Excellent', 'B — Good', 'C — Needs Improvement', ...(ungraded > 0 ? ['Ungraded'] : [])],
      datasets: [{
        data: [gradeCount.A, gradeCount.B, gradeCount.C, ...(ungraded > 0 ? [ungraded] : [])],
        backgroundColor: ['#28a745', '#ffc107', '#dc3545', ...(ungraded > 0 ? ['#6b7280'] : [])],
        borderWidth: 2,
        borderColor: 'var(--surface)',
      }],
    };
  }, [filteredMetrics]);

  const gradeChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
    },
    cutout: '55%',
  }), []);

  // ---- Chart 4: Cost per KG by Supplier ----
  const costChartData = useMemo(() => {
    if (!costingData || !Array.isArray(costingData) || costingData.length === 0) return null;

    // Group by supplier and compute avg cost per kg
    const supplierCosts = {};
    costingData.forEach(est => {
      if (est.status === 'archived') return;
      const supplier = est.supplier_name;
      const totals = calculateAllTotals(est);
      const totalKg = parseFloat(est.total_gross_weight_kg || 0);
      const totalCost = totals.total_landed_cost_zar || 0;
      if (!supplier || !totalKg || !totalCost) return;
      if (!supplierCosts[supplier]) supplierCosts[supplier] = { totalKg: 0, totalCost: 0 };
      supplierCosts[supplier].totalKg += totalKg;
      supplierCosts[supplier].totalCost += totalCost;
    });

    const entries = Object.entries(supplierCosts)
      .map(([name, d]) => ({ name, costPerKg: +(d.totalCost / d.totalKg).toFixed(2) }))
      .sort((a, b) => b.costPerKg - a.costPerKg);

    if (entries.length === 0) return null;

    return {
      labels: entries.map(e => e.name),
      datasets: [{
        label: 'Cost / KG (ZAR)',
        data: entries.map(e => e.costPerKg),
        backgroundColor: '#3b82f6',
        borderRadius: 4,
        barThickness: 20,
      }],
    };
  }, [costingData]);

  const costChartOptions = useMemo(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => `R${ctx.parsed.x.toFixed(2)} / kg` } },
    },
    scales: {
      x: { ticks: { callback: v => `R${v}` }, grid: { color: 'rgba(0,0,0,0.06)' } },
      y: { grid: { display: false }, ticks: { font: { size: 11 } } },
    },
  }), []);

  // ---- Table sorting ----
  const sortedTableData = useMemo(() => {
    const data = filteredMetrics.filter(m => m.totalShipments > 0);
    return [...data].sort((a, b) => {
      let aVal = a[sortCol];
      let bVal = b[sortCol];
      if (sortCol === 'grade') { aVal = a.grade?.grade || 'Z'; bVal = b.grade?.grade || 'Z'; }
      if (sortCol === 'supplierName') { aVal = aVal?.toLowerCase(); bVal = bVal?.toLowerCase(); }
      if (aVal === null || aVal === undefined) aVal = sortDir === 'asc' ? Infinity : -Infinity;
      if (bVal === null || bVal === undefined) bVal = sortDir === 'asc' ? Infinity : -Infinity;
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredMetrics, sortCol, sortDir]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const sortIcon = (col) => sortCol === col ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';

  // ---- Render ----
  return (
    <div style={{ padding: '0 8px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-900)' }}>Supplier Performance</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-500)' }}>
            KPI metrics based on warehouse-confirmed shipments
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>Supplier:</label>
          <select
            value={selectedSupplier}
            onChange={e => setSelectedSupplier(e.target.value)}
            style={{
              padding: '6px 12px', fontSize: 13, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-900)', minWidth: 180,
            }}
          >
            <option value="all">All Suppliers</option>
            {supplierNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard
          label="Avg On-Time Delivery"
          value={kpis.avgOnTime}
          suffix="%"
          color={onTimeColor(kpis.avgOnTime)}
          subtext={`${filteredMetrics.filter(m => m.totalShipments > 0).length} active supplier${filteredMetrics.filter(m => m.totalShipments > 0).length !== 1 ? 's' : ''}`}
        />
        <KpiCard
          label="Avg Inspection Pass Rate"
          value={kpis.avgPassRate !== null ? kpis.avgPassRate : '--'}
          suffix={kpis.avgPassRate !== null ? '%' : ''}
          color={kpis.avgPassRate !== null ? (kpis.avgPassRate >= 90 ? '#28a745' : kpis.avgPassRate >= 80 ? '#ffc107' : '#dc3545') : 'var(--text-500)'}
          subtext="Based on inspected shipments"
        />
        <KpiCard
          label="Avg Lead Time"
          value={kpis.avgLeadTime !== null ? kpis.avgLeadTime : '--'}
          suffix={kpis.avgLeadTime !== null ? ' days' : ''}
          color="var(--text-900)"
          subtext="Scheduled vs actual arrival"
        />
        <KpiCard
          label="Grade Distribution"
          value={`${kpis.grades.A}A / ${kpis.grades.B}B / ${kpis.grades.C}C`}
          suffix=""
          color="var(--text-900)"
          subtext={`${kpis.grades.A + kpis.grades.B + kpis.grades.C} graded suppliers`}
        />
      </div>

      {/* Charts Grid (2x2) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, marginBottom: 24 }}>
        <ChartCard title="On-Time Delivery by Supplier" subtitle="Sorted by %, colored by grade">
          {onTimeChartData.labels.length > 0
            ? <div style={{ height: Math.max(200, onTimeChartData.labels.length * 32) }}><BarChart data={onTimeChartData} options={onTimeChartOptions} /></div>
            : <ChartEmpty label="No delivery data available" />}
        </ChartCard>

        <ChartCard title="On-Time Trend" subtitle="Last 12 weeks, top 5 suppliers">
          {leadTimeTrendData.datasets.length > 0
            ? <div style={{ height: 280 }}><LineChart data={leadTimeTrendData} options={leadTimeTrendOptions} /></div>
            : <ChartEmpty label="No trend data available" />}
        </ChartCard>

        <ChartCard title="Grade Distribution" subtitle="A / B / C breakdown">
          {gradeChartData.datasets[0].data.some(v => v > 0)
            ? <div style={{ height: 280, display: 'flex', justifyContent: 'center' }}><Doughnut data={gradeChartData} options={gradeChartOptions} /></div>
            : <ChartEmpty label="No graded suppliers" />}
        </ChartCard>

        <ChartCard title="Cost per KG by Supplier" subtitle="From costing estimates">
          {costChartData
            ? <div style={{ height: Math.max(200, costChartData.labels.length * 32) }}><BarChart data={costChartData} options={costChartOptions} /></div>
            : <ChartEmpty label="No costing data available" />}
        </ChartCard>
      </div>

      {/* Detailed Table */}
      <ChartCard title="Supplier Detail" subtitle={`${sortedTableData.length} suppliers with shipments`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {[
                  { key: 'supplierName', label: 'Supplier' },
                  { key: 'totalShipments', label: 'Shipments' },
                  { key: 'onTimePercent', label: 'On-Time %' },
                  { key: 'passRatePercent', label: 'Pass Rate %' },
                  { key: 'avgLeadTime', label: 'Avg Lead Time' },
                  { key: 'grade', label: 'Grade' },
                  { key: 'trend', label: 'Trend' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => col.key !== 'trend' && handleSort(col.key)}
                    style={{
                      padding: '10px 12px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: 'var(--text-500)', textTransform: 'uppercase',
                      letterSpacing: 0.5, cursor: col.key !== 'trend' ? 'pointer' : 'default',
                      whiteSpace: 'nowrap', userSelect: 'none',
                    }}
                  >
                    {col.label}{col.key !== 'trend' && sortIcon(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTableData.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-500)' }}>No supplier data available</td></tr>
              )}
              {sortedTableData.map((m, idx) => (
                <tr
                  key={m.supplierName}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                  }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-900)' }}>{m.supplierName}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-700)' }}>{m.totalShipments}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontWeight: 700, color: onTimeColor(m.onTimePercent) }}>{m.onTimePercent}%</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-700)' }}>
                    {m.passRatePercent !== null ? `${m.passRatePercent}%` : '--'}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-700)' }}>
                    {m.avgLeadTime !== null ? `${m.avgLeadTime} days` : '--'}
                  </td>
                  <td style={{ padding: '10px 12px' }}><GradeBadge grade={m.grade?.grade} /></td>
                  <td style={{ padding: '10px 12px' }}><TrendArrow trend={m.trend} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

export default SupplierPerformance;
