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

// A dual-container sea request (container_type/quoted_rate plus
// container_type_2/quoted_rate_2 for the same shipment) contributes one
// comparable entry per rate it actually has -- otherwise a 20FCL and a
// 40FCL quote would get compared as if they were fungible. The second
// entry overrides container_type/quoted_rate onto the SAME field names
// (rather than introducing new ones) so every existing consumer of an
// "entry" here keeps reading entry.quoted_rate/entry.container_type
// unchanged; the two virtual copies always land in different route
// groups (container_type is now part of the grouping key below), so
// there's no key collision within any single group's entries.
const explodeByContainerType = (requests) => {
  const exploded = [];
  (requests || []).forEach(req => {
    if (req.quoted_rate) exploded.push(req);
    if (req.container_type_2 && req.quoted_rate_2) {
      exploded.push({ ...req, container_type: req.container_type_2, quoted_rate: req.quoted_rate_2 });
    }
  });
  return exploded;
};

// Groups completed ("quoted") requests by route (origin + destination + mode
// + container type) — comparing sea to air rates, different origins, or a
// 20FCL rate to a 40FCL rate would all be misleading, so each group is a
// like-for-like set of forwarder quotes, cheapest first.
//
// When fxRates covers every currency in a mixed-currency group, entries sort by
// their USD equivalent so "cheapest" is actually correct across currencies;
// otherwise it falls back to the old raw-number sort (only meaningful within a
// single currency, but harmless — same-currency order is identical either way).
export const groupRatesByRoute = (completedRequests, fxRates = {}) => {
  const groups = new Map();
  explodeByContainerType(completedRequests).forEach(req => {
    const key = `${normRoute(req.origin)}|${normRoute(req.destination)}|${req.transport_mode}|${req.container_type || ''}`;
    if (!groups.has(key)) {
      groups.set(key, { origin: req.origin || '—', destination: req.destination || '—', transport_mode: req.transport_mode, container_type: req.container_type || null, entries: [] });
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
