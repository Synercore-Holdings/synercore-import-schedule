// Route configuration mapping view names to URL paths
export const VIEW_ROUTES = {
  shipping:          '/shipping',
  dashboard:         '/dashboard',
  suppliers:         '/suppliers',
  workflow:          '/workflow',
  capacity:          '/capacity',
  'capacity-pretoria': '/capacity/pretoria',
  'capacity-klapmuts': '/capacity/klapmuts',
  'capacity-offsite':  '/capacity/offsite',
  stored:            '/stored',
  archives:          '/archives',
  rates:             '/rates',
  costing:           '/costing',
  'export-costing':  '/export-costing',
  'costing-requests': '/costing-requests',
  reports:           '/reports',
  'advanced-reports': '/advanced-reports',
  users:             '/users',
  audit:             '/audit',
  'bol-audit':       '/bol-audit',
  'supplier-performance': '/supplier-performance',
  'forwarder-carrier':    '/forwarder-carrier',
  receiving:             '/receiving',
  'dock-management':     '/dock-management',
  'local-receiving':     '/local-receiving',
  'iwt-incoming':        '/iwt-incoming',
  rejections:            '/rejections',
};

// Reverse map: path -> view name
export const ROUTE_VIEWS = Object.fromEntries(
  Object.entries(VIEW_ROUTES).map(([view, path]) => [path, view])
);
