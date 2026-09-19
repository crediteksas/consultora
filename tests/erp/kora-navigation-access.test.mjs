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

test('la entrada raíz de KORA se reconoce como pública y lleva al inicio de la tienda', () => {
  const profile = { rol: 'admin_tienda', activo: true, tienda_codigo: 'CK-01' };

  for (const route of ['/creditek/erp', '/creditek/erp/', '/creditek/erp/app']) {
    const authorization = access.authorize(profile, route);
    assert.equal(authorization.allowed, true, route);
    assert.equal(authorization.route, 'app.html', route);
  }
  assert.equal(access.homeFor(profile), 'reportes.html');
});

test('Mi Tienda contiene únicamente las rutas operativas autorizadas', () => {
  const profile = { rol: 'admin_tienda', activo: true, tienda_codigo: 'T-01' };
  const allowed = [
    'reportes.html', 'ventas.html', 'registro-interno.html', 'caja.html',
    'inventario.html', 'gastos.html', 'cuenta-corriente.html', 'remisiones.html',
    'documento-remision.html', 'incidencias.html', 'creditos-cartera.html',
  ];
  const forbidden = [
    'proveedores.html', 'compra-proveedor.html', 'bodega-central.html',
    'utilidad-creditek.html', 'aliados-liquidaciones.html',
    'tablero.html', 'auditoria-cruzada.html',
  ];

  for (const route of allowed) assert.equal(access.authorize(profile, route).allowed, true, route);
  for (const route of forbidden) assert.equal(access.authorize(profile, route).allowed, false, route);
});

test('asesor conserva solo las operaciones permitidas por su rol', () => {
  const profile = { rol: 'asesor', activo: true, tienda_codigo: 'T-01' };
  for (const route of ['reportes.html', 'ventas.html', 'registro-interno.html', 'inventario.html', 'creditos-cartera.html']) {
    assert.equal(access.authorize(profile, route).allowed, true, route);
  }
  for (const route of [
    'caja.html', 'gastos.html', 'cuenta-corriente.html',
    'remisiones.html', 'documento-remision.html',
  ]) {
    assert.equal(access.authorize(profile, route).allowed, false, route);
  }
});

test('auditoría tiene lectura B2B y Aliados conserva su capacidad específica', () => {
  const profile = { rol: 'auditoria', activo: true };
  assert.equal(access.authorize(profile, 'utilidad-creditek.html', { b2b: false }).allowed, true);
  assert.equal(access.authorize(profile, 'aliados-liquidaciones.html', { aliados: false }).allowed, false);
  assert.equal(access.authorize(profile, 'aliados-liquidaciones.html', { aliados: true }).allowed, true);
});

