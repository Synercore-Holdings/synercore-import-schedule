import React, { useState, useMemo, useCallback, useEffect } from 'react';
import useFormDraft from '../hooks/useFormDraft';
import { Supplier, ImportFormat, DocumentType } from '../types/supplier';
import * as XLSX from 'xlsx';
import SupplierCharts from './SupplierCharts';
import { getApiUrl } from '../config/api';
import { authFetch } from '../utils/authFetch';
import { formatCurrency } from '../utils/costingCalculations';
import { useNotification } from '../contexts/NotificationContext';

function SupplierManagement({ suppliers = [], shipments = [], onAddSupplier, onUpdateSupplier, onDeleteSupplier, onImportSchedule, loading }) {
  const { showSuccess, showError, showWarning } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [documentFiles, setDocumentFiles] = useState([]);
  const [showDocumentsDialog, setShowDocumentsDialog] = useState(false);
  const [selectedSupplierDocs, setSelectedSupplierDocs] = useState(null);
  const [supplierDocuments, setSupplierDocuments] = useState([]);
  const [documentSearchTerm, setDocumentSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [detailShipment, setDetailShipment] = useState(null);
  const [showSupplierDetail, setShowSupplierDetail] = useState(false);
  const [detailSupplier, setDetailSupplier] = useState(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [documentToRename, setDocumentToRename] = useState(null);
  const [newDocumentName, setNewDocumentName] = useState('');
  const [archivedEstimates, setArchivedEstimates] = useState([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [openMenuId, setOpenMenuId] = useState(null);

  // Initials badge helpers
  const AVATAR_COLORS = ['#059669','#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444','#6366f1'];
  const getInitials = (name) => (name || '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const getAvatarColor = (name) => AVATAR_COLORS[(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

  // Close kebab menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const close = (e) => { if (!e.target.closest('.kebab-wrap')) setOpenMenuId(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    contactEmail: '',
    contactPhone: '',
    contactPerson: '',
    address: '',
    country: '',
    defaultTerms: '',
    paymentTerms: '',
    currency: 'USD',
    importFormats: [ImportFormat.EXCEL],
    documentFormats: [DocumentType.SHIPPING_SCHEDULE],
    isActive: true,
    notes: ''
  });

  // Auto-save supplier form
  const { clearDraft: clearSupplierDraft, confirmClose: confirmCloseSupplier } = useFormDraft(
    `supplier_${editingSupplier?.id || 'new'}`, formData, setFormData, { enabled: showAddForm }
  );

  // Memoize shipment counts per supplier for signals + sorting
  const supplierShipmentCounts = useMemo(() => {
    const counts = {};
    suppliers.forEach(s => {
      const name = (s.name || '').toLowerCase();
      const code = (s.code || '').toLowerCase();
      counts[s.id] = shipments.filter(sh => {
        const sn = (sh.supplier || '').toLowerCase();
        return sn === name || sn === code || (name && sn.includes(name));
      }).length;
    });
    return counts;
  }, [suppliers, shipments]);

  const filteredSuppliers = useMemo(() => {
    const filtered = suppliers.filter(supplier =>
      supplier.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return filtered.sort((a, b) => {
      if (sortBy === 'country') return (a.country || 'zzz').localeCompare(b.country || 'zzz');
      if (sortBy === 'shipments') return (supplierShipmentCounts[b.id] || 0) - (supplierShipmentCounts[a.id] || 0);
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [suppliers, searchTerm, sortBy, supplierShipmentCounts]);

  const filteredDocuments = useMemo(() => {
    if (!documentSearchTerm.trim()) return supplierDocuments;
    
    return supplierDocuments.filter(doc => {
      const filename = doc.filename.toLowerCase();
      const searchLower = documentSearchTerm.toLowerCase();
      
      // Search by filename
      if (filename.includes(searchLower)) return true;
      
      // Search by file type
      if (filename.includes('pdf') && 'pdf'.includes(searchLower)) return true;
      if (filename.match(/\.(xlsx|xls)$/) && ('excel'.includes(searchLower) || 'spreadsheet'.includes(searchLower))) return true;
      if (filename.match(/\.(jpg|jpeg|png|gif)$/) && 'image'.includes(searchLower)) return true;
      if (filename.match(/\.(doc|docx)$/) && ('word'.includes(searchLower) || 'document'.includes(searchLower))) return true;
      if (filename.includes('csv') && ('csv'.includes(searchLower) || 'data'.includes(searchLower))) return true;
      
      return false;
    });
  }, [supplierDocuments, documentSearchTerm]);

  // Filter shipments by supplier
  const getSupplierShipments = useCallback((supplier) => {
    if (!shipments || !supplier) return [];
    
    // Match by supplier name or code
    return shipments.filter(shipment => {
      const supplierName = shipment.supplier?.toLowerCase() || '';
      const searchName = supplier.name?.toLowerCase() || '';
      const searchCode = supplier.code?.toLowerCase() || '';
      
      return supplierName === searchName || 
             (searchCode && supplierName === searchCode) ||
             supplierName.includes(searchName) ||
             (searchCode && supplierName.includes(searchCode));
    });
  }, [shipments]);

  // Fetch archived estimates when viewing supplier detail
  useEffect(() => {
    const fetchArchivedEstimates = async () => {
      if (!detailSupplier) {
        setArchivedEstimates([]);
        return;
      }

      try {
        setLoadingArchived(true);
        const response = await authFetch(getApiUrl('/api/costing?status=archived&limit=5000'));
        if (response.ok) {
          const result = await response.json();
          // Filter by supplier name
          const supplierEstimates = (result.data || []).filter(est => {
            const estSupplier = (est.supplier_name || '').toLowerCase();
            const detailName = (detailSupplier.name || '').toLowerCase();
            return estSupplier === detailName || estSupplier.includes(detailName);
          });
          setArchivedEstimates(supplierEstimates);
        }
      } catch (err) {
        console.error('Failed to fetch archived estimates:', err);
      } finally {
        setLoadingArchived(false);
      }
    };

    fetchArchivedEstimates();
  }, [detailSupplier]);

  // Handle supplier card click
  const handleSupplierCardClick = useCallback((supplier, e) => {
    // Don't trigger if clicking on action buttons
    if (e.target.closest('button')) return;

    setDetailSupplier(supplier);
    setShowSupplierDetail(true);
  }, []);

  const handleFormSubmit = useCallback((e) => {
    e.preventDefault();
    
    if (editingSupplier) {
      onUpdateSupplier(editingSupplier.id, formData);
      setEditingSupplier(null);
    } else {
      const newSupplier = new Supplier({
        id: Date.now().toString(),
        ...formData
      });
      onAddSupplier(newSupplier);
    }
    
    clearSupplierDraft();
    setShowAddForm(false);
    setFormData({
      name: '',
      code: '',
      contactEmail: '',
      contactPhone: '',
      contactPerson: '',
      address: '',
      country: '',
      defaultTerms: '',
      paymentTerms: '',
      currency: 'USD',
      importFormats: [ImportFormat.EXCEL],
      documentFormats: [DocumentType.SHIPPING_SCHEDULE],
      isActive: true,
      notes: ''
    });
  }, [editingSupplier, formData, onAddSupplier, onUpdateSupplier, clearSupplierDraft]);

  const handleEdit = useCallback((supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      code: supplier.code || '',
      contactEmail: supplier.contactEmail || '',
      contactPhone: supplier.contactPhone || '',
      contactPerson: supplier.contactPerson || '',
      address: supplier.address || '',
      country: supplier.country || '',
      defaultTerms: supplier.defaultTerms || '',
      paymentTerms: supplier.paymentTerms || '',
      currency: supplier.currency || 'USD',
      importFormats: supplier.importFormats || [ImportFormat.EXCEL],
      documentFormats: supplier.documentFormats || [DocumentType.SHIPPING_SCHEDULE],
      isActive: supplier.isActive !== false,
      notes: supplier.notes || ''
    });
    setShowAddForm(true);
  }, []);

  const handleFileUpload = useCallback((file, type) => {
    if (type === 'schedule') {
      setImportFile(file);
      // Clear any previous preview since we're not processing the file anymore
      setImportPreview([]);
    } else if (type === 'document') {
      setDocumentFiles(prev => [...prev, file]);
    }
  }, []);

  const saveDocumentsOnly = useCallback(async () => {
    if (!selectedSupplier || documentFiles.length === 0) {
      showWarning('Please select a supplier and add documents to save.');
      return;
    }

    try {
      // Upload documents only
      const formData = new FormData();
      documentFiles.forEach(file => {
        formData.append('documents', file);
      });
      formData.append('supplierId', selectedSupplier.id);

      const uploadResponse = await fetch(getApiUrl('/api/documents/upload'), {
        method: 'POST',
        body: formData
      });

      if (uploadResponse.ok) {
        const uploadedDocs = await uploadResponse.json();
        showSuccess(`Successfully saved ${uploadedDocs.length} documents for ${selectedSupplier.name}`);

        // Reset form but keep supplier selected
        setDocumentFiles([]);
      } else {
        throw new Error('Failed to upload documents');
      }
    } catch (error) {
      console.error('Error saving documents:', error);
      showError('Error saving documents. Please try again.');
    }
  }, [selectedSupplier, documentFiles, showSuccess, showWarning, showError]);

  const saveDocumentsAndClose = useCallback(async () => {
    if (!selectedSupplier || documentFiles.length === 0) {
      showWarning('Please select a supplier and add documents to save.');
      return;
    }

    try {
      // Upload documents only
      const formData = new FormData();
      documentFiles.forEach(file => {
        formData.append('documents', file);
      });
      formData.append('supplierId', selectedSupplier.id);

      const uploadResponse = await fetch(getApiUrl('/api/documents/upload'), {
        method: 'POST',
        body: formData
      });

      if (uploadResponse.ok) {
        const uploadedDocs = await uploadResponse.json();
        showSuccess(`Successfully saved ${uploadedDocs.length} documents for ${selectedSupplier.name}`);
        
        // Close dialog and reset form
        setShowImportDialog(false);
        setImportFile(null);
        setImportPreview([]);
        setDocumentFiles([]);
        setSelectedSupplier(null);
      } else {
        throw new Error('Failed to upload documents');
      }
    } catch (error) {
      console.error('Error saving documents:', error);
      showError('Error saving documents. Please try again.');
    }
  }, [selectedSupplier, documentFiles, showSuccess, showWarning, showError]);

  const processImport = useCallback(async () => {
    if (!importFile || !selectedSupplier) {
      showWarning('Please select a supplier and upload a file.');
      return;
    }

    try {
      // Upload Excel file and all supporting documents as documents (not processed data)
      const formData = new FormData();
      
      // Add the Excel file as a document
      formData.append('documents', importFile);
      
      // Add any additional supporting documents
      documentFiles.forEach(file => {
        formData.append('documents', file);
      });
      
      formData.append('supplierId', selectedSupplier.id);

      const uploadResponse = await fetch(getApiUrl('/api/documents/upload'), {
        method: 'POST',
        body: formData
      });

      if (uploadResponse.ok) {
        const uploadedDocs = await uploadResponse.json();
        const totalFiles = uploadedDocs.length;
        const excelCount = importFile ? 1 : 0;
        const supportingCount = documentFiles.length;
        
        showSuccess(`Successfully saved ${totalFiles} documents for ${selectedSupplier.name} (${excelCount} Excel file${supportingCount ? ` + ${supportingCount} supporting documents` : ''})`);
        
        // Reset form
        setShowImportDialog(false);
        setImportFile(null);
        setImportPreview([]);
        setDocumentFiles([]);
        setSelectedSupplier(null);
      } else {
        throw new Error('Failed to upload documents');
      }
    } catch (error) {
      console.error('Error uploading documents:', error);
      showError('Error uploading documents. Please try again.');
    }
  }, [importFile, selectedSupplier, documentFiles, showSuccess]);

  const processSupplierData = useCallback((rawData, supplier) => {
    if (rawData.length < 2) return [];
    
    const headers = rawData[0];
    const dataRows = rawData.slice(1);
    
    // Map common column names to our shipment structure
    const columnMapping = {
      'product name': 'productName',
      'product': 'productName',
      'item': 'productName',
      'description': 'productName',
      'quantity': 'quantity',
      'qty': 'quantity',
      'amount': 'quantity',
      'cbm': 'cbm',
      'volume': 'cbm',
      'm3': 'cbm',
      'supplier': 'supplier',
      'vendor': 'supplier',
      'order ref': 'orderRef',
      'order reference': 'orderRef',
      'po number': 'orderRef',
      'po': 'orderRef',
      'final pod': 'finalPod',
      'destination': 'finalPod',
      'port': 'finalPod',
      'eta': 'estimatedArrival',
      'arrival date': 'estimatedArrival',
      'estimated arrival': 'estimatedArrival',
      'week': 'weekNumber',
      'week number': 'weekNumber',
      'eta week': 'weekNumber',
      'warehouse': 'receivingWarehouse',
      'receiving warehouse': 'receivingWarehouse',
      'notes': 'notes',
      'remarks': 'notes',
      'comments': 'notes'
    };

    return dataRows
      .filter(row => row && row.some(cell => cell !== null && cell !== ''))
      .map((row, index) => {
        const shipment = {
          id: `${supplier.code || supplier.name}-${Date.now()}-${index}`,
          supplier: supplier.name,
          latestStatus: 'planned_airfreight',
          priority: 'medium'
        };

        headers.forEach((header, colIndex) => {
          if (header && row[colIndex] !== null && row[colIndex] !== '') {
            const normalizedHeader = header.toString().toLowerCase().trim();
            const mappedField = columnMapping[normalizedHeader];
            
            if (mappedField) {
              let value = row[colIndex];
              
              // Special handling for different field types
              if (mappedField === 'quantity' || mappedField === 'cbm') {
                value = parseFloat(value) || 0;
              } else if (mappedField === 'weekNumber') {
                // Extract week number if it's in format "Week 45" or just "45"
                const weekMatch = value.toString().match(/\d+/);
                value = weekMatch ? weekMatch[0] : value;
              } else if (mappedField === 'estimatedArrival') {
                // Try to parse date
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                  value = date.toISOString().split('T')[0];
                }
              }
              
              shipment[mappedField] = value;
            }
          }
        });

        // Set defaults for missing fields
        if (!shipment.productName) shipment.productName = `Product ${index + 1}`;
        if (!shipment.quantity) shipment.quantity = 0;
        if (!shipment.cbm) shipment.cbm = 0;
        if (!shipment.orderRef) shipment.orderRef = `${supplier.code || 'IMP'}-${index + 1}`;
        if (!shipment.finalPod) shipment.finalPod = 'TBD';
        if (!shipment.receivingWarehouse) shipment.receivingWarehouse = 'Unassigned';

        return shipment;
      });
  }, []);

  const handleViewDocuments = useCallback(async (supplier) => {
    try {
      setSelectedSupplierDocs(supplier);
      setShowDocumentsDialog(true);
      
      // Fetch documents for this supplier
      const response = await fetch(getApiUrl(`/api/suppliers/${supplier.id}/documents`));
      if (response.ok) {
        const documents = await response.json();
        setSupplierDocuments(documents);
      } else {
        console.error('Failed to fetch documents');
        setSupplierDocuments([]);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setSupplierDocuments([]);
    }
  }, []);

  const handleDownloadDocument = useCallback((doc) => {
    // Create download URL using current filename (not stored path)
    const downloadUrl = `/api/suppliers/${selectedSupplierDocs.id}/documents/${encodeURIComponent(doc.filename)}`;
    
    // Create a temporary link to download the document
    const link = window.document.createElement('a');
    link.href = downloadUrl;
    link.download = doc.filename;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  }, [selectedSupplierDocs]);

  const handleDeleteDocument = useCallback((doc) => {
    setDocumentToDelete(doc);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDeleteDocument = useCallback(async () => {
    if (!documentToDelete) return;

    try {
      const response = await fetch(getApiUrl(`/api/suppliers/${selectedSupplierDocs.id}/documents/${documentToDelete.filename}`), {
        method: 'DELETE'
      });

      if (response.ok) {
        // Remove the document from the local state
        setSupplierDocuments(prev => prev.filter(d => d.filename !== documentToDelete.filename));
        showSuccess(`Successfully deleted "${documentToDelete.filename}"`);
      } else {
        throw new Error('Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      showError(`Error deleting document: ${error.message}`);
    } finally {
      setShowDeleteConfirm(false);
      setDocumentToDelete(null);
    }
  }, [documentToDelete, selectedSupplierDocs, showSuccess, showError]);

  const cancelDeleteDocument = useCallback(() => {
    setShowDeleteConfirm(false);
    setDocumentToDelete(null);
  }, []);

  const handleRenameDocument = useCallback((doc) => {
    setDocumentToRename(doc);
    setNewDocumentName(doc.filename);
    setShowRenameDialog(true);
  }, []);

  const confirmRenameDocument = useCallback(async () => {
    if (!documentToRename || !newDocumentName.trim()) return;

    try {
      const response = await fetch(getApiUrl(`/api/suppliers/${selectedSupplierDocs.id}/documents/${encodeURIComponent(documentToRename.filename)}/rename`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newName: newDocumentName.trim() })
      });

      if (response.ok) {
        const updatedDoc = await response.json();
        // Update the document in the local state
        setSupplierDocuments(prev => prev.map(d => 
          d.filename === documentToRename.filename 
            ? { 
                ...d, 
                filename: updatedDoc.filename,
                path: `/api/suppliers/${selectedSupplierDocs.id}/documents/${encodeURIComponent(updatedDoc.filename)}`
              }
            : d
        ));
        showSuccess(`Successfully renamed document to "${updatedDoc.filename}"`);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to rename document');
      }
    } catch (error) {
      console.error('Error renaming document:', error);
      showError(`Error renaming document: ${error.message}`);
    } finally {
      setShowRenameDialog(false);
      setDocumentToRename(null);
      setNewDocumentName('');
    }
  }, [documentToRename, newDocumentName, selectedSupplierDocs, showSuccess, showError]);

  const cancelRenameDocument = useCallback(() => {
    setShowRenameDialog(false);
    setDocumentToRename(null);
    setNewDocumentName('');
  }, []);

  const generateTemplate = useCallback((supplier) => {
    const templateData = [
      ['Product Name', 'Quantity', 'Pallet Qty', 'Order Ref', 'Final POD', 'ETA Week', 'Receiving Warehouse', 'Notes'],
      ['Sample Product A', 100, 2, 'PO-001', 'Los Angeles', 45, 'Warehouse A', 'Fragile items'],
      ['Sample Product B', 250, 5, 'PO-002', 'Long Beach', 46, 'Warehouse B', 'Standard delivery'],
      ['Sample Product C', 150, 3, 'PO-003', 'Oakland', 47, 'Warehouse A', 'Rush order']
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 25 }, // Product Name
      { wch: 12 }, // Quantity
      { wch: 12 }, // Pallet Qty
      { wch: 15 }, // Order Ref
      { wch: 20 }, // Final POD
      { wch: 12 }, // ETA Week
      { wch: 20 }, // Receiving Warehouse
      { wch: 30 }  // Notes
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Template');
    
    const fileName = `${supplier.name.replace(/[^a-zA-Z0-9]/g, '_')}_Import_Template.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showSuccess(`Template downloaded: ${fileName}`);
  }, [showSuccess]);

  if (loading) {
    return <div className="loading">Loading suppliers...</div>;
  }

  return (
    <div className="supplier-management">
      <div className="brand-strip" />
      <div className="page-header table-header" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Supplier Management</h2>
        <span style={{ fontSize: 13, color: 'var(--text-500)', fontWeight: 500 }}>
          {filteredSuppliers.length} supplier{filteredSuppliers.length !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginLeft: 'auto' }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6,
              fontSize: 13, color: 'var(--text-700)', background: 'var(--surface)', cursor: 'pointer',
            }}
          >
            <option value="name">Sort: Name</option>
            <option value="country">Sort: Country</option>
            <option value="shipments">Sort: Shipments</option>
          </select>
          <input
            type="text"
            placeholder="Search suppliers..."
            aria-label="Search suppliers"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            style={{ minWidth: '200px' }}
          />
          <button onClick={() => setShowAddForm(true)} className="btn btn-primary">
            Add Supplier
          </button>
        </div>
      </div>

      {/* Suppliers Grid */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {filteredSuppliers.map(supplier => {
          const shipCount = supplierShipmentCounts[supplier.id] || 0;
          const avatarColor = getAvatarColor(supplier.name);
          const isActive = supplier.isActive !== false;
          const meta = [supplier.contactPerson, supplier.country].filter(Boolean).join(' · ') || '—';

          return (
            <div
              key={supplier.id}
              className={`stat-card ${isActive ? 'ring-accent' : 'ring-danger'} clickable`}
              onClick={(e) => handleSupplierCardClick(supplier, e)}
              style={{ display: 'flex', flexDirection: 'column', padding: 10 }}
            >
              {/* Header: initials badge + name + status pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex', flexShrink: 0,
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff', backgroundColor: avatarColor,
                }}>
                  {getInitials(supplier.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--navy-900)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }} title={supplier.name}>
                    {supplier.name}
                  </h3>
                  <div style={{ fontSize: 11, color: 'var(--text-500)', marginTop: 1 }}>{meta}</div>
                </div>
                <span className={`pill ${isActive ? 'pill-ok' : 'pill-bad'}`} style={{ flexShrink: 0, fontSize: 11 }}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Signals row */}
              <div style={{ fontSize: 11, color: 'var(--text-500)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ color: shipCount > 0 ? 'var(--text-700)' : 'var(--text-500)' }}>
                  📦 {shipCount > 0 ? `${shipCount} shipment${shipCount !== 1 ? 's' : ''}` : 'No shipments'}
                </span>
                {supplier.code && <span style={{ color: 'var(--text-500)' }}>· {supplier.code}</span>}
                <button
                  onClick={(e) => { e.stopPropagation(); handleSupplierCardClick(supplier, e); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--accent)', background: 'var(--accent-100)', color: 'var(--accent-600)', cursor: 'pointer', lineHeight: 1.4, whiteSpace: 'nowrap' }}
                >
                  📄 Price List
                </button>
              </div>

              {/* Action toolbar */}
              <div style={{ display: 'flex', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 'auto', alignItems: 'center' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSupplierCardClick(supplier, e); }}
                  style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-600)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                >
                  View
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(supplier); }}
                  style={{ fontSize: 12, fontWeight: 500, padding: '5px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-500)', cursor: 'pointer', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-900)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-500)'}
                >
                  Edit
                </button>
                <div style={{ flex: 1 }} />
                <div className="kebab-wrap" style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === supplier.id ? null : supplier.id); }}
                    className="btn-ghost"
                    style={{ fontSize: 18, padding: '4px 8px', lineHeight: 1 }}
                    title="More actions"
                  >
                    ⋮
                  </button>
                  {openMenuId === supplier.id && (
                    <div className="kebab-menu">
                      <button onClick={(e) => { e.stopPropagation(); generateTemplate(supplier); setOpenMenuId(null); }}>
                        📥 Download Template
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedSupplier(supplier); setShowImportDialog(true); setOpenMenuId(null); }}>
                        📋 Upload Schedule
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleViewDocuments(supplier); setOpenMenuId(null); }}>
                        📄 View Documents
                      </button>
                      <div className="divider" />
                      <button className="danger" onClick={(e) => { e.stopPropagation(); onDeleteSupplier(supplier.id); setOpenMenuId(null); }}>
                        🗑️ Delete Supplier
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredSuppliers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-500)' }}>
          {searchTerm ? `No suppliers found matching "${searchTerm}"` : 'No suppliers added yet. Click "Add Supplier" to get started.'}
        </div>
      )}

      {/* Add/Edit Supplier Form */}
      {showAddForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3>{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h3>
            <form onSubmit={handleFormSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label>Supplier Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label>Supplier Code</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="e.g., ACME"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label>Contact Person</label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, contactEmail: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label>Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  rows="2"
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label>Default Terms</label>
                  <select
                    value={formData.defaultTerms}
                    onChange={(e) => setFormData(prev => ({ ...prev, defaultTerms: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  >
                    <option value="">Select...</option>
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="EXW">EXW</option>
                    <option value="DDP">DDP</option>
                  </select>
                </div>
                <div>
                  <label>Payment Terms</label>
                  <input
                    type="text"
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData(prev => ({ ...prev, paymentTerms: e.target.value }))}
                    placeholder="e.g., Net 30"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label>Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="CNY">CNY</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Active Supplier
                </label>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows="3"
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => confirmCloseSupplier(() => {
                    setShowAddForm(false);
                    setEditingSupplier(null);
                    setFormData({
                      name: '', code: '', contactEmail: '', contactPhone: '', contactPerson: '',
                      address: '', country: '', defaultTerms: '', paymentTerms: '', currency: 'USD',
                      importFormats: [ImportFormat.EXCEL], documentFormats: [DocumentType.SHIPPING_SCHEDULE],
                      isActive: true, notes: ''
                    });
                  })}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingSupplier ? 'Update Supplier' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Schedule Dialog */}
      {showImportDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            maxWidth: '800px',
            width: '90%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '2rem 2rem 1rem 2rem',
              borderBottom: '2px solid #e2e8f0',
              flexShrink: 0
            }}>
              <div>
                <h3 style={{ margin: 0, color: '#2d3748' }}>Upload Schedule Documents</h3>
                {selectedSupplier && (
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9em', color: '#4a5568' }}>
                    📋 Uploading for: <strong>{selectedSupplier.getDisplayName ? selectedSupplier.getDisplayName() : selectedSupplier.name}</strong>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '2em' }}>📁</div>
                <button
                  onClick={() => {
                    setShowImportDialog(false);
                    setImportFile(null);
                    setImportPreview([]);
                    setDocumentFiles([]);
                    setSelectedSupplier(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#718096',
                    padding: '0.5rem',
                    borderRadius: '6px'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f7fafc'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  title="Close dialog"
                >
                  ✕
                </button>
                {/* Close button added */}
              </div>
            </div>
            
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '0 2rem',
              maxHeight: 'calc(90vh - 200px)'
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <label>Select Supplier *</label>
              <select
                value={selectedSupplier?.id || ''}
                onChange={(e) => {
                  const supplier = suppliers.find(s => s.id === e.target.value);
                  setSelectedSupplier(supplier);
                }}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              >
                <option value="">Choose supplier...</option>
                {suppliers.filter(s => s.isActive !== false).map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.getDisplayName ? supplier.getDisplayName() : supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label>Upload Schedule File *</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) handleFileUpload(file, 'schedule');
                }}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
              <small style={{ color: '#718096' }}>Supported formats: Excel (.xlsx, .xls), CSV, PDF</small>
            </div>

            {/* File Info */}
            {importFile && (
              <div style={{ marginBottom: '1rem' }}>
                <label>Selected File:</label>
                <div style={{ 
                  padding: '0.75rem', 
                  backgroundColor: '#f7fafc', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '1.5em' }}>
                    {importFile.name.toLowerCase().includes('pdf') ? '📄' : 
                     importFile.name.toLowerCase().match(/\.(xlsx|xls)$/) ? '📊' :
                     importFile.name.toLowerCase().includes('csv') ? '📋' : '📎'}
                  </span>
                  <div>
                    <div style={{ fontWeight: '500', color: '#2d3748' }}>{importFile.name}</div>
                    <div style={{ fontSize: '0.85em', color: '#718096' }}>
                      {(importFile.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label>Upload Supporting Documents (optional)</label>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx,.xls"
                onChange={(e) => {
                  Array.from(e.target.files).forEach(file => handleFileUpload(file, 'document'));
                }}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
              <small style={{ color: '#718096', display: 'block', marginTop: '4px' }}>
                Supported: PDF, Images (JPG, PNG), Word docs, Excel files
              </small>
              
              {documentFiles.length > 0 && (
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '1rem', 
                  backgroundColor: '#f7fafc', 
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '0.9em', color: '#2d3748' }}>
                      Supporting Documents ({documentFiles.length})
                    </strong>
                    <button
                      type="button"
                      onClick={() => setDocumentFiles([])}
                      style={{ 
                        color: '#e53e3e', 
                        backgroundColor: 'transparent', 
                        border: 'none', 
                        cursor: 'pointer',
                        fontSize: '0.8em'
                      }}
                      title="Clear all documents"
                    >
                      Clear All
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {documentFiles.map((file, index) => (
                      <div key={index} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: '0.5rem',
                        backgroundColor: 'white',
                        borderRadius: '4px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.2em' }}>
                            {file.type.startsWith('image/') ? '🖼️' : 
                             file.type.includes('pdf') ? '📄' : 
                             file.type.includes('sheet') || file.name.includes('.xlsx') || file.name.includes('.xls') ? '📊' :
                             file.type.includes('document') ? '📝' : '📎'}
                          </span>
                          <div>
                            <div style={{ fontSize: '0.9em', fontWeight: '500' }}>{file.name}</div>
                            <div style={{ fontSize: '0.8em', color: '#718096' }}>
                              {(file.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDocumentFiles(prev => prev.filter((_, i) => i !== index));
                          }}
                          style={{ 
                            color: '#e53e3e', 
                            backgroundColor: 'transparent', 
                            border: 'none', 
                            cursor: 'pointer',
                            padding: '0.25rem'
                          }}
                          title="Remove document"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            </div>
            
            <div style={{ 
              padding: '1rem 2rem 2rem 2rem',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f7fafc',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {documentFiles.length > 0 && selectedSupplier && (
                    <>
                      <button
                        onClick={saveDocumentsOnly}
                        className="btn btn-info"
                        title="Save documents without importing Excel schedule"
                      >
                        Save Documents
                      </button>
                      <button
                        onClick={saveDocumentsAndClose}
                        className="btn btn-success"
                        title="Save documents and close dialog"
                      >
                        Save & Close
                      </button>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={() => {
                      setShowImportDialog(false);
                      setImportFile(null);
                      setImportPreview([]);
                      setDocumentFiles([]);
                      setSelectedSupplier(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={processImport}
                    className="btn btn-primary"
                    disabled={!selectedSupplier || !importFile}
                    title="Upload schedule file and supporting documents"
                  >
                    Upload Documents
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Documents Dialog */}
      {showDocumentsDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '700px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid #e2e8f0'
            }}>
              <div>
                <h3 style={{ margin: 0, color: '#2d3748' }}>Supplier Documents</h3>
                {selectedSupplierDocs && (
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9em', color: '#4a5568' }}>
                    📄 Documents for: <strong>{selectedSupplierDocs.getDisplayName ? selectedSupplierDocs.getDisplayName() : selectedSupplierDocs.name}</strong>
                  </p>
                )}
              </div>
              <div style={{ fontSize: '2em' }}>📁</div>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '0 2rem', marginBottom: '1rem' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search documents by name or type (pdf, excel, image, word, csv)..."
                  aria-label="Search supplier documents"
                  value={documentSearchTerm}
                  onChange={(e) => setDocumentSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 2.5rem',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    outline: 'none',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3182ce'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
                <div style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '1.2em',
                  color: '#9ca3af'
                }}>
                  🔍
                </div>
                {documentSearchTerm && (
                  <button
                    onClick={() => setDocumentSearchTerm('')}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.2em',
                      color: '#9ca3af'
                    }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              {documentSearchTerm && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85em', color: '#4a5568' }}>
                  {filteredDocuments.length} of {supplierDocuments.length} documents found
                </div>
              )}
              {supplierDocuments.length > 0 && !documentSearchTerm && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85em', color: '#4a5568' }}>
                  Total: {supplierDocuments.length} documents
                </div>
              )}
            </div>

            <div style={{ padding: '0 2rem', flex: 1, overflowY: 'auto' }}>
              {supplierDocuments.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '3rem', 
                color: '#718096',
                backgroundColor: '#f7fafc',
                borderRadius: '8px',
                border: '2px dashed #e2e8f0'
              }}>
                <div style={{ fontSize: '3em', marginBottom: '1rem' }}>📂</div>
                <h4>No Documents Found</h4>
                <p>This supplier doesn't have any uploaded documents yet.</p>
                <p style={{ fontSize: '0.9em' }}>
                  Documents will appear here after importing schedules with supporting files.
                </p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '2rem', 
                color: '#718096',
                backgroundColor: '#f7fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ fontSize: '2em', marginBottom: '1rem' }}>🔍</div>
                <h4>No Documents Match Your Search</h4>
                <p>Try searching for:</p>
                <div style={{ fontSize: '0.9em', marginTop: '0.5rem', lineHeight: '1.4' }}>
                  • File name (e.g., "schedule", "invoice")<br/>
                  • File type (e.g., "pdf", "excel", "image", "word", "csv")
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {filteredDocuments.map((doc, index) => (
                  <div key={index} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '1rem',
                    backgroundColor: '#f7fafc',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    transition: 'all 0.2s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '2em' }}>
                        {doc.filename.toLowerCase().includes('pdf') ? '📄' : 
                         doc.filename.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? '🖼️' : 
                         doc.filename.toLowerCase().match(/\.(xlsx|xls)$/) ? '📊' :
                         doc.filename.toLowerCase().match(/\.(doc|docx)$/) ? '📝' : '📎'}
                      </span>
                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: '500', color: '#2d3748', marginBottom: '0.25rem' }}>
                          {doc.filename}
                        </div>
                        <div style={{ fontSize: '0.85em', color: '#718096', display: 'flex', gap: '1rem' }}>
                          <span>{(doc.size / 1024).toFixed(1)} KB</span>
                          <span>Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadDocument(doc);
                        }}
                        style={{ 
                          padding: '0.5rem 1rem', 
                          backgroundColor: '#3182ce', 
                          color: 'white', 
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.9em',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                        title="Download document"
                      >
                        Download ↓
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameDocument(doc);
                        }}
                        style={{ 
                          padding: '0.5rem', 
                          backgroundColor: '#38a169', 
                          color: 'white', 
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '1em'
                        }}
                        title="Rename document"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(doc);
                        }}
                        style={{ 
                          padding: '0.5rem', 
                          backgroundColor: '#e53e3e', 
                          color: 'white', 
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '1em'
                        }}
                        title="Delete document"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 2rem' }}>
              <button
                onClick={() => {
                  setShowDocumentsDialog(false);
                  setSelectedSupplierDocs(null);
                  setSupplierDocuments([]);
                  setDocumentSearchTerm('');
                }}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ fontSize: '2.5em', color: '#e53e3e' }}>⚠️</div>
              <div>
                <h3 style={{ margin: 0, color: '#2d3748' }}>Delete Document</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9em', color: '#4a5568' }}>
                  This action cannot be undone
                </p>
              </div>
            </div>
            
            <p style={{ marginBottom: '1.5rem', color: '#4a5568', lineHeight: '1.5' }}>
              Are you sure you want to delete <strong>"{documentToDelete?.filename}"</strong>?
              <br />This will permanently remove the file from the server.
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelDeleteDocument}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#e2e8f0',
                  color: '#4a5568',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteDocument}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#e53e3e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Delete Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Document Dialog */}
      {showRenameDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '2.5em', color: '#38a169' }}>✏️</div>
              <div>
                <h3 style={{ margin: 0, color: '#2d3748' }}>Rename Document</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9em', color: '#4a5568' }}>
                  Enter a new name for the document
                </p>
              </div>
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '500', 
                color: '#2d3748' 
              }}>
                Document Name:
              </label>
              <input
                type="text"
                value={newDocumentName}
                onChange={(e) => {
                  // Remove invalid filename characters as user types
                  const cleanValue = e.target.value.replace(/[<>:"/\\|?*]/g, '');
                  setNewDocumentName(cleanValue);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#38a169'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newDocumentName.trim()) {
                    confirmRenameDocument();
                  }
                  if (e.key === 'Escape') {
                    cancelRenameDocument();
                  }
                }}
                autoFocus
              />
              <small style={{ color: '#718096', display: 'block', marginTop: '0.5rem' }}>
                Press Enter to save, Escape to cancel<br/>
                Invalid characters (&lt; &gt; : " / \ | ? *) will be automatically removed
              </small>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelRenameDocument}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#e2e8f0',
                  color: '#4a5568',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRenameDocument}
                disabled={!newDocumentName.trim() || newDocumentName === documentToRename?.filename}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: !newDocumentName.trim() || newDocumentName === documentToRename?.filename ? '#9ca3af' : '#38a169',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: !newDocumentName.trim() || newDocumentName === documentToRename?.filename ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Rename Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Detail Dialog */}
      {showSupplierDetail && detailSupplier && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '2rem',
            width: '90%',
            maxWidth: '1000px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem' }}>
              <h2 style={{ margin: 0, color: '#2d3748', fontSize: '1.5rem' }}>
                📊 {detailSupplier.name} - Incoming Shipments
                {detailSupplier.code && <span style={{ fontSize: '1rem', color: '#718096', fontWeight: 'normal' }}> ({detailSupplier.code})</span>}
              </h2>
              <button
                onClick={() => {
                  setShowSupplierDetail(false);
                  setDetailSupplier(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#718096',
                  padding: '0.5rem',
                  borderRadius: '6px'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f7fafc'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                ✕
              </button>
            </div>

            {/* Supplier Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem', padding: '1rem', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
              {detailSupplier.contactPerson && (
                <div><strong>Contact:</strong> {detailSupplier.contactPerson}</div>
              )}
              {detailSupplier.contactEmail && (
                <div><strong>Email:</strong> {detailSupplier.contactEmail}</div>
              )}
              {detailSupplier.country && (
                <div><strong>Country:</strong> {detailSupplier.country}</div>
              )}
              {detailSupplier.defaultTerms && (
                <div><strong>Terms:</strong> {detailSupplier.defaultTerms}</div>
              )}
            </div>

            {/* Shipments Table */}
            {(() => {
              const supplierShipments = getSupplierShipments(detailSupplier);
              
              if (supplierShipments.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#718096', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
                    <h3 style={{ margin: '0 0 1rem 0' }}>No Incoming Shipments</h3>
                    <p>No shipments found for this supplier. Upload a shipment schedule to see incoming deliveries.</p>
                  </div>
                );
              }

              return (
                <div>
                  <h3 style={{ marginBottom: '1rem', color: '#2d3748' }}>
                    📋 Incoming Shipments ({supplierShipments.length})
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', borderBottom: '2px solid #cbd5e0' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Order Ref</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Product</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Week #</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>Qty</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>Pallet Qty</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Final POD</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplierShipments.map((shipment, index) => (
                          <tr key={shipment.id || index} style={{ 
                            borderBottom: '1px solid #e2e8f0',
                            backgroundColor: index % 2 === 0 ? 'white' : 'var(--surface-2)'
                          }}>
                            <td style={{ padding: '0.75rem', fontWeight: '500' }}>
                              <span
                                onClick={() => setDetailShipment(shipment)}
                                style={{ color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dashed var(--accent)' }}
                                title="View order details"
                              >
                                {shipment.orderRef}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem' }}>{shipment.productName}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <span style={{ 
                                padding: '0.25rem 0.5rem', 
                                backgroundColor: '#3182ce', 
                                color: 'white', 
                                borderRadius: '4px', 
                                fontSize: '0.8rem' 
                              }}>
                                W{shipment.weekNumber}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>
                              {Number(shipment.quantity).toLocaleString()}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>
                              {Math.round(Number(shipment.palletQty || 0)) || 1}
                            </td>
                            <td style={{ padding: '0.75rem' }}>{shipment.finalPod}</td>
                            <td style={{ padding: '0.75rem' }}>
                              <span style={{ 
                                padding: '0.25rem 0.5rem', 
                                backgroundColor: getStatusColor(shipment.latestStatus), 
                                color: 'white', 
                                borderRadius: '4px', 
                                fontSize: '0.8rem' 
                              }}>
                                {shipment.latestStatus || 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '2rem', padding: '1rem', backgroundColor: '#f0f4f8', borderRadius: '8px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3182ce' }}>
                        {supplierShipments.length}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#718096' }}>Total Shipments</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#38a169' }}>
                        {supplierShipments.reduce((sum, s) => sum + Number(s.quantity || 0), 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#718096' }}>Total Quantity</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#d69e2e' }}>
                        {Math.round(supplierShipments.reduce((sum, s) => sum + Number(s.palletQty || 0), 0))}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#718096' }}>Total Pallets</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Charts Section */}
            {(() => {
              const supplierShipments = getSupplierShipments(detailSupplier);
              return (
                <SupplierCharts
                  shipments={supplierShipments}
                  supplierName={detailSupplier.name}
                />
              );
            })()}

            {/* Archived Cost Estimates Section */}
            <div style={{ marginTop: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', color: '#2d3748', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                📁 Archived Cost Estimates ({archivedEstimates.length})
              </h3>

              {loadingArchived ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
                  Loading archived estimates...
                </div>
              ) : archivedEstimates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#718096', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                  <p>No archived cost estimates for this supplier.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#718096', color: 'white' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Reference</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Products</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Container</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>Total Cost</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>Cost/KG</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedEstimates.map((est, index) => (
                        <tr key={est.id} style={{
                          borderBottom: '1px solid #e2e8f0',
                          backgroundColor: index % 2 === 0 ? 'white' : 'var(--surface-2)'
                        }}>
                          <td style={{ padding: '0.75rem', fontWeight: '500' }}>
                            {est.reference_number || '-'}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            {(est.products || []).map(p => p.name).filter(Boolean).join(', ') || '-'}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            {est.container_type || '-'}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500', color: '#2d3748' }}>
                            {formatCurrency(est.total_in_warehouse_cost_zar)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#718096' }}>
                            {formatCurrency(est.all_in_warehouse_cost_per_kg_zar)}/kg
                          </td>
                          <td style={{ padding: '0.75rem', color: '#718096' }}>
                            {est.costing_date ? new Date(est.costing_date).toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Close Button */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
              <button
                onClick={() => {
                  setShowSupplierDetail(false);
                  setDetailSupplier(null);
                }}
                style={{
                  padding: '0.75rem 2rem',
                  backgroundColor: '#3182ce',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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
                {detailShipment.orderRef}
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
              const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
              const rows = [
                ['Supplier', s.supplier],
                ['Product', s.productName],
                ['Quantity', s.quantity != null ? Number(s.quantity).toLocaleString() : '-'],
                ['Pallets', s.palletQty ? (Math.round(Number(s.palletQty)) || 1) : '-'],
                ['CBM', s.cbm || '-'],
                ['Week', s.weekNumber ? `Week ${s.weekNumber}` : '-'],
                ['Status', (s.latestStatus || '').replace(/_/g, ' ') || '-'],
                ['Final POD', s.finalPod || '-'],
                ['Warehouse', s.receivingWarehouse || '-'],
                ['Freight Type', s.freightType || '-'],
                ['Incoterm', s.incoterm || '-'],
                ['Forwarding Agent', s.forwardingAgent || '-'],
                ['Vessel', s.vesselName || '-'],
                ['Created', fmt(s.createdAt)],
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

// Helper function to get status color
function getStatusColor(status) {
  const statusColors = {
    'shipped': '#38a169',
    'delivered': '#3182ce', 
    'pending': '#d69e2e',
    'cancelled': '#e53e3e',
    'in-transit': '#805ad5',
    'delayed_port': '#dc3545',
    'delayed_customs': '#c62828',
    'delayed_documents': '#e65100',
    'delayed_supplier': '#d32f2f'
  };
  
  const statusLower = (status || '').toLowerCase();
  return statusColors[statusLower] || '#718096';
}

export default SupplierManagement;