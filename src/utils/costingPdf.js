/**
 * PDF generation utilities for Import Costing
 * Extracted from ImportCosting.jsx for maintainability
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calculateAllTotals, formatCurrency, formatNumber, LAST_MILE_SERVICE_TYPES, getLastMileRate } from './costingCalculations';

// === Design tokens (shared across the PDF) ==============================
// Single palette so every section feels of-a-piece. Section identity is
// preserved through hue, but all values share the same depth/saturation.
const THEME = {
  // Brand panels
  panelDark:    [14, 37, 68],     // #0E2544 — primary navy used in cover bar + Summary card
  panelDarkAir: [55, 28, 130],    // #371C82 — air freight variant

  // Section accents (used for divider bars + autoTable head fills)
  navy:    [14, 37, 68],
  ocean:   [29, 78, 137],
  green:   [22, 101, 52],
  amber:   [161, 98, 7],
  purple:  [91, 33, 182],

  // Text
  headingMuted: [184, 198, 217],  // #B8C6D9 — tracked labels on dark, also support-row labels
  bodyDark:     [31, 41, 55],     // #1F2937 — table body text
  bodyMuted:    [107, 114, 128],  // #6B7280 — secondary text on light surfaces

  // Surfaces
  rowAlt:      [248, 250, 252],   // #F8FAFC — single alternate-row tone everywhere
  surfaceSoft: [241, 245, 249],   // #F1F5F9 — header info strip
};

/**
 * Compute autoTable columnStyles with cellWidth sized to actual content.
 * Measures the widest rendered string per column (header + body) at the
 * given font size and adds horizontal padding. Prevents currency/numeric
 * values from line-wrapping when amounts grow beyond eyeballed constants.
 *
 * @param {jsPDF} doc
 * @param {Array<Array<string>>} head  e.g. [['Product', 'Weight\n(kg)', ...]]
 * @param {Array<Array<string>>} body  rendered row strings
 * @param {object} options
 *   fontSize        - body font size (must match autoTable styles.fontSize)
 *   headFontSize    - header font size (must match headStyles.fontSize)
 *   paddingX        - horizontal cell padding total in mm (left + right)
 *   minWidth        - default min column width in mm
 *   maxTotalWidth   - if set, table is scaled down proportionally to fit
 *   overrides       - per-column: { halign, fontStyle, overflow, minWidth,
 *                     maxWidth, cellWidth (forces exact width) }
 * @returns {object} columnStyles keyed by column index
 */
const computeColumnWidths = (doc, head, body, options = {}) => {
  const {
    fontSize = 6,
    headFontSize = 6,
    paddingX = 2,
    minWidth = 8,
    maxTotalWidth = null,
    overrides = {},
  } = options;

  const headerRow = head[0] || [];
  const columnCount = Math.max(headerRow.length, ...body.map(r => r.length));
  const prevFontSize = doc.getFontSize();

  const widestLine = (text) => {
    const lines = String(text ?? '').split('\n');
    return lines.reduce((max, line) => Math.max(max, doc.getTextWidth(line)), 0);
  };

  doc.setFontSize(headFontSize);
  const headerWidths = Array.from({ length: columnCount }, (_, i) =>
    widestLine(headerRow[i])
  );

  doc.setFontSize(fontSize);
  const bodyWidths = new Array(columnCount).fill(0);
  body.forEach(row => {
    row.forEach((cell, i) => {
      if (i >= columnCount) return;
      const w = widestLine(cell);
      if (w > bodyWidths[i]) bodyWidths[i] = w;
    });
  });

  doc.setFontSize(prevFontSize);

  const widths = [];
  for (let i = 0; i < columnCount; i++) {
    const ov = overrides[i] || {};
    if (typeof ov.cellWidth === 'number') {
      widths.push(ov.cellWidth);
      continue;
    }
    const content = Math.max(headerWidths[i], bodyWidths[i]);
    let w = content + paddingX;
    const colMin = ov.minWidth ?? minWidth;
    const colMax = ov.maxWidth ?? Infinity;
    if (w < colMin) w = colMin;
    if (w > colMax) w = colMax;
    widths.push(w);
  }

  if (maxTotalWidth) {
    const total = widths.reduce((s, w) => s + w, 0);
    if (total > maxTotalWidth) {
      const scale = maxTotalWidth / total;
      for (let i = 0; i < widths.length; i++) widths[i] = widths[i] * scale;
    }
  }

  const columnStyles = {};
  for (let i = 0; i < columnCount; i++) {
    const ov = overrides[i] || {};
    columnStyles[i] = { cellWidth: widths[i] };
    if (ov.halign) columnStyles[i].halign = ov.halign;
    if (ov.fontStyle) columnStyles[i].fontStyle = ov.fontStyle;
    if (ov.overflow) columnStyles[i].overflow = ov.overflow;
  }

  return columnStyles;
};

const zeroCurrencyPattern = /(?:R|US\$|\$|€|EUR|USD|ZAR)\s*-?0(?:[,.]00)?\b|-?0[,.]00\s*(?:ZAR|USD|EUR)\b/i;

const cleanZeroCurrencyCell = (cell) => {
  if (typeof cell !== 'string') return cell;

  const lines = cell.split('\n').filter(line => !zeroCurrencyPattern.test(line.trim()));
  return lines.join('\n');
};

const cleanZeroCurrencyRows = (rows) => rows.map(row => row.map(cleanZeroCurrencyCell));

const removeEmptyColumns = (head, body, alwaysKeep = []) => {
  const headerRow = head[0] || [];
  const keepSet = new Set(alwaysKeep);
  const keepIndexes = headerRow
    .map((_, index) => index)
    .filter(index => {
      if (keepSet.has(index)) return true;
      return body.some(row => {
        const value = row[index];
        return value !== null && value !== undefined && String(value).trim() !== '';
      });
    });

  return {
    head: [keepIndexes.map(index => headerRow[index])],
    body: body.map(row => keepIndexes.map(index => row[index])),
    keepIndexes,
  };
};

// Shared helper: filter rows where the last column is zero or empty/dash,
// then blank any remaining zero-currency cells inside visible rows.
const filterZeroRows = (rows) => cleanZeroCurrencyRows(rows.filter(row => {
  const value = row[row.length - 1];
  if (value === '-' || value === '' || value === null || value === undefined) return false;
  if (typeof value === 'string') {
    if (value.trim() === '-') return false;
    const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return !isNaN(numericValue) && numericValue !== 0;
  }
  return value !== 0;
}));

// Format date nicely (e.g. "03 Mar 2026")
const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatPercentChange = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

// Shared helper: calculate product weight/customs/duties totals
const getProductTotals = (estimate) => {
  const products = estimate.products || [];
  const roeCustoms = parseFloat(estimate.roe_customs) || parseFloat(estimate.roe_origin) || 0;
  const roeEur = parseFloat(estimate.roe_eur) || roeCustoms;
  let totalWeight = 0;
  let totalCustomsValue = 0;
  let totalDuties = 0;

  products.forEach(p => {
    const weight = parseFloat(p.weight_kg) || 0;
    const invoiceValue = parseFloat(p.invoice_value) || 0;
    const dutyPercent = parseFloat(p.duty_percent) || 0;
    const dutySchedule1Percent = parseFloat(p.duty_schedule1_percent) || 0;
    const currency = p.currency || 'USD';

    let roe = roeCustoms;
    if (currency === 'EUR') roe = roeEur;
    if (currency === 'ZAR') roe = 1;

    const customsValue = invoiceValue * roe;
    const duties = customsValue * ((dutyPercent + dutySchedule1Percent) / 100);

    totalWeight += weight;
    totalCustomsValue += customsValue;
    totalDuties += duties;
  });

  return { totalWeight, totalCustomsValue, totalDuties };
};

const buildLastMileRows = (totals) => {
  const visibleLines = (totals._last_mile_charge_lines || []).filter(line =>
    (line?.calculated?.subtotal_zar || 0) > 0
  );

  const rows = visibleLines.map((line, index) => {
    const service = LAST_MILE_SERVICE_TYPES.find(s => s.value === line.service_type)?.label || line.service_type || '-';
    const route = getLastMileRate(line.service_type, line.route)?.label || line.route || '-';
    const calculated = line.calculated || {};
    const weight = calculated.weight_kg || 0;
    const fuel = calculated.fuel_levy_zar || 0;
    const extras = parseFloat(line.extra_charges_zar) || 0;
    const subtotal = calculated.subtotal_zar || 0;

    return [
      `${index + 1}. ${service}\n${route}`,
      `${formatNumber(weight || 0)} kg`,
      formatCurrency(calculated.base_charge_zar || 0),
      `Fuel ${formatCurrency(fuel)}\nExtras ${formatCurrency(extras)}`,
      formatCurrency(subtotal),
      formatCurrency(weight > 0 ? subtotal / weight : 0),
    ];
  });

  if (totals.last_mile_charges_subtotal_zar > 0) {
    rows.push(['Sub-Total', '', '', '', formatCurrency(totals.last_mile_charges_subtotal_zar), '']);
  }

  return cleanZeroCurrencyRows(rows);
};

