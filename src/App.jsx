// src/App.jsx
import React, { useState, useEffect, useRef, useMemo, Suspense, lazy, startTransition } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import SynercoreLogo from './components/SynercoreLogo';
import { useNotification } from './contexts/NotificationContext';
import OfflineIndicator from './components/OfflineIndicator';
import ErrorBoundary from './components/ErrorBoundary';
import ConnectionOverlay from './components/ConnectionOverlay';
import { VIEW_ROUTES } from './routes';

// ✅ Map routes/views to sidebar sections
const VIEW_TO_SECTION = {
  dashboard: 'masterData',
  suppliers: 'masterData',

  shipping: 'operations',
  workflow: 'operations',
  'local-receiving': 'operations',
  'iwt-incoming': 'operations',
  'bol-audit': 'operations',

  receiving: 'warehouse',
  'dock-management': 'warehouse',
  capacity: 'warehouse',
  'capacity-pretoria': 'warehouseCapacitySites',
  'capacity-klapmuts': 'warehouseCapacitySites',
  'capacity-offsite': 'warehouseCapacitySites',
  stored: 'warehouse',
  archives: 'warehouse',
  rates: 'finance',
  costing: 'finance',
  'export-costing': 'finance',
  'costing-requests': 'finance',

  reports: 'reports',
  'advanced-reports': 'reports',
  'supplier-performance': 'reports',
  audit: 'reports',
};

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  suppliers: 'Suppliers',
  shipping: 'International Import',
  workflow: 'Post-Arrival Workflow',
  'local-receiving': 'Local Receiving',
  'iwt-incoming': 'IWT Incoming',
  'bol-audit': 'BOL Audit',
  receiving: 'Goods Receiving',
  'dock-management': 'Dock Management',
  capacity: 'Warehouse Capacity',
  'capacity-pretoria': 'Pretoria Capacity',
  'capacity-klapmuts': 'Klapmuts Capacity',
  'capacity-offsite': 'Offsite Capacity',
  stored: 'Stored Stock',
  archives: 'Shipment Archives',
  rates: 'Rates & Quotes',
  costing: 'Import Costing',
  'export-costing': 'Export Costing',
  reports: 'Reports',
  'advanced-reports': 'Advanced Reports',
  'supplier-performance': 'Supplier Performance',
  'costing-requests': 'Cost Requests',
  users: 'User Management',
  audit: 'Activity Log',
};

