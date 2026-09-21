import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('consulta de existencias no entrega costos ni permite acceso anónimo o inactivo',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema kora_private;
 grant usage on schema kora_private,auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create table perfiles(id uuid,rol text,activo boolean,tienda_codigo text);
 create table origenes(codigo text,nombre text,activo boolean,tipo text);
 create table productos(id uuid,activo boolean,tipo text);
 create table stock_cantidad(producto_id uuid,tienda_codigo text,cantidad integer,costo_promedio numeric);
 insert into perfiles values('00000000-0000-0000-0000-000000000001','admin_tienda',true,'A');
 insert into origenes values('A','Propia',true,'propia'),('B','Otra',true,'propia');
 insert into productos values('00000000-0000-0000-0000-000000000002',true,'cantidad');
 insert into stock_cantidad values('00000000-0000-0000-0000-000000000002','A',2,100),('00000000-0000-0000-0000-000000000002','B',3,100);`);
 await db.exec(readFileSync('supabase/migrations/20260921173402_traslados_consulta_existencias_tiendas.sql','utf8'));
 await db.exec(`set role authenticated;select set_config('app.uid','00000000-0000-0000-0000-000000000001',false);`);
 const {rows}=await db.query('select * from public.traslados_existencias_consulta()');
 assert.equal(rows.length,2);assert.deepEqual(Object.keys(rows[0]),['producto_id','tienda_codigo','tienda_nombre','cantidad']);
 await db.exec(`reset role;update perfiles set activo=false;set role authenticated;`);
 assert.equal((await db.query('select * from public.traslados_existencias_consulta()')).rows.length,0);
 await db.exec(`select set_config('app.uid','',false);`);
 assert.equal((await db.query('select * from public.traslados_existencias_consulta()')).rows.length,0);
 await db.exec('reset role;set role anon;');
 await assert.rejects(db.query('select * from public.traslados_existencias_consulta()'),/permission denied/);
 }finally{await db.close();}
});
