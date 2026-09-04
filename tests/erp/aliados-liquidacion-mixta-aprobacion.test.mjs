import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260904034547_corregir_validacion_aprobacion_liquidacion_mixta.sql'), 'utf8');

test('la aprobación bancaria excluye la compensación de tiendas propias', () => {
  assert.match(sql, /total_pago_aliados,0\) \+ coalesce\(v\.total_bonos,0\)/);
  assert.match(sql, /v_pago_bancario_esperado <> v_pago_bancario_detalle/);
  assert.doesNotMatch(sql, /v\.total_pagar<>\(select coalesce\(sum\(valor\)/);
});

test('la aprobación conserva permisos, congelamiento y auditoría', () => {
  assert.match(sql, /tiene_capacidad_aliados\('aprobador'\)/);
  assert.match(sql, /frozen_at=now\(\)/);
  assert.match(sql, /insert into public\.audit_log/);
  assert.match(sql, /revoke all on function public\.aliados_cambiar_estado/);
});
