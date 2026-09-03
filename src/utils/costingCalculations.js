/**
 * Costing Calculations Utility
 * Frontend calculations for import cost estimates
 */

/**
 * Default constants for costing calculations.
 * Exported so they can be referenced or overridden elsewhere.
 */
export const COSTING_DEFAULTS = {
  DAVIF_PERCENT: 0.0325,       // 3.25% of customs value
  DAVIF_MINIMUM_ZAR: 125,      // Minimum DAVIF charge in ZAR
  AGENCY_FEE_PERCENT: 3.5,     // Agency fee as % of (duties + import VAT)
  AGENCY_FEE_MINIMUM_ZAR: 1187,// Minimum agency fee in ZAR
  VAT_RATE: 0.15,              // South African import VAT (15%)
};

export const LAST_MILE_SERVICE_TYPES = [
  { value: 'express_air', label: 'Express Air - next day by 11:00' },
  { value: 'overnight_air', label: 'Overnight Air' },
  { value: 'express_road', label: 'Express Road - next day by 14:00' },
  { value: 'local_regional', label: 'Local / Outlying / Regional' },
  { value: 'economy_road', label: 'Economy Road - 48/72 hour' },
  { value: 'manual', label: 'Manual last mile charge' },
];

export const LAST_MILE_RATES = {
  express_air: [
    { value: 'klapmuts-jhb-dbn', label: 'Klapmuts to Johannesburg / Durban', minimum: 850, rate: 40 },
    { value: 'klapmuts-el-bfn-grj-plz', label: 'Klapmuts to East London / Bloem / George / Gqeberha', minimum: 850, rate: 55 },
    { value: 'klapmuts-umt-kim', label: 'Klapmuts to Umtata / Kimberley', minimum: 850, rate: 60 },
    { value: 'durban-cpt-jhb', label: 'Durban to Cape Town / Johannesburg', minimum: 820, rate: 40 },
    { value: 'durban-el-bfn-grj-plz', label: 'Durban to East London / Bloem / George / Gqeberha', minimum: 820, rate: 55 },
    { value: 'durban-umt-kim', label: 'Durban to Umtata / Kimberley', minimum: 820, rate: 60 },
    { value: 'hermanstad-cpt-dbn', label: 'Hermanstad to Cape Town / Durban', minimum: 880, rate: 40 },
    { value: 'hermanstad-el-bfn-grj-plz', label: 'Hermanstad to East London / Bloem / George / Gqeberha', minimum: 880, rate: 55 },
    { value: 'hermanstad-umt-kim', label: 'Hermanstad to Umtata / Kimberley', minimum: 880, rate: 60 },
    { value: 'dbn-airport-spring-meadow', label: 'DBN Airport to Spring Meadow', minimum: 950, rate: 0, flat: true },
    { value: 'plz-airport-humansdorp', label: 'PLZ Airport to Humansdorp', minimum: 1560, rate: 0, flat: true },
  ],
  overnight_air: [
    { value: 'klapmuts-jhb-dbn', label: 'Klapmuts to Johannesburg / Durban', minimum: 850, rate: 65 },
    { value: 'klapmuts-el-bfn-grj-plz', label: 'Klapmuts to East London / Bloem / George / Gqeberha', minimum: 850, rate: 70 },
    { value: 'klapmuts-umt-kim', label: 'Klapmuts to Umtata / Kimberley', minimum: 850, rate: 100 },
    { value: 'durban-cpt-jhb', label: 'Durban to Cape Town / Johannesburg', minimum: 820, rate: 55 },
    { value: 'durban-el-bfn-grj-plz', label: 'Durban to East London / Bloem / George / Gqeberha', minimum: 820, rate: 65 },
    { value: 'durban-umt-kim', label: 'Durban to Umtata / Kimberley', minimum: 820, rate: 100 },
    { value: 'hermanstad-cpt-dbn', label: 'Hermanstad to Cape Town / Durban', minimum: 880, rate: 65 },
    { value: 'hermanstad-el-bfn-grj-plz', label: 'Hermanstad to East London / Bloem / George / Gqeberha', minimum: 880, rate: 70 },
    { value: 'hermanstad-umt-kim', label: 'Hermanstad to Umtata / Kimberley', minimum: 880, rate: 100 },
  ],
  express_road: [
    { value: 'klapmuts-gqeberha-george', label: 'Klapmuts to Gqeberha / George', minimum: 680, rate: 8.5 },
    { value: 'klapmuts-bloemfontein', label: 'Klapmuts to Bloemfontein', minimum: 730, rate: 14.5 },
    { value: 'klapmuts-hermanstad-pta', label: 'Klapmuts to Hermanstad / PTA', minimum: 820, rate: 16 },
    { value: 'klapmuts-johannesburg', label: 'Klapmuts to Johannesburg', minimum: 780, rate: 15.5 },
    { value: 'klapmuts-johannesburg-outlying', label: 'Klapmuts to Johannesburg outlying', minimum: 950, rate: 16.5 },
    { value: 'durban-johannesburg', label: 'Durban to Johannesburg', minimum: 750, rate: 8.5 },
    { value: 'hermanstad-bloemfontein', label: 'Hermanstad to Bloemfontein', minimum: 680, rate: 5.8 },
    { value: 'hermanstad-cape-town', label: 'Hermanstad to Cape Town', minimum: 800, rate: 15.5 },
    { value: 'hermanstad-cape-town-outlying', label: 'Hermanstad to Cape Town outlying', minimum: 950, rate: 16.5 },
    { value: 'hermanstad-durban', label: 'Hermanstad to Durban', minimum: 680, rate: 8.5 },
  ],
  local_regional: [
    { value: 'klapmuts-local-50', label: 'Klapmuts local within 50 km', minimum: 600, rate: 0.85, rate900: 0.75, rate3000: 0.7 },
    { value: 'klapmuts-outlying-100', label: 'Klapmuts outlying within 100 km', minimum: 700, rate: 2, rate900: 1.5, rate3000: 1 },
    { value: 'klapmuts-outlying-200', label: 'Klapmuts outlying within 200 km', minimum: 800, rate: 3, rate900: 2.7, rate3000: 2.3 },
    { value: 'klapmuts-regional-300', label: 'Klapmuts regional max 300 km', minimum: 900, rate: 4, rate900: 3.35, rate3000: 3 },
    { value: 'durban-local-50', label: 'Durban local within 50 km', minimum: 580, rate: 2.1, rate900: 1.8, rate3000: 1.5 },
    { value: 'durban-outlying-100', label: 'Durban outlying within 100 km', minimum: 680, rate: 3, rate900: 2.4, rate3000: 2.1 },
    { value: 'durban-regional-300', label: 'Durban regional max 300 km', minimum: 880, rate: 4.8, rate900: 3.1, rate3000: 2.9 },
    { value: 'hermanstad-local-50', label: 'Hermanstad local within 50 km', minimum: 600, rate: 0.95, rate900: 0.85, rate3000: 0.75 },
    { value: 'hermanstad-outlying-100', label: 'Hermanstad outlying within 100 km', minimum: 700, rate: 1.95, rate900: 1.6, rate3000: 1.1 },
    { value: 'hermanstad-outlying-200', label: 'Hermanstad outlying within 200 km', minimum: 800, rate: 2.8, rate900: 2.5, rate3000: 2.4 },
    { value: 'hermanstad-regional-300', label: 'Hermanstad regional max 300 km', minimum: 900, rate: 4, rate900: 3.5, rate3000: 3.2 },
  ],
  economy_road: [
    { value: 'klapmuts-bloemfontein', label: 'Klapmuts to Bloemfontein', minimum: 700, rate: 3.2, rate900: 3, rate3000: 2.85 },
    { value: 'klapmuts-durban', label: 'Klapmuts to Durban', minimum: 700, rate: 2.8, rate900: 2.6, rate3000: 2.45 },
    { value: 'klapmuts-east-london-george', label: 'Klapmuts to East London / George', minimum: 700, rate: 3.4, rate900: 3.2, rate3000: 3.05 },
    { value: 'klapmuts-gqeberha', label: 'Klapmuts to Gqeberha (PLZ)', minimum: 700, rate: 2.8, rate900: 2.6, rate3000: 2.45 },
    { value: 'klapmuts-johannesburg', label: 'Klapmuts to Johannesburg', minimum: 700, rate: 2.65, rate900: 2.45, rate3000: 2.35 },
    { value: 'klapmuts-kimberley', label: 'Klapmuts to Kimberley', minimum: 750, rate: 5.1, rate900: 4.75, rate3000: 4.55 },
    { value: 'klapmuts-krugersdorp', label: 'Klapmuts to Krugersdorp', minimum: 800, rate: 3.25, rate900: 3.05, rate3000: 2.95 },
    { value: 'klapmuts-mossel-bay', label: 'Klapmuts to Mossel Bay', minimum: 750, rate: 4.4, rate900: 4.25, rate3000: 4.05 },
    { value: 'klapmuts-pretoria-olifantsfontein', label: 'Klapmuts to Pretoria / Olifantsfontein', minimum: 800, rate: 3.3, rate900: 3.1, rate3000: 2.95 },
    { value: 'durban-klapmuts', label: 'Durban to Klapmuts', minimum: 800, rate: 2.9, rate900: 2.6, rate3000: 2.4 },
    { value: 'durban-johannesburg', label: 'Durban to Johannesburg', minimum: 700, rate: 2, rate900: 1.75, rate3000: 1.7 },
    { value: 'durban-hermanstad', label: 'Durban to Hermanstad', minimum: 800, rate: 2.6, rate900: 2.45, rate3000: 2.25 },
    { value: 'hermanstad-bloemfontein', label: 'Hermanstad to Bloemfontein', minimum: 700, rate: 3, rate900: 2.9, rate3000: 2.8 },
    { value: 'hermanstad-cape-town', label: 'Hermanstad to Cape Town', minimum: 700, rate: 3, rate900: 2.8, rate3000: 2.7 },
    { value: 'hermanstad-durban', label: 'Hermanstad to Durban', minimum: 700, rate: 2.45, rate900: 2.25, rate3000: 2.15 },
    { value: 'hermanstad-east-london', label: 'Hermanstad to East London', minimum: 700, rate: 5.2, rate900: 4.65, rate3000: 4.5 },
    { value: 'hermanstad-gqeberha', label: 'Hermanstad to Gqeberha', minimum: 700, rate: 4.5, rate900: 3.95, rate3000: 3.8 },
  ],
};

