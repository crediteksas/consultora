import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import domain from '../../creditek/erp/aliados-tesoreria-domain.js';
const actor='00000000-0000-4000-8000-000000000001';
const bank={bank:'Banco',account_type:'Ahorros',account_number:'123',holder:'Titular',holder_identification:'456'};
test('interfaz: aprobación del lote no reemplaza autorización individual del pago',async()=>{
 const p={estado:'pendiente',valor:100,bank_snapshot:bank,liquidations:{estado:'aprobada',frozen_at:'2026-09-07',approved_at:'2026-09-07'}};
 assert.equal(domain.paymentReadiness(p).ready,false);
 assert.equal(domain.paymentReadiness({...p,bank_snapshot:{}}).ready,false);
 assert.equal(domain.paymentReadiness({...p,liquidations:{estado:'revisada'}}).ready,false);
 assert.equal(domain.paymentReadiness({...p,estado:'programado',authorized_by:actor,authorized_at:'2026-09-03',liquidations:{estado:'programada'}}).ready,true);
 assert.equal(domain.paymentReadiness({...p,estado:'programado',liquidations:{estado:'programada'}}).ready,false);
 const app=await readFile(new URL('../../creditek/erp/aliados-tesoreria-app.js',import.meta.url),'utf8');
 const source=app.slice(app.indexOf('  function paymentAction('),app.indexOf('  function isClosedPayment('));
 const render=new Function('window','esc','canAuthorize',source+';return paymentAction;')({CreditekTesoreriaTercerizacion:domain},String,()=>true);
 assert.match(render(p,[]),/Autorizar pago/);
 assert.doesNotMatch(render(p,[]),/Adjuntar soporte y registrar/);
 for(const payment of [{...p,estado:'programado',authorized_by:actor,authorized_at:'2026-09-03',liquidations:{estado:'programada'}}]){
  assert.match(render(payment,[]),/Adjuntar soporte y registrar/);
  assert.doesNotMatch(render(payment,[]),/Autorizar pago|Falta aprobar/);
 }
 assert.match(render(p,['cuenta']),/Completar datos/);
});
test('SQL: exige autorización individual sin heredarla; conserva legado e idempotencia',async()=>{
 const db=await PGlite.create();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema kora_private;create schema storage;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'true')='true'$$;
 create table perfiles(id uuid,activo boolean,rol text);create table aliados_operadores(perfil_id uuid,activo boolean,capacidad text);
 insert into perfiles values('${actor}',true,'gerencia');insert into aliados_operadores values('${actor}',true,'aprobador');
 select set_config('request.jwt.claim.sub','${actor}',false);
 create table liquidations(id uuid primary key default gen_random_uuid(),estado text,approved_by uuid,approved_at timestamptz,frozen_at timestamptz);
 create table payment_orders(id uuid primary key default gen_random_uuid(),liquidation_id uuid,estado text,valor numeric,bank_snapshot jsonb,beneficiary_id uuid,bank_account_id uuid,authorized_by uuid,authorized_at timestamptz,fecha_programada date,updated_at timestamptz,historico_inicial boolean default false,soporte_path text,platform_snapshot text,cutoff_snapshot date);
 create table liquidation_treasury_destinations(liquidation_id uuid);
 create table audit_log(usuario uuid,accion text,tabla text,registro_id text,detalle jsonb);
 create table storage.objects(bucket_id text,name text,metadata jsonb);
 insert into storage.objects values('soportes','aliados/pagos/test.pdf','{"mimetype":"application/pdf","size":100}');
 create table test_payments(id uuid);
 create function aliados_cambiar_estado_pago(p_id uuid,p_estado text,p_soporte_path text) returns void language plpgsql as $$begin
 insert into public.test_payments values(p_id);update public.payment_orders set estado=p_estado,soporte_path=p_soporte_path where id=p_id;end;$$;
 `);
 const fixture=await readFile(new URL('./fixtures/autorizacion-lote-production.sql',import.meta.url),'utf8');
 await db.exec(fixture.replace(/^(end )?\$function\$$/gm,'$&;'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20260908021116_autorizacion_unica_lote.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20260908022500_autorizacion_legacy_destinos.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20260910001811_autorizacion_individual_pagos.sql',import.meta.url),'utf8'));
 await db.exec('create trigger payment_guard before update of estado on payment_orders for each row execute function aliados_exigir_liquidacion_aprobada_para_pago()');
 const lot=(await db.query("insert into liquidations(estado,approved_by,approved_at,frozen_at) values('aprobada',$1,now(),now()) returning id",[actor])).rows[0].id;
 await db.query('insert into liquidation_treasury_destinations values($1)',[lot]);
 async function order(l=lot,extra='') {return (await db.query(`insert into payment_orders(liquidation_id,estado,valor,bank_snapshot,beneficiary_id) values($1,'pendiente',100,$2,$3) returning id`,[l,bank,actor])).rows[0].id;}
 const id=await order();
 await assert.rejects(db.query("select tesoreria_cerrar_pagos_con_soporte($1,'aliados/pagos/missing.pdf')",[[id]]),/no se ha cargado/);
 assert.equal((await db.query('select authorized_at from payment_orders where id=$1',[id])).rows[0].authorized_at,null);
 await assert.rejects(db.query("select tesoreria_cerrar_pagos_con_soporte($1,'aliados/pagos/test.pdf')",[[id]]),/autorización individual/);
 await assert.rejects(db.query("update payment_orders set estado='pagado' where id=$1",[id]),/autorización individual/);
 await db.query("update payment_orders set estado='programado',authorized_by=$1,authorized_at=now() where id=$2",[actor,id]);
 await db.query("select tesoreria_cerrar_pagos_con_soporte($1,'aliados/pagos/test.pdf')",[[id]]);
 const paid=(await db.query('select * from payment_orders where id=$1',[id])).rows[0];
 assert.equal(paid.estado,'pagado');assert.equal(paid.authorized_by,actor);assert.deepEqual(paid.bank_snapshot,bank);assert.equal(Number(paid.valor),100);
 await db.query("select tesoreria_cerrar_pagos_con_soporte($1,'aliados/pagos/test.pdf')",[[id]]);
 assert.equal((await db.query('select count(*) n from test_payments')).rows[0].n,1);
 const legacy=(await db.query("insert into liquidations(estado) values('programada') returning id")).rows[0].id;
 // El lote legado real no tiene destinos: conserva su autorización anterior.
 const old=await order(legacy);
 await db.exec('alter table payment_orders disable trigger payment_guard');
 await db.query("update payment_orders set estado='programado',authorized_by=$1,authorized_at='2026-09-03' where id=$2",[actor,old]);
 await db.exec('alter table payment_orders enable trigger payment_guard');
 await db.query("select tesoreria_cerrar_pagos_con_soporte($1,'aliados/pagos/test.pdf')",[[old]]);
 assert.equal((await db.query('select approved_at from liquidations where id=$1',[legacy])).rows[0].approved_at,null,'No inventa aprobación histórica');
 const unapproved=(await db.query("insert into liquidations(estado) values('revisada') returning id")).rows[0].id;
 await assert.rejects(db.query("select tesoreria_cerrar_pagos_con_soporte($1,'aliados/pagos/test.pdf')",[[await order(unapproved)]]),/aprobación/);
 const incomplete=await order();await db.query("update payment_orders set bank_snapshot='{}' where id=$1",[incomplete]);
 await db.query("update payment_orders set estado='programado',authorized_by=$1,authorized_at=now() where id=$2",[actor,incomplete]);
 await assert.rejects(db.query("select tesoreria_cerrar_pagos_con_soporte($1,'aliados/pagos/test.pdf')",[[incomplete]]),/cuenta/);
 await db.exec("select set_config('test.allowed','false',false)");
 await assert.rejects(db.query("select kora_private.preparar_pago_autorizado_por_lote($1)",[incomplete]),/No autorizado/);
 }finally{await db.close();}
});
