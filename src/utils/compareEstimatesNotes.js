/**
 * Plain-English "why is A cheaper/dearer than B" notes for Import Costing's
 * Compare Estimates view and its PDF export. Works from the raw estimates plus
 * their calculateAllTotals() output, and splits each foreign-currency cost
 * difference into a price effect (the quote itself changed) and an exchange
 * rate effect (same quote, different ROE), since that's the question people
 * actually ask when two quotes for the same product land months apart.
 */
import { formatCurrency, formatNumber, calculateCrusadersLocalCharges } from './costingCalculations';

const LOCAL_CHARGE_LABELS = {
  local_cartage_cpt_klapmuts_20ton_zar: 'Local Cartage: CPT to Klapmuts (<20 Ton)',
  local_cartage_cpt_klapmuts_28ton_zar: 'Local Cartage: CPT to Klapmuts (21-28 Ton)',
  transport_dbn_to_pretoria_20ft_zar: 'Transport: DBN Port to Pretoria (20FT)',
  transport_dbn_to_pretoria_40ft_zar: 'Transport: DBN Port to Pretoria (40FT)',
  transport_dbn_to_whs_zar: 'Transport: DBN Port to WHS',
  unpack_reload_zar: 'Unpack / Reload',
  storage_zar: 'Storage',
  outlying_depot_surcharge_zar: 'Outlying Container Depot Surcharge',
  local_cartage_dbn_whs_pretoria_opt_a_zar: 'Local Cartage: DBN WHS to PTA (Tautliner A)',
  local_cartage_dbn_whs_pretoria_opt_b_zar: 'Local Cartage: DBN WHS to PTA (Tautliner B)',
  local_cartage_dbn_whs_pretoria_6m_zar: 'Local Cartage: DBN WHS to PTA (6M Deck)',
  local_cartage_dbn_whs_pretoria_12m_zar: 'Local Cartage: DBN WHS to PTA (12M Deck)',
  transport_pe_coega_to_pretoria_zar: 'Transport: PE/Coega Port to Pretoria',
  transport_plz_to_east_london_zar: 'Transport: PLZ Port to East London',
};

const DESTINATION_CHARGE_LABELS = {
  shipping_line_charges_zar: 'Shipping Line Charges',
  cargo_dues_20ft_zar: 'Cargo Dues (20FT)',
  cargo_dues_40ft_zar: 'Cargo Dues (40FT)',
  cto_fee_zar: 'CTO Fee',
  port_health_inspection_zar: 'Port Health Inspection',
  daff_inspection_zar: 'DAFF Inspection',
  state_vet_cancellation_fee_zar: 'State Vet Cancellation Fee',
  jnb_turn_in_zar: 'JNB Turn In',
  plz_turn_in_zar: 'PLZ Turn In',
  bill_of_lading_fee_zar: 'Bill of Lading Fee',
  manifest_filing_zar: 'RCG Manifest Filing',
  currency_adjustment_factor_zar: 'Currency Adjustment Factor (CAF)',
  degrouping_zar: 'Degrouping',
  edi_fee_zar: 'EDI Fee',
  communication_dest_zar: 'Communication',
  documentation_fee_dest_zar: 'Documentation Fee',
  cfs_lcl_handling_out_zar: 'CFS LCL Handling Out',
  delivery_release_order_zar: 'Delivery Release Order (DRO)',
  cartage_dest_zar: 'Cartage',
  fuel_surcharge_dest_zar: 'Fuel Surcharge',
  agency_fee_dest_zar: 'Agency Fee',
  handover_fee_zar: 'Handover Fee',
  facility_fee_zar: 'Facility Fee',
};

const CRUSADERS_PARTS = [
  ['unpackTotal', 'Unpacking'],
  ['distributionTotal', 'Distribution'],
  ['palletSupplyTotal', 'Pallet Supply'],
  ['handlingTotal', 'Handling In/Out'],
  ['warehousingTotal', 'Warehousing'],
  ['clearingForwardingTotal', 'Clearing & Forwarding'],
  ['coldRoomTotal', 'Cold Room'],
];

