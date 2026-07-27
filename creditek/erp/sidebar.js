// ─── sidebar.js — shell compartido de Creditek ERP ─────────────────────────
// Se auto-inyecta dentro de #app cuando hay sesión activa. Cada HTML solo
// necesita: quitar su <nav class="navbar">, envolver el resto de #app en
// <div class="main-content">, y agregar <script src="sidebar.js"></script>.
// No depende del script propio de cada página: usa su propio cliente de
// Supabase y lee la sesión ya guardada en localStorage por el login de la página.
(function () {
  const SHELL_PENDING_CLASS = 'creditek-shell-pending';
  const SHELL_AUTHENTICATED_CLASS = 'creditek-shell-authenticated';
  const SHELL_ERROR_CLASS = 'creditek-shell-error';
  const SHELL_READY_TIMEOUT_MS = 8_000;

  function installBootCurtain() {
    document.documentElement.classList.add(SHELL_PENDING_CLASS);
    if (document.getElementById('creditekShellBootStyles')) return;

    const style = document.createElement('style');
    style.id = 'creditekShellBootStyles';
    style.textContent = `
html.${SHELL_PENDING_CLASS} body > * { visibility: hidden !important; }
html.${SHELL_PENDING_CLASS} body::before {
  content: ''; visibility: visible; position: fixed; inset: 0; z-index: 2147483646;
  background: #F5F5F7;
}
html.${SHELL_PENDING_CLASS} body::after {
  content: ''; visibility: visible; position: fixed; z-index: 2147483647;
  width: 42px; height: 42px; top: calc(50% - 21px); left: calc(50% - 21px);
  border: 4px solid rgba(11,30,61,.12); border-top-color: #00C4CC;
  border-radius: 50%; animation: creditek-shell-spin .8s linear infinite;
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
@keyframes creditek-shell-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  html.${SHELL_PENDING_CLASS} body::after { animation: none; }
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

  function showBootError() {
    let errorEl = document.getElementById('creditekShellBootError');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'creditekShellBootError';
      errorEl.setAttribute('role', 'alert');
      errorEl.innerHTML = `
        <div>
          <strong>No fue posible cargar esta sección.</strong>
          <p>Comprueba tu conexión e inténtalo nuevamente.</p>
          <button type="button">Recargar</button>
        </div>
      `;
      errorEl.querySelector('button').addEventListener('click', () => location.reload());
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

  installBootCurtain();

  const SUPABASE_URL = 'https://jfkmiyvcdfbsbwchyvol.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impma21peXZjZGZic2J3Y2h5dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMzA5NjgsImV4cCI6MjA5OTcwNjk2OH0.kpAjGLbDnycU-B1kc-AqOvj6X2xH-KHBiKB94V7prcQ';

  const MODULOS = [
    { titulo: 'TABLERO', icono: '📊', items: [
      { label: 'Dashboard', href: 'tablero.html', roles: ['gerencia', 'auditoria'] },
      { label: 'Presupuestos', href: 'presupuestos.html', roles: ['gerencia', 'auditoria'] },
      { label: 'Ejecutivos', href: 'tablero.html#ejecutivos', roles: ['gerencia', 'auditoria'] },
    ]},
    { titulo: 'INVENTARIO', icono: '📦', items: [
      { label: 'Catálogo', href: 'catalogo.html', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Remisiones', href: 'remisiones.html', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Stock', href: 'inventario.html', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor'] },
      { label: 'Traslados', href: 'traslados.html', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Ajustes', href: 'ajustes.html', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Cierre mes', href: 'cierre-periodo.html', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Auditoría cruzada', href: 'auditoria-cruzada.html', roles: ['gerencia', 'auditoria'] },
      { label: 'Kardex', href: 'kardex.html', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
    ]},
    { titulo: 'CAJA', icono: '💰', items: [
      { label: 'Ventas', href: 'ventas.html', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor'] },
      { label: 'Gastos', href: 'gastos.html', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Cierre día', href: 'caja.html', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Cuenta cte.', href: 'cuenta-corriente.html', roles: ['gerencia', 'auditoria', 'admin_tienda'] },
      { label: 'Conciliación', href: 'conciliacion.html', roles: ['gerencia', 'auditoria'] },
    ]},
    // FIX 23-jul-2026 v2 (paquete FIX_Sidebar_BodegaCentral_v1_23jul2026.md):
    // renombrar 'PROVEEDORES' → 'BODEGA CENTRAL', mover antes de CLIENTES,
    // renombrar item 'Registrar compra' → 'Compra proveedor', y agregar
    // 'Doc. remisión' visible también para admin_tienda (la tienda que
    // recibe una remisión necesita abrir el documento para aceptarla).
    // SPEC v2 · 23-jul-2026: Doc. remisión se quita del menú. Se abre con
    // ?remision_id=<uuid> desde el listado de remisiones.html (link por fila).
    { titulo: 'BODEGA CENTRAL', icono: '🏭', items: [
      { label: 'Proveedores', href: 'proveedores.html', roles: ['gerencia', 'auditoria'] },
      { label: 'Compra proveedor', href: 'compra-proveedor.html', roles: ['gerencia', 'auditoria'] },
      { label: 'Bodega Central', href: 'bodega-central.html', roles: ['gerencia', 'auditoria'] },
      { label: 'Utilidad Creditek', href: 'utilidad-creditek.html', roles: ['gerencia', 'auditoria'] },
    ]},
    { titulo: 'CLIENTES', icono: '👤', items: [
      { label: 'Registro', href: 'registro.html', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor'] },
      { label: 'Validación', href: 'validacion.html', roles: ['gerencia', 'auditoria'] },
    ]},
    // SPEC_Modulo_Reportes_ERP_v1_23jul2026 · 24-jul-2026:
    // dashboard consolidado con Fase 1 completa (1.1 ventas, 1.2 cartera, 1.3 inventario)
    // + Fase 2 (2.1 presupuesto sobre tabla existente, 2.2 rentabilidad tienda, 2.3 categoría, 2.4 link)
    // + Fase 3 parcial (3.1 crecimiento, 3.2 top/slow, 3.4 proveedores). RLS heredada.
    { titulo: 'REPORTES', icono: '📈', items: [
      { label: 'Dashboard', href: 'reportes.html', roles: ['gerencia', 'auditoria', 'admin_tienda', 'asesor'] },
    ]},
  ];

  const LOGO = '/creditek/agentes/logos/creditek_logo_corregido_alta.png';
  const ROL_LABEL = { gerencia: 'Gerencia', auditoria: 'Auditoría', admin_tienda: 'Admin tienda', asesor: 'Asesor' };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function paginaActual() {
    const partes = location.pathname.split('/');
    return partes[partes.length - 1] || 'app.html';
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'sidebarStyles';
    style.textContent = `
#app.show { display: flex !important; align-items: flex-start; }
.main-content { flex: 1; min-width: 0; }

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
    const rolLabel = ROL_LABEL[perfil.rol] || perfil.rol;

    const modulosHtml = MODULOS.map(mod => {
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

    // Nota: en gerencia/auditoría el selector de tienda es informativo — guarda la
    // preferencia en localStorage pero no reescribe los filtros propios de cada
    // pantalla (cada una conserva su propio filtro de tienda, ya funcional).
    const tiendaBloque = esCentral
      ? `<div class="tienda-selector">
          <select id="sidebarTiendaSel" title="Preferencia de tienda (no filtra automáticamente cada pantalla)">
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
      });
    }
  }

  async function init() {
    const appEl = document.getElementById('app');
    if (!appEl) {
      revealDestination();
      return; // esta página no usa el shell compartido
    }

    try {
      const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: sessionData } = await withBootTimeout(sb.auth.getSession());
      if (!sessionData || !sessionData.session) {
        revealDestination();
        return; // el login propio de la página se encarga
      }

      markAuthenticated();
      const userId = sessionData.session.user.id;
      const { data: perfil } = await withBootTimeout(
        sb.from('perfiles').select('*').eq('id', userId).maybeSingle(),
      );
      if (!perfil || !perfil.activo) {
        if (await waitForPageReady(appEl)) revealDestination();
        else showBootError();
        return;
      }

      const { data: tiendas } = await withBootTimeout(
        sb.from('origenes').select('codigo, nombre').eq('tipo', 'propia').eq('activo', true).order('nombre'),
      );

      injectStyles();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildSidebarHtml(perfil, tiendas || []);
      // El botón hamburguesa y el overlay van sueltos en <body>, el <aside> dentro de #app
      document.body.appendChild(wrapper.querySelector('#sidebarHamburguesa'));
      document.body.appendChild(wrapper.querySelector('#sidebarOverlay'));
      appEl.insertBefore(wrapper.querySelector('#sidebarEl'), appEl.firstChild);

      wireInteractions(sb);

      // Expuesto por si alguna pantalla quiere leer la preferencia de tienda del sidebar.
      window.creditekSidebar = { perfil, tiendas: tiendas || [] };
      if (await waitForPageReady(appEl)) revealDestination();
      else showBootError();
    } catch (_) {
      // Evita revelar el login o contenido protegido después de confirmar una sesión.
      showBootError();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
