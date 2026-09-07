import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {unaccent} from '@electric-sql/pglite/contrib/unaccent';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const migration=await read('../../supabase/migrations/20260907173853_liquidaciones_calculo_antes_de_tesoreria.sql');
const fixture=await read('./fixtures/calculo-antes-tesoreria.sql');
const old=await read('../../supabase/migrations/20260907155104_liquidaciones_vincular_comercio.sql');
const unified=await read('../../supabase/migrations/20260906205155_clientes_unificados_y_pagos_seguros.sql');
const actor='00000000-0000-4000-8000-000000000001';let db,batch;
before(async()=>{
 db=await PGlite.create({extensions:{unaccent}});
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema kora_private;create schema krediya_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'true')='true'$$;
 select set_config('request.jwt.claim.sub','${actor}',false);`);
 await db.exec('create extension unaccent');
 await db.exec(fixture);
 await db.exec(`create table liquidation_approvals(liquidation_id uuid,etapa text,decision text);
 alter table origenes add primary key(codigo);alter table aliados add primary key(id);alter table aliados_sedes add unique(origen_codigo);
 alter table liquidation_calculations add unique(operation_id);alter table payment_orders add unique(liquidation_id,beneficiary_id);
 alter table liquidation_bonuses add primary key(id);alter table payment_orders add primary key(id);
 alter table payment_items add foreign key(bonus_id) references liquidation_bonuses(id);
 alter table payment_items add foreign key(payment_order_id) references payment_orders(id);
 alter table payment_orders alter column beneficiary_id set not null;alter table payment_orders add check(valor>0);
 alter table liquidation_domain_events add unique(idempotency_key);alter table krediya_diferencias add unique(operation_id);
 alter table liquidation_calculations add check(policy_version_id is not null or policy_snapshot->>'motor'='krediya_v2');
 grant usage on schema kora_private to authenticated;
 insert into settlement_policy_versions(plataforma,tipo_establecimiento,estado,vigente_desde,porcentaje,base_field,formula_code)
 values('alo','aliado','aprobada','2026-08-05',.77,'valor_comercial','VALOR_COMERCIAL_X_PORCENTAJE_MENOS_INICIAL'),('alo','propia','aprobada','2026-08-05',.76,'valor_comercial','VALOR_COMERCIAL_X_PORCENTAJE_MENOS_INICIAL');
 insert into ejecutivos(id,nombre,esquema_comision) values('${actor}','Ejecutivo prueba','{"tipo":"fijo","valor":30000}');
 insert into liquidation_beneficiaries(tipo,ejecutivo_id,nombre) values('ejecutivo','${actor}','Ejecutivo prueba');
 insert into origenes(codigo,nombre,tipo,ejecutivo_id) values('CK-09','CREDITEK. CIENAGA DE ORO 2','propia',null),('CK-11','Creditel Coveñas','propia',null),('artesanias','Artesanias eileen','aliado','${actor}'),('gangacell','Gangacell Galapa','aliado','${actor}');`);
 await db.exec(old.slice(old.indexOf('create function kora_private.clave_comercio'),old.indexOf('create function kora_private.vincular_comercio_liquidacion')));
 await db.exec(unified.slice(unified.indexOf('create or replace function public.vincular_ficha_nuevo_comercio()'),unified.indexOf('create or replace function public.tesoreria_guardar_ficha_cliente(')));
 await db.exec(migration);
 batch=(await db.query("insert into liquidations(plataforma,estado,fecha_corte) values('alo','con_novedades','2026-09-06') returning id")).rows[0].id;
 const data=[['CREDITEK. CIENAGA DE ORO 2','CK-09','propia',741200,185300],['Artesanias eileen','artesanias','aliado',630000,150000],['Lachescel soluciones',null,'no_reconocido',665000,35000],['FULL ACCESORIOS LA 72',null,'no_reconocido',900000,250000],['Gangacell Galapa','gangacell','aliado',720000,180000],['CREDITEK COVEÑAS',null,'no_reconocido',566000,100000]];
 for(const [name,code,type,credit,initial] of data){
  const op=(await db.query("insert into liquidation_operations(liquidation_id,plataforma,operation_at,establishment_name,origen_codigo,tipo_establecimiento,monto_credito,monto_base,inicial,reconocida,normalized_data) values($1,'alo','2026-09-03T17:00:00Z',$2,$3,$4,$5,$5,$6,true,'{}') returning id",[batch,name,code,type,credit,initial])).rows[0].id;
  if(!code)await db.query("insert into liquidation_incidents(liquidation_id,operation_id,tipo) values($1,$2,'comercio_no_reconocido')",[batch,op]);
 }
});
after(()=>db?.close());
const calculate=()=>db.query('select to_jsonb(aliados_calcular_liquidacion($1)) as result',[batch]);
test('ALO calcula las seis operaciones aunque tres no tengan ejecutivo ni cuenta',async()=>{
 const result=(await calculate()).rows[0].result;assert.equal(result.estado,'calculada');
 assert.equal(Number(result.total_pago_aliados),1965370);assert.equal(Number(result.total_pago_tiendas),378012);
 const rows=(await db.query('select establishment_name,tipo_establecimiento,porcentaje_politica,pago_neto_beneficiario from liquidation_operations where liquidation_id=$1',[batch])).rows;
 assert.equal(rows.length,6);assert.equal(rows.filter(x=>x.tipo_establecimiento==='propia').length,1);
 assert.ok(rows.every(x=>Number(x.porcentaje_politica)===(x.tipo_establecimiento==='propia'?.76:.77)));
 assert.equal(rows.find(x=>x.establishment_name==='CREDITEK COVEÑAS').tipo_establecimiento,'aliado');
 assert.equal((await db.query('select count(*)::int n from liquidation_calculations where liquidation_id=$1',[batch])).rows[0].n,6);
 assert.equal((await db.query('select count(*)::int n from payment_orders where liquidation_id=$1',[batch])).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from liquidation_incidents where liquidation_id=$1 and estado='abierta' and tipo='aliado_sin_ejecutivo' and not bloquea_aprobacion",[batch])).rows[0].n,3);
});
test('no inventa ciudad, ejecutivo ni cuenta; crea una única sede para cada aliado nuevo',async()=>{
 const rows=(await db.query("select * from origenes where codigo like 'ALIADO-%'")).rows;assert.equal(rows.length,3);
 for(const row of rows){assert.equal(row.ciudad,null);assert.equal(row.ejecutivo_id,null);assert.equal((await db.query('select count(*)::int n from aliados_sedes where origen_codigo=$1',[row.codigo])).rows[0].n,1);}
 assert.equal((await db.query("select tipo from origenes where codigo='CK-11'")).rows[0].tipo,'propia');
});
test('recalcular es idempotente en catálogo, importes y cálculos; no autoriza ni paga',async()=>{
 const before=(await db.query('select total_pago_aliados,total_pago_tiendas,total_bonos from liquidations where id=$1',[batch])).rows[0];
 await calculate();assert.deepEqual((await db.query('select total_pago_aliados,total_pago_tiendas,total_bonos from liquidations where id=$1',[batch])).rows[0],before);
 assert.equal((await db.query("select count(*)::int n from origenes where codigo like 'ALIADO-%'")).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from liquidation_calculations where liquidation_id=$1',[batch])).rows[0].n,6);
 assert.equal((await db.query('select approved_at,frozen_at from liquidations where id=$1',[batch])).rows[0].approved_at,null);
});
test('Validar de una pantalla anterior también calcula sin bloquear por cuenta ni ejecutivo',async()=>{
 await db.query("update liquidations set estado='con_novedades' where id=$1",[batch]);
 const r=(await db.query("select to_jsonb(aliados_cambiar_estado($1,'validada')) as result",[batch])).rows[0].result;
 assert.equal(r.estado,'calculada');assert.equal(Number(r.total_pago_aliados),1965370);assert.equal(r.approved_at,null);
});
test('Tesorería muestra el principal calculado y los datos concretos faltantes',async()=>{
 const rows=(await db.query('select tesoreria_pendientes_liquidacion($1) as rows',[batch])).rows[0].rows;
 assert.equal(rows.length,5);assert.equal(rows.filter(r=>r.falta_ejecutivo).length,3);assert.ok(rows.every(r=>r.neto>0 && r.falta_titular && r.falta_cuenta));
 assert.equal(rows.filter(r=>r.falta_comercio).length,0);
});
test('asignar ejecutivo no altera snapshot ni históricos; siguiente cálculo agrega el bono',async()=>{
 const op=(await db.query("select * from liquidation_operations where liquidation_id=$1 and establishment_name='Lachescel soluciones'",[batch])).rows[0];
 await db.query('select tesoreria_asignar_ejecutivo($1,null,$2)',[op.origen_codigo,actor]);
 assert.equal((await db.query('select ejecutivo_id from liquidation_operations where id=$1',[op.id])).rows[0].ejecutivo_id,null);
 await calculate();const updated=(await db.query('select * from liquidation_operations where id=$1',[op.id])).rows[0];
 assert.equal(updated.ejecutivo_id,actor);assert.equal(Number(updated.pago_neto_beneficiario),477050);assert.equal(Number(updated.bonos_aplicados),30000);
 await assert.rejects(()=>db.query('select tesoreria_asignar_ejecutivo($1,null,$2)',[op.origen_codigo,actor]),/cambió/);
});
test('no permite congelar un bono no conocido como cero definitivo',async()=>{
 await assert.rejects(()=>db.query("update liquidations set estado='aprobada' where id=$1",[batch]),/Completa el ejecutivo/);
});
test('actualizar borrador revisado invalida esa revisión, sin aprobar ni pagar',async()=>{
 await db.query("update liquidations set estado='revisada',reviewed_at=now(),reviewed_by=$2 where id=$1",[batch,actor]);
 const l=(await calculate()).rows[0].result;assert.equal(l.estado,'calculada');assert.equal(l.reviewed_at,null);assert.equal(l.reviewed_by,null);assert.equal(l.frozen_at,null);
});
test('protege aprobado, pagos en gestión y acceso sin capacidad',async()=>{
 await db.query('update liquidations set frozen_at=now() where id=$1',[batch]);await assert.rejects(calculate,/inmutable/);await db.query('update liquidations set frozen_at=null where id=$1',[batch]);
 await db.query("insert into payment_orders(liquidation_id,beneficiary_id,valor,estado) values($1,$2,100,'programado')",[batch,actor]);await assert.rejects(calculate,/pagos en gestión/);await db.query('delete from payment_orders where liquidation_id=$1',[batch]);
 await db.exec("select set_config('test.allowed','false',false)");await assert.rejects(calculate,/No autorizado/);await db.exec("select set_config('test.allowed','true',false)");
 await db.exec('set role anon');await assert.rejects(calculate,/permission denied/);await db.exec('reset role');
});
test('cuentas completadas generan órdenes sin duplicarse ni romper referencias a bonos',async()=>{
 const beneficiary=(await db.query("select id from liquidation_beneficiaries where ejecutivo_id=$1",[actor])).rows[0].id;
 await db.query("insert into beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta,activo,validada) values($1,'Banco prueba','ahorros','0000000001',true,true)",[beneficiary]);
 await calculate();const before=(await db.query('select sum(valor)::text total,count(*)::int n from payment_orders where liquidation_id=$1',[batch])).rows[0];
 assert.equal(before.n,1);assert.equal(Number(before.total),90000);await calculate();
 assert.deepEqual((await db.query('select sum(valor)::text total,count(*)::int n from payment_orders where liquidation_id=$1',[batch])).rows[0],before);
 assert.equal((await db.query('select count(*)::int n from payment_items')).rows[0].n,3);
});
test('Krediya calcula PAGAMOS sin titular ni ejecutivo; preserva el informe y no aprueba',async()=>{
 const lot=(await db.query("insert into liquidations(plataforma,fecha_corte) values('krediya','2026-08-30') returning id")).rows[0].id;
 await db.query("insert into krediya_price_rules(referencia_clave,referencia,precio_venta,pagamos,vigente_desde) values('ref:equipoprueba','Equipo prueba',750000,525000,'2026-08-01')");
 for(const [concept,value] of [['gestion_krediya',5000],['operacion',15000]]){
  const holder=(await db.query("insert into liquidation_beneficiaries(tipo,nombre) values('ejecutivo',$1) returning id",[concept])).rows[0].id;
  await db.query("insert into krediya_bonus_rules(tipo_establecimiento,concepto,valor,beneficiary_id,vigente_desde) values('aliado',$1,$2,$3,'2026-08-01')",[concept,value,holder]);
 }
 const op=(await db.query("insert into liquidation_operations(liquidation_id,plataforma,operation_at,establishment_name,tipo_establecimiento,monto_credito,monto_base,inicial,reconocida,referencia,normalized_data) values($1,'krediya','2026-08-25T17:00:00Z','Nuevo aliado Krediya','no_reconocido',630000,630000,70000,true,'Equipo prueba','{}') returning id",[lot])).rows[0].id;
 await db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[lot]);
 const l=(await db.query('select * from liquidations where id=$1',[lot])).rows[0];assert.equal(l.estado,'calculada');assert.equal(l.approved_at,null);assert.equal(Number(l.total_pago_aliados),455000);assert.equal(Number(l.total_pagar),475000);
 const c=(await db.query('select * from liquidation_calculations where operation_id=$1',[op])).rows[0];assert.equal(Number(c.pagamos),525000);assert.equal(Number(c.total_bonos),20000);assert.equal(c.policy_snapshot.bono_ejecutivo_pendiente,true);assert.equal(c.policy_snapshot.motor,'krediya_v2');
 assert.equal((await db.query('select count(*)::int n from krediya_diferencias where operation_id=$1',[op])).rows[0].n,1);
 await db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[lot]);assert.equal((await db.query('select count(*)::int n from payment_orders where liquidation_id=$1',[lot])).rows[0].n,2);
 await db.query('update liquidations set frozen_at=now() where id=$1',[lot]);await assert.rejects(()=>db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[lot]),/no editable/);
 assert.equal((await db.query('select count(*)::int n from liquidation_calculations where liquidation_id=$1',[lot])).rows[0].n,1);
});
