import {denied} from './assert-rpc.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,asActor,enableFictional,operator,manager,moved,quote,value,read} from './core-fixture.mjs';

test('installation stays disabled, keeps ordinary access and denies dedicated raw surfaces',async()=>{
 const db=await setup();try{
  assert.equal(await value(db,'select enabled from kora_private.cartera_contract'),false);
  assert.equal(await value(db,"select count(*) from perfiles where rol='operador_cartera'"),0);
  await asActor(db,manager);
  assert.deepEqual(await value(db,'select public.cartera_operador_inicio()'),{restricted:false});
  assert.equal(await value(db,'select count(*) from public.clientes'),1);
  await db.exec(`set session authorization postgres;reset role;update perfiles set rol='operador_cartera' where id='${operator}'`);
  await asActor(db);
  for(const table of ['public.clientes','public.perfiles','public.credit_portfolio_operators','storage.objects','storage.buckets','realtime.messages'])assert.equal(await value(db,'select count(*) from '+table),0,table);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_contract_not_active/);
  await assert.rejects(db.exec('set role kora_cartera_operator'),/permission denied/);
  await assert.rejects(db.query('select * from kora_private.cartera_principals'),/permission denied/);
 }finally{await db.close();}
});

test('bounded bootstrap responds only for active own profile/capability; privilege drift fails closed',async()=>{
 const db=await setup();try{
  await enableFictional(db);await asActor(db);
  const b=await value(db,'select public.cartera_operador_inicio()');
  assert.deepEqual(b,{restricted:true,profile:{id:operator,nombre:'Operadora ficticia',rol:'operador_cartera',activo:true,tienda_codigo:'fiction-A'},read:true,manage:true,importer:false,authorizer:false});
  await db.exec(`set session authorization postgres;reset role;update perfiles set activo=false where id='${operator}'`);await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_profile_inactive/);
  await db.exec(`set session authorization postgres;reset role;update perfiles set activo=true where id='${operator}';update credit_portfolio_operators set active=false where perfil_id='${operator}'`);await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_capability_revoked/);
  await db.exec(`set session authorization postgres;reset role;update credit_portfolio_operators set active=true;grant select on public.clientes to kora_cartera_operator;`);await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_contract_not_active/);
 }finally{await db.close();}
});

test('known principal cannot escape by role edit, id change or deleted profile with old session',async()=>{
 const db=await setup();try{
  await enableFictional(db);
  await db.exec(`update perfiles set id='${moved}',rol='gerencia' where id='${operator}';`);
  for(const u of [operator,moved]){await asActor(db,u);assert.equal(await value(db,'select count(*) from public.clientes'),0);await denied(db.query('select public.cartera_operador_inicio()'),/cartera_profile_inactive/);}
  await db.exec(`set session authorization postgres;reset role;delete from perfiles where id='${moved}'`);await asActor(db,moved);
  assert.equal(await value(db,'select count(*) from storage.objects'),0);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_profile_inactive/);
 }finally{await db.close();}
});

