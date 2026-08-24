import React from 'react';

/**
 * Shipment Timeline / Progress Bar
 *
 * Milestones:  Ordered -> In Transit -> Port/Berth -> Customs -> Warehouse -> Stored
 * Each milestone maps to a group of ShipmentStatus values.
 */

const MILESTONES = [
  {
    label: 'Ordered',
    statuses: ['planned_airfreight', 'planned_seafreight'],
    dateKey: 'createdAt',
  },
  {
    label: 'In Transit',
    statuses: [
      'in_transit_airfreight',
      'air_customs_clearance',
      'in_transit_roadway',
      'in_transit_seaway',
      'in_transit_last_mile',
    ],
    dateKey: 'estimatedArrival',
  },
  {
    label: 'Port / Berth',
    statuses: [
      'moored',
      'berth_working',
      'berth_complete',
      'gated_in_port',
      'arrived_pta',
      'arrived_klm',
      'arrived_offsite',
    ],
    dateKey: 'estimatedArrival',
  },
  {
    label: 'Customs',
    statuses: [
      'delayed_customs',
      'delayed_documents',
      'delayed_port',
      'delayed_supplier',
    ],
    dateKey: null,
  },
  {
    label: 'Warehouse',
    statuses: [
      'unloading',
      'inspection_pending',
      'inspecting',
      'inspection_passed',
      'inspection_failed',
      'receiving',
      'received',
    ],
    dateKey: 'unloadingStartDate',
  },
  {
    label: 'Stored',
    statuses: ['stored', 'archived'],
    dateKey: 'receivingDate',
  },
];

function getMilestoneIndex(status) {
  if (!status) return -1;
  for (let i = 0; i < MILESTONES.length; i++) {
    if (MILESTONES[i].statuses.includes(status)) return i;
  }
  return -1;
}

function formatShortDate(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  } catch {
    return null;
  }
}

// Inject keyframes once
let styleInjected = false;
function injectKeyframes() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes timeline-pulse {
      0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.5); }
      70% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
      100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
    }
  `;
  document.head.appendChild(style);
}

const ShipmentTimeline = ({ shipment, compact = false }) => {
  if (!shipment) return null;
  injectKeyframes();

  const status = shipment.latestStatus || shipment.latest_status || '';
  const activeIdx = getMilestoneIndex(status);

  // Colors
  const DONE = '#22c55e';   // green
  const ACTIVE = '#3b82f6'; // blue
  const FUTURE = 'var(--border, #d1d5db)';
  const DONE_TEXT = 'var(--text-700, #374151)';
  const FUTURE_TEXT = 'var(--text-400, #9ca3af)';

  const dotSize = compact ? 14 : 20;
  const barHeight = compact ? 3 : 4;

  return (
    <div style={{
      width: '100%',
      padding: compact ? '4px 0' : '12px 0',
      userSelect: 'none',
    }}>
      {/* Bar + dots row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
      }}>
        {MILESTONES.map((ms, i) => {
          const isDone = i < activeIdx;
          const isActive = i === activeIdx;
          const isFuture = i > activeIdx;

          const dotColor = isDone ? DONE : isActive ? ACTIVE : FUTURE;
          const barColor = isDone ? DONE : (isActive && i > 0) ? ACTIVE : FUTURE;

          return (
            <React.Fragment key={ms.label}>
              {/* Connector bar (before each dot except the first) */}
              {i > 0 && (
                <div style={{
                  flex: 1,
                  height: barHeight,
                  borderRadius: barHeight / 2,
                  background: barColor,
                  transition: 'background 0.3s ease',
                }} />
              )}
              {/* Dot */}
              <div
                title={`${ms.label}${isActive ? ' (current)' : ''}`}
                style={{
                  width: dotSize,
                  height: dotSize,
                  minWidth: dotSize,
                  borderRadius: '50%',
                  background: dotColor,
                  border: isActive ? `2px solid ${ACTIVE}` : isDone ? `2px solid ${DONE}` : `2px solid ${FUTURE}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: 2,
                  transition: 'all 0.3s ease',
                  ...(isActive ? { animation: 'timeline-pulse 2s ease-in-out infinite' } : {}),
                }}
              >
                {/* Checkmark for done */}
                {isDone && (
                  <svg width={dotSize * 0.55} height={dotSize * 0.55} viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5L5 9.5L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {/* Inner dot for active */}
                {isActive && (
                  <div style={{
                    width: dotSize * 0.4,
                    height: dotSize * 0.4,
                    borderRadius: '50%',
                    background: '#fff',
                  }} />
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Labels row */}
      {!compact && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          marginTop: 6,
        }}>
          {MILESTONES.map((ms, i) => {
            const isDone = i < activeIdx;
            const isActive = i === activeIdx;

            const dateVal = ms.dateKey ? formatShortDate(shipment[ms.dateKey]) : null;

            return (
              <React.Fragment key={ms.label}>
                {i > 0 && <div style={{ flex: 1 }} />}
                <div style={{
                  width: dotSize,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 500,
                    color: (isDone || isActive) ? DONE_TEXT : FUTURE_TEXT,
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}>
                    {ms.label}
                  </span>
                  {dateVal && (
                    <span style={{
                      fontSize: 9,
                      color: 'var(--text-400, #9ca3af)',
                      marginTop: 1,
                      whiteSpace: 'nowrap',
                    }}>
                      {dateVal}
                    </span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ShipmentTimeline;
