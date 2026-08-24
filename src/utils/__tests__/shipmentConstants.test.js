import {
  AIRFREIGHT_AGENTS,
  SEAFREIGHT_AGENTS,
  AIRFREIGHT_STATUSES,
  isAirfreight,
  looksLikeAwbNumber,
  getShippingProgress,
  isAirfreightStatus,
  getForwardingAgents,
  AGENT_TRACKING_URLS,
  getAgentTrackingUrl,
  getAwbTrackingUrl,
  getBolTrackingUrl,
  getContainerTrackingUrl,
  SHIPPING_LINES,
} from '../shipmentConstants.js';

describe('AIRFREIGHT_AGENTS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(AIRFREIGHT_AGENTS)).toBe(true);
    expect(AIRFREIGHT_AGENTS.length).toBeGreaterThan(0);
  });

  it('each agent has value and label properties', () => {
    for (const agent of AIRFREIGHT_AGENTS) {
      expect(agent).toHaveProperty('value');
      expect(agent).toHaveProperty('label');
      expect(typeof agent.value).toBe('string');
      expect(typeof agent.label).toBe('string');
    }
  });
});

describe('SEAFREIGHT_AGENTS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SEAFREIGHT_AGENTS)).toBe(true);
    expect(SEAFREIGHT_AGENTS.length).toBeGreaterThan(0);
  });

  it('each agent has value and label properties', () => {
    for (const agent of SEAFREIGHT_AGENTS) {
      expect(agent).toHaveProperty('value');
      expect(agent).toHaveProperty('label');
      expect(typeof agent.value).toBe('string');
      expect(typeof agent.label).toBe('string');
    }
  });

  it('has no overlap with airfreight agents', () => {
    const airValues = new Set(AIRFREIGHT_AGENTS.map((a) => a.value));
    for (const agent of SEAFREIGHT_AGENTS) {
      expect(airValues.has(agent.value)).toBe(false);
    }
  });
});

describe('AIRFREIGHT_STATUSES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(AIRFREIGHT_STATUSES)).toBe(true);
    expect(AIRFREIGHT_STATUSES.length).toBeGreaterThan(0);
  });

  it('contains planned_airfreight', () => {
    expect(AIRFREIGHT_STATUSES).toContain('planned_airfreight');
  });

  it('contains in_transit_airfreight', () => {
    expect(AIRFREIGHT_STATUSES).toContain('in_transit_airfreight');
  });

  it('contains air_customs_clearance', () => {
    expect(AIRFREIGHT_STATUSES).toContain('air_customs_clearance');
  });

  it('does not contain sea statuses', () => {
    expect(AIRFREIGHT_STATUSES).not.toContain('planned_seafreight');
    expect(AIRFREIGHT_STATUSES).not.toContain('in_transit_seaway');
  });
});

describe('isAirfreight', () => {
  it('returns true for planned_airfreight', () => {
    expect(isAirfreight('planned_airfreight')).toBe(true);
  });

  it('returns true for in_transit_airfreight', () => {
    expect(isAirfreight('in_transit_airfreight')).toBe(true);
  });

  it('returns true for air_customs_clearance', () => {
    expect(isAirfreight('air_customs_clearance')).toBe(true);
  });

  it('returns false for planned_seafreight', () => {
    expect(isAirfreight('planned_seafreight')).toBe(false);
  });

  it('returns false for in_transit_seaway', () => {
    expect(isAirfreight('in_transit_seaway')).toBe(false);
  });

  it('returns false for in_transit_roadway', () => {
    expect(isAirfreight('in_transit_roadway')).toBe(false);
  });

  it('returns false for arrived statuses', () => {
    expect(isAirfreight('arrived_pta')).toBe(false);
    expect(isAirfreight('arrived_klm')).toBe(false);
    expect(isAirfreight('arrived_offsite')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isAirfreight(null)).toBe(false);
    expect(isAirfreight(undefined)).toBe(false);
  });

  it('returns true for a shared status when the forwarding agent is an airfreight agent', () => {
    expect(isAirfreight('in_transit_last_mile', 'Emirates SkyCargo')).toBe(true);
    expect(isAirfreight('arrived_pta', 'Qatar Airways Cargo')).toBe(true);
  });

  it('returns false for a shared status when the forwarding agent is a seafreight agent', () => {
    expect(isAirfreight('in_transit_last_mile', 'Maersk')).toBe(false);
  });

  it('falls back to the AWB/vessel value when status and agent are both ambiguous', () => {
    expect(isAirfreight('in_transit_last_mile', '', '72479938666')).toBe(true);
    expect(isAirfreight('in_transit_last_mile', '', 'MSC OSCAR')).toBe(false);
  });
});

