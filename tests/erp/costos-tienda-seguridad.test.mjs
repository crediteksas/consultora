import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const read = name => readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
const migration=await read('20260914164745_costos_tienda_lecturas_seguras.sql');
const acl=await read('20260914161928_costos_internos_restringir_columnas.sql');
test('costos: aislamiento por tienda, columnas privadas y utilidad de remisión',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`
 create role anon; create role authenticated; create schema auth; create schema kora_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.perfiles(id uuid primary key,activo boolean,rol text,tienda_codigo text);
 create function public.es_central() returns boolean language sql stable security definer as $$select coalesce((select activo and rol in ('gerencia','auditoria') from perfiles where id=auth.uid()),false)$$;
 create function public.tienda_actual() returns text language sql stable security definer as $$select tienda_codigo from perfiles where id=auth.uid() and activo$$;
 create table public.unidades(id uuid primary key,producto_id uuid,imei text,estado text,tienda_actual text,costo_remision numeric,remision_item_id uuid,created_at timestamptz,factura_proveedor_id uuid,precio_tienda numeric);
 create table public.stock_cantidad(producto_id uuid,tienda_codigo text,cantidad integer,costo_promedio numeric,updated_at timestamptz,precio_tienda numeric,factura_proveedor_id uuid);
 create table public.ventas(id uuid primary key,tienda_codigo text);
 create table public.venta_items(id uuid primary key,venta_id uuid,producto_id uuid,unidad_id uuid,cantidad integer,precio_venta numeric,costo_congelado numeric,utilidad numeric,costo_tienda_congelado numeric,estado_costo_tienda text,costo_remision_congelado numeric);
 create table public.movimientos(id bigint primary key,tipo text,tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad integer,costo numeric,precio numeric,referencia_tipo text,referencia_id text,reverso_de bigint,usuario uuid,nota text,created_at timestamptz);
 create table public.traslados(id uuid primary key,tienda_origen text,tienda_destino text);
 create table public.traslado_items(id uuid primary key,traslado_id uuid,producto_id uuid,unidad_id uuid,cantidad integer,costo numeric,precio_tienda numeric);
 create view public.utilidad_creditek_detalle as select 1 as n;
 create view public.utilidad_creditek_rango as select 1 as n;
 create view public.utilidad_creditek_por_periodo as select 1 as n;
 grant usage on schema public,auth to authenticated;
 grant select on all tables in schema public to authenticated;
 alter table unidades enable row level security;
 create policy own on unidades for select to authenticated using(es_central() or tienda_actual=public.tienda_actual());
 alter table stock_cantidad enable row level security;
 create policy own on stock_cantidad for select to authenticated using(es_central() or tienda_codigo=public.tienda_actual());
 alter table movimientos enable row level security;
 create policy own on movimientos for select to authenticated using(es_central() or tienda_codigo=public.tienda_actual());
 alter table ventas enable row level security;
 create policy own on ventas for select to authenticated using(es_central() or tienda_codigo=public.tienda_actual());
 alter table venta_items enable row level security;
 create policy own on venta_items for select to authenticated using(es_central() or exists(select 1 from ventas where id=venta_id and tienda_codigo=public.tienda_actual()));
 alter table traslado_items enable row level security;
 create policy own on traslado_items for select to authenticated using(es_central() or exists(select 1 from traslados where id=traslado_id and public.tienda_actual() in (tienda_origen,tienda_destino)));
 `);
 await db.exec(migration);
 await db.exec(acl);
 await db.exec(`
 alter table perfiles add nombre text default 'Prueba';
 create function public.rol_actual() returns text language sql stable security definer as $$select rol from perfiles where id=auth.uid() and activo$$;
 alter table ventas add fecha date default '2026-09-14', add total numeric default 150, add anulada boolean default false, add vendedor uuid;
 create table periodos(id uuid default gen_random_uuid(),tienda_codigo text,fecha_inicio date,fecha_fin date,inventario_inicial numeric,inventario_final numeric,ventas_totales numeric,costo_vendido numeric,gastos_totales numeric,perdidas_ajustes numeric,ganancias_ajustes numeric,ajuste_conciliacion numeric,utilidad_neta numeric,cerrado_por uuid);
 create table caja_diaria(tienda_codigo text,fecha date,estado text);
 create table ajustes_inventario(tienda_codigo text,estado text,created_at timestamptz);
 create table conceptos_gasto(id uuid,preautorizado boolean);
 create table gastos(tienda_codigo text,fecha date,concepto_id uuid,monto numeric,estado text);
 create table creditos(venta_id uuid,estado_conciliacion text,valor_real_financiera numeric,valor_esperado_financiera numeric,conciliado_at timestamptz);
 create table comisiones(periodo_id uuid,perfil_id uuid,rol text,porcentaje numeric,base_ventas numeric,monto numeric);
 insert into periodos(tienda_codigo,fecha_inicio,fecha_fin,utilidad_neta) values('T1','2026-08-01','2026-08-31',777);
 insert into comisiones(monto) values(77);
 insert into caja_diaria values('T1','2026-09-14','cerrada');
 `);
 const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
 for(let i=1;i<=10;i++){
 await db.query("insert into perfiles(id,activo,rol,tienda_codigo) values($1,true,'admin_tienda',$2)",[id(i),'T'+i]);
 await db.query("insert into unidades(id,producto_id,tienda_actual,costo_remision,precio_tienda) values($1,$1,$2,100,110)",[id(i),'T'+i]);
 await db.query("insert into stock_cantidad(producto_id,tienda_codigo,cantidad,costo_promedio,precio_tienda) values($1,$2,2,100,110)",[id(i),'T'+i]);
 await db.query("insert into ventas(id,tienda_codigo) values($1,$2)",[id(i),'T'+i]);
 await db.query("insert into venta_items values($1,$1,$1,$1,1,150,100,50,110,'trazable',100)",[id(i)]);
 await db.query("insert into movimientos(id,tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,referencia_id) values($1,'venta',$2,$3::uuid,$3::uuid,1,100,150,$3::text)",[i,'T'+i,id(i)]);
 }
 await db.exec("insert into perfiles(id,activo,rol,tienda_codigo) values('"+id(99)+"',true,'gerencia',null)");
 for(let i=1;i<=10;i++){
 await db.exec("set role authenticated; set request.jwt.claim.sub='"+id(i)+"'");
 const units=(await db.query('select * from unidades_lectura')).rows;
 assert.equal(units.length,1);assert.equal(units[0].tienda_actual,'T'+i);
 assert.equal(Number(units[0].costo_remision),110);
 assert.equal(Number((await db.query('select costo_promedio from stock_cantidad_lectura')).rows[0].costo_promedio),110);
 const vi=(await db.query('select * from venta_items_lectura')).rows[0];
 assert.equal(Number(vi.costo_congelado),110);assert.equal(Number(vi.utilidad),40);
 assert.equal(vi.costo_remision_congelado,null);
 assert.equal(Number((await db.query('select costo from movimientos_lectura')).rows[0].costo),110);
 for(const [table,col] of [['unidades','costo_remision'],['stock_cantidad','costo_promedio'],['venta_items','utilidad'],['venta_items','costo_congelado'],['venta_items','costo_remision_congelado'],['movimientos','costo'],['traslado_items','costo']]){
  await assert.rejects(db.query('select '+col+' from '+table),/permission denied/);
 }
 assert.equal((await db.query("select kora_private.costo_interno_lectura('unidades',$1) costo",[id(i)])).rows[0].costo,null);
 await db.exec('reset role');
 }
 await db.exec("set role authenticated; set request.jwt.claim.sub='"+id(99)+"'");
 assert.equal(Number((await db.query('select costo_remision from unidades_lectura limit 1')).rows[0].costo_remision),100);
 assert.equal(Number((await db.query('select utilidad from venta_items_lectura limit 1')).rows[0].utilidad),40);
 const resumen=(await db.query("select calcular_resumen_periodo('T1','2026-09-14','2026-09-14') as r")).rows[0].r;
 assert.equal(resumen.costo_vendido,110);
 assert.equal(resumen.utilidad_neta,40);
 const cierre=(await db.query("select cerrar_periodo('T1','2026-09-14','2026-09-14') as r")).rows[0].r;
 assert.equal(cierre.costo_vendido,110);
 assert.equal(cierre.utilidad_neta,40);
 assert.equal(cierre.comisiones[0].monto,4);
 await db.exec('reset role');
 assert.equal(Number((await db.query("select utilidad_neta from periodos where fecha_inicio='2026-08-01'")).rows[0].utilidad_neta),777);
 assert.equal(Number((await db.query("select monto from comisiones where periodo_id is null")).rows[0].monto),77);
 await db.exec("reset role; update perfiles set activo=false where id='"+id(1)+"'; set role authenticated; set request.jwt.claim.sub='"+id(1)+"'");
 assert.equal((await db.query('select * from unidades_lectura')).rows.length,0);
 await db.exec('reset role; set role anon');
 await assert.rejects(db.query('select * from unidades_lectura'),/permission denied/);
 } finally {await db.close();}
});
