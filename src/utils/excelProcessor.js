import * as XLSX from 'xlsx';
import { Shipment, ShipmentStatus } from '../types/shipment';
import { getWeekStartDate, getWeekNumber } from './dateUtils';

export class ExcelValidationError {
  constructor(rowIndex, column, message) {
    this.rowIndex = rowIndex;
    this.column = column;
    this.message = message;
  }
}

export class ExcelProcessor {
  // ---- helpers -------------------------------------------------------------
  static _normHeader(s) {
    return String(s ?? '')
      .toLowerCase()
      .replace(/\u00B³/g, '3')  // m³ -> m3
      .replace(/\s+/g, ' ')
      .trim();
  }
  static _detectPalletQtyHeader(headers) {
    const H = headers || [];
    const n = (s) => this._normHeader(s);
    const aliases = ['pallet qty','pallet quantity','pallets','pallet','pallet count'];

    // exact / alias match
    for (let i = 0; i < H.length; i++) {
      if (aliases.includes(n(H[i]))) return H[i];
    }
    // fallback: next column after QUANTITY
    const qtyAliases = ['quantity','qty','units','pcs'];
    const qIdx = H.findIndex(h => qtyAliases.includes(n(h)));
    if (qIdx >= 0 && H[qIdx + 1] !== undefined) return H[qIdx + 1];

    return null;
  }
  static _excelSerialToDate(value) {
    const serial = Number(value);
    if (!Number.isFinite(serial) || serial < 30000 || serial > 60000) return null;

    const parsed = XLSX.SSF.parse_date_code(serial);
    if (!parsed) return null;

    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  static _parseDateString(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const isoMatch = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return isNaN(date.getTime()) ? null : date;
    }

    const localMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (localMatch) {
      const [, day, month, year] = localMatch;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  }
  static _getWeekSource(row) {
    return row['WEEK NUMBER'] ??
      row['Week Number'] ??
      row['WEEK'] ??
      row['Week'] ??
      row['DELIVERY DATE'] ??
      row['Delivery Date'] ??
      row['DELIVERY DATES'] ??
      row['Delivery Dates'] ??
      row['DEL DATE'] ??
      row['Del Date'] ??
      row['ETA DATE'] ??
      row['ETA Date'] ??
      row['ETA'];
  }
  static parseWeekNumber(weekValue) {
    if (!weekValue && weekValue !== 0) return null;
    if (weekValue instanceof Date && !isNaN(weekValue.getTime())) {
      return getWeekNumber(weekValue);
    }
    if (typeof weekValue === 'number') {
      if (weekValue >= 1 && weekValue <= 53) return weekValue;
      const date = this._excelSerialToDate(weekValue);
      return date ? getWeekNumber(date) : weekValue;
    }
    const valueStr = weekValue.toString().trim();
    if (/^\d+(\.\d+)?$/.test(valueStr)) {
      const numericValue = Number(valueStr);
      if (numericValue >= 1 && numericValue <= 53) return numericValue;
      const date = this._excelSerialToDate(numericValue);
      if (date) return getWeekNumber(date);
    }

    const parsedDate = this._parseDateString(valueStr);
    if (parsedDate) return getWeekNumber(parsedDate);

    const weekNum = parseInt(valueStr.replace(/\D/g, ''), 10);
    return isNaN(weekNum) ? null : weekNum;
  }
  // robust: "1 234,56" -> 1234.56 ; "2,5" -> 2.5 ; "1,234.56" -> 1234.56
  static parseQuantity(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    let s = String(v).trim().replace(/\s+/g, '');
    if (s.includes('.') && s.includes(',')) s = s.replace(/,/g, '');
    else if (!s.includes('.') && s.includes(',')) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  static extractProductName(orderRefValue) {
    if (!orderRefValue) return '';
    const parts = orderRefValue.toString().split(' / ');
    return parts[0].trim();
  }
  static mapStatus(statusValue) {
    if (!statusValue) return ShipmentStatus.PLANNED_AIRFREIGHT;
    const s = statusValue.toString().toLowerCase().replace(/_/g, ' ').trim();

    // Exact matches first
    if (s === 'in transit seaway' || s === 'in transit sea') return ShipmentStatus.IN_TRANSIT_SEAWAY;
    if (s === 'in transit roadway' || s === 'in transit road') return ShipmentStatus.IN_TRANSIT_ROADWAY;
    if (s === 'in transit airfreight' || s === 'in transit air') return ShipmentStatus.IN_TRANSIT_AIRFREIGHT;
    if (s === 'planned seafreight' || s === 'planned sea') return ShipmentStatus.PLANNED_SEAFREIGHT;
    if (s === 'planned airfreight' || s === 'planned air') return ShipmentStatus.PLANNED_AIRFREIGHT;

    // Pattern matches
    if (s.includes('seaway') || s.includes('sea transit') || s.includes('maritime')) return ShipmentStatus.IN_TRANSIT_SEAWAY;
    if (s.includes('roadway') || s.includes('road transit')) return ShipmentStatus.IN_TRANSIT_ROADWAY;
    if (s.includes('airfreight') || s.includes('air transit')) return ShipmentStatus.IN_TRANSIT_AIRFREIGHT;
    if (s.includes('moored')) return ShipmentStatus.MOORED;
    if (s.includes('berth working')) return ShipmentStatus.BERTH_WORKING;
    if (s.includes('berth complete')) return ShipmentStatus.BERTH_COMPLETE;
    if (s.includes('gated') && s.includes('port')) return ShipmentStatus.GATED_IN_PORT;
    if (s.includes('arrived pta') || s.includes('pta')) return ShipmentStatus.ARRIVED_PTA;
    if (s.includes('arrived klm') || s.includes('klm')) return ShipmentStatus.ARRIVED_KLM;
    if (s.includes('arrived offsite') || s.includes('offsite')) return ShipmentStatus.ARRIVED_OFFSITE;
    if (s.includes('arrived') || s.includes('delivered')) return ShipmentStatus.ARRIVED_PTA;
    if (s.includes('delay') && s.includes('customs')) return ShipmentStatus.DELAYED_CUSTOMS;
    if (s.includes('delay') && s.includes('document')) return ShipmentStatus.DELAYED_DOCUMENTS;
    if (s.includes('delay') && s.includes('supplier')) return ShipmentStatus.DELAYED_SUPPLIER;
    if (s.includes('delay')) return ShipmentStatus.DELAYED_PORT;
    if (s.includes('cancel')) return ShipmentStatus.CANCELLED;

    return ShipmentStatus.PLANNED_AIRFREIGHT;
  }

  static calculateWeekDate(weekNumber) {
    if (!weekNumber || weekNumber < 1 || weekNumber > 53) return null;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentWeek = getWeekNumber(now);
    const currentMonth = now.getMonth(); // 0-11

    // Smart year detection:
    // If we're in December (month 11) and importing week 1-10, assume next year
    // If we're in January (month 0) and importing week 45-53, assume last year
    let targetYear = currentYear;

    if (currentMonth === 11 && weekNumber <= 10) {
      targetYear = currentYear + 1;
    } else if (currentMonth === 0 && weekNumber >= 45) {
      targetYear = currentYear - 1;
    } else if (weekNumber < currentWeek - 20) { // 20-week lookahead window for smart year detection
      // If week is more than 20 weeks behind current, it's probably next year
      targetYear = currentYear + 1;
    } else if (weekNumber > currentWeek + 20) { // 20-week lookahead window for smart year detection
      // If week is more than 20 weeks ahead of current, it's probably last year
      targetYear = currentYear - 1;
    }

    const weekStartDate = getWeekStartDate(weekNumber, targetYear);
    return weekStartDate.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  }

  // ---- validation ---------------------------------------------------------
  static validateRow(row, rowIndex) {
    const errors = [];

    // Supplier is required
    const supplier = (row['SUPPLIER'] || row['Supplier'] || '').toString().trim();
    if (!supplier) {
      errors.push(new ExcelValidationError(rowIndex, 'SUPPLIER', 'Supplier is required'));
    }

    // Order Ref is required
    const orderRef = (row['ORDER/REF'] || row['Order/Ref'] || '').toString().trim();
    if (!orderRef) {
      errors.push(new ExcelValidationError(rowIndex, 'ORDER/REF', 'Order Reference is required'));
    }

    // Quantity must be positive number
    const quantity = this.parseQuantity(row['QUANTITY'] || row['Quantity'] || row['Qty']);
    if (quantity <= 0) {
      errors.push(new ExcelValidationError(rowIndex, 'QUANTITY', 'Quantity must be greater than 0'));
    }

    // Pallet Qty should be positive if provided
    const palletQtyHeader = this._detectPalletQtyHeader(Object.keys(row));
    const palletQtyRaw = palletQtyHeader ? row[palletQtyHeader] : undefined;
    if (palletQtyRaw !== undefined && palletQtyRaw !== '') {
      const palletQty = this.parseQuantity(palletQtyRaw);
      if (palletQty < 0) {
        errors.push(new ExcelValidationError(rowIndex, 'PALLET QTY', 'Pallet Quantity cannot be negative'));
      }
    }

    // Week Number validation (1-53)
    const weekNumber = this.parseWeekNumber(this._getWeekSource(row));
    if (weekNumber && (weekNumber < 1 || weekNumber > 53)) {
      errors.push(new ExcelValidationError(rowIndex, 'WEEK NUMBER', 'Week Number must be between 1 and 53'));
    }

    // Warehouse validation
    const warehouse = (row['RECEIVING WAREHOUSE'] || row['Warehouse'] || row['FINAL POD'] || '').toString().trim();
    const validWarehouses = ['PRETORIA', 'KLAPMUTS', 'OFFSITE'];
    if (warehouse && !validWarehouses.includes(warehouse)) {
      errors.push(new ExcelValidationError(rowIndex, 'RECEIVING WAREHOUSE', `Warehouse must be one of: ${validWarehouses.join(', ')}`));
    }

    return errors;
  }

  static validateData(formattedRows) {
    const allErrors = [];
    const validRows = [];

    formattedRows.forEach((row, index) => {
      // Skip empty rows
      const supplier = (row['SUPPLIER'] || row['Supplier'] || '').toString().trim();
      if (!supplier) return;

      const errors = this.validateRow(row, index + 1); // +1 for 1-based row numbering
      if (errors.length > 0) {
        allErrors.push(...errors);
      } else {
        validRows.push(row);
      }
    });

    return { validRows, errors: allErrors };
  }

  // ---- main ---------------------------------------------------------------
  static parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const headers = aoa[0] || [];
          const rows = aoa.slice(1);

          const formatted = rows.map((row) => {
            const o = {};
            headers.forEach((h, i) => { o[h] = row[i]; });
            return o;
          }).filter((row) => {
            // Skip empty rows (no supplier and no order ref)
            const supplier = (row['SUPPLIER'] || row['Supplier'] || '').toString().trim();
            const orderRef = (row['ORDER/REF'] || row['Order/Ref'] || '').toString().trim();
            return supplier || orderRef;
          });

          const palletQtyHeader = this._detectPalletQtyHeader(headers);

          const shipments = this.convertToShipments(formatted, palletQtyHeader);
          resolve(shipments);
        } catch (err) {
          console.error('ExcelProcessor: Error', err);
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  static parseExcelFileWithValidation(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const headers = aoa[0] || [];
          const rows = aoa.slice(1);

          const formatted = rows.map((row) => {
            const o = {};
            headers.forEach((h, i) => { o[h] = row[i]; });
            return o;
          });

          // Validate data before conversion
          const { validRows, errors } = this.validateData(formatted);

          if (errors.length > 0) {
            // Resolve with validation results, don't reject
            resolve({
              validRows: [],
              errors,
              preview: formatted.slice(0, 5)
            });
            return;
          }

          const palletQtyHeader = this._detectPalletQtyHeader(headers);
          const shipments = this.convertToShipments(validRows, palletQtyHeader);
          resolve({
            validRows: shipments,
            errors: [],
            preview: shipments.slice(0, 5)
          });
        } catch (err) {
          console.error('ExcelProcessor: Error', err);
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  static convertToShipments(data, palletQtyHeader) {
    return (data || []).map((row, index) => {
      const palletQtyRaw =
        (palletQtyHeader ? row[palletQtyHeader] : undefined) ??
        row['PALLET QTY'] ?? row['Pallet Qty'] ?? row['PALLETS'] ?? row['Pallet'] ?? row['Pallet Quantity'] ?? row['pallet qty'] ?? row['pallets'];
      const palletQtyValue = this.parseQuantity(palletQtyRaw);

      const weekNumber = this.parseWeekNumber(this._getWeekSource(row));
      const selectedWeekDate = this.calculateWeekDate(weekNumber);

      return new Shipment({
        id: `ship_${Date.now()}_${index}`,
        supplier: row['SUPPLIER'] || row['Supplier'] || '',
        orderRef: row['ORDER/REF'] || row['Order/Ref'] || `ORD-${index + 1}`,
        finalPod: row['FINAL POD'] || row['Final POD'] || '',
        latestStatus: this.mapStatus(row['LATEST STATUS'] || row['Latest Status']),
        weekNumber: weekNumber,
        selectedWeekDate: selectedWeekDate,
        productName: (row['PRODUCT NAME'] || row['Product Name'] || this.extractProductName(row['ORDER/REF'] || row['Order/Ref'] || '')),
        quantity: this.parseQuantity(row['QUANTITY'] || row['Quantity'] || row['Qty']),
        palletQty: palletQtyValue,
        receivingWarehouse: row['RECEIVING WAREHOUSE'] || row['Receiving Warehouse'] || row['WAREHOUSE'] || row['Warehouse'] || row['FINAL POD'] || row['Final POD'] || '',
        forwardingAgent: row['FORWARDING AGENT'] || row['Forwarding Agent'] || '',
        vesselName: row['VESSEL NAME'] || row['Vessel Name'] || '',
        incoterm: row['INCOTERM'] || row['Incoterm'] || '',
        notes: row['NOTES'] || row['Notes'] || row['COMMENTS'] || row['Comments'] || '',
      });
    });
  }

  static exportToExcel(shipments, filename = 'shipment_schedule.xlsx') {
    const ws = XLSX.utils.json_to_sheet(
      shipments.map(s => ({
        'SUPPLIER': s.supplier,
        'ORDER/REF': s.orderRef,
        'FINAL POD': s.finalPod,
        'LATEST STATUS': s.latestStatus,
        'WEEK NUMBER': s.weekNumber,
        'PRODUCT NAME': s.productName,
        'QUANTITY': s.quantity,
        'RECEIVING WAREHOUSE': s.receivingWarehouse,
        'FORWARDING AGENT': s.forwardingAgent,
        'PALLET QTY': s.palletQty,
        'NOTES': s.notes,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shipment Schedule');
    XLSX.writeFile(wb, filename);
  }

  static downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([{
      'SUPPLIER': 'Example Supplier Ltd',
      'ORDER/REF': 'APO0016424',
      'PRODUCT NAME': 'Disodium Phosphate Anhydrous',
      'FINAL POD': 'PRETORIA',
      'LATEST STATUS': 'planned_seafreight',
      'WEEK NUMBER': 36,
      'QUANTITY': 1000,
      'PALLET QTY': 4,
      'RECEIVING WAREHOUSE': 'PRETORIA',
      'FORWARDING AGENT': 'DHL',
      'VESSEL NAME': 'MSC MARINA',
      'INCOTERM': 'CIF',
      'NOTES': 'Example notes',
    }]);
    // Set column widths for better readability
    ws['!cols'] = [
      { wch: 22 },  // SUPPLIER
      { wch: 15 },  // ORDER/REF
      { wch: 30 },  // PRODUCT NAME
      { wch: 12 },  // FINAL POD
      { wch: 18 },  // LATEST STATUS
      { wch: 12 },  // WEEK NUMBER
      { wch: 10 },  // QUANTITY
      { wch: 10 },  // PALLET QTY
      { wch: 20 },  // RECEIVING WAREHOUSE
      { wch: 18 },  // FORWARDING AGENT
      { wch: 15 },  // VESSEL NAME
      { wch: 10 },  // INCOTERM
      { wch: 25 },  // NOTES
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TRACKING');
    XLSX.writeFile(wb, 'shipment_template.xlsx');
  }
}