describe('looksLikeAwbNumber', () => {
  it('returns true for digit-only AWB numbers', () => {
    expect(looksLikeAwbNumber('72479938666')).toBe(true);
    expect(looksLikeAwbNumber('724-79938666')).toBe(true);
  });

  it('returns false for vessel names', () => {
    expect(looksLikeAwbNumber('MSC OSCAR')).toBe(false);
    expect(looksLikeAwbNumber('EVER GIVEN')).toBe(false);
  });

  it('returns false for too-short or too-long digit strings', () => {
    expect(looksLikeAwbNumber('12345')).toBe(false);
    expect(looksLikeAwbNumber('1234567890123')).toBe(false);
  });

  it('returns false for empty/null/undefined', () => {
    expect(looksLikeAwbNumber('')).toBe(false);
    expect(looksLikeAwbNumber(null)).toBe(false);
    expect(looksLikeAwbNumber(undefined)).toBe(false);
  });
});

describe('getShippingProgress', () => {
  it('returns an object with current and total', () => {
    const result = getShippingProgress('planned_seafreight');
    expect(result).toHaveProperty('current');
    expect(result).toHaveProperty('total');
  });

  it('total is always 5', () => {
    const statuses = [
      'planned_airfreight', 'in_transit_seaway', 'moored', 'arrived_pta', 'stored',
    ];
    for (const status of statuses) {
      expect(getShippingProgress(status).total).toBe(5);
    }
  });

  it('planned statuses are step 1', () => {
    expect(getShippingProgress('planned_airfreight').current).toBe(1);
    expect(getShippingProgress('planned_seafreight').current).toBe(1);
  });

  it('transit statuses are step 2', () => {
    expect(getShippingProgress('in_transit_airfreight').current).toBe(2);
    expect(getShippingProgress('in_transit_roadway').current).toBe(2);
    expect(getShippingProgress('in_transit_seaway').current).toBe(2);
    expect(getShippingProgress('air_customs_clearance').current).toBe(2);
  });

  it('port statuses are step 3', () => {
    expect(getShippingProgress('moored').current).toBe(3);
    expect(getShippingProgress('berth_working').current).toBe(3);
    expect(getShippingProgress('berth_complete').current).toBe(3);
    expect(getShippingProgress('gated_in_port').current).toBe(3);
  });

  it('arrival statuses are step 4', () => {
    expect(getShippingProgress('arrived_pta').current).toBe(4);
    expect(getShippingProgress('arrived_klm').current).toBe(4);
    expect(getShippingProgress('arrived_offsite').current).toBe(4);
  });

  it('final statuses are step 5', () => {
    expect(getShippingProgress('received').current).toBe(5);
    expect(getShippingProgress('stored').current).toBe(5);
    expect(getShippingProgress('archived').current).toBe(5);
  });

  it('returns 0 for unknown status', () => {
    expect(getShippingProgress('nonexistent').current).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(getShippingProgress(null).current).toBe(0);
    expect(getShippingProgress(undefined).current).toBe(0);
  });
});

