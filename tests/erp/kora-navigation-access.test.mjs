import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';

const source = await readFile(new URL('../../creditek/erp/kora-access-control.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'kora-access-control.js' });
const access = context.window.KoraAccessControl;

test('gerencia y auditoría entran a la experiencia corporativa', () => {
  for (const rol of ['gerencia', 'auditoria']) {
    const profile = { rol, activo: true, tienda_codigo: null };
    assert.equal(access.resolveExperience(profile), 'corporate');
    assert.equal(access.homeFor(profile), 'tablero.html');
  }
});

test('administrador y asesor de tienda entran a Mi Tienda', () => {
  for (const rol of ['admin_tienda', 'asesor']) {
    const profile = { rol, activo: true, tienda_codigo: 'T-01' };
    assert.equal(access.resolveExperience(profile), 'store');
    assert.equal(access.homeFor(profile), 'reportes.html');
  }
});

test('Mi Tienda contiene únicamente las rutas operativas autorizadas', () => {
  const profile = { rol: 'admin_tienda', activo: true, tienda_codigo: 'T-01' };
  const allowed = [
    'reportes.html', 'ventas.html', 'registro-interno.html', 'caja.html',
    'inventario.html', 'gastos.html', 'cuenta-corriente.html',
  ];
  const forbidden = [
    'proveedores.html', 'compra-proveedor.html', 'bodega-central.html',
    'utilidad-creditek.html', 'aliados-liquidaciones.html', 'incidencias.html',
    'tablero.html', 'remisiones.html', 'auditoria-cruzada.html',
  ];

  for (const route of allowed) assert.equal(access.authorize(profile, route).allowed, true, route);
  for (const route of forbidden) assert.equal(access.authorize(profile, route).allowed, false, route);
});

test('asesor conserva solo las operaciones permitidas por su rol', () => {
  const profile = { rol: 'asesor', activo: true, tienda_codigo: 'T-01' };
  for (const route of ['reportes.html', 'ventas.html', 'registro-interno.html', 'inventario.html']) {
    assert.equal(access.authorize(profile, route).allowed, true, route);
  }
  for (const route of ['caja.html', 'gastos.html', 'cuenta-corriente.html']) {
    assert.equal(access.authorize(profile, route).allowed, false, route);
  }
});

test('rutas B2B y Aliados requieren la capacidad vigente además del rol corporativo', () => {
  const profile = { rol: 'gerencia', activo: true };
  assert.equal(access.authorize(profile, 'utilidad-creditek.html', { b2b: false }).allowed, false);
  assert.equal(access.authorize(profile, 'utilidad-creditek.html', { b2b: true }).allowed, true);
  assert.equal(access.authorize(profile, 'aliados-liquidaciones.html', { aliados: false }).allowed, false);
  assert.equal(access.authorize(profile, 'aliados-liquidaciones.html', { aliados: true }).allowed, true);
});

test('un perfil inactivo, desconocido o sin tienda nunca obtiene una ruta protegida', () => {
  const cases = [
    null,
    { rol: 'desconocido', activo: true },
    { rol: 'admin_tienda', activo: true, tienda_codigo: null },
    { rol: 'gerencia', activo: false },
  ];
  for (const profile of cases) {
    assert.equal(access.authorize(profile, 'ventas.html').allowed, false);
  }
});

test('la navegación renderizada usa las unidades oficiales y no términos heredados', () => {
  const corporate = access.navigationFor(
    { rol: 'gerencia', activo: true },
    { b2b: true, aliados: true },
  );
  assert.deepEqual(
    Array.from(corporate, section => section.title),
    ['TABLERO', 'CREDITEK RETAIL', 'CREDITEK B2B', 'CREDITEK ALIADOS', 'ADMINISTRACIÓN'],
  );
  const store = access.navigationFor({ rol: 'admin_tienda', activo: true, tienda_codigo: 'T-01' });
  assert.deepEqual(Array.from(store, section => section.title), ['MI TIENDA']);
  const labels = JSON.stringify({ corporate, store });
  assert.doesNotMatch(labels, /Terceros|Partners|Operaciones Creditek|Tiendas propias/);
});

test('toda página que monta el shell carga primero el control de acceso', async () => {
  const erpDir = new URL('../../creditek/erp/', import.meta.url);
  const files = (await readdir(erpDir)).filter(name => name.endsWith('.html'));
  for (const file of files) {
    const html = await readFile(new URL(file, erpDir), 'utf8');
    const shell = html.indexOf('src="sidebar.js');
    if (shell < 0) continue;
    const guard = html.indexOf('src="kora-access-control.js?v=2.0.0"');
    assert.ok(guard >= 0 && guard < shell, `${file} debe cargar el guard antes del shell`);
  }
});
