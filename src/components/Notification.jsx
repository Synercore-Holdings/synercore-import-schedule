import React, { useEffect, useState } from 'react';
import { notificationSounds } from '../utils/notificationSounds';

const typeConfig = {
  success: {
    color: '#10b981',
    title: 'Success',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M15 4.5L6.75 12.75L3 9" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  error: {
    color: '#ef4444',
    title: 'Error',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7.5" stroke="#ef4444" strokeWidth="2"/>
        <path d="M12 6L6 12M6 6l6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  warning: {
    color: '#f59e0b',
    title: 'Warning',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2L16.5 15.5H1.5L9 2Z" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M9 7v3" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="9" cy="13" r="0.75" fill="#f59e0b"/>
      </svg>
    ),
  },
  info: {
    color: '#3b82f6',
    title: 'Info',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7.5" stroke="#3b82f6" strokeWidth="2"/>
        <path d="M9 8.5v4" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="9" cy="6" r="0.75" fill="#3b82f6"/>
      </svg>
    ),
  },
  dark: {
    color: '#4b5563',
    title: 'Notice',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="14" height="14" rx="3" stroke="#4b5563" strokeWidth="2"/>
        <path d="M6.5 9h5" stroke="#4b5563" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  light: {
    color: '#9ca3af',
    title: 'Notice',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="14" height="14" rx="3" stroke="#9ca3af" strokeWidth="2"/>
        <path d="M6.5 9h5" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  // A more celebratory variant of 'success', reserved for milestones worth
  // a little extra delight (e.g. a shipment clearing on-time review) rather
  // than every routine save.
  celebrate: {
    color: '#f59e0b',
    title: 'On Time! 🎉',
    icon: <span style={{ fontSize: '18px', lineHeight: 1 }}>🎉</span>,
  },
};

const Notification = ({ type, message, onClose, autoClose = true, duration = 5000 }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  const config = typeConfig[type] || typeConfig.info;

  useEffect(() => {
    const playNotificationSound = async () => {
      switch (type) {
        case 'success':
          await notificationSounds.playSuccess();
          break;
        case 'error':
          await notificationSounds.playError();
          break;
        case 'warning':
          await notificationSounds.playWarning();
          break;
        case 'celebrate':
          await notificationSounds.playCelebrate();
          break;
        case 'dark':
          await notificationSounds.playDark();
          break;
        case 'light':
          await notificationSounds.playLight();
          break;
        case 'info':
        default:
          await notificationSounds.playInfo();
          break;
      }
    };

    playNotificationSound();

    if (autoClose) {
      const interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev - (100 / duration) * 50;
          return Math.max(0, newProgress);
        });
      }, 50);

      const timeout = setTimeout(() => {
        handleClose();
      }, duration);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [type, autoClose, duration]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(), 300);
  };

  return (
    <>
      {type === 'celebrate' && (
        <style>{`@keyframes toast-celebrate-pop {
          0% { transform: scale(0.3) rotate(-15deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }`}</style>
      )}
    <div style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'flex-start',
      padding: '10px 36px 10px 16px',
      borderRadius: '8px',
      backgroundColor: type === 'celebrate' ? '#fffbeb' : '#ffffff',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
      marginBottom: '8px',
      minHeight: '48px',
      overflow: 'hidden',
      transform: isVisible ? 'translateX(0)' : 'translateX(400px)',
      opacity: isVisible ? 1 : 0,
      transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Left accent bar */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '4px',
        backgroundColor: config.color,
        borderRadius: '8px 0 0 8px',
      }} />

      {/* Icon */}
      <div style={{
        flexShrink: 0,
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: '10px',
        marginTop: '1px',
        animation: type === 'celebrate' ? 'toast-celebrate-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' : undefined,
      }}>
        {config.icon}
      </div>

      {/* Title + message */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px',
          fontWeight: '600',
          color: '#111827',
          lineHeight: '1.4',
        }}>
          {config.title}
        </div>
        <div style={{
          fontSize: '12px',
          fontWeight: '400',
          color: '#6b7280',
          lineHeight: '1.4',
          marginTop: '1px',
        }}>
          {message}
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#9ca3af',
          width: '22px',
          height: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          padding: 0,
          transition: 'color 0.15s ease, background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#374151';
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.06)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#9ca3af';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title="Close notification"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Progress bar */}
      {autoClose && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '2px',
            backgroundColor: config.color,
            width: `${progress}%`,
            transition: 'width 0.05s linear',
          }}
        />
      )}
    </div>
    </>
  );
};

export default Notification;
