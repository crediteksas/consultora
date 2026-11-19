import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{closureDb,installRevision,view}from'./fixtures/socios-revision.mjs';import{admin,id,who,user,cut}from'./fixtures/socios-inventario.mjs';
const sql=readFileSync(new URL('../../supabase/migrations/20261119181116_inventario_conciliar_fecha_registro.sql',import.meta.url),'utf8');
test('conciliación por registro libera fecha ambigua sin modificar venta, costo ni resultado',async t=>{
 const db=await closureDb(t);await installRevision(db,{realClosure:true});
 await admin(db,"insert into ventas values($1,'T1','2026-09-12T15:00Z','2026-08-31',0,false)",[id(201)]);await admin(db,'insert into venta_items values($1,600,1)',[id(201)]);
 const before=await view(db);assert.equal(before.listo,false);
 await db.exec('reset role');await db.exec(sql);await user(db);
 await assert.rejects(db.query("insert into inventario_control.ventas_fechas_conciliadas select id,$3,md5(to_jsonb(v)::text),fecha,created_at,(created_at at time zone 'America/Bogota')::date,$1,'Confirmación de prueba',$2 from ventas v",[who.oscar,id(501),cut.positive]),/permission denied/);
 await admin(db,"insert into inventario_control.ventas_fechas_conciliadas select id,$3,md5(to_jsonb(v)::text),fecha,created_at,(created_at at time zone 'America/Bogota')::date,$1,'Confirmación autorizada de prueba',$2,now() from ventas v",[who.oscar,id(501),cut.positive]);
 const after=await view(db);assert.equal(after.listo,true);assert.equal(after.fechas_venta_inconsistentes,0);
 for(const k of['ventas_totales','costo_vendido','gastos_totales','utilidad_neta','inicio_at','fin_at'])assert.equal(after[k],before[k]);
 assert.equal((await admin(db,'select fecha::text as fecha from ventas')).rows[0].fecha,'2026-08-31');
 await assert.rejects(admin(db,'delete from inventario_control.ventas_fechas_conciliadas'),/inmutable/i);
 await assert.rejects(admin(db,'truncate inventario_control.ventas_fechas_conciliadas'),/inmutable/i);
 await admin(db,"update ventas set fecha='2026-08-30'");assert.equal((await view(db)).listo,false);
});
test('acción autorizada es atómica e idempotente y conserva las tres ventas originales',async t=>{
 const db=await closureDb(t);await installRevision(db,{realClosure:true});await db.exec('reset role');await db.exec(sql);
 await db.exec('alter table public.ventas add column consecutivo bigint');
 const targets=[];
 for(let n=1;n<=3;n++){
  await db.query("insert into ventas(id,tienda_codigo,created_at,fecha,total,anulada,consecutivo) values($1,$2,'2026-09-12T15:00Z','2026-08-31',0,false,$3)",[id(210+n),'T'+n,100+n]);
  await db.query('insert into venta_items values($1,600,1)',[id(210+n)]);
  targets.push({corte_id:[cut.positive,cut.negative,cut.second][n-1],id:id(210+n),tienda_codigo:'T'+n,consecutivo:100+n,fecha_original:'2026-08-31',fecha_conciliada:'2026-09-12'});
 }
 await user(db,who.oscar);await db.exec('reset role');
 const action=readFileSync(new URL('../../scripts/maintenance/conciliar-fechas-inventario.sql',import.meta.url),'utf8');
 const params=async rows=>{await db.query("select set_config('app.inventario_fecha_targets',$1,false),set_config('app.inventario_fecha_request',$2,false)",[JSON.stringify(rows),id(502)]);};
 await params(targets.slice(0,2));await assert.rejects(db.exec(action),/three distinct/);await db.exec('rollback');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who.mayte]);await params(targets);
 await assert.rejects(db.exec(action),/Declared Gerencia/);await db.exec('rollback');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who.oscar]);
 await params(targets.map((x,i)=>i===2?{...x,corte_id:cut.negative}:x));await assert.rejects(db.exec(action),/cut.store mismatch/);await db.exec('rollback');
 await params(targets.map((x,i)=>i===2?{...x,fecha_original:'2026-08-30'}:x));
 await assert.rejects(db.exec(action),/differs from explicitly/);await db.exec('rollback');
 assert.equal((await db.query('select count(*)::int n from inventario_control.ventas_fechas_conciliadas')).rows[0].n,0);
 await params(targets);await db.exec(action);await db.exec(action);
 assert.equal((await db.query('select count(*)::int n from inventario_control.ventas_fechas_conciliadas')).rows[0].n,3);
 assert.equal((await db.query("select count(*)::int n from audit_log where accion='CONCILIAR_FECHA_VENTA_INVENTARIO'")).rows[0].n,3);
 assert.equal((await db.query("select count(*)::int n from ventas where fecha='2026-08-31' and total=0")).rows[0].n,3);
});
