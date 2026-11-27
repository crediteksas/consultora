// Bounded, fictional native-Postgres fixture. Does not reconstruct managed Supabase.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('./',import.meta.url));
export const read=p=>readFileSync((p.startsWith('candidate/')?root:root+'../')+p,'utf8');
export const operator='11111111-1111-4111-8111-111111111111';
export const manager='22222222-2222-4222-8222-222222222222';
export const moved='33333333-3333-4333-8333-333333333333';
export const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
export async function setup({install=true}={}){
 const db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator noinherit;grant authenticated,anon,service_role to authenticator with inherit false,set true;
 create schema auth;create schema kora_private;create schema storage;create schema realtime;
 grant usage on schema public,auth,storage,realtime to authenticated;
 grant usage on schema auth to anon,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.perfiles(id uuid primary key,nombre text,rol text not null,activo boolean not null,tienda_codigo text,private_note text,
 constraint perfiles_rol_check check(rol in('gerencia','auditoria','admin_tienda','asesor')));
 create table public.credit_portfolio_operators(perfil_id uuid,capability text,active boolean);
 create table public.confirmaciones_deuda_tienda(usuario_id uuid,tienda_codigo text,fecha date);
 create table kora_private.confirmacion_deuda_config(id boolean,inicio date);
 insert into kora_private.confirmacion_deuda_config values(true,'2099-01-01');
 insert into perfiles values('${operator}','Operadora ficticia','admin_tienda',true,'fiction-A','never project'),('${manager}','Gerente ficticio','gerencia',true,null,'never project');
 insert into credit_portfolio_operators values('${operator}','manage',true);
 grant select on credit_portfolio_operators to service_role;
 `);
 for(const m of JSON.parse(read('baseline/managed-relations.json'))){
  if(!['r','p'].includes(m.kind))throw Error('Managed fixture view/foreign-table requires independent reconstruction');
  await db.exec(`create table "${m.schema}"."${m.name}"(id int,secret text)${m.kind==='p'?' partition by range(id)':''};alter table "${m.schema}"."${m.name}" enable row level security;`);
 }
 const existing=new Set(['perfiles','credit_portfolio_operators','confirmaciones_deuda_tienda']);
 for(const name of JSON.parse(read('baseline/public-relations.json'))){
  if(!existing.has(name))await db.exec(`create table public."${name}"(id integer,secret text);insert into public."${name}" values(1,'fictional unrelated row');`);
 }
 const all=(await db.query("select schemaname,tablename from pg_tables where schemaname='public' or(schemaname='storage' and tablename in('objects','buckets'))or(schemaname='realtime' and tablename='messages')")).rows;
 for(const t of all)await db.exec(`alter table "${t.schemaname}"."${t.tablename}" enable row level security;grant select,insert,update,delete on "${t.schemaname}"."${t.tablename}" to authenticated;create policy existing_authenticated_access on "${t.schemaname}"."${t.tablename}" for all to authenticated using(true) with check(true);`);
 await db.exec(read('baseline/old-debt-guard.sql'));
 await db.exec(read('baseline/old-api-guard.sql'));
 // The live private debt helper has no PUBLIC execution. Definition-only
 // snapshots do not include ACLs, so reproduce that restriction explicitly.
 await db.exec('revoke execute on function kora_private.exigir_confirmacion_deuda_api() from public;');
 await db.exec('alter table realtime.subscription disable row level security;alter table realtime.schema_migrations disable row level security;grant select on realtime.subscription to authenticated;');
 if(install)await db.exec(read('candidate/scope-full.sql'));
 return db;
}
export async function asActor(db,id=operator,role=(id===manager?'authenticated':'kora_cartera_session')){
 await db.exec(`set session authorization postgres;reset role;set session authorization authenticator;set role ${role};select set_config('request.jwt.claim.sub',${quote(id)},false);select set_config('request.jwt.claims',${quote(JSON.stringify({sub:id,role,is_anonymous:false}))},false);select set_config('request.path','/rpc/cartera_operador_inicio',false);select set_config('request.method','POST',false);select set_config('request.headers','{"accept":"application/json"}',false);`);
}
export async function enableFictional(db){
 await db.exec(`set session authorization postgres;reset role;update perfiles set rol='operador_cartera' where id='${operator}';`);
 // Never recompute the seal at activation. Read the immutable install-time
 // expected value and pass it explicitly to the actual activation preflight.
 const fingerprint=await value(db,'select fingerprint from kora_private.cartera_contract');
 await db.query('select kora_private.cartera_activate($1)',[fingerprint]);
}
export async function value(db,sql){const r=await db.query(sql);return Object.values(r.rows[0]||{})[0];}
