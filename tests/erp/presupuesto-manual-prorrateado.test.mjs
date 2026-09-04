import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../supabase/migrations/20260904031256_presupuesto_manual_prorrateado.sql', import.meta.url), 'utf8');

test('la propuesta prorratea el histórico mensual y conserva el total exacto', () => {
  assert.match(sql, /histórico mensual prorrateado/);
  assert.match(sql, /v_total - s\.suma_base/);
  assert.match(sql, /round\(v_total \* \(1 \+ p_pct_crecimiento \/ 100\.0\)\) - s\.suma_meta/);
});

test('la propuesta conserva el patrón diario real cuando existe', () => {
  assert.match(sql, /count\(distinct v\.fecha\) > 1/);
  assert.match(sql, /count\(distinct h\.fecha\) > 1/);
  assert.match(sql, /'histórico diario'::text/);
});

test('la función exige un usuario central y no queda expuesta a public', () => {
  assert.match(sql, /not public\.es_central\(\)/);
  assert.match(sql, /revoke all on function .* from public/);
  assert.match(sql, /grant execute on function .* to authenticated/);
});

test('solo Gerencia puede aprobar y el servidor recalcula antes de guardar', () => {
  assert.match(sql, /guardar_presupuesto_manual/);
  assert.match(sql, /rol_actual\(\) is distinct from 'gerencia'/);
  assert.match(sql, /select \* from public\.proponer_presupuesto_manual/);
  assert.match(sql, /Solo gerencia puede aprobar y guardar presupuestos/);
});
