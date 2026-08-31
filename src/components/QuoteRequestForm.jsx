import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../config/api';
import { authFetch } from '../utils/authFetch';
import { useNotification } from '../contexts/NotificationContext';
import { generateQuoteRequestPDF } from '../utils/quoteRequestPdf';

const STATUS_STYLES = {
  draft: { backgroundColor: '#f3f4f6', color: '#6b7280' },
  sent: { backgroundColor: '#dbeafe', color: '#1e40af' },
  quoted: { backgroundColor: '#dcfce7', color: '#166534' },
  expired: { backgroundColor: '#fef3c7', color: '#92400e' },
  cancelled: { backgroundColor: '#fef2f2', color: '#dc2626' },
};

const TRANSPORT_LABELS = { sea: 'Sea', air: 'Air', road: 'Road' };
const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

const EMPTY_FORM = {
  forwarder_name: '', forwarder_email: '', transport_mode: 'sea', incoterm: '',
  origin: '', destination: '', supplier_name: '', cargo_description: '', hs_code: '',
  gross_weight_kg: '', volume_cbm: '', pallet_count: '', cargo_ready_date: '', required_date: '', notes: '',
};

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem',
};
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-700)', marginBottom: '4px' };
const fieldWrap = { marginBottom: '0.85rem' };

