import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../../supabase/migrations/20260903040400_asignar_historicos_prefijo_a_a_alexander.sql', import.meta.url), 'utf8');

test('la regla gerencial asigna el prefijo A a Alexander sin usar un UUID fijo', () => {
  assert.match(sql, /lower\(unaccent\(trim\(nombre\)\)\) = 'alexander fernandez'/);
  assert.match(sql, /establecimiento ~\* '\^A\[\[:space:\]\]\+'/);
  assert.match(sql, /regla_prefijo_a_confirmada_por_gerencia/);
  assert.match(sql, /v_creditos <> 20/);
  assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});
