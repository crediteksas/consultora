import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const domainSource = await readFile('creditek/erp/traslados-domain.js', 'utf8').catch(() => '');
const html = await readFile('creditek/erp/traslados.html', 'utf8');

function domain() {
  const context = { window: {} };
  vm.runInNewContext(domainSource, context);
  return context.window.KoraTrasladosDomain;
}

test('totaliza celulares, accesorios y traslado mixto con costos congelados', () => {
  const resumen = domain().resumir([
    { tipoProducto: 'serializado', unidad_id: 'u1', imei: '111', costo: 500000 },
    { tipoProducto: 'serializado', unidad_id: 'u2', imei: '222', costo: 600000 },
    { tipoProducto: 'cantidad', producto_id: 'p1', cantidad: 3, costo: 50000 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(resumen)), {
    unidades: 5,
    celulares: 2,
    accesorios: 3,
    valorTotal: 1250000,
    novedades: [],
    duplicados: [],
  });
});

test('un IMEI duplicado, cantidad cero o producto desmarcado no altera la suma', () => {
  const resumen = domain().resumir([
    { tipoProducto: 'serializado', unidad_id: 'u1', imei: '111', costo: 500000 },
    { tipoProducto: 'serializado', unidad_id: 'u1', imei: '111', costo: 500000 },
    { tipoProducto: 'cantidad', producto_id: 'p1', cantidad: 0, costo: 90000 },
    { tipoProducto: 'serializado', unidad_id: null, imei: '', costo: 700000 },
  ]);
  assert.equal(resumen.unidades, 1);
  assert.equal(resumen.valorTotal, 500000);
  assert.deepEqual(Array.from(resumen.duplicados), ['111']);
});

test('un item incluido sin valor o con valor negativo genera novedad bloqueante', () => {
  const resumen = domain().resumir([
    { tipoProducto: 'serializado', unidad_id: 'u1', imei: '111', costo: 0 },
    { tipoProducto: 'cantidad', producto_id: 'p1', nombreProducto: 'Cable', cantidad: 2, costo: -1 },
  ]);
  assert.equal(resumen.valorTotal, 0);
  assert.equal(resumen.novedades.length, 2);
});

test('el histórico usa costo del detalle congelado y no consulta precios actuales', () => {
  const resumen = domain().resumir([
    { unidad_id: 'u1', imei: '111', cantidad: 1, costo: 475000 },
    { unidad_id: null, producto_id: 'p1', cantidad: 4, costo: 12000 },
  ]);
  assert.equal(resumen.valorTotal, 523000);
  const detailBody = html.slice(
    html.indexOf('async function abrirModalVerTraslado'),
    html.indexOf('async function confirmarRecepcionTraslado'),
  );
  assert.doesNotMatch(detailBody, /stock_cantidad|unidades\).*costo_remision/);
});

test('la pantalla muestra resumen económico antes del despacho y en el histórico', () => {
  for (const id of ['traTotalUnidades', 'traTotalCelulares', 'traTotalAccesorios', 'traTotal', 'verTotalUnidades', 'verTotalCelulares', 'verTotalAccesorios', 'verTotalTraslado']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /traslados-domain\.js\?v=1\.0\.0/);
  assert.match(html, /Producto sin valor definido/);
  assert.match(html, /IMEI duplicado/);
});

test('el formato monetario es COP sin decimales', () => {
  assert.equal(domain().formatearCOP(1250000), '$ 1.250.000');
});
