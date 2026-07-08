import {
  calculateDAVIF,
  calculateOriginChargeZAR,
  calculateLocalChargesSubtotal,
  calculateDestinationSubtotal,
  calculateAgencyFee,
  calculateCustomsItemsTotals,
  calculateEurChargeZAR,
  calculateCustomsValue,
  calculateAllTotals,
  calculateLastMileCharge,
  formatCurrency,
  formatNumber,
  lookupOceanFreightRate,
} from '../costingCalculations.js';

// ── calculateDAVIF ──

describe('calculateLastMileCharge', () => {
  it('uses manual charge as an override for automated route rates', () => {
    const result = calculateLastMileCharge({
      service_type: 'overnight_air',
      route: 'hermanstad-el-bfn-grj-plz',
      weight_kg: 100,
      manual_charge_zar: 5000,
      fuel_levy_percent: 10,
      extra_charges_zar: 250,
    });

    expect(result.base_charge_zar).toBe(5000);
    expect(result.fuel_levy_zar).toBe(500);
    expect(result.subtotal_zar).toBe(5750);
    expect(result.is_manual_override).toBe(true);
  });
});

describe('calculateDAVIF', () => {
  it('returns 3.25% of customs value when result exceeds R125', () => {
    // 10000 * 0.0325 = 325
    expect(calculateDAVIF(10000)).toBe(325);
  });

  it('returns minimum R125 when 3.25% is below R125', () => {
    // 1000 * 0.0325 = 32.50, should return 125
    expect(calculateDAVIF(1000)).toBe(125);
  });

  it('returns 0 for null or zero customs value', () => {
    expect(calculateDAVIF(null)).toBe(0);
    expect(calculateDAVIF(0)).toBe(0);
    expect(calculateDAVIF(undefined)).toBe(0);
  });

  it('returns 0 for negative customs value', () => {
    expect(calculateDAVIF(-500)).toBe(0);
  });
});

// ── calculateOriginChargeZAR ──

describe('calculateOriginChargeZAR', () => {
  it('converts USD origin charge to ZAR', () => {
    expect(calculateOriginChargeZAR(100, 18.5)).toBe(1850);
  });

  it('returns 0 when either value is null/undefined', () => {
    expect(calculateOriginChargeZAR(null, 18)).toBe(0);
    expect(calculateOriginChargeZAR(100, null)).toBe(0);
    expect(calculateOriginChargeZAR(undefined, undefined)).toBe(0);
  });

  it('returns 0 when both values are 0', () => {
    expect(calculateOriginChargeZAR(0, 0)).toBe(0);
  });
});

// ── calculateEurChargeZAR ──

describe('calculateEurChargeZAR', () => {
  it('converts EUR origin charge to ZAR', () => {
    expect(calculateEurChargeZAR(200, 20)).toBe(4000);
  });

  it('returns 0 for null inputs', () => {
    expect(calculateEurChargeZAR(null, 20)).toBe(0);
    expect(calculateEurChargeZAR(200, null)).toBe(0);
  });
});

// ── calculateLocalChargesSubtotal ──

describe('calculateLocalChargesSubtotal', () => {
  it('sums all local charge fields', () => {
    const data = {
      local_cartage_cpt_klapmuts_20ton_zar: '1000',
      local_cartage_cpt_klapmuts_28ton_zar: '2000',
      transport_dbn_to_pretoria_20ft_zar: '3000',
      transport_dbn_to_pretoria_40ft_zar: '0',
      transport_dbn_to_whs_zar: '500',
      unpack_reload_zar: '250',
      storage_zar: '100',
      outlying_depot_surcharge_zar: '0',
      local_cartage_dbn_whs_pretoria_opt_a_zar: '0',
      local_cartage_dbn_whs_pretoria_opt_b_zar: '0',
      local_cartage_dbn_whs_pretoria_6m_zar: '0',
      local_cartage_dbn_whs_pretoria_12m_zar: '0',
      transport_pe_coega_to_pretoria_zar: '0',
    };
    expect(calculateLocalChargesSubtotal(data)).toBe(6850);
  });

  it('handles missing/undefined fields as 0', () => {
    expect(calculateLocalChargesSubtotal({})).toBe(0);
  });

  it('handles string numbers correctly', () => {
    const data = { local_cartage_cpt_klapmuts_20ton_zar: '1500.50' };
    expect(calculateLocalChargesSubtotal(data)).toBe(1500.5);
  });
});

// ── calculateDestinationSubtotal ──

