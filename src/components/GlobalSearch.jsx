import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../utils/authFetch';
import { getApiUrl } from '../config/api';
import { POST_ARRIVAL_STATUSES } from '../types/shipment';

// Route a shipment to wherever its status is actually visible, so a search
// result never lands on a page whose own status filter hides it again.
const targetPathForStatus = (status) => {
  if (status === 'stored' || status === 'arrived_offsite') return '/stored';
  if (status === 'archived' || status === 'sold') return '/archives';
  if (POST_ARRIVAL_STATUSES.includes(status)) return '/workflow';
  return '/shipping';
};

function GlobalSearch({ shipments }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [apiResults, setApiResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced API search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setApiResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await authFetch(getApiUrl(`/api/shipments/search?q=${encodeURIComponent(query)}&limit=10`));
        if (res.ok) {
          const data = await res.json();
          setApiResults(data.data || []);
        }
      } catch (err) {
        // Fall back to local results
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Local results as fallback
  const localResults = useCallback(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const seen = new Set();
    return shipments
      .filter(s => {
        const match =
          s.orderRef?.toLowerCase().includes(q) ||
          s.supplier?.toLowerCase().includes(q) ||
          s.finalPod?.toLowerCase().includes(q) ||
          s.vesselName?.toLowerCase().includes(q) ||
          s.productName?.toLowerCase().includes(q) ||
          s.bolNumber?.toLowerCase().includes(q) ||
          s.containerNumber?.toLowerCase().includes(q);
        if (!match || seen.has(s.orderRef)) return false;
        seen.add(s.orderRef);
        return true;
      })
      .slice(0, 8);
  }, [query, shipments])();

  // Merge: prefer API results, fall back to local
  const results = apiResults.length > 0
    ? apiResults.map(r => ({
        id: r.id,
        orderRef: r.order_ref,
        supplier: r.supplier,
        finalPod: r.final_pod,
        vesselName: r.vessel_name,
        latestStatus: r.latest_status,
        productName: r.product_name,
        bolNumber: r.bol_number,
        containerNumber: r.container_number,
      }))
    : localResults;

  // Group results
  const orderResults = results.filter(r => r.orderRef?.toLowerCase().includes(query.toLowerCase()));
  const supplierResults = results.filter(r =>
    r.supplier?.toLowerCase().includes(query.toLowerCase()) &&
    !r.orderRef?.toLowerCase().includes(query.toLowerCase())
  );
  const otherResults = results.filter(r =>
    !r.orderRef?.toLowerCase().includes(query.toLowerCase()) &&
    !r.supplier?.toLowerCase().includes(query.toLowerCase())
  );

  const allGrouped = [
    ...orderResults.map(r => ({ ...r, group: 'Orders' })),
    ...supplierResults.map(r => ({ ...r, group: 'Suppliers' })),
    ...otherResults.map(r => ({ ...r, group: 'Other' })),
  ];
  // Remove duplicates
  const seen = new Set();
  const finalResults = allGrouped.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, finalResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && finalResults[selectedIndex]) {
      handleSelect(finalResults[selectedIndex]);
    }
  };

  const handleSelect = (shipment) => {
    setOpen(false);
    setQuery('');
    const searchValue = shipment.orderRef || query;
    const targetPath = targetPathForStatus(shipment.latestStatus);
    navigate(`${targetPath}?search=${encodeURIComponent(searchValue)}`);
  };

  const highlight = (text, q) => {
    if (!text || !q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(16, 185, 129, 0.3)', padding: 0, borderRadius: '2px' }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const getStatusPill = (status) => {
    const s = status || '';
    if (s.includes('delayed')) return { cls: 'pill pill-bad', label: 'Delayed' };
    if (s.includes('arrived')) return { cls: 'pill pill-ok', label: 'Arrived' };
    if (s.includes('in_transit') || s.includes('seaway') || s.includes('roadway')) return { cls: 'pill pill-info', label: 'In Transit' };
    if (s.includes('planned')) return { cls: 'pill pill-warn', label: 'Planned' };
    if (s.includes('stored')) return { cls: 'pill pill-ok', label: 'Stored' };
    if (s.includes('moored') || s.includes('berth')) return { cls: 'pill pill-info', label: 'Port' };
    return { cls: 'pill pill-info', label: s.replace(/_/g, ' ') };
  };

  let lastGroup = '';

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: '0 1 320px' }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setSelectedIndex(0);
        }}
        onFocus={() => query.length >= 2 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search orders, suppliers, products, vessels..."
        aria-label="Search shipments"
        aria-expanded={open && finalResults.length > 0}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        role="combobox"
        className="input"
        style={{
          width: '100%',
          padding: '7px 12px 7px 32px',
          fontSize: '0.85rem',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}
      />
      <span style={{
        position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
        fontSize: '0.85rem', color: 'var(--text-500)', pointerEvents: 'none',
      }}>
        {searching ? '\u23F3' : '\u{1F50D}'}
      </span>

      {open && finalResults.length > 0 && (
        <div id="global-search-results" role="listbox" style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '10px', boxShadow: 'var(--shadow-2)', zIndex: 100,
          maxHeight: '360px', overflowY: 'auto',
        }}>
          {finalResults.map((shipment, idx) => {
            const pill = getStatusPill(shipment.latestStatus);
            const showGroupHeader = shipment.group !== lastGroup;
            lastGroup = shipment.group;
            return (
              <React.Fragment key={shipment.id}>
                {showGroupHeader && (
                  <div style={{
                    padding: '6px 14px', fontSize: '0.7rem', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    color: 'var(--text-500)', background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {shipment.group}
                  </div>
                )}
                <div
                  role="option"
                  aria-selected={idx === selectedIndex}
                  onClick={() => handleSelect(shipment)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    backgroundColor: idx === selectedIndex ? 'var(--accent-100)' : 'transparent',
                    borderBottom: idx < finalResults.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-900)' }}>
                      {highlight(shipment.orderRef, query)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {highlight(shipment.supplier, query)}{shipment.productName ? <> &mdash; {highlight(shipment.productName, query)}</> : ''}{shipment.finalPod ? <> &mdash; {highlight(shipment.finalPod, query)}</> : ''}
                      {shipment.bolNumber?.toLowerCase().includes(query.toLowerCase()) ? <> &mdash; BOL {highlight(shipment.bolNumber, query)}</> : ''}
                      {shipment.containerNumber?.toLowerCase().includes(query.toLowerCase()) ? <> &mdash; Container {highlight(shipment.containerNumber, query)}</> : ''}
                    </div>
                  </div>
                  <span className={pill.cls} style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                    {pill.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {open && query.length >= 2 && finalResults.length === 0 && !searching && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '10px', boxShadow: 'var(--shadow-2)', zIndex: 100,
          padding: '16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-500)',
        }}>
          No results found
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
