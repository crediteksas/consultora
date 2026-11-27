import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=await readFile(new URL('../../supabase/migrations/20261127195036_cartera_independiente_confirmacion_tienda.sql',import.meta.url),'utf8');
const body=migration.slice(migration.indexOf('create or replace function public.kora_confirmacion_deuda_pre_request()'),migration.indexOf('end$function$;')+'end$function$;'.length);
const oldBody=`create or replace function public.kora_confirmacion_deuda_pre_request() returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)='kora_cartera_session' or kora_cartera_policy.cartera_principal_restringido() then perform kora_private.cartera_api_pre_request();return; end if;
 if current_setting('request.method',true)='POST' and current_setting('request.path',true) in('/rpc/cartera_operador_inicio','rpc/cartera_operador_inicio') then perform kora_private.cartera_api_pre_request();return; end if;
 perform kora_private.exigir_confirmacion_deuda_api();perform kora_private.cartera_api_pre_request();
end$$;`;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
const routes=['cobra_quality_operator','cobra_quality_importer','cobra_krediya_history_cuts','cobra_krediya_save_collection','cobra_krediya_payload_digest','cobra_krediya_save_cut','cobra_provision_authorizer','cobra_provision_book','cobra_provision_source','cobra_provision_save'];
test('Cartera independiente: conserva los controles y rutas de las tiendas',async t=>{
 const db=await PGlite.create();
 async function actor(id){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
 async function req(method,path){await db.query("select set_config('request.method',$1,false),set_config('request.path',$2,false)",[method,path]);return db.exec('select public.kora_confirmacion_deuda_pre_request()');}
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create role kora_cartera_session;create schema auth;create schema kora_private;create schema kora_cartera_policy;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.perfiles(id uuid primary key,rol text,activo boolean,tienda_codigo text,deuda_confirmada boolean);
  create table public.credit_portfolio_operators(perfil_id uuid,capability text,active boolean);
  insert into public.perfiles values('${a}','admin_tienda',true,'A',false),('${b}','admin_tienda',true,'B',false),('${c}','admin_tienda',true,'C',true);
  insert into public.credit_portfolio_operators values('${a}','manage',true);
  create function kora_cartera_policy.cartera_principal_restringido() returns boolean language sql as $$select coalesce(current_setting('test.restricted',true),'')='true'$$;
  create function kora_private.cartera_api_pre_request() returns void language plpgsql as $$begin if current_setting('role',true)='kora_cartera_session' or kora_cartera_policy.cartera_principal_restringido() then raise exception 'dedicated_guard_executed';end if;end$$;
  create function kora_private.exigir_confirmacion_deuda_api() returns void language plpgsql as $$declare p public.perfiles; r text:=ltrim(coalesce(current_setting('request.path',true),''),'/');begin if auth.uid() is null or current_setting('request.method',true) in ('GET','HEAD','OPTIONS') or r in ('rpc/estado_confirmacion_deuda_tienda','rpc/confirmar_deuda_tienda','rpc/tiene_capacidad_cartera') then return;end if;select * into p from public.perfiles where id=auth.uid() and activo and rol='admin_tienda';if found and not p.deuda_confirmada then raise exception 'Confirma la deuda';end if;end$$;
  create table kora_private.cartera_contract(singleton boolean,enabled boolean);insert into kora_private.cartera_contract values(true,false);
  create function public.cobra_quality_operator() returns boolean language sql as $$select true$$;`);
  await db.exec(oldBody);await db.exec('revoke all on function public.kora_confirmacion_deuda_pre_request() from public;grant execute on function public.kora_confirmacion_deuda_pre_request() to anon,authenticated,service_role,kora_cartera_session');
  const before=(await db.query("select oid,proowner,proacl::text as acl,prosecdef,proconfig::text as config from pg_proc where oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure")).rows[0];
  await t.test('precondición impide aplicar una versión ajena y preserva función',async()=>{await assert.rejects(db.exec('begin;'+migration+'rollback;'),/cartera_independiente_preflight_changed/);await db.exec('rollback');assert.deepEqual((await db.query("select oid,proowner,proacl::text as acl,prosecdef,proconfig::text as config from pg_proc where oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure")).rows[0],before);});
  await t.test('migración transaccional con precondiciones y comprobación posterior',async()=>{
   const pins=[['public.kora_confirmacion_deuda_pre_request()','8c27a5975628606baa2093c610f3474c'],['kora_private.exigir_confirmacion_deuda_api()','a8aad0e67f70551625e9ede1937b92cd'],['kora_private.cartera_api_pre_request()','52da4eb5ffd077c6fb702fb0325ffd52'],['public.cobra_quality_operator()','367477a866771c9bf1cb8bed602fbbbb']];
   let local=migration;
   for(const [sig,live] of pins){const digest=(await db.query('select md5(pg_get_functiondef($1::regprocedure)) as digest',[sig])).rows[0].digest;local=local.replace(live,digest);}
   await db.exec('begin;'+local+'commit;');
  });
  const after=(await db.query("select oid,proowner,proacl::text as acl,prosecdef,proconfig::text as config from pg_proc where oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure")).rows[0];
  await t.test('conserva identificador, dueño, permisos y seguridad',()=>assert.deepEqual(after,before));
  await db.exec('set role authenticated');await actor(a);
  await t.test('gestora de Cartera puede usar exclusivamente las funciones previstas con deuda pendiente',async()=>{for(const r of routes){await req('POST','/rpc/'+r);await req('POST','rpc/'+r);}});
  await t.test('ventas, caja, traslados, NOVA y otras escrituras siguen bloqueadas',async()=>{for(const r of ['/rpc/registrar_venta','/rpc/trasladar','/rpc/cerrar_caja','/rpc/nova_revisar','/ventas','/rpc/cobra_provision_save_extra','/rpc/Cobra_quality_operator','/rpc%2Fcobra_quality_operator'])await assert.rejects(req('POST',r),/Confirma la deuda/);await assert.rejects(req('PATCH','/ventas'),/Confirma la deuda/);});
  await t.test('sin permiso de Cartera, la otra tienda conserva bloqueo',async()=>{await actor(b);for(const r of routes)await assert.rejects(req('POST','/rpc/'+r),/Confirma la deuda/);await assert.rejects(req('POST','/rpc/registrar_venta'),/Confirma la deuda/);});
  await t.test('tienda sin deuda pendiente conserva sus operaciones',async()=>{await actor(c);await req('POST','/rpc/registrar_venta');await req('POST','/rpc/trasladar');});
  await t.test('permiso de lectura, inactivo o perfil inactivo no conceden excepción',async()=>{await db.exec('reset role');for(const values of [`('${a}','read',true)`,`('${a}','manage',false)`]){await db.exec('delete from public.credit_portfolio_operators');await db.exec('insert into public.credit_portfolio_operators values '+values);await db.exec('set role authenticated');await actor(a);await assert.rejects(req('POST','/rpc/cobra_quality_operator'),/Confirma la deuda/);await db.exec('reset role');}await db.exec(`delete from public.credit_portfolio_operators;insert into public.credit_portfolio_operators values('${a}','manage',true);update public.perfiles set activo=false where id='${a}'`);const inactive=(await db.query(`select exists(select 1 from public.perfiles p join public.credit_portfolio_operators o on o.perfil_id=p.id where p.id='${a}' and p.activo and p.rol='admin_tienda' and o.active and o.capability='manage') as eligible`)).rows[0];assert.equal(inactive.eligible,false);await db.exec('set role authenticated');await actor(a);await req('POST','/rpc/cobra_quality_operator');});
  await t.test('consultas y confirmación diaria mantienen excepciones previas',async()=>{await actor(b);await req('GET','/ventas');await req('POST','/rpc/estado_confirmacion_deuda_tienda');await req('POST','/rpc/confirmar_deuda_tienda');});
  await t.test('rol dedicado y perfil restringido siempre pasan por su propia barrera',async()=>{await db.exec('reset role;set role kora_cartera_session');await assert.rejects(req('POST','/rpc/cobra_quality_operator'),/dedicated_guard_executed/);await db.exec("reset role;set role authenticated;set test.restricted='true'");await assert.rejects(req('POST','/rpc/cobra_quality_operator'),/dedicated_guard_executed/);});
 }finally{await db.close();}
});
