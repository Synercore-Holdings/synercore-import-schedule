import React, { createContext, useContext, useState, useCallback, useRef, lazy, Suspense } from 'react';
import NotificationContainer from '../components/NotificationContainer';

const ConfirmationModal = lazy(() => import('../components/ConfirmationModal'));

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const confirmResolveRef = useRef(null);

  const addNotification = useCallback((type, message, options = {}) => {
    setNotifications(prev => [
      ...prev,
      { id: crypto.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).substr(2, 9)), type, message, ...options }
    ]);
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const showSuccess   = useCallback((m, o = {}) => addNotification('success', m, o), [addNotification]);
  const showError     = useCallback((m, o = {}) => addNotification('error', m, o), [addNotification]);
  const showWarning   = useCallback((m, o = {}) => addNotification('warning', m, o), [addNotification]);
  const showInfo      = useCallback((m, o = {}) => addNotification('info', m, o), [addNotification]);
  const showCelebrate = useCallback((m, o = {}) => addNotification('celebrate', m, o), [addNotification]);

  const confirm = useCallback(({
    title = 'Confirm Action',
    message = 'Are you sure?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'default',
  } = {}) => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmation({ title, message, confirmText, cancelText, type });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    confirmResolveRef.current?.(true);
    confirmResolveRef.current = null;
    setConfirmation(null);
  }, []);

  const handleCancel = useCallback(() => {
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = null;
    setConfirmation(null);
  }, []);

  // Navigation guard: tracks how many forms are currently blocking navigation.
  // Uses a ref so checking it doesn't cause re-renders in the sidebar.
  const navBlockCountRef = useRef(0);

  const blockNavigation = useCallback(() => {
    navBlockCountRef.current += 1;
    return () => { navBlockCountRef.current -= 1; };
  }, []);

  const isNavigationBlocked = useCallback(() => {
    return navBlockCountRef.current > 0;
  }, []);

  const value = {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showCelebrate,
    confirm,
    blockNavigation,
    isNavigationBlocked,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationContainer
        notifications={notifications}
        onRemoveNotification={removeNotification}
      />
      {confirmation && (
        <Suspense fallback={null}>
          <ConfirmationModal
            title={confirmation.title}
            message={confirmation.message}
            confirmText={confirmation.confirmText}
            cancelText={confirmation.cancelText}
            type={confirmation.type}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        </Suspense>
      )}
    </NotificationContext.Provider>
  );
}

/**
 * @typedef {Object} NotificationAPI
 * @property {(message: string, options?: Object) => void} showSuccess
 * @property {(message: string, options?: Object) => void} showError
 * @property {(message: string, options?: Object) => void} showWarning
 * @property {(message: string, options?: Object) => void} showInfo
 * @property {(message: string, options?: Object) => void} showCelebrate
 * @property {(opts: {title?: string, message?: string, confirmText?: string, cancelText?: string, type?: 'default'|'warning'|'danger'|'success'}) => Promise<boolean>} confirm
 */
/** @returns {NotificationAPI} */
export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

export default NotificationContext;
