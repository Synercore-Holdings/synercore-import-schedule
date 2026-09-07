import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../utils/authFetch';
import { getApiUrl } from '../config/api';
import { useNotification } from '../contexts/NotificationContext';
import { SupplierMetrics } from '../utils/supplierMetrics';
import ShipmentFormModal from './ShipmentFormModal';

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
}

function LateShipmentsTracker({ shipments, onUpdateShipment, onRefresh, loading }) {
  const navigate = useNavigate();
  const { showError } = useNotification();
  const [statusFilter, setStatusFilter] = useState('needs-review');
  const [searchTerm, setSearchTerm] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [editingShipment, setEditingShipment] = useState(null);

  const uniqueSuppliers = useMemo(() => {
    const names = new Set();
    (shipments || []).forEach(s => { if (s.supplier) names.add(s.supplier.trim()); });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [shipments]);

  // Every warehouse-confirmed shipment that arrived after its scheduled
  // date, across all suppliers — the same population Supplier Performance's
  // on-time % is built from, so correcting/confirming here updates it there.
  const lateRows = useMemo(() => {
    return SupplierMetrics.getAllShipmentAudit(shipments || [])
      .filter(a => !a.onTime)
      .sort((a, b) => b.diffDays - a.diffDays);
  }, [shipments]);

  const needsReviewCount = lateRows.filter(a => !a.lateConfirmed).length;
  const confirmedCount = lateRows.filter(a => a.lateConfirmed).length;

  const rows = lateRows.filter(a => {
    if (statusFilter === 'needs-review' && a.lateConfirmed) return false;
    if (statusFilter === 'confirmed' && !a.lateConfirmed) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const haystack = `${a.orderRef || ''} ${a.supplierName || ''} ${a.productName || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const updateLateReview = async (row, lateConfirmed) => {
    setSavingId(row.shipment.id);
    try {
      const res = await authFetch(getApiUrl(`/api/shipments/${row.shipment.id}/late-review`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lateConfirmed }),
      });
      if (res.ok) {
        if (onRefresh) await onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        showError(`Failed to update: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      showError('Failed to update. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveShipmentEdit = async (shipmentData) => {
    if (!onUpdateShipment || !editingShipment) return;
    await onUpdateShipment(editingShipment.id, shipmentData);
    setEditingShipment(null);
  };

  const goToSupplierPerformance = (row) => {
    navigate(`/supplier-performance?supplier=${encodeURIComponent(row.supplierName)}&highlight=${encodeURIComponent(row.orderRef)}`);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <div>Loading late shipments...</div>
      </div>
    );
  }

  return (
    <div className="window-content">
      <div className="brand-strip" />

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '0.75rem', paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-900)' }}>Late Shipments</h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-500)' }}>
            Shipments that arrived after their scheduled date — correct the data if it's wrong, or confirm they're genuinely late. Feeds Supplier Performance's on-time %.
          </p>
        </div>
        <input
          type="text"
          placeholder="Search..."
          aria-label="Search late shipments"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
            fontSize: 13, width: 200, background: 'var(--surface)'
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div className="dash-panel" style={{ flex: '1 1 160px', minWidth: 140, textAlign: 'center', padding: '14px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Needs Review</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#dc3545' }}>{needsReviewCount}</div>
        </div>
        <div className="dash-panel" style={{ flex: '1 1 160px', minWidth: 140, textAlign: 'center', padding: '14px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Confirmed Late</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-900)' }}>{confirmedCount}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { key: 'needs-review', label: 'Needs Review' },
          { key: 'confirmed', label: 'Confirmed Late' },
          { key: 'all', label: 'All' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            style={{
              padding: '8px 16px',
              backgroundColor: statusFilter === key ? 'var(--navy-900)' : 'var(--surface-2)',
              color: statusFilter === key ? 'white' : 'var(--text-700)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: statusFilter === key ? '600' : '400',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem', backgroundColor: 'var(--surface-2)',
          borderRadius: '8px', border: '2px dashed var(--border)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-500)' }}>
            {statusFilter === 'needs-review' ? 'Nothing needs review' : 'No late shipments'}
          </h3>
          <p style={{ margin: 0, color: 'var(--text-500)' }}>
            Warehouse-confirmed shipments that arrived after their scheduled date will appear here.
          </p>
        </div>
      ) : (
        <div className="dash-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Order Ref</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Supplier</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Product</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Scheduled</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Actual</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Days Late</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.orderRef} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                    <span
                      onClick={() => goToSupplierPerformance(row)}
                      style={{ color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dashed var(--accent)' }}
                      title="View in Supplier Performance"
                    >
                      {row.orderRef}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{row.supplierName || '-'}</td>
                  <td style={{ padding: '12px 16px' }}>{row.productName || '-'}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-700)' }}>
                    {fmtDate(row.scheduledDate)}
                    {row.usedFallbackBenchmark && (
                      <span title="No original-schedule baseline stored for this shipment — using its current/live scheduled week instead." style={{ marginLeft: 4, color: 'var(--text-500)', cursor: 'help' }}>*</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-700)' }}>
                    {fmtDate(row.actualDate)}
                    {!row.isVerifiedArrival && (
                      <span title="No manually-entered arrival date — using the receiving-workflow timestamp instead." style={{ marginLeft: 4, color: 'var(--text-500)', cursor: 'help' }}>*</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#dc3545' }}>
                    {row.diffDays} day{row.diffDays !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                      backgroundColor: row.lateConfirmed ? '#dcfce7' : '#fef3c7',
                      color: row.lateConfirmed ? '#166534' : '#92400e',
                    }}>
                      {row.lateConfirmed ? 'Confirmed Late' : 'Needs Review'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setEditingShipment(row.shipment)}
                      disabled={savingId === row.shipment.id}
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }}
                    >
                      Correct
                    </button>
                    <button
                      onClick={() => updateLateReview(row, !row.lateConfirmed)}
                      disabled={savingId === row.shipment.id}
                      style={{
                        fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        backgroundColor: row.lateConfirmed ? 'var(--surface-2)' : 'var(--navy-900)',
                        color: row.lateConfirmed ? 'var(--text-700)' : 'white',
                        fontWeight: 600,
                      }}
                    >
                      {row.lateConfirmed ? 'Unconfirm' : 'Confirm Late'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onUpdateShipment && (
        <ShipmentFormModal
          isOpen={!!editingShipment}
          onClose={() => setEditingShipment(null)}
          onSubmit={handleSaveShipmentEdit}
          initialData={editingShipment}
          uniqueSuppliers={uniqueSuppliers}
        />
      )}
    </div>
  );
}

export default LateShipmentsTracker;
