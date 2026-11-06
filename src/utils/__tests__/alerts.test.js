import { computeShipmentAlerts, createCustomAlert } from '../alerts.js';

// Helper to create a base shipment object
const makeShipment = (overrides = {}) => ({
  id: 1,
  supplier: 'TestSupplier',
  productName: 'TestProduct',
  orderRef: 'ORD-001',
  latestStatus: 'planned_seafreight',
  weekNumber: null,
  palletQty: 10,
  cbm: null,
  finalPod: 'DBN',
  selectedWeekDate: null,
  reminderDate: null,
  reminderNote: null,
  ...overrides,
});

describe('computeShipmentAlerts', () => {
  let dateSpy;

  afterEach(() => {
    if (dateSpy) dateSpy.mockRestore();
  });

  // -- Empty / null inputs --

  it('returns empty array for empty shipments array', () => {
    expect(computeShipmentAlerts([])).toEqual([]);
  });

  it('returns empty array when all shipments are archived', () => {
    const shipments = [
      makeShipment({ id: 1, latestStatus: 'archived' }),
      makeShipment({ id: 2, latestStatus: 'archived' }),
    ];
    expect(computeShipmentAlerts(shipments)).toEqual([]);
  });

  // -- Critical alerts --

  it('generates critical alert for delayed shipments (delayed_port)', () => {
    const shipments = [makeShipment({ latestStatus: 'delayed_port' })];
    const alerts = computeShipmentAlerts(shipments);
    const delayed = alerts.find((a) => a.title === 'Delayed Shipment');
    expect(delayed).toBeDefined();
    expect(delayed.severity).toBe('critical');
    expect(delayed.description).toContain('port congestion');
  });

  it('says how long a shipment has been delayed when statusChangedAt is known', () => {
    const statusChangedAt = new Date(Date.now() - 3.5 * 86400000).toISOString();
    const alerts = computeShipmentAlerts([makeShipment({ latestStatus: 'delayed_port', statusChangedAt })]);
    const delayed = alerts.find((a) => a.title === 'Delayed Shipment');
    expect(delayed.description).toContain('for 3 days');
  });

  it('generates critical alert for delayed_customs', () => {
    const shipments = [makeShipment({ latestStatus: 'delayed_customs' })];
    const alerts = computeShipmentAlerts(shipments);
    const delayed = alerts.find((a) => a.title === 'Delayed Shipment');
    expect(delayed).toBeDefined();
    expect(delayed.description).toContain('customs hold');
  });

  it('generates critical alert for delayed_documents', () => {
    const shipments = [makeShipment({ latestStatus: 'delayed_documents' })];
    const alerts = computeShipmentAlerts(shipments);
    const delayed = alerts.find((a) => a.title === 'Delayed Shipment');
    expect(delayed).toBeDefined();
    expect(delayed.description).toContain('missing documents');
  });

  it('generates critical alert for delayed_supplier', () => {
    const shipments = [makeShipment({ latestStatus: 'delayed_supplier' })];
    const alerts = computeShipmentAlerts(shipments);
    const delayed = alerts.find((a) => a.title === 'Delayed Shipment');
    expect(delayed).toBeDefined();
    expect(delayed.description).toContain('supplier delay');
  });

  it('generates critical alert for cancelled shipments', () => {
    const shipments = [makeShipment({ latestStatus: 'cancelled' })];
    const alerts = computeShipmentAlerts(shipments);
    const cancelled = alerts.find((a) => a.title === 'Cancelled Shipment');
    expect(cancelled).toBeDefined();
    expect(cancelled.severity).toBe('critical');
    expect(cancelled.description).toContain('has been cancelled');
  });

  // -- Warning alerts --

  it('generates warning for inspection_failed', () => {
    const shipments = [makeShipment({ latestStatus: 'inspection_failed' })];
    const alerts = computeShipmentAlerts(shipments);
    const failed = alerts.find((a) => a.title === 'Inspection Failed');
    expect(failed).toBeDefined();
    expect(failed.severity).toBe('warning');
    expect(failed.description).toContain('failed inspection');
  });

  it('generates warning for inspection_pending', () => {
    const shipments = [makeShipment({ latestStatus: 'inspection_pending' })];
    const alerts = computeShipmentAlerts(shipments);
    const pending = alerts.find((a) => a.title === 'Inspection Pending');
    expect(pending).toBeDefined();
    expect(pending.severity).toBe('warning');
  });

  // -- Info alerts --

  it('generates info alert for arrived_pta', () => {
    const shipments = [makeShipment({ latestStatus: 'arrived_pta' })];
    const alerts = computeShipmentAlerts(shipments);
    const arrived = alerts.find((a) => a.title === 'Shipment Arrived');
    expect(arrived).toBeDefined();
    expect(arrived.severity).toBe('info');
    expect(arrived.description).toContain('PTA');
  });

  it('generates info alert for arrived_klm', () => {
    const shipments = [makeShipment({ latestStatus: 'arrived_klm' })];
    const alerts = computeShipmentAlerts(shipments);
    const arrived = alerts.find((a) => a.title === 'Shipment Arrived');
    expect(arrived).toBeDefined();
    expect(arrived.description).toContain('KLM');
  });

  it('generates info alert for arrived_offsite', () => {
    const shipments = [makeShipment({ latestStatus: 'arrived_offsite' })];
    const alerts = computeShipmentAlerts(shipments);
    const arrived = alerts.find((a) => a.title === 'Shipment Arrived');
    expect(arrived).toBeDefined();
    expect(arrived.description).toContain('OFFSITE');
  });

  // -- Reminder alerts --

  it('generates overdue reminder alert when reminderDate is in the past', () => {
    // Set a reminder date 5 days ago
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const shipments = [
      makeShipment({
        reminderDate: pastDate.toISOString(),
        reminderNote: 'Follow up with supplier',
      }),
    ];
    const alerts = computeShipmentAlerts(shipments);
    const overdue = alerts.find((a) => a.title === 'Overdue Reminder');
    expect(overdue).toBeDefined();
    expect(overdue.severity).toBe('critical');
    expect(overdue.description).toContain('Follow up with supplier');
    expect(overdue.description).toContain('5 days ago');
  });

  it('generates today reminder alert when reminderDate is today', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0); // midday to avoid edge cases
    const shipments = [
      makeShipment({
        reminderDate: today.toISOString(),
        reminderNote: 'Check docs',
      }),
    ];
    const alerts = computeShipmentAlerts(shipments);
    const todayReminder = alerts.find((a) => a.title === 'Reminder Due Today');
    expect(todayReminder).toBeDefined();
    expect(todayReminder.severity).toBe('warning');
    expect(todayReminder.description).toContain('Check docs');
  });

  it('generates upcoming reminder alert when reminderDate is within 3 days', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const shipments = [
      makeShipment({
        reminderDate: futureDate.toISOString(),
        reminderNote: 'Prepare paperwork',
      }),
    ];
    const alerts = computeShipmentAlerts(shipments);
    const upcoming = alerts.find((a) => a.title === 'Upcoming Reminder');
    expect(upcoming).toBeDefined();
    expect(upcoming.severity).toBe('info');
    expect(upcoming.description).toContain('Prepare paperwork');
  });

  it('does not generate reminder alert when reminderDate is more than 3 days away', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const shipments = [
      makeShipment({
        reminderDate: futureDate.toISOString(),
        reminderNote: 'Far away',
      }),
    ];
    const alerts = computeShipmentAlerts(shipments);
    const reminder = alerts.find(
      (a) =>
        a.title === 'Overdue Reminder' ||
        a.title === 'Reminder Due Today' ||
        a.title === 'Upcoming Reminder'
    );
    expect(reminder).toBeUndefined();
  });

  // -- No duplicate alert IDs --

  it('produces no duplicate alert IDs', () => {
    const shipments = [
      makeShipment({ id: 1, latestStatus: 'delayed_port', weekNumber: '10' }),
      makeShipment({ id: 2, latestStatus: 'cancelled', weekNumber: '10' }),
      makeShipment({
        id: 3,
        latestStatus: 'arrived_pta',
        weekNumber: '10',
        reminderDate: new Date().toISOString(),
        reminderNote: 'Test',
      }),
    ];
    const alerts = computeShipmentAlerts(shipments);
    const ids = alerts.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  // -- Sorting order --

  it('sorts alerts by severity: critical first, then warning, then info', () => {
    const shipments = [
      makeShipment({ id: 1, latestStatus: 'arrived_pta' }), // info
      makeShipment({ id: 2, latestStatus: 'inspection_failed' }), // warning
      makeShipment({ id: 3, latestStatus: 'cancelled' }), // critical
    ];
    const alerts = computeShipmentAlerts(shipments);
    // Find the first occurrence of each severity
    const severities = alerts.map((a) => a.severity);
    const firstCritical = severities.indexOf('critical');
    const firstWarning = severities.indexOf('warning');
    const firstInfo = severities.indexOf('info');
    if (firstCritical !== -1 && firstWarning !== -1) {
      expect(firstCritical).toBeLessThan(firstWarning);
    }
    if (firstWarning !== -1 && firstInfo !== -1) {
      expect(firstWarning).toBeLessThan(firstInfo);
    }
  });

  // -- Alert meta fields --

  it('includes correct meta fields on alerts', () => {
    const shipments = [
      makeShipment({
        supplier: 'Acme',
        productName: 'Widget',
        orderRef: 'ORD-99',
        latestStatus: 'cancelled',
        palletQty: 20,
        finalPod: 'CPT',
      }),
    ];
    const alerts = computeShipmentAlerts(shipments);
    const cancelled = alerts.find((a) => a.title === 'Cancelled Shipment');
    expect(cancelled.meta).toMatchObject({
      supplier: 'Acme',
      product: 'Widget',
      orderRef: 'ORD-99',
      status: 'cancelled',
      palletQty: 20,
      finalPod: 'CPT',
    });
  });

  // -- All alerts have read: false --

  it('all alerts have read set to false', () => {
    const shipments = [
      makeShipment({ id: 1, latestStatus: 'delayed_port' }),
      makeShipment({ id: 2, latestStatus: 'cancelled' }),
    ];
    const alerts = computeShipmentAlerts(shipments);
    for (const a of alerts) {
      expect(a.read).toBe(false);
    }
  });
});

describe('createCustomAlert', () => {
  it('creates alert with correct fields', () => {
    const alert = createCustomAlert('warning', 'Test Title', 'Test description', {
      extra: 'data',
    });
    expect(alert.severity).toBe('warning');
    expect(alert.title).toBe('Test Title');
    expect(alert.description).toBe('Test description');
    expect(alert.meta).toEqual({ extra: 'data' });
    expect(alert.read).toBe(false);
    expect(alert.id).toMatch(/^custom-/);
    expect(typeof alert.ts).toBe('number');
  });

  it('defaults to info severity', () => {
    const alert = createCustomAlert(undefined, 'Title', 'Desc');
    expect(alert.severity).toBe('info');
  });
});
