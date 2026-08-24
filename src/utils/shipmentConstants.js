import { ShipmentStatus } from '../types/shipment';

// Forwarding agent options for airfreight (major passenger airlines with cargo divisions)
export const AIRFREIGHT_AGENTS = [
  { value: 'Emirates SkyCargo', label: 'Emirates SkyCargo' },
  { value: 'Qatar Airways Cargo', label: 'Qatar Airways Cargo' },
  { value: 'Lufthansa Cargo', label: 'Lufthansa Cargo' },
  { value: 'Singapore Airlines Cargo', label: 'Singapore Airlines Cargo' },
  { value: 'Korean Air Cargo', label: 'Korean Air Cargo' },
  { value: 'Turkish Airlines Cargo', label: 'Turkish Airlines Cargo' },
  { value: 'Cathay Pacific Cargo', label: 'Cathay Pacific Cargo' },
  { value: 'British Airways World Cargo', label: 'British Airways World Cargo' },
  { value: 'Air France-KLM Cargo', label: 'Air France-KLM Cargo' },
  { value: 'Ethiopian Airlines Cargo', label: 'Ethiopian Airlines Cargo' },
  { value: 'SAA Cargo', label: 'SAA Cargo' },
  { value: 'Kenya Airways Cargo', label: 'Kenya Airways Cargo' },
];

// Forwarding agent options for sea freight and other modes
export const SEAFREIGHT_AGENTS = [
  { value: 'DHL', label: 'DHL' },
  { value: 'DSV', label: 'DSV' },
  { value: 'Afrigistics', label: 'Afrigistics' },
  { value: 'MSC', label: 'MSC' },
  { value: 'COSCO', label: 'COSCO' },
  { value: 'ONE', label: 'ONE' },
  { value: 'Hapag-Lloyd', label: 'Hapag-Lloyd' },
  { value: 'Maersk', label: 'Maersk' },
  { value: 'CMA CGM', label: 'CMA CGM' },
  { value: 'Evergreen', label: 'Evergreen' },
  { value: 'Yang Ming', label: 'Yang Ming' },
  { value: 'HMM', label: 'HMM' },
  { value: 'OOCL', label: 'OOCL' },
];

export const AIRFREIGHT_STATUSES = [
  ShipmentStatus.PLANNED_AIRFREIGHT,
  ShipmentStatus.IN_TRANSIT_AIRFREIGHT,
  ShipmentStatus.AIR_CUSTOMS_CLEARANCE,
];

// An AWB (air waybill) number is digits only (e.g. "724-79938666"); a vessel
// name never is — use that as a last-resort signal when neither the status
// nor the forwarding agent tell us the freight mode.
export const looksLikeAwbNumber = (value) => {
  if (!value) return false;
  const digitsOnly = value.trim().replace(/[\s-]/g, '');
  return /^\d+$/.test(digitsOnly) && digitsOnly.length >= 10 && digitsOnly.length <= 12;
};

// Status alone is ambiguous once a shipment reaches a status shared by both
// modes (e.g. in_transit_last_mile, arrived_*) — fall back to the already
// selected forwarding agent (chosen from a mode-specific list), then to the
// shape of the vessel/AWB value itself.
export const isAirfreight = (status, forwardingAgent, vesselOrAwb) => {
  if (forwardingAgent) {
    if (AIRFREIGHT_AGENTS.some(a => a.value === forwardingAgent)) return true;
    if (SEAFREIGHT_AGENTS.some(a => a.value === forwardingAgent)) return false;
  }
  if (AIRFREIGHT_STATUSES.includes(status)) return true;
  return looksLikeAwbNumber(vesselOrAwb);
};

export const getShippingProgress = (status) => {
  const stages = {
    planned_airfreight: 1, planned_seafreight: 1,
    in_transit_airfreight: 2, in_transit_roadway: 2, in_transit_seaway: 2, in_transit_last_mile: 2, air_customs_clearance: 2,
    moored: 3, berth_working: 3, berth_complete: 3, gated_in_port: 3,
    arrived_pta: 4, arrived_klm: 4, arrived_offsite: 4,
    received: 5, stored: 5, archived: 5,
  };
  return { current: stages[status] || 0, total: 5 };
};

// Helper to check if status is airfreight-related
export const isAirfreightStatus = (status) => {
  return status === 'planned_airfreight' || status === 'in_transit_airfreight' || status === 'air_customs_clearance';
};

// Get forwarding agents based on shipment status
export const getForwardingAgents = (status, forwardingAgent, vesselOrAwb) => {
  return isAirfreight(status, forwardingAgent, vesselOrAwb) ? AIRFREIGHT_AGENTS : SEAFREIGHT_AGENTS;
};

