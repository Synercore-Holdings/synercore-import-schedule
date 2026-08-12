import { ShipmentStatus, InspectionStatus } from '../types/shipment';

/**
 * Calculate supplier KPI metrics
 * Returns on-time delivery %, inspection pass rate %, avg lead time, and supplier grade
 */

export class SupplierMetrics {
  /**
   * Helper: Filter shipments by supplier name (case-insensitive), then
   * dedupe by order. The shipments table stores one row per product line,
   * so a single multi-line order appears as many rows sharing the same
   * orderRef — without this, a 50-line order would be counted as 50
   * shipments instead of 1.
   */
  static getSupplierShipments(shipments, supplierName) {
    if (!supplierName) return [];

    const normalizedName = supplierName.toLowerCase().trim();
    const matched = shipments.filter(s => {
      const shipmentSupplier = s.supplier?.toLowerCase().trim();
      return shipmentSupplier === normalizedName;
    });

    const seen = new Set();
    const deduped = [];
    for (const s of matched) {
      const key = s.orderRef || s.id;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(s);
    }
    return deduped;
  }

  /**
   * Helper: Resolve the scheduled date to benchmark on-time/lead-time
   * against. Prefers the immutable original_week_number/
   * original_selected_week_date (set once at creation), falling back to
   * the live weekNumber/selectedWeekDate for shipments created before
   * those columns existed — which get overwritten on every reschedule, so
   * they only approximate the original commitment.
   */
  static getScheduledDate(shipment) {
    const originalDate = shipment.originalSelectedWeekDate
      || (shipment.originalWeekNumber ? this.estimateDateFromWeek(shipment.originalWeekNumber, shipment.receivingDate) : null);
    if (originalDate) return originalDate;

    return shipment.selectedWeekDate || this.estimateDateFromWeek(shipment.weekNumber, shipment.receivingDate);
  }

  /**
   * Helper: Resolve the date a shipment actually arrived, for benchmarking
   * against the scheduled date. Prefers actualArrivalDate — manually
   * entered by a user as soon as they learn the consignment physically
   * arrived — over receivingDate, which is only stamped when someone runs
   * the receiving workflow in the app and can lag well behind the real
   * arrival if that gets delayed (e.g. staff unavailable).
   */
  static getActualArrivalDate(shipment) {
    return shipment.actualArrivalDate || shipment.receivingDate;
  }

  /**
   * Calculate on-time delivery percentage for a supplier
   * On-time = shipments received/stored in or before their scheduled week
   * Uses warehouse storage data for metrics
   */
  static calculateOnTimeDelivery(shipments, supplierName) {
    const supplierShipments = this.getSupplierShipments(shipments, supplierName);

    if (supplierShipments.length === 0) return 0;

    // Count shipments that are in warehouse (stored/received) and arrived on time
    const deliveredShipments = supplierShipments.filter(s => {
      // Only count shipments that made it to warehouse (stored, received, or inspection_passed)
      const isInWarehouse = [
        ShipmentStatus.STORED,
        ShipmentStatus.RECEIVED,
        ShipmentStatus.INSPECTION_PASSED,
        // Also accept lowercase versions (from database)
        'stored',
        'received',
        'inspection_passed'
      ].includes(s.latestStatus);

      if (!isInWarehouse) return false;

      // Check if arrived on time
      // Prefer the manually-entered actual arrival date; fall back to
      // receivingDate/updatedAt when it hasn't been captured yet
      const arrivedDate = this.getActualArrivalDate(s) || s.updatedAt;
      if (!arrivedDate || !s.weekNumber) return true; // Assume on-time if missing data

      const scheduledDate = this.getScheduledDate(s);
      const actualDate = new Date(arrivedDate);

      return actualDate <= new Date(scheduledDate);
    });

    // Only calculate percentage based on warehouse/stored shipments
    // This aligns with the Warehouse Storage Report data
    const totalWarehouseShipments = supplierShipments.filter(s => {
      const isInWarehouse = [
        'stored', 'received', 'inspection_passed',
        ShipmentStatus.STORED, ShipmentStatus.RECEIVED, ShipmentStatus.INSPECTION_PASSED
      ].includes(s.latestStatus);
      return isInWarehouse;
    }).length;

    const percentage = totalWarehouseShipments > 0
      ? Math.round((deliveredShipments.length / totalWarehouseShipments) * 100)
      : 0;

    // eslint-disable-next-line no-console
    console.log(`[SupplierMetrics] On-time (Warehouse): ${supplierName}`, {
      totalShipments: supplierShipments.length,
      inWarehouse: totalWarehouseShipments,
      onTimeInWarehouse: deliveredShipments.length,
      percentage,
      warehouseStatuses: [...new Set(supplierShipments
        .filter(s => ['stored', 'received', 'inspection_passed', ShipmentStatus.STORED, ShipmentStatus.RECEIVED].includes(s.latestStatus))
        .map(s => s.latestStatus))]
    });

    return percentage;
  }

