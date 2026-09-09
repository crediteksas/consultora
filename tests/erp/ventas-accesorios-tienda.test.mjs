import test from 'node:test';
import assert from 'node:assert/strict';
import '../../creditek/erp/ventas-domain.js';

function cliente(filas, fallar = false) {
  const llamadas = [];
  return { llamadas, from(tabla) {
    assert.equal(tabla, 'stock_cantidad');
    const filtros = {};
    return {
      select(campos) { assert.match(campos, /productos!inner/); return this; },
      eq(campo, valor) { filtros[campo] = valor; return this; },
      gt(campo, valor) { assert.equal(campo, 'cantidad'); assert.equal(valor, 0); return this; },
      order(campo) { assert.equal(campo, 'producto_id'); return this; },
      async range(a, b) {
        llamadas.push([a, b]);
        assert.equal(filtros.tienda_codigo, 'CK-03');
        assert.equal(filtros['productos.tipo'], 'cantidad');
        assert.equal(filtros['productos.activo'], true);
        return fallar ? { error: new Error('consulta fallida') } : { data: filas.slice(a, b + 1) };
      },
    };
  } };
}

test('carga todas las páginas de la tienda, incluyendo vidrios después del registro 1000', async () => {
  const filas = Array.from({ length: 1001 }, (_, i) => ({
    cantidad: 12, precio_tienda: 10000, costo_promedio: 3600,
    productos: { id: String(i), codigo: `ACC${i}`, nombre: i === 1000 ? 'VIDRIO' : 'SILICONA', tipo: 'cantidad' },
  }));
  const sb = cliente(filas);
  const productos = await globalThis.CreditekVentasDomain.accesoriosDeTienda(sb, 'CK-03');
  assert.equal(productos.length, 1001);
  assert.deepEqual(sb.llamadas, [[0, 499], [500, 999], [1000, 1499]]);
  assert.equal(productos.find(p => p.nombre === 'VIDRIO').cantidad, 12);
  assert.equal(productos[0].precio_tienda, 10000);
  assert.equal(productos[0].costo_promedio, 3600);
});

test('no convierte errores de inventario en stock cero ni consulta sin tienda', async () => {
  await assert.rejects(globalThis.CreditekVentasDomain.accesoriosDeTienda(cliente([], true), 'CK-03'), /consulta fallida/);
  await assert.rejects(globalThis.CreditekVentasDomain.accesoriosDeTienda(cliente([]), null), /Selecciona una tienda/);
  assert.deepEqual(await globalThis.CreditekVentasDomain.accesoriosDeTienda(cliente([]), 'CK-03'), []);
});