test('pre-request narrows dedicated HTTP SQL routes and preserves existing debt denial',async()=>{
 const db=await setup();try{
  const wrapperHash=JSON.parse(read('candidate-manifest.json')).reviewed_wrapper_definition_md5;
  assert.equal(await value(db,"select md5(pg_get_functiondef('public.kora_confirmacion_deuda_pre_request()'::regprocedure))"),wrapperHash);
  await enableFictional(db);await asActor(db);
  await db.query('select public.kora_confirmacion_deuda_pre_request()');
  for(const [path,method,headers] of [
   ['/clientes','GET',{}],['/clientes','POST',{}],['/rpc/registrar_pago','POST',{}],['/rpc/cartera_operador_inicio','GET',{}],['/rpc/cartera_operador_inicio','HEAD',{}],
   ['/rpc/cartera_operador_inicio','POST',{'accept-profile':'kora_private'}],['/rpc/cartera_operador_inicio','POST',{'content-profile':'storage'}],
   ['/rpc/cartera_operador_inicio','POST',{accept:'application/vnd.pgrst.plan+json'}],['/rpc/cartera_operador_inicio','POST',{prefer:'tx=rollback'}],
   ['//rpc/cartera_operador_inicio','POST',{}],['/rpc/cartera_operador_inicio/','POST',{}]
  ]){
   await db.exec(`select set_config('request.path',${quote(path)},false);select set_config('request.method',${quote(method)},false);select set_config('request.headers',${quote(JSON.stringify(headers))},false);`);
   await assert.rejects(db.query('select public.kora_confirmacion_deuda_pre_request()'),/cartera_api_(route|representation)_denied/);
  }
  // Managed CORS OPTIONS/root routing is intentionally NOT certified by these SQL tests.
  await db.exec(`set session authorization postgres;reset role;update kora_private.confirmacion_deuda_config set inicio='2000-01-01';update perfiles set rol='admin_tienda' where id='${manager}';`);
  await asActor(db,manager);await db.exec("select set_config('request.path','/ventas',false)");
  // Existing guard uses real current Bogota clock; force only the guard's clock in this fictional test.
  const old=read('baseline/old-debt-guard.sql').replace("clock_timestamp() at time zone 'America/Bogota'","timestamp '2026-11-26 12:00:00'");
  await db.exec('set session authorization postgres;reset role;'+old);await asActor(db,manager);await db.exec("select set_config('request.path','/ventas',false)");
  await assert.rejects(db.query('select public.kora_confirmacion_deuda_pre_request()'),/Confirma la deuda/);
  await db.exec('set session authorization postgres;reset role;');
  const body=await value(db,"select prosrc from pg_proc where oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure");
  assert.match(body,/cartera_api_pre_request/);assert.match(body,/exigir_confirmacion_deuda_api/);
  assert.equal(await value(db,"select md5(pg_get_functiondef('public.kora_confirmacion_deuda_pre_request()'::regprocedure))"),wrapperHash);
  await asActor(db,manager);
  await db.exec("select set_config('request.path','/rpc/cartera_operador_inicio',false)");
  await db.query('select public.kora_confirmacion_deuda_pre_request()');
  assert.deepEqual(await value(db,'select public.cartera_operador_inicio()'),{restricted:false});
  await db.exec("select set_config('request.path','/rpc/other_business_action',false)");
  await assert.rejects(db.query('select public.kora_confirmacion_deuda_pre_request()'),/Confirma la deuda/);
 }finally{await db.close();}
});

test('full reviewed candidate contains byte-identical core preflight, debt guard and rate controls',()=>{
 const marker='-- Enablement and the actual profile assignment require the separate reviewed activation.';
 const core=read('candidate/scope-core.sql'),full=read('candidate/scope-full.sql');
 const[head,tail]=core.split(marker);assert.equal(core.split(marker).length,2);
 assert.ok(full.startsWith(head));assert.ok(full.endsWith(marker+tail));
});

test('role CHECK drift aborts atomically and a late BEFORE trigger cannot evade principal recording',async()=>{
 let db=await setup({install:false});try{
  await db.exec("alter table perfiles drop constraint perfiles_rol_check;alter table perfiles add constraint perfiles_rol_check check(rol in('gerencia','auditoria','admin_tienda','asesor','extra_role'));");
  await assert.rejects(db.exec(read('candidate/scope-full.sql')),/cartera_role_constraint_changed/);await db.exec('rollback');
  assert.equal(await value(db,"select count(*) from pg_roles where rolname='kora_cartera_operator'"),0);
 }finally{await db.close();}
 db=await setup();try{
  await db.exec("create function public.fiction_late_before() returns trigger language plpgsql as $$begin new.rol='operador_cartera';return new;end$$;create trigger zzz_late_profile before update on perfiles for each row execute function public.fiction_late_before();");
  await db.exec(`update perfiles set nombre='Ficticia actualizada' where id='${operator}'`);
  assert.equal(await value(db,`select count(*) from kora_private.cartera_principals where user_id='${operator}'`),1);
  await asActor(db);assert.equal(await value(db,'select count(*) from public.clientes'),0);
 }finally{await db.close();}
});

