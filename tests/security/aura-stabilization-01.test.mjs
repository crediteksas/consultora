import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');

const hub = await read('creditek/agentes/index.html');
const redes = await read('creditek/agentes/creditek-agente-redes.html');
const sofia = await read('creditek/agentes/creditek-agente-respuestas.html');
const calendar = await read('creditek/agentes/creditek-agente-calendario.html');
const googleBusiness = await read('creditek/agentes/creditek-gbp-fichas.html');
const agentBootstrap = await read('creditek/agentes/aura-agent-bootstrap.js');
const build = await read('scripts/build-aura-hub.mjs');
const config = await read('wrangler.aura-hub.jsonc');
const dashboardKpis = await read('creditek/agentes/aura-dashboard-kpis.mjs');
const incidents = await import('../../creditek/agentes/aura-incident-report.mjs');

test('el shell conserva encabezado y barra lateral mientras cada módulo ocupa el área de contenido', () => {
  assert.match(hub, /#app\.visible\{display:grid/);
  assert.match(hub, /grid-template-columns:var\(--sidebar\) minmax\(0,1fr\)/);
  assert.match(hub, /\.content\{[^}]*overflow-y:auto/);
  assert.match(hub, /\.iframe-view\{[^}]*position:relative[^}]*min-height:0[^}]*overflow:hidden/);
  assert.doesNotMatch(hub, /\.iframe-view\{[^}]*position:fixed/);
  assert.doesNotMatch(hub, /\.iframe-view\{[^}]*100vw/);
  assert.doesNotMatch(hub, /\.iframe-view\{[^}]*100vh/);
  assert.match(hub, /id="main-iframe" src="about:blank"/);
});