const buildWarehouseChargeRows = (estimate, totals) => {
  const weight = totals._warehouse_chargeable_weight_kg || 0;
  const handlingRate = parseFloat(estimate.warehouse_handling_rate_per_kg_zar) || 0;
  const handlingEvents = parseFloat(estimate.warehouse_handling_events) || 0;
  const storageRate = parseFloat(estimate.warehouse_storage_rate_per_kg_month_zar) || 0;
  const storageMonths = parseFloat(estimate.warehouse_storage_months) || 0;
  const rows = [];

  if (weight > 0 && handlingRate > 0 && handlingEvents > 0) {
    const handlingPerEvent = weight * handlingRate;
    rows.push([
      'Handling Fee - Receiving',
      `${formatNumber(handlingRate, 2)} ZAR/kg`,
      `${formatNumber(weight)} kg`,
      formatCurrency(handlingPerEvent),
    ]);

    if (handlingEvents >= 2) {
      rows.push([
        'Handling Fee - Dispatching',
        `${formatNumber(handlingRate, 2)} ZAR/kg`,
        `${formatNumber(weight)} kg`,
        formatCurrency(handlingPerEvent),
      ]);
    }

    if (handlingEvents > 2) {
      const additionalEvents = handlingEvents - 2;
      rows.push([
        'Handling Fee - Additional',
        `${formatNumber(handlingRate, 2)} ZAR/kg`,
        `${formatNumber(weight)} kg x ${formatNumber(additionalEvents, 2)} event${additionalEvents === 1 ? '' : 's'}`,
        formatCurrency(handlingPerEvent * additionalEvents),
      ]);
    }
  }

  if (weight > 0 && storageRate > 0 && storageMonths > 0) {
    rows.push([
      'Storage for a Month',
      `${formatNumber(storageRate, 2)} ZAR/kg/month`,
      `${formatNumber(weight)} kg x ${formatNumber(storageMonths, 2)} month${storageMonths === 1 ? '' : 's'}`,
      formatCurrency(totals.warehouse_storage_fee_zar),
    ]);
  }

  if (totals.warehouse_charges_subtotal_zar > 0) {
    rows.push(['Sub-Total', '', '', formatCurrency(totals.warehouse_charges_subtotal_zar)]);
  }

  return filterZeroRows(rows);
};

const renderWarehouseChargeTable = (doc, rows, startY, options = {}) => {
  if (rows.length === 0) return null;

  return autoTable(doc, {
    startY,
    head: [['Description', 'Rate', 'Basis', 'Amount']],
    body: rows,
    theme: options.theme || 'striped',
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontSize: options.headFontSize || 7.2,
    },
    alternateRowStyles: { fillColor: THEME.rowAlt },
    styles: {
      fontSize: options.fontSize || 7.2,
      cellPadding: { top: 1.8, right: 1.5, bottom: 1.8, left: 1.5 },
      overflow: 'linebreak',
      valign: 'middle',
      textColor: THEME.bodyDark,
    },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 36, halign: 'right' },
      2: { cellWidth: 56 },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const label = rows[data.row.index]?.[0] || '';
        if (label.startsWith('Sub-Total')) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [226, 232, 240];
        }
      }
    },
  });
};

const renderLastMileTable = (doc, rows, startY, options = {}) => {
  if (rows.length === 0) return null;

  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = pageWidth - 28;
  const head = [['Service / Route', 'Weight', 'Base', 'Fuel / Extras', 'Total', 'Final/kg']];
  const columnStyles = {
    0: { cellWidth: tableWidth * 0.38 },
    1: { cellWidth: tableWidth * 0.10, halign: 'right' },
    2: { cellWidth: tableWidth * 0.12, halign: 'right' },
    3: { cellWidth: tableWidth * 0.17, halign: 'right' },
    4: { cellWidth: tableWidth * 0.12, halign: 'right', fontStyle: 'bold' },
    5: { cellWidth: tableWidth * 0.11, halign: 'right', fontStyle: 'bold' },
  };

  return autoTable(doc, {
    startY,
    head,
    body: rows,
    theme: options.theme || 'striped',
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: options.headFontSize || 7,
      cellPadding: { top: 2, right: 1.2, bottom: 2, left: 1.2 },
    },
    alternateRowStyles: { fillColor: THEME.rowAlt },
    styles: {
      fontSize: options.fontSize || 7,
      cellPadding: { top: 2, right: 1.2, bottom: 2, left: 1.2 },
      overflow: 'linebreak',
      valign: 'middle',
      textColor: THEME.bodyDark,
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === rows.length - 1) {
        const lastLabel = rows[rows.length - 1]?.[0] || '';
        if (lastLabel.startsWith('Sub-Total')) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255, 237, 213];
        }
      }
    },
  });
};

const buildFinalChargeRows = (landsideRows, customsRows) => {
  const rows = [];

  landsideRows.forEach(row => {
    rows.push(['SA Landside', row[0], row[1] || '']);
  });

  customsRows.forEach(row => {
    rows.push(['Customs & Duties', row[0], row[1] || '']);
  });

  return cleanZeroCurrencyRows(rows);
};

// Calculate per-product full cost breakdown (matches ImportCosting calculateProductAllocation)
const getProductCostBreakdown = (product, estimate, totals, productTotals) => {
  const roeCustoms = parseFloat(estimate.roe_customs) || parseFloat(estimate.roe_origin) || 0;
  const roeEur = parseFloat(estimate.roe_eur) || roeCustoms;
  const weight = parseFloat(product.weight_kg) || 0;
  const invoiceValue = parseFloat(product.invoice_value) || 0;
  const dutyPercent = parseFloat(product.duty_percent) || 0;
  const dutySchedule1Percent = parseFloat(product.duty_schedule1_percent) || 0;
  const currency = product.currency || 'USD';

  let roe = roeCustoms;
  if (currency === 'EUR') roe = roeEur;
  if (currency === 'ZAR') roe = 1;

  const customsValue = invoiceValue * roe;
  const importDuty = customsValue * (dutyPercent / 100);
  const schedule1Duty = customsValue * (dutySchedule1Percent / 100);
  const totalDuties = importDuty + schedule1Duty;
  const weightRatio = productTotals.totalWeight > 0 ? weight / productTotals.totalWeight : 0;

  // For CIF/CIP/CFR, only allocate local + destination charges
  const incoTerms = (estimate.inco_terms || '').toUpperCase();
  const freightIncluded = ['CIF', 'CIP', 'CFR'].includes(incoTerms);
  let shippingToAllocate;
  if ((estimate.transport_mode || 'sea') === 'air') {
    shippingToAllocate = freightIncluded
      ? (totals.air_local_charges_subtotal_zar || 0) + (totals.warehouse_charges_subtotal_zar || 0) + (totals.airfreight_insurance_zar || 0)
      : Math.max((totals.total_shipping_cost_zar || 0) - (totals.last_mile_charges_subtotal_zar || 0), 0);
  } else if (freightIncluded) {
    shippingToAllocate = (totals.local_charges_subtotal_zar || 0) + (totals.destination_charges_subtotal_zar || 0);
  } else {
    shippingToAllocate = Math.max((totals.total_shipping_cost_zar || 0) - (totals.last_mile_charges_subtotal_zar || 0), 0);
  }
  const allocatedShipping = shippingToAllocate * weightRatio;
  const transportCostPerKg = weight > 0 ? allocatedShipping / weight : 0;
  const totalLanded = customsValue + totalDuties + allocatedShipping;
  const costPerKg = weight > 0 ? totalLanded / weight : 0;

  return { weight, weightRatio, invoiceValue, currency, customsValue, importDuty, schedule1Duty, totalDuties, allocatedShipping, transportCostPerKg, totalLanded, costPerKg };
};

// Draw a section divider with accent bar and tracked label.
// Editorial feel: bar in the section's accent color, label in the same
// hue with light letter-spacing so it reads as a "title" rather than just
// a heading.
const drawSectionDivider = (doc, y, label, color) => {
  // Accent bar — slightly wider/taller for confidence
  doc.setFillColor(color[0], color[1], color[2]);
  doc.rect(14, y - 3.2, 1.4, 5.6, 'F');
  // Section title with slight tracking for the editorial feel used in the
  // Summary card. Wrapped in try/catch since older jsPDF builds may lack
  // setCharSpace.
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(color[0], color[1], color[2]);
  try { doc.setCharSpace(0.25); } catch { /* */ }
  doc.text(label, 17.5, y + 1);
  try { doc.setCharSpace(0); } catch { /* */ }
  doc.setFont(undefined, 'normal');
  return y + 5;
};

// Check page break — if content would exceed page, add new page and return new Y
const checkPageBreak = (doc, y, neededHeight) => {
  const pageHeight = doc.internal.pageSize.height;
  if (y + neededHeight > pageHeight - 20) {
    doc.addPage();
    return 15;
  }
  return y;
};

// Presentation-currency helper: for export estimates, convert ZAR landed
// totals into the user-selected USD/EUR. Import estimates are left in ZAR.
const getPresentation = (estimate) => {
  const isExport = estimate.direction === 'export';
  const currency = isExport
    ? (estimate.presentation_currency === 'EUR' ? 'EUR' : 'USD')
    : 'ZAR';
  const rate = parseFloat(
    currency === 'EUR' ? estimate.roe_eur : estimate.roe_origin
  ) || 0;
  const toPresentation = (zar) => (isExport && rate > 0 ? zar / rate : zar);
  return { isExport, currency, rate, toPresentation };
};

