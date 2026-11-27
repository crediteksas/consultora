import {setup,read,operator,manager,quote,value,asActor,enableFictional} from './core-fixture.mjs';
import{readFileSync}from'node:fs';
import{fileURLToPath}from'node:url';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const file=p=>readFileSync(repo+p,'utf8');
export const operation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
export const other='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
export async function fullSetup({install=true,bothOrigins=false}={}){
 const db=await setup({install:false});
 for(const t of ['aliados_operadores','clientes','origenes','nova_authorizations','credit_repayments','credit_collection_events','credit_portfolio_obligations','credit_portfolio_settings','liquidation_operations','liquidations','cobra_krediya_cut_operations','cobra_krediya_cuts','cobra_provision_funding_sources','cobra_provision_funding_operations','cobra_provision_actions','cobra_provision_fundings','cobra_provision_authority'])await db.exec('drop table public.'+t);
 await db.exec(`create table clientes(id uuid primary key,nombre_completo text,cedula text,private_note text);
 create table origenes(codigo text primary key,nombre text,private_note text);
 create table nova_authorizations(id uuid primary key,decision text,external_decision_id text,rule_version text,private_note text);
 create table aliados_operadores(perfil_id uuid,capacidad text,activo boolean);
 create table credit_portfolio_settings(singleton boolean,nova_enforcement_enabled boolean,nova_enforcement_from date,private_note text);
 insert into credit_portfolio_settings values(true,false,null,'never project');
 create table liquidations(id uuid primary key,approved_at timestamptz,approved_by uuid,frozen_at timestamptz);
 create table liquidation_operations(id uuid primary key,liquidation_id uuid references liquidations,plataforma text,reconocida boolean,external_id text,cliente_documento text,cliente_nombre text,establishment_name text,origen_codigo text,operation_at timestamptz,normalized_data jsonb,monto_credito numeric,policy_snapshot jsonb);
 create table credit_portfolio_obligations(id uuid primary key,operation_id uuid unique references liquidation_operations,credito_id uuid,cliente_id uuid references clientes,plataforma text,external_credit_id text,origen_codigo text,cliente_nombre_snapshot text,cliente_documento_snapshot text,original_amount numeric,outstanding_amount numeric,ally_paid_at timestamptz,first_due_date date,next_due_date date,status text,pre_nova boolean,nova_authorization_id uuid references nova_authorizations);
 create table credit_repayments(id uuid primary key,obligation_id uuid references credit_portfolio_obligations,amount numeric,status text,private_note text);
 create table credit_collection_events(id uuid primary key default gen_random_uuid(),obligation_id uuid not null references credit_portfolio_obligations,actor_type text not null,event_type text not null,channel text,note text,promise_date date,promise_amount numeric,created_by uuid references perfiles,created_at timestamptz not null default now());
 `);
 for(const f of JSON.parse(read('baseline/collection-callgraph.json')).functions.filter(f=>['rol_actual','tiene_capacidad_cartera','creditos_cartera_puede_leer'].includes(f.name)))await db.exec(f.definition);
 // Actual observed ACL matrix for the shared capability helper; no anon grant.
 await db.exec('revoke execute on function public.tiene_capacidad_cartera(text) from public,anon;grant execute on function public.tiene_capacidad_cartera(text) to authenticated,service_role;');
 await db.exec(JSON.parse(read('baseline/trust-dependencies.json')).functions.find(f=>f.signature==='tiene_capacidad_aliados(text)').definition);
 for(const t of ['aliados_operadores','clientes','origenes','nova_authorizations','credit_repayments','credit_collection_events','credit_portfolio_obligations','credit_portfolio_settings','liquidation_operations','liquidations'])await db.exec(`alter table public.${t} enable row level security;grant select on public.${t} to authenticated;create policy baseline_read on public.${t} for select to authenticated using(true);`);
 await db.exec(file('supabase/migrations/20261126012515_cobra_krediya_cut_history.sql'));
 await db.exec(file('supabase/migrations/20261126013403_cobra_krediya_collection_operation_link.sql'));
 await db.exec(file('supabase/migrations/20261126154810_cobra_krediya_evolution_provision_review.sql'));
 const view=file('supabase/migrations/20260910200436_creditos_cartera_nova_ready.sql').split('create view public.creditos_cartera_operaciones')[1].split('revoke all on public.creditos_cartera_operaciones')[0];
 await db.exec('create view public.creditos_cartera_operaciones'+view);
 // Only fictional accounts, customers and operations. Two origins prove scope isolation.
 await db.exec(`insert into origenes values('fiction-A','Fiction A','secret A'),('fiction-B','Fiction B','secret B');
 insert into clientes values('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','Fiction Ana','111001','secret A'),('dddddddd-dddd-4ddd-8ddd-ddddddddddd2','Fiction Luis','111002','secret B');
 insert into liquidations values('cccccccc-cccc-4ccc-8ccc-ccccccccccc1',now(),'${manager}',now());
 insert into liquidation_operations values('${operation}','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','krediya',true,'fiction001','111001','Fiction Ana','Fiction A','fiction-A','2026-10-01 13:00Z','{"fecha":"2026-10-01T13:00:00Z"}',400000,'{"krediya_v2":{"provision":100}}'),('${other}','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','krediya',true,'fiction002','111002','Fiction Luis','Fiction B','fiction-B','2026-10-01 13:00Z','{"fecha":"2026-10-01T13:00:00Z"}',400000,'{"krediya_v2":{"provision":100}}');
 insert into credit_portfolio_obligations values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','${operation}',null,'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','krediya','fiction001','fiction-A','Fiction Ana','111001',400000,350000,now(),null,null,'active',true,null),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','${other}',null,'dddddddd-dddd-4ddd-8ddd-ddddddddddd2','krediya','fiction002','fiction-B','Fiction Luis','111002',400000,350000,now(),null,null,'active',true,null);
 insert into credit_repayments values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',50000,'validated','secret payment');
 `);
 // Insert a canonical cut through its actual parser, with a fictional privileged importer.
 await db.exec(`insert into aliados_operadores values('${manager}','revisor',true);update perfiles set rol='gerencia' where id='${manager}';`);
 await asActor(db,manager);
 const row={contract:'fiction001',document:'111001',customer:'Fiction Ana',store:'Fiction A',created:'2026-10-01',financed_cents:40000000,fee_cents:5000000,total_installments:12,frequency:15,cycled:3,paid:1,overdue:2,contract_status:'signed_approved'};
 const rows=bothOrigins?[row,{...row,contract:'fiction002',document:'111002',customer:'Fiction Luis',store:'Fiction B'}]:[row];
 const cut=await value(db,`select public.cobra_krediya_save_cut('99999999-9999-4999-8999-999999999999','${'a'.repeat(64)}','2026-10-01','2026-11-26','fiction.xlsx',${quote(JSON.stringify(rows))}::jsonb)`);
 await db.exec('set session authorization postgres;reset role;');
 await db.exec("revoke execute on function public.rol_actual(),public.creditos_cartera_puede_leer(text),public.tiene_capacidad_aliados(text) from public,anon;grant execute on function public.rol_actual(),public.creditos_cartera_puede_leer(text),public.tiene_capacidad_aliados(text) to authenticated,service_role;");
 const beforeIdentity=(await db.query("select p.oid::regprocedure::text name,p.proowner,(select jsonb_agg(jsonb_build_object('grantee',a.grantee,'privilege',a.privilege_type,'grantable',a.is_grantable,'grantor',a.grantor) order by a.grantee,a.privilege_type,a.grantor) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where not exists(select 1 from pg_roles r where r.rolname='kora_cartera_operator' and r.oid=a.grantee)) as old_role_acl,p.prosecdef,p.provolatile,p.proconfig from pg_proc p where p.proname in('tiene_capacidad_cartera','cobra_quality_operator','cobra_krediya_save_collection','cobra_krediya_validate_event') order by p.oid::regprocedure::text")).rows;
 const fundBefore=(await db.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p where p.oid in('public.cobra_provision_authorizer()'::regprocedure,'public.cobra_provision_prepare_action()'::regprocedure) order by p.oid::regprocedure::text")).rows;
 if(install)await db.exec(read('candidate/scope-full.sql'));
 return{db,cut,beforeIdentity,fundBefore};
}
export{operator,manager,quote,value,asActor,enableFictional};
