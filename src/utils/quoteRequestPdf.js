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
      ['Incoterm', fmt(req.incoterm)],
      ['Origin', fmt(req.origin)],
      ...(req.collection_address ? [['Collection Address', req.collection_address]] : []),
      ['Destination', fmt(req.destination)],
      ['Cargo Ready Date', fmtDate(req.cargo_ready_date)],
      ['Required Delivery Date', fmtDate(req.required_date)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });

  y = doc.lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: y,
    head: [['Cargo Details', '']],
    body: [
      ['Supplier', fmt(req.supplier_name)],
      ['Description', fmt(req.cargo_description)],
      ['HS Code', fmt(req.hs_code)],
      ['DG Classification', DG_LABELS[req.dg_classification] || DG_LABELS.non_dg],
      ['Gross Weight', fmt(req.gross_weight_kg, ' kg')],
      ['Dimensions per Pallet/Package (L x W x H)', (req.length_cm && req.width_cm && req.height_cm)
        ? `${req.length_cm} x ${req.width_cm} x ${req.height_cm} cm`
        : '—'],
      ['Pallets / Packages', fmt(req.pallet_count)],
      ['Value of Goods', req.cargo_value ? `${req.cargo_value_currency || 'USD'} ${Number(req.cargo_value).toLocaleString()}` : '—'],
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
  doc.text('Please reply with your rate, transit time, and validity period at your earliest convenience.', 14, y);
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
