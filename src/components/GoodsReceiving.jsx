import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../utils/authFetch';
import { authUtils } from '../utils/auth';
import { getApiUrl } from '../config/api';
import { useNotification } from '../contexts/NotificationContext';
import { STATUS_LABELS } from '../types/shipment';
import jsPDF from 'jspdf';

function GoodsReceiving() {
  const { showSuccess, showError, confirm: confirmAction } = useNotification();
  const [activeTab, setActiveTab] = useState('queue');
  const [receivingQueue, setReceivingQueue] = useState([]);
  const [activeReceiving, setActiveReceiving] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);
  const [summary, setSummary] = useState({ pendingReceiving: 0, activeReceiving: 0, receivedToday: 0, discrepanciesToday: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [historyDays, setHistoryDays] = useState(7);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [showReceivingForm, setShowReceivingForm] = useState(false);
  const [formMode, setFormMode] = useState('start'); // 'start' or 'complete'
  const [actionLoading, setActionLoading] = useState(false);

  const currentUser = authUtils.getUser();

  const [truckInfoMap, setTruckInfoMap] = useState({});

  const [formData, setFormData] = useState({
    receivedQuantity: '',
    binLocation: '',
    discrepancies: '',
    receivingNotes: '',
    receivedBy: currentUser?.username || '',
  });

  const fetchTruckInfo = useCallback(async (shipments) => {
    const truckMap = {};
    await Promise.all(shipments.map(async (s) => {
      try {
        const sid = s.id || s._id;
        const truckRes = await authFetch(getApiUrl(`/api/docks/truck-for-shipment/${sid}`));
        if (truckRes.ok) {
          const info = await truckRes.json();
          if (info) truckMap[sid] = info;
        }
      } catch { /* ignore */ }
    }));
    setTruckInfoMap(prev => ({ ...prev, ...truckMap }));
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [queueRes, activeRes, recentRes, summaryRes] = await Promise.all([
        authFetch(getApiUrl('/api/shipments/receiving/queue')),
        authFetch(getApiUrl('/api/shipments/receiving/active')),
        authFetch(getApiUrl(`/api/shipments/receiving/recent?days=${historyDays}`)),
        authFetch(getApiUrl('/api/shipments/receiving/summary')),
      ]);

      const allShipments = [];
      if (queueRes.ok) { const data = await queueRes.json(); setReceivingQueue(data); allShipments.push(...data); }
      if (activeRes.ok) { const data = await activeRes.json(); setActiveReceiving(data); allShipments.push(...data); }
      if (recentRes.ok) { const data = await recentRes.json(); setRecentHistory(data); allShipments.push(...data); }
      if (summaryRes.ok) setSummary(await summaryRes.json());

      // Fetch truck info for all shipments
      if (allShipments.length > 0) fetchTruckInfo(allShipments);
    } catch (err) {
      console.error('Error fetching receiving data:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchTruckInfo, historyDays]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openStartReceiving = (shipment) => {
    setSelectedShipment(shipment);
    setFormMode('start');
    setFormData({
      receivedQuantity: shipment.quantity || '',
      binLocation: shipment.bin_location || '',
      discrepancies: shipment.discrepancies || '',
      receivingNotes: '',
      receivedBy: currentUser?.username || '',
    });
    setShowReceivingForm(true);
  };

  const openCompleteReceiving = (shipment) => {
    setSelectedShipment(shipment);
    setFormMode('complete');
    setFormData({
      receivedQuantity: shipment.received_quantity || shipment.quantity || '',
      binLocation: shipment.bin_location || '',
      discrepancies: shipment.discrepancies || '',
      receivingNotes: shipment.receiving_notes || '',
      receivedBy: shipment.received_by || currentUser?.username || '',
    });
    setShowReceivingForm(true);
  };

  const handleSubmitReceiving = async () => {
    if (!selectedShipment) return;
    setActionLoading(true);

    try {
      if (formMode === 'start') {
        // Start receiving
        const res = await authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/start-receiving`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receivedBy: formData.receivedBy }),
        });
        if (!res.ok) throw new Error('Failed to start receiving');

        // Then immediately complete
        const completeRes = await authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/complete-receiving`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receivedQuantity: parseInt(formData.receivedQuantity, 10) || 0,
            receivedBy: formData.receivedBy,
            binLocation: formData.binLocation,
            discrepancies: formData.discrepancies,
            receivingNotes: formData.receivingNotes,
          }),
        });
        if (!completeRes.ok) throw new Error('Failed to complete receiving');
        showSuccess('Shipment received successfully');
      } else {
        // Complete receiving
        const res = await authFetch(getApiUrl(`/api/shipments/${selectedShipment.id}/complete-receiving`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receivedQuantity: parseInt(formData.receivedQuantity, 10) || 0,
            receivedBy: formData.receivedBy,
            binLocation: formData.binLocation,
            discrepancies: formData.discrepancies,
            receivingNotes: formData.receivingNotes,
          }),
        });
        if (!res.ok) throw new Error('Failed to complete receiving');
        showSuccess('Receiving completed');
      }

      setShowReceivingForm(false);
      setSelectedShipment(null);
      fetchAll();
    } catch (err) {
      showError(err.message || 'Failed to process receiving');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateGRN = async (shipment) => {
    try {
      const res = await authFetch(getApiUrl(`/api/shipments/${shipment.id}/generate-grn`), { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate GRN');
      const { data } = await res.json();
      generateGRNPdf(data);
      showSuccess(`GRN generated: ${data.grn_number}`);
      fetchAll();
    } catch (err) {
      showError(err.message || 'Failed to generate GRN');
    }
  };

  const generateGRNPdf = (shipment) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('GOODS RECEIVED NOTE', pageWidth / 2, 16, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`GRN: ${shipment.grn_number || 'N/A'}`, pageWidth / 2, 26, { align: 'center' });

    // Reset text color
    doc.setTextColor(15, 23, 42);
    let y = 50;

    // GRN Details
    const details = [
      ['Date', new Date(shipment.receiving_date || shipment.updated_at).toLocaleDateString()],
      ['Order Ref', shipment.order_ref || 'N/A'],
      ['Supplier', shipment.supplier || 'N/A'],
      ['Product', shipment.product_name || 'N/A'],
      ['Qty Ordered', String(shipment.quantity || 'N/A')],
      ['Qty Received', String(shipment.received_quantity || 'N/A')],
      ['Warehouse', shipment.receiving_warehouse || 'N/A'],
      ['Bin Location', shipment.bin_location || 'N/A'],
      ['Received By', shipment.received_by || 'N/A'],
      ['Pallets', String(Math.round(shipment.pallet_qty) || 1)],
      ['CBM', String(shipment.cbm || 'N/A')],
    ];

    doc.setFontSize(10);
    for (const [label, value] of details) {
      doc.setFont('helvetica', 'bold');
      doc.text(label + ':', 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, 80, y);
      y += 8;
    }

    // Discrepancies
    if (shipment.discrepancies) {
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.text('Discrepancies:', 20, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(shipment.discrepancies, pageWidth - 40);
      doc.text(lines, 20, y);
      y += lines.length * 5;
    }

    // Notes
    if (shipment.receiving_notes) {
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Notes:', 20, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(shipment.receiving_notes, pageWidth - 40);
      doc.text(lines, 20, y);
      y += lines.length * 5;
    }

    // Signature lines
    y += 20;
    doc.setFontSize(10);
    doc.line(20, y, 90, y);
    doc.text('Received By', 35, y + 6);
    doc.line(120, y, 190, y);
    doc.text('Authorized By', 140, y + 6);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString()} | Synercore Import SCM`, pageWidth / 2, 285, { align: 'center' });

    doc.save(`${shipment.grn_number || 'GRN'}.pdf`);
  };

  const filterShipments = (list) => {
    if (!searchTerm) return list;
    const q = searchTerm.toLowerCase();
    return list.filter(s =>
      (s.order_ref || '').toLowerCase().includes(q) ||
      (s.supplier || '').toLowerCase().includes(q) ||
      (s.product_name || '').toLowerCase().includes(q) ||
      (s.receiving_warehouse || '').toLowerCase().includes(q)
    );
  };

  const tabs = [
    { id: 'queue', label: 'Receiving Queue', count: receivingQueue.length },
    { id: 'active', label: 'Active', count: activeReceiving.length },
    { id: 'history', label: 'Recent History', count: recentHistory.length },
  ];

  const summaryCards = [
    { label: 'Pending Receiving', value: summary.pendingReceiving, color: 'var(--warning)', icon: '\u{1F4E5}' },
    { label: 'Active Receiving', value: summary.activeReceiving, color: 'var(--info)', icon: '\u{1F504}' },
    { label: 'Received Today', value: summary.receivedToday, color: 'var(--success)', icon: '\u2705' },
    { label: 'Discrepancies', value: summary.discrepanciesToday, color: summary.discrepanciesToday > 0 ? 'var(--danger)' : 'var(--text-500)', icon: '\u26A0\uFE0F' },
  ];

  const renderTable = (shipments, actions) => {
    const filtered = filterShipments(shipments);
    if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-500)' }}>Loading...</div>;
    if (filtered.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-500)' }}>No shipments found</div>;

    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th>Order Ref</th>
              <th>Supplier</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Pallets</th>
              <th>Warehouse</th>
              <th>Truck</th>
              <th>Status</th>
              {activeTab === 'history' && <th>GRN</th>}
              {activeTab === 'history' && <th>Bin</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.order_ref || '-'}</td>
                <td>{s.supplier || '-'}</td>
                <td>{s.product_name || '-'}</td>
                <td>{s.received_quantity || s.quantity || '-'}</td>
                <td>{Math.round(s.pallet_qty) || 1}</td>
                <td>{s.receiving_warehouse || '-'}</td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-500)' }}>
                  {truckInfoMap[s.id] ? (
                    <span>{truckInfoMap[s.id].carrier || 'Truck'}{truckInfoMap[s.id].vehicle_reg ? ` (${truckInfoMap[s.id].vehicle_reg})` : ''}</span>
                  ) : '-'}
                </td>
                <td>
                  <span className={`pill ${s.latest_status === 'received' || s.latest_status === 'stored' ? 'pill-ok' : s.latest_status === 'receiving' ? 'pill-info' : 'pill-warn'}`}>
                    {STATUS_LABELS[s.latest_status] || s.latest_status}
                  </span>
                </td>
                {activeTab === 'history' && <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.grn_number || '-'}</td>}
                {activeTab === 'history' && <td>{s.bin_location || '-'}</td>}
                <td>{actions(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div className="brand-strip" />
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-900)' }}>
          Goods Receiving
        </h2>
        <p style={{ margin: 0, color: 'var(--text-500)', fontSize: '0.9rem' }}>
          Receive incoming shipments, confirm quantities, and generate goods received notes
        </p>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {summaryCards.map(card => (
          <div key={card.label} className="stat-card" style={{ borderLeft: `3px solid ${card.color}` }}>
            <h3 style={{ margin: '0 0 2px', fontSize: '20px', fontWeight: 700, color: 'var(--navy-900)' }}>
              {card.icon} {card.value}
            </h3>
            <p style={{ margin: 0, color: 'var(--text-500)', fontSize: '11px' }}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* Search + Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.id ? 'var(--accent)' : 'var(--surface-2)',
                color: activeTab === tab.id ? '#fff' : 'var(--text-700)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.label} {tab.count > 0 && <span style={{ opacity: 0.8 }}>({tab.count})</span>}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {activeTab === 'history' && (
            <select
              value={historyDays}
              onChange={e => setHistoryDays(Number(e.target.value))}
              className="input"
              style={{ fontSize: '0.85rem' }}
              aria-label="History range"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 365 days</option>
            </select>
          )}
          <input
            type="text"
            placeholder="Search shipments..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input"
            style={{ width: '240px', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {activeTab === 'queue' && renderTable(receivingQueue, (s) => (
          <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={() => openStartReceiving(s)}>
            Receive
          </button>
        ))}

        {activeTab === 'active' && renderTable(activeReceiving, (s) => (
          <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={() => openCompleteReceiving(s)}>
            Complete
          </button>
        ))}

        {activeTab === 'history' && renderTable(recentHistory, (s) => (
          <div style={{ display: 'flex', gap: '4px' }}>
            {!s.grn_number && (
              <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '4px 8px' }} onClick={() => handleGenerateGRN(s)}>
                Generate GRN
              </button>
            )}
            {s.grn_number && (
              <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '4px 8px' }} onClick={() => generateGRNPdf(s)}>
                Download GRN
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Receiving Form Modal */}
      {showReceivingForm && selectedShipment && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', width: '90%', maxWidth: '520px',
            maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border)'
          }}>
            <h3 style={{ margin: '0 0 1rem', color: 'var(--text-900)' }}>
              {formMode === 'start' ? 'Receive Shipment' : 'Complete Receiving'}
            </h3>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-500)', fontSize: '0.85rem' }}>
              {selectedShipment.order_ref} &mdash; {selectedShipment.supplier} &mdash; {selectedShipment.product_name}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Received Quantity</label>
                <input
                  type="number"
                  value={formData.receivedQuantity}
                  onChange={e => setFormData({ ...formData, receivedQuantity: e.target.value })}
                  className="input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder={`Expected: ${selectedShipment.quantity || 'N/A'}`}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Bin Location</label>
                <input
                  type="text"
                  value={formData.binLocation}
                  onChange={e => setFormData({ ...formData, binLocation: e.target.value })}
                  className="input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="e.g. A-12-3"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Discrepancies</label>
                <textarea
                  value={formData.discrepancies}
                  onChange={e => setFormData({ ...formData, discrepancies: e.target.value })}
                  className="input"
                  style={{ width: '100%', minHeight: '60px', boxSizing: 'border-box', resize: 'vertical' }}
                  placeholder="Note any damage, shortages, or discrepancies..."
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Notes</label>
                <textarea
                  value={formData.receivingNotes}
                  onChange={e => setFormData({ ...formData, receivingNotes: e.target.value })}
                  className="input"
                  style={{ width: '100%', minHeight: '50px', boxSizing: 'border-box', resize: 'vertical' }}
                  placeholder="Additional notes..."
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' }}>Received By</label>
                <input
                  type="text"
                  value={formData.receivedBy}
                  onChange={e => setFormData({ ...formData, receivedBy: e.target.value })}
                  className="input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost" onClick={() => { setShowReceivingForm(false); setSelectedShipment(null); }} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSubmitReceiving} disabled={actionLoading}>
                {actionLoading ? 'Processing...' : formMode === 'start' ? 'Receive & Complete' : 'Complete Receiving'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoodsReceiving;
