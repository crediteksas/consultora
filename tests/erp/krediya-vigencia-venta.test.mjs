import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('Krediya selecciona tarifa por venta en Bogotá, no por importación tardía',async()=>{
 const db=await PGlite.create();
 try {
  await db.exec(`create schema auth;
  create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
  create function tiene_capacidad_aliados(text) returns boolean language sql as $$select true$$;
  create table liquidation_operations(id uuid default gen_random_uuid(),plataforma text,referencia text,modelo text,operation_at timestamptz,created_at timestamptz default now(),policy_snapshot jsonb);
  create table krediya_price_rules(id uuid default gen_random_uuid(),referencia_clave text,referencia text,precio_venta numeric,pagamos numeric,activo boolean default true,vigente_desde date,vigente_hasta date,created_at timestamptz default now());
  insert into krediya_price_rules(referencia_clave,referencia,precio_venta,pagamos,vigente_desde,vigente_hasta) values
  ('ref:equipo','Equipo',800000,600000,'2026-08-01','2026-08-30'),
  ('ref:equipo','Equipo',900000,650000,'2026-08-31',null);`);
  const sql=fs.readFileSync('supabase/migrations/20260904231510_krediya_editor_diferencias.sql','utf8');
  await db.exec(sql.slice(sql.indexOf('create or replace function public.krediya_precio_efectivo'),sql.indexOf('create or replace function public.aliados_contexto_precio_krediya')));
  for(const [sale,expected] of [['2026-08-31T04:59:59Z',600000],['2026-08-31T05:00:00Z',650000],['2026-08-15T12:00:00Z',600000]]){
   const {rows:[o]}=await db.query("insert into liquidation_operations(plataforma,referencia,operation_at,created_at) values('krediya','Equipo',$1,'2026-09-07T12:00:00Z') returning id",[sale]);
   const {rows:[price]}=await db.query('select (krediya_precio_efectivo($1)).pagamos as pagamos',[o.id]);
   assert.equal(Number(price.pagamos),expected);
  }
 } finally {await db.close();}
});