export const getLastMileRouteOptions = (serviceType) => LAST_MILE_RATES[serviceType] || [];

export const getLastMileRate = (serviceType, routeKey) => {
  return getLastMileRouteOptions(serviceType).find(route => route.value === routeKey) || null;
};

const getLastMileRateForWeight = (route, weightKg) => {
  if (!route) return 0;
  if (weightKg >= 3000 && route.rate3000 !== undefined) return route.rate3000;
  if (weightKg >= 900 && route.rate900 !== undefined) return route.rate900;
  return route.rate || 0;
};

export const calculateLastMileCharge = (data, fallbackWeightKg = 0) => {
  const serviceType = data.service_type || data.last_mile_service_type || '';
  const routeKey = data.route || data.last_mile_route;
  const route = getLastMileRate(serviceType, routeKey);
  const enteredWeight = parseFloat(data.weight_kg ?? data.last_mile_weight_kg) || 0;
  const weightKg = enteredWeight > 0 ? enteredWeight : fallbackWeightKg;
  const manualCharge = parseFloat(data.manual_charge_zar ?? data.last_mile_manual_charge_zar) || 0;
  const extraCharges = parseFloat(data.extra_charges_zar ?? data.last_mile_extra_charges_zar) || 0;
  const fuelLevyPercent = parseFloat(data.fuel_levy_percent ?? data.last_mile_fuel_levy_percent) || 0;

  if (manualCharge > 0 || serviceType === 'manual') {
    const fuelLevyZar = manualCharge * (fuelLevyPercent / 100);
    return { route, weight_kg: weightKg, minimum_zar: 0, rate_per_kg_zar: 0, base_charge_zar: manualCharge, fuel_levy_zar: fuelLevyZar, subtotal_zar: manualCharge + fuelLevyZar + extraCharges, is_manual_override: manualCharge > 0 };
  }

  const ratePerKg = getLastMileRateForWeight(route, weightKg);
  const minimum = route?.minimum || 0;
  const baseCharge = route?.flat
    ? minimum
    : route && weightKg > 0
      ? minimum + (Math.max(weightKg - 1, 0) * ratePerKg)
      : 0;
  const fuelLevyZar = baseCharge * (fuelLevyPercent / 100);

  return { route, weight_kg: weightKg, minimum_zar: minimum, rate_per_kg_zar: ratePerKg, base_charge_zar: baseCharge, fuel_levy_zar: fuelLevyZar, subtotal_zar: baseCharge + fuelLevyZar + extraCharges };
};

export const getLastMileChargeItems = (data) => {
  const items = Array.isArray(data.last_mile_charges)
    ? data.last_mile_charges.filter(item =>
        item?.service_type ||
        item?.route ||
        parseFloat(item?.manual_charge_zar) > 0 ||
        parseFloat(item?.extra_charges_zar) > 0
      )
    : [];
  if (items.length > 0) return items;
  if (
    data.last_mile_service_type ||
    data.last_mile_route ||
    parseFloat(data.last_mile_manual_charge_zar) > 0 ||
    parseFloat(data.last_mile_extra_charges_zar) > 0
  ) {
    return [{
      _id: 'legacy-last-mile',
      service_type: data.last_mile_service_type || '',
      route: data.last_mile_route || '',
      weight_kg: data.last_mile_weight_kg || 0,
      fuel_levy_percent: data.last_mile_fuel_levy_percent || 0,
      manual_charge_zar: data.last_mile_manual_charge_zar || 0,
      extra_charges_zar: data.last_mile_extra_charges_zar || 0,
    }];
  }
  return [];
};

export const calculateLastMileCharges = (data, fallbackWeightKg = 0) => {
  const lines = getLastMileChargeItems(data).map(item => ({
    ...item,
    calculated: calculateLastMileCharge(item, fallbackWeightKg),
  }));
  const subtotal_zar = lines.reduce((sum, line) => sum + (line.calculated.subtotal_zar || 0), 0);
  return { lines, subtotal_zar };
};

/**
 * Calculate DAVIF: 3.25% of customs value, minimum R125
 */
export const calculateDAVIF = (customsValue) => {
  if (!customsValue || customsValue <= 0) return 0;
  const percentage = customsValue * COSTING_DEFAULTS.DAVIF_PERCENT;
  return Math.max(percentage, COSTING_DEFAULTS.DAVIF_MINIMUM_ZAR);
};

/**
 * Calculate origin charge in ZAR
 */
export const calculateOriginChargeZAR = (originChargeUSD, roeOrigin) => {
  return (originChargeUSD || 0) * (roeOrigin || 0);
};

/**
 * Calculate local charges (transport/cartage) subtotal
 */
export const calculateLocalChargesSubtotal = (data) => {
  return (
    (parseFloat(data.local_cartage_cpt_klapmuts_20ton_zar) || 0) +
    (parseFloat(data.local_cartage_cpt_klapmuts_28ton_zar) || 0) +
    (parseFloat(data.transport_dbn_to_pretoria_20ft_zar) || 0) +
    (parseFloat(data.transport_dbn_to_pretoria_40ft_zar) || 0) +
    (parseFloat(data.transport_dbn_to_whs_zar) || 0) +
    (parseFloat(data.unpack_reload_zar) || 0) +
    (parseFloat(data.storage_zar) || 0) +
    (parseFloat(data.outlying_depot_surcharge_zar) || 0) +
    (parseFloat(data.local_cartage_dbn_whs_pretoria_opt_a_zar) || 0) +
    (parseFloat(data.local_cartage_dbn_whs_pretoria_opt_b_zar) || 0) +
    (parseFloat(data.local_cartage_dbn_whs_pretoria_6m_zar) || 0) +
    (parseFloat(data.local_cartage_dbn_whs_pretoria_12m_zar) || 0) +
    (parseFloat(data.transport_pe_coega_to_pretoria_zar) || 0) +
    (parseFloat(data.transport_plz_to_east_london_zar) || 0)
  );
};

export const calculateWarehouseCharges = (data, weightKg = 0) => {
  const chargeableWeightKg = parseFloat(data.warehouse_chargeable_weight_kg) || weightKg || 0;
  const handlingRate = parseFloat(data.warehouse_handling_rate_per_kg_zar) || 0;
  const handlingEvents = parseFloat(data.warehouse_handling_events) || 0;
  const storageRate = parseFloat(data.warehouse_storage_rate_per_kg_month_zar) || 0;
  const storageMonths = parseFloat(data.warehouse_storage_months) || 0;
  const handlingFeeZar = chargeableWeightKg * handlingRate * handlingEvents;
  const storageFeeZar = chargeableWeightKg * storageRate * storageMonths;

  return {
    chargeable_weight_kg: chargeableWeightKg,
    handling_fee_zar: handlingFeeZar,
    storage_fee_zar: storageFeeZar,
    subtotal_zar: handlingFeeZar + storageFeeZar,
  };
};

/**
 * Calculate destination charges (port/shipping) subtotal
 */
