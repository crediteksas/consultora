import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {checkPermissionContract} from './check-permission-contract.mjs';
const folder='tests/fixtures/supabase-compat/facturas-emitidas';
const migration='supabase/migrations/20261126021316_b2b_facturas_emitidas_conciliacion.sql';
const testPath='tests/security/supabase-compatibility-facturas-emitidas.test.mjs';
const read=f=>readFileSync(f,'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const baseline=`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema kora_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table public.perfiles(id uuid primary key,activo boolean,rol text);
insert into public.perfiles values('10000000-0000-0000-0000-000000000001',true,'gerencia');
grant usage on schema auth to authenticated;grant select on public.perfiles to authenticated;
create table public.origenes(codigo text primary key,tipo text);insert into public.origenes values('FICTICIO','cliente_b2b');
create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
create table public.movimientos_cartera(id integer,monto numeric);insert into public.movimientos_cartera values(1,5000);
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
set test.actor='10000000-0000-0000-0000-000000000001';`;
export async function capture(scenario){
 const db=await PGlite.create();try{
  await db.exec(baseline);
  if(scenario==='rebuild')await db.exec('alter default privileges revoke execute on functions from public;');
  const catalog=async()=>{const r=(await db.query(read('scripts/supabase-compat/catalog-query.sql'))).rows[0];const data=Object.values(r)[0];delete data.captured_at;return data;};
  const before=await catalog();await db.exec(read(migration));const after=await catalog();
  const relations=after.relations.filter(r=>r.schema==='public'&&['b2b_facturas_emitidas','b2b_certificados_cliente','b2b_retenciones_cliente'].includes(r.name));
  assert.equal(relations.length,3);
  const functions=after.functions.filter(f=>f.schema==='kora_private'&&['auditar_registro_fiscal_b2b','validar_periodo_fiscal_b2b'].includes(f.name));assert.equal(functions.length,2);
  const apiGrants=o=>o.grants.filter(g=>g.grantee!==o.owner);
  for(const r of relations){assert.equal(r.rls,true);assert.equal(r.policy_count,1);assert.equal(apiGrants(r).some(g=>g.privilege==='TRUNCATE'),false);assert.deepEqual(apiGrants(r).filter(g=>g.grantee!=='service_role').map(g=>g.grantee+':'+g.privilege),['authenticated:SELECT']);}
  assert.equal(functions[0].security_definer,false);assert.deepEqual(apiGrants(functions[0]),[]);
  const objects=[...relations,...functions.map(f=>({...f,kind:'function'}))].map(o=>({...o,grants:apiGrants(o),column_acls:{},isolation_test:testPath,justification:'Documentary fiscal records: active corporate profiles can read. Browser API roles anon/authenticated have no write grants; service_role retains its provider DML grants with TRUNCATE explicitly revoked. Both invoker trigger helpers have no API EXECUTE grants. No legacy object changes.'}));
  const created=objects.map(({schema,name,kind,identity})=>({schema,name,kind,identity}));
  const contract={schema_version:1,project:'kora',objects,allow_catalog_changes:{policies:stable(after.policies),triggers:stable(after.triggers)}};
  const checked=checkPermissionContract({before,after,contract,created});assert.ok(checked.ok,checked.errors.join('\n'));
  await db.exec('set role anon');for(const r of relations)await assert.rejects(db.query('select * from public.'+r.name),{code:'42501'});
  await db.exec('reset role;set role authenticated');for(const r of relations)await assert.rejects(db.query('insert into public.'+r.name+' default values'),{code:'42501'});
  await db.exec("reset role;update public.perfiles set rol='admin_tienda';set role authenticated");for(const r of relations)assert.equal((await db.query('select count(*) n from public.'+r.name)).rows[0].n,0);
  return {before,after,contract,created};
 }finally{await db.close();}
}
export async function emit(){
 mkdirSync(folder,{recursive:true});const pin=(path,value)=>{const body=JSON.stringify(value,null,2)+'\n';writeFileSync(path,body);return {path,sha256:hash(body)};};
 const release={schema_version:1,project:'kora',scope:'Isolated upgrade/rebuild of documentary B2B issued invoices and customer withholding certificates. Fictional fixture; no production data or financial posting.',migration_sha256:{[migration]:hash(read(migration))},isolation_tests:[{path:testPath,sha256:hash(read(testPath))}],test_runner_sha256:hash(read('scripts/run-kora-local-tests.mjs')),emitter_sha256:hash(read('scripts/supabase-compat/facturas-emitidas-evidence.mjs'))};
 for(const scenario of ['upgrade','rebuild']){release[scenario]={};for(const [key,value]of Object.entries(await capture(scenario)))release[scenario][key]=pin(folder+'/'+scenario+'-'+key+'.json',value);}
 const ref=pin(folder+'/release.json',release);console.log(JSON.stringify(ref));return ref;
}
if(process.argv.includes('--emit'))await emit();
