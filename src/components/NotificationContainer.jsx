import React from 'react';
import Notification from './Notification';

const renderNotification = (notification, onRemoveNotification) => (
  <div
    key={notification.id}
    role={notification.type === 'error' || notification.type === 'warning' ? 'alert' : undefined}
    style={{ pointerEvents: 'auto' }}
  >
    <Notification
      type={notification.type}
      message={notification.message}
      onClose={() => onRemoveNotification(notification.id)}
      autoClose={notification.autoClose !== false}
      duration={notification.duration || 5000}
    />
  </div>
);

const NotificationContainer = ({ notifications, onRemoveNotification }) => {
  if (!notifications || notifications.length === 0) {
    return null;
  }

  // Celebratory toasts (e.g. a shipment clearing on-time review) get their
  // own corner so they don't compete with — or get buried by — routine
  // success/error/warning toasts stacking at the top.
  const celebrations = notifications.filter(n => n.type === 'celebrate');
  const routine = notifications.filter(n => n.type !== 'celebrate');

  return (
    <>
      {routine.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            maxWidth: '400px',
            width: '100%',
            pointerEvents: 'none',
          }}
        >
          {routine.map((notification) => renderNotification(notification, onRemoveNotification))}
        </div>
      )}
      {celebrations.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 10000,
            maxWidth: '400px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column-reverse',
            pointerEvents: 'none',
          }}
        >
          {celebrations.map((notification) => renderNotification(notification, onRemoveNotification))}
        </div>
      )}
    </>
  );
};

export default NotificationContainer;