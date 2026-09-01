import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../utils/authFetch';
import { ShipmentStatus, isDelayedStatus, DELAYED_STATUSES, PRE_ARRIVAL_STATUSES, getCurrentWeek, isOverdue } from '../types/shipment';
import PostArrivalWorkflowReport from './PostArrivalWorkflowReport';
import CurrentWeekStoredReport from './CurrentWeekStoredReport';
import FreightQuoteRatesReport from './FreightQuoteRatesReport';
import { getApiUrl } from '../config/api';
import { useNotification } from '../contexts/NotificationContext';
import FilterPresetBar from './FilterPresetBar';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
applyPlugin(jsPDF);
import * as XLSX from 'xlsx';

// Helper function to extract forwarding agent from shipment data
const extractForwardingAgent = (shipment) => {
  // Try to extract from notes or supplier info
  if (shipment.notes) {
    const notes = shipment.notes.toLowerCase();
    if (notes.includes('dhl') || notes.includes('mydhl')) return 'DHL';
    if (notes.includes('dsv')) return 'DSV';
    if (notes.includes('afrigistics')) return 'Afrigistics';
    if (notes.includes('ups')) return 'UPS';
  }

  // Try to extract from supplier name
  if (shipment.supplier) {
    const supplier = shipment.supplier.toLowerCase();
    if (supplier.includes('dhl')) return 'DHL';
    if (supplier.includes('dsv')) return 'DSV';
    if (supplier.includes('afrigistics')) return 'Afrigistics';
  }

  // Default based on destination or random assignment for demo
  const destinations = ['DHL', 'DSV', 'Afrigistics'];
  return destinations[Math.floor(Math.random() * destinations.length)];
};

const formatDeliveryMonth = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }) : '';

