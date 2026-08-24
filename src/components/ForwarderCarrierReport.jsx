import React, { useMemo, useCallback, useState } from 'react';
import { isAirfreight, isPureSeaForwarder } from '../utils/shipmentConstants';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { Bar as BarChart } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const NOT_RECORDED = '(Not recorded)';

// Same month-bucketing convention as the Pretoria/Klapmuts freight-spend
// cards in WarehouseStored.jsx — "YYYY-MM", scheduled date preferred over
// creation date since that's when the shipment actually happened/will happen.
const getMonthKey = (s) => {
  const dateVal = s.selectedWeekDate || s.createdAt;
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ---- Reusable wrappers (same pattern as SupplierPerformance) ----
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

const KpiCard = ({ label, value, suffix, color, subtext }) => (
  <div className="dash-panel" style={{ flex: '1 1 200px', minWidth: 180, textAlign: 'center', padding: '20px 16px' }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 32, fontWeight: 800, color: color || 'var(--text-900)', lineHeight: 1.1 }}>
      {value}{suffix && <span style={{ fontSize: 16, fontWeight: 600 }}>{suffix}</span>}
    </div>
    {subtext && <div style={{ fontSize: 11, color: 'var(--text-500)', marginTop: 6 }}>{subtext}</div>}
  </div>
);

const CARRIER_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#ec4899'];

