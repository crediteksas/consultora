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
  for (const id of ['fecha-desde', 'fecha-hasta', 'comparativo', 'filtro-tienda', 'filtro-plataforma', 'filtro-referencia', 'btn-exportar']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /xlsx\.full\.min\.js/);
  assert.match(app, /utilidad_creditek_rango/);
  assert.match(app, /XLSX\.writeFile/);
  assert.match(app, /'Por tienda'/);
  assert.match(app, /'Por plataforma'/);
  assert.match(app, /'Por referencia'/);
});
