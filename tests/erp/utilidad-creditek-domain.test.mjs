import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const source = await readFile(path.join(root, 'creditek/erp/utilidad-creditek-domain.js'), 'utf8');
const html = await readFile(path.join(root, 'creditek/erp/utilidad-creditek.html'), 'utf8');
const app = await readFile(path.join(root, 'creditek/erp/utilidad-creditek-app.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const domain = context.window.CreditekUtilidadDomain;

test('B2B conserva un único Dashboard sin accesos duplicados Resultado o Reportes', async () => {
  const ctx={window:{}};
  vm.runInNewContext(await readFile(path.join(root,'creditek/erp/kora-access-control.js'),'utf8'),ctx);
  for(const rol of ['gerencia','auditoria']){
    const items=ctx.window.KoraAccessControl.navigationFor({rol,activo:true},{}).flatMap(s=>s.items);
    assert.equal(items.filter(i=>i.label==='Dashboard B2B').length,1);
    assert.equal(items.some(i=>i.label==='Resultado B2B'),false);
    assert.equal(items.find(i=>i.label==='Dashboard B2B').href,'utilidad-creditek.html#dashboard');
    assert.equal(items.some(i=>i.label==='Reportes B2B'),false);
    assert.equal(items.filter(i=>i.href.split('#')[0]==='utilidad-creditek.html').length,1);
  }
  const sidebar=await readFile(path.join(root,'creditek/erp/sidebar.js'),'utf8');
  assert.doesNotMatch(sidebar,/label: '(?:Resultado|Reportes) B2B'/);
  assert.match(sidebar,/label: 'Dashboard B2B'/);
});

const filas = [
  { fecha: '2026-07-01', remision_id: 'r1', tienda_codigo: 'T1', plataforma: 'PayJoy', referencia: 'A1', producto_nombre: 'Equipo A', cantidad: 1, facturado: 600, costo: 400, utilidad: 200 },
  { fecha: '2026-07-02', remision_id: 'r2', tienda_codigo: 'T2', plataforma: 'Addi', referencia: 'B1', producto_nombre: 'Equipo B', cantidad: 2, facturado: 1000, costo: 700, utilidad: 300 },
  { fecha: '2026-07-08', remision_id: 'r3', tienda_codigo: 'T1', plataforma: null, referencia: 'A1', producto_nombre: 'Equipo A', cantidad: 1, facturado: 650, costo: 400, utilidad: 250 },
  { fecha: '2025-07-01', remision_id: 'r4', tienda_codigo: 'T1', plataforma: 'PayJoy', referencia: 'A1', producto_nombre: 'Equipo A', cantidad: 1, facturado: 500, costo: 400, utilidad: 100 },
];

test('aplica rango y todos los filtros sin duplicar filas', () => {
  const resultado = domain.filtrarFilas([...filas, filas[0]], {
    desde: '2026-07-01',
    hasta: '2026-07-31',
    tienda: 'T1',
    plataforma: 'PayJoy',
    referencia: 'A1',
  });
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].remision_id, 'r1');
});

test('una tienda sin datos produce un resumen vacío sin error', () => {
  const resultado = domain.filtrarFilas(filas, {
    desde: '2026-07-01',
    hasta: '2026-07-31',
    tienda: 'MEICO',
    plataforma: '',
    referencia: '',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(domain.resumir(resultado))), {
    facturado: 0,
    costo: 0,
    utilidad: 0,
    margen: null,
    unidades: 0,
    despachos: 0,
    tiendas: 0,
    ticketPromedio: null,
  });
});

test('calcula utilidad y margen con facturado menos costo', () => {
  const resumen = domain.resumir(filas.slice(0, 3));
  assert.deepEqual(JSON.parse(JSON.stringify(resumen)), {
    facturado: 2250,
    costo: 1500,
    utilidad: 750,
    margen: 750 / 2250,
    unidades: 4,
    despachos: 3,
    tiendas: 2,
    ticketPromedio: 750,
  });
});

test('calcula períodos comparables sin inventar datos', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(domain.rangoComparacion('anterior', '2026-07-10', '2026-07-12'))),
    { desde: '2026-07-07', hasta: '2026-07-09' }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(domain.rangoComparacion('anio_anterior', '2026-07-10', '2026-07-12'))),
    { desde: '2025-07-10', hasta: '2025-07-12' }
  );
  assert.equal(domain.comparar(100, 0).comparable, false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(domain.comparar(120, 100))),
    { comparable: true, diferencia: 20, variacion: 0.2 }
  );
});

test('agrupa por día, semana y mes conservando totales', () => {
  for (const granularidad of ['dia', 'semana', 'mes']) {
    const grupos = domain.agruparTiempo(filas.slice(0, 3), granularidad);
    const total = grupos.reduce((suma, grupo) => suma + grupo.facturado, 0);
    assert.equal(total, 2250);
  }
});