describe('isAirfreightStatus', () => {
  it('returns true for planned_airfreight', () => {
    expect(isAirfreightStatus('planned_airfreight')).toBe(true);
  });

  it('returns true for in_transit_airfreight', () => {
    expect(isAirfreightStatus('in_transit_airfreight')).toBe(true);
  });

  it('returns true for air_customs_clearance', () => {
    expect(isAirfreightStatus('air_customs_clearance')).toBe(true);
  });

  it('returns false for sea/road statuses', () => {
    expect(isAirfreightStatus('planned_seafreight')).toBe(false);
    expect(isAirfreightStatus('in_transit_seaway')).toBe(false);
    expect(isAirfreightStatus('in_transit_roadway')).toBe(false);
  });
});

describe('getForwardingAgents', () => {
  it('returns airfreight agents for planned_airfreight', () => {
    const agents = getForwardingAgents('planned_airfreight');
    expect(agents).toBe(AIRFREIGHT_AGENTS);
  });

  it('returns airfreight agents for in_transit_airfreight', () => {
    const agents = getForwardingAgents('in_transit_airfreight');
    expect(agents).toBe(AIRFREIGHT_AGENTS);
  });

  it('returns airfreight agents for air_customs_clearance', () => {
    const agents = getForwardingAgents('air_customs_clearance');
    expect(agents).toBe(AIRFREIGHT_AGENTS);
  });

  it('returns seafreight agents for planned_seafreight', () => {
    const agents = getForwardingAgents('planned_seafreight');
    expect(agents).toBe(SEAFREIGHT_AGENTS);
  });

  it('returns seafreight agents for in_transit_seaway', () => {
    const agents = getForwardingAgents('in_transit_seaway');
    expect(agents).toBe(SEAFREIGHT_AGENTS);
  });

  it('returns seafreight agents for arrived statuses', () => {
    expect(getForwardingAgents('arrived_pta')).toBe(SEAFREIGHT_AGENTS);
    expect(getForwardingAgents('arrived_klm')).toBe(SEAFREIGHT_AGENTS);
  });

  it('returns seafreight agents for unknown status (default)', () => {
    expect(getForwardingAgents('unknown_status')).toBe(SEAFREIGHT_AGENTS);
  });
});

describe('getAgentTrackingUrl', () => {
  it('returns a URL for a known agent', () => {
    expect(getAgentTrackingUrl('Maersk')).toBe(AGENT_TRACKING_URLS['Maersk']);
    expect(typeof getAgentTrackingUrl('Maersk')).toBe('string');
  });

  it('returns null for an agent with no known tracking tool', () => {
    expect(getAgentTrackingUrl('Afrigistics')).toBe(null);
  });

  it('returns null for empty/unknown agent', () => {
    expect(getAgentTrackingUrl('')).toBe(null);
    expect(getAgentTrackingUrl(undefined)).toBe(null);
    expect(getAgentTrackingUrl('Some Random Agent')).toBe(null);
  });
});

describe('getAwbTrackingUrl', () => {
  it('builds a track-trace.com aircargo URL from the AWB number', () => {
    expect(getAwbTrackingUrl('72479938666')).toBe('https://www.track-trace.com/aircargo?awb=72479938666');
  });

  it('strips non-digit characters (e.g. a dash) before building the URL', () => {
    expect(getAwbTrackingUrl('724-79938666')).toBe('https://www.track-trace.com/aircargo?awb=72479938666');
  });

  it('returns null for empty/null/undefined', () => {
    expect(getAwbTrackingUrl('')).toBe(null);
    expect(getAwbTrackingUrl(null)).toBe(null);
    expect(getAwbTrackingUrl(undefined)).toBe(null);
  });
});

