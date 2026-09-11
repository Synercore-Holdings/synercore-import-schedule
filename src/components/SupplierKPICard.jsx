import React, { useMemo } from 'react';
import { SupplierMetrics } from '../utils/supplierMetrics';

function SupplierKPICard({ supplier, shipments }) {
  const metrics = useMemo(() => {
    // Try matching by name first, then by code if available
    const supplierName = supplier.name || supplier.code;
    const calculatedMetrics = SupplierMetrics.calculateAllMetrics(shipments, supplierName);

    // Debug: Log if no data found for supplier
    if (calculatedMetrics.totalShipments === 0 && shipments.length > 0) {
      console.warn(`[SupplierKPICard] No matching shipments for supplier "${supplierName}". Available suppliers in data:`,
        [...new Set(shipments.map(s => s.supplier).filter(Boolean))]);
    }

    return calculatedMetrics;
  }, [supplier, shipments]);

  const getTrendIndicator = () => {
    if (!metrics.trend || metrics.trend.length < 2) return null;

    const latest = metrics.trend[metrics.trend.length - 1];
    const previous = metrics.trend[Math.max(0, metrics.trend.length - 5)];

    const change = latest - previous;
    if (change > 5) return { symbol: '↑', color: '#28a745', text: `+${change}%` };
    if (change < -5) return { symbol: '↓', color: '#dc3545', text: `${change}%` };
    return { symbol: '→', color: '#6c757d', text: 'Stable' };
  };

  const trendIndicator = getTrendIndicator();

  const renderSparkline = () => {
    if (!metrics.trend || metrics.trend.length === 0) return null;

    const maxValue = 100;
    const width = 100;
    const height = 30;
    const points = metrics.trend;
    const spacing = width / (points.length - 1 || 1);

    const pathData = points
      .map((value, index) => {
        const x = index * spacing;
        const y = height - (value / maxValue) * height;
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    return (
      <svg width={width} height={height} style={{ marginTop: '8px' }}>
        <polyline
          points={points.map((value, index) => {
            const x = index * spacing;
            const y = height - (value / maxValue) * height;
            return `${x},${y}`;
          }).join(' ')}
          fill="none"
          stroke="#0066cc"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div style={{
      backgroundColor: '#f8f9fa',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem'
    }}>
      {/* Header with Grade */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <h4 style={{ margin: 0, color: '#2c3e50' }}>
          {supplier.name || supplier.code || 'Unknown Supplier'}
        </h4>
        <div style={{
          backgroundColor: metrics.grade.color,
          color: 'white',
          padding: '0.5rem 1rem',
          borderRadius: '20px',
          fontWeight: 'bold',
          fontSize: '0.9rem'
        }}>
          {metrics.grade.grade}-Grade ({metrics.grade.label})
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        {/* On-Time Delivery */}
        <div style={{
          padding: '0.75rem',
          backgroundColor: 'white',
          borderRadius: '6px',
          borderLeft: `4px solid #0066cc`
        }}>
          <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
            📈 On-Time Delivery
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#2c3e50',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            {metrics.onTimePercent}%
            {trendIndicator && (
              <span style={{
                fontSize: '0.9rem',
                color: trendIndicator.color,
                fontWeight: 'normal'
              }}>
                {trendIndicator.symbol} {trendIndicator.text}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.5rem' }}>
            Arrived in scheduled week
          </div>
        </div>

        {/* Inspection Pass Rate */}
        <div style={{
          padding: '0.75rem',
          backgroundColor: 'white',
          borderRadius: '6px',
          borderLeft: `4px solid ${metrics.passRatePercent === null ? '#ccc' : metrics.passRatePercent >= 90 ? '#28a745' : metrics.passRatePercent >= 80 ? '#ffc107' : '#dc3545'}`
        }}>
          <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
            ✅ Inspection Pass Rate
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#2c3e50'
          }}>
            {metrics.passRatePercent !== null ? `${metrics.passRatePercent}%` : 'No data'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.5rem' }}>
            {metrics.passRatePercent === null ? 'Not inspected yet' : 'Quality inspections'}
          </div>
        </div>

        {/* Average Lead Time */}
        <div style={{
          padding: '0.75rem',
          backgroundColor: 'white',
          borderRadius: '6px',
          borderLeft: `4px solid #17a2b8`
        }}>
          <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
            ⏱️ Avg Arrival Days Late/Early
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#2c3e50'
          }}>
            {metrics.avgLeadTime !== null ? `${metrics.avgLeadTime} days` : 'N/A'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.5rem' }}>
            From schedule to arrival
          </div>
        </div>

        {/* Total Shipments */}
        <div style={{
          padding: '0.75rem',
          backgroundColor: 'white',
          borderRadius: '6px',
          borderLeft: `4px solid #6c757d`
        }}>
          <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
            📦 Total Shipments
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#2c3e50'
          }}>
            {metrics.totalShipments}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.5rem' }}>
            All time total
          </div>
        </div>
      </div>

      {/* 90-Day Trend Chart */}
      {metrics.trend && metrics.trend.length > 0 && (
        <div style={{
          padding: '0.75rem',
          backgroundColor: 'white',
          borderRadius: '6px',
          borderTop: '1px solid #dee2e6'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem', fontWeight: '500' }}>
            📉 90-Day Trend (On-Time Delivery %)
          </div>
          {renderSparkline()}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: '#999',
            marginTop: '0.5rem'
          }}>
            <span>90 days ago</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SupplierKPICard;
