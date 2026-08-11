import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../utils/authFetch';
import { getApiUrl } from '../config/api';
import { useNotification } from '../contexts/NotificationContext';

function ArchiveView() {
  const { showError, showSuccess, confirm: confirmAction } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const globalSearchTerm = searchParams.get('search') || '';
  const [archives, setArchives] = useState([]);
  const [dbArchived, setDbArchived] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [archiveData, setArchiveData] = useState(null);
  const [searchTerm, setSearchTerm] = useState(globalSearchTerm || '');
  const [dbSearchResults, setDbSearchResults] = useState(null);
  const [searchingAll, setSearchingAll] = useState(false);
  const [editingArchive, setEditingArchive] = useState(null);
  const [newName, setNewName] = useState('');
  const [editingShipment, setEditingShipment] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [showFileArchives, setShowFileArchives] = useState(false);
  const [detailShipment, setDetailShipment] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkRestoring, setBulkRestoring] = useState(false);

  useEffect(() => {
    fetchArchives();
    fetchDbArchived();
  }, []);

  // Sync global search term from URL (e.g. deep-linked from GlobalSearch)
  useEffect(() => {
    if (globalSearchTerm) {
      setSearchTerm(globalSearchTerm);
      const params = new URLSearchParams(searchParams);
      params.delete('search');
      setSearchParams(params, { replace: true });
    }
  }, [globalSearchTerm]);

  // Search reaches the full archived set, not just the currently loaded page
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) {
      setDbSearchResults(null);
      return;
    }
    setSearchingAll(true);
    const timer = setTimeout(async () => {
      try {
        const response = await authFetch(getApiUrl(`/api/shipments?search=${encodeURIComponent(term)}&limit=500`));
        if (response.ok) {
          const result = await response.json();
          const rows = result.data || result.shipments || result || [];
          setDbSearchResults(rows.filter(s => {
            const status = s.latestStatus || s.latest_status;
            return status === 'archived' || status === 'sold';
          }));
        }
      } catch (error) {
        console.error('Error searching archived shipments:', error);
      } finally {
        setSearchingAll(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchArchives = async () => {
    try {
      setLoading(true);
      const response = await authFetch(getApiUrl('/api/shipments/archives'));
      if (!response.ok) throw new Error('Failed to fetch archives');
      const data = await response.json();
      setArchives(data);
    } catch (error) {
      console.error('Error fetching archives:', error);
    } finally {
      setLoading(false);
    }
  };

  const [dbPage, setDbPage] = useState(1);
  const [dbPagination, setDbPagination] = useState(null);
  const DB_PAGE_SIZE = 50;

  const fetchDbArchived = async (page = 1) => {
    try {
      const response = await authFetch(getApiUrl(`/api/shipments?status=archived&page=${page}&limit=${DB_PAGE_SIZE}`));
      if (!response.ok) return;
      const result = await response.json();
      setDbArchived(result.data || result);
      if (result.pagination) {
        setDbPagination(result.pagination);
        setDbPage(page);
      }
    } catch (error) {
      console.error('Error fetching DB archived shipments:', error);
    }
  };

  const viewArchive = async (fileName) => {
    try {
      setLoading(true);
      const response = await authFetch(getApiUrl(`/api/shipments/archives/${fileName}`));
      if (!response.ok) throw new Error('Failed to fetch archive data');
      const data = await response.json();
      setArchiveData(data);
      setSelectedArchive(fileName);
    } catch (error) {
      console.error('Error fetching archive data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameArchive = async (fileName, newName) => {
    try {
      const response = await authFetch(getApiUrl(`/api/shipments/archives/${fileName}/rename`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName })
      });
      if (!response.ok) throw new Error('Failed to rename archive');
      await fetchArchives();
      setEditingArchive(null);
      setNewName('');
    } catch (error) {
      console.error('Error renaming archive:', error);
      showError('Failed to rename archive');
    }
  };

  const startEditing = (archive) => {
    setEditingArchive(archive.fileName);
    setNewName(getArchiveDisplayName(archive.fileName));
  };

  const cancelEditing = () => {
    setEditingArchive(null);
    setNewName('');
  };

  const startEditingShipment = (shipment) => {
    setEditingShipment(shipment);
    setEditFormData({ ...shipment });
  };

  const cancelEditingShipment = () => {
    setEditingShipment(null);
    setEditFormData(null);
  };

  const handleEditFieldChange = (field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  const saveShipmentEdit = async () => {
    try {
      const updatedData = archiveData.data.map(s =>
        s.id === editingShipment.id ? editFormData : s
      );
      const response = await authFetch(getApiUrl(`/api/shipments/archives/${selectedArchive}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: updatedData })
      });
      if (!response.ok) throw new Error('Failed to update archive');
      setArchiveData(prev => ({ ...prev, data: updatedData }));
      cancelEditingShipment();
    } catch (error) {
      console.error('Error updating shipment:', error);
      showError('Failed to update shipment');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString();
  };

  const getArchiveDisplayName = (fileName, archiveData = null) => {
    if (archiveData && archiveData.customName) return archiveData.customName;
    if (fileName.startsWith('custom_archive_')) {
      const withoutPrefix = fileName.replace('custom_archive_', '').replace('.json', '');
      const parts = withoutPrefix.split('_');
      const tsIdx = parts.findIndex(p => p.match(/^\d{4}-\d{2}-\d{2}T/));
      return tsIdx > 0 ? parts.slice(0, tsIdx).join(' ') : withoutPrefix;
    } else if (fileName.startsWith('manual_archive_')) {
      const withoutPrefix = fileName.replace('manual_archive_', '').replace('.json', '');
      const parts = withoutPrefix.split('_');
      const tsIdx = parts.findIndex(p => p.match(/^\d{4}-\d{2}-\d{2}T/));
      if (tsIdx > 0) return `Manual Archive - ${parts.slice(0, tsIdx).join(', ')}`;
      try { return `Manual Archive - ${new Date(withoutPrefix).toLocaleDateString()}`; } catch { return `Manual Archive - ${withoutPrefix}`; }
    } else if (fileName.startsWith('auto_archive_arrived_')) {
      const dateStr = fileName.replace('auto_archive_arrived_', '').replace('.json', '');
      return `Auto Archive (Arrived) - ${new Date(dateStr).toLocaleDateString()}`;
    } else if (fileName.startsWith('shipments_')) {
      const dateStr = fileName.replace('shipments_', '').replace('.json', '');
      return `Data Backup - ${new Date(dateStr).toLocaleDateString()}`;
    }
    return fileName.replace('.json', '');
  };

  const handleRestore = async (id, orderRef) => {
    const doRestore = await confirmAction({
      title: 'Restore Shipment',
      message: `Are you sure you want to restore shipment "${orderRef || id}" from the archive?`,
      type: 'warning',
      confirmText: 'Restore'
    });
    if (!doRestore) return;

    setRestoringId(id);
    try {
      const res = await authFetch(getApiUrl('/api/shipments/' + id + '/restore'), { method: 'POST' });
      if (!res.ok) throw new Error('Failed to restore shipment');
      setDbArchived(prev => prev.filter(s => s.id !== id));
      if (dbPagination) {
        setDbPagination(prev => prev ? { ...prev, total: prev.total - 1 } : prev);
      }
      showSuccess(`Shipment "${orderRef || id}" restored successfully`);
    } catch (error) {
      console.error('Error restoring shipment:', error);
      showError('Failed to restore shipment');
    } finally {
      setRestoringId(null);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    const doRestore = await confirmAction({
      title: 'Bulk Restore',
      message: `Are you sure you want to restore ${selectedIds.size} shipment(s) from the archive?`,
      type: 'warning',
      confirmText: `Restore ${selectedIds.size}`
    });
    if (!doRestore) return;

    setBulkRestoring(true);
    try {
      const res = await authFetch(getApiUrl('/api/shipments/bulk/restore'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds] })
      });
      if (!res.ok) throw new Error('Failed to bulk restore');
      const data = await res.json();
      setDbArchived(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
      setSelectAll(false);
      if (dbPagination) {
        setDbPagination(prev => prev ? { ...prev, total: prev.total - (data.restored || 0) } : prev);
      }
      showSuccess(`Restored ${data.restored} shipment(s)${data.failed > 0 ? `, ${data.failed} failed` : ''}`);
    } catch (error) {
      console.error('Error bulk restoring:', error);
      showError('Failed to bulk restore shipments');
    } finally {
      setBulkRestoring(false);
    }
  };

  // Filter file archives (exclude data backups, apply search)
  const filteredFileArchives = useMemo(() => {
    return archives
      .filter(a => !a.fileName.startsWith('shipments_'))
      .filter(a =>
        searchTerm === '' ||
        a.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getArchiveDisplayName(a.fileName).toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [archives, searchTerm]);

  // Filter DB-archived shipments by search. Below 2 chars, browse the current
  // page as normal; at 2+ chars, use the full-dataset search results so matches
  // outside the currently-loaded 50-row page are still reachable.
  const filteredDbArchived = useMemo(() => {
    if (searchTerm.trim().length >= 2) return dbSearchResults || [];
    return dbArchived;
  }, [dbArchived, searchTerm, dbSearchResults]);
  const isSearchingAllArchived = searchTerm.trim().length >= 2;

  // --- Detail view for a specific file archive ---
  if (selectedArchive && archiveData) {
    return (
      <div className="product-view">
        <div className="brand-strip" />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--navy-900)' }}>
              {getArchiveDisplayName(selectedArchive)}
            </h2>
            <span style={{ fontSize: 12, color: 'var(--text-500)' }}>
              Archived {formatDate(archiveData.archivedAt)} &middot; {archiveData.totalShipments} shipments
            </span>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: 13, padding: '6px 14px' }}
            onClick={() => { setSelectedArchive(null); setArchiveData(null); setSearchTerm(''); }}>
            Back to Archives
          </button>
        </div>

        <div style={{ padding: '16px 24px' }}>
          <input
            type="text" placeholder="Search shipments..." value={searchTerm}
            aria-label="Search archived shipments"
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6,
              fontSize: 13, width: '100%', maxWidth: 360, marginBottom: 12
            }}
          />

          <div className="dash-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    {['Supplier', 'Order Ref', 'Product', 'Qty', 'Pallets', 'Destination', 'Status', ''].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)',
                        fontSize: 11, fontWeight: 600, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: '0.3px'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {archiveData.data.filter(s =>
                    searchTerm === '' ||
                    s.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.orderRef?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.finalPod?.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 500 }}>{s.supplier}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>
                        <span
                          onClick={() => setDetailShipment(s)}
                          style={{ color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dashed var(--accent)' }}
                          title="View order details"
                        >{s.orderRef}</span>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{s.productName}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{s.quantity?.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{s.palletQty ? (Math.round(s.palletQty) || 1) : '-'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{s.finalPod}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: s.latestStatus === 'stored' ? '#dcfce7' : s.latestStatus === 'rejected' ? '#fee2e2' : '#dbeafe',
                          color: s.latestStatus === 'stored' ? '#166534' : s.latestStatus === 'rejected' ? '#991b1b' : '#1e40af'
                        }}>
                          {s.latestStatus?.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>
                        <button onClick={() => startEditingShipment(s)}
                          style={{
                            padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)',
                            borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--text-700)'
                          }}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Edit Shipment Modal */}
        {editingShipment && editFormData && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
            justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '2rem'
          }}>
            <div style={{
              backgroundColor: 'white', borderRadius: 10, padding: '24px',
              maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Edit Archived Shipment</h3>
                <button onClick={cancelEditingShipment} style={{
                  background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-500)'
                }}>x</button>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Supplier', field: 'supplier', type: 'text' },
                    { label: 'Order Ref', field: 'orderRef', type: 'text' },
                  ].map(({ label, field, type }) => (
                    <div key={field}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>{label}</label>
                      <input type={type} value={editFormData[field] || ''} onChange={e => handleEditFieldChange(field, e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                    </div>
                  ))}
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>Product Name</label>
                  <input type="text" value={editFormData.productName || ''} onChange={e => handleEditFieldChange('productName', e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>Destination</label>
                    <input type="text" value={editFormData.finalPod || ''} onChange={e => handleEditFieldChange('finalPod', e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>Warehouse</label>
                    <select value={editFormData.receivingWarehouse || ''} onChange={e => handleEditFieldChange('receivingWarehouse', e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}>
                      <option value="">Select Warehouse</option>
                      <option value="PRETORIA">PRETORIA</option>
                      <option value="KLAPMUTS">KLAPMUTS</option>
                      <option value="OFFSITE">OFFSITE</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Quantity', field: 'quantity', type: 'number', parse: parseInt },
                    { label: 'Pallets', field: 'palletQty', type: 'number', parse: parseInt },
                    { label: 'CBM', field: 'cbm', type: 'number', parse: parseFloat },
                  ].map(({ label, field, type, parse }) => (
                    <div key={field}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>{label}</label>
                      <input type={type} value={editFormData[field] || ''} onChange={e => handleEditFieldChange(field, parse(e.target.value))}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Forwarding Agent', field: 'forwardingAgent' },
                    { label: 'Vessel Name', field: 'vesselName' },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-500)' }}>{label}</label>
                      <input type="text" value={editFormData[field] || ''} onChange={e => handleEditFieldChange(field, e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button onClick={cancelEditingShipment} style={{
                    padding: '7px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 6, fontSize: 13, cursor: 'pointer'
                  }}>Cancel</button>
                  <button onClick={saveShipmentEdit} style={{
                    padding: '7px 16px', background: 'var(--accent)', color: 'white', border: 'none',
                    borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600
                  }}>Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Main archive list ---
  return (
    <div className="product-view">
      <div className="brand-strip" />

      {/* Compact header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 24px', borderBottom: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--navy-900)' }}>
            Shipment Archives
          </h2>
          <span style={{ fontSize: 12, color: 'var(--text-500)' }}>
            {isSearchingAllArchived
              ? (searchingAll ? 'Searching all archived shipments...' : `${filteredDbArchived.length} match${filteredDbArchived.length !== 1 ? 'es' : ''} across all archives`)
              : `${dbPagination?.total || filteredDbArchived.length} archived shipment${(dbPagination?.total || filteredDbArchived.length) !== 1 ? 's' : ''}`}
            {filteredFileArchives.length > 0 && ` · ${filteredFileArchives.length} file archive${filteredFileArchives.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        <input
          type="text" placeholder="Search..." value={searchTerm}
          aria-label="Search archives"
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6,
            fontSize: 13, width: 260
          }}
        />
      </div>

      <div style={{ padding: '16px 24px' }}>
        {loading && <div className="loading">Loading archives...</div>}

        {/* Bulk action toolbar for DB-archived shipments */}
        {!loading && selectedIds.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
            background: '#dcfce7', borderRadius: '8px', marginBottom: '12px',
            border: '1px solid #16a34a'
          }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedIds.size} selected</span>
            <button
              style={{
                fontSize: '0.8rem', padding: '6px 12px', background: '#16a34a', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600
              }}
              disabled={bulkRestoring}
              onClick={handleBulkRestore}
            >
              {bulkRestoring ? 'Restoring...' : `Restore Selected (${selectedIds.size})`}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              onClick={() => { setSelectedIds(new Set()); setSelectAll(false); }}
            >
              Clear Selection
            </button>
          </div>
        )}

        {/* DB-archived shipments */}
        {!loading && filteredDbArchived.length > 0 && (
          <div className="dash-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th style={{
                      width: '40px', textAlign: 'center', padding: '8px 12px',
                      borderBottom: '1px solid var(--border)'
                    }}>
                      <input type="checkbox" checked={selectAll} onChange={(e) => {
                        setSelectAll(e.target.checked);
                        if (e.target.checked) {
                          setSelectedIds(new Set(filteredDbArchived.map(s => s.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }} />
                    </th>
                    {['Order Ref', 'Supplier', 'Product', 'Qty', 'Pallets', 'Warehouse', 'Archived', ''].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)',
                        fontSize: 11, fontWeight: 600, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: '0.3px'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDbArchived.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}>
                      <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                        <input type="checkbox" checked={selectedIds.has(s.id)} onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          setSelectedIds(next);
                          setSelectAll(next.size === filteredDbArchived.length);
                        }} />
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13 }}>
                        <span
                          onClick={() => setDetailShipment(s)}
                          style={{ color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dashed var(--accent)' }}
                          title="View order details"
                        >{s.orderRef || s.order_ref}</span>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{s.supplier}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{s.productName || s.product_name || 'N/A'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{s.quantity || '-'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{(s.palletQty || s.pallet_qty) ? (Math.round(s.palletQty || s.pallet_qty) || 1) : '-'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{s.receivingWarehouse || s.receiving_warehouse || 'N/A'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{formatDate(s.updatedAt || s.updated_at)}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>
                        <button
                          onClick={() => handleRestore(s.id, s.orderRef || s.order_ref)}
                          disabled={restoringId === s.id}
                          style={{
                            padding: '4px 10px', background: restoringId === s.id ? '#86efac' : '#16a34a',
                            color: 'white', border: 'none', borderRadius: 4, fontSize: 12,
                            cursor: restoringId === s.id ? 'not-allowed' : 'pointer', fontWeight: 600
                          }}
                        >
                          {restoringId === s.id ? 'Restoring...' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination controls */}
        {!isSearchingAllArchived && dbPagination && dbPagination.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 0', marginBottom: 16 }}>
            <button
              onClick={() => fetchDbArchived(dbPage - 1)}
              disabled={dbPage <= 1}
              style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: dbPage <= 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: dbPage <= 1 ? 0.5 : 1 }}
            >Previous</button>
            <span style={{ fontSize: 12, color: 'var(--text-500)' }}>
              Page {dbPage} of {dbPagination.pages} ({dbPagination.total} total)
            </span>
            <button
              onClick={() => fetchDbArchived(dbPage + 1)}
              disabled={dbPage >= dbPagination.pages}
              style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: dbPage >= dbPagination.pages ? 'not-allowed' : 'pointer', fontSize: 12, opacity: dbPage >= dbPagination.pages ? 0.5 : 1 }}
            >Next</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && dbArchived.length === 0 && archives.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-500)' }}>
            <p style={{ fontSize: 14, margin: 0 }}>No archived shipments yet. Archived shipments will appear here.</p>
          </div>
        )}

        {/* File-based archives (collapsible) */}
        {!loading && filteredFileArchives.length > 0 && (
          <div>
            <button onClick={() => setShowFileArchives(!showFileArchives)} style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-700)', padding: '4px 0', marginBottom: 8
            }}>
              <span style={{
                display: 'inline-block', transform: showFileArchives ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s', fontSize: 11
              }}>&#9654;</span>
              File Archives ({filteredFileArchives.length})
            </button>

            {showFileArchives && (
              <div className="dash-panel" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        {['Name', 'Date', 'Shipments', ''].map(h => (
                          <th key={h} style={{
                            padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)',
                            fontSize: 11, fontWeight: 600, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: '0.3px'
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFileArchives.map(archive => (
                        <tr key={archive.fileName} style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-2)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}>
                          <td style={{ padding: '8px 12px', fontSize: 13 }}>
                            {editingArchive === archive.fileName ? (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleRenameArchive(archive.fileName, newName);
                                    if (e.key === 'Escape') cancelEditing();
                                  }}
                                  autoFocus
                                  style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, flex: 1 }} />
                                <button onClick={() => handleRenameArchive(archive.fileName, newName)}
                                  style={{ padding: '4px 8px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
                                  Save
                                </button>
                                <button onClick={cancelEditing}
                                  style={{ padding: '4px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 500 }}>{getArchiveDisplayName(archive.fileName)}</span>
                                <button onClick={() => startEditing(archive)}
                                  style={{ padding: '2px 6px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 3, fontSize: 11, cursor: 'pointer', color: 'var(--text-500)' }}>
                                  Rename
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-500)' }}>
                            {formatDate(archive.archivedAt)}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 13 }}>
                            {archive.totalShipments}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 13 }}>
                            <button onClick={() => viewArchive(archive.fileName)}
                              style={{
                                padding: '4px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--text-700)', fontWeight: 500
                              }}>View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Order Detail Card */}
      {detailShipment && (
        <div
          onClick={() => setDetailShipment(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: '1.5rem',
              width: '90%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)', border: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                {detailShipment.orderRef || detailShipment.order_ref}
              </h3>
              <button
                onClick={() => setDetailShipment(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-500)', lineHeight: 1 }}
              >
                x
              </button>
            </div>
            {(() => {
              const s = detailShipment;
              const rows = [
                ['Supplier', s.supplier],
                ['Product', s.productName || s.product_name],
                ['Quantity', s.quantity != null ? Number(s.quantity).toLocaleString() : '-'],
                ['Pallets', (s.palletQty || s.pallet_qty) ? (Math.round(s.palletQty || s.pallet_qty) || 1) : '-'],
                ['CBM', s.cbm || '-'],
                ['Week', s.weekNumber || s.week_number ? `Week ${s.weekNumber || s.week_number}` : '-'],
                ['Status', ((s.latestStatus || s.latest_status || '').replace(/_/g, ' ')) || '-'],
                ['Final POD', s.finalPod || s.final_pod || '-'],
                ['Warehouse', s.receivingWarehouse || s.receiving_warehouse || '-'],
                ['Freight Type', s.freightType || s.freight_type || '-'],
                ['Incoterm', s.incoterm || '-'],
                ['Forwarding Agent', s.forwardingAgent || s.forwarding_agent || '-'],
                ['Vessel', s.vesselName || s.vessel_name || '-'],
                ['Archived', formatDate(s.updatedAt || s.updated_at)],
              ];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 0 }}>
                  {rows.map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{
                        padding: '6px 8px', fontSize: 12, fontWeight: 600,
                        color: 'var(--text-500)', borderBottom: '1px solid var(--border)'
                      }}>
                        {label}
                      </div>
                      <div style={{
                        padding: '6px 8px', fontSize: 13,
                        color: 'var(--text-700)', borderBottom: '1px solid var(--border)',
                        wordBreak: 'break-word'
                      }}>
                        {value || '-'}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default ArchiveView;
