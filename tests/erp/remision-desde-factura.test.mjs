import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import d from '../../creditek/erp/bodega-domain.js';

const producto = { id: 'acc', nombre: 'Accesorio', tipo: 'cantidad' };
function disponibles(lotes, facturaId = 'f1') {
  return d.consolidarDisponibilidad({ productos: [producto], unidades: [], lotes, facturaId });
}
const lote = { producto_id: 'acc', factura_proveedor_id: 'f1', cantidad: 10, costo_unitario: 100, precio_tienda: 110 };

test('factura completa precarga pendientes y conserva el 10% sin duplicarlo', () => {
  const [p] = disponibles([lote, { ...lote, factura_proveedor_id: 'otra', cantidad: 20 }]);
  const item = d.prepararItem(p, 'f1');
  assert.equal(item.cantidad, 10);
  assert.deepEqual(d.valorarItem(item), { costo: 1000, total: 1100, utilidad: 100 });
  assert.deepEqual(d.crearItemPayload(item, 'f1'), { producto_id: 'acc', cantidad: 10, factura_proveedor_id: 'f1' });
});

test('reparto parcial conserva cantidades, precios y costos FIFO de la misma factura', () => {
  const [p] = disponibles([{ ...lote, cantidad: 2 }, { ...lote, cantidad: 3, costo_unitario: 200, precio_tienda: 240 }]);
  assert.equal(p.precios_varian, true);
  const item = d.prepararItem(p, 'f1', 3);
  assert.deepEqual(d.valorarItem(item), { costo: 400, total: 460, utilidad: 60 });
  item.precio_override_active = true;
  item.precio_remision = 150;
  assert.deepEqual(d.valorarItem(item), { costo: 400, total: 450, utilidad: 50 });
  assert.equal(d.crearItemPayload(item, 'f1').precio_override, 150);
});

test('factura agotada no carga productos ajenos; cambio de filtro y sobrecantidad bloqueados', () => {
  assert.deepEqual(disponibles([lote], 'agotada'), []);
  const item = d.prepararItem(disponibles([lote])[0], 'f1');
  assert.throws(() => d.crearItemPayload(item, null), /factura cambió/);
  for (const cantidad of [0, -1, 1.5, 11, NaN]) assert.throws(() => d.crearItemPayload({ ...item, cantidad }, 'f1'), /Cantidad/);
});

test('serializados conservan precio unitario y costo de cada unidad', () => {
  const [p] = d.consolidarDisponibilidad({ productos: [{ ...producto, tipo: 'serializado' }], unidades: [
    { ...lote, costo_remision: 100, costo_unitario: undefined },
    { ...lote, precio_tienda: 220, costo_remision: 200, costo_unitario: undefined },
  ], lotes: [], facturaId: 'f1' });
  assert.deepEqual(d.valorarItem(d.prepararItem(p, 'f1')), { costo: 300, total: 330, utilidad: 30 });
});

test('compra y detalle enlazan factura; precarga no ejecuta despacho ni cobros', () => {
  for (const archivo of ['compra-proveedor.html', 'proveedores.html']) {
    const html = readFileSync(new URL(`../../creditek/erp/${archivo}`, import.meta.url), 'utf8');
    assert.match(html, /Remisionar esta factura/);
    assert.match(html, /bodega-central\.html\?factura=\$\{encodeURIComponent/);
  }
  const html = readFileSync(new URL('../../creditek/erp/bodega-central.html', import.meta.url), 'utf8');
  const boot = html.slice(html.lastIndexOf('// BOOT'));
  assert.match(boot, /facturaOrigen && cargado/);
  assert.match(boot, /prepararItem\(p, facturaOrigen\)/);
  assert.doesNotMatch(boot, /SB\.rpc|\.click\(/);
  assert.match(html, /from\('stock_cantidad_lotes'\)/);
  assert.match(html, /carga !== cargaDespacho/);
});
