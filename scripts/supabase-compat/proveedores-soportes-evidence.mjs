// Reduced PGlite fixture: catalog gate plus direct checks of storage policies.
// It does not reproduce provider ownership or prove hosted Storage behavior.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {checkPermissionContract} from './check-permission-contract.mjs';
const folder='tests/fixtures/supabase-compat/proveedores-soportes-privados',migration='supabase/migrations/20261127120333_proveedores_soportes_privados.sql',test='tests/security/supabase-compatibility-proveedores-soportes-privados.test.mjs';
const read=p=>readFileSync(p,'utf8'),sha=x=>createHash('sha256').update(x).digest('hex');
async function capture(scenario){const db=await PGlite.create();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;
  create function public.es_central() returns boolean language sql stable as $$select current_setting('test.role',true)='central'$$;
  create table storage.buckets(id text primary key,public boolean);
  create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated,anon;grant select,insert on storage.objects to authenticated,anon;
  create policy public_photos on storage.objects for select to public using(bucket_id='productos-fotos');
  create policy public_photo_upload on storage.objects for insert to authenticated with check(bucket_id='productos-fotos');`);
 if(scenario==='rebuild')await db.exec('alter default privileges revoke execute on functions from public');
 else await db.exec("insert into storage.buckets values('proveedores-soportes-privados',false),('productos-fotos',true)");
 const snap=async()=>{const q=await db.query(read('scripts/supabase-compat/catalog-query.sql'));const v=Object.values(q.rows[0])[0];delete v.captured_at;return v;};
 const before=await snap();await db.exec(read(migration));const after=await snap();
 const actual=await db.query("select polname,polcmd,polpermissive from pg_policy where polrelid='storage.objects'::regclass and polname like 'proveedores_soportes_%' order by polname");
 assert.deepEqual(actual.rows.map(x=>[x.polname,x.polcmd,x.polpermissive]),[['proveedores_soportes_central_delete','d',false],['proveedores_soportes_central_insert','a',false],['proveedores_soportes_central_select','r',false],['proveedores_soportes_central_update','w',false],['proveedores_soportes_no_publicos','a',false],['proveedores_soportes_no_publicos_delete','d',false],['proveedores_soportes_no_publicos_select','r',false],['proveedores_soportes_no_publicos_update','w',false],['proveedores_soportes_privados_anon','*',false],['proveedores_soportes_privados_bound','*',false],['proveedores_soportes_privados_insert','a',true],['proveedores_soportes_privados_select','r',true]]);
 const contract={schema_version:1,project:'kora',objects:[]},created=[];
 const result=checkPermissionContract({before,after,contract,created});assert.ok(result.ok,result.errors.join('; '));
 return {before,after,contract,created};
 }finally{await db.close();}}
mkdirSync(folder,{recursive:true});const pin=(p,value)=>{const b=JSON.stringify(value,null,2)+'\n';writeFileSync(p,b);return {path:p,sha256:sha(b)};};
const release={schema_version:1,project:'kora',scope:'Reduced fictional PGlite upgrade/rebuild. Generic catalog excludes provider-owned storage policies; exact policy assertions and RLS tests are separately executed. Hosted owner/permissions require verification.',migration_sha256:{[migration]:sha(read(migration))},isolation_tests:[{path:test,sha256:sha(read(test))}],test_runner_sha256:sha(read('scripts/run-kora-local-tests.mjs'))};
for(const scenario of ['upgrade','rebuild'])release[scenario]=Object.fromEntries(Object.entries(await capture(scenario)).map(([k,v])=>[k,pin(folder+'/'+scenario+'-'+k+'.json',v)]));
const ref=pin(folder+'/release.json',release),path='config/kora-permission-release.json',root=JSON.parse(read(path));root.additional_releases=(root.additional_releases||[]).filter(x=>x.path!==ref.path);root.additional_releases.push(ref);pin(path,root);console.log(JSON.stringify({fixture_scenarios:2,production_operations:0,release:ref.path}));
