import React, { useMemo, useState, useEffect } from 'react';
import { authFetch } from '../utils/authFetch';
import { getApiUrl } from '../config/api';
import { groupRatesByRoute } from '../utils/quoteRequestRates';

const TRANSPORT_LABELS = { sea: 'Sea', air: 'Air', road: 'Road' };

function FreightQuoteRatesReport({ showTitle = true }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuoteRequests = async () => {
      try {
        const response = await authFetch(getApiUrl('/api/quote-requests'));
        if (response.ok) {
          const result = await response.json();
          setRequests(result.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch quote requests for report:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuoteRequests();
  }, []);

  const { quoted, open, routeGroups, recent } = useMemo(() => {
    const quotedReqs = requests.filter(r => r.status === 'quoted' && r.quoted_rate);
    const openReqs = requests.filter(r => r.status === 'draft' || r.status === 'sent');
    const groups = groupRatesByRoute(quotedReqs);
    const recentQuotes = [...quotedReqs]
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 20);
    return { quoted: quotedReqs, open: openReqs, routeGroups: groups, recent: recentQuotes };
  }, [requests]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', margin: '1rem 0' }}>
        {showTitle && <h3>🚢 Freight Quote Rates</h3>}
        <p>Loading quote request data...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', margin: '1rem 0' }}>
        {showTitle && <h3>🚢 Freight Quote Rates</h3>}
        <p>No freight quote requests yet.</p>
      </div>
    );
  }

  return (
    <div style={{ margin: '1rem 0' }}>
      {showTitle && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#2c3e50' }}>🚢 Freight Quote Rates</h3>
          <p style={{ color: '#666', margin: 0 }}>Rates received from forwarders, by route</p>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#166534' }}>{quoted.length}</div>
          <div style={{ fontSize: '0.8rem', color: '#166534' }}>Rates Received</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#92400e' }}>{open.length}</div>
          <div style={{ fontSize: '0.8rem', color: '#92400e' }}>Awaiting a Rate</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e40af' }}>{routeGroups.length}</div>
          <div style={{ fontSize: '0.8rem', color: '#1e40af' }}>Routes Tracked</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2c3e50' }}>
            {routeGroups.filter(g => g.entries.length > 1).length}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Routes With Multiple Quotes</div>
        </div>
      </div>

      {/* Best Rate by Route */}
      {routeGroups.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 0.75rem', color: '#2c3e50', fontSize: '0.95rem' }}>Best Rate by Route</h4>
          <div style={{ overflowX: 'auto', border: '1px solid #e9ecef', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Route</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Mode</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Quotes</th>
                  <th style={{ padding: '10px 12px' }}>Best Forwarder</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Best Rate</th>
                </tr>
              </thead>
              <tbody>
                {routeGroups.map((group, i) => {
                  const best = group.entries[0];
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '10px 12px' }}>{group.origin} → {group.destination}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{TRANSPORT_LABELS[group.transport_mode] || group.transport_mode}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{group.entries.length}</td>
                      <td style={{ padding: '10px 12px' }}>{best.forwarder_name}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#2c3e50' }}>
                        {best.quoted_currency} {Number(best.quoted_rate).toLocaleString()}
                        {group.mixedCurrency && <span title="Quotes on this route are in different currencies" style={{ marginLeft: 4 }}>⚠️</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recently Received Rates */}
      {recent.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 0.75rem', color: '#2c3e50', fontSize: '0.95rem' }}>Recently Received Rates</h4>
          <div style={{ overflowX: 'auto', border: '1px solid #e9ecef', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Forwarder</th>
                  <th style={{ padding: '10px 12px' }}>Route</th>
                  <th style={{ padding: '10px 12px' }}>Quote Ref</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Rate</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Received</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: '10px 12px' }}>{r.forwarder_name}</td>
                    <td style={{ padding: '10px 12px', color: '#666' }}>{r.origin || '—'} → {r.destination || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#666' }}>{r.quote_reference || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#2c3e50' }}>
                      {r.quoted_currency} {Number(r.quoted_rate).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#666' }}>
                      {new Date(r.updated_at || r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default FreightQuoteRatesReport;
