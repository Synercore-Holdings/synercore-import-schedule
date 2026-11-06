// Time-in-status calculations from a shipment's status history
// (GET /api/shipments/:id/status-history, or the per-shipment `history`
// array from /api/shipments/port-delays). Entries: { id, to_status, changed_at }.

export const PORT_STATUSES = ['moored', 'delayed_port', 'berth_working', 'berth_complete'];

const toMs = (d) => (d ? new Date(d).getTime() : NaN);

// One segment per history entry: [start, end) in that status. The last
// segment runs until now only if it matches the shipment's current status —
// otherwise the trail is incomplete (e.g. backfilled from the audit log) and
// its end is unknown (null).
export function buildStatusSegments(history, currentStatus, now = Date.now()) {
  const sorted = (history || [])
    .filter(h => h && h.to_status && !Number.isNaN(toMs(h.changed_at)))
    .sort((a, b) => toMs(a.changed_at) - toMs(b.changed_at) || (a.id || 0) - (b.id || 0));

  return sorted.map((h, i) => {
    const next = sorted[i + 1];
    const start = toMs(h.changed_at);
    const isLast = !next;
    const ongoing = isLast && h.to_status === currentStatus;
    return {
      status: h.to_status,
      start,
      end: next ? toMs(next.changed_at) : (ongoing ? now : null),
      ongoing,
      entry: h,
    };
  });
}

/**
 * Port call timings:
 *  - portDelay:    first Delayed - Port  → Berth Working (or Berth Complete if
 *                  berth working was never recorded, or leaving the delay)
 *  - berthWorking: Berth Working → Berth Complete
 *  - total:        start of delay (or berth working) → Berth Complete
 * Each is { ms, start, end, ongoing } or null when it doesn't apply / is unknown.
 */
export function computePortTimes(history, currentStatus, now = Date.now()) {
  const segs = buildStatusSegments(history, currentStatus, now);
  const first = (status, from = -Infinity) => segs.find(s => s.status === status && s.start >= from);

  const delay = first('delayed_port');
  const berth = first('berth_working', delay ? delay.start : -Infinity);
  const complete = first('berth_complete', berth ? berth.start : (delay ? delay.start : -Infinity));

  const span = (startSeg, endSeg, fallbackSeg) => {
    if (!startSeg) return null;
    const end = endSeg ? endSeg.start : fallbackSeg.end;
    if (end == null) return null;
    return { ms: Math.max(0, end - startSeg.start), start: startSeg.start, end, ongoing: !endSeg && fallbackSeg.ongoing };
  };

  const portDelay = span(delay, berth || complete, delay);
  const berthWorking = span(berth, complete, berth);
  const startSeg = delay || berth;
  const total = startSeg && complete
    ? { ms: Math.max(0, complete.start - startSeg.start), start: startSeg.start, end: complete.start, ongoing: false }
    : null;

  return {
    portDelay,
    berthWorking,
    total,
    hasPortStatus: segs.some(s => PORT_STATUSES.includes(s.status)),
    // Any port-relevant time that came from the audit log or a tracking-start
    // estimate rather than being recorded live (or corrected by a user)
    isEstimated: [delay, berth, complete].some(s => s && s.entry.source && s.entry.source !== 'live' && !s.entry.edited_at),
  };
}

// "4d 6h", "5h 20m", "12m", "<1m"
export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m';
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  return `${rem}m`;
}
