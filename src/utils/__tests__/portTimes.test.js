import { computePortTimes, buildStatusSegments, formatDuration } from '../portTimes.js';

const H = 3600000;
const D = 24 * H;
const T0 = Date.parse('2026-11-01T08:00:00Z');
const at = (ms) => new Date(T0 + ms).toISOString();
const entry = (id, to_status, ms, extra = {}) => ({ id, to_status, changed_at: at(ms), ...extra });

describe('computePortTimes', () => {
  it('measures delay → berth working → berth complete', () => {
    const history = [
      entry(1, 'in_transit_seaway', -10 * D),
      entry(2, 'delayed_port', 0),
      entry(3, 'berth_working', 4 * D + 6 * H),
      entry(4, 'berth_complete', 5 * D + 9 * H),
      entry(5, 'gated_in_port', 6 * D),
    ];
    const r = computePortTimes(history, 'gated_in_port', T0 + 7 * D);
    expect(r.portDelay).toMatchObject({ ms: 4 * D + 6 * H, ongoing: false });
    expect(r.berthWorking).toMatchObject({ ms: 1 * D + 3 * H, ongoing: false });
    expect(r.total).toMatchObject({ ms: 5 * D + 9 * H });
  });

  it('counts a still-running delay up to now', () => {
    const history = [entry(1, 'moored', -D), entry(2, 'delayed_port', 0)];
    const r = computePortTimes(history, 'delayed_port', T0 + 3 * D);
    expect(r.portDelay).toMatchObject({ ms: 3 * D, ongoing: true });
    expect(r.berthWorking).toBeNull();
    expect(r.total).toBeNull();
  });

  it('runs the delay through a moored step until berth working', () => {
    const history = [entry(1, 'delayed_port', 0), entry(2, 'moored', 2 * D), entry(3, 'berth_working', 3 * D)];
    const r = computePortTimes(history, 'berth_working', T0 + 4 * D);
    expect(r.portDelay.ms).toBe(3 * D);
    expect(r.berthWorking).toMatchObject({ ms: D, ongoing: true });
  });

  it('has no port delay when a vessel berths without a delay', () => {
    const history = [entry(1, 'moored', 0), entry(2, 'berth_working', H), entry(3, 'berth_complete', 20 * H)];
    const r = computePortTimes(history, 'berth_complete', T0 + D);
    expect(r.portDelay).toBeNull();
    expect(r.berthWorking.ms).toBe(19 * H);
    expect(r.total.ms).toBe(19 * H);
  });

  it('leaves an open-ended span unknown when the trail stops short of the current status', () => {
    const history = [entry(1, 'delayed_port', 0, { source: 'backfill' })];
    const r = computePortTimes(history, 'arrived_pta', T0 + 5 * D);
    expect(r.portDelay).toBeNull();
    expect(r.isEstimated).toBe(true);
  });

  it('treats a user-corrected seed time as no longer estimated', () => {
    const history = [entry(1, 'delayed_port', 0, { source: 'seed', edited_at: at(D) })];
    expect(computePortTimes(history, 'delayed_port', T0 + 2 * D).isEstimated).toBe(false);
  });

  it('orders by changed_at, not by id (edited times)', () => {
    const history = [entry(2, 'berth_working', 2 * D), entry(1, 'delayed_port', 0)];
    const r = computePortTimes(history, 'berth_working', T0 + 3 * D);
    expect(r.portDelay.ms).toBe(2 * D);
  });
});

describe('buildStatusSegments', () => {
  it('returns empty for no history', () => {
    expect(buildStatusSegments([], 'moored')).toEqual([]);
    expect(buildStatusSegments(undefined, 'moored')).toEqual([]);
  });
});

describe('formatDuration', () => {
  it.each([
    [null, '—'],
    [30 * 1000, '<1m'],
    [12 * 60000, '12m'],
    [5 * H + 20 * 60000, '5h 20m'],
    [5 * H, '5h'],
    [4 * D + 6 * H, '4d 6h'],
    [2 * D, '2d'],
  ])('formats %s as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
