import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../supabase/migrations/20260904221000_formalizar_comercios_krediya.sql', import.meta.url), 'utf8');

test('formaliza únicamente comercios Krediya con asociación histórica aprobada', () => {
  assert.match(sql, /ejecutivo_historico_id=v_alexander/);
  assert.match(sql, /establecimiento ~\* '\^A\[\[:space:\]\]\+'/);
  assert.match(sql, /not exists/);
});

test('reconoce contratos firmados y conserva trazabilidad', () => {
  assert.match(sql, /Estado del contrato/);
  assert.match(sql, /reconocida=true/);
  assert.match(sql, /formalizar_comercios_krediya/);
});

test('incluye aliases exactos para las tiendas propias del archivo', () => {
  assert.match(sql, /CREDITEK CHINU UNO/);
  assert.match(sql, /CREDITEK CIENAGA DE ORO UNO/);
  assert.match(sql, /CREDITEK COROZAL UNO/);
});