function ReportsView({ shipments: propShipments }) {
  const { showSuccess, showError, confirm: confirmAction } = useNotification();
  const [savedReports, setSavedReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [allShipments, setAllShipments] = useState([]);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [selectedDateRange, setSelectedDateRange] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({
    start: '',
    end: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('current'); // 'current' or 'historical'
  const [selectedReport, setSelectedReport] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ reportType: 'shipments', frequency: 'weekly', recipients: '' });
  const [scheduledReports, setScheduledReports] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || null;
  const handleStatusFilter = (status) => {
    const params = new URLSearchParams(searchParams);
    if (statusFilter === status || status === null) {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    setSearchParams(params, { replace: true });
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const totalQuantity = displayedShipments.reduce((sum, s) => sum + (s.quantity || 0), 0);
    const totalPallets = displayedShipments.reduce((sum, s) => sum + (s.palletQty || 0), 0);
    const summaryData = [
      ['Shipment Report'],
      ['Generated:', new Date().toLocaleString()],
      [],
      ['Filters Applied:'],
      ['Date Range:', selectedDateRange === 'custom'
        ? `${customDateRange.start || 'Any'} to ${customDateRange.end || 'Any'}`
        : selectedDateRange === 'all' ? 'All Time' : selectedDateRange],
      ['Status Filter:', statusFilter ? statusFilter.replace(/_/g, ' ') : 'All'],
      [],
      ['Summary Statistics:'],
      ['Total Shipments:', analytics.totalShipments],
      ['Total Quantity:', totalQuantity],
      ['Total Pallets:', Math.round(totalPallets)]
    ];
    const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWS, 'Summary');

    // Shipments Sheet
    const dataRows = displayedShipments.map(s => ({
      'Supplier': s.supplier || '',
      'Order Ref': s.orderRef || s.order_ref || '',
      'Product': s.productName || '',
      'Month': formatDeliveryMonth(s.selectedWeekDate),
      'Expected Delivery Date': s.selectedWeekDate ? new Date(s.selectedWeekDate).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
      'Quantity': s.quantity || 0,
      'Pallet Qty': Math.round(s.palletQty || 0),
      'CBM': s.cbm || 0,
      'Status': (s.latestStatus || '').replace(/_/g, ' '),
      'Warehouse': s.receivingWarehouse || '',
      'Final POD': s.finalPod || '',
      'Forwarding Agent': s.forwardingAgent || ''
    }));
    const dataWS = XLSX.utils.json_to_sheet(dataRows);
    XLSX.utils.book_append_sheet(wb, dataWS, 'Shipments');

    // Supplier Breakdown Sheet
    const supplierRows = Object.entries(analytics.supplierStats)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([supplier, stats]) => ({
        'Supplier': supplier,
        'Total': stats.total,
        'Arrived': stats.arrived,
        'In Transit': stats.inTransit,
        'Delayed': stats.delayed,
        'Performance %': stats.total > 0 ? ((stats.arrived / stats.total) * 100).toFixed(1) : '0'
      }));
    const supplierWS = XLSX.utils.json_to_sheet(supplierRows);
    XLSX.utils.book_append_sheet(wb, supplierWS, 'Supplier Breakdown');

    const fileName = `shipment_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Title
    doc.setFontSize(18);
    doc.text('Shipment Report', pageWidth / 2, 20, { align: 'center' });

    // Filters
    doc.setFontSize(10);
    let yPos = 35;
    const dateLabel = selectedDateRange === 'custom'
      ? `${customDateRange.start || 'Any'} to ${customDateRange.end || 'Any'}`
      : selectedDateRange === 'all' ? 'All Time' : selectedDateRange;
    doc.text(`Date Range: ${dateLabel}`, 20, yPos);
    yPos += 5;
    if (statusFilter) {
      doc.text(`Status Filter: ${statusFilter.replace(/_/g, ' ')}`, 20, yPos);
      yPos += 5;
    }
    yPos += 5;

    // Summary stats
    const totalQuantity = displayedShipments.reduce((sum, s) => sum + (s.quantity || 0), 0);
    const totalPallets = displayedShipments.reduce((sum, s) => sum + (s.palletQty || 0), 0);
    doc.setFontSize(12);
    doc.text('Summary Statistics:', 20, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.text(`Total Shipments: ${analytics.totalShipments}`, 25, yPos);
    yPos += 5;
    doc.text(`Total Quantity: ${totalQuantity.toLocaleString()}`, 25, yPos);
    yPos += 5;
    doc.text(`Total Pallets: ${Math.round(totalPallets).toLocaleString()}`, 25, yPos);
    yPos += 10;

    // Shipments table
    doc.autoTable({
      startY: yPos,
      head: [['Supplier', 'Order Ref', 'Product', 'Month', 'Expected Delivery', 'Qty', 'Pallets', 'Status', 'Warehouse']],
      body: displayedShipments.map(s => [
        s.supplier || '',
        s.orderRef || s.order_ref || '',
        s.productName || '',
        formatDeliveryMonth(s.selectedWeekDate) || '-',
        s.selectedWeekDate ? new Date(s.selectedWeekDate).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-',
        s.quantity || 0,
        Math.round(s.palletQty || 0) || 1,
        (s.latestStatus || '').replace(/_/g, ' '),
        s.receivingWarehouse || ''
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [5, 150, 105] }
    });

    // Supplier breakdown table
    const supplierEntries = Object.entries(analytics.supplierStats)
      .sort(([, a], [, b]) => b.total - a.total);
    if (supplierEntries.length > 0) {
      const afterShipments = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text('Supplier Breakdown', 20, afterShipments);

      doc.autoTable({
        startY: afterShipments + 5,
        head: [['Supplier', 'Total', 'Arrived', 'In Transit', 'Delayed', 'Performance %']],
        body: supplierEntries.map(([supplier, stats]) => [
          supplier,
          stats.total,
          stats.arrived,
          stats.inTransit,
          stats.delayed,
          stats.total > 0 ? ((stats.arrived / stats.total) * 100).toFixed(1) + '%' : '0%'
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [5, 150, 105] }
      });
    }

    // Footer with timestamp and page numbers
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

    doc.save(`shipment_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Fetch saved reports on component mount
  useEffect(() => {
    fetchSavedReports();
  }, []);

  // Fetch all shipments directly from API for reports
  useEffect(() => {
    const fetchAllShipmentsData = async () => {
      try {
        setLoadingShipments(true);

        // Fetch ALL shipments from the database (no filtering)
        const response = await authFetch(getApiUrl('/api/shipments?limit=10000'));
        if (response.ok) {
          const result = await response.json();
          // Handle both { data: [...] } and [...] response formats
          const shipments = result.data || result || [];

          // Normalize field names
          const normalized = shipments.map(s => ({
            ...s,
            latestStatus: s.latest_status || s.latestStatus,
            supplier: s.supplier,
            weekNumber: s.week_number || s.weekNumber,
            selectedWeekDate: s.selected_week_date || s.selectedWeekDate,
            productName: s.product_name || s.productName,
            receivingWarehouse: s.receiving_warehouse || s.receivingWarehouse,
            finalPod: s.final_pod || s.finalPod,
            forwardingAgent: s.forwarding_agent || s.forwardingAgent,
            quantity: Number(s.quantity) || 0,
            palletQty: Number(s.pallet_qty || s.palletQty) || 0,
            cbm: Number(s.cbm) || 0
          }));

          setAllShipments(normalized);
        }
      } catch (error) {
        console.error('Error fetching shipments for reports:', error);
      } finally {
        setLoadingShipments(false);
      }
    };

    fetchAllShipmentsData();
  }, []);

  const fetchSavedReports = async () => {
    try {
      setLoadingReports(true);
      const response = await authFetch(getApiUrl('/api/reports?limit=1000'));
      if (response.ok) {
        const data = await response.json();
        setSavedReports(data.reports || []);
      }
    } catch (error) {
      console.error('Error fetching saved reports:', error);
    } finally {
      setLoadingReports(false);
    }
  };

  const saveCurrentReport = async () => {
    try {
      const reportData = {
        totalShipments: analytics.totalShipments,
        statusCounts: analytics.statusCounts,
        supplierStats: analytics.supplierStats,
        forwardingAgentStats: analytics.forwardingAgentStats,
        weeklyArrivals: analytics.weeklyArrivals,
        productStats: analytics.productStats,
        warehouseStats: analytics.warehouseStats
      };

      const response = await authFetch(getApiUrl('/api/reports/generate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reportData,
          reportType: 'shipment_analytics',
          dateRange: customDateRange.start && customDateRange.end ? customDateRange : null
        })
      });

      if (response.ok) {
        const result = await response.json();
        showSuccess('Report saved successfully!');
        fetchSavedReports();
      } else {
        throw new Error('Failed to save report');
      }
    } catch (error) {
      console.error('Error saving report:', error);
      showError('Error saving report: ' + error.message);
    }
  };

  const loadHistoricalReport = async (reportId) => {
    try {
      const response = await authFetch(getApiUrl(`/api/reports/${reportId}`));
      if (response.ok) {
        const report = await response.json();
        setSelectedReport(report);
        setViewMode('historical');
      }
    } catch (error) {
      console.error('Error loading historical report:', error);
    }
  };

  const deleteReport = async (reportId) => {
    if (!(await confirmAction({ title: 'Delete Report', message: 'Are you sure you want to delete this report?', type: 'danger', confirmText: 'Delete' }))) return;

    try {
      const response = await authFetch(getApiUrl(`/api/reports/${reportId}`), {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchSavedReports();
        if (selectedReport && selectedReport.id === reportId) {
          setSelectedReport(null);
          setViewMode('current');
        }
      }
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  };

  // Filter shipments based on date range
  const filteredShipments = useMemo(() => {
    // Use fetched shipments, fallback to prop shipments
    const shipmentsToUse = allShipments.length > 0 ? allShipments : propShipments;

    if (selectedDateRange === 'all') return shipmentsToUse;

    const now = new Date();
    let startDate = new Date();

    switch (selectedDateRange) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'custom':
        if (customDateRange.start && customDateRange.end) {
          return shipmentsToUse.filter(shipment => {
            const shipmentDate = new Date(shipment.weekNumber ? `2024-W${shipment.weekNumber}` : shipment.createdAt || now);
            return shipmentDate >= new Date(customDateRange.start) && shipmentDate <= new Date(customDateRange.end);
          });
        }
        return shipmentsToUse;
      default:
        return shipmentsToUse;
    }

    return shipmentsToUse.filter(shipment => {
      const shipmentDate = new Date(shipment.weekNumber ? `2024-W${shipment.weekNumber}` : shipment.createdAt || now);
      return shipmentDate >= startDate;
    });
  }, [allShipments, propShipments, selectedDateRange, customDateRange]);

  // Apply status filter on top of date-filtered shipments
  const displayedShipments = useMemo(() => {
    if (!statusFilter) return filteredShipments;
    if (statusFilter === '__delayed_all__') {
      const currentWeek = getCurrentWeek();
      return filteredShipments.filter(s => {
        const status = s.latestStatus || s.latest_status;
        return isDelayedStatus(status) || isOverdue(s, currentWeek);
      });
    }
    return filteredShipments.filter(s => {
      const status = s.latestStatus || s.latest_status;
      return status === statusFilter;
    });
  }, [filteredShipments, statusFilter]);

  // Compute analytics from a shipment list (reused for cards vs filtered view)
  const computeAnalytics = (shipmentList) => {
    const currentWeek = getCurrentWeek();

    const statusOrderRefs = {
      [ShipmentStatus.PLANNED_AIRFREIGHT]: new Set(),
      [ShipmentStatus.PLANNED_SEAFREIGHT]: new Set(),
      [ShipmentStatus.IN_TRANSIT_AIRFREIGHT]: new Set(),
      [ShipmentStatus.IN_TRANSIT_ROADWAY]: new Set(),
      [ShipmentStatus.IN_TRANSIT_SEAWAY]: new Set(),
      [ShipmentStatus.IN_TRANSIT_LAST_MILE]: new Set(),
      [ShipmentStatus.MOORED]: new Set(),
      [ShipmentStatus.BERTH_WORKING]: new Set(),
      [ShipmentStatus.BERTH_COMPLETE]: new Set(),
      [ShipmentStatus.GATED_IN_PORT]: new Set(),
      [ShipmentStatus.ARRIVED_PTA]: new Set(),
      [ShipmentStatus.ARRIVED_KLM]: new Set(),
      [ShipmentStatus.DELAYED_PORT]: new Set(),
      [ShipmentStatus.DELAYED_CUSTOMS]: new Set(),
      [ShipmentStatus.DELAYED_DOCUMENTS]: new Set(),
      [ShipmentStatus.DELAYED_SUPPLIER]: new Set(),
      [ShipmentStatus.CANCELLED]: new Set(),
      [ShipmentStatus.STORED]: new Set(),
      [ShipmentStatus.ARCHIVED]: new Set(),
    };

    const supplierOrderRefs = {};
    const weeklyOrderRefs = {};
    const productStats = {};
    const warehouseStats = {};
    const forwardingAgentStats = {};
    const overdueOrderRefs = new Set();

    shipmentList.forEach(shipment => {
      const status = shipment.latestStatus || shipment.latest_status;
      const orderRef = shipment.orderRef || shipment.order_ref || shipment.id;

      if (statusOrderRefs.hasOwnProperty(status) && orderRef) {
        statusOrderRefs[status].add(orderRef);
      }

      // Check overdue: pre-arrival shipment past its scheduled week
      const shipmentIsOverdue = !isDelayedStatus(status) && isOverdue(shipment, currentWeek);
      if (shipmentIsOverdue && orderRef) {
        overdueOrderRefs.add(orderRef);
      }

      const supplier = shipment.supplier || 'Unknown';
      if (orderRef) {
        if (!supplierOrderRefs[supplier]) {
          supplierOrderRefs[supplier] = {
            total: new Set(),
            delayed: new Set(),
            arrived: new Set(),
            inTransit: new Set()
          };
        }
        supplierOrderRefs[supplier].total.add(orderRef);
        if (isDelayedStatus(status) || shipmentIsOverdue) {
          supplierOrderRefs[supplier].delayed.add(orderRef);
        } else if (status === ShipmentStatus.ARRIVED_PTA || status === ShipmentStatus.ARRIVED_KLM) {
          supplierOrderRefs[supplier].arrived.add(orderRef);
        } else if (status === ShipmentStatus.IN_TRANSIT_ROADWAY || status === ShipmentStatus.IN_TRANSIT_SEAWAY) {
          supplierOrderRefs[supplier].inTransit.add(orderRef);
        }
      }

      if (shipment.weekNumber && orderRef) {
        const week = parseInt(shipment.weekNumber);
        if (!weeklyOrderRefs[week]) {
          weeklyOrderRefs[week] = new Set();
        }
        weeklyOrderRefs[week].add(orderRef);
      }

      if (shipment.productName) {
        if (!productStats[shipment.productName]) {
          productStats[shipment.productName] = { count: 0, quantity: 0 };
        }
        productStats[shipment.productName].count++;
        productStats[shipment.productName].quantity += shipment.quantity || 0;
      }

      const warehouse = shipment.receivingWarehouse || shipment.finalPod || 'Unknown';
      if (!warehouseStats[warehouse]) {
        warehouseStats[warehouse] = { count: 0, quantity: 0 };
      }
      warehouseStats[warehouse].count++;
      warehouseStats[warehouse].quantity += shipment.quantity || 0;

      const forwardingAgent = shipment.forwardingAgent || extractForwardingAgent(shipment) || 'Unknown';
      if (!forwardingAgentStats[forwardingAgent]) {
        forwardingAgentStats[forwardingAgent] = {
          total: 0, delivered: 0, delayed: 0, inTransit: 0,
          totalPalletQty: 0, avgDeliveryTime: 0
        };
      }
      forwardingAgentStats[forwardingAgent].total++;
      forwardingAgentStats[forwardingAgent].totalPalletQty += shipment.palletQty || 0;
      if (status === ShipmentStatus.ARRIVED_PTA || status === ShipmentStatus.ARRIVED_KLM) {
        forwardingAgentStats[forwardingAgent].delivered++;
      } else if (isDelayedStatus(status) || shipmentIsOverdue) {
        forwardingAgentStats[forwardingAgent].delayed++;
      } else if (status === ShipmentStatus.IN_TRANSIT_ROADWAY || status === ShipmentStatus.IN_TRANSIT_SEAWAY) {
        forwardingAgentStats[forwardingAgent].inTransit++;
      }
    });

    const statusCounts = {};
    Object.keys(statusOrderRefs).forEach(s => {
      statusCounts[s] = statusOrderRefs[s].size;
    });

    const supplierStats = {};
    Object.keys(supplierOrderRefs).forEach(s => {
      supplierStats[s] = {
        total: supplierOrderRefs[s].total.size,
        delayed: supplierOrderRefs[s].delayed.size,
        arrived: supplierOrderRefs[s].arrived.size,
        inTransit: supplierOrderRefs[s].inTransit.size
      };
    });

    const weeklyArrivals = {};
    Object.keys(weeklyOrderRefs).forEach(week => {
      weeklyArrivals[week] = weeklyOrderRefs[week].size;
    });

    const uniqueOrderRefs = new Set(shipmentList.map(s => s.orderRef || s.order_ref).filter(Boolean));

    return {
      statusCounts, supplierStats, weeklyArrivals, productStats,
      warehouseStats, forwardingAgentStats,
      totalShipments: uniqueOrderRefs.size, currentWeek,
      overdueCount: overdueOrderRefs.size
    };
  };

  // Card-level analytics: always from the full date-filtered set (so all cards stay visible)
  const cardAnalytics = useMemo(() => {
    const dataSource = viewMode === 'historical' && selectedReport
      ? selectedReport.analytics
      : null;
    if (dataSource) {
      return {
        statusCounts: dataSource.statusCounts || {},
        supplierStats: dataSource.supplierStats || {},
        weeklyArrivals: dataSource.weeklyArrivals || {},
        productStats: dataSource.productStats || {},
        warehouseStats: dataSource.warehouseStats || {},
        forwardingAgentStats: dataSource.forwardingAgentStats || {},
        totalShipments: dataSource.totalShipments || 0,
        currentWeek: getCurrentWeek()
      };
    }
    return computeAnalytics(filteredShipments);
  }, [filteredShipments, viewMode, selectedReport]);

  // Detail analytics: from the status-filtered set (charts, tables, reports reflect selection)
  const analytics = useMemo(() => {
    if (!statusFilter) return cardAnalytics;
    const dataSource = viewMode === 'historical' && selectedReport
      ? selectedReport.analytics
      : null;
    if (dataSource) return cardAnalytics;
    return computeAnalytics(displayedShipments);
  }, [cardAnalytics, statusFilter, displayedShipments, viewMode, selectedReport]);

  const StatusChart = ({ data }) => {
    const total = Object.values(data).reduce((sum, count) => sum + count, 0);
    if (total === 0) return <div>No data available</div>;

    const statusColors = {
      [ShipmentStatus.PLANNED_AIRFREIGHT]: 'var(--info)',
      [ShipmentStatus.PLANNED_SEAFREIGHT]: 'var(--info)',
      [ShipmentStatus.IN_TRANSIT_AIRFREIGHT]: '#1565C0',
      [ShipmentStatus.IN_TRANSIT_ROADWAY]: 'var(--warning)',
      [ShipmentStatus.IN_TRANSIT_SEAWAY]: '#FFB74D',
      [ShipmentStatus.IN_TRANSIT_LAST_MILE]: '#ffc107',
      [ShipmentStatus.MOORED]: '#AB47BC',
      [ShipmentStatus.BERTH_WORKING]: '#8E24AA',
      [ShipmentStatus.BERTH_COMPLETE]: '#7B1FA2',
      [ShipmentStatus.GATED_IN_PORT]: '#0097A7',
      [ShipmentStatus.ARRIVED_PTA]: 'var(--success)',
      [ShipmentStatus.ARRIVED_KLM]: '#66BB6A',
      [ShipmentStatus.DELAYED_PORT]: '#dc3545',
      [ShipmentStatus.DELAYED_CUSTOMS]: '#c62828',
      [ShipmentStatus.DELAYED_DOCUMENTS]: '#e65100',
      [ShipmentStatus.DELAYED_SUPPLIER]: '#d32f2f',
      [ShipmentStatus.CANCELLED]: '#9E9E9E',
    };

    return (
      <div className="chart-container">
        <h4>Shipment Status Distribution</h4>
        <div className="pie-chart">
          {Object.entries(data).map(([status, count]) => {
            const percentage = ((count / total) * 100).toFixed(1);
            return count > 0 ? (
              <div key={status} className="chart-item">
                <div 
                  className="chart-bar" 
                  style={{ 
                    width: `${percentage}%`, 
                    backgroundColor: statusColors[status] 
                  }}
                ></div>
                <div className="chart-label">
                  <span style={{ color: statusColors[status] }}>●</span>
                  {status.replace('_', ' ')}: {count} ({percentage}%)
                </div>
              </div>
            ) : null;
          })}
        </div>
      </div>
    );
  };

  const WeeklyChart = ({ data, currentWeek }) => {
    const weeks = Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b));
    const maxCount = Math.max(...Object.values(data));

    return (
      <div className="chart-container">
        <h4>Weekly Arrival Schedule</h4>
        <div className="bar-chart">
          {weeks.map(week => {
            const count = data[week];
            const percentage = (count / maxCount) * 100;
            const weekNum = parseInt(week);
            const isCurrentWeek = weekNum === currentWeek;
            
            return (
              <div key={week} className="week-bar">
                <div 
                  className="bar" 
                  style={{ 
                    height: `${percentage}%`,
                    backgroundColor: isCurrentWeek ? '#FF5722' : 'var(--info)'
                  }}
                  title={`Week ${week}: ${count} shipments`}
                ></div>
                <div className="week-label">
                  W{week}
                  {isCurrentWeek && <span className="current-week">●</span>}
                </div>
                <div className="week-count">{count}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const SupplierTable = ({ data }) => {
    const suppliers = Object.entries(data)
      .sort(([,a], [,b]) => b.total - a.total)
      .slice(0, 10);

    return (
      <div className="chart-container">
        <h4>Top Suppliers Performance</h4>
        <div className="supplier-table">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Total</th>
                <th>Arrived</th>
                <th>In Transit</th>
                <th>Delayed</th>
                <th>Performance</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(([supplier, stats]) => {
                const performance = stats.total > 0 ? 
                  ((stats.arrived / stats.total) * 100).toFixed(1) : 0;
                
                return (
                  <tr key={supplier}>
                    <td className="supplier-name">{supplier}</td>
                    <td>{stats.total}</td>
                    <td className="status-arrived">{stats.arrived}</td>
                    <td className="status-transit">{stats.inTransit}</td>
                    <td className="status-delayed">{stats.delayed}</td>
                    <td>
                      <div className="performance-bar">
                        <div 
                          className="performance-fill" 
                          style={{ width: `${performance}%` }}
                        ></div>
                        <span className="performance-text">{performance}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const ForwardingAgentTable = ({ data }) => {
    const agents = Object.entries(data)
      .sort(([,a], [,b]) => b.total - a.total)
      .slice(0, 10);

    return (
      <div className="chart-container">
        <h4>🚛 Forwarding Agent Performance</h4>
        <div className="agent-table">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Total</th>
                <th>Delivered</th>
                <th>In Transit</th>
                <th>Delayed</th>
                <th>Pallet Qty</th>
                <th>Performance</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(([agent, stats]) => {
                const performance = stats.total > 0 ?
                  ((stats.delivered / stats.total) * 100).toFixed(1) : 0;

                return (
                  <tr key={agent}>
                    <td className="agent-name">
                      <div className="agent-badge">
                        {getAgentIcon(agent)} {agent}
                      </div>
                    </td>
                    <td>{stats.total}</td>
                    <td className="status-arrived">{stats.delivered}</td>
                    <td className="status-transit">{stats.inTransit}</td>
                    <td className="status-delayed">{stats.delayed}</td>
                    <td>{Math.round(stats.totalPalletQty) || '-'}</td>
                    <td>
                      <div className="performance-bar">
                        <div
                          className="performance-fill"
                          style={{ width: `${performance}%` }}
                        ></div>
                        <span className="performance-text">{performance}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const getAgentIcon = (agent) => {
    const icons = {
      'DHL': '📦',
      'DSV': '🚛',
      'Afrigistics': '🌍',
      'UPS': '📮'
    };
    return icons[agent] || '🚚';
  };

  const reportsCurrentFilters = { selectedDateRange, customDateRange, statusFilter, searchTerm };

  const handleLoadPreset = (filters) => {
    if (filters.selectedDateRange !== undefined) setSelectedDateRange(filters.selectedDateRange);
    if (filters.customDateRange !== undefined) setCustomDateRange(filters.customDateRange);
    if (filters.statusFilter !== undefined) handleStatusFilter(filters.statusFilter);
    if (filters.searchTerm !== undefined) setSearchTerm(filters.searchTerm);
  };

  const ReportControls = () => (
    <div className="report-controls">
      <div className="control-group">
        <label>View Mode:</label>
        <select
          value={viewMode}
          onChange={(e) => {
            setViewMode(e.target.value);
            if (e.target.value === 'current') {
              setSelectedReport(null);
            }
          }}
        >
          <option value="current">Current Data</option>
          <option value="historical">Historical Reports</option>
        </select>
      </div>

      {viewMode === 'current' && (
        <>
          <div className="control-group">
            <label>Date Range:</label>
            <select
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="quarter">Last 3 Months</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {selectedDateRange === 'custom' && (
            <div className="custom-date-range">
              <input
                type="date"
                value={customDateRange.start}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                placeholder="Start Date"
              />
              <input
                type="date"
                value={customDateRange.end}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                placeholder="End Date"
              />
            </div>
          )}

          <button className="save-report-btn" onClick={saveCurrentReport}>
            💾 Save Report
          </button>
          <button className="export-excel-btn" onClick={exportToExcel}>
            📊 Export Excel
          </button>
          <button className="export-pdf-btn" onClick={exportToPDF}>
            📄 Export PDF
          </button>
          <button className="schedule-report-btn" onClick={() => setShowScheduleModal(true)}>
            Schedule Report
          </button>
        </>
      )}

      {viewMode === 'historical' && (
        <div className="historical-reports">
          <div className="reports-list">
            <h4>Saved Reports</h4>
            {loadingReports ? (
              <div>Loading reports...</div>
            ) : savedReports.length === 0 ? (
              <div>No saved reports found</div>
            ) : (
              <div className="reports-grid">
                {savedReports.map(report => (
                  <div
                    key={report.id}
                    className={`report-card ${selectedReport && selectedReport.id === report.id ? 'selected' : ''}`}
                    onClick={() => loadHistoricalReport(report.id)}
                  >
                    <div className="report-header">
                      <span className="report-date">
                        {new Date(report.generatedAt).toLocaleDateString()}
                      </span>
                      <button
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteReport(report.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div className="report-stats">
                      <span>{report.analytics.totalShipments} shipments</span>
                      <span>{report.analytics.totalSuppliers} suppliers</span>
                      <span>{report.analytics.totalAgents} agents</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const SummaryCards = ({ analytics, statusFilter, onStatusFilter }) => {
    const cards = [
      { key: 'total', status: null, value: analytics.totalShipments, label: 'Total Shipments', icon: '📦', ring: 'ring-accent', tint: 'rgba(5,150,105,0.1)' },
      { key: 'planned_air', status: ShipmentStatus.PLANNED_AIRFREIGHT, value: analytics.statusCounts[ShipmentStatus.PLANNED_AIRFREIGHT] || 0, label: 'Planned Airfreight', icon: '✈️', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
      { key: 'planned_sea', status: ShipmentStatus.PLANNED_SEAFREIGHT, value: analytics.statusCounts[ShipmentStatus.PLANNED_SEAFREIGHT] || 0, label: 'Planned Seafreight', icon: '🚢', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
      { key: 'transit_air', status: ShipmentStatus.IN_TRANSIT_AIRFREIGHT, value: analytics.statusCounts[ShipmentStatus.IN_TRANSIT_AIRFREIGHT] || 0, label: 'In Transit Air', icon: '✈️', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'transit_road', status: ShipmentStatus.IN_TRANSIT_ROADWAY, value: analytics.statusCounts[ShipmentStatus.IN_TRANSIT_ROADWAY] || 0, label: 'In Transit Road', icon: '🚛', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'transit_sea', status: ShipmentStatus.IN_TRANSIT_SEAWAY, value: analytics.statusCounts[ShipmentStatus.IN_TRANSIT_SEAWAY] || 0, label: 'In Transit Sea', icon: '🌊', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'transit_last_mile', status: ShipmentStatus.IN_TRANSIT_LAST_MILE, value: analytics.statusCounts[ShipmentStatus.IN_TRANSIT_LAST_MILE] || 0, label: 'In Transit Last Mile', icon: '🚛', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'moored', status: ShipmentStatus.MOORED, value: analytics.statusCounts[ShipmentStatus.MOORED] || 0, label: 'Moored', icon: '⚓', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'berth_working', status: ShipmentStatus.BERTH_WORKING, value: analytics.statusCounts[ShipmentStatus.BERTH_WORKING] || 0, label: 'Berth Working', icon: '🏗️', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'berth_complete', status: ShipmentStatus.BERTH_COMPLETE, value: analytics.statusCounts[ShipmentStatus.BERTH_COMPLETE] || 0, label: 'Berth Complete', icon: '✅', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'gated_in_port', status: ShipmentStatus.GATED_IN_PORT, value: analytics.statusCounts[ShipmentStatus.GATED_IN_PORT] || 0, label: 'Gated In Port', icon: '🛣️', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'arrived_pta', status: ShipmentStatus.ARRIVED_PTA, value: analytics.statusCounts[ShipmentStatus.ARRIVED_PTA] || 0, label: 'Arrived PTA', icon: '🏢', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
      { key: 'arrived_klm', status: ShipmentStatus.ARRIVED_KLM, value: analytics.statusCounts[ShipmentStatus.ARRIVED_KLM] || 0, label: 'Arrived KLM', icon: '🏢', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
      { key: 'unloading', status: ShipmentStatus.UNLOADING, value: analytics.statusCounts[ShipmentStatus.UNLOADING] || 0, label: 'Unloading', icon: '📦', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
      { key: 'insp_pending', status: ShipmentStatus.INSPECTION_PENDING, value: analytics.statusCounts[ShipmentStatus.INSPECTION_PENDING] || 0, label: 'Inspection Pending', icon: '🔍', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
      { key: 'inspecting', status: ShipmentStatus.INSPECTING, value: analytics.statusCounts[ShipmentStatus.INSPECTING] || 0, label: 'Inspecting', icon: '🔍', ring: 'ring-warning', tint: 'rgba(245,158,11,0.1)' },
      { key: 'insp_failed', status: ShipmentStatus.INSPECTION_FAILED, value: analytics.statusCounts[ShipmentStatus.INSPECTION_FAILED] || 0, label: 'Inspection Failed', icon: '❌', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
      { key: 'insp_passed', status: ShipmentStatus.INSPECTION_PASSED, value: analytics.statusCounts[ShipmentStatus.INSPECTION_PASSED] || 0, label: 'Inspection Passed', icon: '✅', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
      { key: 'receiving', status: ShipmentStatus.RECEIVING, value: analytics.statusCounts[ShipmentStatus.RECEIVING] || 0, label: 'Receiving', icon: '📥', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'received', status: ShipmentStatus.RECEIVED, value: analytics.statusCounts[ShipmentStatus.RECEIVED] || 0, label: 'Received', icon: '✅', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
      { key: 'stored', status: ShipmentStatus.STORED, value: analytics.statusCounts[ShipmentStatus.STORED] || 0, label: 'Stored', icon: '🏪', ring: 'ring-success', tint: 'rgba(16,185,129,0.1)' },
      { key: 'delayed', status: '__delayed_all__', value: DELAYED_STATUSES.reduce((sum, s) => sum + (analytics.statusCounts[s] || 0), 0) + (analytics.overdueCount || 0), label: 'Delayed', icon: '⚠️', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
      { key: 'cancelled', status: ShipmentStatus.CANCELLED, value: analytics.statusCounts[ShipmentStatus.CANCELLED] || 0, label: 'Cancelled', icon: '❌', ring: 'ring-danger', tint: 'rgba(239,68,68,0.1)' },
      { key: 'week', status: '__info__', value: `Week ${analytics.currentWeek}`, label: 'Current Week', icon: '📅', ring: 'ring-info', tint: 'rgba(59,130,246,0.1)' },
      { key: 'suppliers', status: '__info__', value: Object.keys(analytics.supplierStats).length, label: 'Active Suppliers', icon: '🏭', ring: 'ring-accent', tint: 'rgba(5,150,105,0.1)' },
    ];

    return (
      <div className="stats-grid">
        {cards
          .filter(card => card.status === null || card.status === '__info__' || card.value > 0)
          .map(card => (
            <div key={card.key}
              className={`stat-card ${card.ring} ${card.status !== '__info__' ? 'clickable' : ''} ${statusFilter === card.status ? 'active' : ''}`}
              onClick={() => card.status !== '__info__' ? onStatusFilter(card.status) : undefined}
            >
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
                backgroundColor: card.tint, marginBottom: 6,
              }}>
                {card.icon}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 1px', color: 'var(--navy-900)' }}>
                {card.value}
              </h3>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                {card.label}
              </p>
            </div>
          ))
        }
      </div>
    );
  };

  if (loadingShipments) {
    return (
      <div className="reports-view">
        <div className="brand-strip" />
        <div className="page-header">
          <h2>Reports & Analytics</h2>
          <p>Loading shipment data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-view">
      <div className="brand-strip" />
      <div className="page-header">
        <h2>Reports & Analytics</h2>
        <p>Comprehensive insights into your shipment operations ({analytics.totalShipments} shipments{statusFilter ? ` filtered by ${statusFilter.replace(/_/g, ' ')}` : ''})</p>
      </div>

      <ReportControls />

      <FilterPresetBar
        viewName="reports"
        currentFilters={reportsCurrentFilters}
        onLoadPreset={handleLoadPreset}
      />

      <SummaryCards
        analytics={cardAnalytics}
        statusFilter={statusFilter}
        onStatusFilter={handleStatusFilter}
      />

      <div className="charts-grid">
        <div className="chart-column">
          <StatusChart data={analytics.statusCounts} />
          <WeeklyChart data={analytics.weeklyArrivals} currentWeek={analytics.currentWeek} />
        </div>

        <div className="chart-column">
          <SupplierTable data={analytics.supplierStats} />
        </div>
      </div>

      <div className="full-width-section">
        <ForwardingAgentTable data={analytics.forwardingAgentStats} />
      </div>

      {/* Post-Arrival Workflow Report */}
      <PostArrivalWorkflowReport shipments={displayedShipments} />

      {/* Current Week Stored Shipments Report */}
      <CurrentWeekStoredReport shipments={displayedShipments} />

      {/* Freight Quote Rates Report */}
      <FreightQuoteRatesReport />

      {/* Schedule Report Modal */}
      {showScheduleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface, #fff)', borderRadius: '12px', padding: '24px', maxWidth: '480px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontWeight: 600, color: 'var(--text-900, #1a202c)' }}>Schedule Automated Report</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '4px', color: 'var(--text-700, #4a5568)' }}>Report Type</label>
              <select style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }} value={scheduleForm.reportType} onChange={e => setScheduleForm(f => ({ ...f, reportType: e.target.value }))}>
                <option value="shipments">Shipments Summary</option>
                <option value="suppliers">Supplier Performance</option>
                <option value="warehouse">Warehouse Utilization</option>
                <option value="weekly">Weekly Overview</option>
                <option value="monthly">Monthly Overview</option>
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '4px', color: 'var(--text-700, #4a5568)' }}>Frequency</label>
              <select style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }} value={scheduleForm.frequency} onChange={e => setScheduleForm(f => ({ ...f, frequency: e.target.value }))}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '4px', color: 'var(--text-700, #4a5568)' }}>Email Recipients (comma-separated)</label>
              <input style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }} placeholder="user@example.com, user2@example.com" value={scheduleForm.recipients} onChange={e => setScheduleForm(f => ({ ...f, recipients: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="save-report-btn" style={{ background: '#6c757d' }} onClick={() => setShowScheduleModal(false)}>Cancel</button>
              <button className="save-report-btn" onClick={async () => {
                try {
                  const recipients = scheduleForm.recipients.split(',').map(e => e.trim()).filter(Boolean);
                  const res = await authFetch(getApiUrl('/api/reports/scheduled'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reportType: scheduleForm.reportType, frequency: scheduleForm.frequency, recipients })
                  });
                  if (res.ok) {
                    setShowScheduleModal(false);
                    setScheduleForm({ reportType: 'shipments', frequency: 'weekly', recipients: '' });
                    showSuccess('Report schedule created successfully!');
                  } else {
                    const err = await res.json();
                    showError(err.error || 'Failed to create schedule');
                  }
                } catch (error) {
                  showError('Failed to create report schedule');
                }
              }}>Create Schedule</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .reports-view {
          padding: 2rem;
          min-height: 100vh;
        }
        
        .charts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
        }

        .full-width-section {
          margin-top: 2rem;
        }

        .report-controls {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          margin-bottom: 2rem;
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: center;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .control-group label {
          font-weight: 500;
          color: #2c3e50;
          font-size: 0.9rem;
        }

        .control-group select,
        .control-group input {
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .custom-date-range {
          display: flex;
          gap: 0.5rem;
        }

        .save-report-btn {
          background: #28a745;
          color: white;
          border: none;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .save-report-btn:hover {
          background: #218838;
          transform: translateY(-1px);
        }

        .export-excel-btn {
          background: #10b981;
          color: white;
          border: none;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .export-excel-btn:hover {
          background: #059669;
          transform: translateY(-1px);
        }

        .export-pdf-btn {
          background: #e53e3e;
          color: white;
          border: none;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .export-pdf-btn:hover {
          background: #c53030;
          transform: translateY(-1px);
        }

        .schedule-report-btn {
          background: #6366f1;
          color: white;
          border: none;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
          font-size: 0.85rem;
        }

        .schedule-report-btn:hover {
          background: #4f46e5;
          transform: translateY(-1px);
        }

        .historical-reports {
          width: 100%;
        }

        .reports-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .report-card {
          background: #f8f9fa;
          border: 2px solid #e9ecef;
          border-radius: 8px;
          padding: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .report-card:hover {
          border-color: #059669;
          transform: translateY(-2px);
        }

        .report-card.selected {
          border-color: #059669;
          background: #f0f7ff;
        }

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .report-date {
          font-weight: 500;
          color: #2c3e50;
        }

        .delete-btn {
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .delete-btn:hover {
          background: #c82333;
        }

        .report-stats {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.85rem;
          color: #666;
        }
        
        .chart-column {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        
        .chart-container {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .chart-container h4 {
          color: #2c3e50;
          margin-bottom: 1rem;
          font-size: 1.1rem;
        }
        
        .chart-item {
          margin-bottom: 0.8rem;
        }
        
        .chart-bar {
          height: 8px;
          border-radius: 4px;
          margin-bottom: 0.3rem;
        }
        
        .chart-label {
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .bar-chart {
          display: flex;
          align-items: end;
          gap: 8px;
          height: 200px;
          padding: 1rem 0;
        }
        
        .week-bar {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          height: 100%;
        }
        
        .bar {
          width: 100%;
          min-height: 4px;
          border-radius: 2px 2px 0 0;
          margin-bottom: 0.5rem;
          transition: all 0.3s;
        }
        
        .bar:hover {
          opacity: 0.8;
        }
        
        .week-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #666;
          margin-bottom: 0.2rem;
          display: flex;
          align-items: center;
          gap: 0.2rem;
        }
        
        .current-week {
          color: #FF5722;
          font-size: 0.6rem;
        }
        
        .week-count {
          font-size: 0.7rem;
          color: #999;
        }
        
        .supplier-table table,
        .agent-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .supplier-table th,
        .supplier-table td,
        .agent-table th,
        .agent-table td {
          padding: 0.75rem 0.5rem;
          text-align: left;
          border-bottom: 1px solid #eee;
        }

        .supplier-table th,
        .agent-table th {
          background: #f8f9fa;
          font-weight: 600;
          color: #2c3e50;
          font-size: 0.9rem;
        }
        
        .supplier-name,
        .agent-name {
          font-weight: 500;
          color: #2c3e50;
        }

        .agent-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.5rem;
          background: #f0f7ff;
          border-radius: 16px;
          border: 1px solid #e1f0ff;
          font-size: 0.85rem;
          font-weight: 500;
        }
        
        .status-arrived { color: #4CAF50; font-weight: 500; }
        .status-transit { color: #FF9800; font-weight: 500; }
        .status-delayed { color: #F44336; font-weight: 500; }
        
        .performance-bar {
          position: relative;
          background: #eee;
          height: 16px;
          border-radius: 8px;
          overflow: hidden;
          min-width: 60px;
        }
        
        .performance-fill {
          background: linear-gradient(90deg, #f44336 0%, #ff9800 50%, #4caf50 100%);
          height: 100%;
          border-radius: 8px;
          transition: width 0.3s;
        }
        
        .performance-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 0.7rem;
          font-weight: 500;
          color: white;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        
        @media (max-width: 768px) {
          .reports-view {
            padding: 0.75rem;
          }

          .charts-grid {
            grid-template-columns: 1fr;
          }

          .report-controls {
            flex-direction: column;
            padding: 1rem;
          }

          .control-group {
            width: 100%;
          }

          .bar-chart {
            height: 150px;
          }
        }
      `}</style>
    </div>
  );
}

export default ReportsView;