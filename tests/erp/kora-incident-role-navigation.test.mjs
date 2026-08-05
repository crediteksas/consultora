import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const accessSource = await readFile('creditek/erp/kora-access-control.js', 'utf8');
const sidebar = await readFile('creditek/erp/sidebar.js', 'utf8');
const center = await readFile('creditek/erp/kora-incident-center.js', 'utf8');
const page = await readFile('creditek/erp/incidencias.html', 'utf8');
const app = await readFile('creditek/erp/incidencias-app.js', 'utf8');
const management = await readFile('creditek/erp/kora-incident-management.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(accessSource, context);
const access = context.window.KoraAccessControl;

function labels(profile) {
  return Array.from(access.navigationFor(profile, { b2b: true, aliados: true }))
    .flatMap(section => Array.from(section.items, item => item.label));
}

test('Óscar ve únicamente Centro de Incidencias en Administración', () => {
  const profile = { rol: 'gerencia', activo: true };
  const items = labels(profile);
  assert.ok(items.includes('Centro de Incidencias'));
  assert.ok(!items.includes('Reportar incidencia'));
  assert.ok(!items.includes('Ver incidencias'));
  assert.equal(access.authorize(profile, 'incidencias.html').allowed, true);
});

test('Maite ve reportar y ver incidencias sin opciones administrativas', () => {
  const profile = { rol: 'auditoria', activo: true };
  const items = labels(profile);
  assert.ok(items.includes('Reportar incidencia'));
  assert.ok(items.includes('Ver incidencias'));
  assert.ok(!items.includes('Centro de Incidencias'));
  assert.equal(access.authorize(profile, 'incidencias.html').allowed, true);
});

test('administrador de tienda entra a incidencias y asesor no recibe acceso nuevo', () => {
  const admin = { rol: 'admin_tienda', activo: true, tienda_codigo: 'T-01' };
  const adviser = { rol: 'asesor', activo: true, tienda_codigo: 'T-01' };
  assert.deepEqual(labels(admin).filter(x => /incidencia/i.test(x)), ['Reportar incidencia', 'Mis incidencias']);
  assert.equal(access.authorize(admin, 'incidencias.html').allowed, true);
  assert.equal(access.authorize(adviser, 'incidencias.html').allowed, false);
  assert.deepEqual(labels(adviser).filter(x => /incidencia/i.test(x)), []);
});

test('navegación usa la arañita y no reutiliza Auditoría', () => {
  assert.match(sidebar, /label:\s*'Centro de Incidencias'[\s\S]*lucide:\s*'bug'/);
  assert.match(sidebar, /label:\s*'Reportar incidencia'[\s\S]*lucide:\s*'bug'/);
  assert.doesNotMatch(sidebar, /label:\s*'Auditoría'[^\n]*incidencias\.html/);
  assert.match(center, /profile\.rol !== 'gerencia'/);
  assert.match(center, /location\.hash === '#reportar'/);
  assert.match(sidebar, /kora-incident-center\.js\?v=1\.2\.1/);
  assert.match(page, /kora-incident-management\.js\?v=1\.2\.2/);
  assert.match(page, /incidencias-app\.js\?v=1\.3\.1/);
});

test('centro adapta título y breadcrumb al rol sin mostrar controles de gestión a Maite o tienda', () => {
  assert.match(page, /data-incident-breadcrumb/);
  assert.match(page, /data-incident-title/);
  assert.match(app, /document\.title\s*=/);
  assert.match(app, /profile\.rol === 'gerencia'/);
  assert.match(app, /Centro de Incidencias/);
  assert.match(app, /Ver incidencias/);
  assert.match(app, /managementPanel\.hidden\s*=\s*!state\.canAdmin/);
});

test('los botones usan la terminología oficial de incidencias', () => {
  assert.match(center, /Reportar incidencia/);
  assert.match(center, /Enviar incidencia/);
  assert.doesNotMatch(center, /Reportar error|Enviar reporte/);
});

test('estados principales se muestran en lenguaje aprobado', () => {
  for (const label of ['Nueva', 'En revisión', 'En atención', 'Resuelta', 'Cerrada']) {
    assert.match(management, new RegExp(`'${label}'`));
  }
});
