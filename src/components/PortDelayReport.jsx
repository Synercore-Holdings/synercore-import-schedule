import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { resolveShippingCarrier } from '../utils/shipmentConstants';
import { STATUS_LABELS } from '../types/shipment';
import { computePortTimes, formatDuration } from '../utils/portTimes';
import { getApiUrl } from '../config/api';
import { authFetch } from '../utils/authFetch';

// ---- Reusable wrappers (same pattern as ForwarderCarrierReport) ----
const Card = ({ title, subtitle, children, style }) => (
  <div className="dash-panel" style={style}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-900)' }}>{title}</h4>
      {subtitle && <span style={{ fontSize: 11, color: 'var(--text-500)' }}>{subtitle}</span>}
    </div>
    {children}
  </div>
);

const Empty = ({ label }) => (
  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-500)', fontSize: 13 }}>{label}</div>
);

const KpiCard = ({ label, value, color, subtext }) => (
  <div className="dash-panel" style={{ flex: '1 1 200px', minWidth: 180, textAlign: 'center', padding: '20px 16px' }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 32, fontWeight: 800, color: color || 'var(--text-900)', lineHeight: 1.1 }}>{value}</div>
    {subtext && <div style={{ fontSize: 11, color: 'var(--text-500)', marginTop: 6 }}>{subtext}</div>}
  </div>
);

const thStyle = {
  padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-500)',
  textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
};
const tdStyle = { padding: '8px 12px', fontSize: 13, color: 'var(--text-900)', whiteSpace: 'nowrap' };

