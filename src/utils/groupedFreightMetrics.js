/**
 * On-time/lead-time metrics grouped by an arbitrary shipment predicate
 * (forwarding agent, shipping line, ...) instead of supplier name.
 *
 * Mirrors the relevant subset of SupplierMetrics (supplierMetrics.js) --
 * every one of its date-math helpers (getScheduledDate, getActualArrivalDate,
 * getDateShipped, diffCalendarDays, lateBufferDays, dedupeByOrder,
 * getSupplierGrade, isOpenOrderStatus) takes no supplier argument at all, so
 * they're reused here directly via SupplierMetrics.xxx(...) rather than
 * duplicated. Only the *filter* differs: a match predicate instead of a
 * supplier-name string comparison, and there's no SACCO-style exclusion
 * (that's supplier-specific business logic, not applicable to a freight
 * agent/carrier grouping).
 *
 * Deliberately does not include inspection pass rate, shipment audit trail,
 * or open-order line drill-down -- those either don't apply (pass rate
 * reflects the goods, not the freight agent/carrier) or are a further step
 * beyond the KPI/grade-level metrics this was built for.
 */
import { ShipmentStatus } from '../types/shipment';
import { SupplierMetrics } from './supplierMetrics';

export class GroupedFreightMetrics {
  /**
   * Shipments matching the predicate, one row per product line (no dedupe).
   * Use for anything measuring delivery timing, same reasoning as
   * SupplierMetrics.getSupplierShipmentLines -- a multi-line order can
   * genuinely arrive in separate batches across different weeks.
   */
  static getGroupShipmentLines(shipments, matchFn) {
    return (shipments || []).filter(matchFn);
  }

  /** Matching shipments, deduped by order -- use for counting distinct orders. */
  static getGroupShipments(shipments, matchFn) {
    return SupplierMetrics.dedupeByOrder(this.getGroupShipmentLines(shipments, matchFn));
  }

  /**
   * On-time departure % -- ETD vs actual Date Shipped. Not restricted to
   * warehouse-confirmed shipments (departure already happened once both
   * dates are captured). Returns null (not 0) when no shipments have both
   * dates, so it reads as "no data" rather than "0% on time".
   */
  static calculateOnTimeDepartureRate(shipments, matchFn) {
    const groupShipments = this.getGroupShipmentLines(shipments, matchFn);
    const withDepartureData = groupShipments.filter(s => s.etd && s.dateShipped);
    if (withDepartureData.length === 0) return null;

    const onTimeCount = withDepartureData.filter(s => SupplierMetrics.diffCalendarDays(s.dateShipped, s.etd) <= 0).length;
    return Math.round((onTimeCount / withDepartureData.length) * 100);
  }

  /**
   * On-time delivery % -- warehouse-confirmed shipments arrived on or
   * before their scheduled date, same warehouse-population/late-buffer
   * rules as SupplierMetrics.calculateOnTimeDelivery.
   */
  static calculateOnTimeDelivery(shipments, matchFn) {
    const groupShipments = this.getGroupShipmentLines(shipments, matchFn);
    if (groupShipments.length === 0) return 0;

    const isInWarehouseStatus = (s) => [
      ShipmentStatus.STORED, ShipmentStatus.RECEIVED, ShipmentStatus.INSPECTION_PASSED,
      'stored', 'received', 'inspection_passed',
    ].includes(s.latestStatus);

    const warehouseShipments = groupShipments.filter(isInWarehouseStatus);

    const deliveredShipments = warehouseShipments.filter(s => {
      const arrivedDate = SupplierMetrics.getActualArrivalDate(s) || s.updatedAt;
      if (!arrivedDate || !s.weekNumber) return true;

      const scheduledDate = SupplierMetrics.getScheduledDate(s);
      return SupplierMetrics.diffCalendarDays(arrivedDate, scheduledDate) <= SupplierMetrics.lateBufferDays(s);
    });

    return warehouseShipments.length > 0
      ? Math.round((deliveredShipments.length / warehouseShipments.length) * 100)
      : 0;
  }

