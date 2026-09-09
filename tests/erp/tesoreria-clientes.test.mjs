import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
const domain = require('../../creditek/erp/tesoreria-clientes.js');
const origin = {codigo:'Tech-Movil',nombre:'A TECH MOVIL',ciudad:'Montería',activo:true,tipo:'aliado'};
const holder = {id:'h',nombre:'Titular Uno',identificacion:'123456',tipo:'aliado',activo:true,origen_codigo:origin.codigo};
const bank = {id:'a',beneficiary_id:'h',banco:'Banco',tipo_cuenta:'ahorros',numero_cuenta:'001234567',activo:true,validada:true,created_at:'2026-09-01'};
test('incluye comercios sin titular y no fusiona nombres parecidos',()=>{
  const rows=domain.directory([origin,{...origin,codigo:'otra',nombre:'A TECNO MOVIL MH'},{...origin,codigo:'retail',tipo:'propia'}],[],[]);
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.status==='sin_titular'));
  assert.equal(domain.filterRows(rows,'TECH MOVIL','').length,1);
});
test('asocia por código exacto, no por parecido ni mayúsculas',()=>{
  assert.equal(domain.directory([origin],[{...holder,origen_codigo:'TECH-MOVIL'}],[bank])[0].beneficiary,null);
});
test('distingue cuenta verificada, faltante, sin verificar y titulares duplicados',()=>{
  assert.equal(domain.directory([origin],[holder],[bank])[0].status,'completo');
  assert.equal(domain.directory([origin],[holder],[])[0].status,'sin_cuenta');
  assert.equal(domain.directory([origin],[holder],[{...bank,validada:false}])[0].status,'sin_validar');
  assert.equal(domain.directory([origin],[holder,{...holder,id:'h2'}],[bank])[0].status,'revisar');
});
test('búsqueda por comercio, ciudad sin acento, titular e identificación; filtro de estado',()=>{
  const rows=domain.directory([origin],[holder],[bank]);
  for(const q of ['TECH','monteria','titular','123456'])assert.equal(domain.filterRows(rows,q,'completo').length,1);
  assert.equal(domain.filterRows(rows,'','sin_cuenta').length,0);
});
test('cuenta reciente activa y número enmascarado sin perder ceros',()=>{
  const rows=domain.directory([origin],[holder],[bank,{...bank,id:'b',numero_cuenta:'009999999',created_at:'2026-09-02'},{...bank,id:'c',activo:false,created_at:'2026-09-03'}]);
  assert.equal(rows[0].account.id,'b'); assert.equal(domain.masked(bank),'Banco · ahorros · •••• 4567');
});
test('guardado independiente de pagos, capacidad real y snapshots históricos',()=>{
  const sql=readFileSync('supabase/migrations/20260906154913_tesoreria_clientes_cuentas.sql','utf8');
  const app=readFileSync('creditek/erp/tesoreria-clientes.js','utf8');
  const treasury=readFileSync('creditek/erp/aliados-tesoreria-app.js','utf8');
  assert.match(sql,/auth.uid\(\) is null or not public.tiene_capacidad_aliados\('revisor'\)/);
  assert.match(sql,/revoke all[\s\S]*from public,anon/);
  assert.match(sql,/set search_path = ''/);
  assert.doesNotMatch(sql,/(update|insert into|delete from) public\.(payment_orders|treasury_movements|liquidations)/i);
  assert.match(sql,/v_current.id is distinct from p_previous_beneficiary_id/);
  assert.match(sql,/v_holder.origen_codigo<>v_origin.codigo/);
  assert.doesNotMatch(app,/aliados_completar_pagos_beneficiario|prompt\(/);
  assert.match(treasury,/beneficiary_name: p.bank_snapshot\?\.holder \|\| b.nombre/);
  assert.match(app,/No se modificaron órdenes de pago ni saldos/);
  assert.match(app,/tesoreria_guardar_cuenta_ejecutivo/);
  assert.match(app,/p_identificacion:v\.identification/);
});
test('la cuenta del ejecutivo permite reemplazar la clave interna por identificación legal',()=>{
  const app=readFileSync('creditek/erp/tesoreria-clientes.js','utf8');
  const publicApp=readFileSync('public/creditek/erp/tesoreria-clientes.js','utf8');
  const sql=readFileSync('supabase/migrations/20260909232759_permitir_identificacion_pago_ejecutivo.sql','utf8');
  assert.equal(publicApp,app,'la fuente pública y el componente compartido deben permanecer sincronizados');
  assert.match(app,/identification\.readOnly=false/);
  assert.match(app,/Escribe la cédula o NIT real del titular/);
  assert.match(sql,/tipo='ejecutivo'/);
  assert.match(sql,/v_identification !~ '\^\[0-9\]\{5,20\}\$'/);
  assert.match(sql,/public\.aliados_guardar_cuenta_bancaria/);
  assert.match(sql,/identificacion_anterior_terminada_en/);
  assert.doesNotMatch(sql,/(update|delete from) public\.payment_orders/i);
});
