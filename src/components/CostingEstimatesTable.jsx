import React, { useState, useMemo, useEffect } from 'react';
import {
  calculateAllTotals,
  formatCurrency,
  formatNumber,
} from '../utils/costingCalculations';

function CostingEstimatesTable({ estimates, isAdmin, onEdit, onView, onDelete, onDuplicate, onGeneratePDF, onEmailEstimate, isExport = false, initialTransportModeFilter = 'all' }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [transportModeFilter, setTransportModeFilter] = useState(initialTransportModeFilter); // 'all', 'sea', 'air'

  useEffect(() => {
    setTransportModeFilter(initialTransportModeFilter);
  }, [initialTransportModeFilter]);

  const partyLabel = isExport ? 'Customer' : 'Supplier';
  const partyFor = (est) => (isExport ? est.customer_name : est.supplier_name) || '-';

  // Filter and sort estimates (exclude archived - those show under Suppliers)
  const filteredEstimates = useMemo(() => {
    return estimates
      .filter(est => {
        // Exclude archived estimates from main view
        if (est.status === 'archived') return false;
        // Filter by transport mode
        if (transportModeFilter !== 'all' && (est.transport_mode || 'sea') !== transportModeFilter) return false;
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        const ref = (est.reference_number || '').toLowerCase();
        const party = ((isExport ? est.customer_name : est.supplier_name) || '').toLowerCase();
        const products = (est.products || []).map(p => (p.name || '').toLowerCase()).join(' ');
        return ref.includes(search) || party.includes(search) || products.includes(search);
      })
      .sort((a, b) => {
        const dateA = new Date(a.costing_date || a.created_at || 0);
        const dateB = new Date(b.costing_date || b.created_at || 0);
        const costingDateDiff = dateB - dateA;
        if (costingDateDiff !== 0) return costingDateDiff;

        const createdA = new Date(a.created_at || 0);
        const createdB = new Date(b.created_at || 0);
        return createdB - createdA; // newest first
      });
  }, [estimates, searchTerm, transportModeFilter, isExport]);

  return (
    <div className="dash-panel" style={{ overflow: 'hidden' }}>
      {/* Search and Sort Controls */}
      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '2px solid #e5e7eb' }}>
          {['all', 'sea', 'air'].map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setTransportModeFilter(mode)}
              style={{
                padding: '6px 14px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.8rem',
                letterSpacing: '0.02em',
                backgroundColor:
                  transportModeFilter === mode
                    ? mode === 'sea' ? '#1d4ed8'
                      : mode === 'air' ? '#7c3aed'
                      : '#374151'
                    : '#f3f4f6',
                color: transportModeFilter === mode ? 'white' : '#6b7280',
                transition: 'all 0.15s ease',
              }}
            >
              {mode === 'all' ? 'All' : mode === 'sea' ? 'Sea' : 'Air'}
            </button>
          ))}
        </div>
        <div style={{ flex: '1', minWidth: '200px', maxWidth: '300px' }}>
          <input
            type="text"
            placeholder={`Search by reference, ${partyLabel.toLowerCase()}, or product...`}
            aria-label="Search import costings"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.9rem',
            }}
          />
        </div>
        <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
          {filteredEstimates.length} of {estimates.filter(e => e.status !== 'archived').length} estimates
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Reference</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Date</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{partyLabel}</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Port</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Container</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb', minWidth: '280px' }}>Products</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Total Landed</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{isExport ? 'Cost/KG' : 'Landed Cost/KG'}</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEstimates.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
                  {searchTerm ? 'No estimates match your search.' : 'No cost estimates yet. Create your first estimate to get started.'}
                </td>
              </tr>
            ) : (
              filteredEstimates.map((est) => {
                const totals = calculateAllTotals(est);
                const products = est.products || [];
                return (
                  <tr key={est.id} style={{ borderBottom: '1px solid #e5e7eb', verticalAlign: 'top' }}>
                    <td style={{ padding: '12px 16px', color: '#111827' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {est.reference_number || est.id.slice(0, 8)}
                        {est.transport_mode === 'air' && (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '600', backgroundColor: '#ede9fe', color: '#7c3aed' }}>AIR</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {est.costing_date
                        ? new Date(est.costing_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
                        : est.created_at
                          ? new Date(est.created_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>{partyFor(est)}</td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {est.transport_mode === 'air'
                        ? (est.airport_of_arrival || '-')
                        : (est.port_of_discharge || '-')}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {est.transport_mode === 'air'
                        ? (est.airline_name || '-')
                        : (est.container_type || '-')}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {products.length === 0 ? (
                        <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No products</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {products.map((p, idx) => (
                            <div key={p._id || p.name || idx} style={{
                              padding: '6px 8px',
                              backgroundColor: '#fef3c7',
                              borderRadius: '4px',
                              borderLeft: '3px solid #f59e0b',
                              fontSize: '0.8rem'
                            }}>
                              <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '2px' }}>
                                {p.name || `Product ${idx + 1}`}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', color: '#78350f', fontSize: '0.75rem' }}>
                                {p.hs_code && <span>HS: {p.hs_code}</span>}
                                {p.pack_size && <span>Size: {p.pack_size}</span>}
                                {p.pack_type && <span>Type: {p.pack_type}</span>}
                                {p.weight_kg > 0 && <span>Wt: {formatNumber(p.weight_kg)}kg</span>}
                                {p.rate_per_kg > 0 && <span>Rate: {formatNumber(p.rate_per_kg)}/{p.currency || 'USD'}</span>}
                                {p.invoice_value > 0 && <span style={{ fontWeight: '600' }}>Val: {formatNumber(p.invoice_value)} {p.currency || 'USD'}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    {(() => {
                      const rowIsExport = isExport || est.direction === 'export';
                      const presCur = rowIsExport
                        ? (est.presentation_currency === 'EUR' ? 'EUR' : 'USD')
                        : null;
                      const rate = rowIsExport
                        ? (parseFloat(presCur === 'EUR' ? est.roe_eur : est.roe_origin) || 0)
                        : 0;
                      const toPres = (zar) => (rowIsExport && rate > 0 ? zar / rate : null);
                      const landedForeign = toPres(totals.total_landed_cost_zar);
                      const kgForeign = toPres(totals.all_in_warehouse_cost_per_kg_zar);
                      return (
                        <>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#059669' }}>
                            <div style={{ fontWeight: '600' }}>{formatCurrency(totals.total_landed_cost_zar)}</div>
                            {landedForeign !== null && (
                              <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: '2px' }}>
                                {formatCurrency(landedForeign, presCur)}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#d97706' }}>
                            {rowIsExport && est.inco_terms && (
                              <div style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: '600', marginBottom: '2px', letterSpacing: '0.03em' }}>
                                {est.inco_terms}
                              </div>
                            )}
                            <div style={{ fontWeight: '500' }}>{formatCurrency(totals.all_in_warehouse_cost_per_kg_zar)}</div>
                            {kgForeign !== null && (
                              <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: '2px' }}>
                                {formatCurrency(kgForeign, presCur)}
                              </div>
                            )}
                          </td>
                        </>
                      );
                    })()}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500',
                        backgroundColor: est.status === 'final' ? '#dcfce7' : est.status === 'archived' ? '#f3f4f6' : '#fef3c7',
                        color: est.status === 'final' ? '#166534' : est.status === 'archived' ? '#6b7280' : '#92400e'
                      }}>
                        {est.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button
                          onClick={() => onView(est)}
                          style={{ padding: '6px 10px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                          View
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => onEdit(est)}
                            style={{ padding: '6px 10px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => onGeneratePDF(est)}
                          style={{ padding: '6px 10px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => onEmailEstimate(est)}
                          style={{ padding: '6px 10px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                          Email
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => onDuplicate(est.id)}
                            style={{ padding: '6px 10px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                          >
                            Copy
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => onDelete(est.id)}
                            style={{ padding: '6px 10px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                          >
                            Del
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CostingEstimatesTable;
