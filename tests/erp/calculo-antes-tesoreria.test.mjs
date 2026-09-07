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
const retailMigration=await read('../../supabase/migrations/20260907191759_liquidaciones_asignar_retail_desde_novedades.sql');
const ownResolver=await read('../../supabase/migrations/20260904015430_controlar_imei_solo_tiendas_con_inventario.sql');
const actor='00000000-0000-4000-8000-000000000001';let db,batch;
before(async()=>{
 db=await PGlite.create({extensions:{unaccent}});
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema kora_private;create schema krediya_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'true')='true'$$;
 select set_config('request.jwt.claim.sub','${actor}',false);`);
 await db.exec('create extension unaccent');
 await db.exec(fixture);
 await db.exec(`create table liquidation_approvals(liquidation_id uuid,etapa text,decision text,comentario text);
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
 await db.exec(ownResolver.slice(ownResolver.indexOf('create or replace function public.aliados_resolver_operaciones_propias'),ownResolver.indexOf('revoke',ownResolver.indexOf('create or replace function public.aliados_resolver_operaciones_propias'))));
 await db.exec('alter table liquidation_incidents add unique(liquidation_id,operation_id,tipo)');
 await db.exec(retailMigration);
 batch=(await db.query("insert into liquidations(plataforma,estado,fecha_corte) values('alo','con_novedades','2026-09-06') returning id")).rows[0].id;
 const data=[['CREDITEK. CIENAGA DE ORO 2','CK-09','propia',741200,185300],['Artesanias eileen','artesanias','aliado',630000,150000],['Lachescel soluciones',null,'no_reconocido',665000,35000],['FULL ACCESORIOS LA 72',null,'no_reconocido',900000,250000],['Gangacell Galapa','gangacell','aliado',720000,180000],['CREDITEK COVEÑAS',null,'no_reconocido',566000,100000]];
 for(const [name,code,type,credit,initial] of data){
  const op=(await db.query("insert into liquidation_operations(liquidation_id,plataforma,operation_at,establishment_name,origen_codigo,tipo_establecimiento,monto_credito,monto_base,inicial,reconocida,normalized_data) values($1,'alo','2026-09-03T17:00:00Z',$2,$3,$4,$5,$5,$6,true,'{}') returning id",[batch,name,code,type,credit,initial])).rows[0].id;
  if(!code)await db.query("insert into liquidation_incidents(liquidation_id,operation_id,tipo) values($1,$2,'comercio_no_reconocido')",[batch,op]);
 }
});
after(()=>db?.close());
const calculate=()=>db.query('select to_jsonb(aliados_calcular_liquidacion($1)) as result',[batch]);
// Referencias numéricas de Worksheet U:Y y AD de los dos Excel ALO 24–30/08/2026.
const excelAloRows=[
 ['propia',592450,104550,0,529720,425170,167280],
 ['propia',571200,142800,0,542640,399840,171360],
 ['propia',504500,150000,0,497420,347420,157080],
 ['propia',593000,100000,0,526680,426680,166320],
 ['propia',657900,116100,0,588240,472140,185760],
 ['aliado',561000,99000,45000,508200,409200,106800],
 ['aliado',825000,275000,25000,847000,572000,228000],
 ['aliado',720000,180000,25000,693000,513000,182000],
 ['aliado',825000,275000,25000,847000,572000,228000],
 ['aliado',720000,180000,25000,693000,513000,182000],
 ['aliado',960000,240000,25000,924000,684000,251000],
 ['aliado',450000,200000,45000,500500,300500,104500],
];
test('ALO omite contratos repetidos entre cortes y dentro del archivo, conserva fuentes y continúa',async()=>{
 await db.exec(`create table liquidation_imported_files(id uuid default gen_random_uuid(),liquidation_id uuid,original_name text,sha256 text,storage_path text,size_bytes bigint,mime_type text,detected_cutoff date);
 create table liquidation_source_rows(liquidation_id uuid,file_id uuid,sheet_name text,row_number int,movement_type text,source_key text,original_data jsonb);`);
 const original=await read('../../creditek/erp/migrations/20260802_creditek_aliados_liquidaciones_v1.sql');
 const start=original.indexOf('create or replace function public.aliados_importar_liquidacion(');
 await db.exec(original.slice(start,original.indexOf('create or replace function public.aliados_cambiar_estado(',start)));
 await db.exec(await read('../../supabase/migrations/20260907221719_alo_creditos_repetidos_seguimiento.sql'));
 const op=id=>({externalId:id,sourceKey:`alo|${id}`,fecha:'2026-08-25T17:00:00Z',establecimientoNombre:'EXCEL',montoCredito:561000,montoBase:561000,inicial:99000,imei:'123',reconocida:true,tipoEstablecimiento:'aliado'});
 const run=async(ops,key,cutoff='2026-08-30')=>(await db.query(`select aliados_importar_liquidacion('alo','test.xlsx',$2::text,'test',1,'xlsx',$3,$3,$3,$4::jsonb,$1::jsonb,'[]'::jsonb,$2::text::uuid) id`,[JSON.stringify(ops),key,cutoff,JSON.stringify(ops.map((o,i)=>({sheet:'Worksheet',row_number:i+2,source_key:o.sourceKey,original:o})))])).rows[0].id;
 const first=await run([op('contract-1')],'10000000-0000-4000-8000-000000000001');
 await db.query("update liquidations set estado='pagada' where id=$1",[first]);
 const second=await run([op('contract-1'),op('contract-2'),op('contract-2')],'10000000-0000-4000-8000-000000000002','2026-09-06');
 assert.equal((await db.query('select count(*)::int n from liquidation_operations where liquidation_id=$1',[second])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from liquidation_source_rows where liquidation_id=$1',[second])).rows[0].n,3);
 const skipped=(await db.query("select detalle from audit_log where registro_id=$1 and accion='alo_credito_repetido_omitido'",[second])).rows;
 assert.equal(skipped.length,2);assert.ok(skipped.some(x=>x.detalle.estado_anterior==='pagada'));
 assert.equal(await run([op('contract-2')],'10000000-0000-4000-8000-000000000002'),second);
 const third=await run([op('contract-1')],'10000000-0000-4000-8000-000000000003');
 assert.equal((await db.query('select count(*)::int n from liquidation_operations where liquidation_id=$1',[third])).rows[0].n,0);
 await assert.rejects(()=>run([op('')],'10000000-0000-4000-8000-000000000004'),/número de contrato/);
 await db.query("update liquidations set estado='anulada' where id=$1",[second]);
 const fourth=await run([op('contract-2')],'10000000-0000-4000-8000-000000000005');
 assert.equal((await db.query('select count(*)::int n from liquidation_operations where liquidation_id=$1',[fourth])).rows[0].n,1);
});
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
 await db.query("insert into krediya_bonus_rules(tipo_establecimiento,concepto,valor,beneficiary_id,vigente_desde) select 'propia',concepto,valor,beneficiary_id,vigente_desde from krediya_bonus_rules where tipo_establecimiento='aliado'");
 const beforeRetail=(await db.query('select origen_codigo from liquidation_operations where id=$1',[op])).rows[0].origen_codigo;
 await db.query('select tesoreria_vincular_operacion_retail($1,$2,$3)',[op,beforeRetail,'CK-11']);
 const own=(await db.query('select * from liquidation_operations where id=$1',[op])).rows[0];assert.equal(own.tipo_establecimiento,'propia');assert.equal(own.ejecutivo_id,null);assert.equal(Number(own.pagamos),525000);
 const ownLot=(await db.query('select * from liquidations where id=$1',[lot])).rows[0];assert.equal(ownLot.estado,'revisada');assert.equal(ownLot.approved_at,null);assert.equal(ownLot.frozen_at,null);assert.equal(Number(ownLot.total_pago_aliados),0);assert.equal(Number(ownLot.total_pago_tiendas),455000);
 await db.query('update liquidations set frozen_at=now() where id=$1',[lot]);await assert.rejects(()=>db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[lot]),/no editable/);
 assert.equal((await db.query('select count(*)::int n from liquidation_calculations where liquidation_id=$1',[lot])).rows[0].n,1);
});

