/**
 * Costing Controller
 * Business logic for import cost estimates
 */

import { costingRepository, ImportCostEstimate } from '../db/repositories/CostingRepository.js';
import ExchangeRateService from '../services/ExchangeRateService.js';

export interface CostingFilterParams {
  status?: string;
  supplierId?: string;
  shipmentId?: string;
  direction?: string;
  page?: number;
  limit?: number;
}

export interface CalculatedTotals {
  total_gross_weight_kg: number;
  customs_value_zar: number;
  ocean_freight_zar: number;
  total_ocean_freight_zar: number;
  origin_charge_zar: number;
  total_origin_charges_zar: number;
  local_charges_subtotal_zar: number;
  destination_charges_subtotal_zar: number;
  warehouse_handling_fee_zar?: number;
  warehouse_storage_fee_zar?: number;
  warehouse_charges_subtotal_zar?: number;
  agency_fee_zar: number;
  customs_subtotal_zar: number;
  total_shipping_cost_zar: number;
  total_in_warehouse_cost_zar: number;
  total_landed_cost_zar: number;
  all_in_warehouse_cost_per_kg_zar: number;
  overhead_cost_per_kg_zar: number;
}

export class CostingController {
  /**
   * Get all cost estimates with pagination
   */
  static async getCostEstimates(params: CostingFilterParams) {
    const { data, total } = await costingRepository.findAll({
      status: params.status,
      supplierId: params.supplierId,
      shipmentId: params.shipmentId,
      direction: params.direction,
      page: params.page,
      limit: params.limit,
    });

    return {
      data,
      pagination: {
        page: params.page || 1,
        limit: params.limit || 20,
        total,
        pages: Math.ceil(total / (params.limit || 20)),
      },
    };
  }

  /**
   * Get a single cost estimate
   */
  static async getCostEstimate(id: string): Promise<ImportCostEstimate | null> {
    return costingRepository.findById(id);
  }

  /**
   * Get cost estimates for a shipment
   */
  static async getByShipment(shipmentId: string): Promise<ImportCostEstimate[]> {
    return costingRepository.findByShipmentId(shipmentId);
  }

  /**
   * Create a new cost estimate with auto-calculations
   */
  static async createCostEstimate(data: Partial<ImportCostEstimate>): Promise<ImportCostEstimate> {
    // Calculate all derived values
    const calculatedData = this.calculateAllTotals(data);
    const mergedData = { ...data, ...calculatedData };

    return costingRepository.create(mergedData);
  }

  /**
   * Update a cost estimate with auto-calculations
   */
  static async updateCostEstimate(id: string, data: Partial<ImportCostEstimate>): Promise<ImportCostEstimate> {
    // Get existing data
    const existing = await costingRepository.findById(id);
    if (!existing) {
      throw new Error('Cost estimate not found');
    }

    // Merge and recalculate
    const merged = { ...existing, ...data };
    const calculatedData = this.calculateAllTotals(merged);
    const finalData = { ...data, ...calculatedData };

    return costingRepository.update(id, finalData);
  }

  /**
   * Delete a cost estimate
   */
  static async deleteCostEstimate(id: string): Promise<boolean> {
    return costingRepository.delete(id);
  }

  /**
   * Duplicate a cost estimate
   */
  static async duplicateCostEstimate(id: string): Promise<ImportCostEstimate> {
    return costingRepository.duplicate(id);
  }

  /**
   * Link cost estimate to a shipment
   */
  static async linkToShipment(id: string, shipmentId: string): Promise<ImportCostEstimate> {
    return costingRepository.linkToShipment(id, shipmentId);
  }

  /**
   * Unlink cost estimate from shipment
   */
  static async unlinkFromShipment(id: string): Promise<ImportCostEstimate> {
    return costingRepository.unlinkFromShipment(id);
  }

  /**
   * Get current exchange rate
   */
  static async getExchangeRate() {
    return ExchangeRateService.getCurrentRate();
  }

  /**
   * Set manual exchange rate
   */
  static async setManualExchangeRate(rate: number) {
    return ExchangeRateService.setManualRate(rate);
  }

