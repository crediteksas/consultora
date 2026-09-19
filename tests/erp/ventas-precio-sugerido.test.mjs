import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(
  new URL('../../creditek/erp/ventas.html', import.meta.url),
  'utf8',
);
const domain = await readFile(new URL('../../creditek/erp/ventas-domain.js', import.meta.url), 'utf8');

test('el precio configurado es sugerido y permite promociones', () => {
  assert.match(html, /precio_guia es el precio sugerido/);
  assert.match(html, /precio_venta:\s*it\.precio_venta/);
  assert.doesNotMatch(html, /no puede ser menor al precio de remisión/);
  assert.doesNotMatch(html, /v\s*<\s*min/);
});

test('la sugerencia comercial no reutiliza el costo y conserva precios digitados', () => {
  assert.match(html, /const precioAcc = ventasDomain\.precioSugerido\(prod\)/);
  assert.match(html, /const precioSugerido = ventasDomain\.precioSugerido\(unidad\.productos\)/);
  assert.match(html, /if \(!venta\.items\[idx\]\.precio_venta\) venta\.items\[idx\]\.precio_venta = precioSugerido/);
  assert.match(html, /venta\.items\[idx\]\.costo_unitario = unidad\.precio_tienda \?\? null/);
  assert.match(html, /costo_unitario: stockTienda\?\.costo_promedio \?\? null/);
  assert.doesNotMatch(html, /precio_sugerido:\s*stockTienda\?\.precio_tienda|precio_sugerido = unidad\.precio_tienda/);
});

test('la venta sigue exigiendo un precio positivo', () => {
  assert.match(html, /!it\.precio_venta \|\| it\.precio_venta <= 0/);
});

test('validar IMEI mantiene el precio comercial y no sobrescribe la promoción digitada', async () => {
  const funcion = html.slice(html.indexOf('async function validarImei('), html.indexOf('\nfunction actualizarTotalParcial('));
  for (const [precioDigitado, precioGuia, esperado] of [[null, 565000, 565000], [550000, 565000, 550000], [null, null, null]]) {
    const unidad = { id: 'u1', producto_id: 'p1', tienda_actual: 'CK-01', estado: 'disponible',
      precio_tienda: 455000, productos: { nombre: 'Samsung A17', precio_guia: precioGuia } };
    const context = vm.createContext({
      window: {}, venta: { items: [{ precio_venta: precioDigitado }] },
      currentPerfil: { tienda_codigo: 'CK-01' },
      document: { getElementById: () => null },
      renderItemsVenta() {}, actualizarTotalParcial() {},
      sb: { from(tabla) {
        assert.equal(tabla, 'unidades_lectura');
        return { select(campos) { assert.match(campos, /productos\(nombre,precio_guia\)/); return this; },
          eq(campo, valor) { assert.equal(campo, 'imei'); assert.equal(valor, '123'); return this; },
          async maybeSingle() { return { data: unidad }; } };
      } },
    });
    vm.runInContext(domain, context);
    context.ventasDomain = context.window.CreditekVentasDomain;
    vm.runInContext(funcion, context);
    await context.validarImei(0, '123', true);
    assert.equal(context.venta.items[0].precio_venta, esperado);
    assert.equal(context.venta.items[0].precio_sugerido, precioGuia || 0);
    assert.equal(context.venta.items[0].costo_unitario, 455000);
  }
});
