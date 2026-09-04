import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20260904193859_bonos_y_provision_krediya.sql','utf8');

test('cada crédito Krediya reconoce los dos bonos autorizados',()=>{
  assert.match(sql,/'gestion_krediya',b\.id,5000/);
  assert.match(sql,/'operacion',b\.id,15000/);
  assert.match(sql,/v_bono<>20000/);
  assert.match(sql,/Bono Operación Krediya — Oscar Pacheco/);
  assert.match(sql,/Gestión de crédito Krediya — Mayte Reyes/);
});

test('la utilidad Krediya descuenta provisión del 28 por ciento',()=>{
  assert.match(sql,/v_provision:=round\(v_bruta\*0\.28,2\)/);
  assert.match(sql,/'provision_porcentaje',0\.28/);
  assert.match(sql,/utilidad_creditek=round\(v_bruta-v_provision,2\)/);
});
