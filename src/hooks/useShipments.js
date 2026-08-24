// src/hooks/useShipments.js
import { useState, useRef, useCallback } from 'react';
import { authFetch } from '../utils/authFetch';
import { ExcelProcessor } from '../utils/excelProcessor';
import { getApiUrl } from '../config/api';
import { authUtils } from '../utils/auth';
import { useNotification } from '../contexts/NotificationContext';

// Timeout helper for fetch (fetch doesn't honor a "timeout" option)
async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...opts,
      signal: controller.signal,
      credentials: 'include'
    });
  } finally {
    clearTimeout(id);
  }
}

export function useShipments() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const loadingCountRef = useRef(0);
  const lastFetchRef = useRef(0);
  const { showSuccess, showError } = useNotification();

  const FETCH_COOLDOWN = 5000;

  const startLoading = useCallback(() => {
    loadingCountRef.current += 1;
    setLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    loadingCountRef.current = Math.max(0, loadingCountRef.current - 1);
    if (loadingCountRef.current === 0) setLoading(false);
  }, []);

  const fetchShipments = useCallback(async (isBackgroundSync = false) => {
    try {
      const now = Date.now();
      if (isBackgroundSync && (now - lastFetchRef.current) < FETCH_COOLDOWN) {
        return;
      }
      lastFetchRef.current = now;

      if (!isBackgroundSync) startLoading();

      let response;
      let lastError;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Server-side pagination limit
          response = await fetchWithTimeout(getApiUrl('/api/shipments?limit=5000'), {
            headers: {
              ...(isBackgroundSync ? { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } : {}),
              ...authUtils.getAuthHeader()
            }
          }, 10000); // 10s fetch timeout per attempt

          if (response.ok) break;

          if (response.status === 503 || response.status >= 500) {
            const body = await response.text().catch(() => '');
            throw new Error(`Server error ${response.status}: ${body}`);
          } else {
            const body = await response.text().catch(() => '');
            throw new Error(`Failed to fetch shipments: ${response.status} ${body}`);
          }
        } catch (err) {
          lastError = err;
          if (attempt < maxRetries) await new Promise(r => setTimeout(r, 300 * attempt)); // Linear backoff: 300ms, 600ms
        }
      }

      if (!response || !response.ok) throw lastError || new Error('Failed to fetch shipments after retries');

      const data = await response.json();

      // Warn if response may be truncated at the pagination limit
      if ((data.data || []).length >= 5000) {
        console.warn('Shipment data may be truncated: response count reached the 5000 limit');
      }

      const normalized = (data.data || []).map(s => ({
        id: s.id,
        orderRef: s.order_ref || s.orderRef,
        supplier: s.supplier,
        productName: s.product_name || s.productName,
        quantity: Number(s.quantity) || 0,
        palletQty: Number(s.pallet_qty || s.palletQty) || 0,
        cbm: Number(s.cbm) || 0,
        latestStatus: s.latest_status || s.latestStatus,
        weekNumber: Number(s.week_number || s.weekNumber) || 0,
        weekDate: s.week_date || s.weekDate,
        selectedWeekDate: s.selected_week_date || s.selectedWeekDate,
        originalWeekNumber: s.original_week_number || s.originalWeekNumber || null,
        originalSelectedWeekDate: s.original_selected_week_date || s.originalSelectedWeekDate || null,
        finalPod: s.final_pod || s.finalPod,
        receivingWarehouse: s.receiving_warehouse || s.receivingWarehouse,
        forwardingAgent: s.forwarding_agent || s.forwardingAgent,
        vesselName: s.vessel_name || s.vesselName,
        bolNumber: s.bol_number || s.bolNumber || '',
        incoterm: s.incoterm,
        notes: s.notes,
        createdAt: s.created_at || s.createdAt,
        updatedAt: s.updated_at || s.updatedAt,
        receivedQuantity: s.received_quantity || s.receivedQuantity ? Number(s.received_quantity || s.receivedQuantity) : null,
        unloadingStartDate: s.unloading_start_date || s.unloadingStartDate,
        unloadingCompletedDate: s.unloading_completed_date || s.unloadingCompletedDate,
        inspectionDate: s.inspection_date || s.inspectionDate,
        inspectionStatus: s.inspection_status || s.inspectionStatus,
        inspectionNotes: s.inspection_notes || s.inspectionNotes,
        inspectedBy: s.inspected_by || s.inspectedBy,
        receivingDate: s.receiving_date || s.receivingDate,
        actualArrivalDate: s.actual_arrival_date || s.actualArrivalDate || null,
        warehouseSince: s.warehouse_since || s.warehouseSince || null,
        receivingStatus: s.receiving_status || s.receivingStatus,
        receivingNotes: s.receiving_notes || s.receivingNotes,
        receivedBy: s.received_by || s.receivedBy,
        discrepancies: s.discrepancies,
        rejectionDate: s.rejection_date || s.rejectionDate,
        rejectionReason: s.rejection_reason || s.rejectionReason,
        rejectedBy: s.rejected_by || s.rejectedBy,
        reminderDate: s.reminder_date || s.reminderDate || null,
        reminderNote: s.reminder_note || s.reminderNote || '',
        shipmentType: s.shipment_type || s.shipmentType || 'international',
        sourceWarehouse: s.source_warehouse || s.sourceWarehouse || '',
        sourcePalletRef: s.source_pallet_ref || s.sourcePalletRef || '',
        batchLot: s.batch_lot || s.batchLot || '',
        releaseNumber: s.release_number || s.releaseNumber || '',
        asoNumber: s.aso_number || s.asoNumber || '',
      }));

      setShipments(normalized);
      setLastSyncTime(new Date());
    } catch (err) {
      if (isBackgroundSync) {
        console.warn('Background sync failed:', err.message);
      } else {
        console.error('useShipments: Error fetching shipments:', err);
        showError(`Failed to load shipments: ${err.message}`);
      }
    } finally {
      if (!isBackgroundSync) stopLoading();
    }
  }, [startLoading, stopLoading, showError]);

  const handleCreateShipment = useCallback(async (shipmentData) => {
    try {
      const response = await authFetch(getApiUrl('/api/shipments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shipmentData)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (Array.isArray(errorData?.details) ? errorData.details.map((d) => d.msg).join(', ') : null) ||
                            errorData?.error ||
                            'Failed to create shipment';
        throw new Error(errorMessage);
      }
      await fetchShipments();
      showSuccess('Shipment added successfully');
    } catch (err) {
      console.error('Shipment creation error:', err);
      showError(err.message);
      throw err;
    }
  }, [fetchShipments, showSuccess, showError]);

  const handleUpdateShipment = useCallback(async (id, updates) => {
    try {
      const response = await authFetch(getApiUrl(`/api/shipments/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const fieldDetails = errorData?.details?.fields || errorData?.details;
        const validationMessage = Array.isArray(fieldDetails)
          ? fieldDetails.map((field) => `${field.field || field.path}: ${field.message || field.msg}`).join(', ')
          : null;
        throw new Error(validationMessage || errorData?.error || 'Failed to update shipment');
      }
      await fetchShipments();
      showSuccess('Shipment updated successfully');
    } catch (err) { showError(err.message); }
  }, [fetchShipments, showSuccess, showError]);

  const handleDeleteShipment = useCallback(async (id) => {
    try {
      const response = await authFetch(getApiUrl(`/api/shipments/${id}`), { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete shipment');
      await fetchShipments();
      showSuccess('Shipment deleted successfully');
    } catch (err) { showError(err.message); }
  }, [fetchShipments, showSuccess, showError]);

  const handleArchiveShipment = useCallback(async (id) => {
    try {
      const response = await authFetch(getApiUrl(`/api/shipments/${id}/archive`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to archive shipment');
      await fetchShipments();
      showSuccess('Shipment archived successfully');
    } catch (err) { showError(err.message); }
  }, [fetchShipments, showSuccess, showError]);

  const handleFileUpload = useCallback(async (file, handleAddSupplier, shipmentType = 'international') => {
    try {
      startLoading();

      // International suppliers to exclude from local imports
      const EXCLUDED_SUPPLIERS = [
        'SACCO S.R.L', 'QIDA CHEMICAL CO. LTD', 'SHAKTI CHEMICALS',
        'AROMSA BESIN AROMA VE KATKI MADDELERI SAN. VE TIC. A.S.',
        'AROMSA BESIN AROMA VE KATKI MADDELERI SAN. VE TIC. A.Ş.',
        'AB MAURI', 'ECOLEX SDN. BHD', 'MARCEL CARRAGEENAN', 'TRISTAR GLOBAL SDN. BHD',
      ];

      let processedShipments = await ExcelProcessor.parseExcelFile(file);
      if (processedShipments.length === 0) throw new Error('No data found in Excel file');

      // Filter out international suppliers for local imports
      if (shipmentType === 'local') {
        processedShipments = processedShipments.filter(s => {
          const sup = (s.supplier || '').trim().toUpperCase();
          return !EXCLUDED_SUPPLIERS.some(exc => sup.includes(exc) || exc.includes(sup));
        });
        if (processedShipments.length === 0) throw new Error('No local suppliers found after filtering international suppliers');
      }

      const toPlain = (s) => {
        // For local imports: if notes looks like a date or Excel serial number, use it as expected delivery
        let vesselName = s.vesselName ?? '';
        let notes = s.notes ?? '';
        if (shipmentType === 'local' && !vesselName && notes) {
          const trimmed = String(notes).trim();
          // Excel serial date number (e.g. 46142 = 2026/03/25)
          const num = Number(trimmed);
          if (!isNaN(num) && num > 30000 && num < 60000) {
            const excelEpoch = new Date(1899, 11, 30);
            const d = new Date(excelEpoch.getTime() + num * 86400000);
            vesselName = d.toISOString().split('T')[0]; // YYYY-MM-DD
            notes = '';
          } else {
            // Match date patterns: YYYY/MM/DD, YYYY-MM-DD, DD/MM/YYYY
            const dateMatch = trimmed.match(/^\d{4}[/-]\d{2}[/-]\d{2}$/) || trimmed.match(/^\d{2}[/-]\d{2}[/-]\d{4}$/);
            if (dateMatch) {
              vesselName = trimmed;
              notes = '';
            }
          }
        }
        return {
          id: s.id,
          supplier: s.supplier,
          orderRef: s.orderRef,
          finalPod: s.finalPod,
          latestStatus: shipmentType === 'local' ? (s.latestStatus || 'in_transit_roadway') : s.latestStatus,
          weekNumber: Number(s.weekNumber) || 0,
          selectedWeekDate: s.selectedWeekDate ?? null,
          productName: s.productName,
          quantity: Number(s.quantity) || 0,
          palletQty: Number(s.palletQty) || 0,
          receivingWarehouse: s.receivingWarehouse,
          forwardingAgent: s.forwardingAgent ?? '',
          vesselName,
          incoterm: s.incoterm ?? '',
          notes,
          shipmentType,
        };
      };

      const payload = processedShipments.map(toPlain);

      const response = await authFetch(getApiUrl('/api/shipments/bulk-import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('useShipments: Failed bulk import:', response.status, errorText);
        throw new Error(`Failed bulk import: ${response.status}`);
      }

      const result = await response.json();

      // Auto-create suppliers from imported shipments
      const uniqueSuppliers = [...new Set(processedShipments.map(s => s.supplier).filter(Boolean))];
      for (const supplierName of uniqueSuppliers) {
        try {
          await handleAddSupplier({ name: supplierName });
        } catch (err) {
          showError('Failed to create supplier: ' + err.message);
        }
      }

      // Store detailed import result for summary modal
      setImportResult(result);

      // Also show a quick toast
      const parts = [];
      if (result.imported > 0) parts.push(`${result.imported} new shipments imported`);
      if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`);
      if (result.emptyRows > 0) parts.push(`${result.emptyRows} empty rows ignored`);
      if (parts.length === 0) parts.push('No new shipments to import');
      if (result.skipped > 0) {
        showError(parts.join(', '));
      } else {
        showSuccess(parts.join(', '));
      }
      await fetchShipments();

      // Ensure palletQty is preserved in UI after import (match by orderRef)
      const palletQtyByOrderRef = new Map(payload.map(s => [s.orderRef, s.palletQty]));
      setShipments(prev => prev.map(s => ({ ...s, palletQty: palletQtyByOrderRef.get(s.orderRef) ?? s.palletQty })));
    } catch (err) {
      console.error('useShipments: File upload error:', err);
      showError(`Failed to process file: ${err.message}`);
    } finally { stopLoading(); }
  }, [fetchShipments, startLoading, stopLoading, showSuccess, showError]);

  return {
    shipments,
    setShipments,
    loading,
    lastSyncTime,
    fetchShipments,
    handleCreateShipment,
    handleUpdateShipment,
    handleDeleteShipment,
    handleArchiveShipment,
    handleFileUpload,
    importResult,
    setImportResult,
    startLoading,
    stopLoading,
  };
}

export default useShipments;
