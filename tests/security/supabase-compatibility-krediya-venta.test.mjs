import test from 'node:test';import assert from 'node:assert/strict';
import {setup,seed,apply} from '../../scripts/supabase-compat/krediya-venta-fixture.mjs';
const lot='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const value=async(db,q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
const correct=(db,p=1050000,paid=750000,why='Corrección ficticia confirmada')=>db.query("select public.aliados_resolver_precio_krediya($1,'editar_operacion',$2,$3,$4)",[id,p,paid,why]);
const calculate=db=>db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[lot]);
const monetary=async db=>(await db.query("select id,operation_at,monto_credito,inicial,valor_comercial,pagamos,pago_neto_beneficiario,bonos_aplicados,utilidad_creditek from liquidation_operations where id<>$1 order by id",[id])).rows;
for(const scenario of ['upgrade','rebuild'])test('corrección por venta: aislamiento, fuente, tarifas e historial '+scenario,async()=>{
 const db=await setup(scenario);try{await seed(db);await calculate(db);const peers=await monetary(db),tariffs=await value(db,'select jsonb_agg(to_jsonb(t) order by id) from krediya_price_rules t'),source=await value(db,'select normalized_data from liquidation_operations where id=$1',[id]),payments=await value(db,'select jsonb_agg(to_jsonb(t) order by id) from payment_orders t');
 await apply(db);const beforePeerRows=await value(db,'select jsonb_agg(to_jsonb(t) order by id) from liquidation_operations t where id<>$1',[id]);
 await correct(db);assert.deepEqual(await value(db,'select jsonb_agg(to_jsonb(t) order by id) from liquidation_operations t where id<>$1',[id]),beforePeerRows);assert.deepEqual(await value(db,'select jsonb_agg(to_jsonb(t) order by id) from payment_orders t'),payments);
 let c=await value(db,'select aliados_contexto_precio_krediya($1)',[id]);assert.equal(c.pvp_guardado,1000000);assert.equal(c.pvp_recibido,900000);assert.equal(c.pvp_aplicado,1050000);assert.equal(c.pagamos_aplicado,750000);assert.equal(c.correccion_venta.ambito,'venta_v1');
 await correct(db);const saved=await value(db,"select policy_snapshot->'decision_precio' from liquidation_operations where id=$1",[id]);assert.ok(!('correccion_venta' in saved.comparacion));assert.ok(!('decision' in saved.comparacion));assert.ok(!('pvp_aplicado' in saved.comparacion));
 const audit=await value(db,"select detalle from audit_log where accion='krediya_decision_precio' and jsonb_typeof(detalle->'antes')='object' limit 1");assert.equal(audit.antes.ambito,'venta_v1');assert.equal(audit.despues.precio_venta,1050000);
 assert.equal(await value(db,"select count(*) from krediya_diferencias where operation_id<>$1 and estado='pendiente'",[id]),2);
 await db.query('select kora_private.preparar_catalogo_liquidacion($1)',[lot]);assert.deepEqual(await value(db,"select policy_snapshot->'decision_precio' from liquidation_operations where id=$1",[id]),saved);
 const preview=await value(db,'select krediya_private.utilidad_consulta($1)',[id]);assert.equal(preview.pvp,1050000);assert.equal(preview.pagamos,750000);assert.equal(preview.giro,650000);assert.equal(preview.gasto_financiero,3200);assert.equal(preview.utilidad_neta,213696);
 await calculate(db);assert.deepEqual(await monetary(db),peers);assert.deepEqual(await value(db,'select jsonb_agg(to_jsonb(t) order by id) from krediya_price_rules t'),tariffs);assert.deepEqual(await value(db,'select normalized_data from liquidation_operations where id=$1',[id]),source);
 const actual=(await db.query('select valor_comercial,pagamos,pago_neto_beneficiario,utilidad_creditek,policy_snapshot from liquidation_operations where id=$1',[id])).rows[0];assert.equal(Number(actual.valor_comercial),1050000);assert.equal(Number(actual.pagamos),750000);assert.equal(Number(actual.pago_neto_beneficiario),650000);assert.equal(Number(actual.utilidad_creditek),213696);assert.equal(actual.policy_snapshot.decision_precio.ambito,'venta_v1');
 assert.equal(await value(db,"select estado from krediya_diferencias where operation_id=$1",[id]),'resuelta');assert.equal(await value(db,"select count(*) from krediya_diferencias where operation_id<>$1 and estado='pendiente'",[id]),2);
 assert.equal(await value(db,"select count(*) from liquidation_operations where origen_codigo='F-ALLY' and operation_at<'2026-11-18 14:00-05'"),1);
 }finally{await db.close();}
});
test('corrección exige autorización, lote válido, pagos pendientes, reconocimiento y pesos enteros',async()=>{
 const db=await setup();try{await seed(db);await apply(db);
 const rejected=async(sql,message,p=1050000,paid=750000,why='Motivo ficticio')=>{await db.exec('begin');try{if(sql)await db.exec(sql);const before=await value(db,'select to_jsonb(t) from liquidation_operations t where id=$1',[id]);await assert.rejects(correct(db,p,paid,why),message);await db.exec('rollback');assert.equal(await value(db,"select count(*) from audit_log where accion='krediya_decision_precio'"),0);}catch(e){await db.exec('rollback');throw e;}};
 await rejected("set test.allowed='false'",/No autorizado/);await db.exec('reset test.allowed');
 await rejected("set test.actor=''",/No autorizado/);await db.exec("set test.actor='11111111-1111-4111-8111-111111111111'");
 await rejected("update liquidation_operations set liquidation_id=null where id='"+id+"'",/liquidación no existe/);
 await rejected("update liquidation_operations set reconocida=null where id='"+id+"'",/no reconocida/);
 for(const state of ['aprobada','pagada','cerrada','estado_desconocido'])await rejected("update liquidations set estado='"+state+"'",/aprobada|no admite cambios/);
 await rejected('update liquidations set frozen_at=now()',/aprobada/);await rejected('update liquidations set approved_at=now()',/aprobada/);
 await rejected("insert into payment_orders(liquidation_id,estado) values('"+lot+"','pagado')",/pagos en gestión/);
 await rejected("insert into payment_orders(liquidation_id,estado,authorized_at) values('"+lot+"','pendiente',now())",/pagos en gestión/);
 await rejected('',/pesos enteros/,1050000.5);await rejected('',/pesos enteros/,1050000,750000.25);await rejected('',/inicial/,1050000,1);await rejected('',/motivo/,1050000,750000,'');
 await db.exec('set role anon');await assert.rejects(correct(db),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
test('sin tarifa, la corrección nueva habilita cálculo; decisiones antiguas continúan ignoradas',async()=>{
 const db=await setup();try{await seed(db);await apply(db);await db.exec("update liquidation_operations set policy_snapshot='{\"decision_precio\":{\"precio_venta\":1,\"pagamos\":1}}'");let c=await value(db,'select aliados_contexto_precio_krediya($1)',[id]);assert.equal(c.pvp_aplicado,900000);assert.equal(c.pagamos_aplicado,700000);assert.equal(c.correccion_venta,null);
 await db.exec("delete from krediya_price_rules where vigente_hasta is not null");await correct(db);let v=await value(db,'select krediya_private.utilidad_consulta($1)',[id]);assert.equal(v.disponible,true);assert.equal(v.pvp,1050000);
 await db.exec("update liquidation_operations set reconocida=false where id<>'"+id+"'");await calculate(db);assert.equal(Number(await value(db,'select valor_comercial from liquidation_operations where id=$1',[id])),1050000);
 }finally{await db.close();}
});

test('las tres decisiones nuevas se marcan por venta; no se aceptan fracciones heredadas de fuente o tarifa',async()=>{
 const db=await setup();try{await seed(db);await apply(db);
 for(const [decision,pvp,paid] of [['aceptar_krediya',900000,760000],['conservar_guardado',1000000,700000]]){
  await db.query('select aliados_resolver_precio_krediya($1,$2,123,$3,$4)',[id,decision,paid,'Decisión ficticia explícita']);const c=await value(db,'select aliados_contexto_precio_krediya($1)',[id]);assert.equal(c.correccion_venta.ambito,'venta_v1');assert.equal(c.pvp_aplicado,pvp);assert.equal(c.pagamos_aplicado,paid);
 }
 await db.exec("update liquidation_operations set normalized_data=jsonb_set(normalized_data,'{valorComercial}','900000.25') where id='"+id+"'");await assert.rejects(db.query("select aliados_resolver_precio_krediya($1,'aceptar_krediya',0,760000,'Prueba ficticia')",[id]),/pesos enteros/);
 await db.exec('update krediya_price_rules set pagamos=700000.25 where vigente_hasta is not null');await assert.rejects(db.query("select aliados_resolver_precio_krediya($1,'conservar_guardado',0,0,'Prueba ficticia')",[id]),/pesos enteros/);
 }finally{await db.close();}
});
for(const scenario of ['upgrade','rebuild'])test('ACL de las cuatro funciones conserva permisos previos '+scenario,async()=>{const {capture}=await import('../../scripts/supabase-compat/krediya-venta-evidence.mjs');const x=await capture(scenario);assert.equal(x.contract.objects.length,4);});