describe('calculateDestinationSubtotal', () => {
  it('sums all destination charge fields', () => {
    const data = {
      shipping_line_charges_zar: '5000',
      cargo_dues_20ft_zar: '1200',
      cargo_dues_40ft_zar: '0',
      cto_fee_zar: '800',
      port_health_inspection_zar: '350',
      daff_inspection_zar: '200',
      state_vet_cancellation_fee_zar: '0',
      jnb_turn_in_zar: '0',
      handover_fee_zar: '450',
    };
    expect(calculateDestinationSubtotal(data)).toBe(8000);
  });

  it('returns 0 for empty data', () => {
    expect(calculateDestinationSubtotal({})).toBe(0);
  });
});

// ── calculateAgencyFee ──

describe('calculateAgencyFee', () => {
  it('calculates 3.5% of duties+VAT when above minimum', () => {
    // 100000 * 0.035 = 3500
    expect(calculateAgencyFee(100000)).toBeCloseTo(3500, 2);
  });

  it('returns minimum R1187 when calculated fee is below', () => {
    // 10000 * 0.035 = 350, should return 1187
    expect(calculateAgencyFee(10000)).toBe(1187);
  });

  it('returns minimum for null/zero/negative dutiesAndVat', () => {
    expect(calculateAgencyFee(null)).toBe(1187);
    expect(calculateAgencyFee(0)).toBe(1187);
    expect(calculateAgencyFee(-100)).toBe(1187);
  });

  it('accepts custom percentage and minimum', () => {
    // 10000 * 0.05 = 500, min 400 => 500
    expect(calculateAgencyFee(10000, 5, 400)).toBe(500);
    // 1000 * 0.05 = 50, min 400 => 400
    expect(calculateAgencyFee(1000, 5, 400)).toBe(400);
  });
});

// ── calculateCustomsItemsTotals ──

describe('calculateCustomsItemsTotals', () => {
  it('calculates totals from products in USD', () => {
    const data = {
      roe_customs: '18',
      products: [
        { invoice_value: '1000', duty_percent: '10', duty_schedule1_percent: '0', currency: 'USD' },
      ],
    };
    const result = calculateCustomsItemsTotals(data);
    // customsValue = 1000 * 18 = 18000
    expect(result.totalCustomsValue).toBe(18000);
    // duties = 18000 * 0.10 = 1800
    expect(result.totalDuties).toBe(1800);
    expect(result.totalSchedule1Duty).toBe(0);
    // vat = (18000 + 1800 + 0) * 0.15 = 2970
    expect(result.totalVat).toBe(2970);
  });

  it('calculates totals from EUR products using roe_eur', () => {
    const data = {
      roe_customs: '18',
      roe_eur: '20',
      products: [
        { invoice_value: '500', duty_percent: '5', duty_schedule1_percent: '2', currency: 'EUR' },
      ],
    };
    const result = calculateCustomsItemsTotals(data);
    // customsValue = 500 * 20 = 10000
    expect(result.totalCustomsValue).toBe(10000);
    // duties = 10000 * 0.05 = 500
    expect(result.totalDuties).toBe(500);
    // schedule1 = 10000 * 0.02 = 200
    expect(result.totalSchedule1Duty).toBe(200);
    // vat = (10000 + 500 + 200) * 0.15 = 1605
    expect(result.totalVat).toBe(1605);
  });

  it('does not fall back to the USD/customs rate for EUR products when roe_eur is missing', () => {
    const data = {
      roe_customs: '18',
      products: [
        { invoice_value: '500', duty_percent: '5', duty_schedule1_percent: '2', currency: 'EUR' },
      ],
    };
    const result = calculateCustomsItemsTotals(data);
    // roe_eur is blank, so EUR items must convert at 0, not silently borrow the 18 USD/customs rate
    expect(result.totalCustomsValue).toBe(0);
    expect(result.totalDuties).toBe(0);
  });

  it('handles ZAR currency with roe=1', () => {
    const data = {
      roe_customs: '18',
      products: [
        { invoice_value: '5000', duty_percent: '0', duty_schedule1_percent: '0', currency: 'ZAR' },
      ],
    };
    const result = calculateCustomsItemsTotals(data);
    expect(result.totalCustomsValue).toBe(5000);
  });

  it('returns zeros for empty products', () => {
    const result = calculateCustomsItemsTotals({ products: [] });
    expect(result.totalCustomsValue).toBe(0);
    expect(result.totalDuties).toBe(0);
    expect(result.totalSchedule1Duty).toBe(0);
    expect(result.totalVat).toBe(0);
  });

  it('returns zeros when no products key exists', () => {
    const result = calculateCustomsItemsTotals({});
    expect(result.totalCustomsValue).toBe(0);
  });
});

// ── calculateCustomsValue ──