test('el acumulado conserva los días sin actividad y coincide con el indicador', () => {
  const serie = domain.serieAcumulada(filas, '2026-07-01', '2026-07-08');
  assert.deepEqual(Array.from(serie, p => p.utilidad), [200, 500, 500, 500, 500, 500, 500, 750]);
  for (const granularidad of ['dia', 'semana', 'mes']) {
    const puntos = domain.serieAcumulada(filas, '2026-07-01', '2026-07-08', granularidad);
    assert.equal(puntos.at(-1).utilidad, domain.resumir(filas.slice(0, 3)).utilidad);
    assert.equal(puntos.at(-1).periodo, '2026-07-08');
    assert.ok(puntos.every(p => p.periodo >= '2026-07-01' && p.periodo <= '2026-07-08'));
  }
});

test('el acumulado respeta el inicio seleccionado, deduplica y no inventa actividad', () => {
  assert.deepEqual(Array.from(domain.serieAcumulada([...filas, filas[2]], '2026-07-06', '2026-07-08'), p => p.utilidad), [0, 0, 250]);
  assert.equal(domain.serieAcumulada([], '2026-07-01', '2026-07-08').length, 0);
  assert.equal(domain.serieAcumulada(filas, '2026-08-01', '2026-08-08').length, 0);
  assert.equal(domain.serieAcumulada(filas, '2026-07-08', '2026-07-08')[0].utilidad, 250);
});

test('el acumulado no oculta pérdidas ni saldos cero', () => {
  const datos = [
    {...filas[0], facturado:100, costo:200},
    {...filas[1], facturado:100, costo:0},
  ];
  assert.deepEqual(Array.from(domain.serieAcumulada(datos, '2026-07-01', '2026-07-03'), p => p.utilidad), [-100, 0, 0]);
});

test('resume dimensiones con participación sobre el total', () => {
  const tiendas = domain.agruparDimension(filas.slice(0, 3), 'tienda_codigo');
  assert.equal(tiendas[0].facturado, 1250);
  assert.equal(tiendas[0].participacion, 1250 / 2250);
  assert.equal(tiendas.reduce((s, r) => s + r.facturado, 0), 2250);
});

test('elige granularidad automática según duración', () => {
  assert.equal(domain.granularidadAutomatica('2026-07-01', '2026-07-10'), 'dia');
  assert.equal(domain.granularidadAutomatica('2026-01-01', '2026-03-01'), 'semana');
  assert.equal(domain.granularidadAutomatica('2025-01-01', '2026-07-01'), 'mes');
});

test('la pantalla existente integra rangos, filtros, comparación y exportación', () => {
  for (const id of ['fecha-desde', 'fecha-hasta', 'comparativo', 'filtro-tienda', 'filtro-referencia', 'btn-exportar']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /xlsx\.full\.min\.js/);
  assert.match(app, /consultar_utilidad_creditek_rango/);
  assert.match(app, /XLSX\.writeFile/);
  assert.match(app, /'Por tienda'/);
  assert.doesNotMatch(app, /'Por plataforma'|filtro-plataforma|renderTabla\('plataforma'/);
  assert.doesNotMatch(html, /Resumen por plataforma|filtro-plataforma/);
  assert.match(app, /'Por referencia'/);
});

test('el selector incluye destinos históricos y usa nombres reales en filtros, tablas y exportación', () => {
  assert.match(app, /SB\.from\('origenes'\)\.select\('codigo, nombre, tipo, activo'\)\.order\('nombre'\)/);
  assert.match(app, /destinos\.has\(t.codigo\) \|\| \(t.tipo === 'propia' && t.activo\)/);
  assert.doesNotMatch(app, /llenarSelect\('filtro-tienda', estado\.filas\.map/);
  assert.match(app, /valor: f.referencia, nombre: f.referencia_nombre/);
  assert.match(app, /Tienda:f.tienda_nombre/);
  assert.match(app, /Referencia:f.referencia_nombre/);
  assert.match(html, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(html, /Resumen B2B del período/);
  assert.match(app, /data-label="Participación"/);
});

test('los nombres no mezclan tiendas ni referencias distintas y conservan los importes', () => {
  const datos = [
    {...filas[0], tienda_nombre:'Móvil Shopping', referencia_nombre:'Equipo A'},
    {...filas[1], tienda_nombre:'Móvil Shopping', referencia_nombre:'Equipo A'},
    {...filas[2], tienda_nombre:'Móvil Shopping', referencia_nombre:'Equipo A'},
  ];
  const tiendas = domain.agruparDimension(datos, 'tienda_codigo', 'tienda_nombre');
  assert.equal(tiendas.length, 2);
  assert.equal(tiendas[0].nombre, 'Móvil Shopping');
  assert.equal(tiendas.reduce((s, r) => s + r.facturado, 0), 2250);
  const refs = domain.agruparDimension(datos, 'referencia', 'referencia_nombre');
  assert.equal(refs.length, 2);
  assert.equal(refs[0].nombre, 'Equipo A');
  assert.equal(refs.reduce((s, r) => s + r.utilidad, 0), 750);
});

test('la aplicación avisa al shell compartido cuando terminó de autenticar', () => {
  assert.match(app, /app\.classList\.remove\('hidden'\)/);
  assert.match(app, /app\.classList\.add\('show'\)/);
});