describe('getBolTrackingUrl', () => {
  it('builds a prefilled deep link for a known carrier', () => {
    expect(getBolTrackingUrl('Maersk', 'ABC123')).toBe('https://www.maersk.com/tracking/ABC123');
    expect(getBolTrackingUrl('DHL', 'ABC123')).toBe('https://www.dhl.com/za-en/home/tracking.html?tracking-id=ABC123&submit=1');
    expect(getBolTrackingUrl('CMA CGM', 'ABC123')).toBe('https://www.cma-cgm.com/ebusiness/tracking/search?Reference=ABC123');
    expect(getBolTrackingUrl('Hapag-Lloyd', 'ABC123')).toBe('https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=ABC123');
  });

  it('falls back to the bare agent tracking page when the BOL number is missing', () => {
    expect(getBolTrackingUrl('Maersk', '')).toBe(AGENT_TRACKING_URLS['Maersk']);
    expect(getBolTrackingUrl('Maersk', undefined)).toBe(AGENT_TRACKING_URLS['Maersk']);
  });

  it('falls back to the bare agent tracking page for a carrier with no known deep-link format', () => {
    expect(getBolTrackingUrl('COSCO', 'ABC123')).toBe(AGENT_TRACKING_URLS['COSCO']);
  });

  it('returns null when the agent has no tracking tool at all', () => {
    expect(getBolTrackingUrl('Afrigistics', 'ABC123')).toBe(null);
  });
});

describe('getContainerTrackingUrl', () => {
  it('builds a prefilled deep link for a carrier confirmed to accept container numbers', () => {
    expect(getContainerTrackingUrl('Maersk', 'MSCU1234567')).toBe('https://www.maersk.com/tracking/MSCU1234567');
    expect(getContainerTrackingUrl('CMA CGM', 'MSCU1234567')).toBe('https://www.cma-cgm.com/ebusiness/tracking/search?Reference=MSCU1234567');
  });

  it('falls back to the bare agent tracking page for a BOL-only carrier (DHL, Hapag-Lloyd not confirmed for containers)', () => {
    expect(getContainerTrackingUrl('DHL', 'MSCU1234567')).toBe(AGENT_TRACKING_URLS['DHL']);
    expect(getContainerTrackingUrl('Hapag-Lloyd', 'MSCU1234567')).toBe(AGENT_TRACKING_URLS['Hapag-Lloyd']);
  });

  it('falls back to the bare agent tracking page when the container number is missing', () => {
    expect(getContainerTrackingUrl('Maersk', '')).toBe(AGENT_TRACKING_URLS['Maersk']);
  });

  it('returns null when the agent has no tracking tool at all', () => {
    expect(getContainerTrackingUrl('Afrigistics', 'MSCU1234567')).toBe(null);
  });
});

describe('SHIPPING_LINES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SHIPPING_LINES)).toBe(true);
    expect(SHIPPING_LINES.length).toBeGreaterThan(0);
  });

  it('excludes freight-forwarder-only agents (DHL, DSV, Afrigistics)', () => {
    const values = SHIPPING_LINES.map(l => l.value);
    expect(values).not.toContain('DHL');
    expect(values).not.toContain('DSV');
    expect(values).not.toContain('Afrigistics');
  });

  it('includes the actual ocean carriers', () => {
    const values = SHIPPING_LINES.map(l => l.value);
    expect(values).toContain('Maersk');
    expect(values).toContain('MSC');
    expect(values).toContain('ONE');
  });
});

describe('getBolTrackingUrl / getContainerTrackingUrl with shippingLine', () => {
  it('prefers shippingLine over forwardingAgent when both are set', () => {
    // Booked through DHL (forwarder) but actually carried by ONE — ONE has
    // the real tracking data, not DHL.
    expect(getBolTrackingUrl('DHL', 'ABC123', 'Maersk')).toBe('https://www.maersk.com/tracking/ABC123');
    expect(getContainerTrackingUrl('DHL', 'MSCU1234567', 'CMA CGM')).toBe('https://www.cma-cgm.com/ebusiness/tracking/search?Reference=MSCU1234567');
  });

  it('falls back to forwardingAgent when shippingLine is not set', () => {
    expect(getBolTrackingUrl('Maersk', 'ABC123', '')).toBe('https://www.maersk.com/tracking/ABC123');
    expect(getBolTrackingUrl('Maersk', 'ABC123', undefined)).toBe('https://www.maersk.com/tracking/ABC123');
  });
});