export const calculateDestinationSubtotal = (data) => {
  return (
    (parseFloat(data.shipping_line_charges_zar) || 0) +
    (parseFloat(data.cargo_dues_20ft_zar) || 0) +
    (parseFloat(data.cargo_dues_40ft_zar) || 0) +
    (parseFloat(data.cto_fee_zar) || 0) +
    (parseFloat(data.port_health_inspection_zar) || 0) +
    (parseFloat(data.daff_inspection_zar) || 0) +
    (parseFloat(data.state_vet_cancellation_fee_zar) || 0) +
    (parseFloat(data.jnb_turn_in_zar) || 0) +
    (parseFloat(data.plz_turn_in_zar) || 0) +
    (parseFloat(data.bill_of_lading_fee_zar) || 0) +
    (parseFloat(data.manifest_filing_zar) || 0) +
    (parseFloat(data.currency_adjustment_factor_zar) || 0) +
    (parseFloat(data.degrouping_zar) || 0) +
    (parseFloat(data.edi_fee_zar) || 0) +
    (parseFloat(data.communication_dest_zar) || 0) +
    (parseFloat(data.documentation_fee_dest_zar) || 0) +
    (parseFloat(data.cfs_lcl_handling_out_zar) || 0) +
    (parseFloat(data.delivery_release_order_zar) || 0) +
    (parseFloat(data.cartage_dest_zar) || 0) +
    (parseFloat(data.fuel_surcharge_dest_zar) || 0) +
    (parseFloat(data.agency_fee_dest_zar) || 0) +
    (parseFloat(data.handover_fee_zar) || 0) +
    (parseFloat(data.facility_fee_zar) || 0)
  );
};

/**
 * Calculate agency fee: 3.5% of (duties + import VAT), minimum R1187
 */
export const calculateAgencyFee = (dutiesAndVat, percentage = COSTING_DEFAULTS.AGENCY_FEE_PERCENT, min = COSTING_DEFAULTS.AGENCY_FEE_MINIMUM_ZAR) => {
  if (!dutiesAndVat || dutiesAndVat <= 0) return min; // Always charge minimum
  const calculated = dutiesAndVat * (percentage / 100);
  return Math.max(calculated, min);
};

/**
 * Calculate customs totals from products
 */
export const calculateCustomsItemsTotals = (data) => {
  const items = data.products || data.customs_items || [];
  const roeCustoms = parseFloat(data.roe_customs) || parseFloat(data.roe_origin) || 0;
  const roeEur = parseFloat(data.roe_eur) || 0;

  let totalCustomsValue = 0;
  let totalDuties = 0;
  let totalSchedule1Duty = 0;
  let totalVat = 0;

  items.forEach(item => {
    const invoiceValue = parseFloat(item.invoice_value) || 0;
    const dutyPercent = parseFloat(item.duty_percent) || 0;
    const dutySchedule1Percent = parseFloat(item.duty_schedule1_percent) || 0;
    const currency = item.currency || 'USD';

    // Convert to ZAR based on currency
    let roe = roeCustoms;
    if (currency === 'EUR') roe = roeEur;
    if (currency === 'ZAR') roe = 1;

    const customsValue = invoiceValue * roe;
    const duties = customsValue * (dutyPercent / 100);
    const schedule1Duty = customsValue * (dutySchedule1Percent / 100);
    const vat = (customsValue + duties + schedule1Duty) * COSTING_DEFAULTS.VAT_RATE;

    totalCustomsValue += customsValue;
    totalDuties += duties;
    totalSchedule1Duty += schedule1Duty;
    totalVat += vat;
  });

  return { totalCustomsValue, totalDuties, totalSchedule1Duty, totalVat };
};

/**
 * Calculate customs subtotal (duties + declaration + agency fee)
 * Note: VAT is excluded as it's not charged to clients
 */
export const calculateCustomsSubtotal = (data, agencyFee) => {
  const customsTotals = calculateCustomsItemsTotals(data);
  return (
    customsTotals.totalDuties +
    customsTotals.totalSchedule1Duty +
    (parseFloat(data.customs_declaration_zar) || 0) +
    (agencyFee || 0)
  );
};

/**
 * Calculate EUR to ZAR conversion
 */
export const calculateEurChargeZAR = (originChargeEur, roeEur) => {
  return (originChargeEur || 0) * (roeEur || 0);
};

/**
 * Calculate Customs Value from invoice values
 */
export const calculateCustomsValue = (data) => {
  const roeOrigin = parseFloat(data.roe_origin) || parseFloat(data.roe_customs) || 0;
  const roeEur = parseFloat(data.roe_eur) || 0;
  const invoiceValueUsd = parseFloat(data.invoice_value_usd) || 0;
  const invoiceValueEur = parseFloat(data.invoice_value_eur) || 0;

  return (invoiceValueUsd * roeOrigin) + (invoiceValueEur * roeEur);
};

/**
 * Calculate airfreight charges subtotal
 */
export const calculateAirfreightChargesSubtotal = (data) => {
  return (
    (parseFloat(data.screening_fee_zar) || 0) +
    (parseFloat(data.awb_fee_zar) || 0) +
    (parseFloat(data.airline_handling_fee_zar) || 0) +
    (parseFloat(data.airport_transfer_fee_zar) || 0) +
    (parseFloat(data.cartage_airport_to_whs_zar) || 0) +
    (parseFloat(data.air_edi_fee_zar) || 0) +
    (parseFloat(data.air_import_documentation_zar) || 0) +
    (parseFloat(data.airline_landside_delivery_zar) || 0)
  );
};

/**
 * Calculate volumetric weight from dimensions
 */
export const calculateVolumetricWeight = (data) => {
  const l = parseFloat(data.dimensions_length_cm) || 0;
  const w = parseFloat(data.dimensions_width_cm) || 0;
  const h = parseFloat(data.dimensions_height_cm) || 0;
  const pieces = parseInt(data.number_of_pieces) || 1;
  const divisor = parseInt(data.volumetric_divisor) || 6000;
  if (l <= 0 || w <= 0 || h <= 0) return 0;
  return (l * w * h * pieces) / divisor;
};

/**
 * Calculate chargeable weight (higher of actual vs volumetric)
 */
export const calculateChargeableWeight = (data) => {
  const actual = parseFloat(data.actual_weight_kg) || 0;
  const volumetric = calculateVolumetricWeight(data);
  return Math.max(actual, volumetric);
};

/**
 * Calculate all totals from form data
 */