function QuoteRequestForm({ onClose }) {
  const { confirm: confirmAction, showSuccess, showError } = useNotification();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const url = statusFilter === 'all'
        ? getApiUrl('/api/quote-requests')
        : getApiUrl(`/api/quote-requests?status=${statusFilter}`);
      const response = await authFetch(url);
      if (response.ok) {
        const result = await response.json();
        setRequests(result.data || []);
      } else {
        setError('Failed to load quote requests');
      }
    } catch (err) {
      console.error('Failed to fetch quote requests:', err);
      setError('Failed to load quote requests');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.forwarder_name.trim()) return;
    setSaving(true);
    try {
      const response = await authFetch(getApiUrl('/api/quote-requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (response.ok) {
        const result = await response.json();
        setShowForm(false);
        setForm(EMPTY_FORM);
        await fetchRequests();
        generateQuoteRequestPDF(result.data);
        showSuccess?.('Quote request created — PDF downloaded');
      } else {
        const err = await response.json().catch(() => ({}));
        showError?.(err.error || 'Failed to create quote request');
      }
    } catch (err) {
      console.error('Failed to create quote request:', err);
      showError?.('Failed to create quote request');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      const response = await authFetch(getApiUrl(`/api/quote-requests/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (response.ok) fetchRequests();
    } catch (err) {
      console.error('Failed to update request:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction({ title: 'Delete Quote Request', message: 'Are you sure you want to delete this request?', type: 'danger', confirmText: 'Delete' }))) return;
    try {
      const response = await authFetch(getApiUrl(`/api/quote-requests/${id}`), { method: 'DELETE' });
      if (response.ok) fetchRequests();
    } catch (err) {
      console.error('Failed to delete request:', err);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'white', overflow: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Freight Quote Requests</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-500)', fontSize: '0.8rem' }}>Request and track rates from forwarders/shipping agents</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
            style={{
              background: 'var(--navy-900)', border: 'none', color: 'white',
              padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            }}
          >
            + New Quote Request
          </button>
          <button
            onClick={() => onClose ? onClose() : window.history.back()}
            style={{
              background: 'rgba(0,0,0,0.05)', border: '1px solid #d1d5db',
              color: '#374151', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 500,
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem', flex: 1 }}>
        {error && (
          <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', marginBottom: '1rem' }}>
            {error}
            <button onClick={() => setError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>x</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {['all', 'draft', 'sent', 'quoted', 'expired', 'cancelled'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: '8px 16px',
                backgroundColor: statusFilter === status ? 'var(--navy-900)' : 'var(--surface-2)',
                color: statusFilter === status ? 'white' : 'var(--text-700)',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '0.85rem', fontWeight: statusFilter === status ? '600' : '400',
                textTransform: 'capitalize',
              }}
            >
              {status}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)' }}>Loading...</div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-500)', backgroundColor: 'var(--surface-2)', borderRadius: '8px' }}>
            No {statusFilter === 'all' ? '' : statusFilter} quote requests found.
          </div>
        ) : (
          <div className="dash-panel" style={{ padding: 0, overflow: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Ref</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Forwarder</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Route</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Mode</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Cargo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.8rem' }}>QR-{String(req.id).padStart(5, '0')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 500 }}>{req.forwarder_name}</div>
                      {req.forwarder_email && <div style={{ fontSize: '0.75rem', color: 'var(--text-500)' }}>{req.forwarder_email}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                      {req.origin || '—'} → {req.destination || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem' }}>{TRANSPORT_LABELS[req.transport_mode] || req.transport_mode}</td>
                    <td style={{ padding: '12px 16px', maxWidth: '220px' }}>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{req.cargo_description || '—'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500',
                        textTransform: 'capitalize',
                        ...(STATUS_STYLES[req.status] || STATUS_STYLES.draft)
                      }}>
                        {req.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-500)' }}>
                      {new Date(req.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => generateQuoteRequestPDF(req)}
                          style={{ padding: '5px 8px', backgroundColor: 'var(--navy-900)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                        >
                          PDF
                        </button>
                        {req.status === 'draft' && (
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'sent')}
                            style={{ padding: '5px 8px', backgroundColor: 'var(--info)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                          >
                            Mark Sent
                          </button>
                        )}
                        {req.status === 'sent' && (
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'quoted')}
                            style={{ padding: '5px 8px', backgroundColor: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                          >
                            Mark Quoted
                          </button>
                        )}
                        {(req.status === 'draft' || req.status === 'sent') && (
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'cancelled')}
                            style={{ padding: '5px 8px', backgroundColor: 'var(--text-500)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(req.id)}
                          style={{ padding: '5px 8px', backgroundColor: 'var(--danger)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '10px', maxWidth: '640px', width: '100%',
            maxHeight: '90vh', overflow: 'auto', padding: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#0f172a' }}>New Quote Request</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Forwarder / Agent Name *</label>
                  <input style={inputStyle} value={form.forwarder_name} onChange={e => handleFieldChange('forwarder_name', e.target.value)} required />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Forwarder Email</label>
                  <input type="email" style={inputStyle} value={form.forwarder_email} onChange={e => handleFieldChange('forwarder_email', e.target.value)} />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Transport Mode</label>
                  <select style={inputStyle} value={form.transport_mode} onChange={e => handleFieldChange('transport_mode', e.target.value)}>
                    <option value="sea">Sea</option>
                    <option value="air">Air</option>
                    <option value="road">Road</option>
                  </select>
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Incoterm</label>
                  <select style={inputStyle} value={form.incoterm} onChange={e => handleFieldChange('incoterm', e.target.value)}>
                    <option value="">—</option>
                    {INCOTERMS.map(term => <option key={term} value={term}>{term}</option>)}
                  </select>
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Origin</label>
                  <input style={inputStyle} value={form.origin} onChange={e => handleFieldChange('origin', e.target.value)} placeholder="Port / city, country" />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Destination</label>
                  <input style={inputStyle} value={form.destination} onChange={e => handleFieldChange('destination', e.target.value)} placeholder="Port / city, country" />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Supplier</label>
                  <input style={inputStyle} value={form.supplier_name} onChange={e => handleFieldChange('supplier_name', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>HS Code</label>
                  <input style={inputStyle} value={form.hs_code} onChange={e => handleFieldChange('hs_code', e.target.value)} />
                </div>

                <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Cargo Description</label>
                  <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={form.cargo_description} onChange={e => handleFieldChange('cargo_description', e.target.value)} />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Gross Weight (kg)</label>
                  <input type="number" min="0" step="any" style={inputStyle} value={form.gross_weight_kg} onChange={e => handleFieldChange('gross_weight_kg', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Volume (CBM)</label>
                  <input type="number" min="0" step="any" style={inputStyle} value={form.volume_cbm} onChange={e => handleFieldChange('volume_cbm', e.target.value)} />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Pallets / Packages</label>
                  <input type="number" min="0" step="1" style={inputStyle} value={form.pallet_count} onChange={e => handleFieldChange('pallet_count', e.target.value)} />
                </div>
                <div />

                <div style={fieldWrap}>
                  <label style={labelStyle}>Cargo Ready Date</label>
                  <input type="date" style={inputStyle} value={form.cargo_ready_date} onChange={e => handleFieldChange('cargo_ready_date', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Required Delivery Date</label>
                  <input type="date" style={inputStyle} value={form.required_date} onChange={e => handleFieldChange('required_date', e.target.value)} />
                </div>

                <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Notes / Special Instructions</label>
                  <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={form.notes} onChange={e => handleFieldChange('notes', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{
                  padding: '8px 16px', background: 'rgba(0,0,0,0.05)', border: '1px solid #d1d5db',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
                }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={{
                  padding: '8px 16px', background: 'var(--navy-900)', color: 'white', border: 'none',
                  borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600,
                  opacity: saving ? 0.7 : 1,
                }}>
                  {saving ? 'Saving...' : 'Create & Download PDF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuoteRequestForm;
