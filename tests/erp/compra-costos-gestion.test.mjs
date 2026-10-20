import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('costos de compra: solo Gestión, última factura vigente y sin inventar costos', async()=>{
 const db=await PGlite.create();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table perfiles(id uuid,activo boolean,rol text);
 create table facturas_proveedor(id uuid,numero text,fecha date);
 create table movimientos(id bigint,tipo text,producto_id uuid,costo numeric,precio numeric,cantidad int,referencia_tipo text,referencia_id text,reverso_de bigint,created_at timestamptz);
 insert into perfiles values('00000000-0000-0000-0000-000000000001',true,'auditoria');
 insert into facturas_proveedor values('00000000-0000-0000-0000-000000000002','F-1','2026-10-19');
 insert into movimientos values(1,'compra_entrada','00000000-0000-0000-0000-000000000003',1250.25,1800,2,'factura_proveedor','00000000-0000-0000-0000-000000000002',null,now());
 `);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261020200428_compra_referencia_costos_gestion.sql',import.meta.url),'utf8'));
 const query="select public.compra_referencia_costos_gestion('00000000-0000-0000-0000-000000000003') r";
 await assert.rejects(db.query(query),/Solo Gestión/);
 await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'");
 assert.equal((await db.query(query)).rows[0].r.costo,1250.25);
 await db.exec("update perfiles set rol='admin_tienda'");
 await assert.rejects(db.query(query),/Solo Gestión/);
 await db.exec("update perfiles set rol='auditoria',activo=false");
 await assert.rejects(db.query(query),/Solo Gestión/);
 await db.exec("update perfiles set activo=true; insert into movimientos(id,tipo,reverso_de) values(2,'reverso',1)");
 assert.equal((await db.query(query)).rows[0].r,null);
 assert.equal((await db.query("select has_function_privilege('anon','public.compra_referencia_costos_gestion(uuid)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close()}
});
