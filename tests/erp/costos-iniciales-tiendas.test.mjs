import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../../supabase/migrations/20260914223020_corregir_costos_carga_inicial_tiendas.sql',import.meta.url),'utf8');
test('Costos iniciales: todas las tiendas, sin alterar cantidades ni costo interno; remisiones intactas',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create schema kora_private;
 create schema auth; create function auth.uid() returns int language sql as $$select 1$$;
 create table perfiles(id int,activo boolean,rol text,tienda_codigo text);
 insert into perfiles values(1,true,'gerencia',null);
 create table movimientos(id bigint,tipo text,tienda_codigo text,producto_id int,unidad_id int,cantidad int,costo numeric,precio numeric,costo_tienda numeric,referencia_id text);
 create table stock_cantidad(producto_id int,tienda_codigo text,cantidad int,costo_promedio numeric,precio_tienda numeric);
 create table unidades(id int,tienda_actual text,precio_tienda numeric);
 create table ventas(id int,tienda_codigo text,fecha date);
 create table venta_items(id int,venta_id int,producto_id int,unidad_id int,costo_tienda_congelado numeric,estado_costo_tienda text);
 create table periodos(tienda_codigo text,fecha_inicio date,fecha_fin date);
 insert into movimientos select i,'carga_inicial','T'||i,1,null,10,7300,16000,null,null from generate_series(1,10)i;
 insert into stock_cantidad select 1,'T'||i,9,7300,16000 from generate_series(1,10)i;
 insert into ventas select i,'T'||i,'2026-09-11' from generate_series(1,10)i;
 insert into venta_items select i,i,1,null,16000,'trazable' from generate_series(1,10)i;
 insert into movimientos values(20,'remision_entrada','R',2,null,2,100,110,null,null);
 insert into stock_cantidad values(2,'R',2,100,110);
 alter table movimientos add referencia_tipo text,add reverso_de bigint,add usuario int,add nota text,add created_at timestamptz;
 alter table venta_items add cantidad int default 1;
 begin;`);
 await db.exec(sql);
 await db.exec('commit');
 const {rows}=await db.query("select * from stock_cantidad where producto_id=1");
 assert.equal(rows.length,10);
 for(const r of rows){assert.equal(Number(r.precio_tienda),7300);assert.equal(r.cantidad,9);assert.equal(Number(r.costo_promedio),7300);}
 assert.equal(Number((await db.query("select precio_tienda from stock_cantidad where tienda_codigo='R'")).rows[0].precio_tienda),110);
 assert.equal((await db.query('select count(*)::int n from venta_items where costo_tienda_congelado=7300')).rows[0].n,10);
 assert.equal((await db.query("select count(*)::int n from movimientos_tienda_lectura where tipo='carga_inicial' and costo=7300")).rows[0].n,10);
 assert.equal((await db.query("select count(*)::int n from movimientos where tipo='carga_inicial' and costo_tienda is null")).rows[0].n,10);
 } finally {await db.close();}
});