  /**
   * Calculate inspection pass rate for a supplier
   * Only counts inspections for warehouse stored shipments
   */
  static calculateInspectionPassRate(shipments, supplierName) {
    const supplierShipments = this.getSupplierShipments(shipments, supplierName);

    // Filter to warehouse shipments that have been inspected
    const warehouseInspected = supplierShipments.filter(s => {
      const isInWarehouse = [
        ShipmentStatus.STORED,
        ShipmentStatus.RECEIVED,
        ShipmentStatus.INSPECTION_PASSED,
        'stored',
        'received',
        'inspection_passed'
      ].includes(s.latestStatus);

      return isInWarehouse && s.inspectionDate;
    });

    if (warehouseInspected.length === 0) return null; // No warehouse inspections yet

    const passedShipments = warehouseInspected.filter(s => {
      const isPassedStatus = s.inspectionStatus === InspectionStatus.PASSED ||
                             s.inspectionStatus === 'passed' ||
                             s.inspectionStatus === 'PASSED';
      return isPassedStatus;
    });

    const percentage = Math.round((passedShipments.length / warehouseInspected.length) * 100);

    // eslint-disable-next-line no-console
    console.log(`[SupplierMetrics] Inspection (Warehouse): ${supplierName}`, {
      totalShipments: supplierShipments.length,
      warehouseShipments: warehouseInspected.length,
      passed: passedShipments.length,
      statuses: [...new Set(warehouseInspected.map(s => s.inspectionStatus))],
      percentage,
      sample: warehouseInspected.slice(0, 2).map(s => ({
        inspectionStatus: s.inspectionStatus,
        inspectionDate: s.inspectionDate,
        latestStatus: s.latestStatus
      }))
    });

    return percentage;
  }

  /**
   * Calculate average lead time in days for warehouse shipments
   * Lead time = actual arrival date - scheduled week date
   * Only counts shipments that made it to warehouse (stored/received/inspection_passed)
   */
  static calculateAverageLeadTime(shipments, supplierName) {
    const supplierShipments = this.getSupplierShipments(shipments, supplierName);

    // Filter to warehouse shipments with receiving dates and week numbers
    const warehouseWithDates = supplierShipments.filter(s => {
      const isInWarehouse = [
        ShipmentStatus.STORED,
        ShipmentStatus.RECEIVED,
        ShipmentStatus.INSPECTION_PASSED,
        'stored',
        'received',
        'inspection_passed'
      ].includes(s.latestStatus);

      return isInWarehouse && this.getActualArrivalDate(s) && s.weekNumber;
    });

    if (warehouseWithDates.length === 0) return null;

    const leadTimes = warehouseWithDates.map(s => {
      const scheduledDate = new Date(this.getScheduledDate(s));
      const actualDate = new Date(this.getActualArrivalDate(s));
      const diffMs = actualDate - scheduledDate;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return diffDays;
    });

    const avgLeadTime = Math.round(
      leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
    );

    // eslint-disable-next-line no-console
    console.log(`[SupplierMetrics] Lead Time (Warehouse): ${supplierName}`, {
      totalShipments: supplierShipments.length,
      warehouseShipments: warehouseWithDates.length,
      avgDays: avgLeadTime,
      sample: leadTimes.slice(0, 3)
    });

    return avgLeadTime;
  }

