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
  'creditek/erp/migrations/20260727_efectivo_esperado_tienda.sql'
);

async function cargarDominio() {
  assert.equal(existsSync(domainPath), true, 'falta el dominio de caja esperado');
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);
  return context.window.CreditekCajaPiloto;
}

test('incluye venta financiada e inicial en el efectivo esperado', async () => {
  const caja = await cargarDominio();
  const resultado = caja.calcularEfectivoEsperado({
    apertura: 50000,
    ventasContado: 100000,
    financiadoRecibido: 800000,
    iniciales: 100000,
    otrosIngresos: 20000,
    gastosEfectivo: 30000,
    salidasExplicitas: 10000,
  });

  assert.equal(resultado, 1030000);
});

test('solo excluye financiación mediante un movimiento explícito', async () => {
  const caja = await cargarDominio();
  const resultado = caja.calcularEfectivoEsperado({
    apertura: 0,
    ventasContado: 0,
    financiadoRecibido: 800000,
    iniciales: 100000,
    otrosIngresos: 0,
    gastosEfectivo: 0,
    salidasExplicitas: 800000,
  });

  assert.equal(resultado, 100000);
});

test('el servidor calcula desde ventas vigentes y movimientos documentados', async () => {
  assert.equal(existsSync(migrationPath), true, 'falta la migración mínima de caja');
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /create table if not exists public\.movimientos_caja_tienda/);
  assert.match(sql, /valor_esperado_financiera/);
  assert.match(sql, /not coalesce\(v\.anulada, false\)/);
  assert.match(sql, /transferencia_central/);
  assert.match(sql, /pago_directo_central/);
  assert.match(sql, /soporte_path text not null/);
  assert.match(sql, /create or replace function public\.registrar_movimiento_caja_tienda/);
  assert.match(sql, /idempotency_key/);
  assert.match(sql, /create or replace function public\.calcular_efectivo_esperado_tienda/);
});

test('la pantalla usa el cálculo autoritativo del servidor', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/caja.html'), 'utf8');

  assert.match(html, /caja-piloto-domain\.js/);
  assert.match(html, /calcular_efectivo_esperado_tienda/);
  assert.match(html, /Financiado recibido/);
  assert.match(html, /Salidas explícitas/);
});
