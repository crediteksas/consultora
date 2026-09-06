import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('creditek/erp/aliados-tesoreria-app.js','utf8');
const html=fs.readFileSync('creditek/erp/aliados-tesoreria.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20260906205155_clientes_unificados_y_pagos_seguros.sql','utf8');

test('muestra comercio y titular en pagos de aliados',()=>{
  assert.match(app,/paymentBusinessName/);
  assert.match(app,/Titular:/);
  assert.match(app,/origin_code\s*:\s*b\.origen_codigo/);
});

test('consolida órdenes abiertas del mismo beneficiario y cuenta',()=>{
  assert.match(app,/function paymentGroups/);
  assert.match(app,/paymentGroupKey\(payment\)/);
  assert.match(app,/órdenes consolidadas/);
  assert.match(app,/reduce\(\(n\s*,\s*x\)\s*=>\s*n\s*\+\s*Number\(x\.valor\)\s*,\s*0\)/);
  const version=html.match(/src="aliados-tesoreria-app\.js\?v=(\d+)\.(\d+)\.(\d+)"/);
  assert.ok(version,'El módulo debe tener una versión explícita para actualizar caché');
  assert.ok(Number(version[1])>1||Number(version[1])===1&&Number(version[2])>=3,'La versión incluye pagos agrupados y Cobros');
});

test('un soporte registra todo el grupo en una transacción validada',()=>{
  assert.match(app,/tesoreria_cerrar_pagos_con_soporte/);
  assert.match(sql,/v.beneficiary_id is distinct from v_first.beneficiary_id/);
  assert.match(sql,/v.bank_snapshot is distinct from v_first.bank_snapshot/);
  assert.match(sql,/v.authorized_by is null or v.authorized_at is null/);
  assert.match(sql,/perform public\.aliados_cambiar_estado_pago/);
});
