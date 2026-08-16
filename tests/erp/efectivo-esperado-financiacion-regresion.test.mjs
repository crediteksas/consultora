import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const domainPath = path.join(root, 'creditek/erp/caja-piloto-domain.js');
const migrationPath = path.join(
  root,
  'creditek/erp/migrations/20260727_corrige_efectivo_credito_pendiente.sql'
);

async function cargarDominio() {
  assert.equal(existsSync(domainPath), true, 'falta el dominio de caja esperado');
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);
  return context.window.CreditekCajaPiloto;
}

test('un saldo pendiente de 465.000 no aumenta el efectivo', async () => {
  const caja = await cargarDominio();
  const resultado = caja.calcularEfectivoEsperado({
    apertura: 1000000,
    ventasContado: 500000,
    financiadoRecibido: 0,
    saldoPorCobrar: 465000,
    iniciales: 158000,
    otrosIngresos: 0,
    gastosEfectivo: 0,
    salidasExplicitas: 0,
  });

  assert.equal(resultado, 1658000);
});

test('clasifica la venta entre dinero recibido y cuenta por cobrar', async () => {
  const caja = await cargarDominio();
  const clasificacion = caja.clasificarVentaCredito({
    totalVenta: 623000,
    cuotaInicial: 158000,
    saldoPendiente: 465000,
  });

  assert.deepEqual(
    { ...clasificacion },
    { totalVenta: 623000, dineroRecibido: 158000, saldoPorCobrar: 465000 }
  );
});

test('rechaza una clasificación que no concilia con el total de venta', async () => {
  const caja = await cargarDominio();
  assert.throws(
    () => caja.clasificarVentaCredito({
      totalVenta: 623000,
      cuotaInicial: 158000,
      saldoPendiente: 400000,
    }),
    /no concilia/
  );
});

test('el servidor calcula desde ventas vigentes y movimientos documentados', async () => {
  assert.equal(existsSync(migrationPath), true, 'falta la migración mínima de caja');
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /to_regclass\('public\.movimientos_caja_tienda'\)/);
  assert.match(sql, /valor_esperado_financiera/);
  assert.match(sql, /saldo_por_cobrar/);
  assert.doesNotMatch(
    sql,
    /sum\(c\.valor_esperado_financiera\)[\s\S]{0,120}into v_contado, v_financiado/
  );
  assert.match(sql, /not coalesce\(v\.anulada, false\)/);
  assert.match(sql, /transferencia_central/);
  assert.match(sql, /pago_directo_central/);
  assert.match(sql, /create or replace function public\.calcular_efectivo_esperado_tienda/);
});

test('la pantalla usa el cálculo autoritativo del servidor', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/caja.html'), 'utf8');

  assert.match(html, /caja-piloto-domain\.js/);
  assert.match(html, /calcular_efectivo_esperado_tienda/);
  assert.match(html, /Saldo por cobrar/);
  assert.match(html, /Salidas explícitas/);
});

test('ventas concilia total, dinero recibido y saldo por cobrar antes del RPC', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/ventas.html'), 'utf8');

  assert.match(html, /caja-piloto-domain\.js/);
  assert.match(html, /clasificarVentaCredito/);
  assert.match(html, /saldoPendiente:\s*esperado/);
});
