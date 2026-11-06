import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { STATUS_LABELS } from '../types/shipment';
import { computePortTimes, buildStatusSegments, formatDuration } from '../utils/portTimes';
import { getApiUrl } from '../config/api';
import { authFetch } from '../utils/authFetch';
import { useNotification } from '../contexts/NotificationContext';

const POPOVER_WIDTH = 320;
const POPOVER_EST_HEIGHT = 320;

const statusLabel = (s) => STATUS_LABELS[s] || s || '—';

// Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
const toLocalInputValue = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatWhen = (ms) => new Date(ms).toLocaleString('en-ZA', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const PortTimeRow = ({ label, span }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
    <span style={{ color: 'var(--text-500)' }}>{label}</span>
    <strong style={{ color: span?.ongoing ? 'var(--danger)' : 'var(--text-900)' }}>
      {span ? `${formatDuration(span.ms)}${span.ongoing ? ' (ongoing)' : ''}` : '—'}
    </strong>
  </div>
);

/**
 * Clock button that opens a popover listing a shipment's status changes with
 * time spent in each, a Port Times summary (delay → berth working → berth
 * complete) and inline correction of when a change happened.
 */
function StatusHistoryButton({ shipment }) {
  const { showError, showSuccess } = useNotification();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // { id, value }
  const [saving, setSaving] = useState(false);
  const btnRef = useRef(null);
  const popoverRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(getApiUrl(`/api/shipments/${shipment.id}/status-history`));
      const data = res.ok ? await res.json() : { data: [] };
      setEntries(data.data || []);
    } catch (err) {
      showError('Failed to load status history');
    } finally {
      setLoading(false);
    }
  }, [shipment.id, showError]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (btnRef.current?.contains(e.target) || popoverRef.current?.contains(e.target)) return;
      setOpen(false);
      setEditing(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      setEditing(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const openUpward = window.innerHeight - rect.bottom < POPOVER_EST_HEIGHT && rect.top > POPOVER_EST_HEIGHT;
    setPos({
      left: Math.min(Math.max(rect.left, 8), window.innerWidth - POPOVER_WIDTH - 8),
      top: openUpward ? undefined : rect.bottom + 4,
      bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
    });
    setOpen(true);
    load();
  };

  const saveEdit = async () => {
    if (!editing?.value) return;
    const changedAt = new Date(editing.value);
    if (Number.isNaN(changedAt.getTime())) return;
    setSaving(true);
    try {
      const res = await authFetch(getApiUrl(`/api/shipments/${shipment.id}/status-history/${editing.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changedAt: changedAt.toISOString() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || err.message || 'Failed to update time');
      }
      setEditing(null);
      showSuccess('Status time updated');
      await load();
    } catch (err) {
      showError(err.message || 'Failed to update time');
    } finally {
      setSaving(false);
    }
  };

  const now = Date.now();
  const segments = buildStatusSegments(entries, shipment.latestStatus, now);
  const port = computePortTimes(entries, shipment.latestStatus, now);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={toggle}
        title="Status history & time in each status"
        aria-label="Status history"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0.2rem', background: 'none', border: 'none', cursor: 'pointer',
          color: open ? '#1565c0' : 'var(--text-500)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
          <polyline points="3 3 3 8 8 8"></polyline>
          <polyline points="12 7 12 12 15 14"></polyline>
        </svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, zIndex: 2000,
            width: `${POPOVER_WIDTH}px`, maxHeight: '420px', overflowY: 'auto',
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)', borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '0.5rem 0.75rem', fontSize: '0.8rem',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Status History</div>

          {!loading && port.hasPortStatus && (
            <div style={{
              padding: '0.4rem 0.5rem', marginBottom: '0.5rem', borderRadius: '4px',
              backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.75rem', color: '#1e40af', marginBottom: 2 }}>Port Times</div>
              <PortTimeRow label="Port delay (→ berth working)" span={port.portDelay} />
              <PortTimeRow label="Berth working (→ complete)" span={port.berthWorking} />
              <PortTimeRow label="Total (delay → complete)" span={port.total} />
            </div>
          )}

          {loading && <div style={{ color: 'var(--text-500)' }}>Loading…</div>}
          {!loading && segments.length === 0 && (
            <div style={{ color: 'var(--text-500)' }}>No status changes recorded yet.</div>
          )}
          {!loading && [...segments].reverse().map((seg) => {
            const e = seg.entry;
            const isEditing = editing?.id === e.id;
            return (
              <div key={e.id} style={{ padding: '0.35rem 0', borderTop: '1px solid var(--border, #eee)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{statusLabel(seg.status)}</strong>
                  <span style={{ color: seg.ongoing ? 'var(--danger)' : 'var(--text-500)', whiteSpace: 'nowrap' }}>
                    {seg.end != null ? formatDuration(seg.end - seg.start) : '?'}{seg.ongoing ? ' so far' : ''}
                  </span>
                </div>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <input
                      type="datetime-local"
                      className="input"
                      value={editing.value}
                      max={toLocalInputValue(now)}
                      onChange={(ev) => setEditing({ id: e.id, value: ev.target.value })}
                      style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px' }}
                    />
                    <button type="button" className="btn btn-primary" disabled={saving} onClick={saveEdit} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                      Save
                    </button>
                    <button type="button" className="btn" disabled={saving} onClick={() => setEditing(null)} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-500)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>
                      {formatWhen(seg.start)}
                      {e.changed_by_username ? ` · ${e.changed_by_username}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: e.id, value: toLocalInputValue(seg.start) })}
                      title="Correct when this status change happened"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1976d2', padding: 0, fontSize: '0.7rem' }}
                    >
                      ✎ edit
                    </button>
                  </div>
                )}
                {(e.source !== 'live' || e.edited_at) && (
                  <div style={{ color: e.source === 'seed' && !e.edited_at ? '#b45309' : 'var(--text-500)', fontSize: '0.65rem', fontStyle: 'italic' }}>
                    {e.edited_at
                      ? `Time corrected${e.edited_by_username ? ` by ${e.edited_by_username}` : ''} (was ${formatWhen(new Date(e.original_changed_at).getTime())})`
                      : e.source === 'seed'
                      ? 'Estimated (status was set before tracking started) — edit if you know the real time'
                      : 'Reconstructed from audit log — time is when it was saved'}
                  </div>
                )}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

export default StatusHistoryButton;