const num = (v) => parseFloat(v) || 0;
const EPS = 0.005;
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${formatCurrency(Math.abs(v))}`;
const pct = (from, to) => (from ? ((to - from) / Math.abs(from)) * 100 : null);
const pctText = (p) => (p === null ? '' : ` (${p > 0 ? '+' : ''}${p.toFixed(1)}%)`);
const fx = (v, cur) => `${cur} ${formatNumber(v)}`;
const roeOf = (est) => num(est.roe_origin) || num(est.roe_customs);
const customsRoeOf = (est) => num(est.roe_customs) || num(est.roe_origin);
const isFobType = (est) => ['FOB', 'FCA', 'EXW'].includes((est.inco_terms || '').toUpperCase());
const weightOf = (est) => {
  const w = (est.products || []).reduce((s, p) => s + num(p.weight_kg), 0);
  return w > 0 ? w : num(est.total_gross_weight_kg);
};

// Split a cost quoted in USD + EUR into price effect vs exchange-rate effect.
// diff = (qtyB - qtyA) * roeA  [price]  +  qtyB * (roeB - roeA)  [fx]
const splitFx = (usdA, usdB, eurA, eurB, roeUsdA, roeUsdB, roeEurA, roeEurB) => ({
  price: (usdB - usdA) * roeUsdA + (eurB - eurA) * roeEurA,
  fx: usdB * (roeUsdB - roeUsdA) + eurB * (roeEurB - roeEurA),
});

const quoteText = (usd, eur) => {
  const parts = [];
  if (usd) parts.push(fx(usd, 'USD'));
  if (eur) parts.push(fx(eur, 'EUR'));
  return parts.join(' + ') || 'nil';
};

const effectText = ({ price, fx: fxEffect }) => {
  if (Math.abs(price) < EPS || Math.abs(fxEffect) < EPS) return '';
  return ` Of that, ${signed(price)} is the quoted price and ${signed(fxEffect)} is the exchange rate.`;
};

// Top-N line items that differ between two estimates, largest move first.
const lineItemDiffs = (estA, estB, labels, limit = 3) => Object.entries(labels)
  .map(([key, label]) => ({ label, a: num(estA[key]), b: num(estB[key]) }))
  .filter(item => Math.abs(item.b - item.a) >= EPS)
  .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a))
  .slice(0, limit)
  .map(item => `${item.label} ${formatCurrency(item.a)} vs ${formatCurrency(item.b)}`);

/**
 * @returns {Array<{ text: string, direction: 'up'|'down'|'info' }>} notes, read as
 *   "B relative to A" ('up' = B costs more, 'down' = B costs less).
 */
export function buildCompareEstimateNotes(estA, estB, totalsA, totalsB) {
  if (!estA || !estB || !totalsA || !totalsB) return [];
  const notes = [];
  const push = (text, diff) => notes.push({ text, direction: diff > EPS ? 'up' : diff < -EPS ? 'down' : 'info' });

  const roeA = roeOf(estA);
  const roeB = roeOf(estB);
  const eurA = num(estA.roe_eur);
  const eurB = num(estB.roe_eur);

  // --- Headline: which estimate is cheaper, and the three buckets that sum to the gap ---
  const landedDiff = num(totalsB.total_landed_cost_zar) - num(totalsA.total_landed_cost_zar);
  if (Math.abs(landedDiff) >= EPS) {
    const cheaper = landedDiff > 0 ? 'A' : 'B';
    const goods = num(totalsB.customs_value_zar) - num(totalsA.customs_value_zar);
    const customs = num(totalsB.customs_subtotal_zar) - num(totalsA.customs_subtotal_zar);
    const shipping = landedDiff - goods - customs;
    const drivers = [['goods value', goods], ['duties & clearing fees', customs], ['shipping & handling', shipping]]
      .filter(([, v]) => Math.abs(v) >= EPS)
      .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
      .map(([label, v]) => `${label} ${signed(v)}`);
    const landedPct = pct(num(totalsA.total_landed_cost_zar), num(totalsB.total_landed_cost_zar));
    push(`Estimate ${cheaper} is cheaper by ${formatCurrency(Math.abs(landedDiff))}${landedPct === null ? '' : ` (${Math.abs(landedPct).toFixed(1)}%)`} in total landed cost. B vs A breakdown: ${drivers.join('; ')}.`, landedDiff);
  } else {
    push('Both estimates have the same total landed cost.', 0);
  }

  // --- Context: things that make the two quotes not like-for-like ---
  const context = [];
  if ((estA.transport_mode || 'sea') !== (estB.transport_mode || 'sea')) context.push(`transport mode (${estA.transport_mode || 'sea'} vs ${estB.transport_mode || 'sea'})`);
  if ((estA.inco_terms || '') !== (estB.inco_terms || '')) context.push(`Incoterms (${estA.inco_terms || '-'} vs ${estB.inco_terms || '-'})`);
  if ((estA.container_type || '') !== (estB.container_type || '') && estA.transport_mode !== 'air' && estB.transport_mode !== 'air') context.push(`container type (${estA.container_type || '-'} vs ${estB.container_type || '-'})`);
  if (num(estA.quantity) !== num(estB.quantity)) context.push(`container quantity (${num(estA.quantity)} vs ${num(estB.quantity)})`);
  const wA = weightOf(estA);
  const wB = weightOf(estB);
  if (Math.abs(wA - wB) >= 0.01) context.push(`shipment weight (${formatNumber(wA)} kg vs ${formatNumber(wB)} kg) - per-kg figures spread fixed costs over different weights`);
  if (context.length) push(`Not like-for-like: different ${context.join('; ')}.`, 0);

  // --- Exchange rate ---
  const dateA = new Date(estA.costing_date || estA.created_at);
  const dateB = new Date(estB.costing_date || estB.created_at);
  const daysApart = !isNaN(dateA) && !isNaN(dateB) ? Math.round(Math.abs(dateB - dateA) / 86400000) : 0;
  const roeParts = [];
  if (roeA && roeB && Math.abs(roeA - roeB) > 0.00005) {
    roeParts.push(`USD/ZAR ${formatNumber(roeA, 4)} (A) vs ${formatNumber(roeB, 4)} (B), the rand is ${Math.abs(pct(roeA, roeB)).toFixed(1)}% ${roeB < roeA ? 'stronger' : 'weaker'} in B`);
  }
  if (eurA && eurB && Math.abs(eurA - eurB) > 0.00005) {
    roeParts.push(`EUR/ZAR ${formatNumber(eurA, 4)} (A) vs ${formatNumber(eurB, 4)} (B)`);
  }
  if (roeParts.length) {
    push(`Exchange rate: ${roeParts.join('; ')}${daysApart ? ` (estimates are ${daysApart} days apart)` : ''}. This moves every foreign-currency cost even where the supplier and freight quotes are unchanged.`, roeB - roeA);
  }

  // --- Goods value (supplier price) ---
  const sumBy = (est, cur) => (est.products || []).reduce((s, p) => s + (((p.currency || 'USD') === cur) ? num(p.invoice_value) : 0), 0);
  const goodsUsdA = sumBy(estA, 'USD'); const goodsUsdB = sumBy(estB, 'USD');
  const goodsEurA = sumBy(estA, 'EUR'); const goodsEurB = sumBy(estB, 'EUR');
  const goodsDiff = num(totalsB.customs_value_zar) - num(totalsA.customs_value_zar);
  if (Math.abs(goodsDiff) >= EPS) {
    const split = splitFx(goodsUsdA, goodsUsdB, goodsEurA, goodsEurB, customsRoeOf(estA), customsRoeOf(estB), eurA, eurB);
    const foreignA = goodsUsdA + goodsEurA;
    const foreignB = goodsUsdB + goodsEurB;
    const perKg = (goodsEurA === 0 && goodsEurB === 0 && wA > 0 && wB > 0)
      ? ` (USD ${formatNumber(goodsUsdA / wA, 4)}/kg vs USD ${formatNumber(goodsUsdB / wB, 4)}/kg)`
      : '';
    const supplierLine = foreignA || foreignB
      ? `Supplier price ${quoteText(goodsUsdA, goodsEurA)} vs ${quoteText(goodsUsdB, goodsEurB)}${perKg}. `
      : '';
    push(`Goods value: ${supplierLine}In rand, B is ${signed(goodsDiff)}${pctText(pct(num(totalsA.customs_value_zar), num(totalsB.customs_value_zar)))}.${effectText(split)}`, goodsDiff);
  }
  if (isFobType(estA) || isFobType(estB)) {
    push('Under FOB/FCA/EXW, "Origin Charges" is the FOB value of the goods (not a shipping fee), so it moves with the goods value and is not added to Total Shipping Cost.', 0);
  }

  // --- Freight ---
  const modeA = estA.transport_mode || 'sea';
  const modeB = estB.transport_mode || 'sea';
  if (modeA === modeB && modeA === 'sea') {
    const diff = num(totalsB.total_ocean_freight_zar) - num(totalsA.total_ocean_freight_zar);
    if (Math.abs(diff) >= EPS) {
      const split = splitFx(num(estA.ocean_freight_usd), num(estB.ocean_freight_usd), num(estA.ocean_freight_eur), num(estB.ocean_freight_eur), roeA, roeB, eurA, eurB);
      const lines = (estA.shipping_line || estB.shipping_line) && estA.shipping_line !== estB.shipping_line
        ? ` Shipping line: ${estA.shipping_line || '-'} vs ${estB.shipping_line || '-'}.` : '';
      push(`Ocean freight: quoted ${quoteText(num(estA.ocean_freight_usd), num(estA.ocean_freight_eur))} (A) vs ${quoteText(num(estB.ocean_freight_usd), num(estB.ocean_freight_eur))} (B), B is ${signed(diff)}${pctText(pct(num(totalsA.total_ocean_freight_zar), num(totalsB.total_ocean_freight_zar)))}.${effectText(split)}${lines}`, diff);
    }
  } else if (modeA === modeB && modeA === 'air') {
    const diff = num(totalsB.total_airfreight_cost_zar) - num(totalsA.total_airfreight_cost_zar);
    if (Math.abs(diff) >= EPS) {
      const cw = num(totalsA.chargeable_weight_kg) !== num(totalsB.chargeable_weight_kg)
        ? ` Chargeable weight ${formatNumber(totalsA.chargeable_weight_kg)} kg vs ${formatNumber(totalsB.chargeable_weight_kg)} kg.` : '';
      push(`Airfreight: rate ${quoteText(num(estA.airfreight_usd), num(estA.airfreight_eur))} (A) vs ${quoteText(num(estB.airfreight_usd), num(estB.airfreight_eur))} (B); total airfreight cost B is ${signed(diff)}.${cw}`, diff);
    }
  } else if (modeA === modeB && modeA === 'road') {
    const diff = num(estB.road_freight_zar) - num(estA.road_freight_zar);
    if (Math.abs(diff) >= EPS) push(`Road freight: ${formatCurrency(num(estA.road_freight_zar))} (A) vs ${formatCurrency(num(estB.road_freight_zar))} (B), B is ${signed(diff)}.`, diff);
  }

  // --- Local charges ---
  const localDiff = num(totalsB.local_charges_subtotal_zar) - num(totalsA.local_charges_subtotal_zar);
  if (Math.abs(localDiff) >= EPS) {
    const provA = estA.local_charges_provider === 'crusaders' ? 'Crusaders' : 'AGX';
    const provB = estB.local_charges_provider === 'crusaders' ? 'Crusaders' : 'AGX';
    let detail;
    if (provA !== provB) {
      detail = `different provider (${provA} vs ${provB})`;
    } else if (provA === 'Crusaders') {
      const cA = calculateCrusadersLocalCharges(estA);
      const cB = calculateCrusadersLocalCharges(estB);
      detail = CRUSADERS_PARTS.filter(([k]) => Math.abs(cB[k] - cA[k]) >= EPS)
        .map(([k, label]) => `${label} ${formatCurrency(cA[k])} vs ${formatCurrency(cB[k])}`).join('; ');
    } else {
      detail = lineItemDiffs(estA, estB, LOCAL_CHARGE_LABELS).join('; ');
    }
    const whDiff = num(totalsB.warehouse_charges_subtotal_zar) - num(totalsA.warehouse_charges_subtotal_zar);
    const wh = Math.abs(whDiff) >= EPS ? `${detail ? '; ' : ''}warehouse charges ${signed(whDiff)}` : '';
    push(`Local charges: B is ${signed(localDiff)}${pctText(pct(num(totalsA.local_charges_subtotal_zar), num(totalsB.local_charges_subtotal_zar)))}${detail || wh ? ` - ${detail}${wh}` : ''}.`, localDiff);
  }

  // --- Destination charges ---
  const destDiff = num(totalsB.destination_charges_subtotal_zar) - num(totalsA.destination_charges_subtotal_zar);
  if (Math.abs(destDiff) >= EPS) {
    const detail = lineItemDiffs(estA, estB, DESTINATION_CHARGE_LABELS).join('; ');
    push(`Destination charges: B is ${signed(destDiff)}${detail ? ` - ${detail}` : ''}.`, destDiff);
  }

  // --- Last mile ---
  const lmDiff = num(totalsB.last_mile_charges_subtotal_zar) - num(totalsA.last_mile_charges_subtotal_zar);
  if (Math.abs(lmDiff) >= EPS) {
    push(`Last mile: B is ${signed(lmDiff)}. Last mile is counted in Total Shipping Cost but not in Total Landed Cost.`, lmDiff);
  }

  // --- Duties, agency fee, VAT ---
  const dutyDiff = num(totalsB.total_duties_zar) - num(totalsA.total_duties_zar);
  if (Math.abs(dutyDiff) >= EPS) {
    const rateA = num(totalsA.customs_value_zar) ? (num(totalsA.total_duties_zar) / num(totalsA.customs_value_zar)) * 100 : 0;
    const rateB = num(totalsB.customs_value_zar) ? (num(totalsB.total_duties_zar) / num(totalsB.customs_value_zar)) * 100 : 0;
    const why = Math.abs(rateA - rateB) < 0.05
      ? `same effective duty rate (${rateA.toFixed(1)}%), so duties, the agency fee (% of duties + VAT) and import VAT all follow the goods value`
      : `effective duty rate ${rateA.toFixed(1)}% (A) vs ${rateB.toFixed(1)}% (B) - check HS codes / duty % per product`;
    push(`Duties: B is ${signed(dutyDiff)} - ${why}.`, dutyDiff);
  }
  const declDiff = num(estB.customs_declaration_zar) - num(estA.customs_declaration_zar);
  if (Math.abs(declDiff) >= EPS) {
    push(`Customs declaration fee: ${formatCurrency(num(estA.customs_declaration_zar))} (A) vs ${formatCurrency(num(estB.customs_declaration_zar))} (B).`, declDiff);
  }
  if (Math.abs(num(totalsB.import_vat_zar) - num(totalsA.import_vat_zar)) >= EPS) {
    push('Import VAT moves with goods value + duties, but it is not included in Total Landed Cost.', 0);
  }

  return notes;
}
