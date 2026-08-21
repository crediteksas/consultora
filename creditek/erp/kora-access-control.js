(function (global) {
  'use strict';

  const CORPORATE_ROLES = new Set(['gerencia', 'auditoria']);
  const STORE_ROLES = new Set(['admin_tienda', 'asesor']);
  const PUBLIC_ROUTES = new Set(['app.html', 'cambiar-clave.html', 'index.html']);
  const B2B_ROUTES = new Set([
    'proveedores.html', 'compra-proveedor.html', 'bodega-central.html',
    'remisiones.html', 'documento-remision.html', 'cuenta-corriente.html',
    'utilidad-creditek.html',
  ]);
  const ALLIES_ROUTES = new Set([
    'aliados-dashboard.html', 'aliados.html', 'aliados-ejecutivos.html',
    'aliados-plataformas.html', 'aliados-liquidaciones.html', 'aliados-calidad.html',
    'aliados-bonificaciones.html', 'aliados-reportes.html', 'aliados-tesoreria.html',
  ]);
  const CORPORATE_ROUTES = new Set([
    'tablero.html', 'presupuestos.html', 'ventas.html', 'registro-interno.html',
    'validacion.html', 'caja.html', 'inventario.html', 'catalogo.html',
    'traslados.html', 'ajustes.html', 'cierre-periodo.html', 'kardex.html',
    'gastos.html', 'reportes.html', 'conciliacion.html', 'auditoria-cruzada.html',
    'incidencias.html', ...B2B_ROUTES, ...ALLIES_ROUTES,
  ]);
  const STORE_ROUTES_BY_ROLE = Object.freeze({
    admin_tienda: new Set([
      'reportes.html', 'ventas.html', 'registro-interno.html', 'caja.html',
      'inventario.html', 'gastos.html', 'cuenta-corriente.html', 'remisiones.html',
      'documento-remision.html', 'incidencias.html',
    ]),
    asesor: new Set(['reportes.html', 'ventas.html', 'registro-interno.html', 'inventario.html']),
  });

  const CORPORATE_NAVIGATION = Object.freeze([
    { title: 'TABLERO', icon: 'layout-dashboard', items: [
      { label: 'Resumen ejecutivo', href: 'tablero.html', icon: 'gauge' },
    ] },
    { title: 'CREDITEK RETAIL', icon: 'store', items: [
      { label: 'Dashboard Retail', href: 'reportes.html#retail', icon: 'chart-no-axes-combined' },
      { label: 'Ventas', href: 'ventas.html', icon: 'shopping-cart' },
      { label: 'Clientes', href: 'registro-interno.html', icon: 'users' },
      { label: 'Caja', href: 'caja.html', icon: 'wallet-cards' },
      { label: 'Inventario Retail', href: 'inventario.html', icon: 'package' },
      { label: 'Gastos', href: 'gastos.html', icon: 'receipt' },
      { label: 'Cartera Retail', href: 'cuenta-corriente.html#retail', icon: 'book-open-check' },
      { label: 'Reportes Retail', href: 'reportes.html', icon: 'file-chart-column-increasing' },
    ] },
    { title: 'CREDITEK B2B', icon: 'warehouse', capability: 'b2b', items: [
      { label: 'Dashboard B2B', href: 'utilidad-creditek.html#dashboard', icon: 'layout-dashboard' },
      { label: 'Compras', href: 'compra-proveedor.html', icon: 'package-plus' },
      { label: 'Proveedores', href: 'proveedores.html', icon: 'contact-round' },
      { label: 'Inventario Central', href: 'bodega-central.html', icon: 'warehouse' },
      { label: 'Remisiones', href: 'remisiones.html', icon: 'file-output' },
      { label: 'Cuenta Corriente', href: 'cuenta-corriente.html', icon: 'book-open-check' },
      { label: 'Consignaciones', href: 'cuenta-corriente.html#consignaciones', icon: 'landmark' },
      { label: 'Cartera de Proveedores', href: 'proveedores.html#cartera', icon: 'hand-coins' },
      { label: 'Resultado B2B', href: 'utilidad-creditek.html', icon: 'chart-no-axes-column-increasing' },
      { label: 'Reportes B2B', href: 'utilidad-creditek.html#reportes', icon: 'file-chart-column-increasing' },
    ] },
    { title: 'CREDITEK ALIADOS', icon: 'handshake', capability: 'aliados', items: [
      { label: 'Dashboard Aliados', href: 'aliados-dashboard.html', icon: 'layout-dashboard' },
      { label: 'Aliados', href: 'aliados.html', icon: 'handshake' },
      { label: 'Ejecutivos', href: 'aliados-ejecutivos.html', icon: 'users-round' },
      { label: 'Plataformas', href: 'aliados-plataformas.html', icon: 'panels-top-left' },
      { label: 'Liquidaciones', href: 'aliados-liquidaciones.html', icon: 'file-spreadsheet' },
      { label: 'Tesorería', href: 'aliados-tesoreria.html', icon: 'landmark' },
      { label: 'Calidad', href: 'aliados-calidad.html', icon: 'badge-check' },
      { label: 'Bonificaciones', href: 'aliados-bonificaciones.html', icon: 'badge-dollar-sign' },
      { label: 'Reportes Aliados', href: 'aliados-reportes.html', icon: 'file-chart-column-increasing' },
    ] },
    { title: 'ADMINISTRACIÓN', icon: 'shield-check', items: [
      { label: 'Centro de Incidencias', href: 'incidencias.html', icon: 'bug', roles: ['gerencia'] },
      { label: 'Reportar incidencia', href: 'incidencias.html#reportar', icon: 'bug', roles: ['auditoria'] },
      { label: 'Ver incidencias', href: 'incidencias.html#ver', icon: 'bug', roles: ['auditoria'] },
    ] },
  ]);

  const STORE_NAVIGATION = Object.freeze([
    { title: 'MI TIENDA', icon: 'store', items: [
      { label: 'Resumen de mi tienda', href: 'reportes.html', icon: 'gauge', roles: ['admin_tienda', 'asesor'] },
      { label: 'Ventas', href: 'ventas.html', icon: 'shopping-cart', roles: ['admin_tienda', 'asesor'] },
      { label: 'Clientes', href: 'registro-interno.html', icon: 'users', roles: ['admin_tienda', 'asesor'] },
      { label: 'Caja', href: 'caja.html', icon: 'wallet-cards', roles: ['admin_tienda'] },
      { label: 'Inventario', href: 'inventario.html', icon: 'package', roles: ['admin_tienda', 'asesor'] },
      { label: 'Remisiones', href: 'remisiones.html', icon: 'file-output', roles: ['admin_tienda'] },
      { label: 'Gastos', href: 'gastos.html', icon: 'receipt', roles: ['admin_tienda'] },
      { label: 'Cartera', href: 'cuenta-corriente.html', icon: 'book-open-check', roles: ['admin_tienda'] },
      { label: 'Reportes', href: 'reportes.html#reportes', icon: 'file-chart-column-increasing', roles: ['admin_tienda', 'asesor'] },
      { label: 'Reportar incidencia', href: 'incidencias.html#reportar', icon: 'bug', roles: ['admin_tienda'] },
      { label: 'Mis incidencias', href: 'incidencias.html#ver', icon: 'bug', roles: ['admin_tienda'] },
    ] },
  ]);

  function normalizeRoute(value) {
    const raw = String(value || '').split('#')[0].split('?')[0];
    const last = raw.split('/').filter(Boolean).pop() || 'app';
    return last.includes('.') ? last : `${last}.html`;
  }

  function resolveExperience(profile) {
    if (!profile?.activo) return null;
    if (CORPORATE_ROLES.has(profile.rol)) return 'corporate';
    if (STORE_ROLES.has(profile.rol) && profile.tienda_codigo) return 'store';
    return null;
  }

  function homeFor(profile) {
    const experience = resolveExperience(profile);
    if (experience === 'corporate') return 'tablero.html';
    if (experience === 'store') return 'reportes.html';
    return null;
  }

  function authorize(profile, route, capabilities = {}) {
    const normalized = normalizeRoute(route);
    if (PUBLIC_ROUTES.has(normalized)) return { allowed: true, route: normalized, experience: resolveExperience(profile) };
    const experience = resolveExperience(profile);
    if (!experience) return { allowed: false, route: normalized, experience: null };
    if (experience === 'store') {
      return { allowed: STORE_ROUTES_BY_ROLE[profile.rol].has(normalized), route: normalized, experience };
    }
    const hasFullCorporateAccess = profile.rol === 'gerencia';
    const hasB2BReadAccess = hasFullCorporateAccess || profile.rol === 'auditoria';
    if (!CORPORATE_ROUTES.has(normalized)) return { allowed: false, route: normalized, experience };
    if (!hasB2BReadAccess && B2B_ROUTES.has(normalized) && capabilities.b2b !== true) return { allowed: false, route: normalized, experience };
    if (!hasFullCorporateAccess && ALLIES_ROUTES.has(normalized) && capabilities.aliados !== true) return { allowed: false, route: normalized, experience };
    return { allowed: true, route: normalized, experience };
  }

  function navigationFor(profile, capabilities = {}) {
    const experience = resolveExperience(profile);
    if (experience === 'corporate') {
      const hasFullCorporateAccess = profile.rol === 'gerencia';
      const hasB2BReadAccess = hasFullCorporateAccess || profile.rol === 'auditoria';
      return CORPORATE_NAVIGATION
        .filter(section => section.capability === 'b2b'
          ? hasB2BReadAccess || capabilities.b2b === true
          : hasFullCorporateAccess || !section.capability || capabilities[section.capability] === true)
        .map(section => ({
          ...section,
          items: section.items
            .filter(item => !item.roles || item.roles.includes(profile.rol))
            .map(item => ({ ...item })),
        }))
        .filter(section => section.items.length > 0);
    }
    if (experience === 'store') {
      return STORE_NAVIGATION.map(section => ({
        ...section,
        items: section.items.filter(item => item.roles.includes(profile.rol)).map(item => ({ ...item })),
      }));
    }
    return [];
  }

  global.KoraAccessControl = Object.freeze({
    authorize,
    homeFor,
    navigationFor,
    normalizeRoute,
    resolveExperience,
  });
})(window);
