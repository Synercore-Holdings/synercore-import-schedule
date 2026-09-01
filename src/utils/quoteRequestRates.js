/**
 * Shared helpers for aggregating freight Quote Request rates by route.
 * Used by the Quote Requests screen's list view and its Rates Dashboard.
 */

const normRoute = (s) => (s || '').toString().trim().toLowerCase();

// Converts an amount into USD using a manually-maintained rate table
// ({ CURRENCY: unitsPerUsd }). Returns null when there's no rate on file for
// a non-USD currency, so callers can fall back gracefully instead of
// comparing incompatible numbers.
export const convertToUSD = (amount, currency, fxRates = {}) => {
  if (amount === null || amount === undefined || amount === '') return null;
  const cur = currency || 'USD';
  if (cur === 'USD') return Number(amount);
  const rate = fxRates[cur];
  if (!rate) return null;
  return Number(amount) / Number(rate);
};

// Groups completed ("quoted") requests by route (origin + destination + mode) —
// comparing sea to air rates, or different origins, would be misleading, so each
// group is a like-for-like set of forwarder quotes, cheapest first.
//
// When fxRates covers every currency in a mixed-currency group, entries sort by
// their USD equivalent so "cheapest" is actually correct across currencies;
// otherwise it falls back to the old raw-number sort (only meaningful within a
// single currency, but harmless — same-currency order is identical either way).
export const groupRatesByRoute = (completedRequests, fxRates = {}) => {
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
    .map(g => {
      const mixedCurrency = new Set(g.entries.map(e => e.quoted_currency)).size > 1;
      const withUsd = g.entries.map(e => ({ ...e, _usdEquivalent: convertToUSD(e.quoted_rate, e.quoted_currency, fxRates) }));
      const allConvertible = withUsd.every(e => e._usdEquivalent !== null);
      const entries = allConvertible
        ? withUsd.sort((a, b) => a._usdEquivalent - b._usdEquivalent)
        : withUsd.sort((a, b) => Number(a.quoted_rate) - Number(b.quoted_rate));
      return {
        ...g,
        entries,
        mixedCurrency,
        convertedForComparison: allConvertible && mixedCurrency,
      };
    })
    .sort((a, b) => b.entries.length - a.entries.length);
};
