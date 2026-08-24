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

// Freight forwarders in SEAFREIGHT_AGENTS above who book space on someone
// else's vessel rather than operating one themselves — their own tracking
// tool (if any) won't have container-level ocean tracking data, since they
// didn't physically carry the container. Used to derive SHIPPING_LINES.
// A Shipping Line only makes sense for these — if the Forwarding Agent is
// already an actual carrier (MSC, Maersk, ONE, ...), booked directly, that
// value IS the carrier; there's nothing separate to record.
export const SEA_FORWARDER_ONLY_VALUES = ['DHL', 'DSV', 'Afrigistics'];

export const isPureSeaForwarder = (forwardingAgent) => SEA_FORWARDER_ONLY_VALUES.includes(forwardingAgent);

// The actual ocean carriers (who operate the vessel) — a separate, optional
// field from Forwarding Agent, since a shipment is often booked through a
// forwarder (DHL, DSV, Afrigistics) but physically carried by one of these.
// Both are worth recording independently: which carrier a given forwarder
// actually uses (by origin, over time) is itself useful data, and having
// both lets you cross-check that the two tracking sources agree.
export const SHIPPING_LINES = SEAFREIGHT_AGENTS.filter(
  a => !SEA_FORWARDER_ONLY_VALUES.includes(a.value)
);

export const AIRFREIGHT_STATUSES = [
  ShipmentStatus.PLANNED_AIRFREIGHT,
  ShipmentStatus.IN_TRANSIT_AIRFREIGHT,
  ShipmentStatus.AIR_CUSTOMS_CLEARANCE,
];

// Unambiguously sea — before a shipment reaches a status shared by both
// modes (in_transit_last_mile, arrived_*, delayed_*, cancelled). Airfreight
// never moors, works berth, or gates through a port.
export const SEAFREIGHT_STATUSES = [
  ShipmentStatus.PLANNED_SEAFREIGHT,
  ShipmentStatus.IN_TRANSIT_ROADWAY,
  ShipmentStatus.IN_TRANSIT_SEAWAY,
  ShipmentStatus.MOORED,
  ShipmentStatus.BERTH_WORKING,
  ShipmentStatus.BERTH_COMPLETE,
  ShipmentStatus.GATED_IN_PORT,
];

// An AWB (air waybill) number is digits only (e.g. "724-79938666"); a vessel
// name never is — use that as a last-resort signal when neither the status
// nor the forwarding agent tell us the freight mode.
export const looksLikeAwbNumber = (value) => {
  if (!value) return false;
  const digitsOnly = value.trim().replace(/[\s-]/g, '');
  return /^\d+$/.test(digitsOnly) && digitsOnly.length >= 10 && digitsOnly.length <= 12;
};

// An unambiguous status is authoritative and must win over the forwarding
// agent — a shipment explicitly marked planned_airfreight is airfreight
// even if its agent field happens to hold a stale/wrong seafreight-listed
// value (agent data errors do happen — see the DHL Express cleanup). Only
// once status itself is ambiguous (shared by both modes: in_transit_last_mile,
// arrived_*, delayed_*, cancelled, or missing) do we fall back to the agent,
// then to the shape of the vessel/AWB value itself.
export const isAirfreight = (status, forwardingAgent, vesselOrAwb) => {
  if (AIRFREIGHT_STATUSES.includes(status)) return true;
  if (SEAFREIGHT_STATUSES.includes(status)) return false;
  if (forwardingAgent) {
    if (AIRFREIGHT_AGENTS.some(a => a.value === forwardingAgent)) return true;
    if (SEAFREIGHT_AGENTS.some(a => a.value === forwardingAgent)) return false;
  }
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
  // Confirmed 2026-08-24 by user testing (BOL "PKGA87084" tracks correctly
  // here) — this business's DHL bookings use dhl.com's tracking tool
  // directly, not the MyDHLi Global Forwarding portal.
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
  // DHL: confirmed working by user testing on 2026-08-24 (BOL "PKGA86211",
  // then reconfirmed with "PKGA87084") — this business's DHL bookings track
  // on dhl.com directly with this param, regardless of Express/Global
  // Forwarding branding underneath.
  'DHL': (bol) => `https://www.dhl.com/za-en/home/tracking.html?tracking-id=${encodeURIComponent(bol)}&submit=1`,
  'CMA CGM': (bol) => `https://www.cma-cgm.com/ebusiness/tracking/search?Reference=${encodeURIComponent(bol)}`,
  // Hapag-Lloyd: confirmed working by user testing on 2026-08-24 — BOL and
  // container use DIFFERENT pages, see CONTAINER_TRACKING_URL_BUILDERS below.
  'Hapag-Lloyd': (bol) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${encodeURIComponent(bol)}`,
  // ONE: confirmed working by user testing on 2026-08-24 — exact URL captured
  // from a manual container search: https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=ONEU6950434
  // Param name ("trakNoParam" — generic "tracking number", not container-
  // specific) suggests it's a general reference box, so also used for BOL.
  'ONE': (bol) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${encodeURIComponent(bol)}`,
};

// A BOL number is typically the FORWARDER's own reference (a "house" B/L —
// e.g. DHL's own tracking ID format), distinct from the ocean carrier's
// master B/L — so forwardingAgent wins here, unlike container tracking
// below. Confirmed 2026-08-24: BOL "PKGA87084" only tracks correctly via
// DHL (the forwarding agent), not MSC (the shipping line on that booking).
export const getBolTrackingUrl = (forwardingAgent, bolNumber, shippingLine) => {
  const carrier = forwardingAgent || shippingLine;
  if (carrier && bolNumber && BOL_TRACKING_URL_BUILDERS[carrier]) {
    return BOL_TRACKING_URL_BUILDERS[carrier](bolNumber);
  }
  return getAgentTrackingUrl(carrier);
};

// Container-number deep links — deliberately a SEPARATE, smaller list from
// BOL_TRACKING_URL_BUILDERS above. A carrier's BOL query format isn't
// guaranteed to also accept a container number — some carriers share one
// generic "any reference" box for both (Maersk, CMA CGM, ONE); others use a
// completely different page/param for containers vs. BOL (Hapag-Lloyd).
const CONTAINER_TRACKING_URL_BUILDERS = {
  'Maersk': (container) => `https://www.maersk.com/tracking/${encodeURIComponent(container)}`,
  'CMA CGM': (container) => `https://www.cma-cgm.com/ebusiness/tracking/search?Reference=${encodeURIComponent(container)}`,
  // ONE: confirmed working by user testing on 2026-08-24 — see
  // BOL_TRACKING_URL_BUILDERS above for the exact captured URL.
  'ONE': (container) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${encodeURIComponent(container)}`,
  // Hapag-Lloyd: confirmed working by user testing on 2026-08-24 — a
  // DIFFERENT page from BOL tracking, exact URL captured from a manual
  // container search: https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=GVTU++2637330
  'Hapag-Lloyd': (container) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${encodeURIComponent(container)}`,
};

export const getContainerTrackingUrl = (forwardingAgent, containerNumber, shippingLine) => {
  const carrier = shippingLine || forwardingAgent;
  if (carrier && containerNumber && CONTAINER_TRACKING_URL_BUILDERS[carrier]) {
    return CONTAINER_TRACKING_URL_BUILDERS[carrier](containerNumber);
  }
  return getAgentTrackingUrl(carrier);
};
