import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ShipmentStatus, isDelayedStatus, SHIPPING_EXCLUDED_STATUSES } from '../types/shipment';
import { getCurrentWeekNumber } from '../utils/dateUtils';
import { isAirfreight, getShippingProgress, getForwardingAgents, getAgentTrackingUrl } from '../utils/shipmentConstants';
import { generatePDF as generateShipmentPDF, generateExcel as generateShipmentExcel } from '../utils/shipmentExport';
import WeekCalendar from './WeekCalendar';
import BulkStatusUpdate from './BulkStatusUpdate';
import ShipmentTableToolbar from './ShipmentTableToolbar';
import ShipmentFormModal from './ShipmentFormModal';
import OrderDetailsModal from './OrderDetailsModal';
import ArchiveDialogs from './ArchiveDialogs';
import { SkeletonShipmentTable } from './SkeletonLoaders';
import { getApiUrl } from '../config/api';
import { authFetch } from '../utils/authFetch';
import { copyToClipboard } from '../utils/clipboard';
import { useNotification } from '../contexts/NotificationContext';

function ShipmentTable({ shipments, suppliers = [], onUpdateShipment, onDeleteShipment, onCreateShipment, loading, globalSearchTerm, onClearGlobalSearch }) {
  const { showSuccess, showError, confirm: confirmAction } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(['all']);
  const [sortConfig, setSortConfig] = useState({ key: 'weekNumber', direction: 'asc' });
  const currentWeek = getCurrentWeekNumber();
  const [weekFrom, setWeekFrom] = useState(currentWeek);
  const [weekTo, setWeekTo] = useState(currentWeek + 2);
  const [showAddShipmentDialog, setShowAddShipmentDialog] = useState(false);
  const [localTextValues, setLocalTextValues] = useState({});
  const [amendingShipment, setAmendingShipment] = useState(null);
  const [showAutoArchiveDialog, setShowAutoArchiveDialog] = useState(false);
  const [showManualArchiveDialog, setShowManualArchiveDialog] = useState(false);
  const [selectedShipments, setSelectedShipments] = useState([]);
  const [showBulkStatusUpdate, setShowBulkStatusUpdate] = useState(false);
  const [, setBulkUpdateLoading] = useState(false);
  const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);
  const [orderDetailsShipment, setOrderDetailsShipment] = useState(null);
  const [edits, setEdits] = useState({}); // Track unsaved changes per shipment

  // Mobile responsiveness
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Pick up search term from global search
  useEffect(() => {
    if (globalSearchTerm) {
      setSearchTerm(globalSearchTerm);
      if (onClearGlobalSearch) onClearGlobalSearch();
    }
  }, [globalSearchTerm, onClearGlobalSearch]);

  // Refs for debounced input timeouts
  const timeoutRefs = useRef({});

  const filteredAndSortedShipments = useMemo(() => {
    let filtered = shipments.filter(shipment => {
      const matchesSearch = searchTerm === '' ||
        shipment.orderRef?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shipment.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shipment.finalPod?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shipment.productName?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter.includes('all') ||
        statusFilter.includes(shipment.latestStatus) ||
        (statusFilter.includes('arrived') && (shipment.latestStatus === ShipmentStatus.ARRIVED_PTA || shipment.latestStatus === ShipmentStatus.ARRIVED_KLM || shipment.latestStatus === ShipmentStatus.ARRIVED_OFFSITE));

      const shipWeek = shipment.weekNumber ? parseInt(shipment.weekNumber) : null;
      const matchesWeek = shipWeek === null || (shipWeek >= weekFrom && shipWeek <= weekTo);

      return matchesSearch && matchesStatus && matchesWeek;
    });

    // Sort with planned shipments at the bottom
    filtered.sort((a, b) => {
      // First priority: planned statuses go to bottom
      const aIsPlanned = a.latestStatus?.startsWith('planned_');
      const bIsPlanned = b.latestStatus?.startsWith('planned_');

      if (aIsPlanned && !bIsPlanned) return 1;  // a goes after b
      if (!aIsPlanned && bIsPlanned) return -1; // a goes before b

      // Second priority: apply user-selected sort if any
      if (sortConfig.key) {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        // Handle numeric fields
        const numericFields = ['weekNumber', 'quantity', 'cbm', 'palletQty'];
        if (numericFields.includes(sortConfig.key)) {
          const aNum = Number(aValue) || 0;
          const bNum = Number(bValue) || 0;
          return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
        }

        if (aValue instanceof Date && bValue instanceof Date) {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }

        const comparison = aValue.toString().localeCompare(bValue.toString());
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }

      return 0;
    });

    return filtered;
  }, [shipments, searchTerm, statusFilter, sortConfig, weekFrom, weekTo]);

  // Extract unique suppliers for dropdown. Use both the supplier master list
  // and current shipments so new shipments can be created before a supplier
  // has an active visible shipment.
  const uniqueSuppliers = useMemo(() => {
    const supplierNames = [
      ...suppliers.map(supplier => supplier?.name),
      ...shipments.map(shipment => shipment.supplier),
    ]
      .filter(supplier => supplier && supplier.trim() !== '')
      .filter((supplier, index, self) => self.indexOf(supplier) === index)
      .sort();
    return supplierNames;
  }, [shipments, suppliers]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleStatusUpdate = async (shipmentId, newStatus) => {
    // Always update the clicked row first
    await onUpdateShipment(shipmentId, { latestStatus: newStatus });

    const target = shipments.find(s => s.id === shipmentId);
    const orderRef = (target?.orderRef || '').trim();
    if (!orderRef) return;

    // Sibling filter:
    //   - same order/ref APO
    //   - not the row we just updated
    //   - currently on a different status
    //   - still in a "shipping" status (exclude arrived / stored / archived /
    //     post-arrival — those have already progressed physically and should
    //     NOT be pulled back to a transit status by a sibling change)
    const siblings = shipments.filter(s =>
      s.id !== shipmentId &&
      (s.orderRef || '').trim() === orderRef &&
      s.latestStatus !== newStatus &&
      !SHIPPING_EXCLUDED_STATUSES.includes(s.latestStatus)
    );
    if (siblings.length === 0) return;

    // Render the status value in a human-readable way for the prompt
    const statusLabel = newStatus
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const confirmed = await confirmAction({
      title: `Apply status to all shipping lines on ${orderRef}?`,
      message: `This order has ${siblings.length} other line${siblings.length > 1 ? 's' : ''} still in the Shipping Schedule on a different status. Would you like to set ${siblings.length > 1 ? 'them all' : 'it'} to "${statusLabel}" as well?\n\n(Lines that have already arrived, been received, or stored are not affected.)`,
      confirmText: `Apply to all ${siblings.length + 1} lines`,
      cancelText: 'Just this line',
      type: 'warning',
    });
    if (!confirmed) return;

    try {
      await Promise.all(siblings.map(s => onUpdateShipment(s.id, { latestStatus: newStatus })));
      showSuccess(`Status "${statusLabel}" applied to ${siblings.length + 1} lines on ${orderRef}`);
    } catch (err) {
      showError(`Updated this line, but failed to update some siblings: ${err.message || 'unknown error'}`);
    }
  };

  const handleWeekUpdate = async (shipmentId, newWeekNumber, selectedDate) => {
    const updates = { weekNumber: newWeekNumber.toString() };
    if (selectedDate) {
      updates.selectedWeekDate = selectedDate.toISOString();
    }

    // Always update the row the user clicked
    await onUpdateShipment(shipmentId, updates);

    // Look for other line items on the same order/ref APO that haven't already
    // been moved to this week. If any exist, offer to apply the same week to them.
    const target = shipments.find(s => s.id === shipmentId);
    const orderRef = (target?.orderRef || '').trim();
    if (!orderRef) return;

    const siblings = shipments.filter(s =>
      s.id !== shipmentId &&
      (s.orderRef || '').trim() === orderRef &&
      (s.weekNumber ?? '').toString() !== newWeekNumber.toString()
    );
    if (siblings.length === 0) return;

    const confirmed = await confirmAction({
      title: `Apply Week ${newWeekNumber} to all lines on ${orderRef}?`,
      message: `This order has ${siblings.length} other line${siblings.length > 1 ? 's' : ''} on different week${siblings.length > 1 ? 's' : ''}. Would you like to update ${siblings.length > 1 ? 'them all' : 'it'} to Week ${newWeekNumber} as well?`,
      confirmText: `Apply to all ${siblings.length + 1} lines`,
      cancelText: 'Just this line',
      type: 'info',
    });
    if (!confirmed) return;

    try {
      await Promise.all(siblings.map(s => onUpdateShipment(s.id, updates)));
      showSuccess(`Week ${newWeekNumber} applied to ${siblings.length + 1} lines on ${orderRef}`);
    } catch (err) {
      showError(`Updated this line, but failed to update some siblings: ${err.message || 'unknown error'}`);
    }
  };

  // Track field changes without auto-saving
  const handleTextInputChange = useCallback((shipmentId, field, value) => {
    const key = `${shipmentId}-${field}`;

    // Update local state immediately for UI responsiveness
    setLocalTextValues(prev => ({ ...prev, [key]: value }));

    // Track as unsaved edit
    setEdits(prev => ({
      ...prev,
      [shipmentId]: {
        ...(prev[shipmentId] || {}),
        [field]: value
      }
    }));

    // Clear any existing timeout
    if (timeoutRefs.current[key]) {
      clearTimeout(timeoutRefs.current[key]);
      delete timeoutRefs.current[key];
    }
  }, []);

  // Handle dropdown changes (incoterm, forwardingAgent)
  const handleDropdownChange = useCallback((shipmentId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [shipmentId]: {
        ...(prev[shipmentId] || {}),
        [field]: value
      }
    }));
  }, []);

  // Save all changes for a specific shipment
  const saveShipment = useCallback(async (shipmentId) => {
    const changes = edits[shipmentId];
    if (!changes || Object.keys(changes).length === 0) return;

    await onUpdateShipment(shipmentId, changes);

    // Clear edits and local text values for this shipment
    setEdits(prev => {
      const copy = { ...prev };
      delete copy[shipmentId];
      return copy;
    });

    // Clear local text values
    setLocalTextValues(prev => {
      const copy = { ...prev };
      Object.keys(changes).forEach(field => {
        delete copy[`${shipmentId}-${field}`];
      });
      return copy;
    });

    // APO-level fields that make sense to propagate across all lines on the
    // same order/ref. Per-line fields (quantity, cbm, palletQty, productName)
    // are deliberately NOT in this list.
    const target = shipments.find(s => s.id === shipmentId);
    const orderRef = (target?.orderRef || '').trim();
    if (!orderRef) return;

    const vesselLabel = isAirfreight(target?.latestStatus, target?.forwardingAgent, target?.vesselName) ? 'AWB' : 'Vessel';
    const apoFieldDefs = [
      { key: 'vesselName', label: vesselLabel, normalize: (v) => (v || '').trim() },
      { key: 'incoterm', label: 'Incoterm', normalize: (v) => (v || '').trim() },
      { key: 'forwardingAgent', label: 'Agent', normalize: (v) => (v || '').trim() },
    ];

    const changedApoFields = apoFieldDefs.filter(def => changes[def.key] !== undefined);
    if (changedApoFields.length === 0) return;

    // Normalized new values, keyed by field name
    const newValues = Object.fromEntries(
      changedApoFields.map(def => [def.key, def.normalize(changes[def.key])])
    );

    // A sibling is eligible if it shares the orderRef AND differs on at least
    // one of the APO fields we just saved.
    const siblings = shipments.filter(s => {
      if (s.id === shipmentId) return false;
      if ((s.orderRef || '').trim() !== orderRef) return false;
      return changedApoFields.some(def => def.normalize(s[def.key]) !== newValues[def.key]);
    });
    if (siblings.length === 0) return;

    // Human-readable summary of what will change — "Vessel: 'MSC Example', Incoterm: 'FOB'"
    const summary = changedApoFields
      .map(def => `${def.label}: "${newValues[def.key] || '(cleared)'}"`)
      .join(', ');

    const fieldsLabel = changedApoFields.length === 1
      ? changedApoFields[0].label
      : 'these changes';

    const confirmed = await confirmAction({
      title: `Apply ${fieldsLabel} to all lines on ${orderRef}?`,
      message: `This order has ${siblings.length} other line${siblings.length > 1 ? 's' : ''}. Would you like to apply ${summary} to ${siblings.length > 1 ? 'all of them' : 'it'} too?`,
      confirmText: `Apply to all ${siblings.length + 1} lines`,
      cancelText: 'Just this line',
      type: 'info',
    });
    if (!confirmed) return;

    // Build a single update payload containing only the APO-level changes.
    const apoUpdates = Object.fromEntries(
      changedApoFields.map(def => [def.key, newValues[def.key]])
    );

    try {
      await Promise.all(siblings.map(s => onUpdateShipment(s.id, apoUpdates)));
      showSuccess(`${fieldsLabel} applied to ${siblings.length + 1} lines on ${orderRef}`);
    } catch (err) {
      showError(`Updated this line, but failed to update some siblings: ${err.message || 'unknown error'}`);
    }
  }, [edits, onUpdateShipment, shipments, confirmAction, showSuccess, showError]);

  // Save all pending changes
  const saveAllChanges = useCallback(() => {
    Object.keys(edits).forEach(shipmentId => {
      saveShipment(shipmentId);
    });
  }, [edits, saveShipment]);

  // Count unsaved changes
  const unsavedCount = Object.keys(edits).length;

  // Cleanup effect to clear timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all pending timeouts when component unmounts
      Object.values(timeoutRefs.current).forEach(timeoutId => {
        if (timeoutId) clearTimeout(timeoutId);
      });
      timeoutRefs.current = {};
    };
  }, []);


  const isDelayed = (shipment) => {
    return isDelayedStatus(shipment.latestStatus);
  };

  const generatePDF = () => {
    generateShipmentPDF(filteredAndSortedShipments, { searchTerm, statusFilter });
  };

  const generateExcel = () => {
    generateShipmentExcel(filteredAndSortedShipments);
  };

  const handleAddShipment = async (shipmentData) => {
    try {
      await onCreateShipment(shipmentData);
      setShowAddShipmentDialog(false);
    } catch (error) {
      console.error('Error adding shipment:', error);
      showError('Failed to add shipment. Please try again.');
      throw error; // Re-throw so ShipmentFormModal knows submit failed
    }
  };

  const handleAmendShipment = (shipment) => {
    setAmendingShipment({ ...shipment });
  };

  const handleSaveAmendment = async (shipmentData) => {
    try {
      await onUpdateShipment(amendingShipment.id, shipmentData);
      setAmendingShipment(null);
    } catch (error) {
      console.error('Error amending shipment:', error);
      showError('Failed to amend shipment. Please try again.');
      throw error;
    }
  };


  const handleShipmentSelect = (shipmentId, isSelected) => {
    if (isSelected) {
      setSelectedShipments(prev => [...prev, shipmentId]);
    } else {
      setSelectedShipments(prev => prev.filter(id => id !== shipmentId));
    }
  };

  const handleSelectAll = () => {
    setSelectedShipments(filteredAndSortedShipments.map(s => s.id));
  };

  const handleClearSelection = () => {
    setSelectedShipments([]);
  };

  const handleBulkArchive = async () => {
    if (selectedShipments.length === 0) return;
    if (!confirm(`Archive ${selectedShipments.length} shipments?`)) return;
    try {
      const res = await authFetch(getApiUrl('/api/shipments/bulk/archive'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedShipments })
      });
      if (res.ok) {
        const data = await res.json();
        showSuccess(`Archived ${data.archived} shipment(s)${data.failed > 0 ? `, ${data.failed} failed` : ''}`);
        setSelectedShipments([]);
        if (typeof onDeleteShipment === 'function') {
          // Trigger a full refresh by calling onDeleteShipment which will cause the parent to refetch
          window.location.reload();
        }
      } else {
        showError('Failed to archive shipments');
      }
    } catch (err) {
      showError('Error archiving shipments');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedShipments.length === 0) return;
    if (!confirm(`Delete ${selectedShipments.length} shipments? This cannot be undone.`)) return;
    try {
      const res = await authFetch(getApiUrl('/api/shipments/bulk/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedShipments })
      });
      if (res.ok) {
        const data = await res.json();
        showSuccess(`Deleted ${data.deleted} shipment(s)${data.failed > 0 ? `, ${data.failed} failed` : ''}`);
        setSelectedShipments([]);
        if (typeof onDeleteShipment === 'function') {
          window.location.reload();
        }
      } else {
        showError('Failed to delete shipments');
      }
    } catch (err) {
      showError('Error deleting shipments');
    }
  };


  const handleBulkStatusUpdate = async (shipmentIds, newStatus) => {
    try {
      setBulkUpdateLoading(true);

      // Update all selected shipments
      const updatePromises = shipmentIds.map(id => {
        const shipment = shipments.find(s => s.id === id);
        if (!shipment) return Promise.resolve();

        return onUpdateShipment({
          ...shipment,
          latestStatus: newStatus
        });
      });

      await Promise.all(updatePromises);

      setShowBulkStatusUpdate(false);
      showSuccess(`Successfully updated ${shipmentIds.length} shipment(s) to ${newStatus.replace(/_/g, ' ').toUpperCase()}`);
    } catch (error) {
      console.error('Error updating shipments:', error);
      showError('Error updating shipments. Please try again.');
    } finally {
      setBulkUpdateLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="shipments-table card">
        <div className="brand-strip" />
        <div style={{ padding: '1rem 1.25rem 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy-900)' }}>Shipping Schedule</h2>
        </div>
        <SkeletonShipmentTable rows={12} />
      </div>
    );
  }

  return (
   <div className="shipments-table card">
      <div className="brand-strip" />

      <ShipmentTableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        weekFrom={weekFrom}
        weekTo={weekTo}
        onWeekFromChange={setWeekFrom}
        onWeekToChange={setWeekTo}
        totalCount={shipments.length}
        filteredCount={filteredAndSortedShipments.length}
        unsavedCount={unsavedCount}
        onSaveAll={saveAllChanges}
        onAddShipment={() => setShowAddShipmentDialog(true)}
        onGeneratePDF={generatePDF}
        onGenerateExcel={generateExcel}
        onShowAutoArchive={() => setShowAutoArchiveDialog(true)}
        onShowManualArchive={() => setShowManualArchiveDialog(true)}
        onShowBulkUpdate={() => setShowBulkStatusUpdate(true)}
        selectedCount={selectedShipments.length}
        onBulkArchive={handleBulkArchive}
        onBulkDelete={handleBulkDelete}
        onClearSelection={handleClearSelection}
        shipments={shipments}
        currentFilters={{ search: searchTerm, status: statusFilter }}
        currentWeek={currentWeek}
      />

      {/* Mobile card layout */}
      {isMobile && (
        <div className="mobile-card-list">
          {filteredAndSortedShipments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)' }}>
              No shipments found
            </div>
          ) : (
            filteredAndSortedShipments.map(shipment => {
              const progress = getShippingProgress(shipment.latestStatus);
              return (
                <div key={shipment.id} className="mobile-shipment-card">
                  <div className="card-header">
                    <span className="order-ref">{shipment.orderRef}</span>
                    <select
                      value={shipment.latestStatus}
                      onChange={(e) => handleStatusUpdate(shipment.id, e.target.value)}
                      className={`select status-badge status-${shipment.latestStatus}`}
                      style={{
                        borderRadius: 20, padding: '3px 10px', fontSize: 10,
                        fontWeight: 600, textTransform: 'uppercase', border: 'none', minWidth: 80,
                      }}
                    >
                      <option value={ShipmentStatus.PLANNED_AIRFREIGHT}>Planned Air</option>
                      <option value={ShipmentStatus.PLANNED_SEAFREIGHT}>Planned Sea</option>
                      <option value={ShipmentStatus.IN_TRANSIT_AIRFREIGHT}>In Transit Air</option>
                      <option value={ShipmentStatus.AIR_CUSTOMS_CLEARANCE}>Air Customs</option>
                      <option value={ShipmentStatus.IN_TRANSIT_ROADWAY}>In Transit Road</option>
                      <option value={ShipmentStatus.IN_TRANSIT_SEAWAY}>In Transit Sea</option>
                      <option value={ShipmentStatus.IN_TRANSIT_LAST_MILE}>In Transit Last Mile</option>
                      <option value={ShipmentStatus.MOORED}>Moored</option>
                      <option value={ShipmentStatus.BERTH_WORKING}>Berth Working</option>
                      <option value={ShipmentStatus.BERTH_COMPLETE}>Berth Complete</option>
                      <option value={ShipmentStatus.GATED_IN_PORT}>Gated In Port</option>
                      <option value={ShipmentStatus.ARRIVED_PTA}>Arrived PTA</option>
                      <option value={ShipmentStatus.ARRIVED_KLM}>Arrived KLM</option>
                      <option value={ShipmentStatus.ARRIVED_OFFSITE}>Arrived OffSite</option>
                      <optgroup label="Delayed">
                        <option value={ShipmentStatus.DELAYED_PORT}>Delayed - Port</option>
                        <option value={ShipmentStatus.DELAYED_CUSTOMS}>Delayed - Customs</option>
                        <option value={ShipmentStatus.DELAYED_DOCUMENTS}>Delayed - Documents</option>
                        <option value={ShipmentStatus.DELAYED_SUPPLIER}>Delayed - Supplier</option>
                      </optgroup>
                      <option value={ShipmentStatus.CANCELLED}>Cancelled</option>
                    </select>
                  </div>
                  <dl className="card-details">
                    <dt>Supplier</dt><dd>{shipment.supplier || '-'}</dd>
                    <dt>Destination</dt><dd>{shipment.finalPod || '-'}</dd>
                    <dt>Pallets</dt><dd>{shipment.palletQty ? Math.round(shipment.palletQty) : '-'}</dd>
                    <dt>Week</dt><dd>{shipment.weekNumber || '-'}</dd>
                    <dt>Vessel / AWB</dt><dd>{shipment.vesselName || '-'}</dd>
                    <dt>Agent</dt><dd>{shipment.forwardingAgent || '-'}</dd>
                  </dl>
                  {/* Progress bar */}
                  {!isDelayedStatus(shipment.latestStatus) && shipment.latestStatus !== 'cancelled' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: '2px', flex: 1 }}>
                        {[1,2,3,4,5].map(step => (
                          <div key={step} style={{
                            height: '5px', flex: 1, borderRadius: '3px',
                            backgroundColor: step <= progress.current ? 'var(--accent)' : 'var(--border)',
                          }} />
                        ))}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-500)' }}>
                        {progress.current}/{progress.total}
                      </span>
                    </div>
                  )}
                  <div className="card-actions">
                    <button
                      className="btn btn-ghost"
                      onClick={() => { setOrderDetailsShipment(shipment); setShowOrderDetailsModal(true); }}
                      style={{ fontSize: 12, padding: '6px 12px' }}
                    >
                      Details
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleAmendShipment(shipment)}
                      style={{ fontSize: 12, padding: '6px 12px' }}
                    >
                      Amend
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Desktop table layout */}
      {!isMobile && (
      <div style={{
        overflow: 'auto',
        maxHeight: 'calc(100vh - 260px)',
        position: 'relative',
      }}>
        <table className="table" style={{ minWidth: '1200px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedShipments.length > 0 && selectedShipments.length === filteredAndSortedShipments.length}
                  onChange={(e) => e.target.checked ? handleSelectAll() : handleClearSelection()}
                  title="Select all shipments"
                />
              </th>
              {[
                { key: 'supplier', label: 'Supplier' },
                { key: 'orderRef', label: 'Order / Ref' },
                { key: 'productName', label: 'Product' },
                { key: 'finalPod', label: 'Final POD' },
                { key: 'latestStatus', label: 'Status' },
                { key: null, label: 'Progress', style: { minWidth: 90 } },
                { key: 'weekNumber', label: 'Week' },
                { key: 'palletQty', label: 'Pallets' },
                { key: 'vesselName', label: 'Vessel / AWB' },
                { key: 'incoterm', label: 'Incoterm' },
                { key: 'forwardingAgent', label: 'Agent' },
                { key: null, label: '' },
              ].map((col, i) => (
                <th key={col.key || col.label || i}
                  onClick={col.key ? () => handleSort(col.key) : undefined}
                  style={{ cursor: col.key ? 'pointer' : 'default', userSelect: 'none', ...col.style }}
                >
                  {col.label}
                  {col.key && sortConfig.key === col.key && (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedShipments.length === 0 ? (
              <tr>
                <td colSpan="13" style={{ textAlign: 'center', padding: '2rem' }}>
                  No shipments found
                </td>
              </tr>
            ) : (
              filteredAndSortedShipments.map(shipment => (
                <tr key={shipment.id} style={{
                  backgroundColor: isDelayed(shipment) ? '#fef2f2' : undefined,
                }}>
                  <td style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedShipments.includes(shipment.id)}
                      onChange={(e) => handleShipmentSelect(shipment.id, e.target.checked)}
                      title="Select shipment"
                    />
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-900)' }}>{shipment.supplier}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span
                        onClick={() => {
                          setOrderDetailsShipment(shipment);
                          setShowOrderDetailsModal(true);
                        }}
                        style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                        title="Click to view order details"
                      >
                        {shipment.orderRef}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(shipment.orderRef, showSuccess); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', fontSize: '0.65rem', color: 'var(--text-500)', opacity: 0.4 }}
                        title="Copy order ref"
                        aria-label="Copy order reference"
                        onMouseEnter={(e) => e.target.style.opacity = 1}
                        onMouseLeave={(e) => e.target.style.opacity = 0.4}
                      >
                        📋
                      </button>
                      {isDelayed(shipment) && <span style={{ color: 'var(--danger)', marginLeft: 2, fontSize: 12 }}>⚠️</span>}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                      title={shipment.productName || ''}>
                      {shipment.productName || '—'}
                    </span>
                  </td>
                  <td><span style={{ fontSize: 13 }}>{shipment.finalPod}</span></td>
                  <td>
                    <select
                      value={shipment.latestStatus}
                      onChange={(e) => handleStatusUpdate(shipment.id, e.target.value)}
                      className={`select status-badge status-${shipment.latestStatus}`}
                      style={{
                        borderRadius: 20,
                        padding: '3px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        minWidth: 90,
                        border: 'none',
                      }}
                    >
                      <option value={ShipmentStatus.PLANNED_AIRFREIGHT}>Planned Airfreight</option>
                      <option value={ShipmentStatus.PLANNED_SEAFREIGHT}>Planned Seafreight</option>
                      <option value={ShipmentStatus.IN_TRANSIT_AIRFREIGHT}>In Transit Airfreight</option>
                      <option value={ShipmentStatus.AIR_CUSTOMS_CLEARANCE}>Air Customs Clearance Event</option>
                      <option value={ShipmentStatus.IN_TRANSIT_ROADWAY}>In Transit Roadway</option>
                      <option value={ShipmentStatus.IN_TRANSIT_SEAWAY}>In Transit Seaway</option>
                      <option value={ShipmentStatus.IN_TRANSIT_LAST_MILE}>In Transit Last Mile</option>
                      <option value={ShipmentStatus.MOORED}>Moored</option>
                      <option value={ShipmentStatus.BERTH_WORKING}>Berth Working</option>
                      <option value={ShipmentStatus.BERTH_COMPLETE}>Berth Complete</option>
                      <option value={ShipmentStatus.GATED_IN_PORT}>Gated In Port</option>
                      <option value={ShipmentStatus.ARRIVED_PTA}>Arrived PTA</option>
                      <option value={ShipmentStatus.ARRIVED_KLM}>Arrived KLM</option>
                      <option value={ShipmentStatus.ARRIVED_OFFSITE}>Arrived OffSite</option>
                      <optgroup label="Delayed">
                        <option value={ShipmentStatus.DELAYED_PORT}>Delayed - Port</option>
                        <option value={ShipmentStatus.DELAYED_CUSTOMS}>Delayed - Customs</option>
                        <option value={ShipmentStatus.DELAYED_DOCUMENTS}>Delayed - Documents</option>
                        <option value={ShipmentStatus.DELAYED_SUPPLIER}>Delayed - Supplier</option>
                      </optgroup>
                      <option value={ShipmentStatus.CANCELLED}>Cancelled</option>
                    </select>
                  </td>
                  <td>
                    {!isDelayedStatus(shipment.latestStatus) && shipment.latestStatus !== 'cancelled' ? (() => {
                      const progress = getShippingProgress(shipment.latestStatus);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ display: 'flex', gap: '2px', flex: 1, minWidth: '60px' }}>
                            {[1,2,3,4,5].map(step => (
                              <div key={step} style={{
                                height: '6px', flex: 1, borderRadius: '3px',
                                backgroundColor: step <= progress.current ? 'var(--accent)' : 'var(--border)',
                                transition: 'background-color 0.2s ease'
                              }} />
                            ))}
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-500)', whiteSpace: 'nowrap' }}>
                            {progress.current}/{progress.total}
                          </span>
                        </div>
                      );
                    })() : (
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 600,
                        color: isDelayedStatus(shipment.latestStatus) ? 'var(--danger)' : 'var(--text-500)'
                      }}>
                        {isDelayedStatus(shipment.latestStatus) ? 'DELAYED' : 'CANCELLED'}
                      </span>
                    )}
                  </td>
                  <td>
                    <WeekCalendar
                      currentWeek={shipment.weekNumber ? parseInt(shipment.weekNumber) : null}
                      onWeekSelect={(weekNumber, selectedDate) => handleWeekUpdate(shipment.id, weekNumber, selectedDate)}
                      selectedWeekDate={shipment.selectedWeekDate}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={(localTextValues[`${shipment.id}-palletQty`] ?? (shipment.palletQty ? (Math.round(shipment.palletQty) || 1) : '')) || ''}
                      onChange={(e) => handleTextInputChange(shipment.id, 'palletQty', e.target.value)}
                      placeholder="Qty"
                      className="input"
                      style={{
                        width: '60px', minWidth: '50px', maxWidth: '70px',
                        border: edits[shipment.id]?.palletQty !== undefined ? '2px solid var(--warning)' : undefined,
                        backgroundColor: edits[shipment.id]?.palletQty !== undefined ? '#fff3e0' : undefined,
                      }}
                      min="0"
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="text"
                        value={(localTextValues[`${shipment.id}-vesselName`] ?? shipment.vesselName) || ''}
                        onChange={(e) => handleTextInputChange(shipment.id, 'vesselName', e.target.value)}
                        placeholder={isAirfreight(shipment.latestStatus, shipment.forwardingAgent, shipment.vesselName) ? 'AWB Number' : 'Vessel Name'}
                        className="input"
                        style={{
                          minWidth: '120px',
                          flex: 1,
                          border: edits[shipment.id]?.vesselName !== undefined ? '2px solid var(--warning)' : undefined,
                          backgroundColor: edits[shipment.id]?.vesselName !== undefined ? '#fff3e0' : undefined,
                        }}
                      />
                      {(shipment.vesselName || getAgentTrackingUrl(shipment.forwardingAgent)) && (
                        <a
                          href={getAgentTrackingUrl(shipment.forwardingAgent) || (isAirfreight(shipment.latestStatus, shipment.forwardingAgent, shipment.vesselName)
                            ? `https://www.track-trace.com/aircargo?awb=${encodeURIComponent(shipment.vesselName.replace(/\D/g, ''))}`
                            : `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(shipment.vesselName)}`)
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          title={getAgentTrackingUrl(shipment.forwardingAgent) ? `Track on ${shipment.forwardingAgent}` : (isAirfreight(shipment.latestStatus, shipment.forwardingAgent, shipment.vesselName) ? 'Track AWB' : 'Track vessel on VesselFinder')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.25rem',
                            color: '#1976d2',
                            textDecoration: 'none',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            transition: 'color 0.2s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#1565c0'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#1976d2'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                  <td>
                    <select
                      value={(edits[shipment.id]?.incoterm ?? shipment.incoterm) || ''}
                      onChange={(e) => handleDropdownChange(shipment.id, 'incoterm', e.target.value)}
                      className="select"
                      style={{
                        minWidth: '80px',
                        border: edits[shipment.id]?.incoterm !== undefined ? '2px solid var(--warning)' : undefined,
                        backgroundColor: edits[shipment.id]?.incoterm !== undefined ? '#fff3e0' : undefined,
                      }}
                    >
                      <option value="">Select</option>
                      <option value="EXW">EXW</option>
                      <option value="FCA">FCA</option>
                      <option value="CPT">CPT</option>
                      <option value="CIP">CIP</option>
                      <option value="DAP">DAP</option>
                      <option value="DPU">DPU</option>
                      <option value="DDP">DDP</option>
                      <option value="FAS">FAS</option>
                      <option value="FOB">FOB</option>
                      <option value="CFR">CFR</option>
                      <option value="CIF">CIF</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={(edits[shipment.id]?.forwardingAgent ?? shipment.forwardingAgent) || ''}
                      onChange={(e) => handleDropdownChange(shipment.id, 'forwardingAgent', e.target.value)}
                      className="select"
                      style={{
                        minWidth: '120px',
                        border: edits[shipment.id]?.forwardingAgent !== undefined ? '2px solid var(--warning)' : undefined,
                        backgroundColor: edits[shipment.id]?.forwardingAgent !== undefined ? '#fff3e0' : undefined,
                      }}
                    >
                      <option value="">Select Agent</option>
                      {getForwardingAgents(edits[shipment.id]?.latestStatus ?? shipment.latestStatus, edits[shipment.id]?.forwardingAgent ?? shipment.forwardingAgent, edits[shipment.id]?.vesselName ?? shipment.vesselName).map(agent => (
                        <option key={agent.value} value={agent.value}>{agent.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="actions" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {edits[shipment.id] && Object.keys(edits[shipment.id]).length > 0 && (
                        <button
                          onClick={() => saveShipment(shipment.id)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'var(--success)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                          }}
                          title="Save changes for this shipment"
                        >
                          💾 Save
                        </button>
                      )}
                      <button
                        onClick={() => handleAmendShipment(shipment)}
                        className="btn btn-primary btn-small"
                        title="Amend shipment details"
                      >
                        Amend
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Add Shipment Dialog */}
      <ShipmentFormModal
        isOpen={showAddShipmentDialog}
        onClose={() => setShowAddShipmentDialog(false)}
        onSubmit={handleAddShipment}
        initialData={null}
        uniqueSuppliers={uniqueSuppliers}
      />

      {/* Amend Shipment Dialog */}
      <ShipmentFormModal
        isOpen={!!amendingShipment}
        onClose={() => setAmendingShipment(null)}
        onSubmit={handleSaveAmendment}
        onDelete={onDeleteShipment}
        initialData={amendingShipment}
        uniqueSuppliers={uniqueSuppliers}
      />

      {/* Archive Dialogs */}
      <ArchiveDialogs
        showAutoArchive={showAutoArchiveDialog}
        onCloseAutoArchive={() => setShowAutoArchiveDialog(false)}
        showManualArchive={showManualArchiveDialog}
        onCloseManualArchive={() => setShowManualArchiveDialog(false)}
        selectedShipments={selectedShipments}
        shipments={shipments}
        onArchiveComplete={() => {
          setSelectedShipments([]);
          window.location.reload();
        }}
      />

      {/* Bulk Status Update Modal */}
      {showBulkStatusUpdate && (
        <BulkStatusUpdate
          shipments={filteredAndSortedShipments}
          onBulkUpdate={handleBulkStatusUpdate}
          onClose={() => setShowBulkStatusUpdate(false)}
        />
      )}

      {/* Order Details Modal */}
      <OrderDetailsModal
        isOpen={showOrderDetailsModal}
        shipment={orderDetailsShipment}
        onClose={() => {
          setShowOrderDetailsModal(false);
          setOrderDetailsShipment(null);
        }}
      />
    </div>
  );
}

export default ShipmentTable;
