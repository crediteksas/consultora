import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260904191254_calcular_krediya_desde_archivo_original.sql','utf8');

test('Krediya calcula columnas ausentes desde reglas versionadas de KORA',()=>{
  assert.match(migration,/create table if not exists public\.krediya_bonus_rules/);
  assert.match(migration,/'aliado',30000,'2026-09-01'/);
  assert.match(migration,/v_pagamos:=r\.pagamos/);
  assert.match(migration,/v_pago:=v_pagamos-coalesce\(o\.inicial,0\)/);
  assert.match(migration,/v_utilidad:=coalesce\(o\.monto_credito,o\.monto_base\)-v_pago-v_bono/);
  assert.match(migration,/'origenValoresLiquidacion','tarifario_kora'/);
});

test('Krediya conserva el motor manual para archivos históricos enriquecidos',()=>{
  assert.match(migration,/rename to aliados_calcular_liquidacion_krediya_archivo_manual/);
  assert.match(migration,/return public\.aliados_calcular_liquidacion_krediya_archivo_manual\(p_id\)/);
});