function ForwarderCarrierReport({ shipments, suppliers }) {
  const [mode, setMode] = useState('sea');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [monthFilter, setMonthFilter] = useState('');

  // Sea-freight shipments with a forwarding agent — shippingLine is a
  // sea-only concept, and there's nothing to analyze without an agent.
  const seaShipments = useMemo(() => {
    return (shipments || []).filter(s =>
      s.forwardingAgent && !isAirfreight(s.latestStatus, s.forwardingAgent, s.vesselName)
    );
  }, [shipments]);

  // One APO/order can have many product-line rows (each its own `shipments`
  // record) — count actual orders, not lines, or a single 17-line order
  // inflates its agent's numbers 17x over a genuinely single-line one. Picks
  // one representative row per orderRef, preferring a row with shippingLine
  // set (in case lines within the same order were entered inconsistently).
  const seaOrdersAll = useMemo(() => {
    const byOrder = new Map();
    seaShipments.forEach(s => {
      const key = s.orderRef || s.id;
      const existing = byOrder.get(key);
      if (!existing || (!existing.shippingLine && s.shippingLine)) {
        byOrder.set(key, s);
      }
    });
    return [...byOrder.values()];
  }, [seaShipments]);

  // Airfreight shipments with a forwarding agent — for air, the agent IS the
  // airline directly (no DHL/DSV-style forwarder layer modeled for air), so
  // there's no separate carrier field or completeness-gap concept to track.
  const airShipments = useMemo(() => {
    return (shipments || []).filter(s =>
      s.forwardingAgent && isAirfreight(s.latestStatus, s.forwardingAgent, s.vesselName)
    );
  }, [shipments]);

  // Same one-row-per-order dedup as sea, no shippingLine preference needed.
  const airOrdersAll = useMemo(() => {
    const byOrder = new Map();
    airShipments.forEach(s => {
      const key = s.orderRef || s.id;
      if (!byOrder.has(key)) byOrder.set(key, s);
    });
    return [...byOrder.values()];
  }, [airShipments]);

  // ---- Month filter, same convention as WarehouseStored's freight cards ----
  const availableMonths = useMemo(() => {
    const months = new Set();
    [...seaOrdersAll, ...airOrdersAll].forEach(s => {
      const m = getMonthKey(s);
      if (m) months.add(m);
    });
    return [...months].sort();
  }, [seaOrdersAll, airOrdersAll]);

  const seaOrders = useMemo(() => {
    if (!monthFilter) return seaOrdersAll;
    return seaOrdersAll.filter(s => getMonthKey(s) === monthFilter);
  }, [seaOrdersAll, monthFilter]);

  const airOrders = useMemo(() => {
    if (!monthFilter) return airOrdersAll;
    return airOrdersAll.filter(s => getMonthKey(s) === monthFilter);
  }, [airOrdersAll, monthFilter]);

  // Supplier name -> country, for origin lookup. Falls back to the raw
  // supplier name when there's no match (free-text field, may not match
  // exactly) or no country recorded on the supplier.
  const supplierCountryMap = useMemo(() => {
    const map = {};
    (suppliers || []).forEach(s => {
      if (s.name && s.country) map[s.name.trim().toLowerCase()] = s.country;
    });
    return map;
  }, [suppliers]);

  const getOrigin = useCallback((shipment) => {
    const name = (shipment.supplier || '').trim();
    return supplierCountryMap[name.toLowerCase()] || name || 'Unknown';
  }, [supplierCountryMap]);

  // A Shipping Line only tells us something new for pure forwarders (DHL,
  // DSV, Afrigistics) — they book space on someone else's vessel. If the
  // agent is already an actual carrier (MSC, Maersk, ONE, ...), booked
  // directly, that value IS the carrier: MSC uses MSC, Maersk uses Maersk.
  const resolveCarrier = useCallback((s) => {
    if (s.shippingLine) return s.shippingLine;
    return isPureSeaForwarder(s.forwardingAgent) ? NOT_RECORDED : s.forwardingAgent;
  }, []);

  const forwardingAgentNames = useMemo(() => {
    const names = new Set();
    seaOrders.forEach(s => names.add(s.forwardingAgent));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [seaOrders]);

  // agent -> { carrier: count } — counted in distinct orders (seaOrders)
  const agentCarrierCounts = useMemo(() => {
    const counts = {};
    seaOrders.forEach(s => {
      const agent = s.forwardingAgent;
      const carrier = resolveCarrier(s);
      counts[agent] = counts[agent] || {};
      counts[agent][carrier] = (counts[agent][carrier] || 0) + 1;
    });
    return counts;
  }, [seaOrders, resolveCarrier]);

  // Only pure forwarders can have a "missing" shipping line — a direct
  // carrier booking is never missing one, its agent already is the carrier.
  const forwarderOnlyShipments = useMemo(
    () => seaOrders.filter(s => isPureSeaForwarder(s.forwardingAgent)),
    [seaOrders]
  );

  // ---- KPIs ----
  const kpis = useMemo(() => {
    const total = seaOrders.length;
    const withLine = forwarderOnlyShipments.filter(s => s.shippingLine).length;
    const distinctAgents = forwardingAgentNames.length;
    const distinctCarriers = new Set(seaOrders.map(s => resolveCarrier(s)).filter(c => c !== NOT_RECORDED)).size;
    return {
      total,
      completionPct: forwarderOnlyShipments.length > 0 ? Math.round((withLine / forwarderOnlyShipments.length) * 100) : 100,
      distinctAgents,
      distinctCarriers,
    };
  }, [seaOrders, forwardingAgentNames, forwarderOnlyShipments, resolveCarrier]);

  const completionColor = (pct) => pct >= 85 ? '#28a745' : pct >= 50 ? '#ffc107' : '#dc3545';

  // ---- Chart: stacked bar, one segment per shipping line, per agent ----
  const chartData = useMemo(() => {
    const carriersSeen = new Set();
    forwardingAgentNames.forEach(a => Object.keys(agentCarrierCounts[a] || {}).forEach(c => carriersSeen.add(c)));
    const carriers = [...carriersSeen].sort((a, b) => {
      if (a === NOT_RECORDED) return 1;
      if (b === NOT_RECORDED) return -1;
      return a.localeCompare(b);
    });

    const datasets = carriers.map((carrier, idx) => ({
      label: carrier,
      data: forwardingAgentNames.map(a => (agentCarrierCounts[a] || {})[carrier] || 0),
      backgroundColor: carrier === NOT_RECORDED ? '#9ca3af' : CARRIER_PALETTE[idx % CARRIER_PALETTE.length],
      borderRadius: 4,
    }));

    return { labels: forwardingAgentNames, datasets };
  }, [forwardingAgentNames, agentCarrierCounts]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.06)' } },
    },
  }), []);

  // ---- Data completeness by agent — pure forwarders only, see resolveCarrier ----
  const completeness = useMemo(() => {
    const byAgent = {};
    forwarderOnlyShipments.forEach(s => {
      const agent = s.forwardingAgent;
      byAgent[agent] = byAgent[agent] || { agent, total: 0, missing: 0 };
      byAgent[agent].total++;
      if (!s.shippingLine) byAgent[agent].missing++;
    });
    return Object.values(byAgent)
      .map(d => ({ ...d, pct: d.total > 0 ? Math.round(((d.total - d.missing) / d.total) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct);
  }, [forwarderOnlyShipments]);

  // ---- Drill-down: origin x carrier, for selected agent (or all) ----
  // Counted in distinct orders (seaOrders), same as everything else here.
  const drillDownRows = useMemo(() => {
    const relevant = selectedAgent === 'all'
      ? seaOrders
      : seaOrders.filter(s => s.forwardingAgent === selectedAgent);

    const rows = {};
    relevant.forEach(s => {
      const agent = s.forwardingAgent;
      const origin = getOrigin(s);
      const carrier = resolveCarrier(s);
      const key = `${agent}|||${origin}|||${carrier}`;
      if (!rows[key]) rows[key] = { agent, origin, carrier, count: 0 };
      rows[key].count++;
    });
    return Object.values(rows).sort((a, b) => b.count - a.count);
  }, [seaOrders, selectedAgent, getOrigin, resolveCarrier]);

  // ==================== AIRFREIGHT ====================
  // The agent IS the airline for air — no forwarder layer, no completeness
  // gap, no separate carrier field. Just usage by origin.

  const airlineNames = useMemo(() => {
    const names = new Set();
    airOrders.forEach(s => names.add(s.forwardingAgent));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [airOrders]);

  const airKpis = useMemo(() => {
    const distinctOrigins = new Set(airOrders.map(s => getOrigin(s))).size;
    return {
      total: airOrders.length,
      distinctAirlines: airlineNames.length,
      distinctOrigins,
    };
  }, [airOrders, airlineNames, getOrigin]);

  // airline -> { origin: count }
  const airlineOriginCounts = useMemo(() => {
    const counts = {};
    airOrders.forEach(s => {
      const agent = s.forwardingAgent;
      const origin = getOrigin(s);
      counts[agent] = counts[agent] || {};
      counts[agent][origin] = (counts[agent][origin] || 0) + 1;
    });
    return counts;
  }, [airOrders, getOrigin]);

  // ---- Chart: stacked bar, one segment per origin, per airline ----
  const airChartData = useMemo(() => {
    const originsSeen = new Set();
    airlineNames.forEach(a => Object.keys(airlineOriginCounts[a] || {}).forEach(o => originsSeen.add(o)));
    const origins = [...originsSeen].sort((a, b) => a.localeCompare(b));

    const datasets = origins.map((origin, idx) => ({
      label: origin,
      data: airlineNames.map(a => (airlineOriginCounts[a] || {})[origin] || 0),
      backgroundColor: CARRIER_PALETTE[idx % CARRIER_PALETTE.length],
      borderRadius: 4,
    }));

    return { labels: airlineNames, datasets };
  }, [airlineNames, airlineOriginCounts]);

  // ---- Drill-down: airline x origin, for selected airline (or all) ----
  const airDrillDownRows = useMemo(() => {
    const relevant = selectedAgent === 'all'
      ? airOrders
      : airOrders.filter(s => s.forwardingAgent === selectedAgent);

    const rows = {};
    relevant.forEach(s => {
      const agent = s.forwardingAgent;
      const origin = getOrigin(s);
      const key = `${agent}|||${origin}`;
      if (!rows[key]) rows[key] = { agent, origin, count: 0 };
      rows[key].count++;
    });
    return Object.values(rows).sort((a, b) => b.count - a.count);
  }, [airOrders, selectedAgent, getOrigin]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setSelectedAgent('all');
  };

  const agentFilterOptions = mode === 'sea' ? forwardingAgentNames : airlineNames;
  const agentFilterLabel = mode === 'sea' ? 'Forwarding Agent' : 'Airline';

  return (
    <div style={{ padding: '0 8px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-900)' }}>Forwarder vs Carrier</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-500)' }}>
            {mode === 'sea'
              ? 'Which shipping line each forwarding agent actually uses, by origin'
              : 'Which airline handles each origin — air has no separate forwarder/carrier split'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {[{ key: 'sea', label: 'Sea Freight' }, { key: 'air', label: 'Air Freight' }].map(opt => (
              <button
                key={opt.key}
                onClick={() => handleModeChange(opt.key)}
                style={{
                  padding: '6px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: mode === opt.key ? 'var(--accent)' : 'var(--surface)',
                  color: mode === opt.key ? '#fff' : 'var(--text-700)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>{agentFilterLabel}:</label>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            style={{
              padding: '6px 12px', fontSize: 13, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-900)', minWidth: 180,
            }}
          >
            <option value="all">All {mode === 'sea' ? 'Forwarding Agents' : 'Airlines'}</option>
            {agentFilterOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>Period:</label>
          <select
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            style={{
              padding: '6px 12px', fontSize: 13, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-900)', minWidth: 140,
            }}
          >
            <option value="">All Time</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>
                {new Date(`${m}-01`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === 'sea' ? (
      <>{/* ==================== SEA FREIGHT ==================== */}

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard
          label="Sea Orders with Agent"
          value={kpis.total}
          color="var(--text-900)"
          subtext="Distinct APOs — airfreight excluded, one order can have many product lines"
        />
        <KpiCard
          label="Shipping Line Recorded"
          value={kpis.completionPct}
          suffix="%"
          color={completionColor(kpis.completionPct)}
          subtext="Of shipments booked via a pure forwarder (DHL, DSV, Afrigistics)"
        />
        <KpiCard
          label="Distinct Forwarding Agents"
          value={kpis.distinctAgents}
          color="var(--text-900)"
        />
        <KpiCard
          label="Distinct Shipping Lines"
          value={kpis.distinctCarriers}
          color="var(--text-900)"
          subtext="Actually recorded, excludes gaps"
        />
      </div>

      {/* Chart */}
      <div style={{ marginBottom: 24 }}>
        <ChartCard title="Shipping Line used per Forwarding Agent" subtitle="Direct-carrier agents (MSC, Maersk, ...) always show as themselves; grey = a forwarder booking with no carrier recorded yet">
          {chartData.labels.length > 0
            ? <div style={{ height: Math.max(260, chartData.labels.length * 40) }}><BarChart data={chartData} options={chartOptions} /></div>
            : <ChartEmpty label="No sea-freight shipments with a forwarding agent yet" />}
        </ChartCard>
      </div>

      {/* Data completeness */}
      <ChartCard title="Shipping Line Data Completeness" subtitle="Pure forwarders only (DHL, DSV, Afrigistics) — lowest first" style={{ marginBottom: 24 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Forwarding Agent', 'Total Orders', 'Missing Shipping Line', 'Completion'].map(label => (
                  <th key={label} style={{
                    padding: '10px 12px', textAlign: 'left', fontSize: 11,
                    fontWeight: 700, color: 'var(--text-500)', textTransform: 'uppercase',
                    letterSpacing: 0.5, whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {completeness.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--text-500)' }}>No data available</td></tr>
              )}
              {completeness.map((c, idx) => (
                <tr key={c.agent} style={{ borderBottom: '1px solid var(--border)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-900)' }}>{c.agent}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-700)' }}>{c.total}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-700)' }}>{c.missing}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontWeight: 700, color: completionColor(c.pct) }}>{c.pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Drill-down: origin x carrier */}
      <ChartCard title="Origin / Carrier Breakdown" subtitle={selectedAgent === 'all' ? 'All forwarding agents' : selectedAgent}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Forwarding Agent', 'Origin', 'Shipping Line', 'Orders'].map(label => (
                  <th key={label} style={{
                    padding: '10px 12px', textAlign: 'left', fontSize: 11,
                    fontWeight: 700, color: 'var(--text-500)', textTransform: 'uppercase',
                    letterSpacing: 0.5, whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drillDownRows.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--text-500)' }}>No shipments for this selection</td></tr>
              )}
              {drillDownRows.map((r, idx) => (
                <tr
                  key={`${r.agent}|||${r.origin}|||${r.carrier}`}
                  style={{ borderBottom: '1px solid var(--border)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-900)' }}>{r.agent}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-700)' }}>{r.origin}</td>
                  <td style={{ padding: '10px 12px', color: r.carrier === NOT_RECORDED ? 'var(--text-500)' : 'var(--text-700)' }}>{r.carrier}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-700)' }}>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      </>
      ) : (
      <>{/* ==================== AIR FREIGHT ==================== */}

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard
          label="Air Orders with Agent"
          value={airKpis.total}
          color="var(--text-900)"
          subtext="Distinct APOs — seafreight excluded"
        />
        <KpiCard
          label="Distinct Airlines"
          value={airKpis.distinctAirlines}
          color="var(--text-900)"
        />
        <KpiCard
          label="Distinct Origins"
          value={airKpis.distinctOrigins}
          color="var(--text-900)"
        />
      </div>

      {/* Chart */}
      <div style={{ marginBottom: 24 }}>
        <ChartCard title="Origin handled per Airline" subtitle="Stacked by origin">
          {airChartData.labels.length > 0
            ? <div style={{ height: Math.max(260, airChartData.labels.length * 40) }}><BarChart data={airChartData} options={chartOptions} /></div>
            : <ChartEmpty label="No air-freight shipments with a forwarding agent yet" />}
        </ChartCard>
      </div>

      {/* Drill-down: airline x origin */}
      <ChartCard title="Origin Breakdown" subtitle={selectedAgent === 'all' ? 'All airlines' : selectedAgent}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Airline', 'Origin', 'Orders'].map(label => (
                  <th key={label} style={{
                    padding: '10px 12px', textAlign: 'left', fontSize: 11,
                    fontWeight: 700, color: 'var(--text-500)', textTransform: 'uppercase',
                    letterSpacing: 0.5, whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {airDrillDownRows.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--text-500)' }}>No shipments for this selection</td></tr>
              )}
              {airDrillDownRows.map((r, idx) => (
                <tr
                  key={`${r.agent}|||${r.origin}`}
                  style={{ borderBottom: '1px solid var(--border)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-900)' }}>{r.agent}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-700)' }}>{r.origin}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-700)' }}>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      </>
      )}
    </div>
  );
}

export default ForwarderCarrierReport;