test('el detalle de remisión conserva la matriz de roles de KORA-2026-000033', () => {
  const profiles = {
    admin_tienda: { rol: 'admin_tienda', activo: true, tienda_codigo: 'T-01' },
    gerencia: { rol: 'gerencia', activo: true },
    auditoria: { rol: 'auditoria', activo: true },
    asesor: { rol: 'asesor', activo: true, tienda_codigo: 'T-01' },
  };

  assert.equal(access.authorize(profiles.admin_tienda, 'documento-remision.html?remision_id=propia').allowed, true);
  assert.equal(access.authorize(profiles.gerencia, 'documento-remision.html?remision_id=cualquiera').allowed, true);
  assert.equal(access.authorize(profiles.auditoria, 'documento-remision.html?remision_id=cualquiera').allowed, true);
  assert.equal(access.authorize(profiles.asesor, 'documento-remision.html?remision_id=propia').allowed, false);
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

test('gestión documental se limita a Óscar y Maite activos con rol corporativo', () => {
  const managers = [
    { id: '6de0ad26-64af-4966-8cd9-d468880af627', rol: 'gerencia', activo: true },
    { id: 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391', rol: 'auditoria', activo: true },
  ];
  for (const profile of managers) {
    assert.equal(access.canManageDocuments(profile), true);
    for (const route of ['documentos-gestion.html', '/creditek/erp/documentos-gestion?tipo=traslado']) {
      assert.equal(access.authorize(profile, route).allowed, true);
    }
    const links = access.navigationFor(profile).flatMap(section => Array.from(section.items));
    assert.equal(links.filter(item => item.href === 'documentos-gestion.html').length, 1);
    assert.equal(links.find(item => item.href === 'documentos-gestion.html').label, 'Editar o anular documentos');
  }
  for (const profile of [
    null,
    { ...managers[0], activo: false },
    { ...managers[1], activo: false },
    { ...managers[0], rol: 'admin_tienda', tienda_codigo: 'CK-01' },
    { ...managers[1], rol: 'asesor', tienda_codigo: 'CK-01' },
    { ...managers[0], id: 'otro-gerente' },
    { ...managers[1], id: 'otra-auditoria' },
  ]) {
    assert.equal(access.canManageDocuments(profile), false);
    assert.equal(access.authorize(profile, 'documentos-gestion.html').allowed, false);
    const links = access.navigationFor(profile).flatMap(section => Array.from(section.items));
    assert.ok(!links.some(item => item.href === 'documentos-gestion.html'));
  }
});

test('el tablero ofrece tarjeta documental oculta hasta validar el permiso específico', async () => {
  const tablero = await readFile(new URL('../../creditek/erp/tablero.html', import.meta.url), 'utf8');
  const sidebar = await readFile(new URL('../../creditek/erp/sidebar.js', import.meta.url), 'utf8');
  assert.match(tablero, /id="documentosGestionAcceso"[^>]+href="documentos-gestion\.html"[^>]+hidden/);
  assert.match(tablero, /documentosGestionAcceso'\)\.hidden = !window\.KoraAccessControl\?\.canManageDocuments\(currentPerfil\)/);
  assert.match(sidebar, /label: 'Editar o anular documentos', href: 'documentos-gestion\.html'[\s\S]*?users: \['d1782db6-bacc-4caf-af6f-ce1b8d1c0391','6de0ad26-64af-4966-8cd9-d468880af627'\]/);
});

test('la navegación renderizada usa las unidades oficiales y no términos heredados', () => {
  const corporate = access.navigationFor(
    { rol: 'gerencia', activo: true },
    { b2b: true, aliados: true },
  );
  assert.deepEqual(
    Array.from(corporate, section => section.title),
    ['CREDITEK RETAIL', 'CREDITEK B2B', 'CREDITEK ALIADOS', 'TABLERO', 'CRÉDITOS Y CARTERA', 'ADMINISTRACIÓN'],
  );
  const store = access.navigationFor({ rol: 'admin_tienda', activo: true, tienda_codigo: 'T-01' });
  assert.deepEqual(Array.from(store, section => section.title), ['MI TIENDA']);
  const labels = JSON.stringify({ corporate, store });
  assert.doesNotMatch(labels, /Terceros|Partners|Operaciones Creditek|Tiendas propias/);
});

test('matriz equivalente de Óscar conserva Retail, Créditos, B2B, Aliados y Administración', () => {
  const profile = { rol: 'gerencia', activo: true };
  const navigation = access.navigationFor(profile, { b2b: false, aliados: false });
  assert.deepEqual(
    Array.from(navigation, section => section.title),
    ['CREDITEK RETAIL', 'CREDITEK B2B', 'CREDITEK ALIADOS', 'TABLERO', 'CRÉDITOS Y CARTERA', 'ADMINISTRACIÓN'],
  );
  assert.equal(access.authorize(profile, 'utilidad-creditek.html', { b2b: false }).allowed, true);
  assert.equal(access.authorize(profile, 'aliados-liquidaciones.html', { aliados: false }).allowed, true);
});

test('matriz equivalente de Maite conserva Corporativo y aplica capacidades existentes', () => {
  const profile = { rol: 'auditoria', activo: true };
  const navigation = access.navigationFor(profile, { b2b: false });
  const retail = Array.from(navigation).find(section => section.title === 'CREDITEK RETAIL');
  assert.equal(access.resolveExperience(profile), 'corporate');
  assert.ok(Array.from(navigation, section => section.title).includes('CREDITEK B2B'));
  assert.ok(Array.from(retail.items, item => item.href).includes('catalogo.html'));
  assert.equal(access.authorize(profile, 'ventas.html').allowed, true);
  assert.equal(access.authorize(profile, 'catalogo.html').allowed, true);
  assert.equal(access.authorize(profile, 'utilidad-creditek.html', { b2b: false }).allowed, true);
});

test('matriz equivalente de Andrea limita navegación y rutas directas a Mi Tienda', () => {
  const profile = { rol: 'admin_tienda', activo: true, tienda_codigo: 'T-01', es_operador_cartera: true, es_gestor_cartera: true };
  const navigation = access.navigationFor(profile, { cartera: true });
  assert.deepEqual(Array.from(navigation, section => section.title), ['MI TIENDA']);
  assert.ok(Array.from(navigation[0].items, item => item.href).includes('catalogo.html'));
  assert.ok(Array.from(navigation[0].items, item => item.href).includes('creditos-cartera.html'));
  assert.ok(Array.from(navigation[0].items, item => item.href).includes('traslados.html'));
  assert.equal(access.authorize(profile, 'catalogo.html').allowed, true);
  assert.equal(access.authorize(profile, 'creditos-cartera.html', { cartera: true }).allowed, true);
  assert.equal(access.authorize(profile, 'traslados.html').allowed, true);
  assert.equal(access.authorize(profile, 'incidencias.html').allowed, true);
  for (const route of ['utilidad-creditek.html', 'aliados-liquidaciones.html']) {
    assert.equal(access.authorize(profile, route).allowed, false, route);
  }
});

test('Presupuestos y metas pertenece al negocio Retail y no al Tablero general', () => {
  const navigation = access.navigationFor({ rol: 'gerencia', activo: true }, { b2b: true, aliados: true });
  const tablero = Array.from(navigation).find(section => section.title === 'TABLERO');
  const retail = Array.from(navigation).find(section => section.title === 'CREDITEK RETAIL');
  assert.ok(Array.from(retail.items, item => item.href).includes('presupuestos.html'));
  assert.ok(Array.from(retail.items, item => item.label).includes('Presupuestos y metas'));
  assert.ok(!Array.from(tablero.items, item => item.href).includes('presupuestos.html'));
});

test('toda página que monta el shell carga primero el control de acceso', async () => {
  const erpDir = new URL('../../creditek/erp/', import.meta.url);
  const files = (await readdir(erpDir)).filter(name => name.endsWith('.html'));
  for (const file of files) {
    const html = await readFile(new URL(file, erpDir), 'utf8');
    const shell = html.indexOf('src="sidebar.js');
    if (shell < 0) continue;
    const guard = html.indexOf('src="kora-access-control.js');
    assert.ok(guard >= 0 && guard < shell, `${file} debe cargar el guard antes del shell`);
  }
});
