import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const domain = require('../../creditek/erp/aliados-liquidaciones-domain.js');
const migrationPath = 'creditek/erp/migrations/20260805_liquidaciones_unificadas_payjoy_alo.sql';
const rollbackPath = 'creditek/erp/migrations/rollback/20260805_liquidaciones_unificadas_payjoy_alo_rollback.sql';

const policies = [
  ['payjoy','propia',.76], ['alo','propia',.76],
  ['payjoy','aliado',.77], ['alo','aliado',.77],
].map(([plataforma,tipoEstablecimiento,porcentaje], index) => ({
  id:`p${index}`, version:2, plataforma, tipoEstablecimiento, porcentaje,
  baseCampo:'valor_comercial', vigenteDesde:'2026-08-05', vigenteHasta:null, estado:'aprobada',
}));

function operation(overrides = {}) {
  return {
    sourceKey:'alo|1', plataforma:'alo', tipoEstablecimiento:'aliado',
    fecha:'2026-08-05T12:00:00Z', montoCredito:1_000_000, inicial:200_000,
    montoBase:1_000_000, reconocida:true, incidencias:[], ejecutivo:{ id:'e1' },
    establecimiento:{ id:'a1', beneficiarioId:'b1' }, ...overrides,
  };
}

test('normaliza PayJoy y ALO a crédito, inicial y valor comercial sin duplicar accesorios', () => {
  const alo = domain.normalizarOperacion(operation({ accesorios:50_000, accesoriosCantidad:1 }));
  assert.deepEqual({ credito:alo.valorCredito, inicial:alo.inicialPlataforma, comercial:alo.valorComercial }, { credito:1_000_000, inicial:200_000, comercial:1_200_000 });
  assert.equal(alo.accesorios, 50_000);
  const payjoy = domain.normalizarOperacion(operation({ plataforma:'payjoy', montoCredito:780_000, montoBase:780_000, inicial:117_000 }));
  assert.equal(payjoy.valorComercial, 897_000);
});

test('aplica 76 % a Retail y 77 % a Aliados sobre crédito más inicial', () => {
  const retail = domain.calcularOperaciones([operation({ tipoEstablecimiento:'propia' })], policies)[0];
  const aliado = domain.calcularOperaciones([operation()], policies)[0];
  assert.deepEqual({ porcentaje:retail.porcentaje, pagamos:retail.pagamos, neto:retail.pagoNeto, utilidad:retail.utilidadCreditek }, { porcentaje:.76, pagamos:912_000, neto:712_000, utilidad:488_000 });
  assert.deepEqual({ porcentaje:aliado.porcentaje, pagamos:aliado.pagamos, neto:aliado.pagoNeto, utilidad:aliado.utilidadCreditek }, { porcentaje:.77, pagamos:924_000, neto:724_000, utilidad:476_000 });
});

test('resta inicial una vez, descuenta bonos y congela snapshot de política', () => {
  const [result] = domain.calcularOperaciones([operation()], policies, [{ operationKey:'alo|1', valor:25_000, estado:'aprobado' }]);
  assert.equal(result.pagoNeto, 724_000);
  assert.equal(result.utilidadCreditek, 451_000);
  assert.equal(result.totalBonos, 25_000);
  assert.deepEqual(result.policySnapshot, policies[3]);
});

test('resume total general como suma exacta de Retail y Aliados', () => {
  const calculations = domain.calcularOperaciones([operation({ sourceKey:'alo|r', tipoEstablecimiento:'propia' }), operation()], policies);
  const summary = domain.resumirUnificado(calculations);
  assert.equal(summary.general.operaciones, summary.retail.operaciones + summary.aliados.operaciones);
  assert.equal(summary.general.valorComercial, summary.retail.valorComercial + summary.aliados.valorComercial);
  assert.equal(summary.general.totalPagar, summary.retail.totalPagar + summary.aliados.totalPagar);
});

test('la migración crea cuatro políticas desde 2026-08-05 y bloquea solapamientos', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const fragment of ["'payjoy','propia',0.76", "'alo','propia',0.76", "'payjoy','aliado',0.77", "'alo','aliado',0.77", "date '2026-08-05'", 'liquidaciones_bloquear_politica_solapada']) assert.match(sql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(sql, /valor_comercial/);
  assert.match(sql, /policy_snapshot/);
  assert.match(sql, /tipo_establecimiento in\('propia','aliado'\)/);
  assert.doesNotMatch(sql, /update public\.liquidation_calculations/i);
  assert.match(sql, /if v\.frozen_at is not null then raise exception 'Liquidación aprobada inmutable';[\s\S]*delete from public\.liquidation_calculations where liquidation_id=p_id/);
});

test('rollback conserva operaciones e históricos y desactiva solo las políticas futuras', async () => {
  const rollback = await readFile(rollbackPath, 'utf8');
  assert.match(rollback, /vigente_desde=date '2026-08-05'/);
  assert.doesNotMatch(rollback, /drop table|delete from public\.liquidations|delete from public\.liquidation_operations/i);
});
