import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { isDelayedStatus } from '../types/shipment';

/**
 * Sanitize a value for safe Excel export (prevent formula injection)
 */
function sanitizeExcelValue(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@\t\r]/.test(value)) {
    return "'" + value;
  }
  return value;
}

/**
 * Generate a PDF report for the given shipments.
 * @param {Array} shipments - The filtered/sorted shipments to include
 * @param {Object} filters - { searchTerm, statusFilter }
 */
export function generatePDF(shipments, { searchTerm = '', statusFilter = ['all'] } = {}) {
  const doc = new jsPDF();

  // Add title
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Shipment Schedule Report', 14, 20);

  // Add generation date
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 14, 30);

  // Add summary info
  doc.text(`Total Shipments: ${shipments.length}`, 14, 40);
  const delayedCount = shipments.filter(s => isDelayedStatus(s.latestStatus)).length;
  doc.text(`Delayed Shipments: ${delayedCount}`, 14, 47);

  if (searchTerm || !statusFilter.includes('all')) {
    let filterText = 'Applied Filters: ';
    if (searchTerm) filterText += `Search: "${searchTerm}"`;
    if (!statusFilter.includes('all')) {
      if (searchTerm) filterText += ', ';
      filterText += `Status: ${statusFilter.join(', ')}`;
    }
    doc.text(filterText, 14, 54);
  }

  // Prepare table data
  const tableData = shipments.map(shipment => [
    sanitizeExcelValue(shipment.supplier),
    sanitizeExcelValue(shipment.orderRef),
    sanitizeExcelValue(shipment.finalPod),
    shipment.latestStatus.charAt(0).toUpperCase() + shipment.latestStatus.slice(1).replace('_', ' '),
    shipment.weekNumber || '-',
    sanitizeExcelValue(shipment.productName || '-'),
    shipment.quantity || '-',
    sanitizeExcelValue(shipment.receivingWarehouse || '-'),
    sanitizeExcelValue(shipment.forwardingAgent || '-'),
    sanitizeExcelValue(shipment.vesselName || '-'),
    sanitizeExcelValue(shipment.incoterm || '-'),
    shipment.palletQty ? (Math.round(shipment.palletQty) || 1) : '-'
  ]);

  // Add table
  doc.autoTable({
    head: [[
      'Supplier',
      'Order/Ref',
      'Final POD',
      'Status',
      'Week #',
      'Product',
      'Quantity',
      'Warehouse',
      'Forwarding Agent',
      'Vessel Name',
      'Incoterm',
      'Pallet Qty'
    ]],
    body: tableData,
    startY: searchTerm || !statusFilter.includes('all') ? 60 : 53,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [5, 150, 105],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250]
    },
    columnStyles: {
      0: { cellWidth: 20 }, // Supplier
      1: { cellWidth: 25 }, // Order/Ref
      2: { cellWidth: 20 }, // Final POD
      3: { cellWidth: 18 }, // Status
      4: { cellWidth: 12 }, // Week #
      5: { cellWidth: 25 }, // Product
      6: { cellWidth: 15 }, // Quantity
      7: { cellWidth: 22 }, // Warehouse
      8: { cellWidth: 20 }, // Forwarding Agent
      9: { cellWidth: 12 }  // Pallet Qty
    },
    didParseCell: function(data) {
      // Highlight delayed shipments
      const shipment = shipments[data.row.index];
      if (shipment && isDelayedStatus(shipment.latestStatus) && data.section === 'body') {
        data.cell.styles.fillColor = [255, 245, 245]; // Light red background
        data.cell.styles.textColor = [211, 47, 47]; // Dark red text
      }
    }
  });

  // Add footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Import Supply Chain Management - Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  // Save the PDF
  const fileName = `shipment-schedule-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

/**
 * Generate an Excel file for the given shipments.
 * @param {Array} shipments - The filtered/sorted shipments to include
 */
export function generateExcel(shipments) {
  // Create worksheet data
  const worksheetData = [
    // Header row
    [
      'Supplier',
      'Order/Ref',
      'Final POD',
      'Latest Status',
      'Month',
      'Expected Delivery Date',
      'Product',
      'Quantity',
      'Warehouse',
      'Forwarding Agent',
      'Vessel Name',
      'Incoterm',
      'Pallet Qty'
    ],
    // Data rows
    ...shipments.map(shipment => [
      sanitizeExcelValue(shipment.supplier || ''),
      sanitizeExcelValue(shipment.orderRef || ''),
      sanitizeExcelValue(shipment.finalPod || ''),
      sanitizeExcelValue(shipment.latestStatus || ''),
      shipment.selectedWeekDate ? new Date(shipment.selectedWeekDate).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }) : '',
      shipment.selectedWeekDate ? new Date(shipment.selectedWeekDate).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
      sanitizeExcelValue(shipment.product || ''),
      shipment.quantity || '',
      sanitizeExcelValue(shipment.warehouse || ''),
      sanitizeExcelValue(shipment.forwardingAgent || ''),
      sanitizeExcelValue(shipment.vesselName || ''),
      sanitizeExcelValue(shipment.incoterm || ''),
      shipment.palletQty ? (Math.round(shipment.palletQty) || 1) : ''
    ])
  ];

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths
  const colWidths = [
    { wch: 20 }, // Supplier
    { wch: 15 }, // Order/Ref
    { wch: 15 }, // Final POD
    { wch: 15 }, // Latest Status
    { wch: 15 }, // Month
    { wch: 15 }, // Expected Delivery Date
    { wch: 20 }, // Product
    { wch: 10 }, // Quantity
    { wch: 15 }, // Warehouse
    { wch: 18 }, // Forwarding Agent
    { wch: 12 }  // Pallet Qty
  ];
  ws['!cols'] = colWidths;

  // Add some basic styling to header row
  const headerRange = XLSX.utils.decode_range(ws['!ref']);
  for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellAddress]) continue;
    ws[cellAddress].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: "CCCCCC" } }
    };
  }

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Shipment Schedule');

  // Generate filename with current date
  const fileName = `shipment-schedule-${new Date().toISOString().split('T')[0]}.xlsx`;

  // Save the file
  XLSX.writeFile(wb, fileName);
}
