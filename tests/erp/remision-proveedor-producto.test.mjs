import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync('creditek/erp/documento-remision.html', 'utf8');
test('IMEI visible por ítem, sin confundir ausencia con recepción confirmada', () => {
  const context = { imeisPorItem: { a: ['001234567890123', '991234567890123'] }, errorImeis: false, remision: { estado: 'recibida' } };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function textoImeis('), html.indexOf('function proveedorPorProducto(')), context);
  const item = { id: 'a', productos: { tipo: 'serializado' } };
  assert.equal(context.textoImeis(item), 'IMEI: 001234567890123 · 991234567890123');
  assert.match(context.textoImeis({ ...item, id: 'b' }), /sin vínculo visible/);
  context.remision.estado = 'despachada';
  assert.match(context.textoImeis({ ...item, id: 'b' }), /pendiente de recepción/);
  context.errorImeis = true;
  assert.match(context.textoImeis(item), /no se pudo consultar/);
  assert.equal(context.textoImeis({ productos: { tipo: 'cantidad' } }), 'Stock por cantidad');
  assert.match(html, /esc\(textoImeis\(it\)\)/);
  assert.match(html, /await cargarImeisRemision\(\);\s+renderDocumento\(\)/);
  assert.match(html, /select\('remision_item_id, imei'\)\.in\('remision_item_id', ids\)/);
});
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
