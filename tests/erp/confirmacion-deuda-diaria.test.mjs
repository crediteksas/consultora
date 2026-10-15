import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
const migration=await readFile(new URL('../../supabase/migrations/20261015011547_confirmacion_diaria_deuda_tienda.sql',import.meta.url),'utf8');
const admin='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',central='33333333-3333-4333-8333-333333333333',same='44444444-4444-4444-8444-444444444444';
test('confirmación diaria: permisos, fecha Colombia, diferencias, versión y bloqueo',async t=>{
 const db=await PGlite.create();
 const row=async(q,args=[])=>(await db.query(q,args)).rows[0];
 const clock=async v=>db.query("select set_config('test.clock',$1,false)",[v]);
 const actor=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const state=async()=>(await row('select estado_confirmacion_deuda_tienda() s')).s;
 const confirm=async(s,amount=s.saldo,note=null,id=randomUUID())=>(await row('select confirmar_deuda_tienda($1,$2,$3,$4,$5) c',[id,s.fecha,s.version,amount,note])).c;
 const guard=async(method='POST',path='/rpc/registrar_venta')=>{await db.query("select set_config('request.method',$1,false),set_config('request.path',$2,false)",[method,path]);return db.exec('select public.kora_confirmacion_deuda_pre_request()');};
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema kora_private;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;
 create table perfiles(id uuid primary key,nombre text,rol text,tienda_codigo text,activo boolean);
 create table origenes(codigo text primary key,nombre text,activo boolean);
 create table cuenta_corriente(id bigserial primary key,tienda_codigo text,tipo text,monto numeric);
 insert into origenes values('A','Tienda A',true),('B','Tienda B',true);
 insert into perfiles values('${admin}','Admin A','admin_tienda','A',true),('${other}','Admin B','admin_tienda','B',true),('${central}','Gestión','auditoria',null,true),('${same}','Segundo admin A','admin_tienda','A',true);
 insert into cuenta_corriente(tienda_codigo,tipo,monto) values('A','cargo',1000),('A','abono',200),('B','cargo',9000);
 grant select on perfiles to authenticated;
 create function public.test_clock() returns timestamptz language sql as $$ select current_setting('test.clock')::timestamptz $$;
 set test.clock='2026-10-16 10:59:59-05';`);
 await db.exec(migration.replaceAll('clock_timestamp()','public.test_clock()'));
 await db.exec("update kora_private.confirmacion_deuda_config set inicio='2026-10-16'");await actor(admin);
 await t.test('a las 10:59 permite operar, a las 11 bloquea escrituras y conserva consulta',async()=>{
 let s=await state();assert.equal(s.saldo,800);assert.equal(s.pendiente,true);assert.equal(s.bloqueada,false);await guard();
 await clock('2026-10-16 11:00:00-05');s=await state();assert.equal(s.bloqueada,true);
 await assert.rejects(guard(),/Confirma la deuda/);await assert.rejects(guard('PATCH','/ventas'),/Confirma la deuda/);
 await guard('GET','/cuenta_corriente');await guard('POST','/rpc/estado_confirmacion_deuda_tienda');await guard('POST','/rpc/confirmar_deuda_tienda');
 });
 await t.test('versión obsoleta rechazada y diferencia requiere explicación',async()=>{
 const s=await state();await db.exec("insert into cuenta_corriente(tienda_codigo,tipo,monto) values('A','cargo',20)");
 await assert.rejects(confirm(s),/cartera cambió/);const fresh=await state();assert.equal(fresh.saldo,820);
 await assert.rejects(confirm(fresh,810),/Explica la diferencia/);
 await assert.rejects(confirm({...fresh,fecha:'2026-10-15'}),/fecha y el saldo/);
 });
 let saved;
 await t.test('reportar diferencia desbloquea solo a ese administrador y no mueve dinero',async()=>{
 const before=(await row('select count(*) n,sum(monto) total from cuenta_corriente'));
 const s=await state();saved=await confirm(s,810,'Falta aplicar un abono');assert.equal(saved.diferencia,-10);
 assert.equal((await state()).pendiente,false);await guard();
 assert.deepEqual(await row('select count(*) n,sum(monto) total from cuenta_corriente'),before);
 assert.equal((await confirm(s,810,'Falta aplicar un abono',saved.id)).id,saved.id);
 await assert.rejects(confirm(s),/Ya registraste/);
 await actor(same);assert.equal((await state()).pendiente,true);await assert.rejects(guard(),/Confirma la deuda/);
 await actor(other);assert.equal((await state()).saldo,9000);await assert.rejects(guard(),/Confirma la deuda/);
 });
 await t.test('RLS: tienda no ve reportes ajenos ni escribe directamente; solo central revisa',async()=>{
 await db.exec('set role authenticated');assert.equal((await row('select count(*) n from confirmaciones_deuda_tienda')).n,0);
 await assert.rejects(db.exec("insert into confirmaciones_deuda_tienda(id) values(gen_random_uuid())"),/permission denied/);
 await assert.rejects(db.query('select revisar_confirmacion_deuda($1,$2)',[saved.id,'Revisado por tienda']),/Solo Gestión/);
 await assert.rejects(db.query('select listar_confirmaciones_deuda($1)',['2026-10-16']),/Solo Gestión/);
 await db.exec('reset role');await actor(central);await guard();
 const data=(await row("select listar_confirmaciones_deuda('2026-10-16') s")).s;assert.equal(data.diarias.length,3);assert.equal(data.diferencias.length,1);
 await db.query('select revisar_confirmacion_deuda($1,$2)',[saved.id,'Comprobante revisado; ajuste se gestiona por separado']);
 assert.equal((await row("select listar_confirmaciones_deuda('2026-10-16') s")).s.diferencias.length,0);
 await assert.rejects(db.query('select revisar_confirmacion_deuda($1,$2)',[saved.id,'Otra revisión']),/ya revisada/);
 });
 await t.test('cambio de día usa Bogotá; sábado y domingo también requieren nueva confirmación',async()=>{
 await actor(admin);await clock('2026-10-17 04:59:59Z');assert.equal((await state()).fecha,'2026-10-16');assert.equal((await state()).pendiente,false);
 await clock('2026-10-17 05:00:00Z');assert.equal((await state()).pendiente,true);assert.equal((await state()).bloqueada,false);
 await clock('2026-10-17 16:00:00Z');assert.equal((await state()).bloqueada,true);await confirm(await state());await guard();
 await clock('2026-10-18 16:00:00Z');assert.equal((await state()).bloqueada,true);await assert.rejects(guard(),/Confirma la deuda/);
 });
 await t.test('sesiones inválidas, NaN, y cuentas sin tienda no pueden confirmar',async()=>{
 await assert.rejects(confirm(await state(),'NaN'),/fecha y el saldo/);
 await actor('');await assert.rejects(state(),/Sesión activa/);await guard();
 await actor(admin);await db.exec(`update perfiles set activo=false where id='${admin}'`);await assert.rejects(confirm({fecha:'2026-10-18',version:'x',saldo:1}),/Solo el administrador/);
 });
 }finally{await db.close();}
});
