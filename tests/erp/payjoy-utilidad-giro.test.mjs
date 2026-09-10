import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=fs.readFileSync('supabase/migrations/20260910201927_payjoy_utilidad_sobre_giro_efectivo.sql','utf8');
test('corrige solo utilidad de cinco filas; preserva pagos, bonos e histórico y actualiza fórmula',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema kora_private;
 create table liquidations(id uuid primary key default gen_random_uuid(),plataforma text,created_at timestamptz,estado text,frozen_at timestamptz,total_utilidad_creditek numeric,total_utilidad_tiendas numeric);
 create table liquidation_operations(id uuid primary key default gen_random_uuid(),liquidation_id uuid,operation_at timestamptz,tipo_establecimiento text,monto_credito numeric,monto_base numeric,inicial numeric,utilidad_creditek numeric,utilidad_creditek_tienda numeric);
 create table liquidation_calculations(id uuid primary key default gen_random_uuid(),liquidation_id uuid,operation_id uuid,pagamos numeric,pago_aliado numeric,total_bonos numeric,utilidad_creditek numeric,explanation jsonb default '{}');
 create table payment_orders(id int,valor numeric,soporte text);insert into payment_orders values(1,496000,'inalterado');
 create table payment_items(id int,valor numeric);insert into payment_items values(1,496000);
 create table liquidation_bonuses(id int,valor numeric);insert into liquidation_bonuses values(1,25000);
 create table audit_log(accion text,tabla text,registro_id uuid,detalle jsonb);
 create function kora_private.calcular_liquidacion_sin_datos_pago(p_id uuid) returns numeric language plpgsql as $$
 declare v record;o record;v_util numeric;v_pago numeric:=496000;v_bonus numeric:=25000;v_base numeric:=800000;v_pagamos numeric:=616000;
 begin select * into v from liquidations where id=p_id;select 'payjoy'::text plataforma,800000::numeric monto_credito,800000::numeric monto_base into o;
 v_util:=round(case when o.plataforma='alo' then coalesce(o.monto_credito,o.monto_base)-v_pago-v_bonus else v_base-v_pagamos-v_bonus end,2);
 return v_util;end;$$;
 insert into liquidations(plataforma,created_at,estado,total_utilidad_creditek,total_utilidad_tiendas) values('payjoy','2026-09-10 10:00-05','revisada',795000,0),('payjoy','2026-09-09 10:00-05','revisada',159000,0);
 insert into liquidation_operations(liquidation_id,operation_at,tipo_establecimiento,monto_credito,inicial,utilidad_creditek)
 select l.id,'2026-09-09 10:00-05','aliado',800000,120000,159000 from liquidations l cross join generate_series(1,5) s where l.created_at>'2026-09-10';
 insert into liquidation_calculations(liquidation_id,operation_id,pagamos,pago_aliado,total_bonos,utilidad_creditek) select liquidation_id,id,616000,496000,25000,159000 from liquidation_operations;`);
 await db.exec(migration);
 const rows=(await db.query('select * from liquidation_calculations')).rows;
 assert.equal(rows.length,5);for(const c of rows){assert.equal(Number(c.utilidad_creditek),279000);assert.equal(Number(c.pago_aliado),496000);assert.equal(Number(c.pagamos),616000);assert.equal(Number(c.total_bonos),25000);}
 const l=(await db.query('select *,kora_private.calcular_liquidacion_sin_datos_pago(id) formula from liquidations order by created_at')).rows;
 assert.equal(Number(l[0].formula),159000);assert.equal(Number(l[0].total_utilidad_creditek),159000);
 assert.equal(Number(l[1].formula),279000);assert.equal(Number(l[1].total_utilidad_creditek),1395000);
 assert.deepEqual((await db.query('select * from payment_orders')).rows,[{id:1,valor:'496000',soporte:'inalterado'}]);
 assert.equal((await db.query('select * from audit_log')).rows.length,1);
 }finally{await db.close();}
});