describe('calculateCustomsValue', () => {
  it('converts USD and EUR invoice values to ZAR', () => {
    const data = {
      roe_origin: '18',
      roe_eur: '20',
      invoice_value_usd: '1000',
      invoice_value_eur: '500',
    };
    // (1000 * 18) + (500 * 20) = 18000 + 10000 = 28000
    expect(calculateCustomsValue(data)).toBe(28000);
  });

  it('returns 0 for missing values', () => {
    expect(calculateCustomsValue({})).toBe(0);
  });
});

// ── lookupOceanFreightRate ──

describe('lookupOceanFreightRate', () => {
  it('returns correct rate for known port/line/container', () => {
    expect(lookupOceanFreightRate('Qingdao', 'ONE', "20' Dry Container")).toBe(2350);
    expect(lookupOceanFreightRate('Qingdao', 'CMA-CGM', "40' High Cube")).toBe(2750);
  });

  it('returns null for unknown container type', () => {
    expect(lookupOceanFreightRate('Qingdao', 'ONE', 'Unknown Container')).toBeNull();
  });

  it('returns null for unknown port', () => {
    expect(lookupOceanFreightRate('NonExistentPort', 'ONE', "20' Dry Container")).toBeNull();
  });

  it('returns null for unknown shipping line', () => {
    expect(lookupOceanFreightRate('Qingdao', 'FakeLine', "20' Dry Container")).toBeNull();
  });

  it('returns 0 when the rate is explicitly 0', () => {
    // Gebze MSC 40GP is 0
    expect(lookupOceanFreightRate('Gebze', 'MSC', "40' Dry Container")).toBe(0);
  });
});

// ── calculateAllTotals ──