  /**
   * Build a per-shipment audit trail for a supplier: original scheduled
   * date vs actual receiving date, and whether it graded on-time. Lets
   * users verify the OTD/lead-time numbers against individual shipments
   * instead of trusting the aggregate blindly.
   * Only includes warehouse shipments (stored/received/inspection_passed)
   * with a receivingDate, matching the population used by the KPIs above.
   */
  static getShipmentAudit(shipments, supplierName) {
    const supplierShipments = this.getSupplierShipments(shipments, supplierName);

    return supplierShipments
      .filter(s => {
        const isInWarehouse = [
          ShipmentStatus.STORED,
          ShipmentStatus.RECEIVED,
          ShipmentStatus.INSPECTION_PASSED,
          'stored',
          'received',
          'inspection_passed'
        ].includes(s.latestStatus);
        return isInWarehouse && this.getActualArrivalDate(s);
      })
      .map(s => {
        const scheduledDate = this.getScheduledDate(s);
        const actualDate = this.getActualArrivalDate(s);
        const diffDays = Math.ceil((new Date(actualDate) - new Date(scheduledDate)) / (1000 * 60 * 60 * 24));
        return {
          orderRef: s.orderRef || s.id,
          productName: s.productName,
          scheduledDate,
          actualDate,
          diffDays,
          onTime: new Date(actualDate) <= new Date(scheduledDate),
          usedFallbackBenchmark: !(s.originalSelectedWeekDate || s.originalWeekNumber),
          // True when actualDate came from the manually-entered arrival date
          // rather than falling back to the receiving-workflow timestamp
          isVerifiedArrival: !!s.actualArrivalDate,
          // Full shipment, so callers can open it for editing (e.g. to
          // enter the actual arrival date) straight from the audit row
          shipment: s,
        };
      })
      .sort((a, b) => new Date(b.actualDate) - new Date(a.actualDate));
  }