  /** Avg days actual-arrival vs scheduled (warehouse-confirmed shipments only). */
  static calculateAverageLeadTime(shipments, matchFn) {
    const groupShipments = this.getGroupShipmentLines(shipments, matchFn);
    const warehouseWithDates = groupShipments.filter(s => {
      const isInWarehouse = [
        ShipmentStatus.STORED, ShipmentStatus.RECEIVED, ShipmentStatus.INSPECTION_PASSED,
        'stored', 'received', 'inspection_passed',
      ].includes(s.latestStatus);
      return isInWarehouse && SupplierMetrics.getActualArrivalDate(s) && s.weekNumber;
    });
    if (warehouseWithDates.length === 0) return null;

    const leadTimes = warehouseWithDates.map(s =>
      SupplierMetrics.diffCalendarDays(SupplierMetrics.getActualArrivalDate(s), SupplierMetrics.getScheduledDate(s))
    );
    return Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length);
  }

  /** Avg days actual-arrival vs Date Shipped (warehouse-confirmed shipments only). */
  static calculateAverageFreightLeadTime(shipments, matchFn) {
    const groupShipments = this.getGroupShipmentLines(shipments, matchFn);
    const warehouseWithDates = groupShipments.filter(s => {
      const isInWarehouse = [
        ShipmentStatus.STORED, ShipmentStatus.RECEIVED, ShipmentStatus.INSPECTION_PASSED,
        'stored', 'received', 'inspection_passed',
      ].includes(s.latestStatus);
      return isInWarehouse && SupplierMetrics.getActualArrivalDate(s) && SupplierMetrics.getDateShipped(s);
    });
    if (warehouseWithDates.length === 0) return null;

    const leadTimes = warehouseWithDates.map(s =>
      SupplierMetrics.diffCalendarDays(SupplierMetrics.getActualArrivalDate(s), SupplierMetrics.getDateShipped(s))
    );
    return Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length);
  }

  /** Distinct warehouse-confirmed orders matching the predicate. */
  static getTotalShipments(shipments, matchFn) {
    return this.getGroupShipments(shipments, matchFn).filter(s => [
      ShipmentStatus.STORED, ShipmentStatus.RECEIVED, ShipmentStatus.INSPECTION_PASSED,
      'stored', 'received', 'inspection_passed',
    ].includes(s.latestStatus)).length;
  }

  /** Distinct open orders (not yet stored/sold/archived/cancelled) matching the predicate. */
  static getOpenOrders(shipments, matchFn) {
    return this.getGroupShipments(shipments, matchFn).filter(s => SupplierMetrics.isOpenOrderStatus(s.latestStatus));
  }

  /**
   * All the above, bundled -- mirrors SupplierMetrics.calculateAllMetrics'
   * shape minus passRatePercent (not meaningful for a freight agent/carrier:
   * an inspection outcome reflects the goods, not who shipped them).
   */
  static calculateAllGroupMetrics(shipments, matchFn, groupName) {
    const onTimePercent = this.calculateOnTimeDelivery(shipments, matchFn);
    const onTimeDeparturePercent = this.calculateOnTimeDepartureRate(shipments, matchFn);
    const avgLeadTime = this.calculateAverageLeadTime(shipments, matchFn);
    const avgFreightLeadTime = this.calculateAverageFreightLeadTime(shipments, matchFn);
    const totalShipments = this.getTotalShipments(shipments, matchFn);
    const openOrdersCount = this.getOpenOrders(shipments, matchFn).length;
    // getSupplierGrade already treats a null pass rate as "don't penalize",
    // so grading on on-time alone works with zero changes to that function.
    const grade = SupplierMetrics.getSupplierGrade(onTimePercent, null);

    return {
      groupName,
      onTimePercent,
      onTimeDeparturePercent,
      avgLeadTime,
      avgFreightLeadTime,
      totalShipments,
      openOrdersCount,
      grade,
    };
  }
}