describe('calculateAllTotals', () => {
  const sampleData = {
    roe_origin: '18',
    roe_eur: '20',
    ocean_freight_usd: '2000',
    ocean_freight_eur: '0',
    origin_charge_usd: '300',
    origin_charge_eur: '0',
    inco_terms: 'FOB',
    total_gross_weight_kg: '5000',
    customs_declaration_zar: '500',
    products: [
      {
        invoice_value: '10000',
        duty_percent: '10',
        duty_schedule1_percent: '0',
        currency: 'USD',
        weight_kg: '5000',
      },
    ],
    // All local/destination charges at zero for simplicity
  };

  it('returns an object with all expected keys', () => {
    const result = calculateAllTotals(sampleData);
    const expectedKeys = [
      'customs_value_zar',
      'ocean_freight_zar',
      'total_ocean_freight_zar',
      'origin_charge_zar',
      'total_origin_charges_zar',
      'local_charges_subtotal_zar',
      'destination_charges_subtotal_zar',
      'import_vat_zar',
      'total_duties_zar',
      'agency_fee_zar',
      'customs_subtotal_zar',
      'total_shipping_cost_zar',
      'total_in_warehouse_cost_zar',
      'total_landed_cost_zar',
      'all_in_warehouse_cost_per_kg_zar',
      'overhead_cost_per_kg_zar',
    ];
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
      expect(typeof result[key]).toBe('number');
    }
  });

  it('calculates ocean freight in ZAR correctly', () => {
    const result = calculateAllTotals(sampleData);
    // 2000 * 18 = 36000
    expect(result.ocean_freight_zar).toBe(36000);
  });

  it('uses customs ROE for USD ocean freight when USD/ZAR rate is missing', () => {
    const result = calculateAllTotals({
      ...sampleData,
      roe_origin: '',
      roe_customs: '18.5',
    });
    expect(result.ocean_freight_zar).toBe(37000);
  });

  it('calculates origin charge in ZAR correctly', () => {
    const result = calculateAllTotals(sampleData);
    // 300 * 18 = 5400
    expect(result.origin_charge_zar).toBe(5400);
  });

  it('calculates total duties from products', () => {
    const result = calculateAllTotals(sampleData);
    // customsValue = 10000 * 18 = 180000, duties = 180000 * 0.10 = 18000
    expect(result.total_duties_zar).toBe(18000);
  });

  it('calculates import VAT as 15% of (customs value + duties)', () => {
    const result = calculateAllTotals(sampleData);
    // vat = (180000 + 18000 + 0) * 0.15 = 29700
    expect(result.import_vat_zar).toBe(29700);
  });

  it('applies minimum agency fee of R1187', () => {
    // With very small duties, agency fee should be the minimum
    const smallData = {
      ...sampleData,
      products: [
        {
          invoice_value: '100',
          duty_percent: '1',
          duty_schedule1_percent: '0',
          currency: 'USD',
          weight_kg: '10',
        },
      ],
    };
    const result = calculateAllTotals(smallData);
    expect(result.agency_fee_zar).toBe(1187);
  });

  it('rounds all values to 2 decimal places', () => {
    const result = calculateAllTotals(sampleData);
    for (const [_key, val] of Object.entries(result)) {
      if (typeof val === 'number') {
        const decimalPlaces = (val.toString().split('.')[1] || '').length;
        expect(decimalPlaces).toBeLessThanOrEqual(2);
      }
    }
  });

  it('handles empty/minimal data without crashing', () => {
    expect(() => calculateAllTotals({})).not.toThrow();
    const result = calculateAllTotals({});
    expect(result.customs_value_zar).toBe(0);
    expect(result.ocean_freight_zar).toBe(0);
  });

  it('handles CIF incoterms by excluding ocean freight from shipping allocation', () => {
    const cifData = { ...sampleData, inco_terms: 'CIF' };
    const fobResult = calculateAllTotals(sampleData);
    const cifResult = calculateAllTotals(cifData);
    // CIF total_in_warehouse_cost should be less because ocean freight + origin charges are excluded
    expect(cifResult.total_in_warehouse_cost_zar).toBeLessThan(
      fobResult.total_in_warehouse_cost_zar
    );
  });

  it('calculates cost per kg when weight is provided', () => {
    const result = calculateAllTotals(sampleData);
    expect(result.all_in_warehouse_cost_per_kg_zar).toBeGreaterThan(0);
    expect(result.overhead_cost_per_kg_zar).toBeGreaterThan(0);
  });

  it('returns 0 cost per kg when weight is 0', () => {
    const noWeightData = {
      ...sampleData,
      total_gross_weight_kg: '0',
      products: [
        {
          invoice_value: '10000',
          duty_percent: '10',
          duty_schedule1_percent: '0',
          currency: 'USD',
          weight_kg: '0',
        },
      ],
    };
    const result = calculateAllTotals(noWeightData);
    expect(result.all_in_warehouse_cost_per_kg_zar).toBe(0);
    expect(result.overhead_cost_per_kg_zar).toBe(0);
  });

  it('keeps FOB goods value out of transport totals when it matches invoice totals', () => {
    const fobGoodsValueData = {
      ...sampleData,
      origin_charge_usd: '10000', // matches the product invoice_value
    };
    const result = calculateAllTotals(fobGoodsValueData);
    expect(result.origin_charge_zar).toBe(180000);
    expect(result.total_shipping_cost_zar).toBe(36000);
    expect(result.total_landed_cost_zar).toBe(234000);
  });

  it('includes ocean freight when a copied CIF estimate is changed to FOB', () => {
    const copiedCifData = {
      ...sampleData,
      inco_terms: 'CIF',
      ocean_freight_usd: '2000',
      local_cartage_cpt_klapmuts_20ton_zar: '1000',
      shipping_line_charges_zar: '500',
      origin_charge_usd: '0',
    };
    const changedToFobData = {
      ...copiedCifData,
      inco_terms: 'FOB',
      origin_charge_usd: '10000',
    };

    const cifResult = calculateAllTotals(copiedCifData);
    const fobResult = calculateAllTotals(changedToFobData);

    expect(cifResult.total_landed_cost_zar).toBe(199500);
    expect(fobResult.total_shipping_cost_zar).toBe(37500);
    expect(fobResult.total_landed_cost_zar).toBe(235500);
  });
});

// ── formatCurrency ──

describe('formatCurrency', () => {
  it('formats ZAR value with currency symbol', () => {
    const formatted = formatCurrency(1234.56);
    // Should contain the number portion
    expect(formatted).toContain('1');
    expect(formatted).toContain('234');
    expect(formatted).toContain('56');
  });

  it('returns dash for null/undefined/NaN', () => {
    expect(formatCurrency(null)).toBe('-');
    expect(formatCurrency(undefined)).toBe('-');
    expect(formatCurrency(NaN)).toBe('-');
  });

  it('formats 0 as a valid currency value', () => {
    const formatted = formatCurrency(0);
    expect(formatted).not.toBe('-');
    expect(formatted).toContain('0');
  });
});

// ── formatNumber ──

describe('formatNumber', () => {
  it('formats number with 2 decimal places by default', () => {
    const formatted = formatNumber(1234.5);
    expect(formatted).toContain('234');
    expect(formatted).toContain('50');
  });

  it('respects custom decimal places', () => {
    const formatted = formatNumber(1234.5678, 3);
    expect(formatted).toContain('568');
  });

  it('returns dash for null/undefined/NaN', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
    expect(formatNumber(NaN)).toBe('-');
  });
});
