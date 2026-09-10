import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('crear tarifa por operación: vigencia, permiso, duplicados y protección del lote',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema krediya_private;
 create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'yes')='yes'$$;
 create table liquidations(id uuid primary key default gen_random_uuid(),frozen_at timestamptz);
 create table liquidation_operations(id uuid primary key default gen_random_uuid(),liquidation_id uuid,plataforma text,referencia text,modelo text,reconocida boolean,operation_at timestamptz);
 create table krediya_price_rules(id uuid primary key default gen_random_uuid(),referencia_clave text,referencia text,precio_venta numeric,pagamos numeric,vigente_desde date,creado_por uuid,actualizado_por uuid,activo boolean default true);
 create table audit_log(usuario uuid,accion text,tabla text,registro_id text,detalle jsonb);
 insert into liquidations default values;
 insert into liquidation_operations(liquidation_id,plataforma,referencia,reconocida,operation_at) select id,'krediya','MOTOROLA EDGE 50 FUSION 5G 256GB 8RAM',true,'2026-09-02 12:00-05' from liquidations;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260910204018_krediya_tarifa_desde_operacion.sql','utf8'));
 const id=(await db.query('select id from liquidation_operations')).rows[0].id;
 await assert.rejects(db.query("select krediya_crear_tarifa_operacion($1,100,80,'2026-09-03')",[id]),/vigencia/);
 await db.exec("set test.allowed='no'");await assert.rejects(db.query("select krediya_crear_tarifa_operacion($1,100,80,'2026-09-01')",[id]),/No autorizado/);
 await db.exec("set test.allowed='yes'");await db.query("select krediya_crear_tarifa_operacion($1,100,80,'2026-09-01')",[id]);
 await assert.rejects(db.query("select krediya_crear_tarifa_operacion($1,100,80,'2026-09-01')",[id]),/no se duplicó/);
 assert.equal((await db.query('select count(*) n from krediya_price_rules')).rows[0].n,1);
 await db.exec('update liquidations set frozen_at=now()');await assert.rejects(db.query("select krediya_crear_tarifa_operacion($1,100,80,'2026-09-01')",[id]),/aprobada/);
 }finally{await db.close();}
});
test('tarjetas exponen datos y utilidad, con filtro y editor por referencia, sin exigir incidente',()=>{
 const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
 assert.match(app,/Crear datos · PVP y PAGAMOS/);assert.match(app,/openOperationTariff\(button.dataset.openTariff/);
 assert.match(app,/metric\('Utilidad después de bonos, gasto financiero y provisión'/);
 assert.match(app,/Falta PVP o PAGAMOS/);assert.match(app,/Calcular utilidades del lote/);
 const editor=fs.readFileSync('creditek/erp/krediya-tarifario.js','utf8');
 assert.match(editor,/Guardar datos de la referencia/);assert.match(editor,/krediya_crear_tarifa_operacion/);
});
