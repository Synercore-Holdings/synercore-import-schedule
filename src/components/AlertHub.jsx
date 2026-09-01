import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const SEVERITY_ORDER = { critical: 3, warning: 2, info: 1 };

function parseReminderDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  // Handle both "YYYY-MM-DD" and full ISO strings like "2026-03-20T00:00:00.000Z"
  const str = String(dateStr).split('T')[0];
  return new Date(str + 'T00:00:00');
}

function reminderDaysDiff(dateStr) {
  const d = parseReminderDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function relativeDate(dateStr) {
  const diff = reminderDaysDiff(dateStr);
  if (isNaN(diff)) return '';
  if (diff < -1) return `${Math.abs(diff)} days ago`;
  if (diff === -1) return 'yesterday';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return `in ${diff} days`;
}

function reminderBorderColor(dateStr) {
  const diff = reminderDaysDiff(dateStr);
  if (isNaN(diff) || diff < 0) return '#ef4444'; // overdue or invalid — red
  if (diff === 0) return '#eab308'; // today — yellow
  if (diff <= 3) return '#3b82f6';  // upcoming ≤3 days — blue
  return '#9ca3af';                 // future >3 days — gray
}

export default function AlertHub({
  open,
  onClose,
  alerts = [],
  onDismiss,
  onMarkRead,
  shipments = [],
  onDismissReminder,
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('all'); // all | critical | warning | info
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [tab, setTab] = useState('alerts'); // 'alerts' | 'reminders'
  const asideRef = useRef(null);
  const triggerRef = useRef(null);

  // Focus trap: move focus into dialog on open, trap Tab, restore on close
  useEffect(() => {
    if (!open) return;
    // Remember the element that had focus before the dialog opened
    triggerRef.current = document.activeElement;

    // Small delay so the aside is rendered before we query focusable elements
    const raf = requestAnimationFrame(() => {
      const el = asideRef.current;
      if (!el) return;
      const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length > 0) focusable[0].focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      // Restore focus to the element that opened the dialog
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, [open]);

  // Keyboard handler: Escape to close + tab trapping
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { onClose?.(); return; }

    if (e.key === 'Tab') {
      const el = asideRef.current;
      if (!el) return;
      const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  }, [onClose]);

  const filtered = useMemo(() => {
    return alerts
      .filter(a => (severity === 'all' ? true : a.severity === severity))
      .filter(a => (showUnreadOnly ? !a.read : true))
      .filter(a =>
        query.trim()
          ? (a.title + ' ' + (a.description || '')).toLowerCase().includes(query.toLowerCase())
          : true
      )
      .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || (b.ts || 0) - (a.ts || 0));
  }, [alerts, query, severity, showUnreadOnly]);

  const reminders = useMemo(() => {
    return shipments
      .filter(s => s.reminderDate)
      .sort((a, b) => a.reminderDate.localeCompare(b.reminderDate));
  }, [shipments]);

  if (!open) return null;

  const tabBtnStyle = (active) => ({
    flex: 1, padding: '8px 0', border: 'none', borderBottom: active ? '2px solid #059669' : '2px solid transparent',
    background: 'none', color: active ? '#059669' : '#666', fontWeight: active ? 700 : 500,
    fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
  });

  return (
    <aside
      ref={asideRef}
      role="dialog"
      aria-modal="true"
      aria-label="Alert Hub"
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0, right: 0, height: '100vh', width: 420, maxWidth: '95vw',
        background: '#fff', color: '#222', borderLeft: '1px solid #e5e7eb',
        boxShadow: 'rgba(0,0,0,0.08) -8px 0 24px', zIndex: 1000, display: 'flex', flexDirection: 'column'
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 16 }}>Alert Hub</strong>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>
          {tab === 'alerts' ? `${filtered.length} shown` : `${reminders.length} reminders`}
        </span>
        <button onClick={onClose} style={{ marginLeft: 8, border: '1px solid #ddd', background: '#f8f9fa', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>
          Close
        </button>
      </div>

      {/* Tab Toggle */}
      <div style={{ display: 'flex', borderBottom: '1px solid #eee' }}>
        <button style={tabBtnStyle(tab === 'alerts')} onClick={() => setTab('alerts')}>
          Alerts{alerts.length > 0 ? ` (${alerts.length})` : ''}
        </button>
        <button style={tabBtnStyle(tab === 'reminders')} onClick={() => setTab('reminders')}>
          Reminders{reminders.length > 0 ? ` (${reminders.length})` : ''}
        </button>
      </div>

      {/* Alerts Tab */}
      {tab === 'alerts' && (
        <>
          {/* Controls */}
          <div style={{ padding: 12, borderBottom: '1px solid #eee', display: 'grid', gap: 8 }}>
            <input
              placeholder="Search alerts…"
              aria-label="Search alerts"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6 }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={severity} onChange={e => setSeverity(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6 }}>
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#444' }}>
                <input type="checkbox" checked={showUnreadOnly} onChange={e => setShowUnreadOnly(e.target.checked)} />
                Unread only
              </label>
            </div>
          </div>

          {/* List */}
          <div style={{ overflow: 'auto', padding: 12, display: 'grid', gap: 10 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8, color: '#666', textAlign: 'center' }}>
                No alerts match your filters.
              </div>
            )}
            {filtered.map(a => (
              <article
                key={a.id}
                style={{
                  border: '1px solid #eee', borderLeft: `4px solid ${colorFor(a.severity)}`,
                  borderRadius: 8, padding: 12, background: a.read ? '#fafafa' : '#fff',
                  cursor: a.meta?.orderRef ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
                onClick={() => {
                  if (a.meta?.orderRef) {
                    onMarkRead?.(a.id);
                    const dest = viewForStatus(a.meta);
                    navigate(`/${dest}?search=${encodeURIComponent(a.meta.orderRef)}`);
                    onClose();
                  }
                }}
                onMouseEnter={e => { if (a.meta?.orderRef) e.currentTarget.style.background = '#f0f7ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = a.read ? '#fafafa' : '#fff'; }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                    background: colorFor(a.severity)
                  }} />
                  <strong style={{ fontSize: 14 }}>{a.title}</strong>
                  {a.status && <DeliveryStatusIcon status={a.status} />}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#999' }}>
                    {a.ts ? new Date(a.ts).toLocaleString() : ''}
                  </span>
                </div>
                {a.description && (
                  <p style={{ margin: '6px 0 8px 0', fontSize: 13, color: '#444' }}>{a.description}</p>
                )}
                {a.meta && (
                  <div style={{ margin: '0 0 8px 0', fontSize: 12, color: '#555', background: '#f7f7f7', padding: 8, borderRadius: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    {a.meta.orderRef && <span><strong>Ref:</strong> {a.meta.orderRef}</span>}
                    {a.meta.supplier && <span><strong>Supplier:</strong> {a.meta.supplier}</span>}
                    {a.meta.product && <span><strong>Product:</strong> {a.meta.product}</span>}
                    {a.meta.week && <span><strong>Week:</strong> {a.meta.week}</span>}
                    {a.meta.status && <span><strong>Status:</strong> {a.meta.status.replace(/_/g, ' ')}</span>}
                    {a.meta.finalPod && <span><strong>POD:</strong> {a.meta.finalPod}</span>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                  {a.meta?.orderRef && (() => {
                    const dest = viewForStatus(a.meta);
                    const label = dest === 'stored' ? 'View in Stored Stock'
                      : dest === 'workflow' ? 'View in Workflow'
                      : dest === 'archives' ? 'View in Archives'
                      : dest === 'rejections' ? 'View in Rejection Claims'
                      : dest === 'quote-requests' ? 'View in Quote Requests'
                      : 'View in Shipping';
                    return (
                      <button onClick={() => {
                        onMarkRead?.(a.id);
                        navigate(`/${dest}?search=${encodeURIComponent(a.meta.orderRef)}`);
                        onClose();
                      }} style={btnStyle('#059669')}>{label}</button>
                    );
                  })()}
                  {!a.read && (
                    <button onClick={() => onMarkRead?.(a.id)} style={btnStyle('#0ea5e9')}>Mark read</button>
                  )}
                  <button onClick={() => onDismiss?.(a.id)} style={btnStyle('#ef4444')}>Dismiss</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* Reminders Tab */}
      {tab === 'reminders' && (
        <div style={{ overflow: 'auto', padding: 12, display: 'grid', gap: 10 }}>
          {reminders.length === 0 && (
            <div style={{ padding: 24, border: '1px dashed #ddd', borderRadius: 8, color: '#666', textAlign: 'center' }}>
              No active reminders.
            </div>
          )}
          {reminders.map(s => {
            const borderColor = reminderBorderColor(s.reminderDate);
            return (
              <article
                key={s.id}
                style={{
                  border: '1px solid #eee', borderLeft: `4px solid ${borderColor}`,
                  borderRadius: 8, padding: 12, background: '#fff',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onClick={() => {
                  navigate(`/shipping?search=${encodeURIComponent(s.orderRef)}`);
                  onClose();
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f0f7ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 14, color: '#059669' }}>{s.orderRef}</strong>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: borderColor, fontWeight: 600 }}>
                    {relativeDate(s.reminderDate)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#444', marginBottom: 4 }}>
                  {s.supplier}{s.productName ? ` — ${s.productName}` : ''}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: s.reminderNote ? 6 : 0 }}>
                  Reminder: {parseReminderDate(s.reminderDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                {s.reminderNote && (
                  <div style={{ fontSize: 12, color: '#555', background: '#f7f7f7', padding: 8, borderRadius: 6, marginTop: 4 }}>
                    {s.reminderNote}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => onDismissReminder?.(s.id)}
                    style={btnStyle('#059669')}
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function DeliveryStatusIcon({ status }) {
  if (status === 'sent') {
    return (
      <span
        title="Delivered"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: '50%', background: '#dcfce7',
          color: '#16a34a', fontSize: 11, fontWeight: 'bold', flexShrink: 0,
        }}
      >
        &#10003;
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span
        title="Delivery failed"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: '50%', background: '#fee2e2',
          color: '#dc2626', fontSize: 11, fontWeight: 'bold', flexShrink: 0,
        }}
      >
        &#10005;
      </span>
    );
  }
  if (status === 'retrying' || status === 'pending') {
    return (
      <span
        title={status === 'retrying' ? 'Retrying delivery' : 'Pending'}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: '50%', background: '#fef3c7',
          color: '#d97706', fontSize: 12, flexShrink: 0,
        }}
      >
        &#9201;
      </span>
    );
  }
  return null;
}

function viewForStatus(meta) {
  if (meta?.isClaim) return 'rejections';
  if (meta?.isQuoteRequest) return 'quote-requests';
  const status = meta?.status;
  if (!status) return 'shipping';
  const postArrival = [
    'arrived_pta', 'arrived_klm', 'arrived_offsite',
    'unloading', 'inspection_pending', 'inspecting',
    'inspection_failed', 'inspection_passed',
    'receiving', 'received',
  ];
  if (status === 'stored') return 'stored';
  if (status === 'archived') return 'archives';
  if (postArrival.includes(status)) return 'workflow';
  return 'shipping';
}

function colorFor(sev) {
  if (sev === 'critical') return '#ef4444';
  if (sev === 'warning') return '#eab308';
  return '#0ea5e9';
}

function btnStyle(bg) {
  return {
    background: bg, color: 'white', border: 'none', borderRadius: 6,
    padding: '6px 10px', cursor: 'pointer', fontSize: 12
  };
}
