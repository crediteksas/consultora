import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync('creditek/erp/documento-remision.html', 'utf8');
const helper = html.slice(html.indexOf('function proveedorPorProducto('), html.indexOf('// La tienda obtiene'));
function label(id, mappings, invoices, error = false) {
  const context = { trazabilidadItemFacturas: mappings, trazabilidadFacturas: invoices, errorTrazabilidad: error };
  vm.createContext(context);
  vm.runInContext(helper, context);
  return context.proveedorPorProducto(id);
}
test('cada producto muestra Creditek y exclusivamente sus proveedores vinculados', () => {
  const invoices = { f1: { proveedor: 'MR MOVIL SAS' }, f2: { proveedor: 'MPS' }, f3: { proveedor: 'MPS' } };
  const map = { a: new Set(['f1']), b: new Set(['f2', 'f3']), c: new Set(['f1', 'f2']) };
  assert.equal(label('a', map, invoices), 'Proveedor: Creditek · MR MOVIL SAS (origen para garantía)');
  assert.equal(label('b', map, invoices), 'Proveedor: Creditek · MPS (origen para garantía)');
  assert.match(label('c', map, invoices), /MR MOVIL SAS \/ MPS/);
});
test('origen ausente o error de lectura nunca inventa un proveedor', () => {
  assert.match(label('a', {}, {}), /Creditek.*pendiente de vincular/);
  assert.match(label('a', {}, {}, true), /Creditek.*no disponible/);
});
test('documento escapa el nombre y mantiene precios de tienda sin leer costos de compra', () => {
  assert.match(html, /data-proveedor-origen>\$\{esc\(proveedorPorProducto\(it.id\)\)\}/);
  assert.match(html, /money\(it.precio_remision\)/);
  assert.match(html, /SB.rpc\('obtener_trazabilidad_remision'/);
  assert.doesNotMatch(html, /\.from\('facturas_proveedor'\)/);
});