test('Retail exige tienda propia real y comparación de vínculo anterior; no admite cuenta/bono ficticio',async()=>{
 const op=(await db.query("select * from liquidation_operations where liquidation_id=$1 and establishment_name='CREDITEK COVEÑAS'",[batch])).rows[0];
 await assert.rejects(()=>db.query('select tesoreria_vincular_operacion_retail($1,$2,$3)',[op.id,op.origen_codigo,'artesanias']),/tienda propia activa/);
 await assert.rejects(()=>db.query('select tesoreria_vincular_operacion_retail($1,$2,$3)',[op.id,'otro','CK-11']),/comercio cambió/);
 await db.exec("select set_config('test.allowed','false',false)");
 await assert.rejects(()=>db.query('select tesoreria_vincular_operacion_retail($1,$2,$3)',[op.id,op.origen_codigo,'CK-11']),/No autorizado/);
 await db.exec("select set_config('test.allowed','true',false);set role anon");
 await assert.rejects(()=>db.query('select tesoreria_vincular_operacion_retail($1,$2,$3)',[op.id,op.origen_codigo,'CK-11']),/permission denied/);await db.exec('reset role');
 assert.equal((await db.query('select origen_codigo from liquidation_operations where id=$1',[op.id])).rows[0].origen_codigo,op.origen_codigo);
});
test('Retail recalcula borrador con 76%, sin ejecutivo de aliado, preservando maestros e importe fuente',async()=>{
 const op=(await db.query("select * from liquidation_operations where liquidation_id=$1 and establishment_name='CREDITEK COVEÑAS'",[batch])).rows[0];
 const origins=(await db.query('select * from origenes order by codigo')).rows;
 await db.query("update liquidations set estado='revisada',reviewed_at=now(),reviewed_by=$2 where id=$1",[batch,actor]);
 const result=(await db.query('select tesoreria_vincular_operacion_retail($1,$2,$3) result',[op.id,op.origen_codigo,'CK-11'])).rows[0].result;
 assert.equal(result.tipo,'propia');assert.equal(result.estado,'calculada');
 const updated=(await db.query('select * from liquidation_operations where id=$1',[op.id])).rows[0];
 assert.equal(updated.origen_codigo,'CK-11');assert.equal(updated.ejecutivo_id,null);assert.equal(Number(updated.porcentaje_politica),.76);
 assert.equal(Number(updated.pago_neto_beneficiario),330160);assert.equal(updated.monto_credito,op.monto_credito);assert.equal(updated.inicial,op.inicial);
 assert.deepEqual((await db.query('select * from origenes order by codigo')).rows,origins);
 const l=(await db.query('select * from liquidations where id=$1',[batch])).rows[0];assert.equal(l.reviewed_at,null);assert.equal(l.approved_at,null);assert.equal(l.frozen_at,null);
 assert.equal((await db.query("select count(*)::int n from liquidation_incidents where operation_id=$1 and estado='abierta' and tipo in ('aliado_sin_ejecutivo','beneficiario_sin_identificacion')",[op.id])).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from liquidation_bonuses where operation_id=$1 and tipo_bono like 'automatico_%'",[op.id])).rows[0].n,0);
 const audit=(await db.query("select detalle from audit_log where accion='liquidacion_operacion_vinculada_retail' and registro_id=$1",[op.id])).rows[0].detalle;
 assert.equal(audit.antes.origen_codigo,op.origen_codigo);assert.equal(audit.sin_aprobacion_ni_pago,true);
});
test('fallo de cálculo Retail revierte clasificación y auditoría; no deja importes obsoletos',async()=>{
 const op=(await db.query("select * from liquidation_operations where liquidation_id=$1 and establishment_name='FULL ACCESORIOS LA 72'",[batch])).rows[0];
 const count=(await db.query("select count(*)::int n from audit_log where accion='liquidacion_operacion_vinculada_retail'")).rows[0].n;
 await db.exec("update settlement_policy_versions set porcentaje=.01 where tipo_establecimiento='propia'");
 await assert.rejects(()=>db.query('select tesoreria_vincular_operacion_retail($1,$2,$3)',[op.id,op.origen_codigo,'CK-11']),/valor_negativo/);
 assert.deepEqual((await db.query('select * from liquidation_operations where id=$1',[op.id])).rows[0],op);
 assert.equal((await db.query("select count(*)::int n from audit_log where accion='liquidacion_operacion_vinculada_retail'")).rows[0].n,count);
 await db.exec("update settlement_policy_versions set porcentaje=.76 where tipo_establecimiento='propia'");
});
test('Retail no toca aprobación, órdenes autorizadas ni bonos manuales; wrapper invoker',async()=>{
 const op=(await db.query("select * from liquidation_operations where liquidation_id=$1 and establishment_name='FULL ACCESORIOS LA 72'",[batch])).rows[0];
 await db.query('select tesoreria_asignar_ejecutivo($1,null,$2)',[op.origen_codigo,actor]);await calculate();
 const call=()=>db.query('select tesoreria_vincular_operacion_retail($1,$2,$3)',[op.id,op.origen_codigo,'CK-11']);
 for(const state of ['aprobada','programada','pagada','cerrada','anulada']){await db.query('update liquidations set estado=$2 where id=$1',[batch,state]);await assert.rejects(call,/aprobado|gestión/);}
 await db.query("update liquidations set estado='calculada',frozen_at=now() where id=$1",[batch]);await assert.rejects(call,/aprobado|gestión/);
 await db.query('update liquidations set frozen_at=null where id=$1',[batch]);
 await db.query('update payment_orders set authorized_at=now() where liquidation_id=$1',[batch]);await assert.rejects(call,/pagos en gestión/);
 await db.query('update payment_orders set authorized_at=null where liquidation_id=$1',[batch]);
 const bonus=(await db.query("insert into liquidation_bonuses(liquidation_id,operation_id,tipo_bono,valor) values($1,$2,'manual',1000) returning id",[batch,op.id])).rows[0].id;
 await assert.rejects(call,/bonos manuales/);await db.query('delete from liquidation_bonuses where id=$1',[bonus]);
 assert.equal((await db.query("select prosecdef from pg_proc where proname='tesoreria_vincular_operacion_retail'")).rows[0].prosecdef,false);
});

test('fórmula ALO concilia las 12 filas Excel y conserva bonos, PayJoy e históricos',async()=>{
 const sql=await read('../../supabase/migrations/20260907221206_alo_formula_referencia_excel.sql');
 const previous=(await db.query('select to_jsonb(l) data from liquidations l order by id')).rows;
 const bonusFunction=(await db.query("select pg_get_functiondef('aliados_calcular_bonos_ejecutivos(uuid)'::regprocedure) body")).rows;
 await db.exec(sql);
 assert.deepEqual((await db.query('select to_jsonb(l) data from liquidations l order by id')).rows,previous);
 assert.deepEqual((await db.query("select pg_get_functiondef('aliados_calcular_bonos_ejecutivos(uuid)'::regprocedure) body")).rows,bonusFunction);
 const lot=(await db.query("insert into liquidations(plataforma,estado,fecha_corte) values('alo','importada','2026-08-30') returning id")).rows[0].id;
 for(const [i,[type,credit,initial,bonus]] of excelAloRows.entries()){
  const code=`EXCEL-${i}`;
  await db.query('insert into origenes(codigo,nombre,tipo) values($1,$1,$2)',[code,type]);
  const op=(await db.query("insert into liquidation_operations(liquidation_id,plataforma,operation_at,establishment_name,origen_codigo,tipo_establecimiento,monto_credito,monto_base,inicial,reconocida,normalized_data) values($1,'alo','2026-08-26T17:00:00Z',$2,$2,$3,$4,$4,$5,true,'{}') returning id",[lot,code,type,credit,initial])).rows[0].id;
  if(bonus)await db.query("insert into liquidation_bonuses(liquidation_id,operation_id,tipo_bono,valor,estado) values($1,$2,'referencia_excel', $3,'aprobado')",[lot,op,bonus]);
 }
 const check=async()=>{
  await db.query('select aliados_calcular_liquidacion($1)',[lot]);
  const rows=(await db.query('select * from liquidation_operations where liquidation_id=$1',[lot])).rows;
  for(const [i,[,credit,,bonus,pagamos,net,utility]] of excelAloRows.entries()){
   const o=rows.find(x=>x.origen_codigo===`EXCEL-${i}`);
   assert.deepEqual([o.pagamos,o.pago_neto_beneficiario,o.bonos_aplicados,o.utilidad_creditek].map(Number),[pagamos,net,bonus,utility]);
   assert.equal(net+bonus+utility,credit);
  }
 };
 await check();await check();
 const totals=(await db.query('select * from liquidations where id=$1',[lot])).rows[0];
 assert.equal(Number(totals.total_pago_tiendas),2071250);assert.equal(Number(totals.total_pago_aliados),3563700);
 assert.equal(Number(totals.total_bonos),215000);assert.equal(Number(totals.total_utilidad_creditek),2130100);
 assert.equal(totals.approved_at,null);
 await db.query('update liquidations set frozen_at=now() where id=$1',[lot]);
 await assert.rejects(()=>db.query('select aliados_calcular_liquidacion($1)',[lot]),/inmutable/);
 await assert.rejects(()=>db.exec(sql),/función de cálculo cambió/);
 // Misma función, rama PayJoy intacta: su fórmula no está autorizada por estos Excel ALO.
 await db.exec("insert into settlement_policy_versions(plataforma,tipo_establecimiento,estado,vigente_desde,porcentaje,base_field,formula_code) values('payjoy','propia','aprobada','2026-08-05',.76,'valor_comercial','VALOR_COMERCIAL_X_PORCENTAJE_MENOS_INICIAL')");
 const pj=(await db.query("insert into liquidations(plataforma,estado) values('payjoy','importada') returning id")).rows[0].id;
 await db.query("insert into liquidation_operations(liquidation_id,plataforma,operation_at,establishment_name,origen_codigo,tipo_establecimiento,monto_credito,monto_base,inicial,reconocida,normalized_data) values($1,'payjoy','2026-08-26T17:00:00Z','EXCEL-0','EXCEL-0','propia',592450,592450,104550,true,'{}')",[pj]);
 await db.query('select aliados_calcular_liquidacion($1)',[pj]);
 const o=(await db.query('select * from liquidation_operations where liquidation_id=$1',[pj])).rows[0];
 assert.equal(Number(o.pagamos),450262);assert.equal(Number(o.pago_neto_beneficiario),345712);assert.equal(Number(o.utilidad_creditek),142188);
});

test('aprobar sin cuentas pasa a Tesorería; completar órdenes no recalcula ni duplica',async()=>{
 await db.exec(await read('./fixtures/bonos-diferidos-guards.sql'));
 // El generador real se comprueba además en transacción revertida en Supabase.
 await db.exec(`create function public.tesoreria_generar_destinos_liquidacion(uuid) returns void language plpgsql as $$
 declare l record;o record;right_value numeric;op_base numeric;op_bonus numeric;commission_value numeric;
 begin if false then right_value:=0; else right_value:=round(op_base*o.porcentaje_politica,2); end if;
 if false then commission_value:=0; else commission_value:=round(op_base-right_value-op_bonus,2); end if;end;$$;`);
 await db.exec(await read('../../supabase/migrations/20260907224158_aprobacion_independiente_cuentas.sql'));
 const lot=(await db.query("insert into liquidations(plataforma,estado,fecha_corte) values('alo','importada','2026-09-06') returning id")).rows[0].id;
 const op=(await db.query("insert into liquidation_operations(liquidation_id,plataforma,operation_at,establishment_name,origen_codigo,tipo_establecimiento,monto_credito,monto_base,inicial,reconocida,normalized_data) values($1,'alo','2026-09-03T17:00:00Z','artesanias','artesanias','aliado',630000,630000,150000,true,'{}') returning id",[lot])).rows[0].id;
 await db.query('select aliados_calcular_liquidacion($1)',[lot]);
 await db.query("select aliados_cambiar_estado($1,'revisada')",[lot]);
 const approved=(await db.query("select to_jsonb(aliados_cambiar_estado($1,'aprobada')) l",[lot])).rows[0].l;
 assert.equal(approved.estado,'aprobada');assert.ok(approved.approved_at);assert.ok(approved.frozen_at);
 const frozen=(await db.query('select to_jsonb(o) o from liquidation_operations o where id=$1',[op])).rows[0].o;
 const pending=(await db.query('select tesoreria_pendientes_liquidacion($1) p',[lot])).rows[0].p;
 assert.equal(pending.length,1);assert.equal(pending[0].estado,'aprobada');
 await db.query("select aliados_cambiar_estado($1,'aprobada')",[lot]);
 assert.equal((await db.query("select count(*)::int n from liquidation_approvals where liquidation_id=$1 and etapa='aprobacion'",[lot])).rows[0].n,1);
 const b=(await db.query("insert into liquidation_beneficiaries(tipo,nombre,identificacion) values('aliado','Titular prueba','123') returning id")).rows[0].id;
 await db.query("update aliados set payment_beneficiary_id=$1 where id in (select aliado_id from aliados_sedes where origen_codigo='artesanias')",[b]);
 // La ficha canónica resuelve este beneficiario en la fixture por origen.
 await db.query("update liquidation_beneficiaries set origen_codigo='artesanias' where id=$1",[b]);
 await db.query("insert into beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta,activo,validada) values($1,'Banco','ahorros','123',true,true)",[b]);
 await db.query('select tesoreria_completar_ordenes_aprobadas($1)',[lot]);
 await db.query('select tesoreria_completar_ordenes_aprobadas($1)',[lot]);
 assert.equal((await db.query('select count(*)::int n from payment_items where operation_id=$1 and bonus_id is null',[op])).rows[0].n,1);
 assert.deepEqual((await db.query('select to_jsonb(o) o from liquidation_operations o where id=$1',[op])).rows[0].o,frozen);
 await assert.rejects(()=>db.query('select aliados_calcular_liquidacion($1)',[lot]),/inmutable/);
 await db.exec("select set_config('test.allowed','false',false)");
 await assert.rejects(()=>db.query('select tesoreria_completar_ordenes_aprobadas($1)',[lot]),/No autorizado/);
 await db.exec("select set_config('test.allowed','true',false)");
});

test('bono diferido: aprueba sin ejecutivo, completa en Tesorería una vez, conserva principal y revisión',async()=>{
 await db.exec(`create table treasury_movements(unit text,direction text,type text,concept text,amount numeric,movement_date date,liquidation_id uuid,balance_before numeric,balance_after numeric,status text,requested_by uuid,idempotency_key text unique);
 create table liquidation_treasury_destinations(liquidation_id uuid,total_outsourcing_commission numeric,total_executives numeric);
 create function tesoreria_aplicar_saldo(text,text,numeric,text) returns jsonb language sql as $$select '{"before":0,"after":100}'::jsonb$$;
 insert into origenes(codigo,nombre,tipo) values('DIFERIDO','Tienda sin ejecutivo','aliado');`);
 const lot=(await db.query("insert into liquidations(plataforma,estado,fecha_corte) values('alo','importada','2026-09-06') returning id")).rows[0].id;
 const op=(await db.query("insert into liquidation_operations(liquidation_id,plataforma,operation_at,establishment_name,origen_codigo,tipo_establecimiento,monto_credito,monto_base,inicial,reconocida,normalized_data) values($1,'alo','2026-09-03T17:00:00Z','Tienda sin ejecutivo','DIFERIDO','aliado',630000,630000,150000,true,'{}') returning id",[lot])).rows[0].id;
 await db.query('select aliados_calcular_liquidacion($1)',[lot]);
 await db.query("select aliados_cambiar_estado($1,'revisada')",[lot]);
 await db.query("select aliados_cambiar_estado($1,'aprobada')",[lot]);
 const before=(await db.query('select * from liquidations where id=$1',[lot])).rows[0];
 const principal=(await db.query('select pagamos,pago_neto_beneficiario from liquidation_operations where id=$1',[op])).rows[0];
 await db.query('select tesoreria_completar_ordenes_aprobadas($1)',[lot]);
 assert.equal((await db.query('select completed_at from kora_private.bonos_diferidos where operation_id=$1',[op])).rows[0].completed_at,null);
 await db.query('select tesoreria_asignar_ejecutivo($1,null,$2)',['DIFERIDO',actor]);
 await db.query('select tesoreria_completar_ordenes_aprobadas($1)',[lot]);
 await db.query('select tesoreria_completar_ordenes_aprobadas($1)',[lot]);
 const after=(await db.query('select * from liquidations where id=$1',[lot])).rows[0];
 assert.equal(after.estado,'aprobada');assert.equal(String(after.approved_at),String(before.approved_at));
 assert.equal(Number(after.total_bonos)-Number(before.total_bonos),30000);
 assert.equal(Number(after.total_utilidad_creditek),Number(before.total_utilidad_creditek)-30000);
 assert.deepEqual((await db.query('select pagamos,pago_neto_beneficiario from liquidation_operations where id=$1',[op])).rows[0],principal);
 assert.equal((await db.query('select count(*)::int n from treasury_movements where liquidation_id=$1',[lot])).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int n from liquidation_bonuses where operation_id=$1 and tipo_bono='automatico_ejecutivo'",[op])).rows[0].n,1);
 await assert.rejects(()=>db.query('update liquidation_operations set pagamos=1 where id=$1',[op]),/inmutable/);
 await assert.rejects(()=>db.query('update liquidations set total_bonos=1 where id=$1',[lot]),/inmutable/);
});

test('cuenta pendiente se completa sin reemplazar destinos ni repetir principal',async()=>{
 await db.exec(await read('../../docs/pendientes/completar_destinos_pendientes_tesoreria.sql'));
 const op=(await db.query("select * from liquidation_operations where origen_codigo='DIFERIDO'")).rows[0];
 const b=(await db.query("insert into liquidation_beneficiaries(tipo,nombre,identificacion,origen_codigo) values('aliado','Titular','1234','DIFERIDO') returning id")).rows[0].id;
 const po=(await db.query('insert into payment_orders(liquidation_id,beneficiary_id,valor) values($1,$2,$3) returning id',[op.liquidation_id,b,op.pago_neto_beneficiario])).rows[0].id;
 await db.query("insert into payment_items(payment_order_id,operation_id,concepto,valor) values($1,$2,'pago_aliado',$3)",[po,op.id,op.pago_neto_beneficiario]);
 const account=(await db.query("insert into beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta,activo,validada) values($1,'Banco','ahorros','12345',true,true) returning id",[b])).rows[0].id;
 await db.query('select tesoreria_completar_ordenes_aprobadas($1)',[op.liquidation_id]);
 await db.query('select tesoreria_completar_ordenes_aprobadas($1)',[op.liquidation_id]);
 const order=(await db.query('select * from payment_orders where id=$1',[po])).rows[0];
 assert.equal(order.bank_account_id,account);assert.equal(Number(order.valor),Number(op.pago_neto_beneficiario));
 await assert.rejects(()=>db.query("update payment_orders set bank_snapshot='{}' where id=$1",[po]),/autorizada o cerrada/);
 assert.equal((await db.query('select count(*)::int n from payment_items where payment_order_id=$1',[po])).rows[0].n,1);
});
