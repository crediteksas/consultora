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
  'creditek/erp/migrations/20260727_cierre_caja_idempotente.sql'
);

test('permite cerrar cuando efectivo contado y esperado coinciden', async () => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);

  const resultado = context.window.CreditekCajaPiloto.validarCierre({
    efectivoContado: 1030000,
    efectivoEsperado: 1030000,
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(resultado)),
    { ok: true, diferencia: 0, mensaje: '' }
  );
});

test('rechaza una diferencia y muestra la causa', async () => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);

  const resultado = context.window.CreditekCajaPiloto.validarCierre({
    efectivoContado: 1029000,
    efectivoEsperado: 1030000,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.diferencia, -1000);
  assert.match(resultado.mensaje, /diferencia/i);
});

test('permite cerrar el caso reportado con efectivo exacto de 1.658.000', async () => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);
  const caja = context.window.CreditekCajaPiloto;
  const esperado = caja.calcularEfectivoEsperado({
    apertura: 1000000,
    ventasContado: 500000,
    financiadoRecibido: 0,
    saldoPorCobrar: 465000,
    iniciales: 158000,
    otrosIngresos: 0,
    gastosEfectivo: 0,
    salidasExplicitas: 0,
  });

  assert.equal(esperado, 1658000);
  assert.deepEqual(
    { ...caja.validarCierre({ efectivoContado: 1658000, efectivoEsperado: esperado }) },
    { ok: true, diferencia: 0, mensaje: '' }
  );
});

test('mantiene bloqueado el cierre cuando existe una diferencia real', async () => {
  const context = { window: {} };
  vm.runInNewContext(await readFile(domainPath, 'utf8'), context);
  const resultado = context.window.CreditekCajaPiloto.validarCierre({
    efectivoContado: 1657999,
    efectivoEsperado: 1658000,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.diferencia, -1);
});

test('el cierre servidor reutiliza el cálculo, bloquea y es idempotente', async () => {
  assert.equal(existsSync(migrationPath), true, 'falta la migración mínima de cierre');
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /create or replace function public\.cerrar_caja_piloto/);
  assert.match(sql, /public\.calcular_efectivo_esperado_tienda/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /for update/);
  assert.match(sql, /cierre_idempotency_key/);
  assert.match(sql, /on conflict \(tienda_codigo, fecha\)/);
});

test('la interfaz abandona el RPC legado y conserva la llave al reintentar', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/caja.html'), 'utf8');

  assert.match(html, /sb\.rpc\('cerrar_caja_piloto'/);
  assert.match(html, /dataset\.idempotencyKey/);
  assert.doesNotMatch(html, /sb\.rpc\('cerrar_caja',/);
});