// Lazy-loaded pages (code-split for faster initial load)
const Dashboard = lazy(() => import('./components/Dashboard'));
const ArchiveView = lazy(() => import('./components/ArchiveView'));
const ReportsView = lazy(() => import('./components/ReportsView'));
const AdvancedReports = lazy(() => import('./components/AdvancedReports'));
const WarehouseCapacity = lazy(() => import('./components/WarehouseCapacity'));
const SupplierManagement = lazy(() => import('./components/SupplierManagement'));
const RatesQuotes = lazy(() => import('./components/RatesQuotes'));
const PostArrivalWorkflow = lazy(() => import('./components/PostArrivalWorkflow'));
const WarehouseStored = lazy(() => import('./components/WarehouseStored'));
const ShippingView = lazy(() => import('./components/ShippingView'));
const AlertHub = lazy(() => import('./components/AlertHub'));
const UserSettings = lazy(() => import('./components/UserSettings'));
const HelpGuide = lazy(() => import('./components/HelpGuide'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const NotificationPreferences = lazy(() => import('./components/NotificationPreferences'));
const ImportCosting = lazy(() => import('./components/ImportCosting'));
const ExportCosting = lazy(() => import('./components/ExportCosting'));
const CostingRequests = lazy(() => import('./components/CostingRequests'));
const GlobalSearch = lazy(() => import('./components/GlobalSearch'));
const LiveBoard = lazy(() => import('./components/LiveBoard'));
const AuditLog = lazy(() => import('./components/AuditLog'));
const BolAudit = lazy(() => import('./components/BolAudit'));
const SupplierPerformance = lazy(() => import('./components/SupplierPerformance'));
const GoodsReceiving = lazy(() => import('./components/GoodsReceiving'));
const DockManagement = lazy(() => import('./components/DockManagement'));
const LocalReceivingSchedule = lazy(() => import('./components/LocalReceivingSchedule'));
const IWTIncoming = lazy(() => import('./components/IWTIncoming'));

import SupplierLogin from './pages/SupplierLogin';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PrivacyNotice from './pages/PrivacyNotice';
import useWebSocket from './hooks/useWebSocket';
import useShipments from './hooks/useShipments';
import useSuppliers from './hooks/useSuppliers';
import useAlerts from './hooks/useAlerts';
import { authFetch } from './utils/authFetch';
import { getApiUrl } from './config/api';
import { authUtils } from './utils/auth';
import { POST_ARRIVAL_STATUSES } from './types/shipment';
import { initWebVitals, logWebVitalsToConsole } from './utils/webVitals';
import { initializeAnalytics } from './config/analytics';
import {
  LayoutDashboard, Building2, Ship, Truck, Repeat, ClipboardList, Factory, Store,
  Package, Wallet, BarChart3, TrendingUp, Target, Inbox, ScrollText, FileText,
  Users, LogOut, Moon, Sun, BookOpen, Bell, Globe, Newspaper, MapPin, Settings as SettingsIcon,
  Waves,
} from 'lucide-react';
import './theme.css';

// Initialize monitoring
initWebVitals();
logWebVitalsToConsole();
initializeAnalytics();

// Per-route loading fallback
const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
    Loading...
  </div>
);

function App() {
  // ---------- custom hooks ----------
  const {
    shipments, setShipments, loading, lastSyncTime,
    fetchShipments, handleCreateShipment, handleUpdateShipment,
    handleDeleteShipment, handleArchiveShipment, handleFileUpload,
    importResult, setImportResult,
  } = useShipments();

  const {
    suppliers, fetchSuppliers,
    handleAddSupplier, handleUpdateSupplier, handleDeleteSupplier, handleImportSchedule,
  } = useSuppliers(fetchShipments);

  const { alerts, handleAlertDismiss, handleAlertMarkRead, pushAlert } = useAlerts(shipments);

  const { showInfo, isNavigationBlocked, confirm } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const user = authUtils.getUser();
    return !!(user && authUtils.isAuthenticated() && !authUtils.isTokenExpired());
  });
  const [username, setUsername] = useState(() => {
    const user = authUtils.getUser();
    return user?.username || '';
  });
  const [showSupplierPortal, setShowSupplierPortal] = useState(false);

  // Password expiry state
  const [passwordExpired, setPasswordExpired] = useState(false);
  const [pwChangeForm, setPwChangeForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwChangeError, setPwChangeError] = useState('');
  const [pwChangeLoading, setPwChangeLoading] = useState(false);
  const [pwChangeSuccess, setPwChangeSuccess] = useState('');

  // UI panel state
  const [alertHubOpen, setAlertHubOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationPrefsOpen, setNotificationPrefsOpen] = useState(false);
  const [liveBoardOpen, setLiveBoardOpen] = useState(false);

  // ============================
  // ✅ TAB STATE
  // ============================
  const [openTabs, setOpenTabs] = useState([
    {
      id: 'dashboard',
      title: 'Dashboard',
      route: '/dashboard',
    },
  ]);

  const openPageTab = (view, route = VIEW_ROUTES[view] || '/dashboard', title = VIEW_TITLES[view] || view) => {
    setOpenTabs((prev) => {
      if (prev.some(t => t.route === route)) return prev;

      return [
        ...prev,
        {
          id: view,
          title,
          route,
        },
      ];
    });
  };

  const navigateToPage = (view, route = VIEW_ROUTES[view] || '/dashboard', title = VIEW_TITLES[view] || view) => {
    startTransition(() => {
      openPageTab(view, route, title);
      navigate(route);
    });
  };

  // Costing Requests badge count (admin only)
  const [costingRequestCount, setCostingRequestCount] = useState(0);

  // Sidebar nav search + collapse
  const [navSearch, setNavSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Sidebar calendar filter
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(null); // null = All Months

  // Calendar-filtered shipments — used by Dashboard and other pages
  const calendarFilteredShipments = useMemo(() => {
    if (calendarMonth === null && calendarYear === new Date().getFullYear()) return shipments;
    return shipments.filter(s => {
      // Use the most relevant date: estimatedArrival, updatedAt, or createdAt
      const dateStr = s.estimatedArrival || s.updatedAt || s.createdAt;
      if (!dateStr) return calendarMonth === null; // include dateless shipments only when "All Months"
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return calendarMonth === null;
      if (d.getFullYear() !== calendarYear) return false;
      if (calendarMonth !== null && d.getMonth() !== calendarMonth) return false;
      return true;
    });
  }, [shipments, calendarYear, calendarMonth]);

  // Sidebar collapsible sections
  const [sidebarSections, setSidebarSections] = useState({
    masterData: true,
    operations: true,
    warehouse: true,
    warehouseCapacitySites: true,
    finance: true,
    reports: true,
    resources: false,
  });
  const toggleSection = (key) => setSidebarSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Theme
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('synercore_theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('synercore_theme', theme);
  }, [theme]);

  // WebSocket integration
  const { isConnected: wsConnected, onShipmentUpdate, onDocumentUpload } = useWebSocket({ enabled: isAuthenticated });

  const initializedRef = useRef(false);

  // ---------- WebSocket real-time updates ----------
  useEffect(() => {
    const unsubscribe = onShipmentUpdate((data) => {
      setShipments(prev => prev.map(s => {
        if (s.id === data.shipmentId) {
          return {
            ...s,
            latestStatus: data.status || s.latestStatus,
            inspectionStatus: data.inspectionStatus || s.inspectionStatus,
            actualArrivalDate: data.actualArrivalDate || s.actualArrivalDate,
            ...data.shipment
          };
        }
        return s;
      }));
    });
    return unsubscribe;
  }, [onShipmentUpdate, setShipments]);

  useEffect(() => {
    const unsubscribe = onDocumentUpload((data) => {
      showInfo(`📄 Document uploaded: ${data.document.fileName} for shipment ${data.shipmentId}`);
    });
    return unsubscribe;
  }, [onDocumentUpload, showInfo]);

  // ---------- check password expiry ----------
  const checkPasswordExpiry = async () => {
    try {
      const res = await authFetch(getApiUrl('/api/auth/password-status'));
      if (res.ok) {
        const data = await res.json();
        setPasswordExpired(data.passwordExpired === true);
      }
    } catch (err) {
      console.warn('Could not check password status:', err);
    }
  };

  // ---------- boot ----------
  useEffect(() => {
    if (initializedRef.current) return;
    const user = authUtils.getUser();
    const isAuth = user && authUtils.isAuthenticated() && !authUtils.isTokenExpired();
    if (isAuth) {
      initializedRef.current = true;
      setIsAuthenticated(true);
      setUsername(user.username);
      fetchShipments();
      fetchSuppliers();
      checkPasswordExpiry();
    } else {
      if (authUtils.isAuthenticated() || authUtils.getUser()) {
        authUtils.clearAuth();
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- polling fallback ----------
  useEffect(() => {
    const poll = setInterval(() => {
      if (authUtils.isAuthenticated() && !wsConnected) {
        fetchShipments(true);
        fetchSuppliers(true);
      }
    }, 30000);
    return () => clearInterval(poll);
  }, [wsConnected, fetchShipments, fetchSuppliers]);

  // Poll for costing request count (admin only)
  useEffect(() => {
    if (!isAuthenticated) return;
    const currentUser = authUtils.getUser();
    if (currentUser?.role !== 'admin') return;

    const fetchRequestCount = async () => {
      try {
        const res = await authFetch(getApiUrl('/api/costing-requests/count'));
        if (res.ok) {
          const data = await res.json();
          setCostingRequestCount(data.count || 0);
        }
      } catch (err) {
        // Silently fail - not critical
      }
    };

    fetchRequestCount();
    const interval = setInterval(fetchRequestCount, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // ---------- auth ----------
  const handleLogin = (loginUsername, loginPasswordExpired) => {
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('username', loginUsername);
    setIsAuthenticated(true);
    setUsername(loginUsername);
    initializedRef.current = true;
    fetchShipments();
    fetchSuppliers();
    if (loginPasswordExpired) {
      setPasswordExpired(true);
    } else {
      checkPasswordExpiry();
    }
  };

  const handleLogout = () => {
    authUtils.clearAuth();
    setIsAuthenticated(false);
    setUsername('');
    setPasswordExpired(false);
  };

  const handleExpiredPasswordChange = async (e) => {
    e.preventDefault();
    setPwChangeError('');
    setPwChangeSuccess('');

    const { currentPassword, newPassword, confirmPassword } = pwChangeForm;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwChangeError('All fields are required.');
      return;
    }
    if (newPassword.length < 6) {
      setPwChangeError('New password must be at least 6 characters.');
      return;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      setPwChangeError('Password must contain at least one uppercase letter, one lowercase letter, and one number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwChangeError('New password and confirmation do not match.');
      return;
    }

    setPwChangeLoading(true);
    try {
      const res = await authFetch(getApiUrl('/api/auth/change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwChangeError(data.error || 'Failed to change password.');
        return;
      }
      setPwChangeSuccess('Password changed successfully.');
      setPwChangeForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setPasswordExpired(false);
        setPwChangeSuccess('');
      }, 1500);
    } catch (err) {
      setPwChangeError('Network error. Please try again.');
    } finally {
      setPwChangeLoading(false);
    }
  };

  // ---------- helper: derive active view from URL ----------
  const activeView = (() => {
    const path = location.pathname;
    if (path === '/shipping' || path === '/') return 'shipping';
    if (path === '/dashboard') return 'dashboard';
    if (path === '/suppliers') return 'suppliers';
    if (path === '/workflow') return 'workflow';
    if (path === '/local-receiving') return 'local-receiving';
    if (path === '/capacity') return 'capacity';
    if (path === '/capacity/pretoria') return 'capacity-pretoria';
    if (path === '/capacity/klapmuts') return 'capacity-klapmuts';
    if (path === '/capacity/offsite') return 'capacity-offsite';
    if (path === '/stored') return 'stored';
    if (path === '/archives') return 'archives';
    if (path === '/rates') return 'rates';
    if (path === '/costing') return 'costing';
    if (path === '/export-costing') return 'export-costing';
    if (path === '/costing-requests') return 'costing-requests';
    if (path === '/reports') return 'reports';
    if (path === '/advanced-reports') return 'advanced-reports';
    if (path === '/supplier-performance') return 'supplier-performance';
    if (path === '/users') return 'users';
    if (path === '/audit') return 'audit';
    if (path === '/receiving') return 'receiving';
    if (path === '/dock-management') return 'dock-management';
    if (path === '/iwt-incoming') return 'iwt-incoming';
    if (path === '/bol-audit') return 'bol-audit';
    return 'shipping';
  })();

  // ✅ Auto-open sidebar section for active view WITHOUT closing others
  useEffect(() => {
    const section = VIEW_TO_SECTION[activeView];
    if (!section) return;

    setSidebarSections(prev => {
      if (prev[section]) return prev; // already open → do nothing
      return { ...prev, [section]: true };
    });
  }, [activeView]);

  // ✅ Keep tabs in sync with direct navigation (refresh / deep link / back button)
  useEffect(() => {
    const route = location.pathname;
    if (route === '/login') return;

    openPageTab(activeView, route);
  }, [location.pathname, activeView]);

  const StoredWrapper = () => {
    const storedShipments = shipments.filter(s => {
      if (s.latestStatus === 'sold' || s.latestStatus === 'archived') return false;
      const warehouse = (s.receivingWarehouse || '').toUpperCase();
      return s.latestStatus === 'stored' || warehouse === 'OFFSITE' || s.latestStatus === 'arrived_offsite';
    });
    return (
      <WarehouseStored
        shipments={storedShipments}
        onUpdateShipment={handleUpdateShipment}
        onCreateShipment={handleCreateShipment}
        onDeleteShipment={handleDeleteShipment}
        loading={loading}
      />
    );
  };

  const AccessDenied = () => (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Access Denied</h2>
      <p>You need administrator privileges to access this page.</p>
    </div>
  );

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword onBack={() => navigate('/login')} />} />
        <Route path="/reset-password" element={<ResetPassword onBack={() => navigate('/login')} />} />
        <Route path="/privacy" element={<PrivacyNotice onBack={() => navigate('/login')} />} />
        <Route path="/login" element={<LoginPage onLogin={handleLogin} onPrivacy={() => navigate('/privacy')} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (showSupplierPortal) {
    return <SupplierLogin onClose={() => setShowSupplierPortal(false)} />;
  }

  const currentUser = authUtils.getUser();
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className={`container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <OfflineIndicator />
      <ConnectionOverlay />
      {/* ===== SIDEBAR ===== */}
      <div className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-title">
            <h1>Synercore</h1>
            <p className="sidebar-subtitle">Import Supply Chain</p>
          </div>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '\u00BB' : '\u00AB'}
          </button>
        </div>

        {/* Calendar Filter */}
        {!sidebarCollapsed && (
          <div className="sidebar-calendar">
            <div className="sidebar-calendar-year">
              <button onClick={() => setCalendarYear(y => y - 1)} title="Previous year">&lsaquo;</button>
              <span>{calendarYear}</span>
              <button onClick={() => setCalendarYear(y => y + 1)} title="Next year">&rsaquo;</button>
            </div>
            <button
              className={`sidebar-calendar-all ${calendarMonth === null ? 'active' : ''}`}
              onClick={() => setCalendarMonth(null)}
            >
              All Months
            </button>
            <div className="sidebar-calendar-grid">
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <button
                  key={m}
                  className={`sidebar-calendar-month ${calendarMonth === i ? 'active' : ''}`}
                  onClick={() => setCalendarMonth(calendarMonth === i ? null : i)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Search menu..."
            value={navSearch}
            onChange={e => setNavSearch(e.target.value)}
          />
        </div>

        {/* Navigation */}
        {(() => {
          const q = navSearch.toLowerCase();

          const delayedCount = shipments.filter(s => s.latestStatus && s.latestStatus.startsWith('delayed_')).length;
          const workflowCount = shipments.filter(s => POST_ARRIVAL_STATUSES.includes(s.latestStatus)).length;

          const navItems = {
            dashboard: { label: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
            suppliers: { label: 'Suppliers', icon: Building2, view: 'suppliers' },
            shipping: { label: 'International Import', icon: Ship, view: 'shipping', badge: delayedCount, badgeType: 'danger' },
            localReceiving: { label: 'Local Receiving', icon: Truck, view: 'local-receiving' },
            iwtIncoming: { label: 'IWT Incoming', icon: Repeat, view: 'iwt-incoming' },
            workflow: { label: 'Post-Arrival Workflow', icon: ClipboardList, view: 'workflow', badge: workflowCount, badgeType: 'info' },
            capacity: { label: 'Warehouse Capacity', icon: Factory, view: 'capacity' },
            capacityPretoria: { label: 'Pretoria', icon: Factory, view: 'capacity-pretoria' },
            capacityKlapmuts: { label: 'Klapmuts', icon: Factory, view: 'capacity-klapmuts' },
            capacityOffsite: { label: 'Offsite', icon: Factory, view: 'capacity-offsite' },
            stored: { label: 'Stored Stock', icon: Store, view: 'stored' },
            archives: { label: 'Shipment Archives', icon: Package, view: 'archives' },
            rates: { label: 'Rates & Quotes', icon: Wallet, view: 'rates' },
            costing: { label: 'Import Costing', icon: BarChart3, view: 'costing' },
            exportCosting: { label: 'Export Costing', icon: BarChart3, view: 'export-costing' },
            costingRequests: { label: 'Cost Requests', icon: ClipboardList, view: 'costing-requests', adminOnly: true, badge: costingRequestCount },
            reports: { label: 'Reports', icon: BarChart3, view: 'reports' },
            advancedReports: { label: 'Advanced Reports', icon: TrendingUp, view: 'advanced-reports' },
            supplierPerformance: { label: 'Supplier Performance', icon: Target, view: 'supplier-performance' },
            receiving: { label: 'Goods Receiving', icon: Inbox, view: 'receiving' },
            dockManagement: { label: 'Dock Management', icon: Truck, view: 'dock-management' },
            bolAudit: { label: 'BOL Audit', icon: ScrollText, view: 'bol-audit' },
            audit: { label: 'Activity Log', icon: FileText, view: 'audit', adminOnly: true },
          };

          const match = (label) => !q || label.toLowerCase().includes(q);

          const renderItem = (key) => {
            const item = navItems[key];

            if (!item) return null;
            if (item.adminOnly && !isAdmin) return null;
            if (!match(item.label)) return null;

            const IconComp = item.icon;

            return (
              <button
                key={key}
                className={`nav-item ${activeView === item.view ? 'active' : ''}`}
                onClick={() => {
                  const route = VIEW_ROUTES[item.view] || '/shipping';

                  const openTabAndNavigate = () => {
                    navigateToPage(item.view, route, item.label);
                  };

                  if (isNavigationBlocked()) {
                    confirm({
                      title: 'Unsaved Changes',
                      message:
                        'You have unsaved changes that will be lost. Are you sure you want to leave this page?',
                      confirmText: 'Leave',
                      cancelText: 'Stay',
                      type: 'warning',
                    }).then((confirmed) => {
                      if (confirmed) openTabAndNavigate();
                    });
                  } else {
                    openTabAndNavigate();
                  }
                }}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="nav-icon">
                  <IconComp size={16} strokeWidth={2} />
                </span>

                <span className="nav-label">{item.label}</span>

                {item.badge > 0 && (
                  <span
                    className={`nav-badge ${
                      item.badgeType === 'danger'
                        ? 'nav-badge-danger'
                        : item.badgeType === 'info'
                        ? 'nav-badge-info'
                        : ''
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          };

          const renderSection = (title, sectionKey, itemKeys) => {
            const visibleItems = itemKeys.filter(k => {
              const item = navItems[k];
              if (!item) return false;
              if (item.adminOnly && !isAdmin) return false;
              return match(item.label);
            });
            if (q && visibleItems.length === 0) return null;
            const isOpen = q ? true : sidebarSections[sectionKey];

            return (
              <div className="nav-section" key={sectionKey}>
                <div className="nav-section-header" onClick={() => !q && toggleSection(sectionKey)}>
                  {title}
                  <span className={`chevron ${isOpen ? 'open' : ''}`}>{'\u25B8'}</span>
                </div>
                <div className={`nav-section-items ${isOpen ? 'expanded' : 'collapsed'}`}>
                  {visibleItems.map(k => renderItem(k))}
                </div>
              </div>
            );
          };

          const externalLinks = [
            { label: 'Transnet Portal', url: 'https://www.transnet.net/SubsiteRender.aspx?id=8137383', icon: Ship },
            { label: 'Marine Traffic', url: 'https://www.marinetraffic.com/en/ais/home/shipid:157944/zoom:10', icon: Waves },
            { label: 'FreightNews', url: 'https://www.freightnews.co.za/customs/3610/3823-19', icon: Newspaper },
            { label: 'Track-Trace', url: 'https://www.track-trace.com/', icon: MapPin },
            { label: 'MyDHLi Portal', url: 'https://keycloak.mydhli.com/auth/realms/DCI/protocol/openid-connect/auth?redirect_uri=https%3A%2F%2Fapp.mydhli.com%2Flogin&scope=openid+web-origins&response_type=code&client_id=myDHLi&ui_locales=en', icon: Package },
            { label: 'DSV Solutions', url: 'https://mydsv.com/new/frontpage/', icon: Truck },
            { label: 'Afrigistics', url: 'https://www.afrigistics.com/contact/', icon: Globe },
          ];
          const resourcesVisible = !q ? externalLinks : externalLinks.filter(l => l.label.toLowerCase().includes(q));
          const resourcesOpen = q ? resourcesVisible.length > 0 : sidebarSections.resources;

          return (
            <nav className="sidebar-nav">
              {match('Dashboard') && renderItem('dashboard')}
              {renderSection('Master Data', 'masterData', ['suppliers'])}
              {renderSection('Operations', 'operations', ['shipping', 'localReceiving', 'iwtIncoming', 'workflow', 'bolAudit'])}
              {renderSection('Warehouse', 'warehouse', ['receiving', 'dockManagement', 'stored'])}
              {renderSection('Warehouse Capacity per site', 'warehouseCapacitySites', ['capacityPretoria', 'capacityKlapmuts', 'capacityOffsite'])}
              {renderSection('Finance', 'finance', ['rates', 'costing', 'exportCosting', 'costingRequests'])}
              {renderSection('Reports', 'reports', ['reports', 'advancedReports', 'supplierPerformance', 'audit'])}

              {!sidebarCollapsed && (!q || resourcesVisible.length > 0) && (
                <div className="sidebar-resources">
                  <div
                    className="nav-section-header"
                    onClick={() => !q && toggleSection('resources')}
                  >
                    Resources
                    <span className={`chevron ${resourcesOpen ? 'open' : ''}`}>
                      {'\u25B8'}
                    </span>
                  </div>

                  <div className={`nav-section-items ${resourcesOpen ? 'expanded' : 'collapsed'}`}>
                    {resourcesVisible.map(link => {
                      const LinkIcon = link.icon;

                      return (
                        <button
                          key={link.label}
                          className="nav-item"
                          onClick={() => window.open(link.url, '_blank')}
                        >
                          <span className="nav-icon">
                            <LinkIcon size={16} strokeWidth={2} />
                          </span>
                          <span className="nav-label">{link.label}</span>
                          <span className="nav-external">{'\u2197'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </nav>
          );
        })()}

        {/* Quick Stats */}
        {!sidebarCollapsed && (
          <div className="sidebar-quick-stats">
            <div className="sidebar-qs-title">
              Quick Stats{' '}
              {calendarMonth !== null
                ? `· ${[
                    'Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'
                  ][calendarMonth]} ${calendarYear}`
                : `· ${calendarYear}`}
            </div>

            <div className="sidebar-qs-row">
              <span>Total Items</span>
              <strong>{calendarFilteredShipments.length}</strong>
            </div>

            <div className="sidebar-qs-row">
              <span>In Transit</span>
              <strong>
                {
                  calendarFilteredShipments.filter(
                    s =>
                      s.latestStatus === 'in_transit_roadway' ||
                      s.latestStatus === 'in_transit_seaway'
                  ).length
                }
              </strong>
            </div>

            <div className="sidebar-qs-row">
              <span>Delayed</span>
              <strong style={{ color: '#fbbf24' }}>
                {
                  calendarFilteredShipments.filter(
                    s => s.latestStatus && s.latestStatus.startsWith('delayed_')
                  ).length
                }
              </strong>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title={sidebarCollapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}>
            <span className="nav-icon">{theme === 'dark' ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}</span> <span className="nav-label">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button className="nav-item" onClick={() => setHelpOpen(true)} title={sidebarCollapsed ? 'Help & Guide' : undefined}>
            <span className="nav-icon"><BookOpen size={16} strokeWidth={2} /></span> <span className="nav-label">Help & Guide</span>
          </button>
          <button className="nav-item" onClick={() => setSettingsOpen(true)} title={sidebarCollapsed ? 'Settings' : undefined}>
            <span className="nav-icon"><SettingsIcon size={16} strokeWidth={2} /></span> <span className="nav-label">Settings</span>
          </button>
          <button className="nav-item" onClick={() => setNotificationPrefsOpen(true)} title={sidebarCollapsed ? 'Notifications' : undefined}>
            <span className="nav-icon"><Bell size={16} strokeWidth={2} /></span> <span className="nav-label">Notifications</span>
          </button>
          <button className="nav-item" onClick={() => setShowSupplierPortal(true)} title={sidebarCollapsed ? 'Supplier Portal' : undefined}>
            <span className="nav-icon"><Building2 size={16} strokeWidth={2} /></span> <span className="nav-label">Supplier Portal</span>
          </button>
          {isAdmin && (
            <button className={`nav-item ${activeView === 'users' ? 'active' : ''}`} onClick={() => navigateToPage('users')} title={sidebarCollapsed ? 'User Management' : undefined}>
              <span className="nav-icon"><Users size={16} strokeWidth={2} /></span> <span className="nav-label">User Management</span>
            </button>
          )}
          <button className="nav-item logout" onClick={handleLogout} title={sidebarCollapsed ? 'Logout' : undefined}>
            <span className="nav-icon"><LogOut size={16} strokeWidth={2} /></span> <span className="nav-label">Logout</span>
          </button>
        </div>
      </div>

      {/* main panel */}
      <div className="main-content">
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem',
          borderBottom: '1px solid var(--border)', marginBottom: '1rem',
          background: 'var(--surface)', width: '100%'
        }}>
          <SynercoreLogo size="medium" />
          <GlobalSearch shipments={shipments} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-500)' }}>
              Logged in as: <strong style={{ color: 'var(--text-900)' }}>{username}</strong>
            </div>
            <button
              onClick={() => setAlertHubOpen(true)}
              className="btn btn-info"
              style={{ position: 'relative', fontSize: '0.9rem' }}
              title="Open Alert Hub"
            >
              {'\u26A0\uFE0F'} Alerts
              {alerts.filter(a => !a.read).length > 0 && (
                <span style={{
                  position: 'absolute', top: '-8px', right: '-8px',
                  backgroundColor: 'var(--danger)', color: 'white',
                  borderRadius: '50%', minWidth: '20px', height: '20px',
                  fontSize: '0.7rem', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 'bold'
                }}>
                  {alerts.filter(a => !a.read).length}
                </span>
              )}
            </button>
            {isAdmin && costingRequestCount > 0 && (
              <button
                onClick={() => navigateToPage('costing-requests')}
                className="btn"
                style={{
                  position: 'relative', fontSize: '0.9rem',
                  backgroundColor: 'var(--warning)', color: 'white',
                  border: 'none', borderRadius: '6px',
                  padding: '0.5rem 1rem', cursor: 'pointer'
                }}
                title="View costing requests"
              >
                Costing Requests
                <span style={{
                  position: 'absolute', top: '-8px', right: '-8px',
                  backgroundColor: 'var(--danger)', color: 'white',
                  borderRadius: '50%', minWidth: '20px', height: '20px',
                  fontSize: '0.7rem', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 'bold'
                }}>
                  {costingRequestCount}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ============================
            ✅ TAB BAR
        ============================ */}
        <div className="tab-bar">
          {openTabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab ${location.pathname === tab.route ? 'active' : ''}`}
              onClick={() => startTransition(() => navigate(tab.route))}
            >
              <span className="tab-title">{tab.title}</span>

              {tab.route !== '/dashboard' && (
                <button
                  type="button"
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenTabs((prev) => {
                      const remaining = prev.filter(t => t.route !== tab.route);

                      if (location.pathname === tab.route) {
                        const fallbackRoute = remaining[remaining.length - 1]?.route || '/dashboard';
                        startTransition(() => navigate(fallbackRoute));
                      }

                      return remaining.length > 0 ? remaining : [{ id: 'dashboard', title: 'Dashboard', route: '/dashboard' }];
                    });
                  }}
                  title={`Close ${tab.title}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <ErrorBoundary>
          <Routes>
            <Route path="/shipping" element={
              <Suspense fallback={<PageLoader />}>
                <ErrorBoundary>
                  <ShippingView
                    shipments={shipments}
                    suppliers={suppliers}
                    onFileUpload={async (file) => {
                      await handleFileUpload(file, handleAddSupplier);
                      await fetchSuppliers();
                    }}
                    onUpdateShipment={handleUpdateShipment}
                    onDeleteShipment={handleDeleteShipment}
                    onCreateShipment={handleCreateShipment}
                    loading={loading}
                  />
                </ErrorBoundary>
              </Suspense>
            } />
            <Route path="/dashboard" element={
              <Suspense fallback={<PageLoader />}>
                <ErrorBoundary>
                  <Dashboard shipments={calendarFilteredShipments} onOpenLiveBoard={() => setLiveBoardOpen(true)} />
                </ErrorBoundary>
              </Suspense>
            } />
            <Route path="/suppliers" element={
              <Suspense fallback={<PageLoader />}>
                <ErrorBoundary>
                  <SupplierManagement
                    suppliers={suppliers}
                    shipments={shipments}
                    onAddSupplier={handleAddSupplier}
                    onUpdateSupplier={handleUpdateSupplier}
                    onDeleteSupplier={handleDeleteSupplier}
                    onImportSchedule={handleImportSchedule}
                    loading={loading}
                  />
                </ErrorBoundary>
              </Suspense>
            } />
            <Route path="/workflow" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><PostArrivalWorkflow /></ErrorBoundary></Suspense>
            } />
            <Route path="/receiving" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><GoodsReceiving /></ErrorBoundary></Suspense>
            } />
            <Route path="/dock-management" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><DockManagement shipments={shipments} /></ErrorBoundary></Suspense>
            } />
            <Route path="/local-receiving" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><LocalReceivingSchedule shipments={shipments} onCreateShipment={handleCreateShipment} onUpdateShipment={handleUpdateShipment} onDeleteShipment={handleDeleteShipment} onFileUpload={handleFileUpload} loading={loading} /></ErrorBoundary></Suspense>
            } />
            <Route path="/iwt-incoming" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><IWTIncoming shipments={shipments} onCreateShipment={handleCreateShipment} onUpdateShipment={handleUpdateShipment} onDeleteShipment={handleDeleteShipment} loading={loading} /></ErrorBoundary></Suspense>
            } />
            <Route path="/capacity" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><WarehouseCapacity shipments={shipments} /></ErrorBoundary></Suspense>
            } />
            <Route path="/capacity/pretoria" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><WarehouseCapacity shipments={shipments} initialWarehouse="PRETORIA" lockWarehouse /></ErrorBoundary></Suspense>
            } />
            <Route path="/capacity/klapmuts" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><WarehouseCapacity shipments={shipments} initialWarehouse="KLAPMUTS" lockWarehouse /></ErrorBoundary></Suspense>
            } />
            <Route path="/capacity/offsite" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><WarehouseCapacity shipments={shipments} initialWarehouse="OFFSITE" lockWarehouse /></ErrorBoundary></Suspense>
            } />
            <Route path="/stored" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><StoredWrapper /></ErrorBoundary></Suspense>
            } />
            <Route path="/archives" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><ArchiveView /></ErrorBoundary></Suspense>
            } />
            <Route path="/rates" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><RatesQuotes loading={loading} /></ErrorBoundary></Suspense>
            } />
            <Route path="/costing" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><ImportCosting /></ErrorBoundary></Suspense>
            } />
            <Route path="/export-costing" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><ExportCosting /></ErrorBoundary></Suspense>
            } />
            <Route path="/costing-requests" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary>{isAdmin ? <CostingRequests /> : <AccessDenied />}</ErrorBoundary></Suspense>
            } />
            <Route path="/reports" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><ReportsView shipments={shipments} /></ErrorBoundary></Suspense>
            } />
            <Route path="/advanced-reports" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><AdvancedReports /></ErrorBoundary></Suspense>
            } />
            <Route path="/users" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary>{isAdmin ? <UserManagement /> : <AccessDenied />}</ErrorBoundary></Suspense>
            } />
            <Route path="/supplier-performance" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><SupplierPerformance shipments={shipments} onUpdateShipment={handleUpdateShipment} /></ErrorBoundary></Suspense>
            } />
            <Route path="/bol-audit" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary><BolAudit /></ErrorBoundary></Suspense>
            } />
            <Route path="/audit" element={
              <Suspense fallback={<PageLoader />}><ErrorBoundary>{isAdmin ? <AuditLog /> : <AccessDenied />}</ErrorBoundary></Suspense>
            } />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </div>

      {!liveBoardOpen && (
        <button
          onClick={() => setLiveBoardOpen(true)}
          title="Open Live Board"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 900,
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            border: '2px solid rgba(5,150,105,0.5)',
            color: '#10b981', fontSize: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(5,150,105,0.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'; }}
        >
          📡
        </button>
      )}
      {liveBoardOpen && (
        <LiveBoard
          shipments={shipments}
          onClose={() => setLiveBoardOpen(false)}
          onRefresh={() => fetchShipments(true)}
        />
      )}

      <AlertHub
        open={alertHubOpen}
        onClose={() => setAlertHubOpen(false)}
        alerts={alerts}
        onDismiss={handleAlertDismiss}
        onMarkRead={handleAlertMarkRead}
        shipments={shipments}
        onDismissReminder={(shipmentId) => handleUpdateShipment(shipmentId, { reminderDate: null, reminderNote: null })}
      />
      {settingsOpen && (
        <UserSettings
          username={username}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {notificationPrefsOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'white', borderRadius: '8px' }}>
            <NotificationPreferences onClose={() => setNotificationPrefsOpen(false)} />
          </div>
        </div>
      )}
      {helpOpen && (
        <HelpGuide onClose={() => setHelpOpen(false)} />
      )}

      {/* Import Summary Modal */}
      {importResult && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 9000,
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '95%', maxWidth: '550px',
            maxHeight: '80vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>Import Summary</h3>
              <button onClick={() => setImportResult(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}>x</button>
            </div>

            {/* Stats tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f0fdf4', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#16a34a' }}>{importResult.imported}</div>
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: '600' }}>Imported</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: importResult.skipped > 0 ? '#fef2f2' : '#f9fafb', textAlign: 'center', border: `1px solid ${importResult.skipped > 0 ? '#fecaca' : '#e5e7eb'}` }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: importResult.skipped > 0 ? '#dc2626' : '#6b7280' }}>{importResult.skipped}</div>
                <div style={{ fontSize: '0.75rem', color: importResult.skipped > 0 ? '#991b1b' : '#6b7280', fontWeight: '600' }}>Duplicates Skipped</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f9fafb', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#6b7280' }}>{importResult.totalInFile || 0}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>Total in File</div>
              </div>
            </div>

            {importResult.emptyRows > 0 && (
              <div style={{ padding: '8px 12px', backgroundColor: '#fffbeb', borderRadius: '6px', fontSize: '0.85rem', color: '#92400e', marginBottom: '12px', border: '1px solid #fde68a' }}>
                {importResult.emptyRows} empty row(s) were ignored (no supplier name).
              </div>
            )}

            {/* Skipped duplicates list */}
            {importResult.skipped > 0 && importResult.skippedRefs?.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#dc2626', marginBottom: '6px' }}>
                  Duplicate Order References (already in system):
                </div>
                <div style={{
                  maxHeight: '150px', overflow: 'auto', padding: '8px', backgroundColor: '#fef2f2',
                  borderRadius: '6px', border: '1px solid #fecaca', fontSize: '0.8rem', color: '#991b1b',
                }}>
                  {importResult.skippedRefs.map((ref, i) => (
                    <div key={i} style={{ padding: '2px 0', borderBottom: i < importResult.skippedRefs.length - 1 ? '1px solid #fecaca' : 'none' }}>
                      {ref}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Imported list */}
            {importResult.imported > 0 && importResult.importedRefs?.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#16a34a', marginBottom: '6px' }}>
                  Successfully Imported:
                </div>
                <div style={{
                  maxHeight: '150px', overflow: 'auto', padding: '8px', backgroundColor: '#f0fdf4',
                  borderRadius: '6px', border: '1px solid #bbf7d0', fontSize: '0.8rem', color: '#166534',
                }}>
                  {importResult.importedRefs.map((ref, i) => (
                    <div key={i} style={{ padding: '2px 0', borderBottom: i < importResult.importedRefs.length - 1 ? '1px solid #bbf7d0' : 'none' }}>
                      {ref}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setImportResult(null)}
              style={{
                width: '100%', padding: '10px', backgroundColor: '#059669', color: 'white',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Password Expiry Modal — cannot be dismissed */}
      {passwordExpired && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'var(--surface, #fff)',
            borderRadius: '12px',
            padding: '32px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            border: '1px solid var(--border, #e2e8f0)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
              <h2 style={{ margin: '0 0 8px', fontSize: '20px', color: 'var(--text-900, #1a202c)' }}>
                Password Expired
              </h2>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-500, #718096)', lineHeight: '1.5' }}>
                Your password has expired. Please set a new password to continue.
              </p>
            </div>

            <form onSubmit={handleExpiredPasswordChange}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-700, #4a5568)', marginBottom: '6px' }}>
                  Current Password
                </label>
                <input
                  type="password"
                  value={pwChangeForm.currentPassword}
                  onChange={e => setPwChangeForm(f => ({ ...f, currentPassword: e.target.value }))}
                  disabled={pwChangeLoading}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: '14px',
                    border: '1px solid var(--border, #e2e8f0)', borderRadius: '6px',
                    backgroundColor: 'var(--bg, #fff)', color: 'var(--text-900, #1a202c)',
                    outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-700, #4a5568)', marginBottom: '6px' }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={pwChangeForm.newPassword}
                  onChange={e => setPwChangeForm(f => ({ ...f, newPassword: e.target.value }))}
                  disabled={pwChangeLoading}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: '14px',
                    border: '1px solid var(--border, #e2e8f0)', borderRadius: '6px',
                    backgroundColor: 'var(--bg, #fff)', color: 'var(--text-900, #1a202c)',
                    outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-700, #4a5568)', marginBottom: '6px' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={pwChangeForm.confirmPassword}
                  onChange={e => setPwChangeForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  disabled={pwChangeLoading}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: '14px',
                    border: '1px solid var(--border, #e2e8f0)', borderRadius: '6px',
                    backgroundColor: 'var(--bg, #fff)', color: 'var(--text-900, #1a202c)',
                    outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{
                padding: '10px 12px', marginBottom: '16px',
                backgroundColor: 'var(--info-bg, #ebf8ff)', borderRadius: '6px',
                border: '1px solid var(--info-border, #bee3f8)',
                fontSize: '12px', color: 'var(--text-600, #4a5568)', lineHeight: '1.5'
              }}>
                Password requirements: minimum 6 characters, at least one uppercase letter, one lowercase letter, and one number.
              </div>

              {pwChangeError && (
                <div style={{
                  backgroundColor: '#fee2e2', border: '1px solid #fecaca',
                  color: '#dc2626', padding: '10px 12px', borderRadius: '6px',
                  marginBottom: '16px', fontSize: '13px'
                }}>
                  {pwChangeError}
                </div>
              )}

              {pwChangeSuccess && (
                <div style={{
                  backgroundColor: '#d1fae5', border: '1px solid #a7f3d0',
                  color: '#059669', padding: '10px 12px', borderRadius: '6px',
                  marginBottom: '16px', fontSize: '13px'
                }}>
                  {pwChangeSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={pwChangeLoading}
                style={{
                  width: '100%', padding: '12px',
                  background: pwChangeLoading ? '#94a3b8' : 'linear-gradient(135deg, #059669, #10b981)',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  fontSize: '15px', fontWeight: 600,
                  cursor: pwChangeLoading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s'
                }}
              >
                {pwChangeLoading ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
