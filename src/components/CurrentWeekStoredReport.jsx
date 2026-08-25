import React, { useMemo, useState, useEffect } from 'react';
import { authFetch } from '../utils/authFetch';
import { getCurrentWeekNumber, getWeekDateRange } from '../utils/dateUtils';
import { getApiUrl } from '../config/api';

// Actual quantity on hand: falls back to the ordered quantity when a shipment
// was never partially received, but respects a lower receivedQuantity
// (including 0) so rejected/damaged stock isn't counted as if it were stored.
const stockQty = (shipment) => {
  const received = shipment.receivedQuantity ?? shipment.received_quantity;
  return Number(received ?? shipment.quantity) || 0;
};

function CurrentWeekStoredReport({ shipments, showTitle = true }) {
  const currentWeek = getCurrentWeekNumber();
  const currentYear = new Date().getFullYear();
  const weekRange = getWeekDateRange(currentWeek, currentYear);

  const [archivedShipments, setArchivedShipments] = useState([]);
  const [loadingArchives, setLoadingArchives] = useState(false);

  // Fetch archived shipments
  useEffect(() => {
    const fetchArchivedShipments = async () => {
      try {
        setLoadingArchives(true);
        const response = await authFetch(getApiUrl('/api/shipments/archives'));
        if (!response.ok) return;

        const archives = await response.json();
        const allArchivedShipments = [];

        // Fetch each archive and extract shipments stored in current week
        for (const archive of archives) {
          try {
            const archiveResponse = await authFetch(getApiUrl(`/api/shipments/archives/${archive.fileName}`));
            if (!archiveResponse.ok) continue;

            const archiveData = await archiveResponse.json();
            if (archiveData && archiveData.data) {
              // Filter archived shipments that were stored in current week
              const currentWeekArchivedShipments = archiveData.data.filter(shipment => {
                if (shipment.latestStatus !== 'stored') return false;

                const storedDate = new Date(shipment.storedDate || shipment.updatedAt);
                const shipmentWeek = Math.ceil(((storedDate - new Date(storedDate.getFullYear(), 0, 1)) / 86400000 + 1) / 7);

                return shipmentWeek === currentWeek && storedDate.getFullYear() === currentYear;
              });

              // Mark as archived and add source
              currentWeekArchivedShipments.forEach(shipment => {
                shipment.isArchived = true;
                shipment.archiveSource = archive.fileName;
              });

              allArchivedShipments.push(...currentWeekArchivedShipments);
            }
          } catch (error) {
            console.error(`Error fetching archive ${archive.fileName}:`, error);
          }
        }

        setArchivedShipments(allArchivedShipments);
      } catch (error) {
        console.error('Error fetching archives:', error);
      } finally {
        setLoadingArchives(false);
      }
    };

    fetchArchivedShipments();
  }, [currentWeek, currentYear]);

  // Combine current and archived shipments that were stored this week
  const currentWeekStoredShipments = useMemo(() => {
    // Current active shipments
    const activeShipments = shipments.filter(shipment => {
      // Check if shipment is stored
      if (shipment.latestStatus !== 'stored') {
        return false;
      }

      // Check if it was stored this week
      const storedDate = new Date(shipment.storedDate || shipment.updatedAt);
      const shipmentWeek = Math.ceil(((storedDate - new Date(storedDate.getFullYear(), 0, 1)) / 86400000 + 1) / 7);

      return shipmentWeek === currentWeek && storedDate.getFullYear() === currentYear;
    });

    // Combine with archived shipments
    return [...activeShipments, ...archivedShipments];
  }, [shipments, archivedShipments, currentWeek, currentYear]);

  // Calculate statistics
  const statistics = useMemo(() => {
    const totalShipments = currentWeekStoredShipments.length;
    const totalQuantity = currentWeekStoredShipments.reduce((sum, s) => sum + stockQty(s), 0);
    const totalPalletQty = currentWeekStoredShipments.reduce((sum, s) => sum + (s.cbm || 0), 0);

    // Group by warehouse
    const warehouseStats = {};
    currentWeekStoredShipments.forEach(shipment => {
      const warehouse = shipment.receivingWarehouse || shipment.finalPod || 'Unknown';
      if (!warehouseStats[warehouse]) {
        warehouseStats[warehouse] = { count: 0, quantity: 0, palletQty: 0 };
      }
      warehouseStats[warehouse].count++;
      warehouseStats[warehouse].quantity += stockQty(shipment);
      warehouseStats[warehouse].palletQty += shipment.cbm || 0;
    });

    // Group by supplier
    const supplierStats = {};
    currentWeekStoredShipments.forEach(shipment => {
      const supplier = shipment.supplier || 'Unknown';
      if (!supplierStats[supplier]) {
        supplierStats[supplier] = { count: 0, quantity: 0, palletQty: 0 };
      }
      supplierStats[supplier].count++;
      supplierStats[supplier].quantity += stockQty(shipment);
      supplierStats[supplier].palletQty += shipment.cbm || 0;
    });

    return {
      totalShipments,
      totalQuantity,
      totalPalletQty,
      warehouseStats,
      supplierStats
    };
  }, [currentWeekStoredShipments]);

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  if (loadingArchives) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef',
        margin: '1rem 0'
      }}>
        {showTitle && <h3>📦 Current Week Stored Shipments</h3>}
        <p style={{ color: '#666', margin: '1rem 0' }}>
          Week {currentWeek}, {currentYear} ({weekRange.formatted})
        </p>
        <p>Loading archived data...</p>
      </div>
    );
  }

  if (currentWeekStoredShipments.length === 0) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef',
        margin: '1rem 0'
      }}>
        {showTitle && <h3>📦 Current Week Stored Shipments</h3>}
        <p style={{ color: '#666', margin: '1rem 0' }}>
          Week {currentWeek}, {currentYear} ({weekRange.formatted})
        </p>
        <p>No shipments stored this week.</p>
      </div>
    );
  }

  return (
    <div style={{ margin: '1rem 0' }}>
      {showTitle && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#2c3e50' }}>
            📦 Current Week Stored Shipments (Including Archives)
          </h3>
          <p style={{ color: '#666', margin: 0 }}>
            Week {currentWeek}, {currentYear} ({weekRange.formatted})
          </p>
          <p style={{ color: '#888', margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
            {archivedShipments.length > 0 ?
              `Showing ${currentWeekStoredShipments.length - archivedShipments.length} active + ${archivedShipments.length} archived shipments` :
              'Showing active shipments only (no archived data found)'
            }
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          backgroundColor: '#e3f2fd',
          padding: '1rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1976d2' }}>
            {statistics.totalShipments}
          </div>
          <div style={{ color: '#666', fontSize: '0.9rem' }}>Total Shipments</div>
        </div>

        <div style={{
          backgroundColor: '#e8f5e8',
          padding: '1rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#388e3c' }}>
            {formatNumber(statistics.totalQuantity)}
          </div>
          <div style={{ color: '#666', fontSize: '0.9rem' }}>Total Quantity</div>
        </div>

        <div style={{
          backgroundColor: '#fff3e0',
          padding: '1rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f57c00' }}>
            {formatNumber(Math.round(statistics.totalPalletQty))}
          </div>
          <div style={{ color: '#666', fontSize: '0.9rem' }}>Total Pallet Qty</div>
        </div>
      </div>

      {/* Warehouse Breakdown */}
      <div style={{ marginBottom: '2rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>Warehouse Breakdown</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <thead style={{ backgroundColor: '#f8f9fa' }}>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Warehouse
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  Shipments
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  Quantity
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  Pallet Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(statistics.warehouseStats).map(([warehouse, stats]) => (
                <tr key={warehouse} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{warehouse}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{stats.count}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{formatNumber(stats.quantity)}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{formatNumber(Math.round(stats.palletQty))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplier Breakdown */}
      <div style={{ marginBottom: '2rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>Supplier Breakdown</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <thead style={{ backgroundColor: '#f8f9fa' }}>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Supplier
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  Shipments
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  Quantity
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  Pallet Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(statistics.supplierStats).map(([supplier, stats]) => (
                <tr key={supplier} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{supplier}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{stats.count}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{formatNumber(stats.quantity)}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{formatNumber(Math.round(stats.palletQty))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Shipments List */}
      <div>
        <h4 style={{ marginBottom: '1rem' }}>Stored Shipments Detail</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <thead style={{ backgroundColor: '#f8f9fa' }}>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Order Ref
                </th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Supplier
                </th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Product
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  Quantity
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  Pallet Qty
                </th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Warehouse
                </th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  Stored Date
                </th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {currentWeekStoredShipments.map((shipment) => (
                <tr key={`${shipment.id}-${shipment.isArchived ? 'archived' : 'active'}`} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{shipment.orderRef}</td>
                  <td style={{ padding: '12px' }}>{shipment.supplier}</td>
                  <td style={{ padding: '12px' }}>{shipment.productName || 'N/A'}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{formatNumber(stockQty(shipment))}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{formatNumber(Math.round(shipment.cbm || 0))}</td>
                  <td style={{ padding: '12px' }}>{shipment.receivingWarehouse || shipment.finalPod || 'N/A'}</td>
                  <td style={{ padding: '12px' }}>
                    {new Date(shipment.storedDate || shipment.updatedAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {shipment.isArchived ? (
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: '#f8d7da',
                        color: '#721c24',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}>
                        📁 Archived
                      </span>
                    ) : (
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: '#d1edff',
                        color: '#0c5aa6',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}>
                        📊 Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default CurrentWeekStoredReport;