import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('creditek/erp/aliados-tesoreria-app.js','utf8');
const html=fs.readFileSync('creditek/erp/aliados-tesoreria.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20260904174000_registrar_pago_agrupado_tesoreria.sql','utf8');

test('muestra comercio y titular en pagos de aliados',()=>{
  assert.match(app,/paymentBusinessName/);
  assert.match(app,/Titular:/);
  assert.match(app,/origin_code:b\.origen_codigo/);
});

test('consolida órdenes abiertas del mismo beneficiario y cuenta',()=>{
  assert.match(app,/function paymentGroups/);
  assert.match(app,/beneficiary_id,payment\.bank_snapshot\?\.account_number/);
  assert.match(app,/órdenes consolidadas/);
  assert.match(app,/reduce\(\(n,x\)=>n\+Number\(x\.valor\),0\)/);
  assert.match(html,/aliados-tesoreria-app\.js\?v=1\.2\.0/);
});

test('un soporte registra todo el grupo en una transacción validada',()=>{
  assert.match(app,/aliados_registrar_pago_agrupado/);
  assert.match(sql,/po\.beneficiary_id=first_payment\.beneficiary_id/);
  assert.match(sql,/account_number'=first_payment\.bank_snapshot/);
  assert.match(sql,/po\.authorized_by is not null/);
  assert.match(sql,/perform public\.aliados_cambiar_estado_pago/);
});