// Shared helper: render header, ROE info, shipment details, and products table
const buildEstimateHeader = (doc, estimate, productTotals, totals) => {
  const products = estimate.products || [];
  const isAir = (estimate.transport_mode || 'sea') === 'air';
  const isExport = estimate.direction === 'export';
  const pageWidth = doc.internal.pageSize.width;
  const { currency: presCur, toPresentation } = getPresentation(estimate);

  // === FULL-WIDTH COLOR BAR ===
  const barColor = isAir ? THEME.panelDarkAir : THEME.panelDark;
  doc.setFillColor(barColor[0], barColor[1], barColor[2]);
  doc.rect(0, 0, pageWidth, 16, 'F');

  // "SYNERCORE" left side
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('SYNERCORE', 10, 11);

  // Estimate type right side
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  const direction = isExport ? 'Export' : 'Import';
  const titleText = isAir ? `Air Freight ${direction} Cost Estimate` : `${direction} Cost Estimate`;
  const titleWidth = doc.getTextWidth(titleText);
  doc.text(titleText, pageWidth - titleWidth - 10, 11);

  // === LIGHT GRAY INFO STRIP ===
  doc.setFillColor(THEME.surfaceSoft[0], THEME.surfaceSoft[1], THEME.surfaceSoft[2]);
  doc.rect(0, 16, pageWidth, 9, 'F');
  doc.setFontSize(8);
  doc.setTextColor(THEME.bodyMuted[0], THEME.bodyMuted[1], THEME.bodyMuted[2]);
  doc.setFont(undefined, 'normal');
  const incoSegment = estimate.inco_terms ? `     Incoterm: ${estimate.inco_terms}` : '';
  const infoText = isExport
    ? `Reference: ${estimate.reference_number || 'N/A'}     Date: ${formatDate(estimate.costing_date)}     Exporter: ${estimate.supplier_name || 'N/A'}     Customer: ${estimate.customer_name || 'N/A'}${incoSegment}`
    : `Reference: ${estimate.reference_number || 'N/A'}     Date: ${formatDate(estimate.costing_date)}     Supplier: ${estimate.supplier_name || 'N/A'}${incoSegment}`;
  doc.text(infoText, 10, 22);

  // === ROE INFO BOX (right-aligned, below info strip) ===
  const roeBoxW = 62;
  const roeBoxH = 16;
  const roeBoxX = pageWidth - roeBoxW - 10;
  const roeBoxY = 27;

  // Light blue background
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.setLineWidth(0.3);
  doc.roundedRect(roeBoxX, roeBoxY, roeBoxW, roeBoxH, 1.5, 1.5, 'FD');

  // ROE text
  doc.setFontSize(7);
  doc.setTextColor(30, 64, 175);
  doc.setFont(undefined, 'bold');
  doc.text('ROE', roeBoxX + 2, roeBoxY + 4.5);
  doc.setFont(undefined, 'normal');
  doc.text(`Date: ${formatDate(estimate.costing_date)}`, roeBoxX + 2, roeBoxY + 8.5);
  doc.text(`USD/ZAR: ${formatNumber(estimate.roe_origin || 0, 4)}`, roeBoxX + 2, roeBoxY + 12.5);
  doc.text(`EUR/ZAR: ${formatNumber(estimate.roe_eur || 0, 4)}`, roeBoxX + 32, roeBoxY + 12.5);

  // === SHIPMENT DETAILS TABLE ===
  let startY = 46;
  startY = drawSectionDivider(doc, startY, 'Shipment Details', barColor);

  const shipmentRows = isAir
    ? filterZeroRows([
        ['Country of Origin', estimate.country_of_origin || '-'],
        ['Airport of Departure', estimate.airport_of_departure || '-'],
        ['Airport of Arrival', estimate.airport_of_arrival || '-'],
        ['Airline', estimate.airline_name || '-'],
        ['Flight Number', estimate.flight_number || '-'],
        ['INCO Terms', estimate.inco_terms || '-'],
        ['Transit Time', estimate.transit_time_days ? `${estimate.transit_time_days} days` : '-'],
        ['Actual Weight', `${formatNumber(estimate.actual_weight_kg || 0)} kg`],
        ['Chargeable Weight', `${formatNumber(totals.chargeable_weight_kg || 0)} kg`],
        ['Total Product Weight', `${formatNumber(productTotals.totalWeight || 0)} kg`],
      ])
    : filterZeroRows([
        ['Country of Origin', estimate.country_of_origin || '-'],
        ['Port of Loading', estimate.port_of_loading || '-'],
        ['Port of Discharge', estimate.port_of_discharge || '-'],
        ['Load Type', estimate.load_type || '-'],
        ['Container Type', estimate.container_type || '-'],
        ['Shipping Line', estimate.shipping_line || '-'],
        ['INCO Terms', estimate.inco_terms || '-'],
        ['Transit Time', estimate.transit_time_days ? `${estimate.transit_time_days} days` : '-'],
        ['Total Weight', `${formatNumber(productTotals.totalWeight || estimate.total_gross_weight_kg)} kg`],
      ]);

  autoTable(doc, {
    startY: startY + 1,
    body: shipmentRows,
    showHead: false,
    theme: 'striped',
    alternateRowStyles: { fillColor: THEME.rowAlt },
    styles: { fontSize: 8.5, textColor: THEME.bodyDark },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 55 },
    },
  });

  // === PRODUCT COST ALLOCATION TABLE ===
  if (products.length > 0) {
    if (totals) {
      const incoTerms = (estimate.inco_terms || '').toUpperCase();
      const freightIncluded = ['CIF', 'CIP', 'CFR'].includes(incoTerms);
      const shippingLabel = freightIncluded ? 'Alloc. Local Charges' : 'Alloc. Shipping';

      let sumWeight = 0, sumCustomsValue = 0, sumImportDuty = 0, sumSchedule1Duty = 0;
      let sumAllocatedShipping = 0, sumTotalLanded = 0;

      const allocationRows = products.reduce((rows, p) => {
        const bd = getProductCostBreakdown(p, estimate, totals, productTotals);
        if ((bd.costPerKg || 0) <= 0) return rows;

        sumWeight += bd.weight;
        sumCustomsValue += bd.customsValue;
        sumImportDuty += bd.importDuty;
        sumSchedule1Duty += bd.schedule1Duty;
        sumAllocatedShipping += bd.allocatedShipping;
        sumTotalLanded += bd.totalLanded;

        const productCostZar = bd.customsValue + bd.importDuty + bd.schedule1Duty;
        const productCostPerKg = bd.weight > 0 ? productCostZar / bd.weight : 0;
        rows.push([
          p.name || '-',
          formatNumber(bd.weight, 0),
          `${(bd.weightRatio * 100).toFixed(1)}%`,
          `${formatNumber(bd.invoiceValue, 2)} ${bd.currency}`,
          formatCurrency(bd.customsValue),
          formatCurrency(bd.importDuty),
          formatCurrency(bd.schedule1Duty),
          formatCurrency(productCostPerKg),
          formatCurrency(bd.allocatedShipping),
          formatCurrency(toPresentation(bd.totalLanded), presCur),
          formatCurrency(toPresentation(bd.costPerKg), presCur),
        ]);

        return rows;
      }, []);

      cleanZeroCurrencyRows(allocationRows).forEach((row, index) => {
        allocationRows[index] = row;
      });

      const sumCostPerKg = sumWeight > 0 ? sumTotalLanded / sumWeight : 0;
      const sumProductCostPerKg = sumWeight > 0 ? (sumCustomsValue + sumImportDuty + sumSchedule1Duty) / sumWeight : 0;
      if (allocationRows.length > 0 && sumCostPerKg > 0) {
        allocationRows.push([
        'TOTAL',
        formatNumber(sumWeight, 0),
        '100.0%',
        '',
        formatCurrency(sumCustomsValue),
        formatCurrency(sumImportDuty),
        formatCurrency(sumSchedule1Duty),
        formatCurrency(sumProductCostPerKg),
        formatCurrency(sumAllocatedShipping),
        formatCurrency(toPresentation(sumTotalLanded), presCur),
        formatCurrency(toPresentation(sumCostPerKg), presCur),
        ]);
      }

      cleanZeroCurrencyRows(allocationRows).forEach((row, index) => {
        allocationRows[index] = row;
      });

      if (allocationRows.length > 0) {
        let allocY = doc.lastAutoTable.finalY + 4;
        allocY = drawSectionDivider(doc, allocY, 'Product Cost Allocation', THEME.green);

        const landedHeader = isExport ? `Total\nLanded\n(${presCur})` : 'Total\nLanded';
        const costPerKgHeader = isExport ? `Cost/kg\n(${presCur})` : 'Cost/kg';
        const allocHead = [['Product', 'Weight kg', 'Wt %', 'Invoice Value', 'Customs Val\n(ZAR)', 'Import Duty', 'Sch1 Duty', 'Cost/kg\n(ZAR)', shippingLabel, landedHeader, costPerKgHeader]];
        const visibleAllocation = removeEmptyColumns(allocHead, allocationRows, [0, 1, 2, 9, 10]);
        const pageWidth = doc.internal.pageSize.getWidth();
        const dynamicOverrides = {};
        visibleAllocation.keepIndexes.forEach((originalIndex, newIndex) => {
          const header = visibleAllocation.head[0][newIndex] || '';
          dynamicOverrides[newIndex] = {
            halign: originalIndex === 0 ? 'left' : 'right',
            overflow: originalIndex === 0 ? 'linebreak' : undefined,
            minWidth: originalIndex === 0 ? 24 : originalIndex === 1 ? 14 : originalIndex === 5 ? 17 : 10,
            fontStyle: /Total|Cost\/kg/.test(header) ? 'bold' : undefined,
          };
        });
        const allocColumnStyles = computeColumnWidths(doc, visibleAllocation.head, visibleAllocation.body, {
          fontSize: 6,
          headFontSize: 6,
          paddingX: 2.5,
          maxTotalWidth: pageWidth - 28,
          overrides: dynamicOverrides,
        });

        autoTable(doc, {
        startY: allocY + 1,
        head: visibleAllocation.head,
        body: visibleAllocation.body,
        theme: 'striped',
        tableWidth: 'wrap',
        margin: { left: 14, right: 14 },
        headStyles: {
          fillColor: THEME.green,
          fontSize: 6,
          textColor: [255, 255, 255],
          halign: 'center',
          valign: 'middle',
          cellPadding: { top: 2, right: 1, bottom: 2, left: 1 },
        },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        styles: {
          fontSize: 6,
          cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
          overflow: 'linebreak',
        },
        columnStyles: allocColumnStyles,
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === visibleAllocation.body.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [229, 231, 235];
          }
        },
        });
      }
    }
  }
};

/**
 * Generate and save a full PDF for a cost estimate
 */
