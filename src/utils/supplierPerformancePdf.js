/**
 * PDF generation for a single supplier's Supplier Performance page — a
 * shareable report combining the KPI summary, the supplier's own on-time
 * trend and delivery-timing charts, and the underlying audit/open-orders
 * detail, so it can be sent internally without giving someone app access.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND_DARK = [62, 155, 62];
const BRAND = [79, 184, 79];
const MUTED = [107, 114, 128];
const ROW_ALT = [232, 245, 233];
const LATE_RED = [220, 53, 69];
const EARLY_GREEN = [40, 167, 69];

const COMPANY_NAME = 'Africa Food Industries';

const GRADE_COLORS = { A: EARLY_GREEN, B: [255, 193, 7], C: LATE_RED };
const GRADE_LABELS = { A: 'Excellent', B: 'Good', C: 'Needs Improvement' };

const fmtDate = (d) => {
  if (!d) return '—';
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? String(d) : parsed.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: '2-digit' });
};
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const fmtDays = (v) => (v === null || v === undefined ? '—' : `${v} days`);
const fmtDiffDays = (v) => (v > 0 ? `${v} day${v !== 1 ? 's' : ''} late` : v < 0 ? `${Math.abs(v)} day${Math.abs(v) !== 1 ? 's' : ''} early` : 'On time');
const formatStatusLabel = (status) => (status || '')
  .split('_')
  .map(w => w.charAt(0).toUpperCase() + w.slice(1))
  .join(' ');

// Best-effort: pulls a PNG snapshot straight from the live Chart.js canvas
// (via the react-chartjs-2 ref) rather than re-rendering the chart data as
// its own drawing routine — same approach already used by the Import
// Costing report PDF (costingPdf.js's generateReportPDF).
function addChartImage(doc, chartRef, x, y, w, h, fallbackLabel) {
  if (chartRef?.current) {
    try {
      const canvas = chartRef.current.canvas;
      const image = canvas.toDataURL('image/png', 1.0);
      doc.addImage(image, 'PNG', x, y, w, h);
      return;
    } catch {
      // Fall through to the placeholder text below
    }
  }
  doc.setFont(undefined, 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(fallbackLabel, x, y + h / 2);
  doc.setFont(undefined, 'normal');
}

/**
 * @param {Object} options
 * @param {string} options.supplierName
 * @param {Object} options.metrics - one entry from SupplierMetrics.calculateAllMetrics
 * @param {Array} options.shipmentAudit - SupplierMetrics.getShipmentAudit(shipments, supplierName)
 * @param {Array} options.openOrderLines - SupplierMetrics.getOpenOrderLines(shipments, supplierName)
 * @param {Object} options.trendChartRef - React ref to the supplier's on-time trend <Line> chart
 * @param {Object} options.diffChartRef - React ref to the supplier's delivery-timing <Bar> chart
 */
export function generateSupplierPerformancePDF({ supplierName, metrics, shipmentAudit, openOrderLines, trendChartRef, diffChartRef }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont(undefined, 'bold');
  doc.text('Supplier Performance Report', 14, 14);
  doc.setFontSize(13);
  doc.text(supplierName, 14, 24);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(COMPANY_NAME, pageWidth - 14, 12, { align: 'right' });
  doc.text(`Generated: ${fmtDate(new Date())}`, pageWidth - 14, 18, { align: 'right' });

  let y = 42;

  // Grade callout
  const grade = metrics.grade?.grade;
  if (grade) {
    const color = GRADE_COLORS[grade] || MUTED;
    doc.setFillColor(...color);
    doc.roundedRect(14, y - 7, 70, 11, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`Grade ${grade} — ${GRADE_LABELS[grade] || ''}`, 49, y - 1, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  // KPI summary table
  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Shipments', String(metrics.totalShipments ?? 0)],
      ['Open Orders', String(metrics.openOrdersCount ?? 0)],
      ['On-Time Delivery', fmtPct(metrics.onTimePercent)],
      ['Inspection Pass Rate', fmtPct(metrics.passRatePercent)],
      ['Avg Arrival Days Late/Early', fmtDays(metrics.avgLeadTime)],
      ['Avg Freight Lead Time', fmtDays(metrics.avgFreightLeadTime)],
      ['On-Time Shipped % (ETD vs Date Shipped)', fmtPct(metrics.onTimeDeparturePercent)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 } },
  });

  y = doc.lastAutoTable.finalY + 10;

  // Charts
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...BRAND_DARK);
  doc.text('On-Time Trend — Last 12 Weeks', 14, y);
  y += 4;
  addChartImage(doc, trendChartRef, 14, y, pageWidth - 28, 65, 'No deliveries from this supplier in the last 12 weeks.');
  y += 73;

  doc.setFont(undefined, 'bold');
  doc.text('Delivery Timing per Shipment (Days Late / Early)', 14, y);
  y += 4;
  addChartImage(doc, diffChartRef, 14, y, pageWidth - 28, 65, 'No warehouse-confirmed shipments to chart yet.');
  y += 73;

  if (y > pageHeight - 40) { doc.addPage(); y = 20; }

  // Shipment Audit Trail
  if (shipmentAudit.length > 0) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...BRAND_DARK);
    doc.text('Shipment Audit Trail', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Order Ref', 'Product', 'Scheduled', 'Actual', 'Days Late/Early', 'Status']],
      body: shipmentAudit.map(a => [
        a.orderRef,
        a.productName || '—',
        fmtDate(a.scheduledDate),
        fmtDate(a.actualDate),
        fmtDiffDays(a.diffDays),
        a.onTime ? 'On-Time' : (a.lateConfirmed ? 'Late (Confirmed)' : 'Late (Needs Review)'),
      ]),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ROW_ALT },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 4) return;
        const val = String(data.cell.raw || '');
        if (val.includes('late')) data.cell.styles.textColor = LATE_RED;
        else if (val.includes('early')) data.cell.styles.textColor = EARLY_GREEN;
      },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (y > pageHeight - 40) { doc.addPage(); y = 20; }

  // Open Orders
  if (openOrderLines.length > 0) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...BRAND_DARK);
    doc.text('Open Orders', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Order Ref', 'Product', 'Status', 'Due Date', 'Basis', 'Days Outstanding']],
      body: openOrderLines.map(o => [
        o.orderRef,
        o.productName || '—',
        formatStatusLabel(o.latestStatus),
        fmtDate(o.dueDateBasis === 'ETD' ? o.shipment.etd : o.scheduledDate),
        o.dueDateBasis,
        o.daysOutstanding < 0
          ? `${Math.abs(o.daysOutstanding)} day${Math.abs(o.daysOutstanding) !== 1 ? 's' : ''} overdue`
          : o.daysOutstanding === 0 ? 'Due today' : `Due in ${o.daysOutstanding} day${o.daysOutstanding !== 1 ? 's' : ''}`,
      ]),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ROW_ALT },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Footer on every page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Generated by ${COMPANY_NAME} — Supplier Performance Report`, 14, pageHeight - 9);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 9, { align: 'right' });
  }

  const safeName = supplierName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`supplier-performance-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
