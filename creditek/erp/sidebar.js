// ─── sidebar.js — shell compartido de Creditek ERP ─────────────────────────
// Se auto-inyecta dentro de #app cuando hay sesión activa. Cada HTML solo
// necesita: quitar su <nav class="navbar">, envolver el resto de #app en
// <div class="main-content">, y agregar <script src="sidebar.js"></script>.
// Centraliza el cliente Supabase del navegador para que el shell y la página
// validen exactamente la misma sesión y no compitan durante el arranque.
(function () {
  const SHELL_PENDING_CLASS = 'creditek-shell-pending';
  const SHELL_AUTHENTICATED_CLASS = 'creditek-shell-authenticated';
  const SHELL_ERROR_CLASS = 'creditek-shell-error';
  const SHELL_READY_TIMEOUT_MS = 8_000;
  const KORA_TOOLTIP_DELAY_MS = 2_500;
  const KORA_VERSION = '3.2.0';
  const KORA_DISPLAY_VERSION = 'KORA v3.2';
  const SHELL_SCRIPT = document.currentScript;
  const KORA_SHELL_ENABLED = SHELL_SCRIPT?.dataset?.koraShell === '1.0.0';
  const KORA_SHELL_MODE = SHELL_SCRIPT?.dataset?.koraShellMode || 'erp';
  const KORA_ENV = window.__KORA_ENV__;
  const SUPABASE_URL = KORA_ENV?.KORA_ERP_SUPABASE_URL;
  const SUPABASE_ANON_KEY = KORA_ENV?.KORA_ERP_SUPABASE_ANON_KEY;
  const KORA_CONFIGURATION_AVAILABLE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const BOOT_TRACE_KEY = 'kora_shell_boot_trace';
  const trustedGetSession = new WeakMap();
  let bootstrapClient = null;
  let sharedPageClient = null;
  let bootStage = 'configuration';
  let initializationPromise = null;
  let routeAccessSettled = false;
  let settleRouteAccess;
  const routeAccessPromise = new Promise(resolve => { settleRouteAccess = resolve; });
  window.__KORA_ROUTE_ACCESS__ = routeAccessPromise;

  function finishRouteAccess(allowed, context = {}) {
    if (routeAccessSettled) return;
    routeAccessSettled = true;
    settleRouteAccess({ allowed, ...context });
  }

  function recordBootTrace(stage, status, details = {}) {
    try {
      const previous = JSON.parse(sessionStorage.getItem(BOOT_TRACE_KEY) || '[]');
      const trace = Array.isArray(previous) ? previous.slice(-39) : [];
      trace.push({ at: new Date().toISOString(), stage, status, ...details });
      sessionStorage.setItem(BOOT_TRACE_KEY, JSON.stringify(trace));
    } catch (_) {
      // El diagnóstico nunca debe impedir el arranque.
    }
  }

  function startBootStage(stage) {
    bootStage = stage;
    recordBootTrace(stage, 'started');
  }

  function completeBootStage(stage, details = {}) {
    recordBootTrace(stage, 'completed', details);
  }

  function safeDiagnosticMessage(value) {
    return String(value || 'Error desconocido')
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[correo]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[uuid]')
      .slice(0, 240);
  }

  function reportBootFailure(error) {
    const rawMessage = error && typeof error.message === 'string'
      ? error.message
      : String(error || 'Error desconocido');
    const message = safeDiagnosticMessage(rawMessage);
    const stack = error && typeof error.stack === 'string' ? error.stack : '';
    recordBootTrace(bootStage, 'failed', { message });
    console.error(`[KORA Shell] Error de inicialización | etapa=${bootStage} | mensaje=${message} | stack=${stack}`);
  }

  function installSharedSupabaseClient() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase no está disponible');
    }
    if (window.supabase.__creditekSharedClientInstalled) return;

    const createClient = window.supabase.createClient.bind(window.supabase);
    bootstrapClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    trustedGetSession.set(
      bootstrapClient,
      bootstrapClient.auth.getSession.bind(bootstrapClient.auth),
    );

    window.supabase.createClient = function createSharedClient(url, key, options) {
      if (url !== SUPABASE_URL) return createClient(url, key, options);
      if (!sharedPageClient) {
        sharedPageClient = createClient(url, key, options);
        const nativeGetSession = sharedPageClient.auth.getSession.bind(sharedPageClient.auth);
        trustedGetSession.set(sharedPageClient, nativeGetSession);
        sharedPageClient.auth.getSession = (...args) => routeAccessPromise.then(result => (
          result.allowed ? nativeGetSession(...args) : { data: { session: null }, error: null }
        ));
      }
      return sharedPageClient;
    };
    window.supabase.__creditekSharedClientInstalled = true;
  }

  function installBootCurtain() {
    document.documentElement.classList.add(SHELL_PENDING_CLASS);
    if (document.getElementById('creditekShellBootStyles')) return;

    const style = document.createElement('style');
    style.id = 'creditekShellBootStyles';
    style.textContent = `
html.${SHELL_PENDING_CLASS} body > * { visibility: hidden !important; }
html.${SHELL_PENDING_CLASS} body::before {
  content: ''; visibility: visible; position: fixed; inset: 0; z-index: 2147483646;
  background: #F8FAFC;
}
html.${SHELL_PENDING_CLASS} body::after {
  content: ''; visibility: visible; position: fixed; z-index: 2147483647;
  height: 64px; top: 0; left: 256px; right: 0;
  background: #FFFFFF; border-bottom: 1px solid #E2E8F0;
}
html.${SHELL_AUTHENTICATED_CLASS} #loginScreen { display: none !important; }
html.${SHELL_ERROR_CLASS} body::before,
html.${SHELL_ERROR_CLASS} body::after { display: none; }
html.${SHELL_ERROR_CLASS} #creditekShellBootError {
  visibility: visible !important; display: flex !important; position: fixed; inset: 0;
  z-index: 2147483647; align-items: center; justify-content: center; padding: 24px;
  background: #F5F5F7; color: #0B1E3D; font-family: Montserrat, Arial, sans-serif;
}
html.${SHELL_ERROR_CLASS} #creditekShellBootError > div {
  max-width: 420px; text-align: center; background: #fff; padding: 28px;
  border-radius: 16px; box-shadow: 0 12px 35px rgba(11,30,61,.12);
}
html.${SHELL_ERROR_CLASS} #creditekShellBootError button {
  margin-top: 18px; padding: 10px 18px; border: 0; border-radius: 10px;
  background: #0B1E3D; color: #fff; cursor: pointer; font: inherit;
}
@media (max-width: 1023px) {
  html.${SHELL_PENDING_CLASS} body::after { left: 0; }
}
    `;
    document.head.appendChild(style);
  }

  function markAuthenticated() {
    document.documentElement.classList.add(SHELL_AUTHENTICATED_CLASS);
  }

  function revealDestination() {
    document.documentElement.classList.remove(SHELL_PENDING_CLASS);
  }

  function showBootError(configurationMissing = false) {
    let errorEl = document.getElementById('creditekShellBootError');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'creditekShellBootError';
      errorEl.setAttribute('role', 'alert');
      errorEl.innerHTML = `
        <div>
          <strong>${configurationMissing ? 'Configuración de KORA no disponible' : 'No fue posible cargar esta sección.'}</strong>
          <p>${configurationMissing ? 'Contacta al administrador.' : 'Comprueba tu conexión e inténtalo nuevamente.'}</p>
          <button type="button">Recargar</button>
        </div>
      `;
      errorEl.querySelector('button').addEventListener('click', () => location.reload());
      document.body.appendChild(errorEl);
    }
    document.documentElement.classList.add(SHELL_ERROR_CLASS);
  }

  function showAccessDenied() {
    let errorEl = document.getElementById('creditekShellBootError');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'creditekShellBootError';
      errorEl.setAttribute('role', 'alert');
      errorEl.innerHTML = `
        <div>
          <strong>Acceso denegado</strong>
          <p>No tienes permiso para abrir esta sección de KORA.</p>
          <button type="button">Ir a mi inicio</button>
        </div>
      `;
      errorEl.querySelector('button').addEventListener('click', () => {
        const home = window.KoraAccessControl?.homeFor(window.creditekSidebar?.perfil);
        location.href = home || 'app.html';
      });
      document.body.appendChild(errorEl);
    }
    document.documentElement.classList.add(SHELL_ERROR_CLASS);
  }

  function withBootTimeout(promise) {
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Tiempo de espera agotado')),
        SHELL_READY_TIMEOUT_MS,
      );
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
  }

  function waitForPageReady(appEl) {
    if (appEl.dataset?.koraMounted === 'true') return Promise.resolve(true);
    if (appEl.classList.contains('show')) return Promise.resolve(true);
    if (document.querySelector?.('.sin-perfil-screen.show')) return Promise.resolve(true);

    return new Promise(resolve => {
      let finished = false;
      const done = ready => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(ready);
      };
      const observer = new MutationObserver(() => {
        if (
          appEl.classList.contains('show')
          || document.querySelector?.('.sin-perfil-screen.show')
        ) done(true);
      });
      const timeout = setTimeout(() => done(false), SHELL_READY_TIMEOUT_MS);
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['class'],
      });
    });
  }

  if (KORA_SHELL_MODE !== 'agents') {
    installBootCurtain();
    if (KORA_CONFIGURATION_AVAILABLE) installSharedSupabaseClient();
  }

  const MODULOS = [
    { titulo: 'TABLERO', icono: '📊', lucide: 'layout-dashboard', description: 'Indicadores ejecutivos, presupuestos y desempeño comercial.', items: [
      { label: 'Resumen ejecutivo', href: 'tablero.html', lucide: 'gauge', description: 'Resumen en tiempo real de ventas, utilidad, tiendas y alertas operativas.', roles: ['gerencia', 'auditoria'] },
      { label: 'Presupuestos', href: 'presupuestos.html', lucide: 'badge-dollar-sign', description: 'Consulta y compara los presupuestos comerciales por tienda y período.', roles: ['gerencia', 'auditoria'] },
      { label: 'Ejecutivos', href: 'tablero.html#ejecutivos', lucide: 'users-round', description: 'Compara el desempeño de los equipos y responsables comerciales.', roles: ['gerencia', 'auditoria'] },
    ]},
    { titulo: 'ANÁLISIS', icono: '📈', lucide: 'chart-no-axes-combined', description: 'Informes históricos, comparativos y exportables del negocio.', items: [
      { label: 'Análisis e informes', href: 'reportes.html', lucide: 'file-chart-column-increasing', description: 'Informes históricos, comparativos y exportables para análisis detallado.', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor'] },
    ]},
    { titulo: 'INVENTARIO', icono: '📦', lucide: 'package', description: 'Productos, existencias, traslados y trazabilidad por IMEI.', items: [
      { label: 'Catálogo', href: 'catalogo.html', lucide: 'grid-2x2', description: 'Administra referencias, categorías y datos maestros de los productos.', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Remisiones', href: 'remisiones.html', lucide: 'file-output', description: 'Crea y consulta envíos de mercancía entre central y tiendas.', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Stock', href: 'inventario.html', lucide: 'warehouse', description: 'Consulta las existencias disponibles por tienda, producto e IMEI.', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor'] },
      { label: 'Traslados', href: 'traslados.html', lucide: 'arrow-left-right', description: 'Gestiona movimientos de inventario entre tiendas y bodegas.', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Ajustes', href: 'ajustes.html', lucide: 'sliders-horizontal', description: 'Registra ajustes controlados de cantidades y existencias.', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Cierre mes', href: 'cierre-periodo.html', lucide: 'calendar-check', description: 'Cierra el período de inventario y conserva su trazabilidad.', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Auditoría cruzada', href: 'auditoria-cruzada.html', lucide: 'file-search', description: 'Compara existencias y movimientos para detectar diferencias.', roles: ['gerencia', 'auditoria'] },
      { label: 'Kardex', href: 'kardex.html', lucide: 'history', description: 'Revisa el historial cronológico de entradas y salidas de inventario.', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
    ]},
    { titulo: 'CAJA', icono: '💰', lucide: 'wallet-cards', description: 'Ventas, gastos, cierres y movimientos financieros diarios.', items: [
      { label: 'Ventas', href: 'ventas.html', lucide: 'shopping-cart', description: 'Registra y consulta las ventas realizadas por la tienda.', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor'] },
      { label: 'Gastos', href: 'gastos.html', lucide: 'receipt', description: 'Registra y consulta los gastos operativos autorizados.', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Cierre día', href: 'caja.html', lucide: 'circle-check-big', description: 'Concilia el efectivo esperado y realiza el cierre diario de caja.', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Cuenta cte.', href: 'cuenta-corriente.html', lucide: 'book-open-check', description: 'Administra saldos, abonos y movimientos con terceros.', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Conciliación', href: 'conciliacion.html', lucide: 'scale', description: 'Compara pagos y movimientos para identificar diferencias.', roles: ['gerencia', 'auditoria'] },
    ]},
    // FIX 23-jul-2026 v2 (paquete FIX_Sidebar_BodegaCentral_v1_23jul2026.md):
    // renombrar 'PROVEEDORES' → 'BODEGA CENTRAL', mover antes de CLIENTES,
    // renombrar item 'Registrar compra' → 'Compra proveedor', y agregar
    // 'Doc. remisión' visible también para admin_tienda (la tienda que
    // recibe una remisión necesita abrir el documento para aceptarla).
    // SPEC v2 · 23-jul-2026: Doc. remisión se quita del menú. Se abre con
    // ?remision_id=<uuid> desde el listado de remisiones.html (link por fila).
    { titulo: 'CREDITEK B2B', b2b: true, icono: '🏭', lucide: 'warehouse', description: 'Compras, proveedores, inventario central y resultado del negocio B2B.', items: [
      { label: 'Cartera de Proveedores', href: 'proveedores.html', lucide: 'hand-coins', description: 'Consulta obligaciones, pagos y saldos pendientes con proveedores.', roles: ['gerencia', 'auditoria'] },
      { label: 'Compra proveedor', href: 'compra-proveedor.html', lucide: 'package-plus', description: 'Registra compras, costos, pagos e ingreso de mercancía.', roles: ['gerencia', 'auditoria'] },
      { label: 'Inventario Central', href: 'bodega-central.html', lucide: 'warehouse', description: 'Consulta y administra las existencias de Creditek B2B.', roles: ['gerencia', 'auditoria'] },
      { label: 'Resultado B2B', href: 'utilidad-creditek.html', lucide: 'chart-no-axes-column-increasing', description: 'Analiza facturación, costo congelado, gastos y retiros B2B.', roles: ['gerencia', 'auditoria'] },
    ]},
    { titulo: 'CREDITEK ALIADOS', aliados: true, icono: '🤝', lucide: 'handshake', description: 'Importa, revisa y aprueba liquidaciones de plataformas para aliados.', items: [
      { label: 'Liquidaciones', href: 'aliados-liquidaciones.html', lucide: 'file-spreadsheet', description: 'Gestiona liquidaciones PayJoy y ALO, novedades, pagos y auditoría.', roles: ['gerencia', 'auditoria'] },
      { label: 'Tesorería', href: 'aliados-tesoreria.html', lucide: 'landmark', description: 'Administra pagos, compensaciones y saldos separados de B2B y Tercerización.', roles: ['gerencia', 'auditoria'] },
    ]},
    { titulo: 'CLIENTES', icono: '👤', lucide: 'users', description: 'Registro y validación segura de clientes de Creditek.', items: [
      { label: 'Registrar cliente', href: 'registro-interno.html', lucide: 'user-plus', description: 'Crea un cliente desde KORA con validaciones y trazabilidad interna.', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor'] },
      { label: 'Validación', href: 'validacion.html', lucide: 'badge-check', description: 'Revisa y valida la información registrada de los clientes.', roles: ['gerencia', 'auditoria'] },
    ]},
    { titulo: 'ADMINISTRACIÓN', lucide: 'shield-check', description: 'Incidencias, seguimiento y herramientas de soporte interno.', items: [
      { label: 'Compartir instalación', href: 'compartir-instalacion.html', lucide: 'share-2', description: 'Comparte el acceso oficial para instalar KORA en un dispositivo autorizado.', roles: ['gerencia', 'auditoria'] },
      { label: 'Centro de Incidencias', href: 'incidencias.html', lucide: 'bug', description: 'Gestiona responsables, prioridades, estados y soluciones.', roles: ['gerencia'] },
      { label: 'Reportar incidencia', href: 'incidencias.html#reportar', lucide: 'bug', description: 'Registra una incidencia para seguimiento.', roles: ['auditoria', 'admin_tienda'] },
      { label: 'Ver incidencias', href: 'incidencias.html#ver', lucide: 'bug', description: 'Consulta incidencias, respuestas, historial y cierre.', roles: ['auditoria'] },
      { label: 'Mis incidencias', href: 'incidencias.html#ver', lucide: 'bug', description: 'Consulta incidencias propias o de la tienda.', roles: ['admin_tienda'] },
    ]},
  ];

  const LOGO = '/creditek/shared/branding/creditek-logo.png';
  const ROL_LABEL = { gerencia: 'Gerencia', auditoria: 'Auditoría', admin_tienda: 'Admin tienda', asesor: 'Asesor' };
  const KORA_LUCIDE_URL = 'https://unpkg.com/lucide@1.27.0/dist/umd/lucide.min.js';
  if (KORA_SHELL_ENABLED) installKoraAssets();
  const KORA_PORTAL_MODULES = [
    { titulo: 'PRINCIPAL', lucide: 'layout-dashboard', items: [
      { label: 'Dashboard', action: 'dashboard', lucide: 'layout-dashboard' },
    ]},
    { titulo: 'AGENTES IA', lucide: 'sparkles', items: [
      { label: 'Diseño', action: 'module', href: 'creditek-agente-redes.html', lucide: 'palette' },
      { label: 'Respuestas', action: 'module', href: 'creditek-agente-respuestas.html', lucide: 'messages-square' },
      { label: 'Meta Ads', action: 'module', href: 'agente3-meta-ads.html', lucide: 'chart-spline' },
      { label: 'Calendario', action: 'module', href: 'creditek-agente-calendario.html', lucide: 'calendar-days' },
    ]},
    { titulo: 'COMERCIAL', lucide: 'briefcase-business', items: [
      { label: 'Portal B2B', action: 'module', href: '../portal/index.html', lucide: 'shopping-bag' },
      { label: 'Google Business', action: 'module', href: 'creditek-gbp-fichas.html', lucide: 'map-pin' },
      { label: 'Convenios de Aliados', action: 'external', href: '../convenios/index.html', lucide: 'handshake' },
    ]},
    { titulo: 'SISTEMA', lucide: 'settings', items: [
      { label: 'Configuración', action: 'configuration', lucide: 'settings' },
    ]},
  ];

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function paginaActual() {
    const partes = location.pathname.split('/');
    const pagina = partes[partes.length - 1] || 'app.html';
    return pagina.includes('.') ? pagina : `${pagina}.html`;
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'sidebarStyles';
    style.textContent = `
#app.show { display: flex !important; align-items: flex-start; }
.main-content { flex: 1; min-width: 0; max-width: 100%; overflow-x: hidden; }
.main-content .page,
.main-content .page-shell,
.main-content .container,
.main-content .dashboard { min-width: 0; max-width: 100%; box-sizing: border-box; }
.main-content img,
.main-content video,
.main-content canvas,
.main-content svg { max-width: 100%; }
.main-content input,
.main-content select,
.main-content textarea { max-width: 100%; min-width: 0; }
.main-content h1,
.main-content h2,
.main-content h3,
.main-content p,
.main-content td,
.main-content th { overflow-wrap: anywhere; }
.main-content .tabla-wrap,
.main-content .table-wrap,
.main-content .table-shell,
.main-content .kora-incidents-table-wrap,
.main-content [role="region"][aria-label*="columnas"] {
  max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.main-content .modal-box,
.main-content dialog { max-width: calc(100vw - 32px); }

.sidebar {
  width: 220px; flex-shrink: 0; background: var(--azul, #0B1E3D); color: white;
  display: flex; flex-direction: column; height: 100vh; position: sticky; top: 0;
  overflow-y: auto; scrollbar-width: thin; z-index: 20;
}
.sidebar .brand { padding: 20px 18px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.sidebar .brand img { height: 26px; object-fit: contain; margin-bottom: 12px; display: block; }
.sidebar .brand .nombre { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 13.5px; }
.sidebar .brand .rol { font-size: 11.5px; opacity: .7; margin-top: 2px; }
.sidebar .brand .tienda-texto { font-size: 11px; opacity: .6; margin-top: 8px; }
.sidebar .tienda-selector { margin-top: 10px; }
.sidebar .tienda-selector select {
  width: 100%; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
  color: white; border-radius: 8px; padding: 7px 8px; font-size: 12px; font-family: inherit;
}
.sidebar .tienda-selector select option { color: var(--azul, #0B1E3D); }

.sidebar nav { flex: 1; padding: 10px 0; }
.sidebar .modulo-header {
  display: flex; align-items: center; gap: 9px; padding: 11px 18px; cursor: pointer;
  font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  opacity: .85; transition: background .15s ease; user-select: none;
}
.sidebar .modulo-header:hover { background: rgba(255,255,255,0.06); }
.sidebar .modulo-header .flecha { margin-left: auto; font-size: 10px; transition: transform .2s ease; }
.sidebar .modulo-header.colapsado .flecha { transform: rotate(-90deg); }
.sidebar .submenu { overflow: hidden; max-height: 400px; transition: max-height .25s ease; }
.sidebar .submenu.colapsado { max-height: 0; }
.sidebar .submenu a {
  display: block; padding: 9px 14px 9px 40px; margin: 1px 8px; border-radius: 8px;
  color: rgba(255,255,255,0.75); text-decoration: none; font-size: 13px;
  transition: background .15s ease, color .15s ease;
}
.sidebar .submenu a:hover { background: rgba(255,255,255,0.08); color: white; }
.sidebar .submenu a.active { background: rgba(0,196,204,0.28); color: white; font-weight: 600; }

.sidebar .salir { padding: 14px 18px; border-top: 1px solid rgba(255,255,255,0.1); }
.sidebar .salir button {
  width: 100%; background: rgba(255,255,255,0.08); border: none; color: white;
  border-radius: 8px; padding: 9px; font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: background .15s ease;
}
.sidebar .salir button:hover { background: rgba(255,255,255,0.18); }

.sidebar-hamburguesa {
  display: none; position: fixed; top: 14px; left: 14px; z-index: 60;
  background: var(--azul, #0B1E3D); color: white; border: none; border-radius: 10px;
  width: 40px; height: 40px; font-size: 18px; cursor: pointer;
  box-shadow: 0 6px 16px -4px rgba(11,30,61,0.4);
}
.sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(11,30,61,0.4); z-index: 19; }
.sidebar-overlay.show { display: block; }

@media (max-width: 900px) {
  .sidebar {
    position: fixed; top: 0; left: 0; height: 100vh; transform: translateX(-100%);
    transition: transform .25s ease; box-shadow: 0 0 30px rgba(0,0,0,.35);
  }
  .sidebar.abierto { transform: translateX(0); }
  .sidebar-hamburguesa { display: flex; align-items: center; justify-content: center; }
  .main-content { padding-top: 54px; }
  .main-content .page,
  .main-content .page-shell,
  .main-content .dashboard { width: 100%; padding-left: 16px; padding-right: 16px; }
  .main-content .head,
  .main-content .page-top,
  .main-content .section-head,
  .main-content .panel-head,
  .main-content .actions,
  .main-content .modal-actions { flex-wrap: wrap; }
  .main-content .metrics,
  .main-content .kpis,
  .main-content .resumen,
  .main-content .resumen-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  }
}

@media (max-width: 640px) {
  .main-content .page,
  .main-content .page-shell,
  .main-content .dashboard { padding-left: 12px; padding-right: 12px; }
  .main-content .form-grid,
  .main-content .grid2,
  .main-content .filters,
  .main-content .movement-form,
  .main-content .item-row,
  .main-content .item-row.sin-central { grid-template-columns: minmax(0, 1fr); }
  .main-content .span-2,
  .main-content .field.full { grid-column: auto; }
  .main-content .toolbar > input,
  .main-content .toolbar > select,
  .main-content .toolbar > button,
  .main-content .filters > input,
  .main-content .filters > select,
  .main-content .filters > button { width: 100%; flex: 1 1 100%; }
  .main-content .modal,
  .main-content .modal-bg { padding: 10px; }
  .main-content .modal-box { padding: 18px 14px; max-width: calc(100vw - 20px); }
  .main-content .modal-actions > button { flex: 1 1 100%; }
}
    `;
    document.head.appendChild(style);
  }

  function nombreTienda(codigo, tiendas) {
    if (!codigo) return 'Central';
    return tiendas.find(t => t.codigo === codigo)?.nombre || codigo;
  }

  function buildSidebarHtml(perfil, tiendas) {
    const activa = paginaActual();
    const esCentral = perfil.rol === 'gerencia' || perfil.rol === 'auditoria';
    const puedeVerB2B = esCentral || perfil.es_admin_b2b === true;
    const rolLabel = ROL_LABEL[perfil.rol] || perfil.rol;

    const modulosHtml = MODULOS.filter(mod => (!mod.b2b || puedeVerB2B) && (!mod.aliados || perfil.es_operador_aliados)).map(mod => {
      const items = mod.items.filter(it => it.roles.includes(perfil.rol));
      if (!items.length) return '';
      const abierto = items.some(it => it.href === activa);
      return `
        <div class="modulo">
          <div class="modulo-header ${abierto ? '' : 'colapsado'}" data-modulo="${mod.titulo}">
            <span>${mod.icono}</span><span class="texto">${mod.titulo}</span><span class="flecha">▾</span>
          </div>
          <div class="submenu ${abierto ? '' : 'colapsado'}" data-submenu="${mod.titulo}">
            ${items.map(it => `<a href="${it.href}" class="${it.href === activa ? 'active' : ''}">${escapeHtml(it.label)}</a>`).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Gerencia y auditoría comparten una tienda activa entre pantallas. Cada
    // módulo decide cómo aplicar el contexto escuchando creditek:tienda-cambiada.
    const tiendaBloque = esCentral
      ? `<div class="tienda-selector">
          <select id="sidebarTiendaSel" title="Filtrar la pantalla por tienda">
            <option value="">Todas las tiendas</option>
            ${tiendas.map(t => `<option value="${escapeHtml(t.codigo)}">${escapeHtml(t.nombre)}</option>`).join('')}
          </select>
        </div>`
      : `<div class="tienda-texto">${escapeHtml(nombreTienda(perfil.tienda_codigo, tiendas))}</div>`;

    return `
      <button class="sidebar-hamburguesa" id="sidebarHamburguesa" aria-label="Abrir menú">☰</button>
      <div class="sidebar-overlay" id="sidebarOverlay"></div>
      <aside class="sidebar" id="sidebarEl">
        <div class="brand">
          <img src="${LOGO}" alt="Creditek">
          <div class="nombre">${escapeHtml(perfil.nombre)}</div>
          <div class="rol">${rolLabel}</div>
          ${tiendaBloque}
        </div>
        <nav>${modulosHtml}</nav>
        <div class="salir"><button id="sidebarSalir">Salir</button></div>
      </aside>
    `;
  }

  function wireInteractions(sb) {
    document.querySelectorAll('.modulo-header').forEach(header => {
      header.addEventListener('click', () => {
        const nombre = header.dataset.modulo;
        const submenu = document.querySelector(`.submenu[data-submenu="${nombre}"]`);
        header.classList.toggle('colapsado');
        if (submenu) submenu.classList.toggle('colapsado');
      });
    });

    const btnSalir = document.getElementById('sidebarSalir');
    if (btnSalir) btnSalir.addEventListener('click', async () => {
      await sb.auth.signOut();
      location.reload();
    });

    const hamburguesa = document.getElementById('sidebarHamburguesa');
    const overlay = document.getElementById('sidebarOverlay');
    const sidebarEl = document.getElementById('sidebarEl');
    function abrirDrawer() { sidebarEl.classList.add('abierto'); overlay.classList.add('show'); }
    function cerrarDrawer() { sidebarEl.classList.remove('abierto'); overlay.classList.remove('show'); }
    if (hamburguesa) hamburguesa.addEventListener('click', abrirDrawer);
    if (overlay) overlay.addEventListener('click', cerrarDrawer);
    sidebarEl.querySelectorAll('.submenu a').forEach(a => a.addEventListener('click', cerrarDrawer));

    const selTienda = document.getElementById('sidebarTiendaSel');
    if (selTienda) {
      const guardada = localStorage.getItem('creditek_sidebar_tienda');
      if (guardada) selTienda.value = guardada;
      selTienda.addEventListener('change', () => {
        localStorage.setItem('creditek_sidebar_tienda', selTienda.value);
        window.dispatchEvent(new CustomEvent('creditek:tienda-cambiada', {
          detail: { tiendaCodigo: selTienda.value },
        }));
      });
    }
  }

  function installKoraAssets() {
    if (!document.getElementById('koraShellStyles')) {
      const link = document.createElement('link');
      link.id = 'koraShellStyles';
      link.rel = 'stylesheet';
      link.href = '/design-system/components/kora-shell.css?v=2.0.4';
      document.head.appendChild(link);
    }
    if (!document.getElementById('koraLucide')) {
      const script = document.createElement('script');
      script.id = 'koraLucide';
      script.src = KORA_LUCIDE_URL;
      script.defer = true;
      script.addEventListener('load', () => window.lucide?.createIcons());
      document.head.appendChild(script);
    }
    if (!document.getElementById('koraIncidentStyles')) {
      const link = document.createElement('link');
      link.id = 'koraIncidentStyles';
      link.rel = 'stylesheet';
      link.href = '/design-system/components/kora-incident-center.css?v=1.1.1';
      document.head.appendChild(link);
    }
    if (!document.getElementById('koraContextHelpStyles')) {
      const link = document.createElement('link');
      link.id = 'koraContextHelpStyles';
      link.rel = 'stylesheet';
      link.href = '/design-system/components/kora-context-help.css?v=1.0.0';
      document.head.appendChild(link);
    }
    if (!document.getElementById('koraContextHelp')) {
      const help = document.createElement('script');
      help.id = 'koraContextHelp';
      help.src = '/creditek/erp/kora-context-help.js?v=1.0.0';
      document.head.appendChild(help);
    }
    if (!document.getElementById('koraNotifications')) {
      const notifications = document.createElement('script');
      notifications.id = 'koraNotifications';
      notifications.src = '/creditek/erp/kora-notifications.js?v=1.1.2';
      document.head.appendChild(notifications);
    }
    if (!document.getElementById('koraReportExport')) {
      const reports = document.createElement('script');
      reports.id = 'koraReportExport';
      reports.src = '/creditek/erp/kora-report-export.js?v=1.0.0';
      document.head.appendChild(reports);
    }
    if (!document.getElementById('koraInstall')) {
      const installer = document.createElement('script');
      installer.id = 'koraInstall';
      installer.src = '/creditek/erp/kora-install.js?v=1.0.0';
      document.head.appendChild(installer);
    }
    const installIncidentCenter = () => {
      if (document.getElementById('koraIncidentCenter')) return;
      const center = document.createElement('script');
      center.id = 'koraIncidentCenter';
      center.src = '/creditek/erp/kora-incident-center.js?v=1.2.1';
      document.head.appendChild(center);
    };
    if (window.KoraIncidentDomain || document.getElementById('koraIncidentDomain')) {
      if (window.KoraIncidentDomain) installIncidentCenter();
      else document.getElementById('koraIncidentDomain').addEventListener('load', installIncidentCenter, { once: true });
    } else {
      const domain = document.createElement('script');
      domain.id = 'koraIncidentDomain';
      domain.src = '/creditek/erp/kora-incident-domain.js?v=1.1.2';
      domain.addEventListener('load', installIncidentCenter, { once: true });
      document.head.appendChild(domain);
    }
  }

  function koraCurrentItem(modules) {
    const current = paginaActual();
    return modules.flatMap(module => module.items.map(item => ({ ...item, group: module.titulo })))
      .find(item => item.href?.split('#')[0] === current)
      || modules[0]?.items[0];
  }

  function modulesForProfile(profile) {
    const capabilities = {
      b2b: profile.rol === 'gerencia' || profile.rol === 'auditoria' || profile.es_admin_b2b === true,
      aliados: profile.es_operador_aliados === true,
    };
    return (window.KoraAccessControl?.navigationFor(profile, capabilities) || []).map(section => ({
      titulo: section.title,
      lucide: section.icon,
      description: section.title,
      items: section.items.map(item => ({
        label: item.label,
        href: item.href,
        lucide: item.icon,
        description: item.label,
      })),
    }));
  }

  function koraNavigationHtml(modules, role, activeItem, profile) {
    const puedeVerB2B = profile.rol === 'gerencia' || profile.rol === 'auditoria' || profile.es_admin_b2b === true;
    return modules.filter(module => (!module.b2b || puedeVerB2B) && (!module.aliados || profile.es_operador_aliados)).map(module => {
      const items = module.items.filter(item => !item.roles || item.roles.includes(role));
      if (!items.length) return '';
      const isActive = item => item === activeItem
        || (item.href && item.href === activeItem?.href)
        || (item.action && item.action === activeItem?.action && !item.href && !activeItem?.href);
      const open = items.some(isActive);
      return `<section class="kora-nav-group" data-open="${open}">
        <button class="kora-nav-group__label ghost" type="button" aria-expanded="${open}"
          data-kora-tooltip="${escapeHtml(module.description)}">
          <i data-lucide="${module.lucide || 'circle'}"></i><span>${escapeHtml(module.titulo)}</span>
          <i data-lucide="chevron-down"></i>
        </button>
        <div class="kora-nav-group__items">
          ${items.map(item => {
            const active = isActive(item);
            const href = item.action ? '#' : item.href;
            return `<a class="kora-nav-link" href="${escapeHtml(href)}"
              ${active ? 'aria-current="page"' : ''}
              data-kora-sound="interaction"
              data-kora-action="${escapeHtml(item.action || '')}"
              data-kora-href="${escapeHtml(item.href || '')}"
              data-kora-title="${escapeHtml(item.label)}"
              data-kora-tooltip="${escapeHtml(item.description || item.label)}">
              <i data-lucide="${escapeHtml(item.lucide || module.lucide || 'circle')}"></i>
              <span class="kora-nav-text">${escapeHtml(item.label)}</span>
            </a>`;
          }).join('')}
        </div>
      </section>`;
    }).join('');
  }

  function koraStoreHtml(profile, stores) {
    const central = profile.rol === 'gerencia' || profile.rol === 'auditoria';
    if (!central) {
      return `<span class="kora-extension"><i data-lucide="store"></i><span>${escapeHtml(nombreTienda(profile.tienda_codigo, stores))}</span></span>`;
    }
    return `<label class="kora-store">
      <span class="ctk-sr-only">Tienda</span>
      <select class="ctk-select" id="koraStoreSelector" aria-label="Tienda seleccionada">
        <option value="">Todas las tiendas</option>
        ${stores.map(store => `<option value="${escapeHtml(store.codigo)}">${escapeHtml(store.nombre)}</option>`).join('')}
      </select>
    </label>`;
  }

  function koraStaticIcon(name) {
    const icons = {
      menu: '<path d="M4 12h16"></path><path d="M4 6h16"></path><path d="M4 18h16"></path>',
      'panel-left-close': '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m16 15-3-3 3-3"></path>',
      'panel-left-open': '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m14 9 3 3-3 3"></path>',
      'sliders-horizontal': '<line x1="21" x2="14" y1="4" y2="4"></line><line x1="10" x2="3" y1="4" y2="4"></line><line x1="21" x2="12" y1="12" y2="12"></line><line x1="8" x2="3" y1="12" y2="12"></line><line x1="21" x2="16" y1="20" y2="20"></line><line x1="12" x2="3" y1="20" y2="20"></line><line x1="14" x2="14" y1="2" y2="6"></line><line x1="8" x2="8" y1="10" y2="14"></line><line x1="16" x2="16" y1="18" y2="22"></line>',
      bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"></path><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>',
      x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name}" data-lucide-static="${name}" aria-hidden="true">${icons[name]}</svg>`;
  }

  async function koraSha256(response) {
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function loadKoraVersionManifest({ aside, aboutDialog }) {
    const status = aboutDialog.querySelector('[data-kora-version-status]');
    const details = aboutDialog.querySelector('[data-kora-version-details]');
    const buildLabel = aside.querySelector('[data-kora-build]');
    const fields = [
      ['Versión KORA', 'displayVersion'], ['Build', 'shortCommit'], ['Commit completo', 'commit'],
      ['Deployment ID', 'deploymentId'], ['Worker Version', 'workerVersion'], ['Fecha del despliegue', 'deployedAt'],
      ['Rama', 'branch'], ['Estado del build', 'buildStatus'], ['SHA del artefacto', 'appSha256'],
      ['Ambiente', 'environment'], ['Shell Version', 'shellVersion'], ['Recursos cargados', 'resourceSummary'],
    ];
    try {
      const manifestResponse = await fetch('/kora-build-manifest.json', { cache: 'no-store' });
      if (!manifestResponse.ok) throw new Error('manifest');
      const manifest = await manifestResponse.json();
      manifest.shortCommit = manifest.commit?.slice(0, 7) || '—';
      buildLabel.textContent = manifest.shortCommit;
      const resourceChecks = await Promise.all((manifest.resources || []).map(async resource => {
        const response = await fetch(resource.path, { cache: 'no-store' });
        return response.ok && await koraSha256(response) === resource.sha256;
      }));
      const appResponse = await fetch(manifest.productionUrl, { cache: 'no-store' });
      const appMatches = appResponse.ok && await koraSha256(appResponse) === manifest.appSha256;
      manifest.resourceSummary = `${resourceChecks.filter(Boolean).length}/${resourceChecks.length}`;
      const verified = Boolean(
        manifest.runtimeMatchesRelease && appMatches && resourceChecks.length && resourceChecks.every(Boolean)
        && manifest.shellAssetVersion && manifest.shellVersion && manifest.environment === 'Producción',
      );
      status.textContent = verified ? 'Versión verificada' : 'Versión no verificada';
      status.style.color = verified ? '#087A65' : '#8A5A00';
      details.replaceChildren(...fields.flatMap(([label, key]) => {
        const term = document.createElement('dt');
        term.textContent = label;
        term.style.fontWeight = '700';
        const value = document.createElement('dd');
        value.textContent = manifest[key] || 'No disponible';
        value.style.cssText = 'margin:0;overflow-wrap:anywhere;color:#526075';
        return [term, value];
      }));
    } catch (_) {
      status.textContent = 'Versión no verificada';
      details.textContent = 'No fue posible validar el manifiesto de esta versión.';
    }
  }

  function mountKoraShell({ root, profile, stores = [], modules = MODULOS, activeItem, onLogout, supabaseClient, productName }) {
    if (!root || root.dataset.koraMounted === 'true') return;
    installKoraAssets();
    const shellProductName = productName || 'KORA';
    const current = activeItem || koraCurrentItem(modules);
    const roleLabel = ROL_LABEL[profile.rol] || profile.rol;
    const children = Array.from(root.children);
    const main = document.createElement('div');
    main.className = 'kora-shell-main';
    const content = document.createElement('div');
    content.className = 'kora-shell-content';
    children.forEach(child => content.appendChild(child));
    main.innerHTML = `<header class="kora-topbar">
      <button class="kora-icon-button kora-navigation-toggle ghost" type="button" aria-label="Colapsar navegación"
        data-kora-tooltip="Colapsar navegación">${koraStaticIcon('panel-left-close')}</button>
      <div class="kora-topbar__context">
        <h1 class="kora-topbar__title">${escapeHtml(current?.label || 'KORA')}</h1>
        <ol class="kora-breadcrumb" aria-label="Breadcrumb">
          <li>${escapeHtml(shellProductName)}</li><li>${escapeHtml(current?.group || 'Inicio')}</li><li aria-current="page">${escapeHtml(current?.label || 'Inicio')}</li>
        </ol>
      </div>
      <label class="kora-command">
        <span class="ctk-sr-only">Buscar módulo</span>
        <i data-lucide="search"></i>
        <input type="search" data-kora-command placeholder="Buscar módulo" autocomplete="off">
      </label>
      <div class="kora-topbar__actions">
        ${koraStoreHtml(profile, stores)}
        <span class="kora-extension" data-kora-connectivity data-state="online"><span class="kora-extension__dot"></span><span>En línea</span></span>
        <button class="kora-icon-button ghost" type="button" data-kora-audio-settings aria-label="Configuración de experiencia" title="Configuración de experiencia">${koraStaticIcon('sliders-horizontal')}</button>
        <button class="kora-icon-button ghost" type="button" data-kora-help aria-label="Guía de esta pantalla" title="Guía de esta pantalla" data-kora-tooltip="Guía de esta pantalla"><i data-lucide="circle-help"></i></button>
        <button class="kora-icon-button ghost" type="button" data-kora-notifications aria-label="Notificaciones" title="Notificaciones">${koraStaticIcon('bell')}</button>
        <div class="kora-profile"><span class="ctk-avatar">${escapeHtml((profile.nombre || 'K').slice(0, 1).toUpperCase())}</span>
          <span class="kora-profile__copy"><span class="kora-profile__name">${escapeHtml(profile.nombre)}</span><span class="kora-profile__role">${escapeHtml(roleLabel)}</span></span>
        </div>
      </div>
    </header>`;
    main.appendChild(content);

    const aside = document.createElement('aside');
    aside.className = 'kora-sidebar';
    aside.setAttribute('aria-label', 'Navegación principal');
    aside.dataset.open = 'false';
    aside.innerHTML = `<div class="kora-sidebar__brand">
      <div data-kora-brand data-variant="sidebar" data-product-name="${escapeHtml(productName)}" title="${escapeHtml(shellProductName)} — Creditek"></div>
      <button class="kora-icon-button kora-drawer-close ghost" type="button" aria-label="Cerrar navegación" title="Cerrar navegación">${koraStaticIcon('x')}</button>
    </div>
    <nav class="kora-sidebar__nav">${koraNavigationHtml(modules, profile.rol, current, profile)}</nav>
    <div class="kora-sidebar__footer">
      <button class="kora-nav-link kora-install-nav ghost" type="button" data-kora-install><i data-lucide="download"></i><span class="kora-nav-text">Instalar KORA</span></button>
      <button class="kora-nav-link ghost" type="button" data-kora-about><i data-lucide="info"></i><span class="kora-nav-text">Acerca de KORA</span></button>
      <button class="ghost kora-nav-text" type="button" data-kora-version style="display:block;width:100%;padding:4px 16px 10px;text-align:left;font-size:11px;line-height:1.45;opacity:.78">
        <span style="display:block">KORA ERP v3.2</span><span style="display:block">Build: <span data-kora-build>—</span></span><span style="display:block">Ambiente: Producción</span>
      </button>
      <button class="kora-nav-link kora-logout ghost" type="button"><i data-lucide="log-out"></i><span class="kora-nav-text">Cerrar sesión</span></button>
    </div>`;
    const aboutDialog = document.createElement('dialog');
    aboutDialog.setAttribute('aria-labelledby', 'koraAboutTitle');
    aboutDialog.style.cssText = 'max-width:440px;border:0;border-radius:18px;padding:0;box-shadow:0 24px 70px rgba(11,30,61,.24);color:#0B1E3D';
    aboutDialog.innerHTML = `<div style="padding:28px;min-width:min(380px,80vw)"><p style="margin:0 0 6px;color:#00A8B0;font-weight:700">Creditek ERP</p><h2 id="koraAboutTitle" style="margin:0 0 12px">${KORA_DISPLAY_VERSION}</h2><p data-kora-version-status style="font-weight:700;color:#8A5A00">Versión no verificada</p><dl data-kora-version-details style="display:grid;grid-template-columns:minmax(120px,auto) 1fr;gap:8px 16px;font-size:13px"></dl><button type="button" class="btn primary" data-kora-about-close style="margin-top:20px">Cerrar</button></div>`;
    const overlay = document.createElement('div');
    overlay.className = 'kora-drawer-overlay';
    overlay.hidden = true;

    root.append(aside, main, overlay, aboutDialog);
    root.classList.add('kora-shell-root');
    root.dataset.koraMounted = 'true';
    window.KoraAudio?.setUser?.(profile.id || profile.nombre || 'anonymous');
    root.dataset.sidebarCollapsed = localStorage.getItem('kora_sidebar_collapsed') === 'true' ? 'true' : 'false';

    const renderShellBrand = () => {
      const marker = aside.querySelector('[data-kora-brand]');
      marker.className = '';
      marker.dataset.variant = root.dataset.sidebarCollapsed === 'true' ? 'sidebar-collapsed' : 'sidebar';
      if (productName) marker.dataset.productName = productName;
      marker.dataset.koraBrandReady = 'false';
      marker.innerHTML = '';
      window.KoraBrand?.render?.(marker);
    };
    renderShellBrand();
    if (!window.KoraBrand) document.addEventListener('kora-brand-ready', renderShellBrand, { once: true });

    const focusable = () => Array.from(aside.querySelectorAll('a[href],button:not([disabled]),select:not([disabled])'));
    let previousFocus = null;
    const closeDrawer = () => {
      aside.dataset.open = 'false';
      aside.removeAttribute('role');
      aside.removeAttribute('aria-modal');
      overlay.hidden = true;
      previousFocus?.focus?.();
    };
    const openDrawer = () => {
      previousFocus = document.activeElement;
      aside.dataset.open = 'true';
      aside.setAttribute('role', 'dialog');
      aside.setAttribute('aria-modal', 'true');
      overlay.hidden = false;
      focusable()[0]?.focus();
    };
    aside.querySelector('.kora-drawer-close')?.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);
    const command = main.querySelector('[data-kora-command]');
    command?.addEventListener('input', () => {
      const query = command.value.trim().toLocaleLowerCase('es');
      aside.querySelectorAll('.kora-nav-group').forEach(group => {
        let matches = 0;
        group.querySelectorAll('.kora-nav-link').forEach(link => {
          const visible = !query || link.textContent.toLocaleLowerCase('es').includes(query);
          link.hidden = !visible;
          if (visible) matches += 1;
        });
        group.hidden = matches === 0;
        if (query && matches) group.dataset.open = 'true';
      });
    });
    command?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      const visibleLinks = Array.from(aside.querySelectorAll('.kora-nav-link:not([hidden])'));
      if (visibleLinks.length === 1) {
        event.preventDefault();
        visibleLinks[0].click();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && aside.dataset.open === 'true') closeDrawer();
      if (event.key === 'Tab' && aside.dataset.open === 'true') {
        const nodes = focusable();
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    const navigationControl = main.querySelector('.kora-navigation-toggle');
    const navigationMedia = matchMedia('(max-width: 63.999rem)');
    const syncNavigationControl = () => {
      if (!navigationControl) return;
      if (navigationMedia.matches) {
        navigationControl.setAttribute('aria-label', 'Abrir navegación');
        navigationControl.dataset.koraTooltip = 'Abrir navegación';
        navigationControl.removeAttribute('aria-expanded');
        navigationControl.innerHTML = koraStaticIcon('menu');
        return;
      }
      const collapsed = root.dataset.sidebarCollapsed === 'true';
      const label = collapsed ? 'Expandir navegación' : 'Colapsar navegación';
      navigationControl.setAttribute('aria-label', label);
      navigationControl.dataset.koraTooltip = label;
      navigationControl.setAttribute('aria-expanded', String(!collapsed));
      navigationControl.innerHTML = koraStaticIcon(collapsed ? 'panel-left-open' : 'panel-left-close');
    };
    syncNavigationControl();
    navigationMedia.addEventListener?.('change', syncNavigationControl);
    navigationControl?.addEventListener('click', () => {
      if (navigationMedia.matches) {
        openDrawer();
        return;
      }
      const collapsed = root.dataset.sidebarCollapsed !== 'true';
      root.dataset.sidebarCollapsed = String(collapsed);
      localStorage.setItem('kora_sidebar_collapsed', String(collapsed));
      renderShellBrand();
      syncNavigationControl();
    });
    installDelayedTooltips(root);
    aside.querySelectorAll('.kora-nav-group__label').forEach(button => button.addEventListener('click', () => {
      const group = button.closest('.kora-nav-group');
      const open = group.dataset.open !== 'true';
      group.dataset.open = String(open);
      button.setAttribute('aria-expanded', String(open));
    }));
    aside.querySelectorAll('.kora-nav-link[data-kora-action]').forEach(link => link.addEventListener('click', event => {
      const action = link.dataset.koraAction;
      if (!action) return;
      event.preventDefault();
      aside.querySelectorAll('[aria-current="page"]').forEach(node => node.removeAttribute('aria-current'));
      link.setAttribute('aria-current', 'page');
      const title = link.dataset.koraTitle;
      if (action === 'dashboard') window.showSection?.('dashboard', link);
      if (action === 'configuration') window.showSection?.('configuracion', link);
      if (action === 'module') window.openModule?.(link.dataset.koraHref, title, link);
      if (action === 'external') window.open(link.dataset.koraHref, '_blank', 'noopener');
      setKoraContext(title, [shellProductName, link.closest('.kora-nav-group')?.querySelector('.kora-nav-group__label span')?.textContent, title]);
      closeDrawer();
    }));
    aside.querySelector('.kora-logout')?.addEventListener('click', onLogout);
    aside.querySelector('[data-kora-install]')?.addEventListener('click', () => {
      if (window.KoraInstall) window.KoraInstall.open();
      else document.addEventListener('kora-install-ready', () => window.KoraInstall?.open(), { once: true });
    });
    const openAbout = () => aboutDialog.showModal();
    aside.querySelector('[data-kora-about]')?.addEventListener('click', openAbout);
    aside.querySelector('[data-kora-version]')?.addEventListener('click', openAbout);
    aboutDialog.querySelector('[data-kora-about-close]')?.addEventListener('click', () => aboutDialog.close());
    loadKoraVersionManifest({ aside, aboutDialog });
    const storeSelector = main.querySelector('#koraStoreSelector');
    if (storeSelector) {
      storeSelector.value = localStorage.getItem('creditek_sidebar_tienda') || '';
      storeSelector.addEventListener('change', () => localStorage.setItem('creditek_sidebar_tienda', storeSelector.value));
    }
    window.lucide?.createIcons();
    requestAnimationFrame(() => root.dataset.koraStable = 'true');
    const mountIncidentCenter = () => window.KoraIncidentCenter?.mount?.({
      sb: supabaseClient,
      profile,
      stores,
      koraVersion: document.documentElement.dataset.koraVersion
        || document.documentElement.dataset.koraEcosystem
        || KORA_VERSION,
    });
    mountIncidentCenter();
    if (!window.KoraIncidentCenter) {
      document.addEventListener('kora-incident-ready', mountIncidentCenter, { once: true });
    }
    const mountNotifications = () => window.KoraNotifications?.mount?.({
      sb: supabaseClient,
      profile,
    });
    mountNotifications();
    if (!window.KoraNotifications) {
      document.addEventListener('kora-notifications-ready', mountNotifications, { once: true });
    }
    const mountContextHelp = () => window.KoraContextHelp?.mount?.({
      button: main.querySelector('[data-kora-help]'),
      title: current?.label,
      description: current?.description,
    });
    mountContextHelp();
    if (!window.KoraContextHelp) {
      document.addEventListener('kora-context-help-ready', mountContextHelp, { once: true });
    }
    const mountReportExport = () => window.KoraReportExport?.mount?.({ profile, sb: supabaseClient });
    mountReportExport();
    if (!window.KoraReportExport) {
      document.addEventListener('kora-report-export-ready', mountReportExport, { once: true });
    }
  }

  function setKoraContext(title, breadcrumbs = ['KORA', title]) {
    const root = document.querySelector('.kora-shell-root');
    const titleNode = root?.querySelector('.kora-topbar__title');
    const breadcrumb = root?.querySelector('.kora-breadcrumb');
    if (titleNode) titleNode.textContent = title;
    if (breadcrumb) breadcrumb.innerHTML = breadcrumbs.filter(Boolean).map((item, index, list) =>
      `<li ${index === list.length - 1 ? 'aria-current="page"' : ''}>${escapeHtml(item)}</li>`).join('');
  }

  function installDelayedTooltips(root) {
    const tooltip = document.createElement('div');
    tooltip.className = 'kora-delayed-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    let timer = null;
    let target = null;

    const hide = () => {
      clearTimeout(timer);
      timer = null;
      target = null;
      tooltip.hidden = true;
    };
    const show = element => {
      const message = element.dataset.koraTooltip;
      if (!message) return;
      hide();
      target = element;
      timer = setTimeout(() => {
        if (target !== element || !element.isConnected) return;
        tooltip.textContent = message;
        tooltip.hidden = false;
        const anchor = element.getBoundingClientRect();
        const box = tooltip.getBoundingClientRect();
        const left = Math.min(
          window.innerWidth - box.width - 12,
          Math.max(12, anchor.right + 10),
        );
        const top = Math.min(
          window.innerHeight - box.height - 12,
          Math.max(12, anchor.top + (anchor.height - box.height) / 2),
        );
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      }, KORA_TOOLTIP_DELAY_MS);
    };

    root.querySelectorAll('[data-kora-tooltip]').forEach(element => {
      element.addEventListener('mouseenter', () => show(element));
      element.addEventListener('mouseleave', hide);
      element.addEventListener('focus', () => show(element));
      element.addEventListener('blur', hide);
      element.addEventListener('click', hide);
    });
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
  }

  function mountPortalShell() {
    const root = document.getElementById('app');
    const active = { label: 'Dashboard', action: 'dashboard', group: 'PRINCIPAL' };
    mountKoraShell({
      root,
      profile: { nombre: 'Oscar Pacheco', rol: 'gerencia' },
      modules: KORA_PORTAL_MODULES,
      activeItem: active,
      onLogout: () => window.doLogout?.(),
      productName: 'AURA',
    });
  }

  window.KoraNavigation = {
    mount(options) {
      mountKoraShell({
        ...options,
        modules: options.modules || MODULOS,
        activeItem: options.activeItem || koraCurrentItem(options.modules || MODULOS),
      });
    },
    mountPortal: mountPortalShell,
    setContext: setKoraContext,
    version: KORA_VERSION,
  };

  async function initialize() {
    const appEl = document.getElementById('app');
    if (!appEl) {
      revealDestination();
      return; // esta página no usa el shell compartido
    }

    try {
      startBootStage('configuration');
      if (!KORA_CONFIGURATION_AVAILABLE) {
        showBootError(true);
        return;
      }
      completeBootStage('configuration');
      startBootStage('supabase-client');
      const sb = bootstrapClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      completeBootStage('supabase-client');
      startBootStage('access-control');
      if (!window.KoraAccessControl) {
        finishRouteAccess(false);
        showBootError(true);
        return;
      }
      completeBootStage('access-control');
      const getTrustedSession = trustedGetSession.get(sb) || sb.auth.getSession.bind(sb.auth);
      startBootStage('session');
      const { data: sessionData } = await withBootTimeout(getTrustedSession());
      if (!sessionData || !sessionData.session) {
        completeBootStage('session', { authenticated: false });
        finishRouteAccess(true, { authenticated: false });
        if (document.body?.dataset?.koraRequiresAuth === 'true') {
          location.href = 'app.html';
          return;
        }
        revealDestination();
        return; // el login propio de la página se encarga
      }
      completeBootStage('session', { authenticated: true });

      markAuthenticated();
      const userId = sessionData.session.user.id;
      startBootStage('profile');
      const { data: perfil } = await withBootTimeout(
        sb.from('perfiles').select('*').eq('id', userId).maybeSingle(),
      );
      if (!perfil || !perfil.activo) {
        finishRouteAccess(false);
        showAccessDenied();
        return;
      }
      const experience = window.KoraAccessControl.resolveExperience(perfil);
      completeBootStage('profile', { active: true, experience });
      let esAdminB2b = false;
      if (typeof sb.rpc === 'function') {
        startBootStage('b2b-capability');
        const permisoB2b = await withBootTimeout(sb.rpc('es_admin_b2b'));
        esAdminB2b = permisoB2b?.error ? false : permisoB2b?.data === true;
      }
      perfil.es_admin_b2b = esAdminB2b;
      completeBootStage('b2b-capability', { enabled: esAdminB2b });
      let esOperadorAliados = false;
      if (typeof sb.rpc === 'function') {
        startBootStage('allies-capability');
        const permisoAliados = await withBootTimeout(sb.rpc('tiene_capacidad_aliados', { p_capacidad: 'revisor' }));
        esOperadorAliados = permisoAliados?.error ? false : permisoAliados?.data === true;
      }
      perfil.es_operador_aliados = esOperadorAliados;
      completeBootStage('allies-capability', { enabled: esOperadorAliados });

      const capabilities = { b2b: esAdminB2b, aliados: esOperadorAliados };
      startBootStage('authorization');
      const authorization = window.KoraAccessControl.authorize(perfil, location.pathname, capabilities);
      const pageClient = sharedPageClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.creditekSidebar = { perfil, tiendas: [], sb: pageClient, authorization };
      if (!authorization.allowed) {
        finishRouteAccess(false, { profile: perfil, authorization });
        showAccessDenied();
        return;
      }
      completeBootStage('authorization', { allowed: true, experience: authorization.experience });

      if (authorization.route === 'app.html') {
        const home = window.KoraAccessControl.homeFor(perfil);
        if (!home) {
          finishRouteAccess(false, { profile: perfil, authorization });
          showAccessDenied();
          return;
        }
        completeBootStage('ready', { outcome: 'redirect', experience });
        location.replace(home);
        return;
      }

      startBootStage('stores');
      const { data: tiendas } = await withBootTimeout(
        sb.from('origenes').select('codigo, nombre').eq('tipo', 'propia').eq('activo', true).order('nombre'),
      );
      completeBootStage('stores', { loaded: true });

      startBootStage('mount');
      if (KORA_SHELL_ENABLED) {
        appEl.classList.remove('hidden');
        mountKoraShell({
          root: document.querySelector('[data-kora-shell-root]') || appEl,
          profile: perfil,
          stores: tiendas || [],
          modules: modulesForProfile(perfil),
          supabaseClient: pageClient,
          onLogout: async () => {
            await pageClient.auth.signOut();
            location.reload();
          },
        });
      } else {
        injectStyles();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildSidebarHtml(perfil, tiendas || []);
        // El botón hamburguesa y el overlay van sueltos en <body>, el <aside> dentro de #app
        document.body.appendChild(wrapper.querySelector('#sidebarHamburguesa'));
        document.body.appendChild(wrapper.querySelector('#sidebarOverlay'));
        appEl.insertBefore(wrapper.querySelector('#sidebarEl'), appEl.firstChild);
        wireInteractions(pageClient);
      }
      completeBootStage('mount');

      // Expuesto por si alguna pantalla quiere leer la preferencia de tienda del sidebar.
      window.creditekSidebar = { perfil, tiendas: tiendas || [], sb: pageClient, authorization };
      if (typeof CustomEvent === 'function') {
        document.dispatchEvent?.(new CustomEvent('kora-sidebar-ready'));
      }
      completeBootStage('event', { name: 'kora-sidebar-ready' });
      finishRouteAccess(true, { profile: perfil, authorization });
      startBootStage('page-ready');
      if (await waitForPageReady(appEl)) {
        completeBootStage('page-ready');
        revealDestination();
        completeBootStage('ready', { outcome: 'mounted', experience });
      } else {
        reportBootFailure(new Error('La página no confirmó su estado listo'));
        showBootError();
      }
    } catch (error) {
      finishRouteAccess(false);
      reportBootFailure(error);
      // Evita revelar el login o contenido protegido después de confirmar una sesión.
      showBootError();
    }
  }

  function init() {
    if (!initializationPromise) {
      initializationPromise = initialize();
      window.__KORA_SHELL_READY__ = initializationPromise;
    }
    return initializationPromise;
  }

  if (KORA_SHELL_MODE === 'agents') {
    installKoraAssets();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