export function generateEstimatePDF(estimate) {
  const doc = new jsPDF();
  const totals = calculateAllTotals(estimate);
  const productTotals = getProductTotals(estimate);

  buildEstimateHeader(doc, estimate, productTotals, totals);

  const isAir = (estimate.transport_mode || 'sea') === 'air';
  const themeColor = isAir ? THEME.panelDarkAir : THEME.panelDark;
  const pageWidth = doc.internal.pageSize.width;
  const { isExport, currency: presCur, toPresentation } = getPresentation(estimate);
  const agencyFeeMinLabel = isExport
    ? `@ 3.5% min R${Math.round(parseFloat(estimate.agency_fee_min) || 1270)}`
    : `@ 3.5% min R${Math.round(parseFloat(estimate.agency_fee_min) || 1187)}`;
  let airFinalLandsideRows = [];

  // Helper to style sub-total rows in charge tables
  const chargeTableSubTotalHook = (rows) => (data) => {
    if (data.section === 'body' && data.row.index === rows.length - 1) {
      const lastLabel = rows[rows.length - 1]?.[0] || '';
      if (lastLabel.startsWith('Sub-Total') || lastLabel.startsWith('Total')) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [243, 244, 246];
      }
    }
  };

  if (isAir) {
    // === AIR FREIGHT PDF SECTIONS ===

    // Airfreight Charges
    const airRows = filterZeroRows([
      ['Airfreight (USD)', formatCurrency(estimate.airfreight_usd, 'USD'), formatCurrency(totals._airfreight_usd_zar)],
      ['Airfreight (EUR)', formatCurrency(estimate.airfreight_eur, 'EUR'), formatCurrency(totals._airfreight_eur_zar)],
      ['Origin Charges (USD)', formatCurrency(estimate.airfreight_origin_charges_usd, 'USD'), formatCurrency((parseFloat(estimate.airfreight_origin_charges_usd) || 0) * (parseFloat(estimate.roe_origin) || 0))],
      ['Origin Charges (EUR)', formatCurrency(estimate.airfreight_origin_charges_eur, 'EUR'), formatCurrency((parseFloat(estimate.airfreight_origin_charges_eur) || 0) * (parseFloat(estimate.roe_eur) || 0))],
    ]);
    if (totals.airfreight_total_zar > 0 || totals.airfreight_origin_charges_zar > 0) {
      airRows.push(['Airfreight + Origin Sub-Total', '', formatCurrency((totals.airfreight_total_zar || 0) + (totals.airfreight_origin_charges_zar || 0))]);
    }
    if (airRows.length > 0) {
      let secY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 30);
      secY = drawSectionDivider(doc, secY, 'Air Freight Rate & Origin', THEME.purple);
      autoTable(doc, {
        startY: secY + 1,
        head: [['Air Freight Rate & Origin', 'Amount', 'ZAR']],
        body: airRows,
        theme: 'striped',
        headStyles: { fillColor: THEME.purple, textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: THEME.rowAlt },
        didParseCell: chargeTableSubTotalHook(airRows),
      });
    }

    // Surcharges
    const surchargeRows = filterZeroRows([
      ['Fuel Surcharge (USD)', formatCurrency(estimate.fuel_surcharge_usd, 'USD'), formatCurrency((parseFloat(estimate.fuel_surcharge_usd) || 0) * (parseFloat(estimate.roe_origin) || 0))],
      ['Fuel Surcharge (EUR)', formatCurrency(estimate.fuel_surcharge_eur, 'EUR'), formatCurrency((parseFloat(estimate.fuel_surcharge_eur) || 0) * (parseFloat(estimate.roe_eur) || 0))],
      ['Security Surcharge (USD)', formatCurrency(estimate.security_surcharge_usd, 'USD'), formatCurrency((parseFloat(estimate.security_surcharge_usd) || 0) * (parseFloat(estimate.roe_origin) || 0))],
      ['Security Surcharge (EUR)', formatCurrency(estimate.security_surcharge_eur, 'EUR'), formatCurrency((parseFloat(estimate.security_surcharge_eur) || 0) * (parseFloat(estimate.roe_eur) || 0))],
    ]);
    if (totals.fuel_surcharge_total_zar > 0 || totals.security_surcharge_total_zar > 0) {
      surchargeRows.push(['Total Surcharges', '', formatCurrency((totals.fuel_surcharge_total_zar || 0) + (totals.security_surcharge_total_zar || 0))]);
    }
    if (surchargeRows.length > 0) {
      let secY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 30);
      secY = drawSectionDivider(doc, secY, 'Surcharges', THEME.purple);
      autoTable(doc, {
        startY: secY + 1,
        head: [['Surcharges', 'Amount', 'ZAR']],
        body: surchargeRows,
        theme: 'striped',
        headStyles: { fillColor: THEME.purple, textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: THEME.rowAlt },
        didParseCell: chargeTableSubTotalHook(surchargeRows),
      });
    }

    // SA Landside Charges
    const airLocalRows = filterZeroRows([
      ['Screening Fee', formatCurrency(estimate.screening_fee_zar)],
      ['Import Waybill Processing', formatCurrency(estimate.awb_fee_zar)],
      ['Airline Handling Fee', formatCurrency(estimate.airline_handling_fee_zar)],
      ['Airline Transfer Fee', formatCurrency(estimate.airport_transfer_fee_zar)],
      ['Cartage: Airport to Warehouse', formatCurrency(estimate.cartage_airport_to_whs_zar)],
      ['Air EDI Fee', formatCurrency(estimate.air_edi_fee_zar)],
      ['Import Documentation', formatCurrency(estimate.air_import_documentation_zar)],
      ['Airline Landside Delivery', formatCurrency(estimate.airline_landside_delivery_zar)],
      ['Insurance', formatCurrency(totals.airfreight_insurance_zar)],
    ]);
    if (totals.air_local_charges_subtotal_zar > 0 || totals.airfreight_insurance_zar > 0) {
      airLocalRows.push(['Sub-Total', formatCurrency((totals.air_local_charges_subtotal_zar || 0) + (totals.airfreight_insurance_zar || 0))]);
    }
    airFinalLandsideRows = airLocalRows;

  } else {
    // === SEA FREIGHT PDF SECTIONS ===

    // Ocean Freight
    const oceanFreightRows = filterZeroRows([
      ['Ocean Freight (USD)', formatCurrency(estimate.ocean_freight_usd, 'USD'), formatCurrency(totals._ocean_freight_usd_zar)],
      ['Ocean Freight (EUR)', formatCurrency(estimate.ocean_freight_eur, 'EUR'), formatCurrency(totals._ocean_freight_eur_zar)],
    ]);
    if (totals.total_ocean_freight_zar > 0) {
      oceanFreightRows.push(['Total Ocean Freight', '', formatCurrency(totals.total_ocean_freight_zar)]);
    }
    if (oceanFreightRows.length > 0) {
      let secY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 30);
      secY = drawSectionDivider(doc, secY, 'Ocean Freight', THEME.ocean);
      autoTable(doc, {
        startY: secY + 1,
        head: [['Ocean Freight', 'Amount', 'ZAR']],
        body: oceanFreightRows,
        theme: 'striped',
        headStyles: { fillColor: THEME.ocean, textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: THEME.rowAlt },
        didParseCell: chargeTableSubTotalHook(oceanFreightRows),
      });
    }

    // Origin Charges
    const originRows = filterZeroRows([
      ['Origin Charge (USD)', formatCurrency(estimate.origin_charge_usd, 'USD'), formatCurrency(totals._origin_charge_usd_zar)],
      ['Origin Charge (EUR)', formatCurrency(estimate.origin_charge_eur, 'EUR'), formatCurrency(totals._origin_charge_eur_zar)],
    ]);
    if (totals.total_origin_charges_zar > 0) {
      const totalLabel = isExport ? `Total Origin Charges (${presCur})` : 'Total Origin Charges';
      const totalValue = isExport
        ? formatCurrency(toPresentation(totals.total_origin_charges_zar), presCur)
        : formatCurrency(totals.total_origin_charges_zar);
      originRows.push([totalLabel, '', totalValue]);
    }
    if (originRows.length > 0) {
      let secY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 30);
      secY = drawSectionDivider(doc, secY, 'Origin Charges', THEME.green);
      autoTable(doc, {
        startY: secY + 1,
        head: [['Origin Charges', 'Amount', 'ZAR']],
        body: originRows,
        theme: 'striped',
        headStyles: { fillColor: THEME.green, textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: THEME.rowAlt },
        didParseCell: chargeTableSubTotalHook(originRows),
      });
    }

    // Local Charges — labels flip to/from for export
    const localChargeRows = filterZeroRows([
      [isExport ? 'Local Cartage: Klapmuts to CPT (<20 Ton)' : 'Local Cartage: CPT to Klapmuts (<20 Ton)', formatCurrency(estimate.local_cartage_cpt_klapmuts_20ton_zar)],
      [isExport ? 'Local Cartage: Klapmuts to CPT (21-28 Ton)' : 'Local Cartage: CPT to Klapmuts (21-28 Ton)', formatCurrency(estimate.local_cartage_cpt_klapmuts_28ton_zar)],
      [isExport ? 'Transport: Pretoria to DBN Port (20FT)' : 'Transport: DBN Port to Pretoria (20FT)', formatCurrency(estimate.transport_dbn_to_pretoria_20ft_zar)],
      [isExport ? 'Transport: Pretoria to DBN Port (40FT)' : 'Transport: DBN Port to Pretoria (40FT)', formatCurrency(estimate.transport_dbn_to_pretoria_40ft_zar)],
      [isExport ? 'Transport: WHS to DBN Port' : 'Transport: DBN Port to WHS', formatCurrency(estimate.transport_dbn_to_whs_zar)],
      ['Unpack / Reload', formatCurrency(estimate.unpack_reload_zar)],
      ['Storage', formatCurrency(estimate.storage_zar)],
      ['Outlying Container Depot Surcharge', formatCurrency(estimate.outlying_depot_surcharge_zar)],
      [isExport ? 'Local Cartage: PTA to DBN WHS (Tautliner A)' : 'Local Cartage: DBN WHS to PTA (Tautliner A)', formatCurrency(estimate.local_cartage_dbn_whs_pretoria_opt_a_zar)],
      [isExport ? 'Local Cartage: PTA to DBN WHS (Tautliner B)' : 'Local Cartage: DBN WHS to PTA (Tautliner B)', formatCurrency(estimate.local_cartage_dbn_whs_pretoria_opt_b_zar)],
      [isExport ? 'Local Cartage: PTA to DBN WHS (6M Deck)' : 'Local Cartage: DBN WHS to PTA (6M Deck)', formatCurrency(estimate.local_cartage_dbn_whs_pretoria_6m_zar)],
      [isExport ? 'Local Cartage: PTA to DBN WHS (12M Deck)' : 'Local Cartage: DBN WHS to PTA (12M Deck)', formatCurrency(estimate.local_cartage_dbn_whs_pretoria_12m_zar)],
      [isExport ? 'Transport: Pretoria to PE/Coega Port' : 'Transport: PE/Coega Port to Pretoria', formatCurrency(estimate.transport_pe_coega_to_pretoria_zar)],
      [isExport ? 'Transport: East London to PLZ Port' : 'Transport: PLZ Port to East London', formatCurrency(estimate.transport_plz_to_east_london_zar)],
    ]);
    const localChargesExcludingWarehouse = Math.max((totals.local_charges_subtotal_zar || 0) - (totals.warehouse_charges_subtotal_zar || 0), 0);
    if (localChargesExcludingWarehouse > 0) {
      localChargeRows.push(['Sub-Total', formatCurrency(localChargesExcludingWarehouse)]);
    }
    if (localChargeRows.length > 0) {
      let secY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 30);
      secY = drawSectionDivider(doc, secY, 'Local Charges', THEME.green);
      autoTable(doc, {
        startY: secY + 1,
        head: [['Local Charges (Transport/Cartage)', 'ZAR']],
        body: localChargeRows,
        theme: 'striped',
        headStyles: { fillColor: THEME.green, textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: THEME.rowAlt },
        didParseCell: chargeTableSubTotalHook(localChargeRows),
      });
    }

    // Destination Charges (import) OR Export Charges (export)
    if (isExport) {
      const roeOrigin = parseFloat(estimate.roe_origin) || 0;
      const ebolZar = (parseFloat(estimate.ebol_fee_usd) || 0) * roeOrigin;
      const ispsZar = (parseFloat(estimate.isps_fee_usd) || 0) * roeOrigin;
      const telexZar = (parseFloat(estimate.telex_release_usd) || 0) * roeOrigin;
      const exportChargeRows = filterZeroRows([
        ['Terminal Handling Cost', formatCurrency(estimate.terminal_handling_zar)],
        ['Carbon Emission Reduction', formatCurrency(estimate.carbon_emission_zar)],
        ['Container Seal', formatCurrency(estimate.container_seal_zar)],
        ['Electronic Release Fee', formatCurrency(estimate.electronic_release_fee_zar)],
        ['Merchant Haulage', formatCurrency(estimate.merchant_haulage_zar)],
        ['Navis Release Fee', formatCurrency(estimate.navis_release_fee_zar)],
        ['CTO', formatCurrency(estimate.cto_navis_fee_zar)],
        ['Navis GP', formatCurrency(estimate.navis_gp_zar)],
        ['VGM (Verified Gross Mass)', formatCurrency(estimate.vgm_zar)],
        ['Document Courier', formatCurrency(estimate.document_courier_zar)],
        ['Courier: Fuel Surcharge', formatCurrency(estimate.courier_fuel_surcharge_zar)],
        ['Certificate of Origin', formatCurrency(estimate.certificate_of_origin_zar)],
        ['Landside Charges', formatCurrency(estimate.export_landside_charges_zar)],
        ['Export Declaration (SAD500)', formatCurrency(estimate.export_declaration_zar)],
        ['Cargo Dues', formatCurrency(estimate.export_cargo_dues_zar)],
        [`Electronic Bill of Lading (USD ${formatNumber(estimate.ebol_fee_usd || 0, 2)})`, formatCurrency(ebolZar)],
        [`ISPS (USD ${formatNumber(estimate.isps_fee_usd || 0, 2)})`, formatCurrency(ispsZar)],
        [`Telex Release (USD ${formatNumber(estimate.telex_release_usd || 0, 2)})`, formatCurrency(telexZar)],
        [`Agency Fee (${agencyFeeMinLabel})`, formatCurrency(estimate.agency_fee_zar)],
        [`Disbursement Fee (@ 1.4% min R${Math.round(parseFloat(estimate.disbursement_fee_min) || 325)})`, formatCurrency(estimate.disbursement_fee_zar)],
      ]);
      if (totals.destination_charges_subtotal_zar > 0) {
        exportChargeRows.push(['Sub-Total', formatCurrency(totals.destination_charges_subtotal_zar)]);
      }
      if (exportChargeRows.length > 0) {
        let secY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 30);
        secY = drawSectionDivider(doc, secY, 'Export Charges', THEME.ocean);
        autoTable(doc, {
          startY: secY + 1,
          head: [['Export Charges', 'ZAR']],
          body: exportChargeRows,
          theme: 'striped',
          headStyles: { fillColor: THEME.ocean, textColor: [255, 255, 255] },
          alternateRowStyles: { fillColor: THEME.rowAlt },
          didParseCell: chargeTableSubTotalHook(exportChargeRows),
        });
      }
    } else {
      const destChargeRows = filterZeroRows([
        ['Shipping Line Charges (At Cost)', formatCurrency(estimate.shipping_line_charges_zar)],
        ['Cargo Dues (20FT)', formatCurrency(estimate.cargo_dues_20ft_zar)],
        ['Cargo Dues (40FT)', formatCurrency(estimate.cargo_dues_40ft_zar)],
        ['CTO Fee', formatCurrency(estimate.cto_fee_zar)],
        ['Port Health Inspection', formatCurrency(estimate.port_health_inspection_zar)],
        ['DAFF Inspection', formatCurrency(estimate.daff_inspection_zar)],
        ['State Vet Cancellation Fee', formatCurrency(estimate.state_vet_cancellation_fee_zar)],
        ['JNB Turn In (At Cost)', formatCurrency(estimate.jnb_turn_in_zar)],
        ['PLZ Turn In (At Cost)', formatCurrency(estimate.plz_turn_in_zar)],
        ['Bill of Lading Fee', formatCurrency(estimate.bill_of_lading_fee_zar)],
        ['RCG Manifest Filing', formatCurrency(estimate.manifest_filing_zar)],
        ['Currency Adjustment Factor (CAF)', formatCurrency(estimate.currency_adjustment_factor_zar)],
        ['Degrouping', formatCurrency(estimate.degrouping_zar)],
        ['EDI Fee', formatCurrency(estimate.edi_fee_zar)],
        ['Communication', formatCurrency(estimate.communication_dest_zar)],
        ['Documentation Fee', formatCurrency(estimate.documentation_fee_dest_zar)],
        ['CFS LCL Handling Out', formatCurrency(estimate.cfs_lcl_handling_out_zar)],
        ['Delivery Release Order (DRO)', formatCurrency(estimate.delivery_release_order_zar)],
        ['Cartage', formatCurrency(estimate.cartage_dest_zar)],
        ['Fuel Surcharge', formatCurrency(estimate.fuel_surcharge_dest_zar)],
        ['Agency Fee', formatCurrency(estimate.agency_fee_dest_zar)],
        ['Handover Fee', formatCurrency(estimate.handover_fee_zar)],
        ['Facility Fee', formatCurrency(estimate.facility_fee_zar)],
      ]);
      if (totals.destination_charges_subtotal_zar > 0) {
        destChargeRows.push(['Sub-Total', formatCurrency(totals.destination_charges_subtotal_zar)]);
      }
      if (destChargeRows.length > 0) {
        let secY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 30);
        secY = drawSectionDivider(doc, secY, 'Destination Charges', THEME.ocean);
        autoTable(doc, {
          startY: secY + 1,
          head: [['Destination Charges', 'ZAR']],
          body: destChargeRows,
          theme: 'striped',
          headStyles: { fillColor: THEME.ocean, textColor: [255, 255, 255] },
          alternateRowStyles: { fillColor: THEME.rowAlt },
          didParseCell: chargeTableSubTotalHook(destChargeRows),
        });
      }
    }
  }

  // Customs & Duties — hidden for export (Agency Fee appears in Export Charges instead).
  const warehouseChargeRows = buildWarehouseChargeRows(estimate, totals);
  if (warehouseChargeRows.length > 0) {
    let warehouseY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 48);
    warehouseY = drawSectionDivider(doc, warehouseY, 'Warehouse Handling & Storage', [51, 65, 85]);
    renderWarehouseChargeTable(doc, warehouseChargeRows, warehouseY + 1);
  }

  const customsRows = isExport ? [] : filterZeroRows([
    ['Customs Value (for reference)', formatCurrency(totals.customs_value_zar)],
    ['Duties', formatCurrency(productTotals.totalDuties || estimate.duties_zar)],
    ['Customs Declaration', formatCurrency(estimate.customs_declaration_zar)],
    [`Agency Fee (${agencyFeeMinLabel})`, formatCurrency(totals.agency_fee_zar)],
  ]);
  if (!isExport && totals.customs_subtotal_zar > 0) {
    customsRows.push(['Sub-Total (excl. Import VAT)', formatCurrency(totals.customs_subtotal_zar)]);
  }
  const lastMileRows = buildLastMileRows(totals);
  const finalChargeRows = buildFinalChargeRows(airFinalLandsideRows, customsRows);
  if (finalChargeRows.length > 0) {
    let secY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 70);
    const finalChargeTitle = airFinalLandsideRows.length > 0
      ? 'SA Landside & Customs'
      : 'Final Charges';
    secY = drawSectionDivider(doc, secY, finalChargeTitle, THEME.amber);
    autoTable(doc, {
      startY: secY + 1,
      head: [['Type', 'Charge', 'Amount']],
      body: finalChargeRows,
      theme: 'striped',
      headStyles: { fillColor: THEME.amber, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: THEME.rowAlt },
      styles: {
        fontSize: 7.2,
        cellPadding: { top: 1.8, right: 1.5, bottom: 1.8, left: 1.5 },
        overflow: 'linebreak',
        valign: 'middle',
        textColor: THEME.bodyDark,
      },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold' },
        1: { cellWidth: pageWidth - 88 },
        2: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const label = finalChargeRows[data.row.index]?.[1] || '';
          if (label.startsWith('Sub-Total')) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [243, 244, 246];
          }
        }
      },
    });
  }
  if (lastMileRows.length > 0) {
    let lastMileY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 55);
    lastMileY = drawSectionDivider(doc, lastMileY, 'Last Mile Charges', [194, 65, 12]);
    renderLastMileTable(doc, lastMileRows, lastMileY + 1);
  }

  // === SUMMARY SECTION (prominent dark box) ===
  // Custom-drawn summary card to give the figures proper typographic
  // hierarchy: large bold ZAR primary, smaller muted foreign-currency
  // secondary on the line below — matching the list view's two-tier
  // styling rather than two equal-weight stacked numbers.
  const incoTerm = isExport && estimate.inco_terms ? estimate.inco_terms : '';
  const totalLandedLabel = isExport
    ? (incoTerm ? `Total ${incoTerm}` : 'Total Landed Cost')
    : 'Total Landed Cost';
  const costPerKgLabel = isExport
    ? (incoTerm ? `${incoTerm} Cost/KG` : 'Landed Cost/KG')
    : 'Landed Cost/KG';

  const summaryRows = [
    { label: 'Total Shipping Cost', zar: totals.total_shipping_cost_zar, kind: 'sub' },
    { label: totalLandedLabel,      zar: totals.total_landed_cost_zar,   kind: 'hero' },
    { label: costPerKgLabel,        zar: totals.all_in_warehouse_cost_per_kg_zar, kind: 'mid' },
  ].filter(r => r.zar && parseFloat(r.zar) !== 0);

  if (summaryRows.length > 0) {
    let sumY = checkPageBreak(doc, doc.lastAutoTable.finalY + 4, 100);
    sumY = drawSectionDivider(doc, sumY, 'Summary', themeColor);

    const pageW = doc.internal.pageSize.getWidth();
    const boxX = 14;
    const boxW = pageW - 28;
    const boxY = sumY + 1;

    // === Editorial summary card (shared by import + export) ============
    // Layout: tracked "COST SUMMARY" header → hero block (label / huge
    // ZAR / optional muted foreign) → thin divider → support metrics in
    // N columns. For imports the foreign-currency lines are skipped, so
    // the hero is a single-line big ZAR figure and support cells just
    // show label + ZAR.
    const heroRow = summaryRows.find(r => r.kind === 'hero');
    const supportRows = summaryRows.filter(r => r.kind !== 'hero');

    const padX = 14;
    const padTop = 11;
    const padBottom = 12;

    // Line-advance factor (mm per point of font size). 0.4 ~= 1.13 line height.
    const LH = 0.4;

    // Helper: run a draw block at a given alpha (uses GState — falls back
    // to plain draw if GState isn't available on the running jsPDF build).
    const withOpacity = (alpha, fn) => {
      try {
        const gs = new doc.GState({ opacity: alpha });
        doc.saveGraphicsState();
        doc.setGState(gs);
        fn();
        doc.restoreGraphicsState();
      } catch {
        fn();
      }
    };

    // Pre-compute card height
    const referenceChange = estimate._referenceChange?.baselineCostPerKg > 0
      ? estimate._referenceChange
      : null;
    let bodyH = 11 * LH; // "COST SUMMARY" header (now 11pt to match spec)
    if (heroRow) {
      bodyH += 9;             // generous gap header → hero
      bodyH += 13 * LH + 2;   // hero label
      bodyH += 28 * LH;       // hero ZAR (bumped for dominance)
      if (isExport) bodyH += 2 + 14 * LH; // foreign line
      if (referenceChange) {
        bodyH += 6;
        bodyH += 8 * LH + 1;
        bodyH += 10 * LH + 1;
        bodyH += 8 * LH;
      }
    }
    if (supportRows.length > 0) {
      bodyH += 9;             // gap before divider
      bodyH += 5;             // divider + gap after
      bodyH += 11 * LH + 1;   // support label
      bodyH += 15 * LH;       // support ZAR
      if (isExport) bodyH += 1 + 11 * LH; // foreign line
    }
    const totalH = padTop + bodyH + padBottom;

    // Card — rounded panel in unified brand navy (matches cover bar)
    doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
    doc.roundedRect(boxX, boxY, boxW, totalH, 5, 5, 'F');

    const xLeft = boxX + padX;
    const xRight = boxX + boxW - padX;
    let cy = boxY + padTop;

    // Tracked "COST SUMMARY" header — quieter via opacity + extra tracking
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    try { doc.setCharSpace(0.7); } catch { /* */ }
    withOpacity(0.75, () => {
      doc.text('COST SUMMARY', xLeft, cy, { baseline: 'top' });
    });
    try { doc.setCharSpace(0); } catch { /* */ }
    cy += 11 * LH;

    // Hero block — left-aligned, dominant
    if (heroRow) {
      cy += 9;

      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(heroRow.label, xLeft, cy, { baseline: 'top' });
      cy += 13 * LH + 2;

      doc.setFontSize(28);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(formatCurrency(heroRow.zar), xLeft, cy, { baseline: 'top' });
      cy += 28 * LH;

      if (isExport) {
        cy += 2;
        doc.setFontSize(14);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(255, 255, 255);
        const heroForeignY = cy;
        withOpacity(0.75, () => {
          doc.text(
            formatCurrency(toPresentation(heroRow.zar), presCur),
            xLeft,
            heroForeignY,
            { baseline: 'top' },
          );
        });
        cy += 14 * LH;
      }

      if (referenceChange) {
        cy += 6;
        const previousText = `${referenceChange.baselineLabel || 'Previous'}: ${formatCurrency(referenceChange.baselineCostPerKg)}/kg`;
        const currentText = `Current: ${formatCurrency(referenceChange.currentCostPerKg)}/kg`;
        const changeText = `${formatPercentChange(referenceChange.changePercent)} change`;
        const periodText = referenceChange.periodLabel && referenceChange.periodLabel !== '-'
          ? `Over ${referenceChange.periodLabel} (${formatDate(referenceChange.baselineDate)} to ${formatDate(referenceChange.currentDate)})`
          : `${formatDate(referenceChange.baselineDate)} to ${formatDate(referenceChange.currentDate)}`;

        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        try { doc.setCharSpace(0.45); } catch { /* */ }
        withOpacity(0.72, () => {
          doc.text('REFERENCE CHANGE', xLeft, cy, { baseline: 'top' });
        });
        try { doc.setCharSpace(0); } catch { /* */ }
        cy += 8 * LH + 1;

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(`${previousText}  |  ${currentText}  |  ${changeText}`, xLeft, cy, { baseline: 'top' });
        cy += 10 * LH + 1;

        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(255, 255, 255);
        withOpacity(0.72, () => {
          doc.text(periodText, xLeft, cy, { baseline: 'top' });
        });
        cy += 8 * LH;
      }
    }

    // Support metrics — N columns, divider above
    if (supportRows.length > 0) {
      cy += 9;
      // True-white divider at low opacity for the refined editorial feel
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.2);
      const dividerY = cy;
      withOpacity(0.12, () => {
        doc.line(xLeft, dividerY, xRight, dividerY);
      });
      cy += 5;

      const innerW = boxW - padX * 2;
      const colW = innerW / supportRows.length;

      supportRows.forEach((row, i) => {
        const colX = xLeft + colW * i;
        let scy = cy;

        // Label — tracked-out, slightly muted via opacity
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        try { doc.setCharSpace(0.4); } catch { /* */ }
        const labelY = scy;
        withOpacity(0.85, () => {
          doc.text(row.label, colX, labelY, { baseline: 'top' });
        });
        try { doc.setCharSpace(0); } catch { /* */ }
        scy += 11 * LH + 1;

        // ZAR — primary, full white
        doc.setFontSize(15);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(formatCurrency(row.zar), colX, scy, { baseline: 'top' });

        if (isExport) {
          scy += 15 * LH + 1;
          doc.setFontSize(11);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(255, 255, 255);
          const supForeignY = scy;
          withOpacity(0.75, () => {
            doc.text(
              formatCurrency(toPresentation(row.zar), presCur),
              colX,
              supForeignY,
              { baseline: 'top' },
            );
          });
        }
      });
    }

    // Reset graphics state and bump the autoTable cursor for anything below
    doc.setDrawColor(0, 0, 0);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    if (doc.lastAutoTable) {
      doc.lastAutoTable.finalY = boxY + totalH;
    }
  }

  // === FOOTER (all pages) ===
  const pageCount = doc.internal.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.height;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    // Thin gray separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(10, pageHeight - 14, pageWidth - 10, pageHeight - 14);

    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.setFont(undefined, 'normal');
    // Left: branding
    doc.text('Generated by Synercore Import Schedule', 10, pageHeight - 9);
    // Right: date
    const dateStr = formatDate(new Date().toISOString());
    const dateWidth = doc.getTextWidth(dateStr);
    doc.text(dateStr, pageWidth - dateWidth - 10, pageHeight - 9);
    // Center: page number (if multi-page)
    if (pageCount > 1) {
      const pageText = `Page ${i} of ${pageCount}`;
      const ptWidth = doc.getTextWidth(pageText);
      doc.text(pageText, (pageWidth - ptWidth) / 2, pageHeight - 9);
    }
  }

  doc.save(`cost-estimate-${estimate.reference_number || estimate.id}.pdf`);
}

