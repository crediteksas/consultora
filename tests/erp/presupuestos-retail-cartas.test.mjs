import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cartas = require('../../creditek/erp/presupuestos-retail-cartas.js');

test('selecciona una tienda o todas sin aceptar códigos inexistentes', () => {
  const tiendas = [{ codigo: 'CK-01', nombre: 'Móvil Shopping' }, { codigo: 'CK-02', nombre: 'Celfiao' }];
  assert.equal(cartas.tiendasElegidas(tiendas, 'CK-02').length, 1);
  assert.equal(cartas.tiendasElegidas(tiendas, '__todas__').length, 2);
  assert.throws(() => cartas.tiendasElegidas(tiendas, 'CK-99'));
});

test('la carta incluye cinco metas, cada día y el administrador sin mezclar tiendas', () => {
  const tienda = { codigo: 'CK-01', nombre: 'Móvil Shopping' };
  const filas = Array.from({ length: 31 }, (_, i) => ({
    tienda_codigo: 'CK-01', fecha: `2026-10-${String(i + 1).padStart(2, '0')}`,
    meta_venta_total: 1000, meta_creditos: 1, meta_uds_cel: 2,
    meta_uds_acc: 3, meta_utilidad: 100,
  }));
  filas.push({ ...filas[0], tienda_codigo: 'CK-02', meta_venta_total: 999999 });
  const resumen = cartas.resumen(tienda, '2026-10', filas, [
    { tienda_codigo: 'CK-01', nombre: 'Ana <Administradora>' },
  ]);
  assert.equal(resumen.completo, true);
  assert.equal(resumen.totales.meta_venta_total, 31000);
  assert.equal(resumen.totales.meta_creditos, 31);
  assert.equal(resumen.totales.meta_uds_cel, 62);
  assert.equal(resumen.totales.meta_uds_acc, 93);
  assert.equal(resumen.totales.meta_utilidad, 3100);
  const html = cartas.cartaHtml(resumen);
  assert.match(html, /Ana &lt;Administradora&gt;/);
  assert.match(html, /Detalle por día/);
  assert.match(html, /Imprimir \/ guardar PDF/);
  assert.doesNotMatch(html, /999999/);
});

test('no emite una carta si faltan días del presupuesto registrado', () => {
  const resumen = cartas.resumen({ codigo: 'CK-01', nombre: 'Tienda' }, '2026-10', [
    { tienda_codigo: 'CK-01', fecha: '2026-10-01', meta_creditos: 2 },
  ]);
  assert.equal(resumen.diasRegistrados, 1);
  assert.equal(resumen.completo, false);
  assert.throws(() => cartas.cartaHtml(resumen), /días sin presupuesto/);
});
