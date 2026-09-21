/**
 * PDF generation for outbound freight Quote Requests
 * (a one-page document to send to a forwarder/shipping agent asking for a rate)
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND_DARK = [62, 155, 62]; // accent-600 — used for text/headings (readable on white)
const BRAND = [79, 184, 79];      // accent — brand green, used for header band + table head fills
const MUTED = [107, 114, 128];
const ROW_ALT = [232, 245, 233];  // accent-100 — light green tint for alternate table rows

const COMPANY_NAME = 'Africa Food Industries';

const TRANSPORT_LABELS = { sea: 'Sea Freight', air: 'Air Freight', road: 'Road Freight' };
const DG_LABELS = { dg: 'DG (Dangerous Goods)', non_dg: 'Non-DG' };

// Standard volumetric conversion factors (kg per CBM) by transport mode:
// Air = 167 (IATA standard), Sea = 1000 (1 CBM = 1 ton, LCL convention), Road = 333 (common SA road-freight factor)
export const VOLUMETRIC_FACTORS = { air: 167, sea: 1000, road: 333 };
export const calcVolumetricWeight = (cbm, transportMode) => {
  if (!cbm) return null;
  const factor = VOLUMETRIC_FACTORS[transportMode] || VOLUMETRIC_FACTORS.sea;
  return Math.round(cbm * factor * 10) / 10;
};

const fmt = (v, suffix = '') => (v === null || v === undefined || v === '' ? '—' : `${v}${suffix}`);
const fmtDate = (d) => {
  if (!d) return '—';
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? String(d) : parsed.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: '2-digit' });
};

// 0°C is a real, common reefer set point -- can't use truthy/fmt's usual
// "empty means —" check here, or it would silently disappear.
const hasTemp = (v) => v !== null && v !== undefined && v !== '';
const buildTempControlRow = (req) => {
  const parts = [];
  if (hasTemp(req.container_temp_c)) parts.push(`${req.container_type}: ${req.container_temp_c}°C`);
  if (hasTemp(req.container_2_temp_c)) parts.push(`${req.container_type_2}: ${req.container_2_temp_c}°C`);
  return parts.length > 0 ? [['Temperature Control', parts.join('  /  ')]] : [];
};

export function generateQuoteRequestPDF(req) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const reference = `QR-${String(req.id).padStart(5, '0')}`;

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Freight Quote Request', 14, 17);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(COMPANY_NAME, pageWidth - 14, 12, { align: 'right' });
  doc.text(`Ref: ${reference}`, pageWidth - 14, 18, { align: 'right' });
  doc.text(`Date: ${fmtDate(req.created_at || new Date())}`, pageWidth - 14, 24, { align: 'right' });

  let y = 38;
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('To', 14, y);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text(req.forwarder_name || '—', 30, y);
  if (req.forwarder_email) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    doc.text(req.forwarder_email, 30, y + 5);
    doc.setTextColor(...BRAND_DARK);
  }

  y += 14;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(
    'We would like to request your best rate and estimated transit time for the shipment detailed below.',
    14, y
  );

  y += 8;
  autoTable(doc, {
    startY: y,
    head: [['Shipment Details', '']],
    body: [
      ['Mode', TRANSPORT_LABELS[req.transport_mode] || fmt(req.transport_mode)],
      ...(req.container_type ? [['Container Type', [req.container_type, req.container_type_2].filter(Boolean).join(' and ')]] : []),
      ...buildTempControlRow(req),
      ['Incoterm', fmt(req.incoterm)],
      [req.transport_mode === 'sea' ? 'Origin Port' : 'Origin', fmt(req.origin)],
      ...(req.collection_address ? [['Collection Address', req.collection_address]] : []),
      [req.transport_mode === 'sea' ? 'Destination Port' : 'Destination', fmt(req.destination)],
      ['Cargo Ready Date', fmtDate(req.cargo_ready_date)],
      ['Required Delivery Date', fmtDate(req.required_date)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });

  const hasProducts = Array.isArray(req.products) && req.products.length > 0;

  y = doc.lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: y,
    head: [['Cargo Details', '']],
    body: [
      ['Supplier', fmt(req.supplier_name)],
      ...(hasProducts ? [] : [['Description', fmt(req.cargo_description)], ['HS Code', fmt(req.hs_code)]]),
      ['DG Classification', DG_LABELS[req.dg_classification] || DG_LABELS.non_dg],
      ...(req.container_type_2 ? [
        [`Weight — ${req.container_type}`, fmt(req.container_weight_kg, ' kg')],
        [`Value — ${req.container_type}`, req.container_value ? `${req.cargo_value_currency || 'USD'} ${Number(req.container_value).toLocaleString()}` : '—'],
        [`Weight — ${req.container_type_2}`, fmt(req.container_2_weight_kg, ' kg')],
        [`Value — ${req.container_type_2}`, req.container_2_value ? `${req.cargo_value_currency || 'USD'} ${Number(req.container_2_value).toLocaleString()}` : '—'],
        ['Combined Weight', fmt(req.gross_weight_kg, ' kg')],
        ['Combined Value', req.cargo_value ? `${req.cargo_value_currency || 'USD'} ${Number(req.cargo_value).toLocaleString()}` : '—'],
      ] : [
        ['Gross Weight', fmt(req.gross_weight_kg, ' kg')],
        ['Value of Goods', req.cargo_value ? `${req.cargo_value_currency || 'USD'} ${Number(req.cargo_value).toLocaleString()}` : '—'],
      ]),
      ['Dimensions per Pallet/Package (L x W x H)', (req.length_cm && req.width_cm && req.height_cm)
        ? `${req.length_cm} x ${req.width_cm} x ${req.height_cm} cm`
        : '—'],
      ['Pallets / Packages', fmt(req.pallet_count)],
      ['Volume (Total)', fmt(req.volume_cbm, ' CBM')],
      ['Volumetric Weight', fmt(calcVolumetricWeight(req.volume_cbm, req.transport_mode), ' kg')],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });

  y = doc.lastAutoTable.finalY + 8;

  if (req.quoted_rate) {
    const currency = req.quoted_currency || 'USD';
    const premiumPct = req.quoted_rate_non_stackable
      ? (((Number(req.quoted_rate_non_stackable) - Number(req.quoted_rate)) / Number(req.quoted_rate)) * 100).toFixed(0)
      : null;

    autoTable(doc, {
      startY: y,
      head: [['Quoted Rate', '']],
      body: [
        ['Rate', `${currency} ${Number(req.quoted_rate).toLocaleString()}`],
        ...(req.transport_mode === 'air' && req.quoted_rate_non_stackable ? [
          ['Non-Stackable Rate', `${currency} ${Number(req.quoted_rate_non_stackable).toLocaleString()}${premiumPct ? ` (+${premiumPct}%)` : ''}`],
        ] : []),
        ...(req.transport_mode === 'sea' && req.container_type_2 && req.quoted_rate_2 ? [
          [`Rate — ${req.container_type_2}`, `${currency} ${Number(req.quoted_rate_2).toLocaleString()}`],
        ] : []),
        ...(req.quote_reference ? [['Quote Reference', req.quote_reference]] : []),
        ['Transit Time', fmt(req.quoted_transit_days, ' days')],
        ['Rate Received', fmtDate(req.quoted_at)],
      ],
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    });
    y = doc.lastAutoTable.finalY + 8;

    if (req.quote_notes) {
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND_DARK);
      doc.text('Quote Notes', 14, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      const quoteNoteLines = doc.splitTextToSize(req.quote_notes, pageWidth - 28);
      doc.text(quoteNoteLines, 14, y);
      y += quoteNoteLines.length * 4.5 + 6;
    }
  }

  if (hasProducts) {
    const productRow = (p) => [
      fmt(p.name), fmt(p.hs_code), fmt(p.qty), fmt(p.weight_kg, ' kg'),
      p.value ? `${p.value_currency || req.cargo_value_currency || 'USD'} ${Number(p.value).toLocaleString()}` : '—',
    ];
    // Split into one table per container when at least one line has been
    // tagged, so the forwarder can quote each container size against its
    // own cargo instead of one combined list -- lines left untagged (e.g.
    // requests made before this existed) fall into a shared section rather
    // than being silently dropped from either container's table.
    const isTagged = (p) => p.container_slot === '1' || p.container_slot === '2';
    const hasContainerSplit = req.container_type_2 && req.products.some(isTagged);

    if (hasContainerSplit) {
      const sections = [
        { label: req.container_type, lines: req.products.filter(p => p.container_slot === '1') },
        { label: req.container_type_2, lines: req.products.filter(p => p.container_slot === '2') },
        { label: 'Either Container', lines: req.products.filter(p => !isTagged(p)) },
      ].filter(s => s.lines.length > 0);

      sections.forEach(section => {
        autoTable(doc, {
          startY: y,
          head: [[`Products — ${section.label}`, 'HS Code', 'Qty', 'Weight', 'Value']],
          body: section.lines.map(productRow),
          theme: 'plain',
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: ROW_ALT },
        });
        y = doc.lastAutoTable.finalY + 6;
      });
      y += 2;
    } else {
      autoTable(doc, {
        startY: y,
        head: [['Product', 'HS Code', 'Qty', 'Weight', 'Value']],
        body: req.products.map(productRow),
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: ROW_ALT },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  if (req.notes) {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_DARK);
    doc.text('Notes', 14, y);
    y += 5;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(req.notes, pageWidth - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 6;
  }

  y += 4;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text('Please reply with your rate(s), transit time, and validity period at your earliest convenience.', 14, y);
  y += 10;
  doc.setFont(undefined, 'bold');
  doc.text(`Requested by: ${req.requested_by_username || '—'}`, 14, y);

  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Generated by ${COMPANY_NAME}`, 14, pageHeight - 9);

  doc.save(`quote-request-${reference}.pdf`);
}