// Each carrier's own tracking tool, keyed by the exact forwarding-agent value
// used above. These open the carrier's tracking page directly (the user still
// pastes the AWB/BOL in there) rather than guessing at a query-string format
// per carrier, since those change without notice and a wrong deep link fails
// silently. Not every agent has a public self-service tracking tool.
export const AGENT_TRACKING_URLS = {
  // Airfreight
  'Emirates SkyCargo': 'https://www.skycargo.com/track-shipment',
  'Qatar Airways Cargo': 'https://www.qrcargo.com/tools/track-shipment',
  'Lufthansa Cargo': 'https://www.lufthansa-cargo.com/tracking',
  'Singapore Airlines Cargo': 'https://www.siacargo.com/eservices/track-shipment',
  'Korean Air Cargo': 'https://cargo.koreanair.com/eng/tracking/CargoTracking.do',
  'Turkish Airlines Cargo': 'https://www.turkishcargo.com.tr/en/online-services/track-your-cargo',
  'Cathay Pacific Cargo': 'https://www.cathaypacificcargo.com/en/track-shipment.html',
  'British Airways World Cargo': 'https://www.iagcargo.com/en/tracking',
  'Air France-KLM Cargo': 'https://www.afklcargo.com/track',
  'Ethiopian Airlines Cargo': 'https://cargo.ethiopianairlines.com/tracking',
  // Seafreight / forwarders
  'DHL': 'https://www.dhl.com/za-en/home/tracking.html',
  'DSV': 'https://www.dsv.com/en/our-solutions/track-and-trace',
  'MSC': 'https://www.msc.com/en/track-a-shipment',
  'COSCO': 'https://elines.coscoshipping.com/ebusiness/cargoTracking',
  'ONE': 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking',
  'Hapag-Lloyd': 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html',
  'Maersk': 'https://www.maersk.com/tracking',
  'CMA CGM': 'https://www.cma-cgm.com/ebusiness/tracking',
  'Yang Ming': 'https://www.yangming.com/e-service/Cargo_Tracking/CargoTracking.aspx',
  'HMM': 'https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.jsp',
  'OOCL': 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx',
};

// Returns the selected forwarding agent's own tracking page, or null if none
// is known (e.g. SAA Cargo, Kenya Airways Cargo, Afrigistics, Evergreen).
export const getAgentTrackingUrl = (forwardingAgent) => AGENT_TRACKING_URLS[forwardingAgent] || null;

// track-trace.com's aircargo tool reliably prefills from a query string
// regardless of airline, so AWB tracking always uses it directly rather than
// sending the user to the airline's own (usually non-prefillable) page.
export const getAwbTrackingUrl = (awbNumber) => {
  if (!awbNumber) return null;
  return `https://www.track-trace.com/aircargo?awb=${encodeURIComponent(awbNumber.replace(/\D/g, ''))}`;
};

// Best-effort prefilled deep links for the handful of ocean carriers whose
// tracking-by-number query format is well documented and has been stable —
// NOT guaranteed to still be accurate, since carriers change these without
// notice. Report a broken one and it's a one-line fix. Every other agent
// falls back to their bare tracking page from AGENT_TRACKING_URLS.
const BOL_TRACKING_URL_BUILDERS = {
  'Maersk': (bol) => `https://www.maersk.com/tracking/${encodeURIComponent(bol)}`,
  // MSC: no deep-linking is possible at all — confirmed by user testing on
  // 2026-08-24 that MSC's search is client-side state, not URL-driven (the
  // address bar stayed on the plain tracking page after a manual search).
  // Falls back to the bare page; don't re-attempt a query-param guess here.
  // DHL: confirmed working by user testing on 2026-08-24 — exact URL captured
  // from a manual search: https://www.dhl.com/za-en/home/tracking.html?tracking-id=PKGA86211&submit=1
  'DHL': (bol) => `https://www.dhl.com/za-en/home/tracking.html?tracking-id=${encodeURIComponent(bol)}&submit=1`,
  'CMA CGM': (bol) => `https://www.cma-cgm.com/ebusiness/tracking/search?Reference=${encodeURIComponent(bol)}`,
  'Hapag-Lloyd': (bol) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${encodeURIComponent(bol)}`,
};

export const getBolTrackingUrl = (forwardingAgent, bolNumber) => {
  if (forwardingAgent && bolNumber && BOL_TRACKING_URL_BUILDERS[forwardingAgent]) {
    return BOL_TRACKING_URL_BUILDERS[forwardingAgent](bolNumber);
  }
  return getAgentTrackingUrl(forwardingAgent);
};

// Container-number deep links — deliberately a SEPARATE, smaller list from
// BOL_TRACKING_URL_BUILDERS above. A carrier's BOL query format isn't
// guaranteed to also accept a container number (different tools, different
// pages, on many carrier sites) — only listing agents whose tracking search
// is a generic "any reference" box confirmed to work for both.
const CONTAINER_TRACKING_URL_BUILDERS = {
  'Maersk': (container) => `https://www.maersk.com/tracking/${encodeURIComponent(container)}`,
  'CMA CGM': (container) => `https://www.cma-cgm.com/ebusiness/tracking/search?Reference=${encodeURIComponent(container)}`,
};

export const getContainerTrackingUrl = (forwardingAgent, containerNumber) => {
  if (forwardingAgent && containerNumber && CONTAINER_TRACKING_URL_BUILDERS[forwardingAgent]) {
    return CONTAINER_TRACKING_URL_BUILDERS[forwardingAgent](containerNumber);
  }
  return getAgentTrackingUrl(forwardingAgent);
};
