import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const sql=readFileSync(new URL('../../supabase/migrations/20260911164853_remisiones_correccion_previa_recepcion.sql',import.meta.url),'utf8');
const uid='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const p='00000000-0000-0000-0000-000000000011';
const q='00000000-0000-0000-0000-000000000012';
const f='00000000-0000-0000-0000-000000000021';
async function fixture(){
 const db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
 create table auth.users(id uuid primary key,email text);
 create table public.perfiles(id uuid primary key,nombre text,rol text,activo boolean,tienda_codigo text);
 insert into auth.users values ('${uid}','gestion@crediteksas.com'),('${other}','otra@example.test');
 insert into perfiles values ('${uid}','Maite','auditoria',true,null),('${other}','Otra','auditoria',true,null);
 select set_config('app.uid','${uid}',false);
 create function rol_actual() returns text language sql as $$select rol from perfiles where id=auth.uid()$$;
 create function es_central() returns boolean language sql as $$select rol_actual() in ('gerencia','auditoria')$$;
 create function tienda_actual() returns text language sql as $$select tienda_codigo from perfiles where id=auth.uid()$$;
 create table productos(id uuid primary key,tipo text,nombre text);
 insert into productos values ('${p}','serializado','Celular'),('${q}','cantidad','Accesorio');
 create table remisiones(id uuid primary key default gen_random_uuid(),consecutivo bigint generated always as identity,tienda_codigo text,estado text,recibida_at timestamptz);
 create table remision_items(id uuid primary key default gen_random_uuid(),remision_id uuid references remisiones,producto_id uuid,cantidad integer,precio_remision numeric,factura_proveedor_id uuid);
 create table remision_margenes(id uuid default gen_random_uuid(),remision_item_id uuid references remision_items,unidad_id uuid,costo_oscar numeric,factura_proveedor_id uuid,cantidad integer);
 create table unidades(id uuid primary key default gen_random_uuid(),producto_id uuid,imei text,estado text,tienda_actual text,costo_remision numeric,precio_tienda numeric,factura_proveedor_id uuid,remision_item_id uuid references remision_items,created_at timestamptz default now());
 create table facturas_proveedor(id uuid primary key,fecha date);
 insert into facturas_proveedor values ('${f}','2026-09-11');
 create table movimientos(id bigint generated always as identity primary key,tipo text,tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad integer,costo numeric,precio numeric,referencia_tipo text,referencia_id text,usuario uuid,nota text);
 create table stock_cantidad(producto_id uuid,tienda_codigo text,cantidad integer,costo_promedio numeric,precio_tienda numeric,factura_proveedor_id uuid,updated_at timestamptz);
 create table stock_cantidad_lotes(id uuid default gen_random_uuid(),movimiento_entrada_id bigint unique references movimientos,producto_id uuid,tienda_codigo text,factura_proveedor_id uuid,cantidad integer check(cantidad>=0),costo_unitario numeric,precio_tienda numeric,created_at timestamptz default now(),updated_at timestamptz);
 create table ajustes_inventario(tienda_codigo text,producto_id uuid,diferencia integer,motivo text,estado text,solicitado_por uuid);
 create table cuenta_corriente(tienda_codigo text,tipo text,concepto text,monto numeric,referencia_tipo text,referencia_id text,usuario uuid);
 create function aplicar_costo_promedio_tienda(text,uuid,integer,numeric,numeric,text,text,text) returns void language sql as $$select$$;
 grant usage on schema public,auth to authenticated;
 grant execute on all functions in schema public,auth to authenticated;
 grant select,insert,update,delete on all tables in schema public to authenticated;
 `);
 await db.exec(sql);
 const r=(await db.query("insert into remisiones(tienda_codigo,estado) values('CK-02','despachada') returning id")).rows[0].id;
 const i=(await db.query("insert into remision_items(remision_id,producto_id,cantidad,precio_remision,factura_proveedor_id) values($1,$2,1,120,$3) returning id",[r,p,f])).rows[0].id;
 await db.query("insert into unidades(producto_id,estado,tienda_actual,costo_remision,precio_tienda,factura_proveedor_id,remision_item_id) values($1,'en_traslado','CENTRAL',80,120,$2,$3)",[p,f,i]);
 await db.query("insert into remision_margenes(remision_item_id,unidad_id,costo_oscar,factura_proveedor_id,cantidad) select $1,id,80,$2,1 from unidades",[i,f]);
 await db.query("insert into stock_cantidad values($1,'CENTRAL',10,20,30,$2,now())",[q,f]);
 await db.query("insert into stock_cantidad_lotes(producto_id,tienda_codigo,factura_proveedor_id,cantidad,costo_unitario,precio_tienda) values($1,'CENTRAL',$2,10,20,30)",[q,f]);
 return {db,r,i};
}
async function edit(db,r,revision,items){
 return db.query('select public.corregir_remision_despachada($1,$2,$3::jsonb,$4) as result',[r,revision,JSON.stringify(items),'Corrección de prueba']);
}
test('Maite corrige precio sin cambiar factura, unidad ni costo; revisión y auditoría',async()=>{
 const {db,r,i}=await fixture();try{
  await db.exec('set role authenticated');
  await edit(db,r,0,[{id:i,producto_id:p,cantidad:1,precio_remision:150}]);
  await assert.rejects(edit(db,r,0,[{id:i,producto_id:p,cantidad:1,precio_remision:160}]),/cambió/);
  await db.exec('reset role');
  assert.equal((await db.query('select precio_remision from remision_items')).rows[0].precio_remision,'150');
  assert.equal((await db.query('select costo_oscar from remision_margenes')).rows[0].costo_oscar,'80');
  assert.equal((await db.query('select remision_item_id from unidades')).rows[0].remision_item_id,i);
  assert.equal((await db.query('select count(*)::int n from remisiones_edicion_private.historial')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from cuenta_corriente')).rows[0].n,0);
 }finally{await db.close();}
});
test('referencia/cantidad ajustan reserva; stock insuficiente revierte TODO',async()=>{
 const {db,r,i}=await fixture();try{
  await assert.rejects(edit(db,r,0,[{id:i,producto_id:q,cantidad:99,precio_remision:35}]),/Stock insuficiente/);
  assert.equal((await db.query('select estado from unidades')).rows[0].estado,'en_traslado');
  await edit(db,r,0,[{id:i,producto_id:q,cantidad:3,precio_remision:35}]);
  assert.equal((await db.query('select cantidad from stock_cantidad')).rows[0].cantidad,7);
  assert.equal((await db.query('select estado from unidades')).rows[0].estado,'disponible');
  const newId=(await db.query('select id from remision_items')).rows[0].id;
  await edit(db,r,1,[{id:newId,producto_id:q,cantidad:2,precio_remision:36}]);
  assert.equal((await db.query('select cantidad from stock_cantidad')).rows[0].cantidad,8);
  assert.equal((await db.query('select sum(cantidad)::int n from stock_cantidad_lotes')).rows[0].n,8);
  assert.equal((await db.query('select costo_oscar from remision_margenes')).rows[0].costo_oscar,'20');
 }finally{await db.close();}
});
test('permiso acotado; no editar recibidas ni saltar RPC; recepción rechaza versión vieja',async()=>{
 const {db,r,i}=await fixture();try{
  await db.query("select set_config('app.uid',$1,false)",[other]);
  await assert.rejects(edit(db,r,0,[{id:i,producto_id:p,cantidad:1,precio_remision:150}]),/permiso/);
  await db.query("select set_config('app.uid',$1,false)",[uid]);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('update remision_items set precio_remision=1 where id=$1',[i]),/Usa Corregir/);
  await assert.rejects(db.query("update remisiones set estado='borrador' where id=$1",[r]),/no se puede reabrir/);
  await edit(db,r,0,[{id:i,producto_id:p,cantidad:1,precio_remision:150}]);
  await assert.rejects(db.query('select confirmar_recepcion_remision($1,$2)',[r,JSON.stringify([{remision_item_id:i,imeis:['123456789012345'],revision:0}])]),/fue corregida/);
  await db.query('select confirmar_recepcion_remision($1,$2)',[r,JSON.stringify([{remision_item_id:i,imeis:['123456789012345'],revision:1}])]);
  await assert.rejects(edit(db,r,1,[{id:i,producto_id:p,cantidad:1,precio_remision:160}]),/antes de que la tienda/);
  await db.exec('reset role');
  assert.equal((await db.query('select monto from cuenta_corriente')).rows[0].monto,'150');
  assert.equal((await db.query('select precio_tienda from unidades')).rows[0].precio_tienda,'150');
 }finally{await db.close();}
});