export const calculateAllTotals = (data) => {
  const roeOrigin = parseFloat(data.roe_origin) || parseFloat(data.roe_customs) || 0;  // USD/ZAR
  const roeEur = parseFloat(data.roe_eur) || 0;        // EUR/ZAR
  const oceanFreightUsd = parseFloat(data.ocean_freight_usd) || 0;
  const oceanFreightEur = parseFloat(data.ocean_freight_eur) || 0;

  const originChargeUsd = parseFloat(data.origin_charge_usd) || 0;
  const originChargeEur = parseFloat(data.origin_charge_eur) || 0;

  // Under FOB / FCA / EXW, "Origin Charges" represents the FOB value of goods at origin
  // (the customs basis) — NOT a shipping fee. The same value is already captured as
  // Customs Value per product, so it must be excluded from shipping cost totals to
  // avoid double-counting in Total Landed / Cost per kg.
  const incoTermsUpper = (data.inco_terms || '').toUpperCase();
  const originChargesAreFobValue = ['FOB', 'FCA', 'EXW'].includes(incoTermsUpper);

  // Calculate total weight from products or use legacy field
  const productsWeight = (data.products || []).reduce((sum, p) => sum + (parseFloat(p.weight_kg) || 0), 0);
  const totalGrossWeightKg = productsWeight > 0 ? productsWeight : (parseFloat(data.total_gross_weight_kg) || 0);

  // Calculate Customs Value from customs items (new structure) or legacy invoice values
  const customsItemsTotals = calculateCustomsItemsTotals(data);
  const customsValueZar = customsItemsTotals.totalCustomsValue > 0
    ? customsItemsTotals.totalCustomsValue
    : calculateCustomsValue(data);

  // Ocean freight conversion (both USD and EUR)
  const oceanFreightUsdZar = oceanFreightUsd * roeOrigin;
  const oceanFreightEurZar = oceanFreightEur * roeEur;
  const totalOceanFreightZar = oceanFreightUsdZar + oceanFreightEurZar;

  // Origin charges conversion (both USD and EUR)
  const originChargeUsdZar = calculateOriginChargeZAR(originChargeUsd, roeOrigin);
  const originChargeEurZar = calculateEurChargeZAR(originChargeEur, roeEur);
  const totalOriginChargesZar = originChargeUsdZar + originChargeEurZar;

  const isExport = data.direction === 'export';

  // Local charges subtotal (transport/cartage)
  const warehouseCharges = calculateWarehouseCharges(data, totalGrossWeightKg);
  const warehouseChargesSubtotalZar = warehouseCharges.subtotal_zar;
  const localChargesSubtotalZar = calculateLocalChargesSubtotal(data) + warehouseChargesSubtotalZar;

  // Destination charges subtotal (port/shipping)
  // For export, this is replaced by Export Charges (Landside, Declaration, VGM,
  // CTO/Navis, Cargo Dues, Agency Fee, Disbursement Fee).
  const importVatZar = customsItemsTotals.totalVat;
  const totalDutiesAndVat = customsItemsTotals.totalDuties + customsItemsTotals.totalSchedule1Duty + importVatZar;

  const agencyFeePercent = parseFloat(data.agency_fee_percentage) || COSTING_DEFAULTS.AGENCY_FEE_PERCENT;
  const agencyFeeMin = parseFloat(data.agency_fee_min) || COSTING_DEFAULTS.AGENCY_FEE_MINIMUM_ZAR;
  // For export, agency fee falls back to its minimum (no duties to base % on).
  const agencyFeeZar = isExport
    ? (parseFloat(data.agency_fee_zar) || agencyFeeMin)
    : calculateAgencyFee(totalDutiesAndVat, agencyFeePercent, agencyFeeMin);

  const exportChargesSubtotalZar = isExport
    ? (
        // User-entered ZAR items
        (parseFloat(data.export_landside_charges_zar) || 0) +
        (parseFloat(data.export_declaration_zar) || 0) +
        (parseFloat(data.vgm_zar) || 0) +
        (parseFloat(data.cto_navis_fee_zar) || 0) +           // CTO
        (parseFloat(data.navis_gp_zar) || 0) +
        (parseFloat(data.export_cargo_dues_zar) || 0) +
        agencyFeeZar +
        (parseFloat(data.disbursement_fee_zar) || 0) +
        // AQ-1122 additions
        (parseFloat(data.terminal_handling_zar) || 0) +
        (parseFloat(data.carbon_emission_zar) || 0) +
        (parseFloat(data.container_seal_zar) || 0) +
        (parseFloat(data.electronic_release_fee_zar) || 0) +
        (parseFloat(data.merchant_haulage_zar) || 0) +
        (parseFloat(data.navis_release_fee_zar) || 0) +
        (parseFloat(data.document_courier_zar) || 0) +
        (parseFloat(data.courier_fuel_surcharge_zar) || 0) +
        (parseFloat(data.certificate_of_origin_zar) || 0) +
        // USD-quoted items converted via roe_origin
        ((parseFloat(data.ebol_fee_usd) || 0) * roeOrigin) +
        ((parseFloat(data.isps_fee_usd) || 0) * roeOrigin) +
        ((parseFloat(data.telex_release_usd) || 0) * roeOrigin)
      )
    : 0;

  const destinationChargesSubtotalZar = isExport
    ? exportChargesSubtotalZar
    : calculateDestinationSubtotal(data);

  // Customs subtotal: zero for export (no SA customs/duties on outbound).
  const customsSubtotalZar = isExport
    ? 0
    : (customsItemsTotals.totalCustomsValue > 0
        ? (customsItemsTotals.totalDuties + customsItemsTotals.totalSchedule1Duty +
           (parseFloat(data.customs_declaration_zar) || 0) + agencyFeeZar)
        : calculateCustomsSubtotal(data, agencyFeeZar));

  const isAirfreight = (data.transport_mode || 'sea') === 'air';

  // === Airfreight-specific calculations ===
  const volumetricWeightKg = calculateVolumetricWeight(data);
  const chargeableWeightKg = calculateChargeableWeight(data);
  const lastMileWeightFallback = isAirfreight ? chargeableWeightKg : totalGrossWeightKg;
  const lastMile = calculateLastMileCharges(data, lastMileWeightFallback);
  const lastMileChargesSubtotalZar = lastMile.subtotal_zar;

  // Airfreight total (direct USD + EUR amounts)
  const airfreightUsd = parseFloat(data.airfreight_usd) || 0;
  const airfreightEur = parseFloat(data.airfreight_eur) || 0;
  const airfreightTotalUsd = airfreightUsd;
  const airfreightTotalEur = airfreightEur;
  const airfreightTotalZar = (airfreightUsd * roeOrigin) + (airfreightEur * roeEur);

  // Airfreight surcharges (direct USD + EUR amounts)
  const fuelSurchargeUsd = parseFloat(data.fuel_surcharge_usd) || 0;
  const fuelSurchargeEur = parseFloat(data.fuel_surcharge_eur) || 0;
  const fuelSurchargeTotalZar = (fuelSurchargeUsd * roeOrigin) + (fuelSurchargeEur * roeEur);
  const securitySurchargeUsd = parseFloat(data.security_surcharge_usd) || 0;
  const securitySurchargeEur = parseFloat(data.security_surcharge_eur) || 0;
  const securitySurchargeTotalZar = (securitySurchargeUsd * roeOrigin) + (securitySurchargeEur * roeEur);

  // Airfreight origin charges (USD + EUR)
  const airfreightOriginUsd = parseFloat(data.airfreight_origin_charges_usd) || 0;
  const airfreightOriginEur = parseFloat(data.airfreight_origin_charges_eur) || 0;
  const airfreightOriginZar = (airfreightOriginUsd * roeOrigin) + (airfreightOriginEur * roeEur);

  // Airfreight local charges (all ZAR)
  const airLocalChargesSubtotalZar = calculateAirfreightChargesSubtotal(data);

  // Insurance (% of customs value)
  const insurancePercent = parseFloat(data.airfreight_insurance_percent) || 0;
  const airfreightInsuranceZar = customsValueZar * (insurancePercent / 100);

  // Total airfreight cost
  const totalAirfreightCostZar = airfreightTotalZar + fuelSurchargeTotalZar + securitySurchargeTotalZar
    + airfreightOriginZar + airLocalChargesSubtotalZar + warehouseChargesSubtotalZar + airfreightInsuranceZar + lastMileChargesSubtotalZar;

  // === Unified shipping cost (sea or air) ===
  // Sea freight total. Origin Charges is omitted under FOB/FCA/EXW (it's goods value,
  // not a shipping fee); included under other terms where it represents real origin
  // port handling fees.
  // Under export-FOB the buyer pays ocean freight, so the seller's cost
  // breakdown must not include it (the value may still be entered in the form
  // for reference but is excluded from the totals).
  const oceanFreightIsBuyerCost = isExport && incoTermsUpper === 'FOB';

  const totalShippingCostSeaZar = (oceanFreightIsBuyerCost ? 0 : totalOceanFreightZar)
    + (originChargesAreFobValue ? 0 : totalOriginChargesZar)
    + localChargesSubtotalZar
    + destinationChargesSubtotalZar
    + lastMileChargesSubtotalZar;

  // Use the right total based on transport mode
  const totalShippingCostZar = isAirfreight ? totalAirfreightCostZar : totalShippingCostSeaZar;

  // For CIF/CIP/CFR, ocean freight and origin charges are in the product price —
  // only local + destination charges are additional shipping costs
  const incoTerms = (data.inco_terms || '').toUpperCase();
  const freightIncluded = ['CIF', 'CIP', 'CFR'].includes(incoTerms);
  let shippingToAllocateZar;
  if (isAirfreight) {
    // For airfreight: if freight included in price, only allocate local charges + insurance
    shippingToAllocateZar = freightIncluded
      ? airLocalChargesSubtotalZar + warehouseChargesSubtotalZar + airfreightInsuranceZar + lastMileChargesSubtotalZar
      : totalAirfreightCostZar;
  } else {
    shippingToAllocateZar = freightIncluded
      ? localChargesSubtotalZar + destinationChargesSubtotalZar + lastMileChargesSubtotalZar
      : totalShippingCostSeaZar;
  }

  // Total in warehouse cost (shipping + customs overhead) - VAT excluded
  const totalInWarehouseCostZar = shippingToAllocateZar + customsSubtotalZar;

  // Total landed cost (product value + duties + allocated shipping) - true all-in cost
  const totalLandedCostZar = customsItemsTotals.totalCustomsValue + customsItemsTotals.totalDuties + customsItemsTotals.totalSchedule1Duty + shippingToAllocateZar;

  // Cost per KG (based on total landed cost including product value)
  const allInWarehouseCostPerKgZar = totalGrossWeightKg > 0
    ? totalLandedCostZar / totalGrossWeightKg
    : 0;

  // Overhead cost per KG (shipping + customs overhead only, excluding product value)
  const overheadCostPerKgZar = totalGrossWeightKg > 0
    ? totalInWarehouseCostZar / totalGrossWeightKg
    : 0;

  const r = (v) => Math.round(v * 100) / 100;

  return {
    // Database columns (will be saved)
    customs_value_zar: r(customsValueZar),
    ocean_freight_zar: r(totalOceanFreightZar),
    total_ocean_freight_zar: r(totalOceanFreightZar),
    origin_charge_zar: r(originChargeUsdZar + originChargeEurZar),
    total_origin_charges_zar: r(totalOriginChargesZar),
    local_charges_subtotal_zar: r(localChargesSubtotalZar),
    destination_charges_subtotal_zar: r(destinationChargesSubtotalZar),
    warehouse_handling_fee_zar: r(warehouseCharges.handling_fee_zar),
    warehouse_storage_fee_zar: r(warehouseCharges.storage_fee_zar),
    warehouse_charges_subtotal_zar: r(warehouseChargesSubtotalZar),
    last_mile_charges_subtotal_zar: r(lastMileChargesSubtotalZar),
    export_charges_subtotal_zar: r(exportChargesSubtotalZar),
    import_vat_zar: r(importVatZar),
    total_duties_zar: r(customsItemsTotals.totalDuties + customsItemsTotals.totalSchedule1Duty),
    agency_fee_zar: r(agencyFeeZar),
    customs_subtotal_zar: r(customsSubtotalZar),
    total_shipping_cost_zar: r(totalShippingCostZar),
    total_in_warehouse_cost_zar: r(totalInWarehouseCostZar),
    total_landed_cost_zar: r(totalLandedCostZar),
    all_in_warehouse_cost_per_kg_zar: r(allInWarehouseCostPerKgZar),
    overhead_cost_per_kg_zar: r(overheadCostPerKgZar),
    // Airfreight calculated fields
    volumetric_weight_kg: r(volumetricWeightKg),
    chargeable_weight_kg: r(chargeableWeightKg),
    airfreight_total_usd: r(airfreightTotalUsd),
    _airfreight_total_eur: r(airfreightTotalEur),
    _airfreight_usd_zar: r(airfreightTotalUsd * roeOrigin),
    _airfreight_eur_zar: r(airfreightTotalEur * roeEur),
    airfreight_total_zar: r(airfreightTotalZar),
    fuel_surcharge_total_zar: r(fuelSurchargeTotalZar),
    security_surcharge_total_zar: r(securitySurchargeTotalZar),
    airfreight_origin_charges_zar: r(airfreightOriginZar),
    air_local_charges_subtotal_zar: r(airLocalChargesSubtotalZar),
    airfreight_insurance_zar: r(airfreightInsuranceZar),
    total_airfreight_cost_zar: r(totalAirfreightCostZar),
    // Display-only fields (not saved to database, used for form display)
    _last_mile_charge_lines: lastMile.lines,
    _last_mile_weight_kg: r(lastMile.lines[0]?.calculated.weight_kg || 0),
    _last_mile_minimum_zar: r(lastMile.lines[0]?.calculated.minimum_zar || 0),
    _last_mile_rate_per_kg_zar: r(lastMile.lines[0]?.calculated.rate_per_kg_zar || 0),
    _last_mile_base_charge_zar: r(lastMile.lines.reduce((sum, line) => sum + (line.calculated.base_charge_zar || 0), 0)),
    _last_mile_fuel_levy_zar: r(lastMile.lines.reduce((sum, line) => sum + (line.calculated.fuel_levy_zar || 0), 0)),
    _warehouse_chargeable_weight_kg: r(warehouseCharges.chargeable_weight_kg),
    _ocean_freight_usd_zar: r(oceanFreightUsdZar),
    _ocean_freight_eur_zar: r(oceanFreightEurZar),
    _origin_charge_usd_zar: r(originChargeUsdZar),
    _origin_charge_eur_zar: r(originChargeEurZar),
  };
};

