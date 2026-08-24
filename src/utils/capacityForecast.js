/**
 * Warehouse Capacity Forecasting
 * Calculates 8-week bin usage predictions based on incoming shipments
 */

export class CapacityForecast {
  // Standard bin counts per warehouse
  static WAREHOUSE_CAPACITY = {
    'PRETORIA': 650,
    'KLAPMUTS': 384,
    'OFFSITE': 384
  };

  // Bins per pallet assumption (if pallet qty not specified, estimate)
  static BINS_PER_PALLET = 1;

  /**
   * Calculate current week number
   */
  static getCurrentWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.floor(diff / oneWeek) + 1;
  }

  /**
   * Get incoming pallets for a warehouse for a specific week
   */
  static getIncomingPalletsForWeek(shipments, warehouse, weekNumber) {
    return shipments
      .filter(s => {
        // Include only shipments that will arrive in this week
        const shipmentWeek = parseInt(s.weekNumber) || 0;
        const isForThisWeek = shipmentWeek === weekNumber;
        const isForThisWarehouse = s.receivingWarehouse === warehouse;
        const isPlanned = ['planned_airfreight', 'planned_seafreight', 'in_transit_airfreight', 'in_transit_seaway', 'in_transit_roadway', 'in_transit_last_mile', 'moored', 'berth_working', 'berth_complete', 'gated_in_port'].includes(s.latestStatus);

        return isForThisWeek && isForThisWarehouse && isPlanned;
      })
      .reduce((sum, s) => {
        const pallets = s.palletQty || 1;
        return sum + pallets;
      }, 0);
  }

  /**
   * Calculate bins used based on pallets
   * Assumption: 1 pallet = 1 bin
   */
  static calculateBinsFromPallets(pallets) {
    return Math.ceil(pallets * this.BINS_PER_PALLET);
  }

  /**
   * Generate 8-week capacity forecast
   * Returns array of forecasts with alerts and recommendations
   */
  static generateForecast(shipments, currentBinsUsed, warehouseCapacities = this.WAREHOUSE_CAPACITY) {
    const currentWeek = this.getCurrentWeekNumber();
    const forecast = [];

    // Week 0 = current week
    for (let weekOffset = 0; weekOffset <= 8; weekOffset++) {
      const forecastWeek = currentWeek + weekOffset;
      const forecastWithWeek = {
        weekOffset,
        weekNumber: forecastWeek,
        label: weekOffset === 0 ? 'Now' : `+${weekOffset}w`,
        warehouses: {},
        totalAlert: 'ok',
        recommendation: null
      };

      // Calculate for each warehouse
      Object.keys(warehouseCapacities).forEach(warehouse => {
        const incomingPallets = this.getIncomingPalletsForWeek(shipments, warehouse, forecastWeek);
        const incomingBins = this.calculateBinsFromPallets(incomingPallets);

        // Estimate bins used in this week
        // For current week, use actual current bins; for future weeks, estimate decay
        let estimatedBinsUsed;
        if (weekOffset === 0) {
          estimatedBinsUsed = currentBinsUsed[warehouse] || 0;
        } else {
          // Assume some items leave warehouse each week (50% reduction of old stock per month)
          estimatedBinsUsed = Math.max(0, (currentBinsUsed[warehouse] || 0) - (incomingBins * 0.3));
        }

        const projectedBinsUsed = Math.round(estimatedBinsUsed + incomingBins);
        const capacity = warehouseCapacities[warehouse] || this.WAREHOUSE_CAPACITY[warehouse] || 0;
        const percentUsed = capacity > 0 ? Math.round((projectedBinsUsed / capacity) * 100) : 0;

        // Determine alert level
        let alert = 'ok';
        if (capacity === 0 && projectedBinsUsed > 0) {
          alert = 'overflow';
          forecastWithWeek.totalAlert = 'overflow';
        } else if (percentUsed > 100) {
          alert = 'overflow';
          forecastWithWeek.totalAlert = 'overflow';
        } else if (percentUsed >= 95) {
          alert = 'critical';
          if (forecastWithWeek.totalAlert !== 'overflow') {
            forecastWithWeek.totalAlert = 'critical';
          }
        } else if (percentUsed >= 80) {
          alert = 'warning';
          if (forecastWithWeek.totalAlert === 'ok') {
            forecastWithWeek.totalAlert = 'warning';
          }
        }

        forecastWithWeek.warehouses[warehouse] = {
          projectedBinsUsed,
          capacity,
          percentUsed,
          incomingBins,
          alert
        };
      });

      // Generate recommendations
      forecastWithWeek.recommendation = this.generateRecommendation(
        forecastWithWeek.warehouses,
        weekOffset
      );

      forecast.push(forecastWithWeek);
    }

    return forecast;
  }

  /**
   * Generate smart recommendations based on forecast
   * Checks all warehouses for alerts and provides recommendations
   */
  static generateRecommendation(warehouseData, _weekOffset) {
    const pretoriaData = warehouseData['PRETORIA'];
    const klapmutsData = warehouseData['KLAPMUTS'];
    const offsiteData = warehouseData['OFFSITE'];

    if (!pretoriaData && !klapmutsData && !offsiteData) return null;

    // PRETORIA overflow check
    if (pretoriaData && pretoriaData.alert === 'overflow') {
      const overflow = pretoriaData.projectedBinsUsed - pretoriaData.capacity;
      return {
        type: 'overflow',
        severity: 'critical',
        message: `⚠️ OVERFLOW: PRETORIA will exceed capacity by ${overflow} bins. Urgent action needed!`
      };
    }

    // KLAPMUTS overflow check
    if (klapmutsData && klapmutsData.alert === 'overflow') {
      const overflow = klapmutsData.projectedBinsUsed - klapmutsData.capacity;
      return {
        type: 'overflow',
        severity: 'critical',
        message: `⚠️ OVERFLOW: KLAPMUTS will exceed capacity by ${overflow} bins. Urgent action needed!`
      };
    }

    // OFFSITE overflow check
    if (offsiteData && offsiteData.alert === 'overflow') {
      const overflow = offsiteData.projectedBinsUsed - offsiteData.capacity;
      return {
        type: 'overflow',
        severity: 'critical',
        message: `⚠️ OVERFLOW: OFFSITE will exceed capacity by ${overflow} bins. Urgent action needed!`
      };
    }

    // PRETORIA critical check with redistribution suggestions
    if (pretoriaData && pretoriaData.alert === 'critical') {
      const availableBins = pretoriaData.capacity - pretoriaData.projectedBinsUsed;

      // Try to redistribute to KLAPMUTS
      if (klapmutsData && klapmutsData.percentUsed < 80) {
        const canMove = Math.min(availableBins + 50, klapmutsData.capacity - klapmutsData.projectedBinsUsed);
        return {
          type: 'redistribute',
          severity: 'warning',
          message: `🔴 CRITICAL: Move ~${Math.round(canMove / 1.5)} pallets from PRETORIA to KLAPMUTS`,
          action: `Reduces PRETORIA to ${Math.round((pretoriaData.projectedBinsUsed - canMove) / pretoriaData.capacity * 100)}%`
        };
      }

      // Try to redistribute to OFFSITE
      if (offsiteData && offsiteData.percentUsed < 80) {
        const canMove = Math.min(availableBins + 50, offsiteData.capacity - offsiteData.projectedBinsUsed);
        return {
          type: 'redistribute',
          severity: 'warning',
          message: `🔴 CRITICAL: Move ~${Math.round(canMove / 1.5)} pallets from PRETORIA to OFFSITE`,
          action: `Reduces PRETORIA to ${Math.round((pretoriaData.projectedBinsUsed - canMove) / pretoriaData.capacity * 100)}%`
        };
      }

      return {
        type: 'critical',
        severity: 'warning',
        message: `🔴 CRITICAL: PRETORIA at ${pretoriaData.percentUsed}% capacity`
      };
    }

    // KLAPMUTS critical check with redistribution suggestions
    if (klapmutsData && klapmutsData.alert === 'critical') {
      const availableBins = klapmutsData.capacity - klapmutsData.projectedBinsUsed;

      // Try to redistribute to OFFSITE
      if (offsiteData && offsiteData.percentUsed < 80) {
        const canMove = Math.min(availableBins + 30, offsiteData.capacity - offsiteData.projectedBinsUsed);
        return {
          type: 'redistribute',
          severity: 'warning',
          message: `🔴 CRITICAL: Move ~${Math.round(canMove / 1.5)} pallets from KLAPMUTS to OFFSITE`,
          action: `Reduces KLAPMUTS to ${Math.round((klapmutsData.projectedBinsUsed - canMove) / klapmutsData.capacity * 100)}%`
        };
      }

      return {
        type: 'critical',
        severity: 'warning',
        message: `🔴 CRITICAL: KLAPMUTS at ${klapmutsData.percentUsed}% capacity`
      };
    }

    // OFFSITE critical check
    if (offsiteData && offsiteData.alert === 'critical') {
      return {
        type: 'critical',
        severity: 'warning',
        message: `🔴 CRITICAL: OFFSITE at ${offsiteData.percentUsed}% capacity`
      };
    }

    // PRETORIA warning check
    if (pretoriaData && pretoriaData.alert === 'warning') {
      return {
        type: 'warning',
        severity: 'info',
        message: `⚠️ WARNING: PRETORIA approaching capacity (${pretoriaData.percentUsed}%)`
      };
    }

    // KLAPMUTS warning check
    if (klapmutsData && klapmutsData.alert === 'warning') {
      return {
        type: 'warning',
        severity: 'info',
        message: `⚠️ WARNING: KLAPMUTS approaching capacity (${klapmutsData.percentUsed}%)`
      };
    }

    // OFFSITE warning check
    if (offsiteData && offsiteData.alert === 'warning') {
      return {
        type: 'warning',
        severity: 'info',
        message: `⚠️ WARNING: OFFSITE approaching capacity (${offsiteData.percentUsed}%)`
      };
    }

    return null;
  }

  /**
   * Get alert color for display
   */
  static getAlertColor(alert) {
    switch (alert) {
      case 'overflow':
        return '#dc3545'; // Red
      case 'critical':
        return '#fd7e14'; // Orange
      case 'warning':
        return '#ffc107'; // Yellow
      default:
        return '#28a745'; // Green
    }
  }

  /**
   * Get alert label
   */
  static getAlertLabel(alert) {
    switch (alert) {
      case 'overflow':
        return '🔴 OVERFLOW';
      case 'critical':
        return '🔴 CRITICAL';
      case 'warning':
        return '🟡 WARNING';
      default:
        return '🟢 OK';
    }
  }
}
