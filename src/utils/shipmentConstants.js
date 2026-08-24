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
