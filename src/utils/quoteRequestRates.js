/**
 * Shared helpers for aggregating freight Quote Request rates by route.
 * Used by the Quote Requests screen itself, plus the Dashboard and Reports
 * widgets that surface rate activity without opening that screen.
 */

const normRoute = (s) => (s || '').toString().trim().toLowerCase();

// Groups completed ("quoted") requests by route (origin + destination + mode) —
// comparing sea to air rates, or different origins, would be misleading, so each
// group is a like-for-like set of forwarder quotes, cheapest first.
export const groupRatesByRoute = (completedRequests) => {
  const groups = new Map();
  (completedRequests || []).forEach(req => {
    if (!req.quoted_rate) return;
    const key = `${normRoute(req.origin)}|${normRoute(req.destination)}|${req.transport_mode}`;
    if (!groups.has(key)) {
      groups.set(key, { origin: req.origin || '—', destination: req.destination || '—', transport_mode: req.transport_mode, entries: [] });
    }
    groups.get(key).entries.push(req);
  });
  return Array.from(groups.values())
    .map(g => ({
      ...g,
      entries: g.entries.sort((a, b) => Number(a.quoted_rate) - Number(b.quoted_rate)),
      mixedCurrency: new Set(g.entries.map(e => e.quoted_currency)).size > 1,
    }))
    .sort((a, b) => b.entries.length - a.entries.length);
};
