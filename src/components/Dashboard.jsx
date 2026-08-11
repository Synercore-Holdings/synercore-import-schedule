import React, { useMemo, useState, useEffect, useCallback, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShipmentStatus, DELAYED_STATUSES, isDelayedStatus, PRE_ARRIVAL_STATUSES, getCurrentWeek } from '../types/shipment';
import { authFetch } from '../utils/authFetch';
import { getApiUrl } from '../config/api';
import { authUtils } from '../utils/auth';
import { calculateAllTotals, formatCurrency } from '../utils/costingCalculations';
import PerformanceMetrics from './PerformanceMetrics';
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

// Reusable chart wrapper
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

const STATUS_COLORS = { Planned: '#f59e0b', 'In Transit': '#3b82f6', Stored: '#10b981', Delayed: '#ef4444', Cancelled: '#6b7280' };
const WAREHOUSE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32', '#64748b', '#64748b'];
const STORED_AVERAGE_YEAR = 2026;

function Dashboard({ shipments, onOpenLiveBoard }) {
  const navigate = useNavigate();
  const [detailShipment, setDetailShipment] = useState(null);
  const [warehouseData, setWarehouseData] = useState([]);
  const [newsHeadlines, setNewsHeadlines] = useState([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [viewingAnnouncement, setViewingAnnouncement] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [annForm, setAnnForm] = useState({ title: '', description: '', link: '', expires_at: '' });
  const [editingAnnId, setEditingAnnId] = useState(null);

  const [storageRates, setStorageRates] = useState({ week1: 43, week2Plus: 53 });
  const [costingEstimates, setCostingEstimates] = useState([]);

  const isAdmin = authUtils.getUser()?.role === 'admin';

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await authFetch(getApiUrl('/api/news/announcements'));
      if (res.ok) {
        const result = await res.json();
        setAnnouncements(result.data || []);
      }
    } catch (err) { console.error('Failed to fetch announcements:', err); }
  }, []);

  const saveAnnouncement = async () => {
    if (!annForm.title.trim()) return;
    try {
      const url = editingAnnId
        ? getApiUrl(`/api/news/announcements/${editingAnnId}`)
        : getApiUrl('/api/news/announcements');
      const res = await authFetch(url, {
        method: editingAnnId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annForm),
      });
      if (res.ok) {
        setAnnForm({ title: '', description: '', link: '', expires_at: '' });
        setEditingAnnId(null);
        fetchAnnouncements();
      }
    } catch (err) { console.error('Failed to save announcement:', err); }
  };

  const toggleAnnouncement = async (id, active) => {
    try {
      await authFetch(getApiUrl(`/api/news/announcements/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      });
      fetchAnnouncements();
    } catch (err) { console.error('Failed to toggle announcement:', err); }
  };

  const deleteAnnouncement = async (id) => {
    try {
      await authFetch(getApiUrl(`/api/news/announcements/${id}`), { method: 'DELETE' });
      fetchAnnouncements();
    } catch (err) { console.error('Failed to delete announcement:', err); }
  };

  // Fetch supply chain news headlines (polls every 30 min to match backend cache)
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch(getApiUrl('/api/news'));
        if (res.ok) {
          const result = await res.json();
          setNewsHeadlines(result.data || []);
        }
      } catch (err) { /* silently ignore */ }
    };
    fetchNews();
    const interval = setInterval(fetchNews, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch warehouse capacity data
  useEffect(() => {
    const fetchCapacity = async () => {
      try {
        const res = await authFetch(getApiUrl('/api/warehouse-capacity'));
        if (res.ok) {
          const data = await res.json();
          setWarehouseData(Array.isArray(data) ? data : (data.data || []));
        }
      } catch (err) { /* silently ignore */ }
    };
    fetchCapacity();
  }, []);

  // Fetch storage benchmark rates for offsite cost calculation
  useEffect(() => {
    const fetchStorageRates = async () => {
      try {
        const res = await authFetch(getApiUrl('/api/bol-audit/clearing-benchmarks'));
        if (!res.ok) return;
        const json = await res.json();
        const benchmarks = json.data || json;
        const w1 = benchmarks.find(b => /STORAGE.*PALLET.*WEEK\s*1\b/i.test(b.description));
        const w2 = benchmarks.find(b => /STORAGE.*PALLET.*WEEK\s*2/i.test(b.description));
        if (w1 || w2) {
          setStorageRates({
            week1: w1 ? parseFloat(w1.unit_rate_zar) : 43,
            week2Plus: w2 ? parseFloat(w2.unit_rate_zar) : 53,
          });
        }
      } catch {
        // keep defaults
      }
    };
    fetchStorageRates();
  }, []);

  // Fetch import costing estimates
  useEffect(() => {
    const fetchCosting = async () => {
      try {
        const res = await authFetch(getApiUrl('/api/costing?limit=5000'));
        if (res.ok) {
          const json = await res.json();
          setCostingEstimates(Array.isArray(json) ? json : (json.data || []));
        }
      } catch (err) { /* silently ignore */ }
    };
    fetchCosting();
  }, []);

  // Import costing KPI computations
  const costingKpis = useMemo(() => {
    const active = costingEstimates.filter(e => !e.archived);
    if (active.length === 0) return {
      seaAvgLandedPerKg: 0,
      airAvgLandedPerKg: 0,
      seaCount: 0,
      airCount: 0,
      totalCostedValue: 0,
      seaTotalCost: 0,
      airTotalCost: 0,
      monthlyStats: [],
      avgMonthlyCostedValue: 0,
      avgMonthlyEstimateCount: 0,
    };

    let seaTotalLandedPerKg = 0;
    let airTotalLandedPerKg = 0;
    let seaLandedPerKgCount = 0;
    let airLandedPerKgCount = 0;
    let seaCount = 0;
    let airCount = 0;
    let totalCostedValue = 0;
    let seaTotalCost = 0;
    let airTotalCost = 0;
    const monthlyMap = new Map();

    active.forEach(est => {
      const totals = calculateAllTotals(est);
      const landedCost = totals.total_landed_cost_zar || 0;
      const costPerKg = totals.all_in_warehouse_cost_per_kg_zar || 0;
      const isAir = (est.transport_mode || 'sea') === 'air';

      totalCostedValue += landedCost;

      if (isAir) {
        airCount++;
        airTotalCost += landedCost;
        if (costPerKg > 0) {
          airTotalLandedPerKg += costPerKg;
          airLandedPerKgCount++;
        }
      } else {
        seaCount++;
        seaTotalCost += landedCost;
        if (costPerKg > 0) {
          seaTotalLandedPerKg += costPerKg;
          seaLandedPerKgCount++;
        }
      }

      const dateStr = est.costing_date || est.created_at;
      const d = dateStr ? new Date(dateStr) : null;
      if (d && !isNaN(d.getTime())) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const entry = monthlyMap.get(key) || { key, year: d.getFullYear(), month: d.getMonth(), total: 0, count: 0 };
        entry.total += landedCost;
        entry.count += 1;
        monthlyMap.set(key, entry);
      }
    });

    const monthlyStats = Array.from(monthlyMap.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(entry => ({
        ...entry,
        label: new Date(entry.year, entry.month, 1).toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' }),
      }));
    const monthsCount = monthlyStats.length || 1;

    return {
      seaAvgLandedPerKg: seaLandedPerKgCount > 0 ? seaTotalLandedPerKg / seaLandedPerKgCount : 0,
      airAvgLandedPerKg: airLandedPerKgCount > 0 ? airTotalLandedPerKg / airLandedPerKgCount : 0,
      seaCount,
      airCount,
      totalCostedValue,
      seaTotalCost,
      airTotalCost,
      monthlyStats,
      avgMonthlyCostedValue: totalCostedValue / monthsCount,
      avgMonthlyEstimateCount: active.length / monthsCount,
    };
  }, [costingEstimates]);

  // Consolidated single-pass computation: stats, percentage deltas, and offsite average
  // Separate international and local shipments
  const internationalShipments = useMemo(() =>
    (shipments || []).filter(s => s.shipmentType !== 'local'), [shipments]);
  const localShipments = useMemo(() =>
    (shipments || []).filter(s => s.shipmentType === 'local'), [shipments]);

  // Local receiving summary stats
  const localStats = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const endOfWeek = new Date(today); endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    const arrivedStatuses = ['arrived_pta', 'arrived_klm', 'arrived_offsite'];
    const postArrivalStatuses = ['unloading', 'inspection_pending', 'inspecting', 'inspection_passed', 'inspection_failed', 'receiving'];
    const delayedStatuses = ['delayed_supplier', 'delayed_documents', 'delayed_port', 'delayed_customs'];

    const parseDate = (d) => {
      if (!d) return null;
      try {
        const num = Number(d);
        if (!isNaN(num) && num > 30000 && num < 60000) {
          const epoch = new Date(1899, 11, 30);
          return new Date(epoch.getTime() + num * 86400000);
        }
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) return parsed;
        return null;
      } catch { return null; }
    };

    let overdue = 0;
    let dueThisWeek = 0;
    localShipments.forEach(s => {
      const expected = parseDate(s.vesselName);
      if (expected && expected < today &&
        !arrivedStatuses.includes(s.latestStatus) && !postArrivalStatuses.includes(s.latestStatus) &&
        s.latestStatus !== 'stored' && s.latestStatus !== 'cancelled') {
        overdue++;
      }
      if (expected && expected >= today && expected <= endOfWeek && s.latestStatus === 'in_transit_roadway') {
        dueThisWeek++;
      }
    });

    // Aggregate by supplier, warehouse, carrier for charts
    const bySupplier = {};
    const byWarehouse = {};
    const byCarrier = {};
    localShipments.forEach(s => {
      const sup = s.supplier || 'Unknown';
      bySupplier[sup] = (bySupplier[sup] || 0) + 1;
      const wh = s.receivingWarehouse || 'Unassigned';
      byWarehouse[wh] = (byWarehouse[wh] || 0) + 1;
      const carrier = s.forwardingAgent || 'Unknown';
      byCarrier[carrier] = (byCarrier[carrier] || 0) + 1;
    });

    return {
      total: localShipments.length,
      overdue,
      dueThisWeek,
      inTransit: localShipments.filter(s => s.latestStatus === 'in_transit_roadway').length,
      arrived: localShipments.filter(s => arrivedStatuses.includes(s.latestStatus)).length,
      postArrival: localShipments.filter(s => postArrivalStatuses.includes(s.latestStatus)).length,
      stored: localShipments.filter(s => s.latestStatus === 'stored').length,
      delayed: localShipments.filter(s => delayedStatuses.includes(s.latestStatus)).length,
      bySupplier,
      byWarehouse,
      byCarrier,
    };
  }, [localShipments]);

  const { stats, pctDeltas, avgDaysOffsite } = useMemo(() => {
    const supplierOrderRefs = {};
    const warehouseOrderRefs = {};
    const weekOrderRefs = {};
    const currentWeek = getCurrentWeek();

    const weekStatusRefs = {
      curr: { total: new Set(), planned: new Set(), inTransit: new Set(), stored: new Set(), delayed: new Set() },
      prev: { total: new Set(), planned: new Set(), inTransit: new Set(), stored: new Set(), delayed: new Set() },
    };

    const statusOrderRefs = {
      planned: new Set(),
      inTransit: new Set(),
      stored: new Set(),
      delayed: new Set(),
      cancelled: new Set(),
      // Event-specific sub-buckets (also counted inside inTransit so the
      // aggregate In Transit KPI stays accurate)
      berthWorking: new Set(),
      airCustomsClearance: new Set(),
    };

    // Status category arrays for pctDeltas computation
    const plannedStatuses = [ShipmentStatus.PLANNED_AIRFREIGHT, ShipmentStatus.PLANNED_SEAFREIGHT];
    const transitStatuses = [
      ShipmentStatus.IN_TRANSIT_AIRFREIGHT, ShipmentStatus.AIR_CUSTOMS_CLEARANCE,
      ShipmentStatus.IN_TRANSIT_ROADWAY, ShipmentStatus.IN_TRANSIT_SEAWAY,
      ShipmentStatus.MOORED, ShipmentStatus.BERTH_WORKING, ShipmentStatus.BERTH_COMPLETE, ShipmentStatus.GATED_IN_PORT,
    ];
    const storedStatuses = [
      ShipmentStatus.ARRIVED_PTA, ShipmentStatus.ARRIVED_KLM, ShipmentStatus.ARRIVED_OFFSITE,
      ShipmentStatus.UNLOADING, ShipmentStatus.INSPECTION_PENDING, ShipmentStatus.INSPECTING,
      ShipmentStatus.INSPECTION_PASSED, ShipmentStatus.INSPECTION_FAILED,
      ShipmentStatus.RECEIVING, ShipmentStatus.RECEIVED,
      ShipmentStatus.STORED, ShipmentStatus.ARCHIVED,
    ];

    // Date-based week-over-week counting for percentage deltas
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const dateWeekCounts = {
      thisWeek: { total: 0, planned: 0, inTransit: 0, stored: 0, delayed: 0 },
      lastWeek: { total: 0, planned: 0, inTransit: 0, stored: 0, delayed: 0 },
    };

    // Offsite average days tracking
    const offsitePostArrivalStatuses = [
      ShipmentStatus.ARRIVED_OFFSITE,
      ShipmentStatus.UNLOADING, ShipmentStatus.INSPECTION_PENDING, ShipmentStatus.INSPECTING,
      ShipmentStatus.INSPECTION_PASSED, ShipmentStatus.INSPECTION_FAILED,
      ShipmentStatus.RECEIVING, ShipmentStatus.RECEIVED,
      ShipmentStatus.STORED, ShipmentStatus.ARCHIVED,
    ];
    let offsiteDaysSum = 0;
    let offsiteCount = 0;

    // Use only international shipments for dashboard stats
    internationalShipments.forEach(shipment => {
      // Normalise orderRef before it goes into any Set — trim whitespace +
      // uppercase so stray " APO0017533 " / "apo0017533" / "APO0017533"
      // variants don't each count as a separate APO.
      const orderRef = (shipment.orderRef || '').trim().toUpperCase();
      if (!orderRef) return;

      const wk = shipment.weekNumber;
      const weekBucket = wk === currentWeek ? 'curr' : wk === currentWeek - 1 ? 'prev' : null;

      // Check if shipment is overdue: still pre-arrival but past its scheduled week
      const isOverdue = wk > 0 && wk < currentWeek && PRE_ARRIVAL_STATUSES.includes(shipment.latestStatus);

      let statusKey = null;
      switch (shipment.latestStatus) {
        case ShipmentStatus.PLANNED_AIRFREIGHT:
        case ShipmentStatus.PLANNED_SEAFREIGHT:
          if (isOverdue) {
            statusOrderRefs.delayed.add(orderRef); statusKey = 'delayed';
          } else {
            statusOrderRefs.planned.add(orderRef); statusKey = 'planned';
          }
          break;
        case ShipmentStatus.IN_TRANSIT_AIRFREIGHT:
        case ShipmentStatus.AIR_CUSTOMS_CLEARANCE:
        case ShipmentStatus.IN_TRANSIT_ROADWAY:
        case ShipmentStatus.IN_TRANSIT_SEAWAY:
        case ShipmentStatus.MOORED:
        case ShipmentStatus.BERTH_WORKING:
        case ShipmentStatus.BERTH_COMPLETE:
        case ShipmentStatus.GATED_IN_PORT:
          if (isOverdue) {
            statusOrderRefs.delayed.add(orderRef); statusKey = 'delayed';
          } else {
            statusOrderRefs.inTransit.add(orderRef); statusKey = 'inTransit';
            if (shipment.latestStatus === ShipmentStatus.BERTH_WORKING) {
              statusOrderRefs.berthWorking.add(orderRef);
            } else if (shipment.latestStatus === ShipmentStatus.AIR_CUSTOMS_CLEARANCE) {
              statusOrderRefs.airCustomsClearance.add(orderRef);
            }
          }
          break;
        case ShipmentStatus.ARRIVED_PTA:
        case ShipmentStatus.ARRIVED_KLM:
        case ShipmentStatus.ARRIVED_OFFSITE:
        case ShipmentStatus.UNLOADING:
        case ShipmentStatus.INSPECTION_PENDING:
        case ShipmentStatus.INSPECTING:
        case ShipmentStatus.INSPECTION_PASSED:
        case ShipmentStatus.INSPECTION_FAILED:
        case ShipmentStatus.RECEIVING:
        case ShipmentStatus.RECEIVED:
        case ShipmentStatus.STORED:
        case ShipmentStatus.ARCHIVED:
          statusOrderRefs.stored.add(orderRef); statusKey = 'stored'; break;
        case ShipmentStatus.DELAYED_PORT:
        case ShipmentStatus.DELAYED_CUSTOMS:
        case ShipmentStatus.DELAYED_DOCUMENTS:
        case ShipmentStatus.DELAYED_SUPPLIER:
          statusOrderRefs.delayed.add(orderRef); statusKey = 'delayed'; break;
        case ShipmentStatus.CANCELLED:
          statusOrderRefs.cancelled.add(orderRef); break;
        default: break;
      }

      if (weekBucket) {
        weekStatusRefs[weekBucket].total.add(orderRef);
        if (statusKey) weekStatusRefs[weekBucket][statusKey].add(orderRef);
      }

      const warehouse = shipment.receivingWarehouse || shipment.finalPod || 'Unassigned';
      if (!warehouseOrderRefs[warehouse]) warehouseOrderRefs[warehouse] = new Set();
      warehouseOrderRefs[warehouse].add(orderRef);

      const supplier = shipment.supplier || 'Unknown';
      if (!supplierOrderRefs[supplier]) supplierOrderRefs[supplier] = new Set();
      supplierOrderRefs[supplier].add(orderRef);

      const week = shipment.weekNumber || 'N/A';
      if (!weekOrderRefs[week]) weekOrderRefs[week] = new Set();
      weekOrderRefs[week].add(orderRef);

      // Date-based week-over-week counting for pctDeltas
      const d = new Date(shipment.updatedAt || shipment.createdAt);
      const shipmentIsDelayed = isDelayedStatus(shipment.latestStatus) ||
        (shipment.weekNumber > 0 && shipment.weekNumber < currentWeek && PRE_ARRIVAL_STATUSES.includes(shipment.latestStatus));
      let dateBucket = null;
      if (d >= oneWeekAgo) dateBucket = 'thisWeek';
      else if (d >= twoWeeksAgo) dateBucket = 'lastWeek';
      if (dateBucket) {
        dateWeekCounts[dateBucket].total++;
        if (shipmentIsDelayed) {
          dateWeekCounts[dateBucket].delayed++;
        } else if (plannedStatuses.includes(shipment.latestStatus)) {
          dateWeekCounts[dateBucket].planned++;
        } else if (transitStatuses.includes(shipment.latestStatus)) {
          dateWeekCounts[dateBucket].inTransit++;
        } else if (storedStatuses.includes(shipment.latestStatus)) {
          dateWeekCounts[dateBucket].stored++;
        }
      }

      // Average days in OFFSITE storage
      if (offsitePostArrivalStatuses.includes(shipment.latestStatus) &&
          (shipment.receivingWarehouse || '').toUpperCase() === 'OFFSITE') {
        const storedDate = new Date(shipment.receivingDate || shipment.updatedAt || shipment.createdAt);
        offsiteDaysSum += Math.max(0, Math.floor((Date.now() - storedDate.getTime()) / (1000 * 60 * 60 * 24)));
        offsiteCount++;
      }
    });

    const uniqueOrderRefs = new Set(internationalShipments.map(s => s.orderRef).filter(Boolean));

    const result = {
      total: uniqueOrderRefs.size,
      planned: statusOrderRefs.planned.size,
      inTransit: statusOrderRefs.inTransit.size,
      stored: statusOrderRefs.stored.size,
      delayed: statusOrderRefs.delayed.size,
      cancelled: statusOrderRefs.cancelled.size,
      berthWorking: statusOrderRefs.berthWorking.size,
      airCustomsClearance: statusOrderRefs.airCustomsClearance.size,
      byWarehouse: {},
      bySupplier: {},
      byWeek: {},
      deltas: {
        total: weekStatusRefs.curr.total.size - weekStatusRefs.prev.total.size,
        planned: weekStatusRefs.curr.planned.size - weekStatusRefs.prev.planned.size,
        inTransit: weekStatusRefs.curr.inTransit.size - weekStatusRefs.prev.inTransit.size,
        stored: weekStatusRefs.curr.stored.size - weekStatusRefs.prev.stored.size,
        delayed: weekStatusRefs.curr.delayed.size - weekStatusRefs.prev.delayed.size,
      },
    };

    Object.keys(warehouseOrderRefs).forEach(w => { result.byWarehouse[w] = warehouseOrderRefs[w].size; });
    Object.keys(supplierOrderRefs).forEach(s => { result.bySupplier[s] = supplierOrderRefs[s].size; });
    Object.keys(weekOrderRefs).forEach(w => { result.byWeek[w] = weekOrderRefs[w].size; });

    // Compute percentage-based week-over-week deltas (single-pass)
    const computePctDelta = (tw, lw) => {
      if (lw === 0) return tw > 0 ? '+100%' : '0%';
      const pct = Math.round(((tw - lw) / lw) * 100);
      return pct >= 0 ? `+${pct}%` : `${pct}%`;
    };

    return {
      stats: result,
      pctDeltas: {
        total: computePctDelta(dateWeekCounts.thisWeek.total, dateWeekCounts.lastWeek.total),
        inTransit: computePctDelta(dateWeekCounts.thisWeek.inTransit, dateWeekCounts.lastWeek.inTransit),
        stored: computePctDelta(dateWeekCounts.thisWeek.stored, dateWeekCounts.lastWeek.stored),
        delayed: computePctDelta(dateWeekCounts.thisWeek.delayed, dateWeekCounts.lastWeek.delayed),
        planned: computePctDelta(dateWeekCounts.thisWeek.planned, dateWeekCounts.lastWeek.planned),
      },
      avgDaysOffsite: offsiteCount > 0 ? Math.round(offsiteDaysSum / offsiteCount) : 0,
    };
  }, [internationalShipments]);

  // Supplier on-time trend (last 8 weeks)
  const supplierOnTimeTrend = useMemo(() => {
    const arrivedStatuses = [
      ShipmentStatus.ARRIVED_PTA, ShipmentStatus.ARRIVED_KLM, ShipmentStatus.ARRIVED_OFFSITE,
      ShipmentStatus.STORED, ShipmentStatus.RECEIVED, ShipmentStatus.ARCHIVED,
      ShipmentStatus.UNLOADING, ShipmentStatus.INSPECTION_PENDING, ShipmentStatus.INSPECTING,
      ShipmentStatus.INSPECTION_PASSED, ShipmentStatus.RECEIVING,
    ];
    const weeks = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const weekShipments = internationalShipments.filter(s => {
        const d = new Date(s.updatedAt || s.createdAt);
        return d >= weekStart && d < weekEnd;
      });
      const arrived = weekShipments.filter(s => arrivedStatuses.includes(s.latestStatus));
      const pct = weekShipments.length > 0 ? Math.round((arrived.length / weekShipments.length) * 100) : 0;
      const weekNum = Math.ceil((weekStart.getTime() - new Date(weekStart.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
      weeks.push({ label: `W${weekNum}`, pct });
    }
    return weeks;
  }, [internationalShipments]);

  // Status donut data
  const statusChartData = useMemo(() => [
    { name: 'Planned', value: stats.planned },
    { name: 'In Transit', value: stats.inTransit },
    { name: 'Stored', value: stats.stored },
    { name: 'Delayed', value: stats.delayed },
    { name: 'Cancelled', value: stats.cancelled },
  ].filter(item => item.value > 0), [stats]);

  const statusTotal = useMemo(() => statusChartData.reduce((s, i) => s + i.value, 0), [statusChartData]);

  // Warehouse bar data
  const warehouseChartData = useMemo(() =>
    Object.entries(stats.byWarehouse).map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count), [stats.byWarehouse]);

  // Top suppliers
  const topSuppliersData = useMemo(() =>
    Object.entries(stats.bySupplier)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })), [stats.bySupplier]);

  const supplierTotal = useMemo(() => topSuppliersData.reduce((s, i) => s + i.count, 0), [topSuppliersData]);

  // Weekly trend (orders per week)
  const weeklyTrend = useMemo(() => {
    const currentWeek = getCurrentWeek();
    const maxWeek = currentWeek + 2;
    return Object.entries(stats.byWeek)
      .filter(([w]) => w !== 'N/A')
      .map(([w, c]) => ({ week: `W${w}`, orders: c, _wk: Number(w) }))
      .filter(d => d._wk <= maxWeek)
      .sort((a, b) => a._wk - b._wk)
      .slice(-12);
  }, [stats.byWeek]);

  // Products & Pallets trend
  const productsPalletsTrend = useMemo(() => {
    const currentWeek = getCurrentWeek();
    const maxWeek = currentWeek + 2;
    const weeks = {};
    internationalShipments.forEach(s => {
      const wk = Number(s.weekNumber) || 0;
      if (wk === 0 || wk > maxWeek) return;
      if (!weeks[wk]) weeks[wk] = { products: 0, pallets: 0 };
      weeks[wk].products += 1;
      weeks[wk].pallets += Math.round(Number(s.palletQty) || 0);
    });
    const sorted = Object.keys(weeks).map(Number).sort((a, b) => a - b).slice(-12);
    if (sorted.length < 2) return null;
    return sorted.map(w => ({ week: `W${w}`, products: weeks[w].products, pallets: weeks[w].pallets }));
  }, [internationalShipments]);

  // Offsite storage duration
  const offsiteChartData = useMemo(() => {
    const now = new Date();
    const offsiteStatuses = [
      ShipmentStatus.ARRIVED_OFFSITE,
      ShipmentStatus.UNLOADING, ShipmentStatus.INSPECTION_PENDING, ShipmentStatus.INSPECTING,
      ShipmentStatus.INSPECTION_PASSED, ShipmentStatus.INSPECTION_FAILED,
      ShipmentStatus.RECEIVING, ShipmentStatus.RECEIVED,
      ShipmentStatus.STORED, ShipmentStatus.ARCHIVED,
    ];
    const offsite = internationalShipments.filter(s =>
      offsiteStatuses.includes(s.latestStatus) &&
      (s.receivingWarehouse || '').toUpperCase() === 'OFFSITE'
    );
    if (offsite.length === 0) return [];
    return offsite
      .map(s => {
        const storedDate = s.receivingDate || s.updatedAt || s.estimatedArrival;
        const days = storedDate ? Math.max(0, Math.floor((now - new Date(storedDate)) / (1000 * 60 * 60 * 24))) : 0;
        const label = `${s.orderRef || 'N/A'} — ${(s.productName || 'Unknown').slice(0, 25)}`;
        return { label, days };
      })
      .sort((a, b) => b.days - a.days);
  }, [internationalShipments]);

  // Total offsite storage cost
  const totalStorageCost = useMemo(() => {
    const offsiteStatuses = [
      ShipmentStatus.ARRIVED_OFFSITE,
      ShipmentStatus.UNLOADING, ShipmentStatus.INSPECTION_PENDING, ShipmentStatus.INSPECTING,
      ShipmentStatus.INSPECTION_PASSED, ShipmentStatus.INSPECTION_FAILED,
      ShipmentStatus.RECEIVING, ShipmentStatus.RECEIVED,
      ShipmentStatus.STORED, ShipmentStatus.ARCHIVED,
    ];
    const offsite = internationalShipments.filter(s =>
      offsiteStatuses.includes(s.latestStatus) &&
      (s.receivingWarehouse || '').toUpperCase() === 'OFFSITE'
    );
    return offsite.reduce((sum, s) => {
      const storedDate = s.receivingDate || s.updatedAt || s.estimatedArrival;
      if (!storedDate) return sum;
      const days = Math.max(0, Math.floor((new Date() - new Date(storedDate)) / (1000 * 60 * 60 * 24)));
      if (days === 0) return sum;
      const pallets = Math.round(s.palletQty) || 1;
      const totalWeeks = Math.ceil(days / 7);
      const cost = totalWeeks <= 1
        ? pallets * storageRates.week1
        : pallets * (storageRates.week1 + (totalWeeks - 1) * storageRates.week2Plus);
      return sum + cost;
    }, 0);
  }, [internationalShipments, storageRates]);

  const formattedStorageCost = `R${Math.round(totalStorageCost).toLocaleString('en-ZA')}`;

  const avgStoredShipments2026PerMonth = useMemo(() => {
    const now = new Date();
    const monthsInAverage = now.getFullYear() === STORED_AVERAGE_YEAR
      ? now.getMonth() + 1
      : now.getFullYear() > STORED_AVERAGE_YEAR ? 12 : 0;
    if (monthsInAverage === 0) return '0';

    const storedRefs = new Set();
    internationalShipments.forEach(s => {
      if (![ShipmentStatus.STORED, ShipmentStatus.ARCHIVED].includes(s.latestStatus)) return;
      const storedDate = new Date(s.storedDate || s.receivingDate || s.updatedAt || s.createdAt);
      if (Number.isNaN(storedDate.getTime()) || storedDate.getFullYear() !== STORED_AVERAGE_YEAR) return;
      storedRefs.add(String(s.orderRef || s.id || '').trim().toUpperCase());
    });

    const average = storedRefs.size / monthsInAverage;
    return Number.isInteger(average) ? String(average) : average.toFixed(1);
  }, [internationalShipments]);

  const getUpcomingOrders = () => {
    const currentWeek = getCurrentWeek();
    const activeStatuses = [
      ShipmentStatus.PLANNED_AIRFREIGHT, ShipmentStatus.PLANNED_SEAFREIGHT,
      ShipmentStatus.IN_TRANSIT_AIRFREIGHT, ShipmentStatus.IN_TRANSIT_SEAWAY,
      ShipmentStatus.IN_TRANSIT_ROADWAY, ShipmentStatus.AIR_CUSTOMS_CLEARANCE,
      ShipmentStatus.MOORED, ShipmentStatus.BERTH_WORKING, ShipmentStatus.BERTH_COMPLETE, ShipmentStatus.GATED_IN_PORT,
      ...DELAYED_STATUSES,
    ];
    return internationalShipments
      .filter(s =>
        s.weekNumber && s.weekNumber >= currentWeek &&
        activeStatuses.includes(s.latestStatus)
      )
      .sort((a, b) => (a.weekNumber || 0) - (b.weekNumber || 0))
      .slice(0, 5);
  };

  const upcomingOrders = getUpcomingOrders();

  // KPI cards
  const kpiCards = [
    { key: 'total', value: stats.total, label: 'Total Shipments', icon: '📦', ring: 'ring-accent', tint: 'rgba(5,150,105,0.1)', filter: null, delta: stats.deltas.total, pctDelta: pctDeltas.total },
    { key: 'transit', value: stats.inTransit, label: 'In Transit', icon: '🚢', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)', filter: 'in_transit', delta: stats.deltas.inTransit, pctDelta: pctDeltas.inTransit, info: stats.inTransit > 0 ? { label: 'Active', pill: 'pill-info' } : null },
    { key: 'stored', value: stats.stored, label: 'Stored', icon: '✅', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)', filter: 'stored', view: 'stored', delta: stats.deltas.stored, pctDelta: pctDeltas.stored, info: { label: `${avgStoredShipments2026PerMonth}/mo in 2026`, pill: 'pill-ok' } },
    { key: 'delayed', value: stats.delayed, label: 'Delayed', icon: '⚠️', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)', filter: 'delayed', delta: stats.deltas.delayed, pctDelta: pctDeltas.delayed, info: stats.delayed > 0 ? { label: 'Needs Attention', pill: 'pill-bad' } : null },
    { key: 'planned', value: stats.planned, label: 'Planned', icon: '📅', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)', filter: 'planned', delta: stats.deltas.planned, pctDelta: pctDeltas.planned },
    { key: 'berthWorking', value: stats.berthWorking, label: 'Berth Working', icon: '🏗️', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)', filter: 'berth_working', delta: null, pctDelta: null, info: stats.berthWorking > 0 ? { label: 'At Port', pill: 'pill-info' } : null },
    { key: 'airCustoms', value: stats.airCustomsClearance, label: 'Air Customs Clearance', icon: '🛂', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)', filter: 'air_customs_clearance', delta: null, pctDelta: null, info: stats.airCustomsClearance > 0 ? { label: 'In Clearance', pill: 'pill-info' } : null },
    { key: 'offsite', value: `${avgDaysOffsite}d`, label: 'Avg Days in OFFSITE', icon: '🏭', ring: 'ring-accent', tint: 'rgba(139,92,246,0.1)', filter: 'stored', view: 'stored', delta: null, pctDelta: null },
    { key: 'storageCost', value: formattedStorageCost, label: 'Storage Cost', icon: '💰', ring: 'ring-warning', tint: 'rgba(245,158,11,0.08)', filter: 'stored', view: 'stored', delta: null, pctDelta: null },
  ];

  const renderDelta = (delta, pctDelta) => {
    if (delta === null && pctDelta === null) return null;
    const pctColor = pctDelta && pctDelta.startsWith('+') ? 'var(--success)' : pctDelta && pctDelta.startsWith('-') ? 'var(--danger)' : 'var(--text-500)';
    if (delta > 0) return (
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
        ↑ {delta}
        {pctDelta && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: pctColor }}>{pctDelta} vs last week</span>}
      </span>
    );
    if (delta < 0) return (
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
        ↓ {Math.abs(delta)}
        {pctDelta && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: pctColor }}>{pctDelta} vs last week</span>}
      </span>
    );
    return (
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-500)', opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}>
        —
        {pctDelta && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: pctColor }}>{pctDelta} vs last week</span>}
      </span>
    );
  };

  return (
    <div style={{ padding: '1rem' }}>
      <div className="brand-strip" />

      {/* Freight News Ticker */}
      {newsHeadlines.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          borderRadius: '8px', padding: '8px 16px', marginBottom: '0.75rem',
          overflow: 'hidden', position: 'relative',
        }}>
          <style>{`
            @keyframes news-scroll {
              0% { transform: translateX(100%); }
              100% { transform: translateX(-100%); }
            }
            .news-ticker-track:hover {
              animation-play-state: paused !important;
            }
          `}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isAdmin && (
              <button
                onClick={() => { setShowAnnouncementModal(true); fetchAnnouncements(); }}
                title="Manage Announcements"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                  fontSize: '1rem', lineHeight: 1, flexShrink: 0, color: '#f59e0b',
                }}
              >&#128226;</button>
            )}
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b',
              textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              Supply Chain
            </span>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div className="news-ticker-track" style={{
                display: 'flex', gap: '3rem', whiteSpace: 'nowrap',
                animation: `news-scroll ${newsHeadlines.length * 4}s linear infinite`,
              }}>
                {newsHeadlines.map((item, i) => {
                  const isSynercore = item.source === 'Synercore';
                  const hasDetail = isSynercore && item.description;
                  const Tag = item.link && !hasDetail ? 'a' : 'span';
                  const linkProps = item.link && !hasDetail ? { href: item.link, target: '_blank', rel: 'noopener noreferrer' } : {};
                  const badgeBg = isSynercore ? '#d97706' :
                    item.source === 'Freight News' ? '#2563eb' :
                    item.source === 'The Loadstar' ? '#7c3aed' :
                    item.source === 'gCaptain' ? '#0891b2' : '#059669';
                  return (
                    <Tag
                      key={i}
                      {...linkProps}
                      title={!hasDetail && item.description ? item.description : ''}
                      onClick={hasDetail ? (e) => { e.preventDefault(); setViewingAnnouncement(item); } : undefined}
                      style={{
                        color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem',
                        textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
                        cursor: item.link || hasDetail ? 'pointer' : 'default',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#f59e0b'}
                      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
                    >
                      {item.source && (
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 600, padding: '1px 5px',
                          borderRadius: '3px', flexShrink: 0,
                          background: badgeBg, color: '#fff',
                        }}>{item.source}</span>
                      )}
                      {item.title}
                    </Tag>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {authUtils.getUser()?.role === 'admin' && <PerformanceMetrics />}

      {/* KPI Cards */}
      <div className="stats-grid">
        {kpiCards.map(card => (
          <div key={card.key} className={`stat-card ${card.ring} clickable`}
            role="button" tabIndex={0}
            aria-label={`${card.value} ${card.label} — click to view`}
            onClick={() => { const path = card.view ? `/${card.view}` : '/shipping'; startTransition(() => navigate(card.filter ? `${path}?status=${card.filter}` : path)); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const path = card.view ? `/${card.view}` : '/shipping'; startTransition(() => navigate(card.filter ? `${path}?status=${card.filter}` : path)); } }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 12,
              backgroundColor: card.tint, marginBottom: 6,
            }}>{card.icon}</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>{card.value}</h3>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: '0 0 1px' }}>
              {card.label}
            </p>
            {renderDelta(card.delta, card.pctDelta)}
            {card.info && <span className={`pill ${card.info.pill}`} style={{ fontSize: 10, padding: '2px 6px', marginTop: 2 }}>{card.info.label}</span>}
          </div>
        ))}
      </div>

      {/* Local Receiving Section */}
      {localStats.total > 0 && (() => {
        const localStatusData = [
          { name: 'In Transit', value: localStats.inTransit, color: '#3b82f6' },
          { name: 'Arrived', value: localStats.arrived, color: '#10b981' },
          { name: 'Post-Arrival', value: localStats.postArrival, color: '#f59e0b' },
          { name: 'Stored', value: localStats.stored, color: '#059669' },
          { name: 'Delayed', value: localStats.delayed, color: '#ef4444' },
          { name: 'Overdue', value: localStats.overdue, color: '#dc2626' },
        ].filter(d => d.value > 0);
        const localStatusTotal = localStatusData.reduce((s, d) => s + d.value, 0);
        const localSupplierData = Object.entries(localStats.bySupplier)
          .sort(([, a], [, b]) => b - a).slice(0, 5)
          .map(([name, count]) => ({ name, count }));
        const localSupplierTotal = localSupplierData.reduce((s, d) => s + d.count, 0);
        const localWarehouseData = Object.entries(localStats.byWarehouse)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => ({ name, count }));
        const localCarrierData = Object.entries(localStats.byCarrier)
          .filter(([name]) => name !== 'Unknown')
          .sort(([, a], [, b]) => b - a).slice(0, 5)
          .map(([name, count]) => ({ name, count }));

        return (
          <>
            {/* Header + stat chips */}
            <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--navy-900)', letterSpacing: '0.3px' }}>
                  Local Receiving
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-500)' }}>
                  Road deliveries & inter-warehouse transfers
                </p>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
                onClick={() => navigate('/local-receiving')}>
                View All &rarr;
              </button>
            </div>

            {/* Stat pills */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {[
                { label: 'Total', value: localStats.total, color: 'var(--accent)', bg: 'rgba(5,150,105,0.08)' },
                ...(localStats.overdue > 0 ? [{ label: 'Overdue', value: localStats.overdue, color: 'var(--danger)', bg: 'rgba(239,68,68,0.08)' }] : []),
                ...(localStats.dueThisWeek > 0 ? [{ label: 'Due This Week', value: localStats.dueThisWeek, color: '#d97706', bg: 'rgba(245,158,11,0.08)' }] : []),
                ...(localStats.inTransit > 0 ? [{ label: 'In Transit', value: localStats.inTransit, color: 'var(--info)', bg: 'rgba(59,130,246,0.08)' }] : []),
                ...(localStats.arrived > 0 ? [{ label: 'Arrived', value: localStats.arrived, color: 'var(--success)', bg: 'rgba(16,185,129,0.08)' }] : []),
                ...(localStats.stored > 0 ? [{ label: 'Stored', value: localStats.stored, color: 'var(--success)', bg: 'rgba(16,185,129,0.08)' }] : []),
                ...(localStats.delayed > 0 ? [{ label: 'Delayed', value: localStats.delayed, color: 'var(--danger)', bg: 'rgba(239,68,68,0.08)' }] : []),
              ].map(item => (
                <div key={item.label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 20, background: item.bg,
                  border: `1px solid ${item.color}20`,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-600)' }}>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Local charts — compact 2-column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              {/* Status Distribution Donut */}
              {localStatusData.length > 0 && (
                <ChartCard title="Status Breakdown" subtitle="Local shipments">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ width: 130, height: 130 }}>
                      <Doughnut
                        data={{
                          labels: localStatusData.map(d => d.name),
                          datasets: [{
                            data: localStatusData.map(d => d.value),
                            backgroundColor: localStatusData.map(d => d.color),
                            borderWidth: 2, borderColor: '#fff', hoverBorderWidth: 0, hoverOffset: 3,
                          }],
                        }}
                        options={{ responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` } } } }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {localStatusData.map(item => {
                        const pct = localStatusTotal > 0 ? Math.round((item.value / localStatusTotal) * 100) : 0;
                        return (
                          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-700)', minWidth: 65 }}>{item.name}</span>
                            <strong style={{ fontSize: 12, color: 'var(--text-900)' }}>{item.value}</strong>
                            <span style={{ fontSize: 10, color: 'var(--text-500)' }}>({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </ChartCard>
              )}

              {/* By Warehouse — horizontal bar */}
              {localWarehouseData.length > 0 && (
                <ChartCard title="By Warehouse" subtitle={`${localWarehouseData.length} destinations`}>
                  <div style={{ height: Math.max(localWarehouseData.length * 40 + 10, 80) }}>
                    <BarChart
                      data={{
                        labels: localWarehouseData.map(d => d.name),
                        datasets: [{
                          data: localWarehouseData.map(d => d.count),
                          backgroundColor: localWarehouseData.map((_, i) => WAREHOUSE_COLORS[i % WAREHOUSE_COLORS.length]),
                          borderRadius: 4, barThickness: 18,
                        }],
                      }}
                      options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw} shipments` } } }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { precision: 0, font: { size: 10 } } }, y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: 600 } } } } }}
                    />
                  </div>
                </ChartCard>
              )}

              {/* Top Suppliers */}
              {localSupplierData.length > 0 && (
                <ChartCard title="Top Suppliers" subtitle="By local shipment volume">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {localSupplierData.map((supplier, idx) => (
                      <div key={supplier.name} style={{ padding: '8px 10px', backgroundColor: 'var(--surface-2)', borderRadius: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
                            color: '#fff', backgroundColor: RANK_COLORS[idx] || '#64748b', flexShrink: 0,
                          }}>{idx + 1}</span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-900)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supplier.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-700)', backgroundColor: 'var(--surface)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border)' }}>{supplier.count}</span>
                        </div>
                        <div style={{ height: 3, backgroundColor: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${localSupplierTotal > 0 ? (supplier.count / localSupplierTotal) * 100 : 0}%`, backgroundColor: RANK_COLORS[idx] || '#64748b', borderRadius: 2, opacity: 0.6 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              )}

              {/* By Carrier */}
              {localCarrierData.length > 0 && (
                <ChartCard title="By Carrier" subtitle="Delivery partners">
                  <div style={{ height: Math.max(localCarrierData.length * 40 + 10, 80) }}>
                    <BarChart
                      data={{
                        labels: localCarrierData.map(d => d.name),
                        datasets: [{
                          data: localCarrierData.map(d => d.count),
                          backgroundColor: localCarrierData.map((_, i) => ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'][i % 5]),
                          borderRadius: 4, barThickness: 18,
                        }],
                      }}
                      options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw} shipments` } } }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { precision: 0, font: { size: 10 } } }, y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: 600 } } } } }}
                    />
                  </div>
                </ChartCard>
              )}
            </div>
          </>
        );
      })()}

      {/* Charts Grid */}
      <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem', marginTop: '1.5rem' }}>

        {/* Weekly Trend — Orders vs Shipments */}
        <ChartCard title="Weekly Trend" subtitle="Orders per week">
          {weeklyTrend && weeklyTrend.length > 1 ? (
            <div style={{ height: 220 }}>
              <LineChart
                data={{
                  labels: weeklyTrend.map(d => d.week),
                  datasets: [{
                    label: 'Orders',
                    data: weeklyTrend.map(d => d.orders),
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5,150,105,0.08)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.3,
                    fill: true,
                  }],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { font: { size: 12 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { precision: 0, font: { size: 11 } } } } }}
              />
            </div>
          ) : (
            <ChartEmpty label="No trend data yet" />
          )}
        </ChartCard>

        {/* Status Distribution — Donut */}
        <ChartCard title="Status Distribution" subtitle="By current status">
          {statusChartData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ width: 160, height: 160 }}>
                <Doughnut
                  data={{
                    labels: statusChartData.map(d => d.name),
                    datasets: [{
                      data: statusChartData.map(d => d.value),
                      backgroundColor: statusChartData.map(d => STATUS_COLORS[d.name] || '#6b7280'),
                      borderWidth: 2,
                      borderColor: '#fff',
                      hoverBorderWidth: 0,
                      hoverOffset: 4,
                    }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw}` } } } }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {statusChartData.map(item => {
                  const pct = statusTotal > 0 ? Math.round((item.value / statusTotal) * 100) : 0;
                  return (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: STATUS_COLORS[item.name] || '#6b7280', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--text-700)', minWidth: 70 }}>{item.name}</span>
                      <strong style={{ fontSize: 13, color: 'var(--text-900)' }}>{item.value}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-500)' }}>({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <ChartEmpty label="No status data" />
          )}
        </ChartCard>

        {/* Warehouse Distribution — Bar */}
        <ChartCard title="By Warehouse" subtitle={`${warehouseChartData.length} locations`} style={{ alignSelf: 'start' }}>
          {warehouseChartData.length > 0 ? (
            <div style={{ height: warehouseChartData.length * 50 + 20 }}>
              <BarChart
                data={{
                  labels: warehouseChartData.map(d => d.name),
                  datasets: [{
                    data: warehouseChartData.map(d => d.count),
                    backgroundColor: warehouseChartData.map((_, idx) => WAREHOUSE_COLORS[idx % WAREHOUSE_COLORS.length]),
                    borderRadius: 4,
                    barThickness: 20,
                  }],
                }}
                options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.raw} orders` } } }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { precision: 0, font: { size: 11 } } }, y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 12, weight: 600 } } } } }}
              />
            </div>
          ) : (
            <ChartEmpty label="No warehouse data" />
          )}
        </ChartCard>

        {/* Top Suppliers */}
        <ChartCard title="Top Suppliers" subtitle="By shipment volume">
          {topSuppliersData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topSuppliersData.map((supplier, idx) => (
                <div key={supplier.name} style={{ padding: '10px 12px', backgroundColor: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                      color: '#fff', backgroundColor: RANK_COLORS[idx] || '#64748b', flexShrink: 0,
                    }}>{idx + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-900)', flex: 1 }}>{supplier.name}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--text-700)',
                      backgroundColor: 'var(--surface)', padding: '3px 10px',
                      borderRadius: 12, border: '1px solid var(--border)',
                    }}>{supplier.count}</span>
                  </div>
                  <div style={{ height: 4, backgroundColor: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${supplierTotal > 0 ? (supplier.count / supplierTotal) * 100 : 0}%`,
                      backgroundColor: RANK_COLORS[idx] || '#64748b',
                      borderRadius: 2, opacity: 0.6,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ChartEmpty label="No supplier data" />
          )}
        </ChartCard>

        {/* Supplier On-Time Trend — Line */}
        <ChartCard title="Supplier On-Time Trend" subtitle="Last 8 weeks" style={{ gridColumn: '1 / -1' }}>
          {supplierOnTimeTrend.length > 0 ? (
            <div style={{ height: 220 }}>
              <LineChart
                data={{
                  labels: supplierOnTimeTrend.map(d => d.label),
                  datasets: [{
                    label: 'On-Time %',
                    data: supplierOnTimeTrend.map(d => d.pct),
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139,92,246,0.08)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#8b5cf6',
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.raw}% on-time` } },
                  },
                  scales: {
                    x: { grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { font: { size: 12 } } },
                    y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { precision: 0, font: { size: 11 }, callback: (v) => `${v}%` } },
                  },
                }}
              />
            </div>
          ) : (
            <ChartEmpty label="No on-time data yet" />
          )}
        </ChartCard>

        {/* Products & Pallets by Week */}
        <ChartCard title="Products & Pallets by Week" subtitle="Weekly incoming volume" style={{ gridColumn: '1 / -1' }}>
          {productsPalletsTrend && productsPalletsTrend.length > 0 ? (
            <div style={{ height: 260 }}>
              <LineChart
                data={{
                  labels: productsPalletsTrend.map(d => d.week),
                  datasets: [
                    { label: 'Products', data: productsPalletsTrend.map(d => d.products), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 20, tension: 0.3, fill: true },
                    { label: 'Pallets', data: productsPalletsTrend.map(d => d.pallets), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 20, tension: 0.3, fill: true },
                  ],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 6, font: { size: 11 } } } }, scales: { x: { grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { font: { size: 12 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { precision: 0, font: { size: 11 } } } } }}
              />
            </div>
          ) : (
            <ChartEmpty label="No trend data yet" />
          )}
        </ChartCard>

        {/* Offsite Storage Duration */}
        {offsiteChartData.length > 0 && (
          <ChartCard title="Offsite Storage Duration" subtitle={`${offsiteChartData.length} items · Days in storage`} style={{ gridColumn: '1 / -1' }}>
            <div style={{ height: offsiteChartData.length * 40 + 30 }}>
              <BarChart
                data={{
                  labels: offsiteChartData.map(d => d.label),
                  datasets: [{
                    data: offsiteChartData.map(d => d.days),
                    backgroundColor: offsiteChartData.map(d => d.days > 30 ? '#ef4444' : d.days > 14 ? '#f59e0b' : '#10b981'),
                    borderRadius: 4,
                    barThickness: 22,
                  }],
                }}
                options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.raw} days` } } }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { precision: 0, font: { size: 11 } }, title: { display: true, text: 'Days', font: { size: 11 }, color: '#94a3b8' } }, y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: 500 } } } } }}
              />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#10b981', display: 'inline-block' }} /> 0–14 days
              </span>
              <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#f59e0b', display: 'inline-block' }} /> 15–30 days
              </span>
              <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#ef4444', display: 'inline-block' }} /> 30+ days
              </span>
            </div>
          </ChartCard>
        )}
      </div>

      {/* Warehouse Utilization */}
      <div className="dash-panel" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 600, color: 'var(--text-900)' }}>Warehouse Utilization</h3>
        {warehouseData.map(w => {
          const pct = w.total_capacity > 0 ? Math.round((w.bins_used / w.total_capacity) * 100) : 0;
          const color = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--success)';
          return (
            <div key={w.warehouse_name} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-700)' }}>{w.warehouse_name}</span>
                <span style={{ color: 'var(--text-500)' }}>{w.bins_used} / {w.total_capacity} bins ({pct}%)</span>
              </div>
              <div style={{ height: '8px', borderRadius: '4px', background: 'var(--surface-2)' }}>
                <div style={{ height: '100%', borderRadius: '4px', background: color, width: `${pct}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          );
        })}
        {warehouseData.length === 0 && <p style={{ color: 'var(--text-500)', fontSize: '0.85rem', margin: 0 }}>No warehouse data available</p>}
      </div>

      {/* Upcoming Orders */}
      {upcomingOrders.length > 0 && (
        <div className="dash-panel" style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-900)' }}>Upcoming Orders</h4>
            <span style={{ fontSize: 11, color: 'var(--text-500)' }}>Next {upcomingOrders.length} due</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcomingOrders.map(shipment => (
              <div key={shipment.id} role="button" tabIndex={0} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', backgroundColor: 'var(--surface-2)',
                borderRadius: 8, borderLeft: '3px solid var(--info)',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
                onClick={() => navigate(`/shipping?status=${shipment.latestStatus}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/shipping?status=${shipment.latestStatus}`); } }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-2)'}
              >
                <div>
                  <strong
                    onClick={(e) => { e.stopPropagation(); setDetailShipment(shipment); }}
                    style={{ color: 'var(--accent)', fontSize: 13, cursor: 'pointer', borderBottom: '1px dashed var(--accent)' }}
                    title="View order details"
                  >{shipment.orderRef}</strong>
                  <span style={{ color: 'var(--text-500)', fontSize: 13 }}> — {shipment.finalPod}</span>
                  <div style={{ fontSize: 12, color: 'var(--text-500)', marginTop: 2 }}>{shipment.supplier}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-700)' }}>Week {shipment.weekNumber}</div>
                  <div className={`status-badge status-${shipment.latestStatus}`} style={{ fontSize: 11 }}>
                    {shipment.latestStatus.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import Costing Overview */}
      {costingEstimates.length > 0 && (
        <>
          <div style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--navy-900)', letterSpacing: '0.3px' }}>
              Import Costing Overview
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-500)' }}>
              {costingEstimates.filter(e => !e.archived).length} active estimates
            </p>
          </div>

          {/* Costing KPI Tiles */}
          <div className="stats-grid">
            <div className="stat-card ring-info" style={{ cursor: 'pointer' }} onClick={() => navigate('/costing?mode=sea')}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
                backgroundColor: 'rgba(59,130,246,0.1)', marginBottom: 6,
              }}>S</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                {formatCurrency(costingKpis.seaAvgLandedPerKg)}
              </h3>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                Sea Avg Landed Cost/KG
              </p>
            </div>
            <div className="stat-card ring-warning" style={{ cursor: 'pointer' }} onClick={() => navigate('/costing?mode=air')}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
                backgroundColor: 'rgba(245,158,11,0.1)', marginBottom: 6,
              }}>A</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                {formatCurrency(costingKpis.airAvgLandedPerKg)}
              </h3>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                Air Avg Landed Cost/KG
              </p>
            </div>
            <div className="stat-card ring-info" style={{ cursor: 'pointer' }} onClick={() => navigate('/costing?mode=sea')}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
                backgroundColor: 'rgba(59,130,246,0.1)', marginBottom: 6,
              }}>S</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                {costingKpis.seaCount}
              </h3>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                Sea Estimates
              </p>
            </div>
            <div className="stat-card ring-warning" style={{ cursor: 'pointer' }} onClick={() => navigate('/costing?mode=air')}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
                backgroundColor: 'rgba(245,158,11,0.1)', marginBottom: 6,
              }}>A</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                {costingKpis.airCount}
              </h3>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                Air Estimates
              </p>
            </div>
            <div className="stat-card ring-success" style={{ cursor: 'pointer' }} onClick={() => navigate('/costing')}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
                backgroundColor: 'rgba(16,185,129,0.1)', marginBottom: 6,
              }}>T</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                {formatCurrency(costingKpis.totalCostedValue)}
              </h3>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                Total Costed Value
              </p>
            </div>
            <div className="stat-card ring-success" style={{ cursor: 'pointer' }} onClick={() => navigate('/costing')}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
                backgroundColor: 'rgba(16,185,129,0.1)', marginBottom: 6,
              }}>M</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                {formatCurrency(costingKpis.avgMonthlyCostedValue)}
              </h3>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                Avg Costed Value / Month
              </p>
            </div>
            <div className="stat-card ring-success" style={{ cursor: 'pointer' }} onClick={() => navigate('/costing')}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
                backgroundColor: 'rgba(16,185,129,0.1)', marginBottom: 6,
              }}>M</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                {costingKpis.avgMonthlyEstimateCount.toFixed(1)}
              </h3>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                Avg Estimates / Month
              </p>
            </div>
          </div>

          {/* Sea vs Air Cost Split Chart */}
          {(costingKpis.seaTotalCost > 0 || costingKpis.airTotalCost > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem', marginTop: '1.25rem' }}>
              <ChartCard title="Sea vs Air Cost Split" subtitle="Total landed cost by mode">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div style={{ width: 160, height: 160 }}>
                    <Doughnut
                      data={{
                        labels: ['Sea Freight', 'Air Freight'],
                        datasets: [{
                          data: [costingKpis.seaTotalCost, costingKpis.airTotalCost],
                          backgroundColor: ['#3b82f6', '#f59e0b'],
                          borderWidth: 2,
                          borderColor: '#fff',
                          hoverBorderWidth: 0,
                          hoverOffset: 4,
                        }],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false, cutout: '72%',
                        plugins: {
                          legend: { display: false },
                          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` } },
                        },
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Sea Freight', value: costingKpis.seaTotalCost, color: '#3b82f6', count: costingKpis.seaCount },
                      { label: 'Air Freight', value: costingKpis.airTotalCost, color: '#f59e0b', count: costingKpis.airCount },
                    ].map(item => {
                      const total = costingKpis.seaTotalCost + costingKpis.airTotalCost;
                      const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                      return (
                        <div key={item.label}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: 'var(--text-700)' }}>{item.label}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-500)' }}>({pct}%)</span>
                          </div>
                          <div style={{ marginLeft: 18, fontSize: 12, color: 'var(--text-500)', marginTop: 2 }}>
                            {formatCurrency(item.value)} ({item.count} estimate{item.count !== 1 ? 's' : ''})
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ChartCard>

              <ChartCard title="Cost Comparison" subtitle="Sea vs Air total landed cost">
                <div style={{ height: 160 }}>
                  <BarChart
                    data={{
                      labels: ['Sea Freight', 'Air Freight'],
                      datasets: [{
                        data: [costingKpis.seaTotalCost, costingKpis.airTotalCost],
                        backgroundColor: ['#3b82f6', '#f59e0b'],
                        borderRadius: 6,
                        barThickness: 40,
                      }],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
                      },
                      scales: {
                        x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 12, weight: 600 } } },
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { font: { size: 11 }, callback: (v) => `R${(v / 1000).toFixed(0)}k` } },
                      },
                    }}
                  />
                </div>
              </ChartCard>
            </div>
          )}

          {/* Monthly Costing Trend */}
          {costingKpis.monthlyStats.length > 1 && (
            <div style={{ marginTop: '1.25rem' }}>
              <ChartCard title="Monthly Costing Trend" subtitle="Total costed value by month">
                <div style={{ height: 200 }}>
                  <BarChart
                    data={{
                      labels: costingKpis.monthlyStats.map(m => m.label),
                      datasets: [{
                        data: costingKpis.monthlyStats.map(m => m.total),
                        backgroundColor: '#3b82f6',
                        borderRadius: 6,
                        barThickness: 28,
                      }],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const m = costingKpis.monthlyStats[ctx.dataIndex];
                              return [`${formatCurrency(ctx.raw)}`, `${m.count} estimate${m.count !== 1 ? 's' : ''}`];
                            },
                          },
                        },
                      },
                      scales: {
                        x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 } } },
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false }, ticks: { font: { size: 11 }, callback: (v) => `R${(v / 1000).toFixed(0)}k` } },
                      },
                    }}
                  />
                </div>
              </ChartCard>
            </div>
          )}
        </>
      )}

      {/* Quick Actions */}
      <div style={{
        display: 'flex', gap: 12, marginTop: '1.5rem', flexWrap: 'wrap',
        paddingTop: '1.5rem', borderTop: '1px solid var(--border)',
      }}>
        <button className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 13 }}
          onClick={() => navigate('/shipping')}>
          Shipping Schedule
        </button>
        <button className="btn btn-ghost" style={{ padding: '10px 20px', fontSize: 13 }}
          onClick={() => navigate('/local-receiving')}>
          Local Receiving
        </button>
        <button className="btn btn-ghost" style={{ padding: '10px 20px', fontSize: 13 }}
          onClick={() => navigate('/reports')}>
          Reports
        </button>
        <button className="btn btn-ghost" style={{ padding: '10px 20px', fontSize: 13 }}
          onClick={() => navigate('/capacity')}>
          Warehouse Capacity
        </button>
        {onOpenLiveBoard && (
          <button className="btn" style={{
            padding: '10px 20px', fontSize: 13,
            background: 'var(--navy-900)', color: 'white', border: 'none',
          }}
            onClick={onOpenLiveBoard}>
            Live Board
          </button>
        )}
      </div>
      {/* Announcement Detail Popup */}
      {viewingAnnouncement && (
        <div
          onClick={() => setViewingAnnouncement(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, overflow: 'hidden',
              width: '90%', maxWidth: 520, maxHeight: '80vh',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Gold header bar */}
            <div style={{
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              padding: '20px 24px', color: '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 3, background: 'rgba(255,255,255,0.2)', color: '#fff',
                    }}>Advisory</span>
                    <span style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', opacity: 0.8 }}>
                      Synercore Holdings
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3 }}>
                    {viewingAnnouncement.title}
                  </h3>
                </div>
                <button
                  onClick={() => setViewingAnnouncement(null)}
                  style={{
                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
                    width: 28, height: 28, cursor: 'pointer', color: '#fff', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >&#x2715;</button>
              </div>
              {viewingAnnouncement.pubDate && (
                <div style={{ fontSize: '0.7rem', opacity: 0.75, marginTop: 8 }}>
                  Published {new Date(viewingAnnouncement.pubDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
            {/* Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {(viewingAnnouncement.description || '').split('\n\n').map((block, bi) => {
                const trimmed = block.trim();
                if (!trimmed) return null;
                const lines = trimmed.split('\n');
                const isHeading = lines.length === 1 && trimmed.length < 60 && !trimmed.endsWith('.') && !trimmed.endsWith(',');
                if (isHeading) {
                  return (
                    <h4 key={bi} style={{
                      margin: bi === 0 ? '0 0 12px' : '20px 0 10px',
                      fontSize: 14, fontWeight: 700, color: '#1e293b',
                      borderBottom: '2px solid #f59e0b', paddingBottom: 6, display: 'inline-block',
                    }}>{trimmed}</h4>
                  );
                }
                return (
                  <p key={bi} style={{
                    margin: bi === 0 ? '0 0 14px' : '0 0 14px',
                    fontSize: 14, lineHeight: 1.7, color: '#374151',
                  }}>
                    {lines.map((line, li) => (
                      <React.Fragment key={li}>
                        {li > 0 && <br />}
                        {line}
                      </React.Fragment>
                    ))}
                  </p>
                );
              })}
            </div>
            {/* Footer */}
            {viewingAnnouncement.link && (
              <div style={{
                padding: '14px 24px', borderTop: '1px solid #f1f5f9',
                background: '#fafafa',
              }}>
                <a
                  href={viewingAnnouncement.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 600, color: '#b45309',
                    textDecoration: 'none', padding: '8px 16px',
                    background: '#fef3c7', borderRadius: 6, border: '1px solid #fde68a',
                  }}
                >
                  Read full article &#8594;
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Announcement Management Modal */}
      {showAnnouncementModal && (
        <div
          onClick={() => setShowAnnouncementModal(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: '1.5rem',
              width: '90%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)', border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                Manage Announcements
              </h3>
              <button
                onClick={() => setShowAnnouncementModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-500)', lineHeight: 1 }}
              >x</button>
            </div>

            {/* Add / Edit form */}
            <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input
                placeholder="Announcement title *"
                value={annForm.title}
                onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))}
                style={{
                  flex: 2, minWidth: 180, padding: '8px 10px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)',
                  color: 'var(--text-900)',
                }}
              />
              <textarea
                placeholder="Description / details (optional — shows on hover)"
                value={annForm.description}
                onChange={e => setAnnForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)',
                  color: 'var(--text-900)', resize: 'vertical',
                }}
              />
              <input
                placeholder="Link (optional)"
                value={annForm.link}
                onChange={e => setAnnForm(f => ({ ...f, link: e.target.value }))}
                style={{
                  flex: 1, minWidth: 140, padding: '8px 10px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)',
                  color: 'var(--text-900)',
                }}
              />
              <input
                type="date"
                title="Expiry date (optional)"
                value={annForm.expires_at}
                onChange={e => setAnnForm(f => ({ ...f, expires_at: e.target.value }))}
                style={{
                  width: 140, padding: '8px 10px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)',
                  color: 'var(--text-900)',
                }}
              />
              <button
                onClick={saveAnnouncement}
                disabled={!annForm.title.trim()}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none',
                  background: annForm.title.trim() ? '#d97706' : '#ccc', color: '#fff', cursor: annForm.title.trim() ? 'pointer' : 'default',
                }}
              >
                {editingAnnId ? 'Update' : 'Add'}
              </button>
              {editingAnnId && (
                <button
                  onClick={() => { setEditingAnnId(null); setAnnForm({ title: '', description: '', link: '', expires_at: '' }); }}
                  style={{ padding: '8px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-700)' }}
                >Cancel</button>
              )}
            </div>

            {/* Existing announcements */}
            {announcements.length === 0 ? (
              <p style={{ color: 'var(--text-500)', fontSize: 13, textAlign: 'center', padding: '1rem 0' }}>No announcements yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {announcements.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    background: 'var(--surface-2)', borderRadius: 6,
                    opacity: a.active ? 1 : 0.5,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-500)', display: 'flex', gap: 8 }}>
                        {a.link && <span>Has link</span>}
                        {a.expires_at && <span>Expires {new Date(a.expires_at).toLocaleDateString()}</span>}
                        {!a.active && <span style={{ color: 'var(--danger)' }}>Inactive</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleAnnouncement(a.id, a.active)}
                      title={a.active ? 'Deactivate' : 'Activate'}
                      style={{
                        padding: '4px 8px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)',
                        background: a.active ? 'var(--surface)' : '#059669', color: a.active ? 'var(--text-700)' : '#fff',
                        cursor: 'pointer', fontWeight: 600,
                      }}
                    >{a.active ? 'Off' : 'On'}</button>
                    <button
                      onClick={() => {
                        setEditingAnnId(a.id);
                        setAnnForm({ title: a.title, description: a.description || '', link: a.link || '', expires_at: a.expires_at ? a.expires_at.split('T')[0] : '' });
                      }}
                      style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-700)' }}
                    >Edit</button>
                    <button
                      onClick={() => deleteAnnouncement(a.id)}
                      style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--danger)' }}
                    >Del</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Detail Card */}
      {detailShipment && (
        <div
          onClick={() => setDetailShipment(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: '1.5rem',
              width: '90%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)', border: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                {detailShipment.orderRef}
              </h3>
              <button
                onClick={() => setDetailShipment(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-500)', lineHeight: 1 }}
              >
                x
              </button>
            </div>
            {(() => {
              const s = detailShipment;
              const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
              const rows = [
                ['Supplier', s.supplier],
                ['Product', s.productName],
                ['Quantity', s.quantity != null ? Number(s.quantity).toLocaleString() : '-'],
                ['Pallets', s.palletQty ? (Math.round(s.palletQty) || 1) : '-'],
                ['CBM', s.cbm || '-'],
                ['Week', s.weekNumber ? `Week ${s.weekNumber}` : '-'],
                ['Status', (s.latestStatus || '').replace(/_/g, ' ') || '-'],
                ['Final POD', s.finalPod || '-'],
                ['Warehouse', s.receivingWarehouse || '-'],
                ['Freight Type', s.freightType || '-'],
                ['Incoterm', s.incoterm || '-'],
                ['Forwarding Agent', s.forwardingAgent || '-'],
                ['Vessel', s.vesselName || '-'],
                ['Created', fmt(s.createdAt)],
              ];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 0 }}>
                  {rows.map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{
                        padding: '6px 8px', fontSize: 12, fontWeight: 600,
                        color: 'var(--text-500)', borderBottom: '1px solid var(--border)'
                      }}>
                        {label}
                      </div>
                      <div style={{
                        padding: '6px 8px', fontSize: 13,
                        color: 'var(--text-700)', borderBottom: '1px solid var(--border)',
                        wordBreak: 'break-word'
                      }}>
                        {value || '-'}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