test('completed invalid calls consume budget; exhausted actor does not reach expensive contract check',async()=>{
 const db=await setup();try{
  await enableFictional(db);await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()').then(async()=>{await db.exec(`set session authorization postgres;reset role;update perfiles set activo=false where id='${operator}'`);await asActor(db);return db.query('select public.cartera_operador_inicio()');}),/cartera_profile_inactive/);
  await db.exec('set session authorization postgres;reset role;');
  assert.equal(await value(db,'select calls from kora_private.cartera_rpc_budget'),2);
  await db.exec(`update perfiles set activo=true where id='${operator}';update kora_private.cartera_rpc_budget set calls=120;create or replace function kora_private.cartera_require_contract() returns void language plpgsql security definer set search_path='' as $$begin raise exception 'fiction_contract_should_not_run';end$$;`);
  await asActor(db);await denied(db.query('select public.cartera_operador_inicio()'),/cartera_request_limit/);
 }finally{await db.close();}
});

test('membership or default-ACL drift fails closed and private schema usage is not granted to ordinary roles',async()=>{
 const db=await setup();try{
  assert.equal(await value(db,"select has_schema_privilege('authenticated','kora_private','USAGE')"),false);
  assert.equal(await value(db,"select has_schema_privilege('authenticated','kora_cartera_policy','USAGE')"),true);
  await enableFictional(db);await db.exec('grant service_role to authenticated;');await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_contract_not_active/);
  await db.exec("set session authorization postgres;reset role;revoke service_role from authenticated;alter default privileges in schema public grant select on tables to authenticated;");await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_contract_not_active/);
 }finally{await db.close();}
});

test('rate cap commits rejected-call counts and technical role cannot acquire broader privileges',async()=>{
 const db=await setup();try{
  await enableFictional(db);await asActor(db);
  await db.query('select public.cartera_operador_inicio()');
  await db.exec(`set session authorization postgres;reset role;update kora_private.cartera_rpc_budget set calls=120;`);await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_request_limit/);
  await db.exec('set session authorization postgres;reset role');assert.equal(await value(db,'select calls from kora_private.cartera_rpc_budget'),121);
  await db.exec('set role kora_cartera_operator');
  await assert.rejects(db.query('select secret from public.clientes'),/permission denied/);
  await assert.rejects(db.exec('create table public.cartera_escape(id int)'),/permission denied/);
  await assert.rejects(db.exec('create function kora_private.cartera_escape() returns int language sql as $$select 1$$'),/permission denied/);
 }finally{await db.close();}
});

test('unreviewed relation preflight aborts without a partial role or policy',async()=>{
 const db=await setup({install:false});try{
  await db.exec('create table public.future_module(id int);alter table public.future_module enable row level security;');
  await assert.rejects(db.exec(read('candidate/scope-core.sql')),/cartera_relation_inventory_changed/);
  await db.exec('rollback');
  assert.equal(await value(db,"select count(*) from pg_roles where rolname='kora_cartera_operator'"),0);
  assert.equal(await value(db,"select count(*) from pg_policy where polname='cartera_dedicated_deny'"),0);
 }finally{await db.close();}
});

test('bound invoker identity returns only caller UUID without USAGE on managed identity schema',async()=>{
 const db=await setup();try{
  assert.equal(await value(db,"select has_schema_privilege('kora_cartera_operator','auth','USAGE')"),false);
  assert.equal(await value(db,"select prosecdef from pg_proc where oid='public.cartera_subject()'::regprocedure"),false);
  assert.equal(await value(db,"select pg_has_role('kora_cartera_operator','authenticated','MEMBER')"),false);
  assert.equal(await value(db,"select bool_or(set_option) from pg_auth_members where roleid='kora_cartera_operator'::regrole and member='postgres'::regrole"),true);
  await asActor(db,operator,'kora_cartera_operator');
  assert.equal(await value(db,'select public.cartera_subject()'),operator);
  await assert.rejects(db.query('select auth.uid()'),/permission denied for schema auth/);
  await assert.rejects(db.query('select * from auth.users'),/permission denied for schema auth|does not exist/);
 }finally{await db.close();}
});

test('provider removing UID execution prevents install atomically without changing managed grants',async()=>{
 const db=await setup({install:false});try{
  await db.exec('revoke execute on function auth.uid() from public;');
  await assert.rejects(db.exec(read('candidate/scope-core.sql')),/cartera_identity_permission_changed/);await db.exec('rollback');
  assert.equal(await value(db,"select count(*) from pg_roles where rolname='kora_cartera_operator'"),0);
  assert.equal(await value(db,"select count(*) from pg_policy where polname='cartera_dedicated_deny'"),0);
 }finally{await db.close();}
});