  /**
   * Get 90-day trend for a metric
   * Returns array of values over last 90 days
   * Only includes warehouse stored shipments (stored/received/inspection_passed)
   */
  static calculateMetricTrend(shipments, supplierName, metric = 'onTime', days = 90) {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const supplierShipments = this.getSupplierShipments(shipments, supplierName);

    // Group warehouse shipments by week
    const weeklyData = {};
    supplierShipments.forEach(s => {
      // Only count warehouse shipments
      const isInWarehouse = [
        ShipmentStatus.STORED,
        ShipmentStatus.RECEIVED,
        ShipmentStatus.INSPECTION_PASSED,
        'stored',
        'received',
        'inspection_passed'
      ].includes(s.latestStatus);

      if (!isInWarehouse) return;

      const shipmentDate = new Date(this.getActualArrivalDate(s) || s.updatedAt || s.createdAt);
      if (shipmentDate < startDate) return;

      const weekKey = this.getWeekKey(shipmentDate);
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          total: 0,
          passed: 0,
          onTime: 0,
          date: shipmentDate
        };
      }

      weeklyData[weekKey].total++;

      if (metric === 'inspection') {
        if (s.inspectionStatus === InspectionStatus.PASSED ||
            s.inspectionStatus === 'passed' ||
            s.inspectionStatus === 'PASSED') {
          weeklyData[weekKey].passed++;
        }
      } else if (metric === 'onTime') {
        const isOnTime = this.isShipmentOnTime(s);
        if (isOnTime) {
          weeklyData[weekKey].onTime++;
        }
      }
    });

    // Convert to trend array
    const trend = Object.values(weeklyData)
      .sort((a, b) => a.date - b.date)
      .map(week => {
        if (metric === 'inspection') {
          return week.total > 0 ? Math.round((week.passed / week.total) * 100) : 0;
        } else {
          return week.total > 0 ? Math.round((week.onTime / week.total) * 100) : 0;
        }
      });

    return trend;
  }

  /**
   * Grade supplier based on KPI metrics
   */
  static getSupplierGrade(onTimePercent, passRatePercent) {
    if (onTimePercent >= 85 && (passRatePercent === null || passRatePercent >= 90)) {
      return { grade: 'A', label: 'Excellent', color: '#28a745' };
    } else if (onTimePercent >= 70 && (passRatePercent === null || passRatePercent >= 80)) {
      return { grade: 'B', label: 'Good', color: '#ffc107' };
    } else {
      return { grade: 'C', label: 'Needs Improvement', color: '#dc3545' };
    }
  }

  /**
   * Get total number of shipments from supplier
   * Returns warehouse shipments (stored/received/inspection_passed)
   */
  static getTotalShipments(shipments, supplierName) {
    const supplierShipments = this.getSupplierShipments(shipments, supplierName);
    const warehouseShipments = supplierShipments.filter(s => {
      const isInWarehouse = [
        ShipmentStatus.STORED,
        ShipmentStatus.RECEIVED,
        ShipmentStatus.INSPECTION_PASSED,
        'stored',
        'received',
        'inspection_passed'
      ].includes(s.latestStatus);
      return isInWarehouse;
    });
    return warehouseShipments.length;
  }

  /**
   * Helper: Check if shipment was on time
   * Only considers warehouse shipments (stored/received/inspection_passed)
   */
  static isShipmentOnTime(shipment) {
    // Only count warehouse shipments
    const isInWarehouse = [
      ShipmentStatus.STORED,
      ShipmentStatus.RECEIVED,
      ShipmentStatus.INSPECTION_PASSED,
      'stored',
      'received',
      'inspection_passed'
    ].includes(shipment.latestStatus);

    if (!isInWarehouse) return false;

    const arrivedDate = this.getActualArrivalDate(shipment) || shipment.updatedAt;
    if (!arrivedDate || !shipment.weekNumber) return true;

    const scheduledDate = this.getScheduledDate(shipment);
    return new Date(arrivedDate) <= new Date(scheduledDate);
  }

  /**
   * Helper: Estimate date from week number.
   * Anchors to referenceDate's year (defaulting to now) rather than always
   * using the current year, so old shipments don't get mapped to a
   * scheduled date in the wrong year once viewed in a later calendar year.
   */
  static estimateDateFromWeek(weekNumber, referenceDate) {
    const year = (referenceDate ? new Date(referenceDate) : new Date()).getFullYear();
    const simple = new Date(year, 0, 1 + (weekNumber - 1) * 7);
    return simple.toISOString().split('T')[0];
  }

  /**
   * Helper: Get week key for grouping
   */
  static getWeekKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const week = this.getWeekNumber(d);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  /**
   * Helper: Get ISO week number
   */
  static getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Calculate all metrics for a supplier
   */
  static calculateAllMetrics(shipments, supplierName) {
    const onTimePercent = this.calculateOnTimeDelivery(shipments, supplierName);
    const passRatePercent = this.calculateInspectionPassRate(shipments, supplierName);
    const avgLeadTime = this.calculateAverageLeadTime(shipments, supplierName);
    const totalShipments = this.getTotalShipments(shipments, supplierName);
    const trend = this.calculateMetricTrend(shipments, supplierName, 'onTime');
    const grade = this.getSupplierGrade(onTimePercent, passRatePercent);

    return {
      supplierName,
      onTimePercent,
      passRatePercent,
      avgLeadTime,
      totalShipments,
      trend,
      grade
    };
  }
}
