import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../utils/authFetch';
import { getApiUrl } from '../config/api';
import { useNotification } from '../contexts/NotificationContext';

const CLAIM_STATUS_STYLES = {
  open: { backgroundColor: '#fef3c7', color: '#92400e' },
  submitted: { backgroundColor: '#dbeafe', color: '#1e40af' },
  credited: { backgroundColor: '#dcfce7', color: '#166534' },
  closed: { backgroundColor: '#f3f4f6', color: '#6b7280' },
};

const CLAIM_STATUS_LABELS = {
  open: 'Open',
  submitted: 'Submitted',
  credited: 'Credited',
  closed: 'Closed',
};

function rejectedQtyFor(shipment) {
  if (shipment.latestStatus === 'archived' && shipment.rejectionReason) {
    return Number(shipment.quantity) || 0;
  }
  return (Number(shipment.quantity) || 0) - (Number(shipment.receivedQuantity) || 0);
}

function reasonFor(shipment) {
  return shipment.discrepancies || shipment.rejectionReason || shipment.inspectionNotes || '-';
}

function dateFor(shipment) {
  const d = shipment.rejectionDate || shipment.receivingDate || shipment.updatedAt;
  return d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
}

function RejectionsTracker({ shipments, onRefresh, loading }) {
  const { showError } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const globalSearchTerm = searchParams.get('search') || '';
  const [searchTerm, setSearchTerm] = useState(globalSearchTerm);
  const [statusFilter, setStatusFilter] = useState(globalSearchTerm ? 'all' : 'open');
  const [expandedId, setExpandedId] = useState(null);
  const [photosByShipment, setPhotosByShipment] = useState({});
  const [photoBlobUrls, setPhotoBlobUrls] = useState({});
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    if (globalSearchTerm) {
      setSearchTerm(globalSearchTerm);
      setStatusFilter('all');
      const params = new URLSearchParams(searchParams);
      params.delete('search');
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearchTerm]);

  const rows = (shipments || []).filter((s) => {
    const claimStatus = s.claimStatus || 'open';
    if (statusFilter !== 'all') {
      if (statusFilter === 'open') {
        if (claimStatus !== 'open' && claimStatus !== 'submitted') return false;
      } else if (claimStatus !== statusFilter) {
        return false;
      }
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const haystack = `${s.orderRef || ''} ${s.supplier || ''} ${s.productName || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const updateClaim = async (shipment, updates) => {
    setSavingId(shipment.id);
    try {
      const res = await authFetch(getApiUrl(`/api/shipments/${shipment.id}/claim`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        if (onRefresh) await onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        showError(`Failed to update claim: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      showError('Failed to update claim. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  const fetchPhotos = async (shipmentId) => {
    try {
      const res = await authFetch(getApiUrl(`/api/shipments/${shipmentId}/damage-photos`));
      if (!res.ok) return;
      const { data } = await res.json();
      setPhotosByShipment((prev) => ({ ...prev, [shipmentId]: data }));
      data.forEach(async (photo) => {
        try {
          const imgRes = await authFetch(getApiUrl(`/api/shipments/${shipmentId}/damage-photos/${photo.id}`));
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            setPhotoBlobUrls((prev) => ({ ...prev, [photo.id]: URL.createObjectURL(blob) }));
          }
        } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  };

  const toggleExpand = (shipment) => {
    if (expandedId === shipment.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(shipment.id);
    if (!(shipment.id in photosByShipment)) fetchPhotos(shipment.id);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <div>Loading rejection claims...</div>
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
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-900)' }}>Rejection Claims</h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-500)' }}>
            Track supplier credit/refund claims for rejected or partially-accepted shipments
          </p>
        </div>
        <input
          type="text"
          placeholder="Search..."
          aria-label="Search rejection claims"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
            fontSize: 13, width: 200, background: 'var(--surface)'
          }}
        />
      </div>

      {searchTerm && (
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-500)' }}>Filtered by: <strong>{searchTerm}</strong></span>
          <button onClick={() => setSearchTerm('')} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}>Clear</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['open', 'credited', 'closed', 'all'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            style={{
              padding: '8px 16px',
              backgroundColor: statusFilter === status ? 'var(--navy-900)' : 'var(--surface-2)',
              color: statusFilter === status ? 'white' : 'var(--text-700)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: statusFilter === status ? '600' : '400',
              textTransform: 'capitalize',
            }}
          >
            {status}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem', backgroundColor: 'var(--surface-2)',
          borderRadius: '8px', border: '2px dashed var(--border)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-500)' }}>No {statusFilter === 'all' ? '' : statusFilter} claims</h3>
          <p style={{ margin: 0, color: 'var(--text-500)' }}>
            Rejected or partially-received shipments needing a supplier credit/refund will appear here.
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
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Rejected Qty</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Reason</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Claim Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Reference</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Notes</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((shipment) => (
                <React.Fragment key={shipment.id}>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px 16px', fontWeight: '500' }}>
                      <span
                        onClick={() => toggleExpand(shipment)}
                        style={{ color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dashed var(--accent)' }}
                        title="View damage photos"
                      >
                        {shipment.orderRef || shipment.id}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{shipment.supplier || '-'}</td>
                    <td style={{ padding: '12px 16px' }}>{shipment.productName || '-'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--warning)' }}>
                      {rejectedQtyFor(shipment)}
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: 260 }}>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{reasonFor(shipment)}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <select
                        value={shipment.claimStatus || 'open'}
                        disabled={savingId === shipment.id}
                        onChange={(e) => updateClaim(shipment, { claimStatus: e.target.value })}
                        style={{
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 500,
                          border: 'none', cursor: 'pointer',
                          ...(CLAIM_STATUS_STYLES[shipment.claimStatus || 'open'] || CLAIM_STATUS_STYLES.open),
                        }}
                      >
                        {Object.keys(CLAIM_STATUS_LABELS).map((s) => (
                          <option key={s} value={s}>{CLAIM_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <input
                        type="text"
                        defaultValue={shipment.claimReference || ''}
                        placeholder="Credit note #"
                        disabled={savingId === shipment.id}
                        onBlur={(e) => {
                          if (e.target.value !== (shipment.claimReference || '')) {
                            updateClaim(shipment, { claimReference: e.target.value });
                          }
                        }}
                        style={{ width: '110px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.8rem' }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <input
                        type="text"
                        defaultValue={shipment.claimNotes || ''}
                        placeholder="Notes..."
                        disabled={savingId === shipment.id}
                        onBlur={(e) => {
                          if (e.target.value !== (shipment.claimNotes || '')) {
                            updateClaim(shipment, { claimNotes: e.target.value });
                          }
                        }}
                        style={{ width: '140px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.8rem' }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-500)' }}>
                      {dateFor(shipment)}
                    </td>
                  </tr>
                  {expandedId === shipment.id && (
                    <tr>
                      <td colSpan={9} style={{ padding: '12px 16px', backgroundColor: 'var(--surface-2)' }}>
                        <strong style={{ fontSize: '0.8rem', color: 'var(--text-700)' }}>📷 Damage Photos</strong>
                        {(photosByShipment[shipment.id] || []).length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-500)', marginTop: 4 }}>
                            {shipment.id in photosByShipment ? 'No photos uploaded for this shipment.' : 'Loading...'}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 8 }}>
                            {photosByShipment[shipment.id].map((photo) => (
                              <img
                                key={photo.id}
                                src={photoBlobUrls[photo.id]}
                                alt={photo.file_name}
                                style={{
                                  width: '72px', height: '72px', objectFit: 'cover', borderRadius: '6px',
                                  border: '1px solid var(--border)', backgroundColor: '#e9ecef',
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default RejectionsTracker;