test('AURA muestra identidad, nombres reales e iconos existentes sin accesos de KORA', () => {
  assert.match(hub, /class="sidebar-brand-name">AURA</);
  assert.match(hub, /class="sidebar-brand-by">by</);
  assert.match(hub, /class="sidebar-brand-logo"[^>]*creditek_logo_corregido_alta\.png/);
  assert.match(hub, /body\.kora-product-page \.sidebar-home\{background:#fff!important;color:var\(--navy\)!important/);
  assert.match(hub, /\.sidebar-home\{[^}]*align-items:flex-start/);
  assert.match(hub, /\.sidebar-brand-logo\{[^}]*border:1px solid #E2E8F0[^}]*border-radius:6px/);
  assert.doesNotMatch(hub, /id="aura-user-(?:initials|name|role)"/);
  assert.doesNotMatch(hub, /Propietario AURA/);
  for (const name of ['Piezas comerciales', 'Sofía', 'Publicación y métricas', 'Calendario de contenido']) {
    assert.match(hub, new RegExp(`>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`, 'i'));
  }
  assert.doesNotMatch(hub, /Agente [13] ·/);
  assert.doesNotMatch(hub, />\s*Reportes\s*</i);
  assert.doesNotMatch(hub, /Acerca de KORA|KORA ERP/);
  assert.match(hub, /data-lucide="layout-dashboard"/);
  assert.match(hub, /data-lucide="settings"/);
  assert.match(hub, /data-lucide="log-out"/);
});

test('el acceso y Redes Sociales usan iconos reales sin controles que oculten campos', () => {
  assert.match(hub, /class="password-toggle"[^>]*><i data-lucide="eye"><\/i><\/button>/);
  assert.match(hub, /body\.kora-product-page \.password-toggle\{[^}]*width:34px!important[^}]*background:transparent!important/);
  assert.match(hub, /button\.innerHTML = visible \? '<i data-lucide="eye"><\/i>' : '<i data-lucide="eye-off"><\/i>'/);
  for (const icon of ['building-2', 'sun', 'smile', 'square', 'pencil', 'refresh-cw', 'package', 'send', 'layout-grid', 'smartphone', 'download']) {
    assert.match(redes, new RegExp(`data-lucide="${icon}"`));
  }
  assert.doesNotMatch(redes, /<button class="estilo-btn[^>]*>[🏢🎉😂◻✏]/u);
  assert.doesNotMatch(redes, /id="refs-update-btn"[^>]*>🔄/u);
  for (const icon of ['thumbs-up', 'camera', 'message-circle', 'music-2']) {
    assert.match(calendar, new RegExp(`data-lucide="${icon}"`));
  }
  assert.match(sofia, /class="corr-btn-save"[^>]*><i data-lucide="save"><\/i>/);
});

test('el botón AURA vuelve al Panel general y Sofía usa su ruta canónica', () => {
  assert.match(hub, /data-aura-home[\s\S]*showSection\('dashboard'/);
  assert.match(hub, /openModule\('\/creditek\/agentes\/creditek-agente-respuestas\.html','Sofía'/);
  assert.doesNotMatch(hub, /openModule\('sofia-aura-20260803b\.html'/);
  assert.match(sofia, /\.conv-scroll\{[^}]*overflow-y:auto/);
  assert.match(sofia, /\.chat-msgs\{[^}]*overflow-y:auto/);
});

test('los módulos internos revelan su contenido al cargarse dentro del iframe de AURA', () => {
  assert.match(agentBootstrap, /global\.self !== global\.top/);
  assert.match(agentBootstrap, /root\?\.classList\.add\('show'\)/);
});

test('el Panel general muestra los KPI comerciales certificados y delega la ayuda al tooltip central', () => {
  const indicators = hub.match(/class="qstat"[^>]*tabindex="0"[^>]*data-help=/g) || [];
  assert.equal(indicators.length, 2);
  assert.match(hub, /class="qstat-label">Clientes inscritos</);
  assert.match(hub, /class="qstat-label">Leads enviados</);
  assert.match(hub, /id="clientes-inscritos-hoy"/);
  assert.match(hub, /id="clientes-inscritos-mes"/);
  assert.match(hub, /id="leads-enviados-hoy"/);
  assert.match(hub, /id="leads-enviados-mes"/);
  assert.match(hub, /updateCommercialKpis/);
  assert.match(dashboardKpis, /aura-commercial-kpis-api\.comercial-853\.workers\.dev\/api\/commercial-kpis/);
  assert.doesNotMatch(hub, /pending-publications-(?:value|sub)/);
  assert.doesNotMatch(hub, /updatePendingPublicationsKpi/);
  assert.doesNotMatch(hub, /class="qstat-label">Tiendas activas</);
  assert.doesNotMatch(hub, /class="qstat-label">Pendientes de publicación</);
  assert.doesNotMatch(hub, /class="qstat-label">Plataformas</);
  assert.doesNotMatch(hub, /class="qstat-label">Meta target</);
  assert.doesNotMatch(hub, /\.qstat:is\(:hover,:focus-visible\)::after/);
  assert.match(hub, /aura-context-help\.js/);
});

test('Herramientas comerciales muestra Registro de clientes como opción no activa y sin ruta KORA', () => {
  assert.match(hub, /class="tool-row[^"']*"[^>]*aria-disabled="true"[^>]*data-aura-help="Esta función requiere una ruta segura propia de AURA"/);
  assert.match(hub, /data-lucide="users"/);
  assert.match(hub, /class="tool-name">Registro de clientes</);
  assert.match(hub, /class="tool-desc">Registro y consulta de clientes Creditek\.<\/div>/);
  assert.doesNotMatch(hub, /(?:href|onclick)="[^"]*creditek\/erp\/registro/);
});

test('la versión de AURA queda compacta y dentro del pie lateral', () => {
  assert.match(hub, /class="aura-version"[^>]*>AURA v1\.1\.0</);
  assert.match(hub, /\.aura-version\{[^}]*overflow-wrap:anywhere/);
});

test('Configuración abre un centro de incidencias sanitizado', () => {
  assert.match(hub, /Centro de incidencias de AURA/);
  assert.match(hub, /id="incident-error"/);
  assert.match(hub, /id="incident-expected"/);
  assert.match(hub, /id="incident-module"/);
  assert.match(hub, /id="incident-evidence"[^>]*type="file"/);
  assert.match(hub, /generateIncidentReport/);
  assert.match(hub, /sanitizeIncidentText/);
  assert.match(hub, /element\.replaceChildren/);
  assert.doesNotMatch(hub, /id="cfg-(?:claude|vertex|openai)"/);
});

test('el reporte elimina secretos y datos sensibles antes de copiar o descargar', () => {
  const report = incidents.buildIncidentReport({
    module: 'Sofía',
    error: 'token=abc123 password=secreta cliente 3002024083 externo@example.com',
    expected: 'Debe responder sin Bearer eyJhbGciOiJIUzI1NiJ9.abc.def',
    context: incidents.technicalContext({ route: '/creditek/agentes/', user: 'Oscar' }),
    technicalErrors: ['api_key=AIza12345678901234567890'],
  });
  assert.doesNotMatch(report, /abc123|secreta|3002024083|externo@example\.com|AIza123|eyJhbGci/);
  assert.match(report, /REDACTADO/);
});

test('Ciénaga de Oro conserva tarjetas uniformes y el calendario alinea Publicaciones', () => {
  assert.match(googleBusiness, /\.store-card\s*\{[^}]*width:100%[^}]*min-width:0/);
  assert.match(googleBusiness, /\.store-body\s*\{[^}]*grid-auto-rows:minmax\(0,auto\)/);
  assert.match(calendar, /\.cal-header\{[^}]*min-height:/);
  assert.match(calendar, /\.cal-count\{[^}]*display:inline-flex[^}]*align-items:center/);
});

test('el build aislado publica Google Business y el centro de incidencias mediante aura-hub', () => {
  assert.match(build, /creditek-gbp-fichas\.html/);
  assert.match(build, /aura-incident-report\.mjs/);
  assert.match(config, /registro\.crediteksas\.com\/creditek\/agentes\*/);
  assert.doesNotMatch(config, /creditek\/portal|creditek\/erp/);
});
