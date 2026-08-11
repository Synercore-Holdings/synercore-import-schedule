import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../config/api';

function SupplierDashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');

  const token = localStorage.getItem('supplier_token');
  const supplierUser = (() => {
    try { return JSON.parse(localStorage.getItem('supplier_user') || '{}'); } catch { return {}; }
  })();

  const supplierFetch = (url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (activeTab === 'shipments') {
      fetchShipments();
    }
  }, [filter]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [statsRes, shipmentsRes, reportsRes] = await Promise.all([
        supplierFetch(getApiUrl('/api/supplier/stats')).catch(() => null),
        supplierFetch(getApiUrl('/api/supplier/shipments?limit=5000')),
        supplierFetch(getApiUrl('/api/supplier/reports')).catch(() => null)
      ]);

      if (statsRes && statsRes.ok) {
        setStats(await statsRes.json());
      }

      if (shipmentsRes.ok) {
        const data = await shipmentsRes.json();
        setShipments(Array.isArray(data) ? data : (data.shipments || data.data || []));
      }

      if (reportsRes && reportsRes.ok) {
        setReports(await reportsRes.json());
      }
    } catch (error) {
      console.error('Error fetching supplier data:', error);
      setMessage('Error loading dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const query = filter ? `?status=${filter}&limit=5000` : '?limit=5000';
      const res = await supplierFetch(getApiUrl(`/api/supplier/shipments${query}`));

      if (!res.ok) throw new Error('Failed to fetch shipments');
      const data = await res.json();
      setShipments(Array.isArray(data) ? data : (data.shipments || data.data || []));
    } catch (error) {
      console.error('Error fetching shipments:', error);
      setMessage('Error loading shipments');
    } finally {
      setLoading(false);
    }
  };

  const viewShipmentDetail = async (shipmentId) => {
    try {
      const res = await supplierFetch(getApiUrl(`/api/supplier/shipments/${shipmentId}`));

      if (!res.ok) throw new Error('Failed to fetch shipment detail');
      const data = await res.json();
      setSelectedShipment(data);
      setActiveTab('detail');
    } catch (error) {
      console.error('Error fetching shipment detail:', error);
      setMessage('Error loading shipment details');
    }
  };

  const uploadDocument = async (e) => {
    try {
      setUploadingFile(true);
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('shipmentId', selectedShipment.shipment.id);
      formData.append('documentType', e.target.dataset.type);
      formData.append('description', `${e.target.dataset.type} uploaded by supplier`);

      const res = await fetch(getApiUrl('/api/supplier/documents'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) throw new Error('Failed to upload document');

      setMessage('Document uploaded successfully');
      setTimeout(() => setMessage(''), 3000);

      // Refresh shipment detail
      const response = await supplierFetch(getApiUrl(`/api/supplier/shipments/${selectedShipment.shipment.id}`));
      const data = await response.json();
      setSelectedShipment(data);
    } catch (error) {
      console.error('Error uploading document:', error);
      setMessage('Error uploading document');
    } finally {
      setUploadingFile(false);
    }
  };

  const formatStatus = (status) => {
    if (!status) return 'Unknown';
    const statusLabels = {
      'planned_airfreight': 'Planned - Air',
      'planned_seafreight': 'Planned - Sea',
      'planned_roadway': 'Planned - Road',
      'in_transit_airfreight': 'In Transit - Air',
      'in_transit_seaway': 'In Transit - Sea',
      'in_transit_roadway': 'In Transit - Road',
      'moored': 'Moored',
      'berth_working': 'Berth - Working',
      'berth_complete': 'Berth - Complete',
      'gated_in_port': 'Gated In Port',
      'arrived_pta': 'Arrived - PTA',
      'arrived_klm': 'Arrived - KLM',
      'arrived_offsite': 'Arrived - Offsite',
      'stored': 'Stored',
      'received': 'Received',
      'inspection_failed': 'Inspection Failed',
      'inspection_passed': 'Inspection Passed',
      'delayed': 'Delayed'
    };
    return statusLabels[status] || status.replace(/_/g, ' ');
  };

  const getStatusColor = (status) => {
    if (!status) return 'var(--text-500, #6c757d)';
    if (status === 'received') return 'var(--success, #28a745)';
    if (status === 'stored') return 'var(--info, #007bff)';
    if (status && status.startsWith('delayed_')) return 'var(--danger, #dc3545)';
    if (status.includes('in_transit')) return 'var(--warning, #ffc107)';
    if (status.includes('arrived')) return 'var(--info, #17a2b8)';
    if (status.includes('planned')) return 'var(--text-500, #6c757d)';
    if (status.includes('inspection_failed')) return 'var(--danger, #dc3545)';
    return 'var(--text-500, #6c757d)';
  };

  // Derive stats from shipments if API stats not available
  const derivedStats = stats || {
    totalShipments: shipments.length,
    inTransit: shipments.filter(s => (s.latestStatus || s.latest_status || '').includes('transit')).length,
    arrived: shipments.filter(s => (s.latestStatus || s.latest_status || '').includes('arrived')).length,
    stored: shipments.filter(s => (s.latestStatus || s.latest_status) === 'stored').length,
    delayed: shipments.filter(s => (s.latestStatus || s.latest_status || '').startsWith('delayed_')).length,
  };

  const statCards = [
    { label: 'Total Shipments', value: derivedStats.totalShipments || 0, color: 'var(--accent, #003d82)' },
    { label: 'In Transit', value: derivedStats.inTransit || 0, color: 'var(--info, #17a2b8)' },
    { label: 'Arrived', value: derivedStats.arrived || 0, color: 'var(--success, #28a745)' },
    { label: 'Stored', value: derivedStats.stored || 0, color: 'var(--warning, #ffc107)' },
  ];

  const recentShipments = [...shipments]
    .sort((a, b) => {
      const dateA = new Date(a.updated_at || a.updatedAt || a.created_at || a.createdAt || 0);
      const dateB = new Date(b.updated_at || b.updatedAt || b.created_at || b.createdAt || 0);
      return dateB - dateA;
    })
    .slice(0, 10);

  const pendingDocCount = shipments.filter(s => {
    const status = s.latestStatus || s.latest_status || '';
    return status.includes('arrived') || status === 'stored';
  }).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--surface-1, #f5f5f5)' }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'var(--accent, #003d82)',
        color: 'white',
        padding: '1.5rem',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>Supplier Portal</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', opacity: 0.85 }}>
              Welcome back{supplierUser?.name ? `, ${supplierUser.name}` : (supplierUser?.email ? `, ${supplierUser.email}` : '')}
            </p>
          </div>
          <button
            onClick={onLogout}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '1rem'
      }}>
        <div style={{
          display: 'flex',
          gap: '0',
          marginBottom: '1.5rem',
          borderBottom: '2px solid var(--border, #ddd)'
        }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'shipments', label: 'My Shipments' },
            { id: 'reports', label: 'Reports' },
            { id: 'detail', label: 'Shipment Detail', hidden: !selectedShipment }
          ].map(tab => (
            !tab.hidden && (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: activeTab === tab.id ? 'var(--accent, #003d82)' : 'transparent',
                  color: activeTab === tab.id ? 'white' : 'var(--text-700, #333)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  borderBottom: activeTab === tab.id ? '3px solid var(--accent-light, #0066cc)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                {tab.label}
              </button>
            )
          ))}
        </div>

        {/* Message */}
        {message && (
          <div style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            backgroundColor: message.toLowerCase().includes('error') ? 'var(--danger-bg, #f8d7da)' : 'var(--success-bg, #d4edda)',
            color: message.toLowerCase().includes('error') ? 'var(--danger, #721c24)' : 'var(--success, #155724)',
            borderRadius: '4px',
            fontSize: '0.85rem'
          }}>
            {message}
          </div>
        )}

        {/* Loading state */}
        {loading && activeTab === 'overview' ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-500, #666)' }}>
            Loading dashboard...
          </div>
        ) : (
          <>
            {/* ===== OVERVIEW TAB ===== */}
            {activeTab === 'overview' && (
              <div>
                {/* KPI Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  {statCards.map(card => (
                    <div key={card.label} style={{
                      backgroundColor: 'var(--surface-0, white)',
                      padding: '1.25rem',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      borderLeft: `3px solid ${card.color}`
                    }}>
                      <h3 style={{ margin: '0 0 2px', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-900, #1a1a1a)' }}>
                        {card.value}
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-500, #666)' }}>
                        {card.label}
                      </p>
                    </div>
                  ))}
                </div>

                {/* On-Time Delivery Rate */}
                {stats?.onTimePercent !== undefined && (
                  <div style={{
                    backgroundColor: 'var(--surface-0, white)',
                    padding: '1.25rem',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    marginBottom: '1.5rem'
                  }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: 'var(--text-900, #1a1a1a)' }}>
                      On-Time Delivery Rate
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        fontSize: '2rem',
                        fontWeight: 700,
                        color: stats.onTimePercent >= 80 ? 'var(--success, #28a745)' : 'var(--warning, #ffc107)'
                      }}>
                        {stats.onTimePercent}%
                      </div>
                      <div style={{
                        height: '8px', flex: 1, borderRadius: '4px',
                        background: 'var(--surface-2, #e9ecef)'
                      }}>
                        <div style={{
                          height: '100%',
                          borderRadius: '4px',
                          width: `${stats.onTimePercent}%`,
                          background: stats.onTimePercent >= 80 ? 'var(--success, #28a745)' : 'var(--warning, #ffc107)',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Pending Documents Alert */}
                {pendingDocCount > 0 && (
                  <div style={{
                    backgroundColor: 'var(--warning-bg, #fff3cd)',
                    border: '1px solid var(--warning, #ffc107)',
                    padding: '1rem 1.25rem',
                    borderRadius: '8px',
                    marginBottom: '1.5rem',
                    fontSize: '0.85rem',
                    color: 'var(--text-900, #856404)'
                  }}>
                    <strong>{pendingDocCount} shipment{pendingDocCount !== 1 ? 's' : ''}</strong> may require document uploads (arrived or stored status).
                    <button
                      onClick={() => setActiveTab('shipments')}
                      style={{
                        marginLeft: '8px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent, #003d82)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontSize: '0.85rem',
                        padding: 0
                      }}
                    >
                      View shipments
                    </button>
                  </div>
                )}

                {/* Recent Shipments Table */}
                <div style={{
                  backgroundColor: 'var(--surface-0, white)',
                  padding: '1.25rem',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  marginBottom: '1.5rem'
                }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 600, color: 'var(--text-900, #1a1a1a)' }}>
                    Recent Shipments
                  </h3>
                  {recentShipments.length === 0 ? (
                    <p style={{ color: 'var(--text-500, #666)', fontSize: '0.85rem' }}>No shipments found.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border, #dee2e6)' }}>
                            <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-500, #666)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Order Ref</th>
                            <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-500, #666)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Product</th>
                            <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-500, #666)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Status</th>
                            <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-500, #666)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Quantity</th>
                            <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-500, #666)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentShipments.map(s => {
                            const status = s.latestStatus || s.latest_status || '';
                            const orderRef = s.orderRef || s.order_ref || '-';
                            const productName = s.productName || s.product_name || '-';
                            const quantity = s.quantity || '-';
                            const updatedAt = s.updated_at || s.updatedAt;
                            return (
                              <tr
                                key={s.id}
                                onClick={() => viewShipmentDetail(s.id)}
                                style={{
                                  borderBottom: '1px solid var(--border, #eee)',
                                  cursor: 'pointer',
                                  transition: 'background 0.15s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-1, #f8f9fa)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-900, #1a1a1a)' }}>{orderRef}</td>
                                <td style={{ padding: '10px 12px', color: 'var(--text-700, #333)' }}>{productName}</td>
                                <td style={{ padding: '10px 12px' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    backgroundColor: getStatusColor(status),
                                    color: 'white'
                                  }}>
                                    {formatStatus(status)}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 12px', color: 'var(--text-700, #333)' }}>{quantity}</td>
                                <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-500, #666)' }}>
                                  {updatedAt ? new Date(updatedAt).toLocaleDateString() : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {shipments.length > 10 && (
                    <button
                      onClick={() => setActiveTab('shipments')}
                      style={{
                        marginTop: '12px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent, #003d82)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      View all {shipments.length} shipments
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ===== SHIPMENTS TAB ===== */}
            {activeTab === 'shipments' && (
              <div>
                <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-700, #333)' }}>Filter by status:</label>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={{
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--border, #ddd)',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="">All Statuses</option>
                    <option value="in_transit_airfreight">In Transit - Air</option>
                    <option value="in_transit_seaway">In Transit - Sea</option>
                    <option value="arrived_pta">Arrived - PTA</option>
                    <option value="stored">Stored</option>
                    <option value="received">Received</option>
                  </select>
                </div>

                {loading ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-500, #666)' }}>Loading shipments...</p>
                ) : shipments.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-500, #666)' }}>No shipments found</p>
                ) : (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {shipments.map(shipment => {
                      const status = shipment.latestStatus || shipment.latest_status || '';
                      return (
                        <div
                          key={shipment.id}
                          style={{
                            backgroundColor: 'var(--surface-0, white)',
                            padding: '1.25rem',
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                            cursor: 'pointer',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            borderLeft: `3px solid ${getStatusColor(status)}`
                          }}
                          onClick={() => viewShipmentDetail(shipment.id)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div>
                              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'var(--text-900, #1a1a1a)' }}>
                                Order: {shipment.orderRef || shipment.order_ref}
                              </h3>
                              <p style={{ margin: '0.25rem 0', color: 'var(--text-500, #666)', fontSize: '0.85rem' }}>
                                Product: {shipment.productName || shipment.product_name || '-'}
                              </p>
                              <p style={{ margin: '0.25rem 0', color: 'var(--text-500, #666)', fontSize: '0.85rem' }}>
                                Quantity: {shipment.quantity || '-'} units ({Math.round(shipment.palletQty || shipment.pallet_qty || 0) || 1} pallets)
                              </p>
                            </div>
                            <span style={{
                              padding: '4px 12px',
                              backgroundColor: getStatusColor(status),
                              color: 'white',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 600
                            }}>
                              {formatStatus(status)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===== REPORTS TAB ===== */}
            {activeTab === 'reports' && (
              <div>
                {reports ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '1rem'
                  }}>
                    {/* Summary Card */}
                    <div style={{
                      backgroundColor: 'var(--surface-0, white)',
                      padding: '1.25rem',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      borderLeft: '3px solid var(--accent, #003d82)'
                    }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-500, #666)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Shipments</h3>
                      <p style={{ fontSize: '2rem', margin: 0, fontWeight: 700, color: 'var(--text-900, #1a1a1a)' }}>
                        {reports.summary?.total_shipments || 0}
                      </p>
                    </div>

                    {/* Delivered Card */}
                    <div style={{
                      backgroundColor: 'var(--surface-0, white)',
                      padding: '1.25rem',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      borderLeft: '3px solid var(--success, #28a745)'
                    }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-500, #666)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Delivered</h3>
                      <p style={{ fontSize: '2rem', margin: 0, fontWeight: 700, color: 'var(--text-900, #1a1a1a)' }}>
                        {reports.summary?.delivered || 0}
                      </p>
                    </div>

                    {/* In Transit Card */}
                    <div style={{
                      backgroundColor: 'var(--surface-0, white)',
                      padding: '1.25rem',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      borderLeft: '3px solid var(--warning, #ffc107)'
                    }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-500, #666)', fontSize: '0.8rem', textTransform: 'uppercase' }}>In Transit</h3>
                      <p style={{ fontSize: '2rem', margin: 0, fontWeight: 700, color: 'var(--text-900, #1a1a1a)' }}>
                        {reports.summary?.arrived || 0}
                      </p>
                    </div>

                    {/* Documents Card */}
                    <div style={{
                      backgroundColor: 'var(--surface-0, white)',
                      padding: '1.25rem',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      borderLeft: '3px solid var(--info, #17a2b8)'
                    }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-500, #666)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Documents Uploaded</h3>
                      <p style={{ fontSize: '2rem', margin: 0, fontWeight: 700, color: 'var(--text-900, #1a1a1a)' }}>
                        {reports.documents?.total_documents || 0}
                      </p>
                    </div>

                    {/* Status Breakdown */}
                    {reports.shipmentsByStatus && reports.shipmentsByStatus.length > 0 && (
                      <div style={{
                        gridColumn: '1 / -1',
                        backgroundColor: 'var(--surface-0, white)',
                        padding: '1.25rem',
                        borderRadius: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                      }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, color: 'var(--text-900, #1a1a1a)' }}>
                          Shipments by Status
                        </h3>
                        {reports.shipmentsByStatus.map(status => (
                          <div key={status.latestStatus} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '0.5rem 0',
                            borderBottom: '1px solid var(--border, #eee)',
                            fontSize: '0.85rem'
                          }}>
                            <span style={{ color: 'var(--text-700, #333)' }}>{formatStatus(status.latestStatus)}</span>
                            <strong style={{ color: 'var(--text-900, #1a1a1a)' }}>{status.count}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', color: 'var(--text-500, #666)', fontSize: '0.85rem' }}>
                    Reports data is not available at this time.
                  </p>
                )}
              </div>
            )}

            {/* ===== SHIPMENT DETAIL TAB ===== */}
            {activeTab === 'detail' && selectedShipment && (
              <div style={{
                backgroundColor: 'var(--surface-0, white)',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                  <button
                    onClick={() => setActiveTab('shipments')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--accent, #003d82)',
                      fontSize: '0.85rem',
                      padding: 0
                    }}
                  >
                    &larr; Back to shipments
                  </button>
                </div>

                <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--text-900, #1a1a1a)' }}>
                  {selectedShipment.shipment.orderRef || selectedShipment.shipment.order_ref}
                </h2>

                {/* Shipment Info */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '2rem'
                }}>
                  {[
                    { label: 'Product', value: selectedShipment.shipment.productName || selectedShipment.shipment.product_name },
                    { label: 'Quantity', value: `${selectedShipment.shipment.quantity || '-'} units` },
                    { label: 'Pallets', value: Math.round(selectedShipment.shipment.palletQty || selectedShipment.shipment.pallet_qty || 0) || 1 },
                    { label: 'Status', value: formatStatus(selectedShipment.shipment.latestStatus || selectedShipment.shipment.latest_status) },
                    { label: 'Expected Arrival', value: selectedShipment.shipment.expectedArrivalDate ? new Date(selectedShipment.shipment.expectedArrivalDate).toLocaleDateString() : '-' },
                    { label: 'Destination', value: selectedShipment.shipment.finalPod || selectedShipment.shipment.final_pod || 'TBD' }
                  ].map(item => (
                    <div key={item.label} style={{
                      padding: '0.75rem',
                      backgroundColor: 'var(--surface-1, #f8f9fa)',
                      borderRadius: '6px'
                    }}>
                      <p style={{ margin: 0, color: 'var(--text-500, #666)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>{item.label}</p>
                      <p style={{ margin: '4px 0 0', fontSize: '1rem', fontWeight: 600, color: 'var(--text-900, #1a1a1a)' }}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Documents */}
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-900, #1a1a1a)' }}>Documents</h3>
                  {(!selectedShipment.documents || selectedShipment.documents.length === 0) ? (
                    <p style={{ color: 'var(--text-500, #666)', fontSize: '0.85rem' }}>No documents uploaded yet</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {selectedShipment.documents.map(doc => (
                        <div key={doc.id} style={{
                          padding: '1rem',
                          backgroundColor: 'var(--surface-1, #f8f9fa)',
                          borderRadius: '6px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-900, #1a1a1a)', fontSize: '0.9rem' }}>{doc.file_name}</p>
                            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-500, #666)' }}>
                              {doc.document_type} &middot; {new Date(doc.uploaded_at).toLocaleDateString()}
                            </p>
                          </div>
                          {doc.is_verified && (
                            <span style={{
                              backgroundColor: 'var(--success-bg, #d4edda)',
                              color: 'var(--success, #155724)',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}>
                              Verified
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Upload Documents */}
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-900, #1a1a1a)' }}>Upload Documents</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                    {[
                      { type: 'POD', label: 'Proof of Delivery' },
                      { type: 'delivery_proof', label: 'Delivery Proof' },
                      { type: 'customs', label: 'Customs Doc' },
                      { type: 'other', label: 'Other' }
                    ].map(doc => (
                      <label key={doc.type} style={{
                        padding: '1rem',
                        border: '2px dashed var(--border, #007bff)',
                        borderRadius: '6px',
                        cursor: uploadingFile ? 'not-allowed' : 'pointer',
                        textAlign: 'center',
                        backgroundColor: 'var(--surface-1, #f8f9fa)',
                        fontSize: '0.85rem',
                        color: 'var(--text-700, #333)',
                        transition: 'border-color 0.2s'
                      }}>
                        <input
                          type="file"
                          style={{ display: 'none' }}
                          onChange={uploadDocument}
                          data-type={doc.type}
                          disabled={uploadingFile}
                        />
                        {uploadingFile ? 'Uploading...' : doc.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SupplierDashboard;
