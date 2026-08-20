import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShipmentStatus } from '../types/shipment';
import { authFetch } from '../utils/authFetch';
import { getApiUrl } from '../config/api';
import { useNotification } from '../contexts/NotificationContext';
import FilterPresetBar from './FilterPresetBar';
import ShipmentTimeline from './ShipmentTimeline';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
applyPlugin(jsPDF);
import * as XLSX from 'xlsx';

const getWarehouseName = (shipment) => {
  if ((shipment.receivingWarehouse || '').toUpperCase() === 'OFFSITE') return 'OFFSITE';
  if (shipment.latestStatus === 'arrived_offsite') return 'OFFSITE';
  return shipment.receivingWarehouse || 'Unassigned';
};

const isOffsiteShipment = (shipment) => getWarehouseName(shipment).toUpperCase() === 'OFFSITE';

function WarehouseStored({ shipments, onUpdateShipment, onDeleteShipment, onCreateShipment, loading }) {
  const { showSuccess, showError, confirm: confirmAction } = useNotification();
  const [searchParamsObj, setSearchParamsObj] = useSearchParams();
  const globalSearchTerm = searchParamsObj.get('search') || '';
  const [searchTerm, setSearchTerm] = useState(globalSearchTerm || '');
  const [weekFilters, setWeekFilters] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'storedDate', direction: 'desc' });
  const [showWeekDropdown, setShowWeekDropdown] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [collapsedWarehouses, setCollapsedWarehouses] = useState({});
  const [editingDate, setEditingDate] = useState(null);
  const [moveModal, setMoveModal] = useState(null);
  const [soldModal, setSoldModal] = useState(null);
  const [editingDateValue, setEditingDateValue] = useState('');
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [editShipment, setEditShipment] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [bulkSelectedIds, setBulkSelectedIds] = useState(new Set());
  const [bulkSelectAll, setBulkSelectAll] = useState(false);
  const [storageRates, setStorageRates] = useState({ week1: 43, week2Plus: 53 });

  // Mobile responsiveness
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync global search term from URL
  useEffect(() => {
    if (globalSearchTerm) {
      setSearchTerm(globalSearchTerm);
      const params = new URLSearchParams(searchParamsObj);
      params.delete('search');
      setSearchParamsObj(params, { replace: true });
    }
  }, [globalSearchTerm]);

  // Fetch storage benchmark rates
  useEffect(() => {
    const fetchStorageRates = async () => {
      try {
        const res = await authFetch(getApiUrl('/api/bol-audit/clearing-benchmarks'));
        if (!res.ok) return;
        const json = await res.json();
        const benchmarks = json.data || json;
        const w1 = benchmarks.find(b => /STORAGE.*PALLET.*WEEK\s*1\b/i.test(b.description));
        const w2 = benchmarks.find(b => /STORAGE.*PALLET.*WEEK\s*2/i.test(b.description));
        if (w1 || w2) {
          setStorageRates({
            week1: w1 ? parseFloat(w1.unit_rate_zar) : 43,
            week2Plus: w2 ? parseFloat(w2.unit_rate_zar) : 53,
          });
        }
      } catch {
        // keep defaults
      }
    };
    fetchStorageRates();
  }, []);

  const ninetyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
  }, []);

  const filteredAndSortedShipments = useMemo(() => {
    let filtered = shipments.filter(shipment => {
      const hasSearch = searchTerm.trim() !== '';
      const isOffsite = isOffsiteShipment(shipment);

      // 90-day filter (unless Show All toggled)
      if (!showAll && !hasSearch && !isOffsite) {
        const storedDate = new Date(shipment.receivingDate || shipment.updatedAt || shipment.createdAt);
        if (storedDate < ninetyDaysAgo) return false;
      }

      const matchesSearch = searchTerm === '' ||
        shipment.orderRef?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shipment.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shipment.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shipment.receivingWarehouse?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shipment.finalPod?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesWeek = weekFilters.length === 0 || weekFilters.includes(shipment.weekNumber);

      return matchesSearch && matchesWeek;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === 'storedDate') {
          aValue = new Date(a.receivingDate || a.updatedAt || a.estimatedArrival);
          bValue = new Date(b.receivingDate || b.updatedAt || b.estimatedArrival);
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [shipments, searchTerm, weekFilters, sortConfig, showAll, ninetyDaysAgo]);

  // Group filtered shipments by warehouse
  const groupedByWarehouse = useMemo(() => {
    const groups = {};
    for (const s of filteredAndSortedShipments) {
      const wh = getWarehouseName(s);
      if (!groups[wh]) groups[wh] = [];
      groups[wh].push(s);
    }
    // Sort warehouse keys: named warehouses first, Unassigned last
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
    return keys.map(k => ({ name: k, shipments: groups[k] }));
  }, [filteredAndSortedShipments]);


  // Average qty & pallets stored per warehouse per month (based on full history, not the 90-day/search filter)
  const monthlyWarehouseAverages = useMemo(() => {
    const byWarehouse = {};
    for (const s of shipments) {
      const dateVal = s.receivingDate || s.updatedAt || s.createdAt;
      if (!dateVal) continue;
      const d = new Date(dateVal);
      if (isNaN(d)) continue;
      const wh = getWarehouseName(s);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!byWarehouse[wh]) byWarehouse[wh] = {};
      if (!byWarehouse[wh][monthKey]) byWarehouse[wh][monthKey] = { qty: 0, pallets: 0 };
      byWarehouse[wh][monthKey].qty += Number(s.quantity) || 0;
      byWarehouse[wh][monthKey].pallets += Number(s.palletQty) || 0;
    }

    return Object.entries(byWarehouse).map(([name, months]) => {
      const monthKeys = Object.keys(months);
      const monthCount = monthKeys.length || 1;
      const totalQty = monthKeys.reduce((sum, m) => sum + months[m].qty, 0);
      const totalPallets = monthKeys.reduce((sum, m) => sum + months[m].pallets, 0);
      return {
        name,
        avgQty: Math.round(totalQty / monthCount),
        avgPallets: Math.round(totalPallets / monthCount),
        monthCount: monthKeys.length,
      };
    }).sort((a, b) => {
      if (a.name === 'Unassigned') return 1;
      if (b.name === 'Unassigned') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [shipments]);
  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleWeekFilter = (week) => {
    setWeekFilters(prev =>
      prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week]
    );
  };

  const availableWeeks = useMemo(() => {
    return [...new Set(shipments.map(s => s.weekNumber))].filter(Boolean).sort((a, b) => parseInt(a) - parseInt(b));
  }, [shipments]);

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) return '';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const olderCount = useMemo(() => {
    return shipments.filter(s => {
      if (isOffsiteShipment(s)) return false;
      const storedDate = new Date(s.receivingDate || s.updatedAt || s.createdAt);
      return storedDate < ninetyDaysAgo;
    }).length;
  }, [shipments, ninetyDaysAgo]);

  const toggleWarehouse = (name) => {
    setCollapsedWarehouses(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const openMoveModal = (shipment) => {
    setMoveModal({
      shipment,
      destination: '',
      moveQty: shipment.quantity || 0,
      movePallets: Math.round(shipment.palletQty) || 1,
    });
  };

  const handleMoveSubmit = async () => {
    if (!moveModal || !moveModal.destination) return;
    const { shipment, destination, moveQty, movePallets } = moveModal;
    const totalQty = shipment.quantity || 0;
    const totalPallets = Math.round(shipment.palletQty) || 1;
    const isFullMove = moveQty >= totalQty && movePallets >= totalPallets;

    try {
      // Atomic backend split — reduces source and creates destination record
      // in one transaction. Replaces the old two-step update-then-create flow
      // that left stock "lost" when the create failed on duplicate order_ref.
      const response = await authFetch(getApiUrl(`/api/shipments/${shipment.id}/split`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, moveQty, movePallets }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to move stock');
      }

      if (isFullMove) {
        showSuccess(`Moved all stock to ${destination}`);
      } else {
        showSuccess(`Moved ${moveQty} qty / ${movePallets} pallets to ${destination}`);
      }
    } catch (err) {
      showError('Failed to move stock');
    }
    setMoveModal(null);
  };

  const openSoldModal = (shipment) => {
    setSoldModal({
      shipment,
      soldQty: shipment.quantity || 0,
      soldPallets: Math.round(shipment.palletQty) || 1,
      notes: '',
      asoNumber: '',
    });
  };

  const handleSoldSubmit = async () => {
    if (!soldModal) return;
    const { shipment, soldQty, soldPallets, notes, asoNumber } = soldModal;

    try {
      const response = await authFetch(getApiUrl(`/api/shipments/${shipment.id}/sell`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soldQty, soldPallets, notes, asoNumber }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to mark stock as sold');
      }

      showSuccess(`Marked ${soldQty} qty / ${soldPallets} pallets as sold`);
    } catch (err) {
      showError('Failed to mark stock as sold');
    }
    setSoldModal(null);
  };

  const openEditModal = (shipment) => {
    setEditShipment(shipment);
    setEditForm({
      orderRef: shipment.orderRef || '',
      supplier: shipment.supplier || '',
      productName: shipment.productName || '',
      quantity: shipment.quantity || '',
      palletQty: shipment.palletQty || '',
      cbm: shipment.cbm || '',
      weekNumber: shipment.weekNumber || '',
      receivingWarehouse: shipment.receivingWarehouse || '',
      finalPod: shipment.finalPod || '',
      freightType: shipment.freightType || '',
      receivingDate: shipment.receivingDate ? new Date(shipment.receivingDate).toISOString().split('T')[0] : '',
    });
  };

  const handleEditSave = async () => {
    if (!editShipment) return;
    try {
      const updates = {};
      if (editForm.orderRef !== (editShipment.orderRef || '')) updates.orderRef = editForm.orderRef;
      if (editForm.supplier !== (editShipment.supplier || '')) updates.supplier = editForm.supplier;
      if (editForm.productName !== (editShipment.productName || '')) updates.productName = editForm.productName;
      if (editForm.quantity !== (editShipment.quantity || '')) updates.quantity = editForm.quantity;
      if (editForm.palletQty !== (editShipment.palletQty || '')) updates.palletQty = editForm.palletQty;
      if (editForm.cbm !== (editShipment.cbm || '')) updates.cbm = editForm.cbm;
      if (editForm.weekNumber !== (editShipment.weekNumber || '')) updates.weekNumber = editForm.weekNumber;
      if (editForm.receivingWarehouse !== (editShipment.receivingWarehouse || '')) updates.receivingWarehouse = editForm.receivingWarehouse;
      if (editForm.finalPod !== (editShipment.finalPod || '')) updates.finalPod = editForm.finalPod;
      if (editForm.freightType !== (editShipment.freightType || '')) updates.freightType = editForm.freightType;
      if (editForm.receivingDate !== (editShipment.receivingDate ? new Date(editShipment.receivingDate).toISOString().split('T')[0] : '')) updates.receivingDate = editForm.receivingDate;

      if (Object.keys(updates).length === 0) {
        setEditShipment(null);
        return;
      }
      await onUpdateShipment(editShipment.id, updates);
      if (showSuccess) showSuccess('Shipment updated successfully');
      setEditShipment(null);
    } catch (err) {
      if (showError) showError('Failed to update shipment');
    }
  };

  const handleStoredDateChange = async (shipmentId, newDate) => {
    setEditingDate(null);
    if (!newDate) return;
    try {
      await onUpdateShipment(shipmentId, { receivingDate: newDate });
      if (showSuccess) showSuccess('Stored date updated');
    } catch (err) {
      if (showError) showError('Failed to update stored date');
    }
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const totalQty = filteredAndSortedShipments.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    const pallets = Math.round(filteredAndSortedShipments.reduce((sum, s) => sum + (Number(s.palletQty) || 0), 0));
    const summaryData = [
      ['Stored Stock Report'],
      ['Generated:', new Date().toLocaleString()],
      [],
      ['Search Filter:', searchTerm || 'None'],
      ['Week Filter:', weekFilters.length > 0 ? weekFilters.map(w => `Week ${w}`).join(', ') : 'All'],
      [],
      ['Summary:'],
      ['Total Items:', filteredAndSortedShipments.length],
      ['Warehouses:', groupedByWarehouse.length],
      ['Total Quantity:', totalQty],
      ['Total Pallets:', pallets]
    ];
    const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWS, 'Summary');

    // Shipments Sheet
    const dataRows = filteredAndSortedShipments.map(s => ({
      'Order Ref': s.orderRef || '',
      'Supplier': s.supplier || '',
      'Product': s.productName || '',
      'Quantity': s.quantity || 0,
      'Pallet Qty': Math.round(s.palletQty || 0),
      'CBM': s.cbm || 0,
      'Week': s.weekNumber || '',
      'Warehouse': getWarehouseName(s),
      'Final POD': s.finalPod || '',
      'Stored Date': formatDate(s.receivingDate || s.updatedAt || s.estimatedArrival),
      'Days in Storage': isOffsiteShipment(s) ? getDaysInStorage(s) : '-',
      'Storage Cost (ZAR)': isOffsiteShipment(s) ? getStorageCost(s) : '-'
    }));
    // Add total storage cost row
    const totalStorageCost = filteredAndSortedShipments
      .filter(s => isOffsiteShipment(s))
      .reduce((sum, s) => sum + getStorageCost(s), 0);
    dataRows.push({
      'Order Ref': '',
      'Supplier': '',
      'Product': '',
      'Quantity': '',
      'Pallet Qty': '',
      'CBM': '',
      'Week': '',
      'Warehouse': '',
      'Final POD': '',
      'Stored Date': '',
      'Days in Storage': 'TOTAL',
      'Storage Cost (ZAR)': totalStorageCost
    });
    const dataWS = XLSX.utils.json_to_sheet(dataRows);
    XLSX.utils.book_append_sheet(wb, dataWS, 'Stored Stock');

    // Per-Warehouse Sheet
    const whRows = groupedByWarehouse.map(({ name, shipments: wh }) => ({
      'Warehouse': name,
      'Items': wh.length,
      'Total Quantity': wh.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0),
      'Total Pallets': Math.round(wh.reduce((sum, s) => sum + (Number(s.palletQty) || 0), 0)),
      'Total Items': wh.length
    }));
    const whWS = XLSX.utils.json_to_sheet(whRows);
    XLSX.utils.book_append_sheet(wb, whWS, 'Warehouse Breakdown');

    XLSX.writeFile(wb, `stored_stock_report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Title
    doc.setFontSize(18);
    doc.text('Stored Stock Report', pageWidth / 2, 20, { align: 'center' });

    // Filters
    doc.setFontSize(10);
    let yPos = 35;
    if (searchTerm) {
      doc.text(`Search: ${searchTerm}`, 20, yPos);
      yPos += 5;
    }
    if (weekFilters.length > 0) {
      doc.text(`Week Filter: ${weekFilters.map(w => `Week ${w}`).join(', ')}`, 20, yPos);
      yPos += 5;
    }
    yPos += 3;

    // Summary
    const totalQty = filteredAndSortedShipments.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    const pallets = Math.round(filteredAndSortedShipments.reduce((sum, s) => sum + (Number(s.palletQty) || 0), 0));
    doc.setFontSize(12);
    doc.text('Summary:', 20, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.text(`Total Items: ${filteredAndSortedShipments.length}`, 25, yPos);
    yPos += 5;
    doc.text(`Warehouses: ${groupedByWarehouse.length}`, 25, yPos);
    yPos += 5;
    doc.text(`Total Quantity: ${totalQty.toLocaleString()}`, 25, yPos);
    yPos += 5;
    doc.text(`Total Pallets: ${pallets.toLocaleString()}`, 25, yPos);
    yPos += 10;

    // Stock table
    doc.autoTable({
      startY: yPos,
      head: [['Order Ref', 'Supplier', 'Product', 'Qty', 'Pallets', 'Warehouse', 'Stored Date', 'Days', 'Cost (ZAR)']],
      body: [
        ...filteredAndSortedShipments.map(s => {
          const isOffsite = isOffsiteShipment(s);
          return [
            s.orderRef || '',
            s.supplier || '',
            s.productName || '',
            s.quantity || 0,
            Math.round(s.palletQty || 0) || 1,
            getWarehouseName(s),
            formatDate(s.receivingDate || s.updatedAt || s.estimatedArrival),
            isOffsite ? getDaysInStorage(s) : '-',
            isOffsite ? `R ${getStorageCost(s).toLocaleString()}` : '-'
          ];
        }),
        [
          { content: 'TOTAL', colSpan: 8, styles: { halign: 'right', fontStyle: 'bold' } },
          {
            content: `R ${filteredAndSortedShipments
              .filter(s => isOffsiteShipment(s))
              .reduce((sum, s) => sum + getStorageCost(s), 0)
              .toLocaleString()}`,
            styles: { fontStyle: 'bold' }
          }
        ]
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [5, 150, 105] }
    });

    // Warehouse breakdown table
    if (groupedByWarehouse.length > 0) {
      const afterStock = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text('Warehouse Breakdown', 20, afterStock);

      doc.autoTable({
        startY: afterStock + 5,
        head: [['Warehouse', 'Items', 'Quantity', 'Pallets']],
        body: groupedByWarehouse.map(({ name, shipments: wh }) => [
          name,
          wh.length,
          wh.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0),
          Math.round(wh.reduce((sum, s) => sum + (Number(s.palletQty) || 0), 0)),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [5, 150, 105] }
      });
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(
        `Generated: ${new Date().toLocaleString()} | Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    doc.save(`stored_stock_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const storedCurrentFilters = { searchTerm, weekFilters, sortConfig };

  const handleLoadPreset = (filters) => {
    if (filters.searchTerm !== undefined) setSearchTerm(filters.searchTerm);
    if (filters.weekFilters !== undefined) setWeekFilters(filters.weekFilters);
    if (filters.sortConfig !== undefined) setSortConfig(filters.sortConfig);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <div>Loading stored shipments...</div>
      </div>
    );
  }

  const totalPallets = Math.round(filteredAndSortedShipments.reduce((sum, s) => sum + (Number(s.palletQty) || 0), 0));

  const thStyle = {
    padding: '8px 12px',
    textAlign: 'left',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  };

  const columns = [
    { key: 'orderRef', label: 'Order Ref', width: '14%' },
    { key: 'supplier', label: 'Supplier', width: '16%' },
    { key: 'productName', label: 'Product', width: '19%' },
    { key: 'quantity', label: 'Qty', width: '7%' },
    { key: 'palletQty', label: 'Pallets', width: '7%' },
    { key: 'storedDate', label: 'Stored Date', width: '11%' },
    { key: 'daysInStorage', label: 'Days', width: '5%' },
    { key: 'storageCost', label: 'Storage Cost', width: '10%' },
    { key: null, label: '', width: '11%' },
  ];

  const getDaysInStorage = (shipment) => {
    const storedDate = shipment.receivingDate || shipment.updatedAt || shipment.estimatedArrival;
    if (!storedDate) return '-';
    const diff = Math.floor((new Date() - new Date(storedDate)) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : 0;
  };

  const getStorageCost = (shipment) => {
    const days = getDaysInStorage(shipment);
    if (typeof days !== 'number' || days === 0) return 0;
    const pallets = Math.round(shipment.palletQty) || 1;
    const totalWeeks = Math.ceil(days / 7);
    if (totalWeeks <= 1) return pallets * 1 * storageRates.week1;
    return pallets * (storageRates.week1 + (totalWeeks - 1) * storageRates.week2Plus);
  };

  return (
    <div className="window-content">
      <div className="brand-strip" />

      {/* Compact header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '0.75rem', paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-900)' }}>Stored Stock</h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-500)' }}>
            {filteredAndSortedShipments.length} items &middot; {groupedByWarehouse.length} warehouses &middot; {totalPallets} pallets
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            placeholder="Search..."
            aria-label="Search stored stock"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
              fontSize: 13, width: 200, background: 'var(--surface)'
            }}
          />
          {searchTerm.trim() && !showAll && (
            <span style={{ fontSize: 12, color: 'var(--text-500)' }}>
              searching all dates
            </span>
          )}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost"
              onClick={() => setShowWeekDropdown(!showWeekDropdown)}
              style={{ fontSize: 13, padding: '6px 10px' }}
            >
              Week {weekFilters.length > 0 ? `(${weekFilters.length})` : ''} <span style={{ fontSize: 10 }}>▼</span>
            </button>
            {showWeekDropdown && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, backgroundColor: 'white',
                border: '1px solid var(--border)', borderRadius: 6, marginTop: 4,
                maxHeight: 200, overflowY: 'auto', minWidth: 120, zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>
                {availableWeeks.map(week => (
                  <label key={week} style={{
                    display: 'block', padding: '6px 10px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)', fontSize: 13, userSelect: 'none'
                  }}>
                    <input
                      type="checkbox"
                      checked={weekFilters.includes(week)}
                      onChange={() => toggleWeekFilter(week)}
                      style={{ marginRight: 6 }}
                    />
                    Week {week}
                  </label>
                ))}
                {availableWeeks.length === 0 && (
                  <div style={{ padding: 10, color: 'var(--text-500)', textAlign: 'center', fontSize: 13 }}>
                    No weeks
                  </div>
                )}
                {weekFilters.length > 0 && (
                  <button
                    onClick={() => { setWeekFilters([]); setShowWeekDropdown(false); }}
                    style={{
                      display: 'block', width: '100%', padding: '6px 10px',
                      background: 'none', border: 'none', borderTop: '1px solid var(--border)',
                      color: 'var(--danger)', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', textAlign: 'center'
                    }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            className={`btn ${showAll ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowAll(!showAll)}
            style={{ fontSize: 13, padding: '6px 10px' }}
          >
            {showAll ? 'Show Recent (90 days)' : `Show All${olderCount > 0 ? ` (+${olderCount} older)` : ''}`}
          </button>
          <button className="btn btn-ghost" onClick={exportToExcel} style={{ fontSize: 13, padding: '6px 10px' }}>
            Export Excel
          </button>
          <button className="btn btn-ghost" onClick={exportToPDF} style={{ fontSize: 13, padding: '6px 10px' }}>
            Export PDF
          </button>
        </div>
      </div>

      {/* Average qty & pallets stored per warehouse per month */}
      {monthlyWarehouseAverages.length > 0 && (
        <div className="dash-panel" style={{ padding: '12px 16px', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Average Stored per Warehouse per Month
          </h3>
          <div className="stats-grid">
            {monthlyWarehouseAverages.map((wh, i) => {
              const rings = ['ring-info', 'ring-success', 'ring-warning', 'ring-danger'];
              return (
                <div key={wh.name} className={`stat-card ${rings[i % rings.length]}`}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                    {wh.avgQty.toLocaleString('en-ZA')} qty
                  </h3>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px', color: 'var(--text-700)' }}>
                    {wh.avgPallets.toLocaleString('en-ZA')} pallets
                  </p>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                    {wh.name} &middot; avg / month ({wh.monthCount} mo{wh.monthCount !== 1 ? 's' : ''})
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <FilterPresetBar
        viewName="warehouse-stored"
        currentFilters={storedCurrentFilters}
        onLoadPreset={handleLoadPreset}
      />

      {/* Bulk action toolbar */}
      {bulkSelectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
          background: 'var(--accent-100, #dbeafe)', borderRadius: '8px', marginBottom: '12px',
          border: '1px solid var(--accent, #3b82f6)'
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{bulkSelectedIds.size} selected</span>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            onClick={() => { setBulkSelectedIds(new Set()); setBulkSelectAll(false); }}
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Warehouse groups */}
      {filteredAndSortedShipments.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '2rem', color: 'var(--text-500)',
          backgroundColor: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)'
        }}>
          <h3 style={{ margin: '0 0 8px' }}>No stored shipments found</h3>
          <p style={{ margin: 0, fontSize: 14 }}>Shipments that have been received and stored will appear here grouped by warehouse.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {groupedByWarehouse.map(({ name, shipments: warehouseShipments }) => {
            const isCollapsed = collapsedWarehouses[name];
            const whPallets = Math.round(warehouseShipments.reduce((sum, s) => sum + (Number(s.palletQty) || 0), 0));
            const activeCount = warehouseShipments.length;

            return (
              <div key={name} className="dash-panel" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Warehouse header */}
                <button
                  onClick={() => toggleWarehouse(name)}
                  type="button"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 16px', background: 'var(--surface-2)', border: 'none',
                    borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                    transition: 'transform 0.2s', fontSize: 11, color: 'var(--text-500)'
                  }}>▶</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy-900)' }}>{name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-500)', fontWeight: 500 }}>
                    {warehouseShipments.length} item{warehouseShipments.length !== 1 ? 's' : ''}
                    {whPallets > 0 && <> &middot; {whPallets} pallets</>}
                    {name.toUpperCase() === 'OFFSITE' && (() => {
                      const totalCost = warehouseShipments.reduce((sum, s) => sum + getStorageCost(s), 0);
                      return totalCost > 0 ? <> &middot; <span style={{ fontWeight: 600, color: 'var(--navy-900)' }}>R{totalCost.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></> : null;
                    })()}
                  </span>
                </button>

                {/* Mobile card layout */}
                {!isCollapsed && isMobile && (
                  <div className="mobile-card-list" style={{ padding: '8px' }}>
                    {warehouseShipments.map((shipment) => {
                      const isArch = false; // all shipments are active (no archive workflow)
                      const isOffsite = name.toUpperCase() === 'OFFSITE';
                      return (
                        <div key={shipment.id} className="mobile-shipment-card">
                          <div className="card-header">
                            <span
                              className="order-ref"
                              onClick={() => setSelectedShipment(shipment)}
                              style={{ color: 'var(--accent)', cursor: 'pointer' }}
                            >
                              {shipment.orderRef}
                            </span>
                            {isArch && (
                              <span style={{
                                padding: '1px 5px', borderRadius: 4, fontSize: 10,
                                fontWeight: 600, background: 'var(--surface-2)', color: 'var(--text-500)'
                              }}>ARCHIVED</span>
                            )}
                          </div>
                          <dl className="card-details">
                            <dt>Supplier</dt><dd>{shipment.supplier || '-'}</dd>
                            <dt>Product</dt><dd>{shipment.productName || 'N/A'}</dd>
                            <dt>Quantity</dt><dd>{shipment.quantity || 'N/A'}</dd>
                            <dt>Pallets</dt><dd>{shipment.palletQty ? Math.round(shipment.palletQty) : '-'}</dd>
                            <dt>Stored</dt><dd>{formatDate(shipment.receivingDate || shipment.updatedAt || shipment.estimatedArrival)}</dd>
                            {isOffsite && (() => {
                              const days = getDaysInStorage(shipment);
                              const isLong = typeof days === 'number' && days > 30;
                              const cost = getStorageCost(shipment);
                              return (
                              <>
                                <dt>Days Stored</dt>
                                <dd style={{ fontWeight: 600, color: isLong ? 'var(--danger)' : 'var(--text-700)' }}>
                                  {days}{typeof days === 'number' ? 'd' : ''}
                                </dd>
                                <dt>Storage Cost</dt>
                                <dd style={{ fontWeight: 600, color: isLong ? 'var(--danger)' : 'var(--text-700)' }}>
                                  {cost > 0 ? `R${cost.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '-'}
                                </dd>
                              </>
                              );
                            })()}
                          </dl>
                          <div className="card-actions">
                            <button
                              className="btn btn-ghost"
                              onClick={() => openEditModal(shipment)}
                              style={{ fontSize: 12, padding: '6px 12px' }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={() => openMoveModal(shipment)}
                              style={{ fontSize: 12, padding: '6px 12px' }}
                            >
                              Move
                            </button>
                            {isOffsite && (
                              <button
                                className="btn btn-ghost"
                                onClick={() => openSoldModal(shipment)}
                                style={{ fontSize: 12, padding: '6px 12px' }}
                              >
                                Sold
                              </button>
                            )}
                            {!isArch && (
                              <button
                                className="btn btn-ghost"
                                onClick={() => onDeleteShipment(shipment.id)}
                                style={{ fontSize: 12, padding: '6px 12px' }}
                              >
                                Archive
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Desktop table layout */}
                {!isCollapsed && !isMobile && (() => {
                  const isOffsite = name.toUpperCase() === 'OFFSITE';
                  return (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, width: '36px', textAlign: 'center', cursor: 'default' }}>
                            <input type="checkbox"
                              checked={bulkSelectAll && warehouseShipments.every(s => bulkSelectedIds.has(s.id))}
                              onChange={(e) => {
                                const next = new Set(bulkSelectedIds);
                                if (e.target.checked) {
                                  warehouseShipments.forEach(s => next.add(s.id));
                                } else {
                                  warehouseShipments.forEach(s => next.delete(s.id));
                                }
                                setBulkSelectedIds(next);
                                setBulkSelectAll(next.size === filteredAndSortedShipments.length);
                              }}
                              title="Select all in this warehouse"
                            />
                          </th>
                          {columns.map((col, i) => (
                            <th
                              key={i}
                              onClick={col.key ? () => handleSort(col.key) : undefined}
                              style={{ ...thStyle, width: col.width, cursor: col.key ? 'pointer' : 'default' }}
                            >
                              {col.label}{col.key ? getSortIcon(col.key) : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {warehouseShipments.map((shipment) => (
                          <tr
                            key={shipment.id}
                            style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.15s' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-2)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ''}
                          >
                            {(() => {
                              const isArch = false; // all shipments are active (no archive workflow)
                              return (<>
                            <td style={{ width: 36, textAlign: 'center', padding: '8px 4px' }}>
                              {!isArch && (
                                <input type="checkbox"
                                  checked={bulkSelectedIds.has(shipment.id)}
                                  onChange={(e) => {
                                    const next = new Set(bulkSelectedIds);
                                    if (e.target.checked) next.add(shipment.id);
                                    else next.delete(shipment.id);
                                    setBulkSelectedIds(next);
                                    setBulkSelectAll(next.size === filteredAndSortedShipments.length);
                                  }}
                                  title="Select for bulk action"
                                />
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13 }}>
                              <span
                                onClick={() => setSelectedShipment(shipment)}
                                style={{ color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dashed var(--accent)' }}
                                title="View order details"
                              >
                                {shipment.orderRef}
                              </span>
                              {isArch && (
                                <span style={{
                                  marginLeft: 6, padding: '1px 5px', borderRadius: 4,
                                  fontSize: 10, fontWeight: 600, background: 'var(--surface-2)',
                                  color: 'var(--text-500)'
                                }}>
                                  ARCHIVED
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={shipment.supplier}>{shipment.supplier}</td>
                            <td style={{ padding: '8px 12px', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={shipment.productName}>{shipment.productName || 'N/A'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 13 }}>{shipment.quantity || 'N/A'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 13 }}>{shipment.palletQty ? (Math.round(shipment.palletQty) || 1) : '-'}</td>
                            <td style={{ padding: '8px 12px', fontSize: 13 }}>
                              {editingDate === shipment.id ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <input
                                    type="date"
                                    autoFocus
                                    value={editingDateValue}
                                    onChange={(e) => setEditingDateValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleStoredDateChange(shipment.id, editingDateValue);
                                      if (e.key === 'Escape') setEditingDate(null);
                                    }}
                                    style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)' }}
                                  />
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => handleStoredDateChange(shipment.id, editingDateValue)}
                                    style={{ fontSize: 11, padding: '4px 8px', minWidth: 0 }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="btn btn-ghost"
                                    onClick={() => setEditingDate(null)}
                                    style={{ fontSize: 11, padding: '4px 8px', minWidth: 0 }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <span
                                  onClick={() => {
                                    const d = shipment.receivingDate || shipment.updatedAt || shipment.estimatedArrival;
                                    setEditingDateValue(d ? new Date(d).toISOString().split('T')[0] : '');
                                    setEditingDate(shipment.id);
                                  }}
                                  style={{ cursor: 'pointer', borderBottom: '1px dashed var(--text-500)' }}
                                  title="Click to edit date"
                                >
                                  {formatDate(shipment.receivingDate || shipment.updatedAt || shipment.estimatedArrival)}
                                </span>
                              )}
                            </td>
                            {(() => {
                              if (!isOffsite) return <><td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-500)' }}>-</td><td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-500)' }}>-</td></>;
                              const days = getDaysInStorage(shipment);
                              const isLong = typeof days === 'number' && days > 30;
                              const cost = getStorageCost(shipment);
                              return (
                                <>
                                <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: isLong ? 'var(--danger)' : 'var(--text-700)' }}>
                                  {days}{typeof days === 'number' ? 'd' : ''}
                                </td>
                                <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: isLong ? 'var(--danger)' : 'var(--text-700)' }}>
                                  {cost > 0 ? `R${cost.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '-'}
                                </td>
                                </>
                              );
                            })()}
                            <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button
                                className="btn btn-ghost"
                                onClick={() => openEditModal(shipment)}
                                style={{ fontSize: 12, padding: '4px 10px' }}
                                title="Edit shipment details"
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-ghost"
                                onClick={() => openMoveModal(shipment)}
                                style={{ fontSize: 12, padding: '4px 10px' }}
                                title="Move stock to another warehouse"
                              >
                                Move
                              </button>
                              {isOffsite && (
                                <button
                                  className="btn btn-ghost"
                                  onClick={() => openSoldModal(shipment)}
                                  style={{ fontSize: 12, padding: '4px 10px', marginLeft: 4 }}
                                  title="Mark stock as sold from offsite storage"
                                >
                                  Sold
                                </button>
                              )}
                              {!isArch && (
                                <button
                                  className="btn btn-ghost"
                                  onClick={() => onDeleteShipment(shipment.id)}
                                  style={{ fontSize: 12, padding: '4px 10px', marginLeft: 4 }}
                                >
                                  Archive
                                </button>
                              )}
                            </td>
                              </>);
                            })()}
                          </tr>
                        ))}
                      </tbody>
                      {isOffsite && (
                        <tfoot>
                          <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
                            <td style={{ padding: '8px 4px' }} />
                            <td colSpan={3} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 13, color: 'var(--navy-900)' }}>
                              Totals
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 13, color: 'var(--navy-900)' }}>
                              {warehouseShipments.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0).toLocaleString('en-ZA')}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 13, color: 'var(--navy-900)' }}>
                              {Math.round(warehouseShipments.reduce((sum, s) => sum + (Number(s.palletQty) || 0), 0))}
                            </td>
                            <td style={{ padding: '8px 12px' }} />
                            <td style={{ padding: '8px 12px' }} />
                            <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 13, color: 'var(--navy-900)' }}>
                              R{warehouseShipments.reduce((sum, s) => sum + getStorageCost(s), 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                            <td style={{ padding: '8px 12px' }} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
      {/* Order detail card */}
      {selectedShipment && (
        <div
          onClick={() => setSelectedShipment(null)}
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
                {selectedShipment.orderRef}
              </h3>
              <button
                onClick={() => setSelectedShipment(null)}
                style={{
                  background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
                  color: 'var(--text-500)', lineHeight: 1
                }}
              >
                x
              </button>
            </div>

            <ShipmentTimeline shipment={selectedShipment} />

            {(() => {
              const s = selectedShipment;
              const rows = [
                ['Supplier', s.supplier],
                ['Product', s.productName],
                ['Quantity', s.quantity],
                ['Pallets', s.palletQty ? (Math.round(s.palletQty) || 1) : '-'],
                ['CBM', s.cbm || '-'],
                ['Week', s.weekNumber ? `Week ${s.weekNumber}` : '-'],
                ['Warehouse', getWarehouseName(s)],
                ['Freight Type', s.freightType || '-'],
                ['Final POD', s.finalPod || '-'],
                ['Stored Date', formatDate(s.receivingDate || s.updatedAt || s.estimatedArrival)],
                ['Inspection Status', s.inspectionStatus || s.inspection_status || '-'],
                ['Inspected By', s.inspectedBy || s.inspected_by || '-'],
                ['Inspection Notes', s.inspectionNotes || s.inspection_notes || '-'],
                ['Received By', s.receivedBy || s.received_by || '-'],
                ['Received Qty', s.receivedQuantity || s.received_quantity || '-'],
              ];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 0 }}>
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
      {/* Move Stock Modal */}
      {moveModal && (
        <div
          onClick={() => setMoveModal(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--navy-900)' }}>Move Stock</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-500)' }}>
              {moveModal.shipment.orderRef} &mdash; {moveModal.shipment.productName || 'N/A'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-500)', marginBottom: 2 }}>Available Qty</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy-900)' }}>{moveModal.shipment.quantity || 0}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-500)', marginBottom: 2 }}>Available Pallets</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy-900)' }}>{Math.round(moveModal.shipment.palletQty) || 1}</div>
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-700)' }}>
              Destination Warehouse
            </label>
            <select
              value={moveModal.destination}
              onChange={(e) => setMoveModal(prev => ({ ...prev, destination: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, marginBottom: 12 }}
            >
              <option value="">Select warehouse...</option>
              {['PRETORIA', 'KLAPMUTS', 'OFFSITE'].filter(w => w !== (moveModal.shipment.receivingWarehouse || '').toUpperCase()).map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-700)' }}>Qty to Move</label>
                <input
                  type="number"
                  min={1}
                  max={moveModal.shipment.quantity || 1}
                  value={moveModal.moveQty}
                  onChange={(e) => setMoveModal(prev => ({ ...prev, moveQty: Math.min(parseInt(e.target.value) || 0, prev.shipment.quantity || 0) }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-700)' }}>Pallets to Move</label>
                <input
                  type="number"
                  min={1}
                  max={Math.round(moveModal.shipment.palletQty) || 1}
                  value={moveModal.movePallets}
                  onChange={(e) => setMoveModal(prev => ({ ...prev, movePallets: Math.min(parseInt(e.target.value) || 0, Math.round(prev.shipment.palletQty) || 1) }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>
            </div>

            {moveModal.moveQty < (moveModal.shipment.quantity || 0) || moveModal.movePallets < (Math.round(moveModal.shipment.palletQty) || 1) ? (
              <div style={{
                background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8,
                padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#92400E'
              }}>
                <strong>Partial move:</strong> {moveModal.moveQty} qty / {moveModal.movePallets} pallets will move to {moveModal.destination || '...'}.
                Remaining {(moveModal.shipment.quantity || 0) - moveModal.moveQty} qty / {(Math.round(moveModal.shipment.palletQty) || 1) - moveModal.movePallets} pallets stays in {moveModal.shipment.receivingWarehouse || 'current'}.
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setMoveModal(null)} style={{ fontSize: 13, padding: '8px 16px' }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!moveModal.destination || moveModal.moveQty <= 0 || moveModal.movePallets <= 0}
                onClick={handleMoveSubmit}
                style={{ fontSize: 13, padding: '8px 16px' }}
              >
                Move Stock
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Mark as Sold Modal */}
      {soldModal && (
        <div
          onClick={() => setSoldModal(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--navy-900)' }}>Mark as Sold</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-500)' }}>
              {soldModal.shipment.orderRef} &mdash; {soldModal.shipment.productName || 'N/A'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-500)', marginBottom: 2 }}>Available Qty</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy-900)' }}>{soldModal.shipment.quantity || 0}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-500)', marginBottom: 2 }}>Available Pallets</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy-900)' }}>{Math.round(soldModal.shipment.palletQty) || 1}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-700)' }}>Qty Sold</label>
                <input
                  type="number"
                  min={1}
                  max={soldModal.shipment.quantity || 1}
                  value={soldModal.soldQty}
                  onChange={(e) => setSoldModal(prev => ({ ...prev, soldQty: Math.min(parseInt(e.target.value) || 0, prev.shipment.quantity || 0) }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-700)' }}>Pallets Sold</label>
                <input
                  type="number"
                  min={1}
                  max={Math.round(soldModal.shipment.palletQty) || 1}
                  value={soldModal.soldPallets}
                  onChange={(e) => setSoldModal(prev => ({ ...prev, soldPallets: Math.min(parseInt(e.target.value) || 0, Math.round(prev.shipment.palletQty) || 1) }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-700)' }}>
              ASO # (optional)
            </label>
            <input
              type="text"
              value={soldModal.asoNumber}
              onChange={(e) => setSoldModal(prev => ({ ...prev, asoNumber: e.target.value }))}
              placeholder="Sales order number this stock is linked to"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, marginBottom: 12 }}
            />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-700)' }}>
              Notes (optional)
            </label>
            <input
              type="text"
              value={soldModal.notes}
              onChange={(e) => setSoldModal(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="e.g. buyer, invoice #"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, marginBottom: 16 }}
            />

            {soldModal.soldQty < (soldModal.shipment.quantity || 0) || soldModal.soldPallets < (Math.round(soldModal.shipment.palletQty) || 1) ? (
              <div style={{
                background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8,
                padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#92400E'
              }}>
                <strong>Partial sale:</strong> {soldModal.soldQty} qty / {soldModal.soldPallets} pallets will be marked sold.
                Remaining {(soldModal.shipment.quantity || 0) - soldModal.soldQty} qty / {(Math.round(soldModal.shipment.palletQty) || 1) - soldModal.soldPallets} pallets stays in storage.
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setSoldModal(null)} style={{ fontSize: 13, padding: '8px 16px' }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={soldModal.soldQty <= 0 || soldModal.soldPallets <= 0}
                onClick={handleSoldSubmit}
                style={{ fontSize: 13, padding: '8px 16px' }}
              >
                Confirm Sold
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Shipment Modal */}
      {editShipment && (
        <div
          onClick={() => setEditShipment(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: '1.5rem',
              width: '90%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)', border: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                Edit Shipment
              </h3>
              <button
                onClick={() => setEditShipment(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-500)', lineHeight: 1 }}
              >
                x
              </button>
            </div>
            {(() => {
              const fieldStyle = {
                width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 13, background: 'var(--surface)'
              };
              const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-500)', marginBottom: 4 };
              const rowStyle = { marginBottom: 12 };
              return (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <div style={rowStyle}>
                      <label style={labelStyle}>Order Ref</label>
                      <input style={fieldStyle} value={editForm.orderRef} onChange={e => setEditForm({ ...editForm, orderRef: e.target.value })} />
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle}>Supplier</label>
                      <input style={fieldStyle} value={editForm.supplier} onChange={e => setEditForm({ ...editForm, supplier: e.target.value })} />
                    </div>
                    <div style={{ ...rowStyle, gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Product Name</label>
                      <input style={fieldStyle} value={editForm.productName} onChange={e => setEditForm({ ...editForm, productName: e.target.value })} />
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle}>Quantity</label>
                      <input style={fieldStyle} type="number" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: e.target.value })} />
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle}>Pallet Qty</label>
                      <input style={fieldStyle} type="number" value={editForm.palletQty} onChange={e => setEditForm({ ...editForm, palletQty: e.target.value })} />
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle}>CBM</label>
                      <input style={fieldStyle} type="number" value={editForm.cbm} onChange={e => setEditForm({ ...editForm, cbm: e.target.value })} />
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle}>Week</label>
                      <input style={fieldStyle} value={editForm.weekNumber} onChange={e => setEditForm({ ...editForm, weekNumber: e.target.value })} />
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle}>Warehouse</label>
                      <select style={fieldStyle} value={editForm.receivingWarehouse} onChange={e => setEditForm({ ...editForm, receivingWarehouse: e.target.value })}>
                        <option value="">Unassigned</option>
                        <option value="PRETORIA">PRETORIA</option>
                        <option value="KLAPMUTS">KLAPMUTS</option>
                        <option value="OFFSITE">OFFSITE</option>
                      </select>
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle}>Final POD</label>
                      <input style={fieldStyle} value={editForm.finalPod} onChange={e => setEditForm({ ...editForm, finalPod: e.target.value })} />
                    </div>
                    <div style={rowStyle}>
                      <label style={labelStyle}>Freight Type</label>
                      <input style={fieldStyle} value={editForm.freightType} onChange={e => setEditForm({ ...editForm, freightType: e.target.value })} />
                    </div>
                    <div style={{ ...rowStyle, gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Stored Date</label>
                      <input style={fieldStyle} type="date" value={editForm.receivingDate} onChange={e => setEditForm({ ...editForm, receivingDate: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setEditShipment(null)}
                      style={{ fontSize: 13, padding: '8px 16px' }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleEditSave}
                      style={{ fontSize: 13, padding: '8px 16px' }}
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default WarehouseStored;
