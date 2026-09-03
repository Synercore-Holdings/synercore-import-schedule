import React from 'react';
import { ShipmentStatus } from '../types/shipment';
import FilterPresetManager from './FilterPresetManager';
import filterPreferencesManager from '../utils/filterPreferences';

/**
 * ShipmentTableToolbar - Presentational toolbar/filter controls for ShipmentTable
 *
 * Purely presentational with callbacks. All state lives in the parent ShipmentTable.
 */
function ShipmentTableToolbar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  weekFrom,
  weekTo,
  onWeekFromChange,
  onWeekToChange,
  totalCount,
  filteredCount,
  unsavedCount,
  onSaveAll,
  onAddShipment,
  onGeneratePDF,
  onGenerateExcel,
  onShowAutoArchive,
  onShowManualArchive,
  onShowBulkUpdate,
  selectedCount,
  onBulkArchive,
  onBulkDelete,
  onClearSelection,
  shipments,
  currentFilters,
  onApplyPreset,
  currentWeek,
}) {
  const arrivedCount = shipments.filter(
    s => s.latestStatus === ShipmentStatus.ARRIVED_PTA ||
         s.latestStatus === ShipmentStatus.ARRIVED_KLM ||
         s.latestStatus === ShipmentStatus.ARRIVED_OFFSITE
  ).length;

  return (
    <>
      {/* ── Row 1: Title + primary actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy-900)' }}>Shipping Schedule</h2>
          <span style={{ fontSize: 12, color: 'var(--text-500)', fontWeight: 500 }}>
            {filteredCount} shipment{filteredCount !== 1 ? 's' : ''}
          </span>
          {unsavedCount > 0 && (
            <button onClick={onSaveAll} className="btn" style={{
              background: 'var(--warning)', color: '#fff', fontSize: 12, padding: '5px 12px',
              border: 'none', fontWeight: 700,
            }}>
              Save {unsavedCount} change{unsavedCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-primary" onClick={onAddShipment} style={{ fontSize: 13 }}>
            + Add Shipment
          </button>
          <button className="btn btn-ghost" onClick={onGeneratePDF} disabled={filteredCount === 0} style={{ fontSize: 13 }}>
            PDF
          </button>
          <button className="btn btn-ghost" onClick={onGenerateExcel} disabled={filteredCount === 0} style={{ fontSize: 13 }}>
            Excel
          </button>
        </div>
      </div>

      {/* ── Row 2: Filters ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1.25rem',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search orders, suppliers, products, BOL, container..."
          aria-label="Search shipments"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input"
          style={{ width: 220, fontSize: 13 }}
        />

        {/* Status filter dropdown */}
        <select
          value={statusFilter.includes('all') ? 'all' : statusFilter[0] || 'all'}
          onChange={(e) => {
            const val = e.target.value;
            onStatusFilterChange(val === 'all' ? ['all'] : [val]);
          }}
          className="select"
          style={{ fontSize: 13, minWidth: 160 }}
        >
          <option value="all">All Statuses</option>
          <option value={ShipmentStatus.PLANNED_AIRFREIGHT}>Planned Airfreight</option>
          <option value={ShipmentStatus.PLANNED_SEAFREIGHT}>Planned Seafreight</option>
          <option value={ShipmentStatus.IN_TRANSIT_AIRFREIGHT}>In Transit Airfreight</option>
          <option value={ShipmentStatus.AIR_CUSTOMS_CLEARANCE}>Air Customs Clearance</option>
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
          <option value="arrived">Arrived (All)</option>
        </select>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

        {/* Week range */}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Wk</span>
        <input type="number" value={weekFrom} onChange={(e) => onWeekFromChange(parseInt(e.target.value) || 1)}
          className="input" style={{ width: 56, textAlign: 'center', fontSize: 13 }} min="1" max="53" />
        <span style={{ color: 'var(--text-400)', fontSize: 13 }}>–</span>
        <input type="number" value={weekTo} onChange={(e) => onWeekToChange(parseInt(e.target.value) || 53)}
          className="input" style={{ width: 56, textAlign: 'center', fontSize: 13 }} min="1" max="53" />
        <button className="btn btn-ghost" onClick={() => { onWeekFromChange(currentWeek); onWeekToChange(currentWeek + 2); }}
          style={{ fontSize: 12, padding: '4px 8px' }}>Reset</button>
        <button className="btn btn-ghost" onClick={() => { onWeekFromChange(1); onWeekToChange(53); }}
          style={{ fontSize: 12, padding: '4px 8px' }}>All</button>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

        {/* Quick status pills */}
        <button className={statusFilter.includes('all') ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => onStatusFilterChange(['all'])} style={{ fontSize: 12, padding: '4px 10px' }}>
          All ({totalCount})
        </button>
        <button
          className={(statusFilter.includes(ShipmentStatus.ARRIVED_PTA) || statusFilter.includes(ShipmentStatus.ARRIVED_KLM) || statusFilter.includes(ShipmentStatus.ARRIVED_OFFSITE) || statusFilter.includes('arrived')) ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => {
            if (statusFilter.includes('arrived') || statusFilter.includes(ShipmentStatus.ARRIVED_PTA) || statusFilter.includes(ShipmentStatus.ARRIVED_KLM) || statusFilter.includes(ShipmentStatus.ARRIVED_OFFSITE)) {
              onStatusFilterChange(['all']);
            } else {
              onStatusFilterChange(['arrived']);
            }
          }}
          style={{ fontSize: 12, padding: '4px 10px' }}
        >
          Arrived ({arrivedCount})
        </button>

        <FilterPresetManager
          viewName="shipments"
          currentFilters={currentFilters}
          onLoadPreset={(filters) => {
            if (filters.search) onSearchChange(filters.search);
            if (filters.status) onStatusFilterChange(filters.status);
            filterPreferencesManager.addSearchHistory('shipments', filters.search || '');
            if (onApplyPreset) onApplyPreset(filters);
          }}
          onSavePreset={() => {
            if (searchTerm) filterPreferencesManager.addSearchHistory('shipments', searchTerm);
          }}
        />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Secondary actions */}
        <button className="btn btn-ghost" onClick={onShowAutoArchive}
          style={{ fontSize: 12, padding: '4px 10px' }}>Archive</button>
        <button className="btn btn-ghost" onClick={onShowManualArchive}
          disabled={selectedCount === 0} style={{ fontSize: 12, padding: '4px 10px' }}>
          Manual Archive{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>
        <button className="btn btn-ghost" onClick={onShowBulkUpdate}
          disabled={filteredCount === 0} style={{ fontSize: 12, padding: '4px 10px' }}>
          Bulk Update
        </button>
      </div>

      {/* Bulk action toolbar */}
      {selectedCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
          background: 'var(--accent-100, #dbeafe)', borderRadius: '8px', marginBottom: '12px',
          border: '1px solid var(--accent, #3b82f6)'
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedCount} selected</span>
          <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            onClick={onBulkArchive}>Archive Selected</button>
          <button className="btn btn-danger" style={{ fontSize: '0.8rem', padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
            onClick={onBulkDelete}>Delete Selected</button>
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            onClick={onClearSelection}>Clear Selection</button>
        </div>
      )}
    </>
  );
}

export default ShipmentTableToolbar;