/**
 * Format currency for display
 */
export const formatCurrency = (value, currency = 'ZAR') => {
  if (value === null || value === undefined || isNaN(value)) return '-';

  const formatter = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(value);
};

/**
 * Format number for display
 */
export const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return Number(value).toLocaleString('en-ZA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Container type options
 */
export const CONTAINER_TYPES = [
  { value: "20' Dry Container", label: "20' Dry Container" },
  { value: "40' Dry Container", label: "40' Dry Container" },
  { value: "40' High Cube", label: "40' High Cube" },
  { value: "20' Reefer", label: "20' Reefer" },
  { value: "40' Reefer", label: "40' Reefer" },
];

/**
 * Ports of Loading options
 */
export const PORTS_OF_LOADING = [
  { value: 'Port Kelang', label: 'Port Kelang - Malaysia' },
  { value: 'Qingdao', label: 'Qingdao - China' },
  { value: 'Shanghai', label: 'Shanghai - China' },
  { value: 'Tianjin / Xingang', label: 'Tianjin / Xingang - China' },
  { value: 'Dalian', label: 'Dalian - China' },
  { value: 'Jakarta', label: 'Jakarta - Indonesia' },
  { value: 'Gebze', label: 'Gebze - Turkey' },
  { value: 'Istanbul', label: 'Istanbul - Turkey' },
];

/**
 * Export Ports of Loading (South African origin ports)
 */
export const EXPORT_PORTS_OF_LOADING = [
  { value: 'Cape Town', label: 'Cape Town Port' },
  { value: 'Durban', label: 'Durban Port' },
];

/**
 * Shipping line options
 */
export const SHIPPING_LINES = [
  { value: 'CMA-CGM', label: 'CMA-CGM' },
  { value: 'EVERGREEN', label: 'EVERGREEN' },
  { value: 'MSC', label: 'MSC' },
  { value: 'MSC Special', label: 'MSC Special' },
  { value: 'MSC Standard', label: 'MSC Standard' },
  { value: 'ONE', label: 'ONE' },
];

/**
 * Container type mapping for rate lookup
 */
const CONTAINER_RATE_KEY = {
  "20' Dry Container": '20GP',
  "40' Dry Container": '40GP',
  "40' High Cube": '40HC',
};

/**
 * Ocean freight rates (USD) by Port of Loading → Shipping Line → Container Size
 * Source: Synercore January 2026 Rates
 */
export const OCEAN_FREIGHT_RATES = {
  'Port Kelang': {
    'MSC Special':  { '20GP': 2150, '40GP': 2550, '40HC': 2550 },
    'ONE':          { '20GP': 2350, '40GP': 2550, '40HC': 2550 },
    'MSC Standard': { '20GP': 3100, '40GP': 4250, '40HC': 4250 },
  },
  'Qingdao': {
    'ONE':          { '20GP': 2350, '40GP': 2550, '40HC': 2550 },
    'CMA-CGM':      { '20GP': 2400, '40GP': 2750, '40HC': 2750 },
    'EVERGREEN':    { '20GP': 2009, '40GP': 2568, '40HC': 2568 },
    'MSC Special':  { '20GP': 2300, '40GP': 2650, '40HC': 2650 },
    'MSC Standard': { '20GP': 3050, '40GP': 4150, '40HC': 4150 },
  },
  'Tianjin / Xingang': {
    'CMA-CGM':      { '20GP': 2625, '40GP': 3200, '40HC': 3200 },
    'MSC Special':  { '20GP': 2300, '40GP': 2650, '40HC': 2650 },
    'ONE':          { '20GP': 2450, '40GP': 2750, '40HC': 2750 },
    'MSC Standard': { '20GP': 3100, '40GP': 4250, '40HC': 4250 },
  },
  'Dalian': {
    'MSC Special':  { '20GP': 2300, '40GP': 2650, '40HC': 2650 },
    'MSC Standard': { '20GP': 3100, '40GP': 4250, '40HC': 4250 },
    'ONE':          { '20GP': 2450, '40GP': 2750, '40HC': 2750 },
    'EVERGREEN':    { '20GP': 2100, '40GP': 2900, '40HC': 2900 },
  },
  'Jakarta': {
    'ONE':          { '20GP': 2350, '40GP': 2550, '40HC': 2550 },
    'MSC Standard': { '20GP': 3100, '40GP': 4250, '40HC': 4250 },
    'CMA-CGM':      { '20GP': 2500, '40GP': 3250, '40HC': 3250 },
    'MSC Special':  { '20GP': 2150, '40GP': 2550, '40HC': 2550 },
  },
  'Shanghai': {
    'ONE':          { '20GP': 2350, '40GP': 2550, '40HC': 2550 },
    'CMA-CGM':      { '20GP': 2400, '40GP': 2750, '40HC': 2750 },
    'EVERGREEN':    { '20GP': 2009, '40GP': 2550, '40HC': 2450 },
    'MSC Special':  { '20GP': 2200, '40GP': 2450, '40HC': 2450 },
    'MSC Standard': { '20GP': 3050, '40GP': 4150, '40HC': 4150 },
  },
  'Gebze': {
    'MSC':          { '20GP': 1050, '40GP': 0, '40HC': 1000 },
  },
  'Istanbul': {
    'MSC':          { '20GP': 1050, '40GP': 0, '40HC': 1000 },
  },
};

/**
 * Look up ocean freight rate based on port, shipping line, and container type.
 * Returns the rate in USD, or null if no matching rate found.
 */
export function lookupOceanFreightRate(portOfLoading, shippingLine, containerType) {
  const sizeKey = CONTAINER_RATE_KEY[containerType];
  if (!sizeKey) return null;
  const rate = OCEAN_FREIGHT_RATES[portOfLoading]?.[shippingLine]?.[sizeKey];
  return rate !== undefined ? rate : null;
}

/**
 * INCO terms options
 */
export const INCO_TERMS = [
  { value: 'EXW', label: 'EXW - Ex Works' },
  { value: 'FCA', label: 'FCA - Free Carrier' },
  { value: 'CPT', label: 'CPT - Carriage Paid To' },
  { value: 'CIP', label: 'CIP - Carriage and Insurance Paid' },
  { value: 'DAP', label: 'DAP - Delivered at Place' },
  { value: 'DPU', label: 'DPU - Delivered at Place Unloaded' },
  { value: 'DDP', label: 'DDP - Delivered Duty Paid' },
  { value: 'FAS', label: 'FAS - Free Alongside Ship' },
  { value: 'FOB', label: 'FOB - Free on Board' },
  { value: 'CFR', label: 'CFR - Cost and Freight' },
  { value: 'CIF', label: 'CIF - Cost, Insurance and Freight' },
];

/**
 * Port options (Africa)
 */
export const AFRICAN_PORTS = [
  // South Africa
  { value: 'CPT', label: 'Cape Town (CPT) - South Africa' },
  { value: 'DBN', label: 'Durban (DBN) - South Africa' },
  { value: 'PLZ', label: 'Port Elizabeth (PLZ) - South Africa' },
  { value: 'ELS', label: 'East London (ELS) - South Africa' },
  { value: 'RCB', label: 'Richards Bay (RCB) - South Africa' },
  { value: 'JNB', label: 'Johannesburg (JNB) - South Africa (Inland)' },
  { value: 'NGQ', label: 'Ngqura/Coega (NGQ) - South Africa' },
  { value: 'SDB', label: 'Saldanha Bay (SDB) - South Africa' },
  // East Africa
  { value: 'MBA', label: 'Mombasa (MBA) - Kenya' },
  { value: 'DAR', label: 'Dar es Salaam (DAR) - Tanzania' },
  { value: 'MPS', label: 'Maputo (MPS) - Mozambique' },
  { value: 'BEW', label: 'Beira (BEW) - Mozambique' },
  { value: 'NCL', label: 'Nacala (NCL) - Mozambique' },
  { value: 'DIJ', label: 'Djibouti (DIJ) - Djibouti' },
  { value: 'PTL', label: 'Port Louis (PTL) - Mauritius' },
  { value: 'MGN', label: 'Mogadishu (MGN) - Somalia' },
  { value: 'BRB', label: 'Berbera (BRB) - Somalia' },
  { value: 'MSW', label: 'Massawa (MSW) - Eritrea' },
  { value: 'TNR', label: 'Toamasina (TNR) - Madagascar' },
  // Southern Africa
  { value: 'WDH', label: 'Walvis Bay (WDH) - Namibia' },
  { value: 'LLW', label: 'Lilongwe (LLW) - Malawi (Inland)' },
  { value: 'LUN', label: 'Lusaka (LUN) - Zambia (Inland)' },
  { value: 'HRE', label: 'Harare (HRE) - Zimbabwe (Inland)' },
  { value: 'GBE', label: 'Gaborone (GBE) - Botswana (Inland)' },
  { value: 'MTS', label: 'Matsapha (MTS) - Eswatini (Inland)' },
  { value: 'MSU', label: 'Maseru (MSU) - Lesotho (Inland)' },
  // West Africa
  { value: 'LOS', label: 'Lagos/Apapa (LOS) - Nigeria' },
  { value: 'TIN', label: 'Tin Can Island (TIN) - Nigeria' },
  { value: 'ONN', label: 'Onne (ONN) - Nigeria' },
  { value: 'ACC', label: 'Tema (ACC) - Ghana' },
  { value: 'TKD', label: 'Takoradi (TKD) - Ghana' },
  { value: 'ABJ', label: 'Abidjan (ABJ) - Ivory Coast' },
  { value: 'DKR', label: 'Dakar (DKR) - Senegal' },
  { value: 'COO', label: 'Cotonou (COO) - Benin' },
  { value: 'LME', label: 'Lomé (LME) - Togo' },
  { value: 'CNK', label: 'Conakry (CNK) - Guinea' },
  { value: 'FNA', label: 'Freetown (FNA) - Sierra Leone' },
  { value: 'MLW', label: 'Monrovia (MLW) - Liberia' },
  { value: 'BJL', label: 'Banjul (BJL) - Gambia' },
  { value: 'NKC', label: 'Nouakchott (NKC) - Mauritania' },
  { value: 'BSU', label: 'Bissau (BSU) - Guinea-Bissau' },
  { value: 'PRY', label: 'Praia (PRY) - Cape Verde' },
  // Central Africa
  { value: 'DLA', label: 'Douala (DLA) - Cameroon' },
  { value: 'LBV', label: 'Libreville (LBV) - Gabon' },
  { value: 'POG', label: 'Port-Gentil (POG) - Gabon' },
  { value: 'PNR', label: 'Pointe-Noire (PNR) - Congo' },
  { value: 'LUA', label: 'Luanda (LUA) - Angola' },
  { value: 'LOB', label: 'Lobito (LOB) - Angola' },
  { value: 'MAT', label: 'Matadi (MAT) - DRC' },
  { value: 'MLA', label: 'Malabo (MLA) - Equatorial Guinea' },
  { value: 'STP', label: 'São Tomé (STP) - São Tomé and Príncipe' },
  // North Africa
  { value: 'TNG', label: 'Tanger Med (TNG) - Morocco' },
  { value: 'CAS', label: 'Casablanca (CAS) - Morocco' },
  { value: 'ALG', label: 'Algiers (ALG) - Algeria' },
  { value: 'TUN', label: 'Tunis (TUN) - Tunisia' },
  { value: 'TIP', label: 'Tripoli (TIP) - Libya' },
  { value: 'ALY', label: 'Alexandria (ALY) - Egypt' },
  { value: 'PSD', label: 'Port Said (PSD) - Egypt' },
  { value: 'DAM', label: 'Damietta (DAM) - Egypt' },
  { value: 'SKH', label: 'Sokhna (SKH) - Egypt' },
  { value: 'SUZ', label: 'Suez (SUZ) - Egypt' },
  { value: 'PTS', label: 'Port Sudan (PTS) - Sudan' },
];

// Keep backward-compatible alias
export const SA_PORTS = AFRICAN_PORTS;

/**
 * Global port options for export — covers Africa + Asia + Europe + Americas
 * + Oceania + Middle East. Used as Port of Discharge in export costing.
 */
export const WORLD_PORTS = [
  ...AFRICAN_PORTS,
  // Asia — East
  { value: 'SHA', label: 'Shanghai (SHA) - China' },
  { value: 'SZX', label: 'Shenzhen/Yantian (SZX) - China' },
  { value: 'NGB', label: 'Ningbo (NGB) - China' },
  { value: 'QIN', label: 'Qingdao (QIN) - China' },
  { value: 'TAO', label: 'Tianjin/Xingang (TAO) - China' },
  { value: 'DLC', label: 'Dalian (DLC) - China' },
  { value: 'XMN', label: 'Xiamen (XMN) - China' },
  { value: 'HKG', label: 'Hong Kong (HKG) - Hong Kong' },
  { value: 'KHH', label: 'Kaohsiung (KHH) - Taiwan' },
  { value: 'TPE', label: 'Taipei/Keelung (TPE) - Taiwan' },
  { value: 'BUS', label: 'Busan (BUS) - South Korea' },
  { value: 'ICN', label: 'Incheon (ICN) - South Korea' },
  { value: 'TYO', label: 'Tokyo (TYO) - Japan' },
  { value: 'YOK', label: 'Yokohama (YOK) - Japan' },
  { value: 'OSA', label: 'Osaka (OSA) - Japan' },
  { value: 'KOB', label: 'Kobe (KOB) - Japan' },
  { value: 'NGO', label: 'Nagoya (NGO) - Japan' },
  // Asia — Southeast
  { value: 'SIN', label: 'Singapore (SIN) - Singapore' },
  { value: 'PKL', label: 'Port Kelang (PKL) - Malaysia' },
  { value: 'PEN', label: 'Penang (PEN) - Malaysia' },
  { value: 'TPP', label: 'Tanjung Pelepas (TPP) - Malaysia' },
  { value: 'JKT', label: 'Jakarta/Tanjung Priok (JKT) - Indonesia' },
  { value: 'SUB', label: 'Surabaya (SUB) - Indonesia' },
  { value: 'BKK', label: 'Bangkok/Laem Chabang (BKK) - Thailand' },
  { value: 'HPH', label: 'Haiphong (HPH) - Vietnam' },
  { value: 'SGN', label: 'Ho Chi Minh/Cat Lai (SGN) - Vietnam' },
  { value: 'MNL', label: 'Manila (MNL) - Philippines' },
  // Asia — South
  { value: 'BOM', label: 'Mumbai/Nhava Sheva (BOM) - India' },
  { value: 'MAA', label: 'Chennai (MAA) - India' },
  { value: 'MUN', label: 'Mundra (MUN) - India' },
  { value: 'COK', label: 'Cochin (COK) - India' },
  { value: 'CCU', label: 'Kolkata (CCU) - India' },
  { value: 'CMB', label: 'Colombo (CMB) - Sri Lanka' },
  { value: 'CGP', label: 'Chittagong (CGP) - Bangladesh' },
  { value: 'KHI', label: 'Karachi (KHI) - Pakistan' },
  // Middle East
  { value: 'JEA', label: 'Jebel Ali (JEA) - UAE' },
  { value: 'AUH', label: 'Abu Dhabi (AUH) - UAE' },
  { value: 'DMM', label: 'Dammam (DMM) - Saudi Arabia' },
  { value: 'JED', label: 'Jeddah (JED) - Saudi Arabia' },
  { value: 'KWI', label: 'Shuwaikh (KWI) - Kuwait' },
  { value: 'BAH', label: 'Bahrain (BAH) - Bahrain' },
  { value: 'DOH', label: 'Doha/Hamad (DOH) - Qatar' },
  { value: 'MCT', label: 'Sohar (MCT) - Oman' },
  { value: 'AQJ', label: 'Aqaba (AQJ) - Jordan' },
  { value: 'BEY', label: 'Beirut (BEY) - Lebanon' },
  { value: 'HFA', label: 'Haifa (HFA) - Israel' },
  { value: 'ASH', label: 'Ashdod (ASH) - Israel' },
  { value: 'IST', label: 'Istanbul/Ambarli (IST) - Turkey' },
  { value: 'GEB', label: 'Gebze (GEB) - Turkey' },
  { value: 'IZM', label: 'Izmir (IZM) - Turkey' },
  { value: 'MER', label: 'Mersin (MER) - Turkey' },
  // Europe — Northwest
  { value: 'RTM', label: 'Rotterdam (RTM) - Netherlands' },
  { value: 'AMS', label: 'Amsterdam (AMS) - Netherlands' },
  { value: 'ANR', label: 'Antwerp (ANR) - Belgium' },
  { value: 'ZEE', label: 'Zeebrugge (ZEE) - Belgium' },
  { value: 'HAM', label: 'Hamburg (HAM) - Germany' },
  { value: 'BRV', label: 'Bremerhaven (BRV) - Germany' },
  { value: 'LEH', label: 'Le Havre (LEH) - France' },
  { value: 'FOS', label: 'Fos-sur-Mer (FOS) - France' },
  { value: 'MRS', label: 'Marseille (MRS) - France' },
  { value: 'FXT', label: 'Felixstowe (FXT) - UK' },
  { value: 'SOU', label: 'Southampton (SOU) - UK' },
  { value: 'LGP', label: 'London Gateway (LGP) - UK' },
  { value: 'LIV', label: 'Liverpool (LIV) - UK' },
  { value: 'DUB', label: 'Dublin (DUB) - Ireland' },
  { value: 'CPH', label: 'Copenhagen (CPH) - Denmark' },
  { value: 'GOT', label: 'Gothenburg (GOT) - Sweden' },
  { value: 'OSL', label: 'Oslo (OSL) - Norway' },
  { value: 'HEL', label: 'Helsinki (HEL) - Finland' },
  { value: 'GDN', label: 'Gdansk (GDN) - Poland' },
  // Europe — South
  { value: 'GOA', label: 'Genoa (GOA) - Italy' },
  { value: 'LIV_IT', label: 'Livorno (LIV_IT) - Italy' },
  { value: 'NAP', label: 'Naples (NAP) - Italy' },
  { value: 'TAR', label: 'Taranto (TAR) - Italy' },
  { value: 'TRS', label: 'Trieste (TRS) - Italy' },
  { value: 'BCN', label: 'Barcelona (BCN) - Spain' },
  { value: 'VLC', label: 'Valencia (VLC) - Spain' },
  { value: 'ALG_ES', label: 'Algeciras (ALG_ES) - Spain' },
  { value: 'BIO', label: 'Bilbao (BIO) - Spain' },
  { value: 'LIS', label: 'Lisbon (LIS) - Portugal' },
  { value: 'LEI', label: 'Leixões (LEI) - Portugal' },
  { value: 'PIR', label: 'Piraeus (PIR) - Greece' },
  { value: 'KOP', label: 'Koper (KOP) - Slovenia' },
  // Americas — North
  { value: 'NYC', label: 'New York/New Jersey (NYC) - USA' },
  { value: 'SAV', label: 'Savannah (SAV) - USA' },
  { value: 'CHS', label: 'Charleston (CHS) - USA' },
  { value: 'MIA', label: 'Miami (MIA) - USA' },
  { value: 'HOU', label: 'Houston (HOU) - USA' },
  { value: 'LAX', label: 'Los Angeles (LAX) - USA' },
  { value: 'LGB', label: 'Long Beach (LGB) - USA' },
  { value: 'OAK', label: 'Oakland (OAK) - USA' },
  { value: 'SEA', label: 'Seattle/Tacoma (SEA) - USA' },
  { value: 'YYZ', label: 'Toronto (YYZ) - Canada (Inland)' },
  { value: 'YVR', label: 'Vancouver (YVR) - Canada' },
  { value: 'YMQ', label: 'Montreal (YMQ) - Canada' },
  { value: 'VCR', label: 'Veracruz (VCR) - Mexico' },
  { value: 'ZLO', label: 'Manzanillo (ZLO) - Mexico' },
  // Americas — South
  { value: 'SSZ', label: 'Santos (SSZ) - Brazil' },
  { value: 'RIG', label: 'Rio Grande (RIG) - Brazil' },
  { value: 'ITJ', label: 'Itajaí (ITJ) - Brazil' },
  { value: 'BUE', label: 'Buenos Aires (BUE) - Argentina' },
  { value: 'SAI', label: 'San Antonio (SAI) - Chile' },
  { value: 'VAP', label: 'Valparaíso (VAP) - Chile' },
  { value: 'CLL', label: 'Callao (CLL) - Peru' },
  { value: 'GYE', label: 'Guayaquil (GYE) - Ecuador' },
  { value: 'CAR', label: 'Cartagena (CAR) - Colombia' },
  { value: 'PTY', label: 'Balboa/Manzanillo (PTY) - Panama' },
  { value: 'MVD', label: 'Montevideo (MVD) - Uruguay' },
  // Oceania
  { value: 'SYD', label: 'Sydney (SYD) - Australia' },
  { value: 'MEL', label: 'Melbourne (MEL) - Australia' },
  { value: 'BNE', label: 'Brisbane (BNE) - Australia' },
  { value: 'FRE', label: 'Fremantle/Perth (FRE) - Australia' },
  { value: 'ADL', label: 'Adelaide (ADL) - Australia' },
  { value: 'AKL', label: 'Auckland (AKL) - New Zealand' },
  { value: 'WLG', label: 'Wellington (WLG) - New Zealand' },
];

/**
 * Load type options (LCL / FCL)
 */
export const LOAD_TYPES = [
  { value: 'FCL', label: 'FCL - Full Container Load' },
  { value: 'LCL', label: 'LCL - Less than Container Load' },
];

/**
 * Airport options (common origins for air freight into SA)
 */
export const AIRPORTS_OF_DEPARTURE = [
  { value: 'HKG', label: 'Hong Kong (HKG)' },
  { value: 'PVG', label: 'Shanghai Pudong (PVG)' },
  { value: 'CAN', label: 'Guangzhou (CAN)' },
  { value: 'SZX', label: 'Shenzhen (SZX)' },
  { value: 'PEK', label: 'Beijing (PEK)' },
  { value: 'NRT', label: 'Tokyo Narita (NRT)' },
  { value: 'ICN', label: 'Seoul Incheon (ICN)' },
  { value: 'SIN', label: 'Singapore (SIN)' },
  { value: 'BKK', label: 'Bangkok (BKK)' },
  { value: 'KUL', label: 'Kuala Lumpur (KUL)' },
  { value: 'CGK', label: 'Jakarta (CGK)' },
  { value: 'DEL', label: 'Delhi (DEL)' },
  { value: 'BOM', label: 'Mumbai (BOM)' },
  { value: 'DXB', label: 'Dubai (DXB)' },
  { value: 'IST', label: 'Istanbul (IST)' },
  { value: 'FRA', label: 'Frankfurt (FRA)' },
  { value: 'AMS', label: 'Amsterdam (AMS)' },
  { value: 'LHR', label: 'London Heathrow (LHR)' },
  { value: 'CDG', label: 'Paris CDG (CDG)' },
  { value: 'ADD', label: 'Addis Ababa (ADD)' },
  { value: 'NBO', label: 'Nairobi (NBO)' },
  { value: 'LOS', label: 'Lagos (LOS)' },
];

export const AIRPORTS_OF_ARRIVAL = [
  { value: 'JNB', label: 'OR Tambo, Johannesburg (JNB)' },
  { value: 'CPT', label: 'Cape Town International (CPT)' },
  { value: 'DUR', label: 'King Shaka, Durban (DUR)' },
  { value: 'PLZ', label: 'Port Elizabeth (PLZ)' },
  { value: 'BFN', label: 'Bloemfontein (BFN)' },
];

/**
 * South African airports — used as the export Airport of Departure list.
 */
export const SA_AIRPORTS = AIRPORTS_OF_ARRIVAL;

/**
 * Worldwide cargo airports — used as the export Airport of Arrival list.
 * Combines the existing import-origin airports with additional major hubs
 * across North/South America, Oceania, Europe, and Asia.
 */
export const WORLD_AIRPORTS = [
  // South Africa
  ...SA_AIRPORTS,
  // Asia — East
  { value: 'HKG', label: 'Hong Kong (HKG)' },
  { value: 'PVG', label: 'Shanghai Pudong (PVG)' },
  { value: 'CAN', label: 'Guangzhou (CAN)' },
  { value: 'SZX', label: 'Shenzhen (SZX)' },
  { value: 'PEK', label: 'Beijing Capital (PEK)' },
  { value: 'PKX', label: 'Beijing Daxing (PKX)' },
  { value: 'TPE', label: 'Taipei Taoyuan (TPE)' },
  { value: 'NRT', label: 'Tokyo Narita (NRT)' },
  { value: 'HND', label: 'Tokyo Haneda (HND)' },
  { value: 'KIX', label: 'Osaka Kansai (KIX)' },
  { value: 'ICN', label: 'Seoul Incheon (ICN)' },
  // Asia — Southeast / South
  { value: 'SIN', label: 'Singapore (SIN)' },
  { value: 'KUL', label: 'Kuala Lumpur (KUL)' },
  { value: 'BKK', label: 'Bangkok Suvarnabhumi (BKK)' },
  { value: 'CGK', label: 'Jakarta (CGK)' },
  { value: 'MNL', label: 'Manila (MNL)' },
  { value: 'HAN', label: 'Hanoi (HAN)' },
  { value: 'SGN', label: 'Ho Chi Minh (SGN)' },
  { value: 'DEL', label: 'Delhi (DEL)' },
  { value: 'BOM', label: 'Mumbai (BOM)' },
  { value: 'MAA', label: 'Chennai (MAA)' },
  { value: 'BLR', label: 'Bangalore (BLR)' },
  { value: 'CMB', label: 'Colombo (CMB)' },
  // Middle East
  { value: 'DXB', label: 'Dubai (DXB)' },
  { value: 'AUH', label: 'Abu Dhabi (AUH)' },
  { value: 'DOH', label: 'Doha (DOH)' },
  { value: 'RUH', label: 'Riyadh (RUH)' },
  { value: 'JED', label: 'Jeddah (JED)' },
  { value: 'IST', label: 'Istanbul (IST)' },
  { value: 'TLV', label: 'Tel Aviv (TLV)' },
  // Europe
  { value: 'FRA', label: 'Frankfurt (FRA)' },
  { value: 'MUC', label: 'Munich (MUC)' },
  { value: 'AMS', label: 'Amsterdam (AMS)' },
  { value: 'LHR', label: 'London Heathrow (LHR)' },
  { value: 'LGW', label: 'London Gatwick (LGW)' },
  { value: 'STN', label: 'London Stansted (STN)' },
  { value: 'CDG', label: 'Paris CDG (CDG)' },
  { value: 'ORY', label: 'Paris Orly (ORY)' },
  { value: 'BRU', label: 'Brussels (BRU)' },
  { value: 'LUX', label: 'Luxembourg (LUX)' },
  { value: 'MAD', label: 'Madrid (MAD)' },
  { value: 'BCN', label: 'Barcelona (BCN)' },
  { value: 'LIS', label: 'Lisbon (LIS)' },
  { value: 'FCO', label: 'Rome Fiumicino (FCO)' },
  { value: 'MXP', label: 'Milan Malpensa (MXP)' },
  { value: 'ZRH', label: 'Zurich (ZRH)' },
  { value: 'VIE', label: 'Vienna (VIE)' },
  { value: 'CPH', label: 'Copenhagen (CPH)' },
  { value: 'ARN', label: 'Stockholm Arlanda (ARN)' },
  { value: 'OSL', label: 'Oslo (OSL)' },
  { value: 'HEL', label: 'Helsinki (HEL)' },
  { value: 'WAW', label: 'Warsaw (WAW)' },
  { value: 'PRG', label: 'Prague (PRG)' },
  // Africa (beyond SA)
  { value: 'NBO', label: 'Nairobi (NBO)' },
  { value: 'ADD', label: 'Addis Ababa (ADD)' },
  { value: 'LOS', label: 'Lagos (LOS)' },
  { value: 'ABV', label: 'Abuja (ABV)' },
  { value: 'CAI', label: 'Cairo (CAI)' },
  { value: 'CMN', label: 'Casablanca (CMN)' },
  { value: 'DKR', label: 'Dakar (DKR)' },
  { value: 'ACC', label: 'Accra (ACC)' },
  { value: 'HRE', label: 'Harare (HRE)' },
  { value: 'LUN', label: 'Lusaka (LUN)' },
  { value: 'WDH', label: 'Windhoek (WDH)' },
  { value: 'TNR', label: 'Antananarivo (TNR)' },
  { value: 'MRU', label: 'Mauritius (MRU)' },
  // North America
  { value: 'JFK', label: 'New York JFK (JFK)' },
  { value: 'EWR', label: 'Newark (EWR)' },
  { value: 'ORD', label: 'Chicago O\'Hare (ORD)' },
  { value: 'ATL', label: 'Atlanta (ATL)' },
  { value: 'MIA', label: 'Miami (MIA)' },
  { value: 'LAX', label: 'Los Angeles (LAX)' },
  { value: 'SFO', label: 'San Francisco (SFO)' },
  { value: 'SEA', label: 'Seattle (SEA)' },
  { value: 'DFW', label: 'Dallas/Fort Worth (DFW)' },
  { value: 'IAH', label: 'Houston (IAH)' },
  { value: 'YYZ', label: 'Toronto (YYZ)' },
  { value: 'YVR', label: 'Vancouver (YVR)' },
  { value: 'MEX', label: 'Mexico City (MEX)' },
  // South America
  { value: 'GRU', label: 'São Paulo Guarulhos (GRU)' },
  { value: 'EZE', label: 'Buenos Aires Ezeiza (EZE)' },
  { value: 'SCL', label: 'Santiago (SCL)' },
  { value: 'LIM', label: 'Lima (LIM)' },
  { value: 'BOG', label: 'Bogotá (BOG)' },
  // Oceania
  { value: 'SYD', label: 'Sydney (SYD)' },
  { value: 'MEL', label: 'Melbourne (MEL)' },
  { value: 'BNE', label: 'Brisbane (BNE)' },
  { value: 'PER', label: 'Perth (PER)' },
  { value: 'AKL', label: 'Auckland (AKL) - NZ' },
];

export const AIRLINES = [
  { value: 'Ethiopian Airlines', label: 'Ethiopian Airlines' },
  { value: 'Emirates SkyCargo', label: 'Emirates SkyCargo' },
  { value: 'Turkish Cargo', label: 'Turkish Cargo' },
  { value: 'Qatar Airways Cargo', label: 'Qatar Airways Cargo' },
  { value: 'SAA Cargo', label: 'SAA Cargo' },
  { value: 'Lufthansa Cargo', label: 'Lufthansa Cargo' },
  { value: 'KLM Cargo', label: 'KLM Cargo' },
  { value: 'Singapore Airlines Cargo', label: 'Singapore Airlines Cargo' },
  { value: 'Cathay Cargo', label: 'Cathay Cargo' },
  { value: 'British Airways Cargo', label: 'British Airways Cargo' },
  { value: 'Kenya Airways Cargo', label: 'Kenya Airways Cargo' },
  { value: 'Other', label: 'Other' },
];

export default {
  COSTING_DEFAULTS,
  calculateDAVIF,
  calculateOriginChargeZAR,
  calculateLocalChargesSubtotal,
  calculateDestinationSubtotal,
  calculateAirfreightChargesSubtotal,
  calculateLastMileCharge,
  calculateLastMileCharges,
  getLastMileChargeItems,
  calculateVolumetricWeight,
  calculateChargeableWeight,
  calculateAgencyFee,
  calculateCustomsSubtotal,
  calculateAllTotals,
  formatCurrency,
  formatNumber,
  CONTAINER_TYPES,
  INCO_TERMS,
  LAST_MILE_SERVICE_TYPES,
  LAST_MILE_RATES,
  getLastMileRouteOptions,
  getLastMileRate,
  SA_PORTS,
  AFRICAN_PORTS,
  LOAD_TYPES,
  PORTS_OF_LOADING,
  SHIPPING_LINES,
  OCEAN_FREIGHT_RATES,
  lookupOceanFreightRate,
  AIRPORTS_OF_DEPARTURE,
  AIRPORTS_OF_ARRIVAL,
  AIRLINES,
};
