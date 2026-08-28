import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const domain = require('../../creditek/erp/aliados-cuentas-domain.js');
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('normaliza y valida el tercero y su cuenta sin conservar separadores', () => {
  const result = domain.validateNewBeneficiary({
    originCode: ' aliado-01 ', name: '  Distribuciones   del Caribe ', identification: 'NIT 900.123.456-7',
    bank: ' Bancolombia ', accountType: 'AHORROS', accountNumber: '123-456 789'
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    originCode: 'ALIADO-01', name: 'Distribuciones del Caribe', identification: '9001234567',
    bank: 'Bancolombia', accountType: 'ahorros', accountNumber: '123456789'
  });
});

test('rechaza campos incompletos antes de llamar a la base de datos', () => {
  const result = domain.validateNewBeneficiary({});
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 6);
});

test('la interfaz permite escoger un tercero nuevo y asociarlo a un aliado', async () => {
  const [html, app] = await Promise.all([read('creditek/erp/aliados-liquidaciones.html'), read('creditek/erp/aliados-liquidaciones-app.js')]);
  for (const id of ['bankBeneficiaryMode', 'bankAllyOrigin', 'bankHolderName', 'bankHolderIdentification']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /\.eq\('tipo', 'aliado'\)/);
  assert.match(app, /aliados_crear_tercero_con_cuenta/);
  assert.match(app, /aliados_completar_pagos_beneficiario/);
});

test('el RPC es atómico, auditado y no queda expuesto a anónimos', async () => {
  const sql = await read('supabase/migrations/20260828025429_kora_2026_000046_cuentas_terceros.sql');
  assert.match(sql, /tiene_capacidad_aliados\('revisor'\)/);
  assert.match(sql, /tipo = 'aliado' and origen_codigo = v_origin\.codigo and activo = true/);
  assert.match(sql, /on conflict \(beneficiary_id, numero_cuenta\) do update/);
  assert.match(sql, /aliados_tercero_cuenta_creada/);
  assert.match(sql, /revoke all on function public\.aliados_crear_tercero_con_cuenta[\s\S]*from public, anon/);
  assert.match(sql, /grant execute[\s\S]*to authenticated/);
});
