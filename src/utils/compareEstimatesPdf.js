/**
 * PDF export for Import Costing's "Compare Estimates" view — a shareable
 * side-by-side of two saved cost estimates (identity, cost composition,
 * and the full metric comparison table), so it can be sent internally
 * without giving someone app access. Mirrors the on-screen CompareEstimatesView
 * (ImportCosting.jsx) exactly: every value here is passed in already computed
 * by that component, not re-derived, so the PDF can never drift from what's
 * on screen.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatNumber } from './costingCalculations';

// Same navy used by the single-estimate PDF's cover bar (costingPdf.js) --
// deliberately not the green brand used by Quote Request/Supplier
// Performance PDFs, so this stays visually part of the Import Costing family.
const NAVY = [14, 37, 68];
const SURFACE_SOFT = [241, 245, 249];
const ROW_ALT = [248, 250, 252];
const BODY_MUTED = [107, 114, 128];
const LOWER_GREEN = [22, 101, 52];
const LOWER_BG = [220, 252, 231];
const HEADLINE_BG = [255, 251, 235];
const DIFF_UP_RED = [220, 38, 38];
const DIFF_DOWN_GREEN = [22, 163, 74];

const fmtDate = (d) => {
  if (!d) return '—';
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? String(d) : parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * @param {Object} options
 * @param {Object} options.estA - { reference, supplier, modeLabel, date, weightKg, productCount, roeOrigin, roeEur }
 * @param {Object} options.estB - same shape as estA
 * @param {Array} options.compositionA - [{ label, color: '#rrggbb', value, pct }] for estA's cost composition bar
 * @param {Array} options.compositionB - same shape, for estB
 * @param {Array} options.rows - [{ label, headline, valA, valB, diff, pctDiff, aIsLower, bIsLower, perKgA, perKgB }]
 */
export function generateCompareEstimatesPDF({ estA, estB, compositionA, compositionB, rows }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // === Cover bar, same convention as the single-estimate PDF ===
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('SYNERCORE', 10, 11);
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  const titleText = 'Cost Estimate Comparison';
  doc.text(titleText, pageWidth - doc.getTextWidth(titleText) - 10, 11);

  doc.setFillColor(...SURFACE_SOFT);
  doc.rect(0, 16, pageWidth, 9, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...BODY_MUTED);
  doc.text(`Generated: ${fmtDate(new Date())}`, 10, 22);

  let y = 34;

  // === Identity cards, side by side ===
  const cardW = (pageWidth - 28) / 2 - 3;
  [estA, estB].forEach((est, idx) => {
    const x = 14 + idx * (cardW + 6);
    doc.setDrawColor(...SURFACE_SOFT);
    doc.setFillColor(...SURFACE_SOFT);
    doc.roundedRect(x, y, cardW, 35, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...BODY_MUTED);
    doc.setFont(undefined, 'bold');
    doc.text(`ESTIMATE ${idx === 0 ? 'A' : 'B'}`, x + 4, y + 6);
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(est.reference, x + 4, y + 12);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text(est.supplier, x + 4, y + 18);
    doc.setFontSize(7);
    doc.setTextColor(...BODY_MUTED);
    doc.text(`${est.modeLabel} · ${fmtDate(est.date)}`, x + 4, y + 23.5);
    doc.text(`${formatNumber(est.weightKg)} kg · ${est.productCount} product line(s)`, x + 4, y + 28);
    doc.text(`ROE used: USD/ZAR ${formatNumber(est.roeOrigin || 0, 4)} · EUR/ZAR ${formatNumber(est.roeEur || 0, 4)}`, x + 4, y + 32.5);
  });
  y += 43;

  // === Cost Composition — redrawn natively (the on-screen bar is a plain
  // div stack, not a Chart.js canvas, so there's no chart image to capture) ===
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...NAVY);
  doc.text('Cost Composition', 14, y);
  y += 6;

  const barX = 14;
  const barW = pageWidth - 28;
  const barH = 6;
  [compositionA, compositionB].forEach((segments, idx) => {
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...BODY_MUTED);
    doc.text(`Estimate ${idx === 0 ? 'A' : 'B'}`, barX, y);
    y += 2;
    const total = segments.reduce((sum, seg) => sum + seg.value, 0);
    let cursorX = barX;
    if (total > 0) {
      segments.filter(seg => seg.value > 0).forEach(seg => {
        const w = (seg.value / total) * barW;
        doc.setFillColor(...hexToRgb(seg.color));
        doc.rect(cursorX, y, w, barH, 'F');
        cursorX += w;
      });
    } else {
      doc.setFillColor(229, 231, 235);
      doc.rect(barX, y, barW, barH, 'F');
    }
    y += barH + 6;
  });

  // Legend
  doc.setFontSize(7.5);
  let legendX = 14;
  (compositionA.length ? compositionA : compositionB).forEach(seg => {
    doc.setFillColor(...hexToRgb(seg.color));
    doc.rect(legendX, y - 2.5, 3, 3, 'F');
    doc.setTextColor(55, 65, 81);
    doc.setFont(undefined, 'normal');
    doc.text(seg.label, legendX + 4.5, y);
    legendX += 4.5 + doc.getTextWidth(seg.label) + 6;
  });
  y += 10;

  // === Metric comparison table ===
  const headlineRows = new Set();
  rows.forEach((row, idx) => { if (row.headline) headlineRows.add(idx); });

  const cellText = (val, isLower, perKg) => {
    let text = formatCurrency(val);
    if (isLower) text += '  [LOWER]';
    if (perKg !== null && perKg !== undefined) text += `\n${formatCurrency(perKg)}/kg`;
    return text;
  };
  const diffText = (diff, pctDiff) => {
    if (diff === 0) return '—';
    let text = `${diff > 0 ? '+' : ''}${formatCurrency(diff)}`;
    if (pctDiff !== null && pctDiff !== undefined) text += `\n(${pctDiff > 0 ? '+' : ''}${pctDiff.toFixed(1)}%)`;
    return text;
  };

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Estimate A', 'Estimate B', 'Difference (B − A)']],
    body: rows.map(row => [
      row.label,
      cellText(row.valA, row.aIsLower, row.perKgA),
      cellText(row.valB, row.bIsLower, row.perKgB),
      diffText(row.diff, row.pctDiff),
    ]),
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = rows[data.row.index];
      if (headlineRows.has(data.row.index)) {
        data.cell.styles.fillColor = HEADLINE_BG;
        if (data.column.index === 0) data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 1 && row.aIsLower) {
        data.cell.styles.fillColor = LOWER_BG;
        data.cell.styles.textColor = LOWER_GREEN;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 2 && row.bIsLower) {
        data.cell.styles.fillColor = LOWER_BG;
        data.cell.styles.textColor = LOWER_GREEN;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 3 && row.diff !== 0) {
        data.cell.styles.textColor = row.diff > 0 ? DIFF_UP_RED : DIFF_DOWN_GREEN;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Footer on every page, same wording as the rest of Import Costing's PDFs
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BODY_MUTED);
    doc.text('Generated by Synercore Import Schedule', 14, pageHeight - 9);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 9, { align: 'right' });
  }

  const safe = (s) => (s || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`compare-estimates-${safe(estA.reference)}-vs-${safe(estB.reference)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function hexToRgb(hex) {
  const clean = (hex || '#94a3b8').replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
