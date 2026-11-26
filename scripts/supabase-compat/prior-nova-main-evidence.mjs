// Isolated verification of two already-reviewed, already-applied SQL sources on main.
// This does not apply Nova code, deploy Nova/AURA Workers, or change business data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {checkPermissionContract} from './check-permission-contract.mjs';
const dir='releases/nova-allied-flow-20261125/',folder='tests/fixtures/supabase-compat/prior-nova-main';
const files=['supabase/migrations/20261125233814_nova_retail_restrictive_approval_guard.sql','supabase/migrations/20261126002712_nova_three_allied_kora_flow.sql'];
const testPath='tests/security/supabase-compatibility-prior-nova-main.test.mjs';
const read=p=>readFileSync(p,'utf8'),hash=b=>createHash('sha256').update(b).digest('hex');
const stable=v=>JSON.stringify(v,(_,i)=>i&&typeof i==='object'&&!Array.isArray(i)?Object.fromEntries(Object.entries(i).sort(([a],[b])=>a.localeCompare(b))):i);
export async function capture(scenario){const db=await PGlite.create();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 if(scenario==='rebuild')await db.exec('alter default privileges revoke execute on functions from public');
 const schema=JSON.parse(read(dir+'fixtures/kora-schema.json')),tables=new Map();
 for(const c of schema){if(!tables.has(c.table_name))tables.set(c.table_name,[]);let d=c.default_value||'';if(d.includes('nextval(')||d.includes('auth.')||d.includes('extensions.'))d='';if(c.fixture_type==='text'&&c.type!=='text')d=d.replace('::'+c.type,'::text');tables.get(c.table_name).push('"'+c.name+'" '+c.fixture_type+(d?' DEFAULT '+d:''));}
 for(const [name,cols]of tables)await db.exec('create table public.'+name+'('+cols.join(',')+')');
 await db.exec('create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);create table public.nova_retail_reviewers(actor_id uuid,can_review boolean);');
 for(const name of ['normalizar_nombre_aliado','reservar_otp_registro_seguro','crear_registro_cliente_seguro','kora_nova_register','nova_retail_consent_current'])await db.exec(read(dir+'fixtures/helper-'+name+'.sql'));
 for(const f of readdirSync(dir+'baseline').filter(f=>/^kora-\d+-.*\.sql$/.test(f)).sort())await db.exec(read(dir+'baseline/'+f));
 await db.exec(read('releases/nova-store-alerts-20261125/review-after.sql'));
 await db.exec("alter table public.nova_retail_cases add constraint nova_retail_cases_store_code_check check(store_code ~ '^(CK-0[1-9]|distritoys)$');");
 await db.exec("alter table public.nova_client_otp_policy add constraint nova_client_otp_policy_allowed_origins_check check (allowed_origins <@ array['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys']::text[]);");
 const names=['nova_retail_review',...JSON.parse(read(dir+'baseline/kora-functions.json')).map(f=>f.proname)];
 const catalog=async()=>{const x=Object.values((await db.query(read('scripts/supabase-compat/catalog-query.sql'))).rows[0])[0];delete x.captured_at;return x;};
 for(const name of names){const sigs=(await db.query("select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[name])).rows;for(const {sig}of sigs)await db.exec('revoke all on function '+sig+' from public,anon,authenticated;grant execute on function '+sig+' to service_role;');}
 const before=await catalog();for(const f of files)await db.exec(read(f));const after=await catalog();
 const functions=after.functions.filter(f=>f.schema==='public'&&names.includes(f.name));assert.equal(functions.length,names.length);
 for(const f of functions){const old=before.functions.find(b=>b.schema===f.schema&&b.name===f.name&&b.identity===f.identity);assert.ok(old);assert.deepEqual(f.grants,old.grants);assert.equal(f.security_definer,old.security_definer);assert.equal(f.security_definer,false);assert.deepEqual(f.grants.filter(g=>g.grantee!==f.owner).map(g=>g.grantee+':'+g.privilege),['service_role:EXECUTE']);}
 const objects=functions.map(f=>({...f,kind:'function',grants:f.grants.filter(g=>g.grantee!==f.owner),column_acls:{},isolation_test:testPath,justification:'Already-reviewed Nova sources on main, separate from B2B. Replacing invoker definitions preserves exact service-only EXECUTE grants and existing relation permissions. This release does not replay the SQL in production.'}));
 const created=objects.map(({schema,name,kind,identity})=>({schema,name,kind,identity}));const contract={schema_version:1,project:'kora',objects};const check=checkPermissionContract({before,after,contract,created});assert.ok(check.ok,check.errors.join('\n'));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const f of functions)assert.equal((await db.query("select has_function_privilege(current_user,p.oid,'EXECUTE') yes from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2",[f.schema,f.name])).rows[0].yes,false);await db.exec('reset role');}
 return {before,after,contract,created};
}finally{await db.close();}}
export async function emit(){mkdirSync(folder,{recursive:true});const pin=(path,value)=>{const b=JSON.stringify(value,null,2)+'\n';writeFileSync(path,b);return {path,sha256:hash(b)};};const release={schema_version:1,project:'kora',scope:'Read-only isolated preservation evidence for two previously applied Nova migrations, no Worker or production changes.',migration_sha256:Object.fromEntries(files.map(p=>[p,hash(read(p))])),isolation_tests:[{path:testPath,sha256:hash(read(testPath))}],test_runner_sha256:hash(read('scripts/run-kora-local-tests.mjs'))};for(const s of ['upgrade','rebuild']){release[s]={};for(const[k,v]of Object.entries(await capture(s)))release[s][k]=pin(folder+'/'+s+'-'+k+'.json',v);}const ref=pin(folder+'/release.json',release);console.log(JSON.stringify(ref));return ref;}
if(process.argv.includes('--emit'))await emit();
