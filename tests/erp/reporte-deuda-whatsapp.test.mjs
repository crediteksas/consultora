import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=await readFile(new URL('../../supabase/migrations/20261015031503_reporte_confirmaciones_deuda_whatsapp.sql',import.meta.url),'utf8');
test('reserva diaria: corte Colombia, roles, contenido fijo y reintentos',async()=>{
 const db=await PGlite.create();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema kora_private;
 create table kora_private.confirmacion_deuda_config(id boolean,inicio date);
 insert into kora_private.confirmacion_deuda_config values(true,'2026-10-15');
 create table perfiles(id uuid,nombre text,rol text,tienda_codigo text,activo boolean);
 create table origenes(codigo text,nombre text,activo boolean);
 create table confirmaciones_deuda_tienda(id uuid,usuario_id uuid,tienda_codigo text,fecha date,saldo_sistema numeric,saldo_declarado numeric,diferencia numeric,confirmado_at timestamptz,revisado_at timestamptz);
 insert into origenes values('A','Tolú',true);
 insert into perfiles values('11111111-1111-4111-8111-111111111111','Ana','admin_tienda','A',true),('22222222-2222-4222-8222-222222222222','Bea','admin_tienda','A',true);
 insert into confirmaciones_deuda_tienda values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','A','2026-10-15',100,100,0,'2026-10-15 10:00-05',null);
 create function public.test_clock() returns timestamptz language sql as $$select current_setting('test.clock')::timestamptz$$;
 set test.clock='2026-10-15 14:59:59-05';`);
 await db.exec(migration.replaceAll('clock_timestamp()','public.test_clock()'));
 const clock=async v=>db.query("select set_config('test.clock',$1,false)",[v]);
 const reserve=async()=>(await db.query('select public.reservar_reporte_deuda() r')).rows[0].r;
 await db.exec('set role anon');await assert.rejects(reserve(),/permission denied/);await db.exec('reset role; set role authenticated');await assert.rejects(reserve(),/permission denied/);
 await assert.rejects(db.query('select * from reportes_deuda_enviados'),/permission denied/);
 await db.exec('reset role; set role service_role');assert.equal(await reserve(),null);
 await clock('2026-10-15 15:00:00-05');const r=await reserve();assert.equal(r.fecha,'2026-10-15');assert.equal(r.contenido.diarias.length,2);assert.equal(r.contenido.diarias[1].confirmacion,null);
 assert.equal(await reserve(),null);
 await db.exec('reset role');await db.exec("update reportes_deuda_enviados set status='error'; update confirmaciones_deuda_tienda set saldo_sistema=999");
 await db.exec('set role service_role');const retry=await reserve();assert.deepEqual(retry.contenido,r.contenido);assert.notEqual(retry.token,r.token);assert.equal(retry.attempts,2);
 await db.exec("reset role; update reportes_deuda_enviados set status='uncertain'; set role service_role");assert.equal(await reserve(),null);
 await clock('2026-10-18 15:00:00-05');const sunday=await reserve();assert.equal(sunday.fecha,'2026-10-18');assert.ok(sunday.contenido.diarias.every(f=>f.confirmacion===null));
 await clock('2026-10-19 15:05:00-05');await db.exec("reset role; insert into confirmaciones_deuda_tienda values('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','A','2026-10-19',500,500,0,'2026-10-19 15:01-05',null); set role service_role");
 assert.ok((await reserve()).contenido.diarias.every(f=>f.confirmacion===null));
 await clock('2026-10-20 20:00:00-05');assert.equal(await reserve(),null);
 } finally {await db.close();}
});
