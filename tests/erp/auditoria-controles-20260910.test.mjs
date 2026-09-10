import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=await readFile(new URL('../../supabase/migrations/20260910150614_auditoria_controles_roles_ventas_pagos.sql',import.meta.url),'utf8');
const sale=await readFile(new URL('./fixtures/registrar-venta-auditada-20260910.sql',import.meta.url),'utf8');
const ids=Array.from({length:9},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
async function setup(){
 const db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema kora_private;create schema storage;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table perfiles(id uuid primary key,rol text,activo boolean,tienda_codigo text);
 insert into perfiles values('${ids[0]}','gerencia',true,null),('${ids[1]}','auditoria',true,null),('${ids[2]}','admin_tienda',true,'A'),('${ids[3]}','admin_tienda',false,'A'),('${ids[4]}','admin_tienda',true,null);
 create function rol_actual() returns text language sql security definer as $$select rol from perfiles where id=auth.uid()$$;
 create function tienda_actual() returns text language sql security definer as $$select tienda_codigo from perfiles where id=auth.uid()$$;
 create function es_central() returns boolean language sql security definer as $$select rol_actual() in('gerencia','auditoria')$$;
 alter table perfiles enable row level security;
 create policy "central gestiona perfiles" on perfiles for all to authenticated using(es_central());
 create policy "perfil propio" on perfiles for select to authenticated using(id=auth.uid() or es_central());
 create table ventas(id uuid primary key default gen_random_uuid(),consecutivo bigint generated always as identity,tienda_codigo text,vendedor uuid,tipo text,cliente_id uuid,total numeric,anulada boolean,nota text);
 create table productos(id uuid primary key,nombre text,tipo text);
 create table unidades(id uuid primary key,producto_id uuid,tienda_actual text,estado text,costo_remision numeric);
 create table stock_cantidad(producto_id uuid,tienda_codigo text,cantidad int,costo_promedio numeric,updated_at timestamptz,primary key(producto_id,tienda_codigo));
 create table venta_items(id uuid default gen_random_uuid(),venta_id uuid,producto_id uuid,unidad_id uuid,cantidad int check(cantidad>0),precio_venta numeric,costo_congelado numeric);
 create table movimientos(tipo text,tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad int,costo numeric,precio numeric,referencia_tipo text,referencia_id text,usuario uuid);
 create table creditos(venta_id uuid,financiera text,cuota_inicial numeric,valor_esperado_financiera numeric,plazo_meses int,estado_conciliacion text);
 create table payment_orders(id uuid primary key,estado text,historico_inicial boolean,soporte_path text);
 create table storage.objects(bucket_id text,name text,metadata jsonb);
 create table liquidation_incidents(liquidation_id uuid,operation_id uuid,tipo text,descripcion text,bloquea_aprobacion boolean,unique(liquidation_id,operation_id,tipo));
 create table liquidation_calculations(pagamos numeric,pago_aliado numeric,total_bonos numeric,utilidad_creditek numeric,constraint liquidation_calculations_check check(pagamos>=0 and pago_aliado>=0 and total_bonos>=0 and utilidad_creditek>=0));
 create function kora_private.calcular_liquidacion_sin_datos_pago(p_id uuid) returns numeric language plpgsql as $fn$
 declare v_pago numeric:=10;v_util numeric:=-5;o record;begin
 select p_id id into o;
 if v_pago<0 or v_util<0 then raise exception 'valor_negativo_imposible'; end if;
 return v_util;end $fn$;
 grant usage on schema public,auth to authenticated;
 grant all on perfiles,ventas,venta_items,stock_cantidad,unidades to authenticated;
 insert into productos values('${ids[5]}','Accesorio','cantidad'),('${ids[6]}','Celular','serializado');
 insert into stock_cantidad values('${ids[5]}','A',2,100,null),('${ids[5]}','B',3,100,null);
 insert into unidades values('${ids[7]}','${ids[6]}','A','disponible',200),('${ids[8]}','${ids[6]}','B','disponible',200);`);
 await db.exec(sale);await db.exec(migration);return db;
}
async function as(db,id){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[id]);await db.exec('set role authenticated');}
async function sell(db,store,items){return db.query("select registrar_venta($1,'contado',null,$2::jsonb,null,null) result",[store,JSON.stringify(items)]);}
test('roles: gerencia conserva gestión; Maite lee pero no cambia roles; inactivos no reciben contexto',async()=>{
 const db=await setup();try{
  await as(db,ids[1]);assert.equal((await db.query('select * from perfiles')).rows.length,5);
  assert.equal((await db.query("update perfiles set rol='gerencia' where id=$1 returning id",[ids[1]])).rows.length,0);
  await as(db,ids[0]);assert.equal((await db.query("update perfiles set tienda_codigo='B' where id=$1 returning id",[ids[2]])).rows.length,1);
  await as(db,ids[3]);const ctx=(await db.query('select rol_actual() rol,tienda_actual() tienda,es_central() central')).rows[0];
  assert.deepEqual(ctx,{rol:null,tienda:null,central:false});
 }finally{await db.close();}
});
test('ventas: rechaza inserción directa, stock insuficiente, tienda ajena, inactivo y sin tienda; transacción normal funciona',async()=>{
 const db=await setup();try{
  await as(db,ids[2]);
  await assert.rejects(db.query("insert into ventas(tienda_codigo,total)values('A',1)"),/permission denied/);
  await assert.rejects(db.query('insert into venta_items(cantidad)values(1)'),/permission denied/);
  await assert.rejects(sell(db,'A',[{producto_id:ids[5],cantidad:3,precio_venta:150}]),/Stock insuficiente/);
  await assert.rejects(sell(db,'B',[{producto_id:ids[5],cantidad:1,precio_venta:150}]),/No autorizado/);
  await assert.rejects(sell(db,'A',[{producto_id:ids[6],unidad_id:ids[8],precio_venta:300}]),/otra tienda/);
  await sell(db,'A',[{producto_id:ids[5],cantidad:2,precio_venta:150},{producto_id:ids[6],unidad_id:ids[7],precio_venta:300}]);
  await assert.rejects(sell(db,'A',[{producto_id:ids[6],unidad_id:ids[7],precio_venta:300}]),/no está disponible/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from ventas')).rows[0].n,1);
  assert.equal((await db.query("select cantidad from stock_cantidad where tienda_codigo='A'")).rows[0].cantidad,0);
  assert.equal(Number((await db.query('select total from ventas')).rows[0].total),600);
  for(const id of [ids[3],ids[4]]){await as(db,id);await assert.rejects(sell(db,'B',[{producto_id:ids[5],cantidad:1,precio_venta:150}]),/perfil|No autorizado/);}
  await as(db,ids[0]);await sell(db,'B',[{producto_id:ids[5],cantidad:1,precio_venta:150}]);
 }finally{await db.close();}
});
test('pago: trigger común exige archivo real y válido; conserva histórico y no revalida pagos ya realizados',async()=>{
 const db=await setup();try{
  await db.query("insert into payment_orders values($1,'programado',false,null)",[ids[0]]);
  await assert.rejects(db.query("update payment_orders set estado='pagado',soporte_path='aliados/pagos/falso.pdf'"),/no se ha cargado/);
  await db.exec(`insert into storage.objects values('soportes','aliados/pagos/real.pdf','{"mimetype":"application/pdf","size":200}')`);
  await db.exec("update payment_orders set estado='pagado',soporte_path='aliados/pagos/real.pdf'");
  assert.equal((await db.query('select estado from payment_orders')).rows[0].estado,'pagado');
  await db.query("insert into payment_orders values($1,'programado',true,null)",[ids[1]]);
  await db.query("update payment_orders set estado='pagado' where id=$1",[ids[1]]);
 }finally{await db.close();}
});
test('pérdida válida se conserva con novedad no bloqueante; reemplazo no cambia base PayJoy',async()=>{
 const db=await setup();try{
  assert.equal(Number((await db.query('select kora_private.calcular_liquidacion_sin_datos_pago($1) result',[ids[0]])).rows[0].result),-5);
  assert.equal((await db.query('select bloquea_aprobacion from liquidation_incidents')).rows[0].bloquea_aprobacion,false);
  await db.exec('insert into liquidation_calculations values(100,90,20,-5)');
  await assert.rejects(db.exec('insert into liquidation_calculations values(100,-90,20,-5)'),/check constraint/);
  assert.doesNotMatch(migration,/set\s+(pagamos|valor_comercial|total_pagar)\s*=/i);
 }finally{await db.close();}
});