const Table = ({ headers, children }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '2px solid var(--border)' }}>
          {headers.map(h => <th key={h} style={thStyle}>{h}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const EstimatedMark = () => (
  <span title="Includes a time reconstructed from the audit log or estimated when tracking started — correct it from the status history on the Shipping Schedule" style={{ color: '#b45309', marginLeft: 4, cursor: 'help' }}>*</span>
);

const formatDate = (ms) => (ms ? new Date(ms).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const monthKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
// Same red/amber/green feel as the other reports' thresholds, in days of delay
const delayColor = (ms) => (ms == null ? 'var(--text-900)' : ms >= 3 * 86400000 ? '#dc3545' : ms >= 86400000 ? '#d97706' : '#28a745');

const GROUP_OPTIONS = [
  { key: 'vessel', label: 'Vessel', get: (c) => c.vesselName || 'No vessel recorded' },
  { key: 'agent', label: 'Forwarding Agent', get: (c) => c.forwardingAgent || 'No agent recorded' },
  { key: 'carrier', label: 'Shipping Line', get: (c) => resolveShippingCarrier(c) || 'No line recorded' },
  { key: 'port', label: 'Port (POD)', get: (c) => c.finalPod || 'No POD recorded' },
];

function PortDelayReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupBy, setGroupBy] = useState('vessel');
  const [monthFilter, setMonthFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(getApiUrl('/api/shipments/port-delays'));
      if (!res.ok) throw new Error('Failed to load port delay data');
      const data = await res.json();
      setRows(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // One port call per order — an APO's product lines are separate shipment
  // rows but sit on the same vessel through the same port call. Keep the line
  // with the fullest status trail.
  const portCalls = useMemo(() => {
    const now = Date.now();
    const byOrder = new Map();
    rows.forEach(r => {
      const key = r.order_ref || r.id;
      const existing = byOrder.get(key);
      if (!existing || (r.history?.length || 0) > (existing.history?.length || 0)) byOrder.set(key, r);
    });
    return [...byOrder.values()].map(r => {
      const times = computePortTimes(r.history, r.latest_status, now);
      const startMs = times.portDelay?.start ?? times.berthWorking?.start ?? null;
      return {
        id: r.id,
        orderRef: r.order_ref,
        supplier: r.supplier,
        productName: r.product_name,
        vesselName: r.vessel_name,
        forwardingAgent: r.forwarding_agent,
        shippingLine: r.shipping_line,
        finalPod: r.final_pod,
        latestStatus: r.latest_status,
        startMs,
        ...times,
      };
    }).filter(c => c.startMs != null);
  }, [rows]);

  const availableMonths = useMemo(
    () => [...new Set(portCalls.map(c => monthKey(c.startMs)))].sort().reverse(),
    [portCalls]
  );

  const filtered = useMemo(
    () => (monthFilter ? portCalls.filter(c => monthKey(c.startMs) === monthFilter) : portCalls),
    [portCalls, monthFilter]
  );

  // "Currently delayed" ignores the period filter — it's about right now
  const currentlyDelayed = useMemo(
    () => portCalls.filter(c => c.portDelay?.ongoing).sort((a, b) => b.portDelay.ms - a.portDelay.ms),
    [portCalls]
  );

  const kpis = useMemo(() => {
    const completedDelays = filtered.filter(c => c.portDelay && !c.portDelay.ongoing).map(c => c.portDelay.ms);
    const completedBerth = filtered.filter(c => c.berthWorking && !c.berthWorking.ongoing).map(c => c.berthWorking.ms);
    return {
      calls: filtered.length,
      withDelay: filtered.filter(c => c.portDelay).length,
      avgDelay: avg(completedDelays),
      maxDelay: completedDelays.length ? Math.max(...completedDelays) : null,
      avgBerth: avg(completedBerth),
      completedDelayCount: completedDelays.length,
      completedBerthCount: completedBerth.length,
    };
  }, [filtered]);

  const grouped = useMemo(() => {
    const getter = GROUP_OPTIONS.find(g => g.key === groupBy).get;
    const groups = {};
    filtered.forEach(c => {
      const name = getter(c);
      groups[name] = groups[name] || { name, calls: 0, delays: [], berths: [], ongoing: 0 };
      const g = groups[name];
      g.calls++;
      if (c.portDelay?.ongoing) g.ongoing++;
      else if (c.portDelay) g.delays.push(c.portDelay.ms);
      if (c.berthWorking && !c.berthWorking.ongoing) g.berths.push(c.berthWorking.ms);
    });
    return Object.values(groups)
      .map(g => ({
        ...g,
        delayed: g.delays.length + g.ongoing,
        avgDelay: avg(g.delays),
        maxDelay: g.delays.length ? Math.max(...g.delays) : null,
        avgBerth: avg(g.berths),
      }))
      .sort((a, b) => (b.avgDelay ?? -1) - (a.avgDelay ?? -1) || b.calls - a.calls);
  }, [filtered, groupBy]);

  const sortedCalls = useMemo(() => [...filtered].sort((a, b) => b.startMs - a.startMs), [filtered]);
  const groupLabel = GROUP_OPTIONS.find(g => g.key === groupBy).label;

  const selectStyle = {
    padding: '6px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text-900)', minWidth: 150,
  };

  return (
    <div style={{ padding: '0 8px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-900)' }}>Port Delays</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-500)' }}>
            Time from Delayed - Port to Berth Working, and Berth Working to Berth Complete, per order
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>Group by:</label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selectStyle}>
            {GROUP_OPTIONS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>Period:</label>
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={selectStyle}>
            <option value="">All Time</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>
                {new Date(`${m}-01`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={load} disabled={loading} style={{ fontSize: 13 }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="dash-panel" style={{ color: 'var(--danger)', marginBottom: 20 }}>{error}</div>}

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard
          label="Delayed at Port Now"
          value={currentlyDelayed.length}
          color={currentlyDelayed.length ? '#dc3545' : 'var(--text-900)'}
          subtext={currentlyDelayed.length ? `Longest: ${formatDuration(currentlyDelayed[0].portDelay.ms)}` : 'No orders waiting at port'}
        />
        <KpiCard
          label="Avg Port Delay"
          value={formatDuration(kpis.avgDelay)}
          color={delayColor(kpis.avgDelay)}
          subtext={kpis.completedDelayCount ? `${kpis.completedDelayCount} completed delays · max ${formatDuration(kpis.maxDelay)}` : 'No completed delays yet'}
        />
        <KpiCard
          label="Avg Berth Working"
          value={formatDuration(kpis.avgBerth)}
          subtext={kpis.completedBerthCount ? `Berth Working → Berth Complete, ${kpis.completedBerthCount} orders` : 'No completed berth work yet'}
        />
        <KpiCard
          label="Port Calls Delayed"
          value={kpis.calls ? `${kpis.withDelay}/${kpis.calls}` : '—'}
          subtext="Orders that went to Delayed - Port, of all orders tracked through port"
        />
      </div>

      {/* Currently delayed */}
      <Card title="Currently Delayed at Port" subtitle="Live — longest first, ignores the period filter" style={{ marginBottom: 24 }}>
        {currentlyDelayed.length === 0 ? <Empty label={loading ? 'Loading…' : 'Nothing is delayed at port right now'} /> : (
          <Table headers={['Order', 'Supplier', 'Vessel', 'Forwarding Agent', 'POD', 'Delayed Since', 'Delayed For']}>
            {currentlyDelayed.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{c.orderRef}</td>
                <td style={tdStyle}>{c.supplier}</td>
                <td style={tdStyle}>{c.vesselName || '—'}</td>
                <td style={tdStyle}>{c.forwardingAgent || '—'}</td>
                <td style={tdStyle}>{c.finalPod || '—'}</td>
                <td style={tdStyle}>{formatDate(c.portDelay.start)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: delayColor(c.portDelay.ms) }}>
                  {formatDuration(c.portDelay.ms)}{c.isEstimated && <EstimatedMark />}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Grouped summary */}
      <Card title={`Port Delay by ${groupLabel}`} subtitle="Averages use completed delays / berth work only — worst average first" style={{ marginBottom: 24 }}>
        {grouped.length === 0 ? <Empty label={loading ? 'Loading…' : 'No port calls recorded for this period'} /> : (
          <Table headers={[groupLabel, 'Orders', 'Delayed', 'Avg Delay', 'Max Delay', 'Avg Berth Working']}>
            {grouped.map(g => (
              <tr key={g.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{g.name}</td>
                <td style={tdStyle}>{g.calls}</td>
                <td style={tdStyle}>{g.delayed}{g.ongoing ? <span style={{ color: '#dc3545' }}> ({g.ongoing} now)</span> : ''}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: delayColor(g.avgDelay) }}>{formatDuration(g.avgDelay)}</td>
                <td style={tdStyle}>{formatDuration(g.maxDelay)}</td>
                <td style={tdStyle}>{formatDuration(g.avgBerth)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Every port call */}
      <Card title="All Port Calls" subtitle="Newest first — * = time partly estimated (pre-tracking or audit log)">
        {sortedCalls.length === 0 ? <Empty label={loading ? 'Loading…' : 'No port calls recorded for this period'} /> : (
          <Table headers={['Order', 'Supplier', 'Vessel', 'Shipping Line', 'POD', 'Start', 'Port Delay', 'Berth Working', 'Total', 'Current Status']}>
            {sortedCalls.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{c.orderRef}{c.isEstimated && <EstimatedMark />}</td>
                <td style={tdStyle}>{c.supplier}</td>
                <td style={tdStyle}>{c.vesselName || '—'}</td>
                <td style={tdStyle}>{resolveShippingCarrier(c) || '—'}</td>
                <td style={tdStyle}>{c.finalPod || '—'}</td>
                <td style={tdStyle}>{formatDate(c.startMs)}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: c.portDelay ? delayColor(c.portDelay.ms) : 'var(--text-500)' }}>
                  {c.portDelay ? `${formatDuration(c.portDelay.ms)}${c.portDelay.ongoing ? ' …' : ''}` : 'No delay'}
                </td>
                <td style={tdStyle}>{c.berthWorking ? `${formatDuration(c.berthWorking.ms)}${c.berthWorking.ongoing ? ' …' : ''}` : '—'}</td>
                <td style={tdStyle}>{formatDuration(c.total?.ms)}</td>
                <td style={{ ...tdStyle, color: 'var(--text-500)' }}>{STATUS_LABELS[c.latestStatus] || c.latestStatus}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

export default PortDelayReport;
