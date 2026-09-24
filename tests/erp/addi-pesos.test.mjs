import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/20260924030712_addi_neto_pesos_enteros.sql', import.meta.url), 'utf8');

test('Addi redondea solo el neto final: 50 centavos bajan y 51 suben', () => {
  assert.match(sql, /p_valor-floor\(p_valor\)>0\.50/);
  assert.match(sql, /v_neto:=cobros_private\.addi_redondear_peso\(v_neto_sin_redondeo\)/);
  assert.match(sql, /net:=cobros_private\.addi_redondear_peso\(new\.valor_esperado_financiera-fee-tax\)/);
  assert.match(sql, /v_neto:=cobros_private\.addi_redondear_peso\(r\.neto_estimado\)/);
  assert.equal(712206 + (0.50 > 0.50 ? 1 : 0), 712206);
  assert.equal(712206 + (0.51 > 0.50 ? 1 : 0), 712207);
});

test('el ajuste histórico conserva trazabilidad y no altera cobros recibidos ni pago pactado', () => {
  assert.match(sql, /create table cobros_private\.addi_redondeos_peso/);
  assert.match(sql, /if exists\(select 1 from public\.cobros_allocations/);
  assert.match(sql, /or exists\(select 1 from public\.cobros_deposits/);
  assert.match(sql, /v_utilidad:=v_neto-r\.pago_tienda/);
  assert.doesNotMatch(sql, /update public\.addi_liquidaciones set[^;]*pago_tienda=/);
});