/**
 * Generate PDF as base64 string for email attachment
 */
export function generateEstimatePDFBase64(estimate) {
  const doc = new jsPDF();
  const totals = calculateAllTotals(estimate);
  const productTotals = getProductTotals(estimate);

  buildEstimateHeader(doc, estimate, productTotals, totals);

  const isAir = (estimate.transport_mode || 'sea') === 'air';
  let airEmailLandsideRows = [];

  if (isAir) {
    // Airfreight Charges
    const airRows = filterZeroRows([
      ['Airfreight (USD)', formatCurrency(estimate.airfreight_usd, 'USD'), formatCurrency(totals._airfreight_usd_zar)],
      ['Airfreight (EUR)', formatCurrency(estimate.airfreight_eur, 'EUR'), formatCurrency(totals._airfreight_eur_zar)],
      ['Origin Charges (USD)', formatCurrency(estimate.airfreight_origin_charges_usd, 'USD'), formatCurrency((parseFloat(estimate.airfreight_origin_charges_usd) || 0) * (parseFloat(estimate.roe_origin) || 0))],
      ['Origin Charges (EUR)', formatCurrency(estimate.airfreight_origin_charges_eur, 'EUR'), formatCurrency((parseFloat(estimate.airfreight_origin_charges_eur) || 0) * (parseFloat(estimate.roe_eur) || 0))],
    ]);
    if (totals.airfreight_total_zar > 0 || totals.airfreight_origin_charges_zar > 0) {
      airRows.push(['Airfreight + Origin Sub-Total', '', formatCurrency((totals.airfreight_total_zar || 0) + (totals.airfreight_origin_charges_zar || 0))]);
    }
    if (airRows.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Air Freight Rate & Origin', 'Amount', 'ZAR']],
        body: airRows,
        theme: 'grid',
        headStyles: { fillColor: THEME.purple },
      });
    }

    // Surcharges
    const surchargeRows = filterZeroRows([
      ['Fuel Surcharge (USD)', formatCurrency(estimate.fuel_surcharge_usd, 'USD'), formatCurrency((parseFloat(estimate.fuel_surcharge_usd) || 0) * (parseFloat(estimate.roe_origin) || 0))],
      ['Fuel Surcharge (EUR)', formatCurrency(estimate.fuel_surcharge_eur, 'EUR'), formatCurrency((parseFloat(estimate.fuel_surcharge_eur) || 0) * (parseFloat(estimate.roe_eur) || 0))],
      ['Security Surcharge (USD)', formatCurrency(estimate.security_surcharge_usd, 'USD'), formatCurrency((parseFloat(estimate.security_surcharge_usd) || 0) * (parseFloat(estimate.roe_origin) || 0))],
      ['Security Surcharge (EUR)', formatCurrency(estimate.security_surcharge_eur, 'EUR'), formatCurrency((parseFloat(estimate.security_surcharge_eur) || 0) * (parseFloat(estimate.roe_eur) || 0))],
    ]);
    if (totals.fuel_surcharge_total_zar > 0 || totals.security_surcharge_total_zar > 0) {
      surchargeRows.push(['Total Surcharges', '', formatCurrency((totals.fuel_surcharge_total_zar || 0) + (totals.security_surcharge_total_zar || 0))]);
    }
    if (surchargeRows.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Surcharges', 'Amount', 'ZAR']],
        body: surchargeRows,
        theme: 'grid',
        headStyles: { fillColor: THEME.purple },
      });
    }

    // SA Landside Charges
    const airLocalRows = filterZeroRows([
      ['Screening Fee', formatCurrency(estimate.screening_fee_zar)],
      ['Import Waybill Processing', formatCurrency(estimate.awb_fee_zar)],
      ['Airline Handling Fee', formatCurrency(estimate.airline_handling_fee_zar)],
      ['Airline Transfer Fee', formatCurrency(estimate.airport_transfer_fee_zar)],
      ['Cartage: Airport to Warehouse', formatCurrency(estimate.cartage_airport_to_whs_zar)],
      ['Air EDI Fee', formatCurrency(estimate.air_edi_fee_zar)],
      ['Import Documentation', formatCurrency(estimate.air_import_documentation_zar)],
      ['Airline Landside Delivery', formatCurrency(estimate.airline_landside_delivery_zar)],
      ['Insurance', formatCurrency(totals.airfreight_insurance_zar)],
    ]);
    if (totals.air_local_charges_subtotal_zar > 0 || totals.airfreight_insurance_zar > 0) {
      airLocalRows.push(['Sub-Total', formatCurrency((totals.air_local_charges_subtotal_zar || 0) + (totals.airfreight_insurance_zar || 0))]);
    }
    airEmailLandsideRows = airLocalRows;
  } else {
    // Sea freight summary for email
    const seaSummaryRows = filterZeroRows([
      ['Ocean Freight', formatCurrency(totals.total_ocean_freight_zar)],
      ['Origin Charges', formatCurrency(totals.total_origin_charges_zar)],
      ['Local Charges', formatCurrency(totals.local_charges_subtotal_zar)],
      ['Destination Charges', formatCurrency(totals.destination_charges_subtotal_zar)],
    ]);
    if (seaSummaryRows.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Shipping Charges', 'ZAR']],
        body: seaSummaryRows,
        theme: 'grid',
        headStyles: { fillColor: THEME.ocean },
      });
    }

    const destinationDetailRows = filterZeroRows([
      ['Shipping Line Charges (At Cost)', formatCurrency(estimate.shipping_line_charges_zar)],
      ['Cargo Dues (20FT)', formatCurrency(estimate.cargo_dues_20ft_zar)],
      ['Cargo Dues (40FT)', formatCurrency(estimate.cargo_dues_40ft_zar)],
      ['CTO Fee', formatCurrency(estimate.cto_fee_zar)],
      ['Port Health Inspection', formatCurrency(estimate.port_health_inspection_zar)],
      ['DAFF Inspection', formatCurrency(estimate.daff_inspection_zar)],
      ['State Vet Cancellation Fee', formatCurrency(estimate.state_vet_cancellation_fee_zar)],
      ['JNB Turn In (At Cost)', formatCurrency(estimate.jnb_turn_in_zar)],
      ['PLZ Turn In (At Cost)', formatCurrency(estimate.plz_turn_in_zar)],
      ['Bill of Lading Fee', formatCurrency(estimate.bill_of_lading_fee_zar)],
      ['RCG Manifest Filing', formatCurrency(estimate.manifest_filing_zar)],
      ['Currency Adjustment Factor (CAF)', formatCurrency(estimate.currency_adjustment_factor_zar)],
      ['Degrouping', formatCurrency(estimate.degrouping_zar)],
      ['EDI Fee', formatCurrency(estimate.edi_fee_zar)],
      ['Communication', formatCurrency(estimate.communication_dest_zar)],
      ['Documentation Fee', formatCurrency(estimate.documentation_fee_dest_zar)],
      ['CFS LCL Handling Out', formatCurrency(estimate.cfs_lcl_handling_out_zar)],
      ['Delivery Release Order (DRO)', formatCurrency(estimate.delivery_release_order_zar)],
      ['Cartage', formatCurrency(estimate.cartage_dest_zar)],
      ['Fuel Surcharge', formatCurrency(estimate.fuel_surcharge_dest_zar)],
      ['Agency Fee', formatCurrency(estimate.agency_fee_dest_zar)],
      ['Handover Fee', formatCurrency(estimate.handover_fee_zar)],
      ['Facility Fee', formatCurrency(estimate.facility_fee_zar)],
    ]);
    if (destinationDetailRows.length > 0) {
      if (totals.destination_charges_subtotal_zar > 0) {
        destinationDetailRows.push(['Sub-Total', formatCurrency(totals.destination_charges_subtotal_zar)]);
      }
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Destination Charges', 'ZAR']],
        body: destinationDetailRows,
        theme: 'grid',
        headStyles: { fillColor: THEME.ocean },
      });
    }
  }

  const warehouseEmailRows = buildWarehouseChargeRows(estimate, totals);
  if (warehouseEmailRows.length > 0) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Description', 'Rate', 'Basis', 'Amount']],
      body: warehouseEmailRows,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85] },
    });
  }

  // Final arrival charges
  const customsRows = filterZeroRows([
    ['Customs Value', formatCurrency(totals.customs_value_zar)],
    ['Duties', formatCurrency(productTotals.totalDuties || estimate.duties_zar)],
    ['Agency Fee', formatCurrency(totals.agency_fee_zar)],
  ]);
  const lastMileEmailRows = buildLastMileRows(totals);
  const finalEmailChargeRows = buildFinalChargeRows(airEmailLandsideRows, customsRows);
  if (finalEmailChargeRows.length > 0) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Type', 'Charge', 'Amount']],
      body: finalEmailChargeRows,
      theme: 'grid',
      headStyles: { fillColor: THEME.amber },
    });
  }
  if (lastMileEmailRows.length > 0) {
    renderLastMileTable(doc, lastMileEmailRows, doc.lastAutoTable.finalY + 10, { theme: 'grid' });
  }

  // Summary
  const isExportEst = estimate.direction === 'export';
  const presCurEst = isExportEst
    ? (estimate.presentation_currency === 'EUR' ? 'EUR' : 'USD')
    : 'ZAR';
  const presRateEst = isExportEst
    ? (parseFloat(presCurEst === 'EUR' ? estimate.roe_eur : estimate.roe_origin) || 0)
    : 0;
  const toPresEst = (zar) => (isExportEst && presRateEst > 0 ? zar / presRateEst : zar);
  const dualValueEst = (zar) =>
    `${formatCurrency(zar)}\n${formatCurrency(toPresEst(zar), presCurEst)}`;
  const incoTermEst = isExportEst && estimate.inco_terms ? estimate.inco_terms : '';
  const totalLandedLabelEst = isExportEst
    ? (incoTermEst ? `Total ${incoTermEst}` : 'Total Landed Cost')
    : 'Total Landed Cost';
  const costPerKgLabel = isExportEst
    ? (incoTermEst ? `${incoTermEst} Cost/KG` : 'Landed Cost/KG')
    : 'Landed Cost/KG';
  const summaryRows = filterZeroRows([
    ['Total Shipping Cost', isExportEst ? dualValueEst(totals.total_shipping_cost_zar) : formatCurrency(totals.total_shipping_cost_zar)],
    [totalLandedLabelEst, isExportEst ? dualValueEst(totals.total_landed_cost_zar) : formatCurrency(totals.total_landed_cost_zar)],
    [costPerKgLabel, isExportEst ? dualValueEst(totals.all_in_warehouse_cost_per_kg_zar) : formatCurrency(totals.all_in_warehouse_cost_per_kg_zar)],
  ]);
  if (summaryRows.length > 0) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Summary', 'Amount']],
      body: summaryRows,
      theme: 'grid',
      headStyles: { fillColor: THEME.panelDark },
      bodyStyles: { fontStyle: 'bold' },
    });
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Generated by Synercore Import Schedule', 14, doc.internal.pageSize.height - 10);

  return doc.output('datauristring').split(',')[1];
}