  /**
   * Refresh exchange rate from API
   */
  static async refreshExchangeRate() {
    return ExchangeRateService.refreshRate();
  }

  /**
   * Calculate agency fee: 3.5% of duties + import VAT, minimum R1187
   */
  static calculateAgencyFee(dutiesAndVat: number, minimum = 1187): number {
    if (!dutiesAndVat || dutiesAndVat <= 0) return minimum;
    const percentage = dutiesAndVat * 0.035;
    return Math.max(percentage, minimum);
  }

  /**
   * Calculate Customs Value from invoice values
   */
  static calculateCustomsValue(data: Partial<ImportCostEstimate>): number {
    const roeOrigin = Number(data.roe_origin) || Number(data.roe_customs) || 0;
    const roeEur = Number(data.roe_eur) || 0;
    const invoiceValueUsd = Number(data.invoice_value_usd) || 0;
    const invoiceValueEur = Number(data.invoice_value_eur) || 0;
    return (invoiceValueUsd * roeOrigin) + (invoiceValueEur * roeEur);
  }

  static getProducts(data: Partial<ImportCostEstimate>): any[] {
    if (Array.isArray(data.products)) return data.products;
    if (typeof data.products === 'string') {
      try {
        const parsed = JSON.parse(data.products);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  static calculateCustomsItemsTotals(data: Partial<ImportCostEstimate>): {
    totalCustomsValue: number;
    totalDuties: number;
    totalSchedule1Duty: number;
    totalVat: number;
    totalWeight: number;
  } {
    const products = this.getProducts(data);
    const roeCustoms = Number(data.roe_customs) || Number(data.roe_origin) || 0;
    const roeEur = Number(data.roe_eur) || roeCustoms;

    return products.reduce((totals, product) => {
      const invoiceValue = Number(product.invoice_value) || 0;
      const currency = product.currency || 'USD';
      const dutyPercent = Number(product.duty_percent) || 0;
      const schedule1Percent = Number(product.duty_schedule1_percent) || 0;
      let roe = roeCustoms;
      if (currency === 'EUR') roe = roeEur;
      if (currency === 'ZAR') roe = 1;

      const customsValue = invoiceValue * roe;
      const duties = customsValue * (dutyPercent / 100);
      const schedule1Duty = customsValue * (schedule1Percent / 100);
      const vat = (customsValue + duties + schedule1Duty) * 0.15;

      return {
        totalCustomsValue: totals.totalCustomsValue + customsValue,
        totalDuties: totals.totalDuties + duties,
        totalSchedule1Duty: totals.totalSchedule1Duty + schedule1Duty,
        totalVat: totals.totalVat + vat,
        totalWeight: totals.totalWeight + (Number(product.weight_kg) || 0),
      };
    }, {
      totalCustomsValue: 0,
      totalDuties: 0,
      totalSchedule1Duty: 0,
      totalVat: 0,
      totalWeight: 0,
    });
  }

  /**
   * Calculate all totals based on input values
   */
  static calculateAllTotals(data: Partial<ImportCostEstimate>): CalculatedTotals {
    const roeOrigin = Number(data.roe_origin) || Number(data.roe_customs) || 0;
    const roeEur = Number(data.roe_eur) || 0;
    const originChargeUsd = Number(data.origin_charge_usd) || 0;
    const originChargeEur = Number(data.origin_charge_eur) || 0;
    const oceanFreightUsd = Number(data.ocean_freight_usd) || 0;
    const oceanFreightEur = Number(data.ocean_freight_eur) || 0;
    const customsItemsTotals = this.calculateCustomsItemsTotals(data);
    const totalGrossWeightKg = customsItemsTotals.totalWeight > 0
      ? customsItemsTotals.totalWeight
      : Number(data.total_gross_weight_kg) || 0;
    const warehouseChargeableWeightKg = Number((data as any).warehouse_chargeable_weight_kg) || totalGrossWeightKg;
    const warehouseHandlingFeeZar = warehouseChargeableWeightKg
      * (Number((data as any).warehouse_handling_rate_per_kg_zar) || 0)
      * (Number((data as any).warehouse_handling_events) || 0);
    const warehouseStorageFeeZar = warehouseChargeableWeightKg
      * (Number((data as any).warehouse_storage_rate_per_kg_month_zar) || 0)
      * (Number((data as any).warehouse_storage_months) || 0);
    const warehouseChargesSubtotalZar = warehouseHandlingFeeZar + warehouseStorageFeeZar;

    // Calculate customs value from product rows first, then legacy invoice fields.
    const customsValueZar = customsItemsTotals.totalCustomsValue > 0
      ? customsItemsTotals.totalCustomsValue
      : this.calculateCustomsValue(data);

    // Ocean freight conversion (USD and EUR)
    const oceanFreightUsdZar = oceanFreightUsd * roeOrigin;
    const oceanFreightEurZar = oceanFreightEur * roeEur;
    const oceanFreightZar = oceanFreightUsdZar + oceanFreightEurZar;

    // Origin charges conversion (USD and EUR)
    const originChargeUsdZar = originChargeUsd * roeOrigin;
    const originChargeEurZar = originChargeEur * roeEur;
    const originChargeZar = originChargeUsdZar + originChargeEurZar;
    const totalOriginChargesZar = originChargeZar;
    const incoTermsUpper = (data.inco_terms || '').toUpperCase();
    const originChargesAreFobValue = ['FOB', 'FCA', 'EXW'].includes(incoTermsUpper);

    // Local charges subtotal (Transport/Cartage)
    const localChargesSubtotalZar =
      (Number(data.local_cartage_cpt_klapmuts_20ton_zar) || 0) +
      (Number(data.local_cartage_cpt_klapmuts_28ton_zar) || 0) +
      (Number(data.transport_dbn_to_pretoria_20ft_zar) || 0) +
      (Number(data.transport_dbn_to_pretoria_40ft_zar) || 0) +
      (Number(data.transport_dbn_to_whs_zar) || 0) +
      (Number(data.unpack_reload_zar) || 0) +
      (Number(data.storage_zar) || 0) +
      (Number(data.outlying_depot_surcharge_zar) || 0) +
      (Number(data.local_cartage_dbn_whs_pretoria_opt_a_zar) || 0) +
      (Number(data.local_cartage_dbn_whs_pretoria_opt_b_zar) || 0) +
      (Number(data.local_cartage_dbn_whs_pretoria_6m_zar) || 0) +
      (Number(data.local_cartage_dbn_whs_pretoria_12m_zar) || 0) +
      (Number(data.transport_pe_coega_to_pretoria_zar) || 0) +
      (Number(data.transport_plz_to_east_london_zar) || 0) +
      warehouseChargesSubtotalZar;

    // Destination charges subtotal (Port/Shipping)
    const destinationChargesSubtotalZar =
      (Number(data.shipping_line_charges_zar) || 0) +
      (Number(data.cargo_dues_20ft_zar) || 0) +
      (Number(data.cargo_dues_40ft_zar) || 0) +
      (Number(data.cto_fee_zar) || 0) +
      (Number(data.port_health_inspection_zar) || 0) +
      (Number(data.daff_inspection_zar) || 0) +
      (Number(data.state_vet_cancellation_fee_zar) || 0) +
      (Number(data.jnb_turn_in_zar) || 0) +
      (Number(data.plz_turn_in_zar) || 0) +
      (Number(data.bill_of_lading_fee_zar) || 0) +
      (Number(data.manifest_filing_zar) || 0) +
      (Number(data.currency_adjustment_factor_zar) || 0) +
      (Number(data.degrouping_zar) || 0) +
      (Number(data.edi_fee_zar) || 0) +
      (Number(data.communication_dest_zar) || 0) +
      (Number(data.documentation_fee_dest_zar) || 0) +
      (Number(data.cfs_lcl_handling_out_zar) || 0) +
      (Number(data.delivery_release_order_zar) || 0) +
      (Number(data.cartage_dest_zar) || 0) +
      (Number(data.fuel_surcharge_dest_zar) || 0) +
      (Number(data.agency_fee_dest_zar) || 0) +
      (Number((data as any).handover_fee_zar) || 0) +
      (Number(data.facility_fee_zar) || 0);

    // Agency fee: 3.5% of duties + VAT, min R1187.
    const dutiesAndVat = customsItemsTotals.totalDuties + customsItemsTotals.totalSchedule1Duty + customsItemsTotals.totalVat;
    const agencyFeeZar = this.calculateAgencyFee(dutiesAndVat, Number((data as any).agency_fee_min) || 1187);

    // Customs subtotal (duties + declaration + agency). Import VAT is excluded
    // from client-facing landed cost.
    const customsDutyNotApplicable = data.customs_duty_not_applicable || false;
    const calculatedDutiesZar = customsItemsTotals.totalDuties + customsItemsTotals.totalSchedule1Duty;
    const dutiesZar = customsDutyNotApplicable ? 0 : (calculatedDutiesZar || Number(data.duties_zar) || 0);
    const customsSubtotalZar =
      dutiesZar +
      (Number(data.customs_declaration_zar) || 0) +
      agencyFeeZar;

    // Under FOB/FCA/EXW, origin charges hold the FOB goods value. That is part
    // of customs/product value, not a transport charge, so it must not inflate
    // total shipping cost.
    const transportOriginChargesZar = originChargesAreFobValue ? 0 : totalOriginChargesZar;
    const totalShippingCostZar = oceanFreightZar + transportOriginChargesZar + localChargesSubtotalZar + destinationChargesSubtotalZar;
    const freightIncludedInProductPrice = ['CIF', 'CIP', 'CFR'].includes(incoTermsUpper);
    const shippingToAllocateZar = freightIncludedInProductPrice
      ? localChargesSubtotalZar + destinationChargesSubtotalZar
      : totalShippingCostZar;

    // Total in warehouse cost (transport/customs overhead only)
    const totalInWarehouseCostZar = shippingToAllocateZar + customsSubtotalZar;

    // Total landed cost (product value + duties + transport)
    const totalLandedCostZar = customsValueZar + dutiesZar + shippingToAllocateZar;

    // Cost per KG
    const allInWarehouseCostPerKgZar = totalGrossWeightKg > 0
      ? totalLandedCostZar / totalGrossWeightKg
      : 0;
    const overheadCostPerKgZar = totalGrossWeightKg > 0
      ? totalInWarehouseCostZar / totalGrossWeightKg
      : 0;

    return {
      total_gross_weight_kg: Math.round(totalGrossWeightKg * 100) / 100,
      customs_value_zar: Math.round(customsValueZar * 100) / 100,
      ocean_freight_zar: Math.round(oceanFreightZar * 100) / 100,
      total_ocean_freight_zar: Math.round(oceanFreightZar * 100) / 100,
      origin_charge_zar: Math.round(originChargeZar * 100) / 100,
      total_origin_charges_zar: Math.round(totalOriginChargesZar * 100) / 100,
      local_charges_subtotal_zar: Math.round(localChargesSubtotalZar * 100) / 100,
      destination_charges_subtotal_zar: Math.round(destinationChargesSubtotalZar * 100) / 100,
      warehouse_handling_fee_zar: Math.round(warehouseHandlingFeeZar * 100) / 100,
      warehouse_storage_fee_zar: Math.round(warehouseStorageFeeZar * 100) / 100,
      warehouse_charges_subtotal_zar: Math.round(warehouseChargesSubtotalZar * 100) / 100,
      agency_fee_zar: Math.round(agencyFeeZar * 100) / 100,
      customs_subtotal_zar: Math.round(customsSubtotalZar * 100) / 100,
      total_shipping_cost_zar: Math.round(totalShippingCostZar * 100) / 100,
      total_in_warehouse_cost_zar: Math.round(totalInWarehouseCostZar * 100) / 100,
      total_landed_cost_zar: Math.round(totalLandedCostZar * 100) / 100,
      all_in_warehouse_cost_per_kg_zar: Math.round(allInWarehouseCostPerKgZar * 100) / 100,
      overhead_cost_per_kg_zar: Math.round(overheadCostPerKgZar * 100) / 100,
    };
  }
}

export default CostingController;
