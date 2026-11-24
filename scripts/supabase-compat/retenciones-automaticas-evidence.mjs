import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {checkPermissionContract} from './check-permission-contract.mjs';
const folder='tests/fixtures/supabase-compat/retenciones-automaticas';
const testPath='tests/security/supabase-compatibility-retenciones-automaticas.test.mjs';
const migrations=['supabase/migrations/20261121165939_retail_anulacion_inicial_retenida_auditada.sql','supabase/migrations/20261124164506_proveedores_retencion_automatica.sql'];
const read=p=>readFileSync(p,'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const key=x=>x.schema+'.'+x.name+(x.identity===undefined?'':'('+x.identity+')');
const objects=x=>[...x.relations,...x.functions.map(f=>({...f,kind:'function'}))];
export async function capture(scenario){
 const db=await PGlite.create();try{
  await db.exec(read('tests/erp/fixtures/retencion-inicial-baseline.sql'));
  let fixture=read(folder+'/baseline.sql')
   .replace('create role anon;create role authenticated;create schema auth;create schema kora_private;','')
   .replace('create function auth.uid()','create or replace function auth.uid()')
   .replace(/create table perfiles\([^;]+;/,'')
   .replace('insert into perfiles values','insert into perfiles(id,activo,rol) values')
   .replace(/create table audit_log\([^;]+;/,'');
  await db.exec(fixture);
  await db.exec(`create role service_role bypassrls;
   alter default privileges in schema public grant execute on functions to service_role;
   alter default privileges in schema public grant all on tables to service_role;
   alter table public.facturas_proveedor enable row level security;`);
  await db.exec(read('supabase/migrations/20261110180316_registro_retenciones_proveedor.sql'));
  if(scenario==='rebuild')await db.exec('alter default privileges revoke execute on functions from public;');
  const catalog=async()=>{const {rows}=await db.query(read('scripts/supabase-compat/catalog-query.sql'));const s=Object.values(rows[0])[0];delete s.captured_at;return s;};
  const before=await catalog();
  for(const file of migrations)await db.exec(read(file));
  const after=await catalog();
  const prior=new Map(objects(before).map(x=>[key(x),x]));
  const changed=objects(after).filter(x=>!prior.has(key(x))||stable(x)!==stable(prior.get(key(x))));
  const apiGrants=x=>x.grants.filter(g=>g.grantee!==x.owner);
  const policy=changed.find(x=>x.name==='proveedores_retencion_automatica');
  assert.equal(policy.rls,true);assert.equal(policy.policy_count,1);
  assert.deepEqual(apiGrants(policy).filter(x=>x.grantee==='authenticated').map(x=>x.privilege),['SELECT']);
  for(const f of changed.filter(x=>x.kind==='function'&&x.schema==='kora_private'))assert.equal(apiGrants(f).length,0);
  const endpoint=changed.find(x=>x.schema==='public'&&x.name==='registrar_compra_proveedor_automatica');
  assert.deepEqual(apiGrants(endpoint).map(g=>g.grantee+':'+g.privilege).sort(),['authenticated:EXECUTE','service_role:EXECUTE']);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.proveedores_retencion_automatica'),{code:'42501'});
  await db.exec("reset role;set role authenticated;set test.central='no'");
  assert.equal((await db.query('select * from public.proveedores_retencion_automatica')).rows.length,0);
  await assert.rejects(db.query('insert into public.proveedores_retencion_automatica default values'),{code:'42501'});
  await db.exec('reset role');
  const contract={schema_version:1,project:'kora',objects:changed.map(x=>({...x,grants:apiGrants(x),column_acls:{},isolation_test:testPath,
   justification:'Central-only fiscal entry; private audited repair and retained-initial support preserve immutable originals. Fictitious isolated fixture.'})),
   allow_catalog_changes:{policies:stable(after.policies),triggers:stable(after.triggers)}};
  const created=changed.map(({schema,name,kind,identity})=>({schema,name,kind,identity}));
  const checked=checkPermissionContract({before,after,contract,created});assert.ok(checked.ok,checked.errors.join('\n'));
  return {before,after,contract,created};
 }finally{await db.close();}
}
if(process.argv.includes('--emit')){
 mkdirSync(folder,{recursive:true});
 const pin=(path,value)=>{const s=JSON.stringify(value,null,2)+'\n';writeFileSync(path,s);return {path,sha256:sha(s)};};
 const release={schema_version:1,project:'kora',scope:'Combined isolated update/rebuild of supplier automation and already-published retained-initial support; fictitious data only.',
  migration_sha256:Object.fromEntries(migrations.map(p=>[p,sha(read(p))])),isolation_tests:[{path:testPath,sha256:sha(read(testPath))}],test_runner_sha256:sha(read('scripts/run-kora-local-tests.mjs'))};
 for(const scenario of ['upgrade','rebuild']){release[scenario]={};for(const [k,v]of Object.entries(await capture(scenario)))release[scenario][k]=pin(folder+'/'+scenario+'-'+k+'.json',v);}
 const ref=pin(folder+'/release.json',release);const path='config/kora-permission-release.json';const root=JSON.parse(read(path));root.additional_releases=root.additional_releases.filter(x=>x.path!==ref.path);root.additional_releases.push(ref);pin(path,root);
 console.log('Evidence verified and pinned.');
}