/**
 * Generate a cost analysis report PDF
 * @param {Object} options
 * @param {Object} options.chartData - getSupplierChartData computed value
 * @param {string} options.selectedProduct - 'all' or specific product name
 * @param {string} options.selectedSupplier - 'all' or specific supplier name
 * @param {Object|null} options.chartRef - React ref to the chart component
 * @param {Array} options.filteredEstimates - filtered estimate list
 */
export async function generateReportPDF({ chartData, selectedProduct, selectedSupplier, transportModeFilter, chartRef, filteredEstimates }) {
  const doc = new jsPDF();
  const productLabel = selectedProduct === 'all' ? 'All Products' : selectedProduct;
  const supplierLabel = selectedSupplier === 'all' ? 'All Suppliers' : selectedSupplier;
  const modeLabel = transportModeFilter === 'sea' ? 'Sea Freight' : transportModeFilter === 'air' ? 'Air Freight' : 'All Modes';

  // Header
  doc.setFillColor(91, 33, 182);
  doc.rect(0, 0, 220, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('Cost Analysis Report', 14, 15);
  doc.setFontSize(10);
  doc.text(`Supplier: ${supplierLabel}  |  Mode: ${modeLabel}`, 14, 25);
  doc.text(`Product: ${productLabel}`, 14, 33);
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 140, 33);

  // Try to capture chart as image
  if (chartRef?.current) {
    try {
      const chartCanvas = chartRef.current.canvas;
      const chartImage = chartCanvas.toDataURL('image/png', 1.0);
      doc.addImage(chartImage, 'PNG', 14, 47, 180, 80);
    } catch (err) {
      doc.setTextColor(100);
      doc.setFontSize(10);
      doc.text('Chart could not be rendered in PDF', 14, 65);
    }
  }

  // Summary Statistics
  const totalEstimates = chartData.supplierDetails.reduce((sum, s) => sum + s.estimateCount, 0);
  const totalWeight = chartData.supplierDetails.reduce((sum, s) => sum + s.totalWeight, 0);
  const totalCost = chartData.supplierDetails.reduce((sum, s) => sum + s.totalCost, 0);
  const avgCostPerKg = totalWeight > 0 ? totalCost / totalWeight : 0;

  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text('Summary Statistics', 14, 132);

  autoTable(doc, {
    startY: 138,
    head: [['Metric', 'Value']],
    body: [
      ['Total Suppliers', chartData.labels.length.toString()],
      ['Total Estimates', totalEstimates.toString()],
      ['Total Weight', `${formatNumber(totalWeight)} kg`],
      ['Total Cost', formatCurrency(totalCost)],
      ['Average Cost/KG', formatCurrency(avgCostPerKg)],
    ],
    theme: 'grid',
    headStyles: { fillColor: THEME.panelDarkAir },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
    },
  });

  // Supplier Details Table
  doc.setFontSize(12);
  doc.text('Supplier Cost Breakdown', 14, doc.lastAutoTable.finalY + 15);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 20,
    head: [['Supplier', 'Estimates', 'Weight (kg)', 'Total Cost (ZAR)', 'Cost/KG (ZAR)']],
    body: chartData.supplierDetails.map(s => [
      s.name,
      s.estimateCount.toString(),
      formatNumber(s.totalWeight),
      formatCurrency(s.totalCost),
      formatCurrency(s.costPerKg),
    ]),
    theme: 'striped',
    headStyles: { fillColor: THEME.panelDarkAir },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  // Filter estimates by selected supplier and product
  const relevantEstimates = filteredEstimates.filter(est => {
    if (selectedSupplier !== 'all' && est.supplier_name !== selectedSupplier) return false;
    if (selectedProduct !== 'all') {
      const hasProduct = (est.products || []).some(p => p.name === selectedProduct);
      if (!hasProduct) return false;
    }
    return true;
  });

  // Detailed Estimates with Products
  doc.addPage();
  doc.setFillColor(91, 33, 182);
  doc.rect(0, 0, 220, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Complete Estimates with Product Details', 14, 16);

  let currentY = 35;

  relevantEstimates.forEach((est, estIndex) => {
    const totals = calculateAllTotals(est);
    const products = (est.products || []).filter(p =>
      selectedProduct === 'all' || p.name === selectedProduct
    );

    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }

    // Estimate Header
    doc.setFillColor(240, 240, 250);
    doc.rect(10, currentY - 5, 190, 36, 'F');
    doc.setDrawColor(91, 33, 182);
    doc.setLineWidth(0.5);
    doc.rect(10, currentY - 5, 190, 36, 'S');

    doc.setTextColor(91, 33, 182);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(`${estIndex + 1}. ${est.reference_number || est.id.slice(0, 8)}`, 14, currentY + 3);

    doc.setTextColor(60);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Supplier: ${est.supplier_name || '-'}`, 14, currentY + 11);
    doc.text(`Port: ${est.port_of_discharge || '-'}`, 80, currentY + 11);
    doc.text(`Container: ${est.container_type || '-'}`, 130, currentY + 11);

    // ROE info per estimate
    doc.setTextColor(0, 102, 204);
    doc.text(`ROE Date: ${formatDate(est.costing_date)}`, 14, currentY + 19);
    doc.text(`USD/ZAR: ${formatNumber(est.roe_origin || 0, 4)}`, 80, currentY + 19);
    doc.text(`EUR/ZAR: ${formatNumber(est.roe_eur || 0, 4)}`, 130, currentY + 19);

    doc.setFont(undefined, 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(`Total Cost: ${formatCurrency(totals.total_in_warehouse_cost_zar)}`, 14, currentY + 27);
    doc.setTextColor(217, 119, 6);
    doc.text(`Cost/KG: ${formatCurrency(totals.all_in_warehouse_cost_per_kg_zar)}`, 80, currentY + 27);

    currentY += 40;

    // Products Table for this estimate
    if (products.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Product Name', 'HS Code', 'Pack Size', 'Pack Type', 'Weight (kg)', 'Rate/kg', 'Currency', 'Invoice Value', 'Duty %', 'Sch1 %', 'Cost/kg (ZAR)']],
        body: products.map(p => {
          const w = parseFloat(p.weight_kg) || 0;
          const iv = parseFloat(p.invoice_value) || 0;
          const currency = p.currency || 'USD';
          const roe = currency === 'EUR' ? (parseFloat(est.roe_eur) || 1) : currency === 'ZAR' ? 1 : (parseFloat(est.roe_origin) || 1);
          const zarValue = iv * roe;
          return [
            p.name || '-',
            p.hs_code || '-',
            p.pack_size || '-',
            p.pack_type || '-',
            formatNumber(w),
            formatNumber(p.rate_per_kg),
            currency,
            formatNumber(iv),
            `${p.duty_percent || 0}%`,
            `${p.duty_schedule1_percent || 0}%`,
            w > 0 ? formatCurrency(zarValue / w) : '-',
          ];
        }),
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], fontSize: 7, textColor: [255, 255, 255] },
        styles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 28 },
          4: { halign: 'right' },
          5: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'center' },
          9: { halign: 'center' },
          10: { halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
      });

      currentY = doc.lastAutoTable.finalY + 15;
    } else {
      doc.setTextColor(150);
      doc.setFontSize(8);
      doc.text('No products in this estimate', 14, currentY + 5);
      currentY += 15;
    }
  });

  // Product Comparison Table (if filtering by specific product)
  if (selectedProduct !== 'all') {
    doc.addPage();
    doc.setFillColor(245, 158, 11);
    doc.rect(0, 0, 220, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(`Product Comparison: ${selectedProduct}`, 14, 16);

    const productComparison = [];
    relevantEstimates.forEach(est => {
      const totals = calculateAllTotals(est);
      (est.products || [])
        .filter(p => p.name === selectedProduct)
        .forEach(p => {
          productComparison.push([
            est.reference_number || est.id.slice(0, 8),
            est.supplier_name || '-',
            p.hs_code || '-',
            p.pack_size || '-',
            p.pack_type || '-',
            `${formatNumber(p.weight_kg)} kg`,
            `${formatNumber(p.rate_per_kg)} ${p.currency || 'USD'}`,
            `${formatNumber(p.invoice_value)} ${p.currency || 'USD'}`,
            formatCurrency(totals.all_in_warehouse_cost_per_kg_zar),
          ]);
        });
    });

    autoTable(doc, {
      startY: 32,
      head: [['Reference', 'Supplier', 'HS Code', 'Pack Size', 'Pack Type', 'Weight', 'Rate/kg', 'Invoice Value', 'All-in Cost/kg']],
      body: productComparison,
      theme: 'striped',
      headStyles: { fillColor: [245, 158, 11], fontSize: 8 },
      styles: { fontSize: 7 },
      columnStyles: {
        8: { halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount} | Generated by Synercore Import Schedule`,
      14,
      doc.internal.pageSize.height - 10
    );
  }

  const fileSupplier = supplierLabel.replace(/\s+/g, '-').toLowerCase();
  const fileProduct = productLabel.replace(/\s+/g, '-').toLowerCase();
  doc.save(`cost-report-${fileSupplier}-${fileProduct}-${new Date().toISOString().split('T')[0]}.pdf`);
}
