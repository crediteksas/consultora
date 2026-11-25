import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {checkPermissionContract} from './check-permission-contract.mjs';
export const folder='tests/fixtures/supabase-compat/liquidaciones-pesos';
export const prior='supabase/migrations/20261104174100_alo_total_accesorios_rectificacion.sql';
export const migration='supabase/migrations/20261125215257_liquidaciones_alo_payjoy_pesos_enteros.sql';
export const testPath='tests/security/supabase-compatibility-liquidaciones-pesos.test.mjs';
const read=p=>readFileSync(p,'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
const targets=new Set(['calcular_liquidacion_sin_datos_pago','aliados_impedir_cambio_aprobado','aliados_impedir_cambio_operacion_aprobada','tesoreria_generar_destinos_liquidacion','aliados_importar_liquidacion']);
export async function capture(scenario){
 const db=await PGlite.create();
 try {
  await db.exec(read('tests/fixtures/supabase-compat/alo-accesorios/before-fixture.sql'));
  if(scenario==='rebuild')await db.exec('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
  await db.exec(`create function public.aliados_importar_liquidacion(p_plataforma text,p_nombre text,p_sha256 text,p_storage_path text,p_size bigint,p_mime text,p_periodo_desde date,p_periodo_hasta date,p_fecha_corte date,p_rows jsonb,p_operations jsonb,p_incidents jsonb,p_idempotency_key uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$begin return null;end$$;
   revoke all on function public.aliados_importar_liquidacion(text,text,text,text,bigint,text,date,date,date,jsonb,jsonb,jsonb,uuid) from public,anon;
   grant execute on function public.aliados_importar_liquidacion(text,text,text,text,bigint,text,date,date,date,jsonb,jsonb,jsonb,uuid) to authenticated,service_role;`);
  const query=read('scripts/supabase-compat/catalog-query.sql');
  const catalog=async()=>{const c=Object.values((await db.query(query)).rows[0])[0];delete c.captured_at;return c;};
  const before=await catalog();await db.exec(read(prior));await db.exec(read(migration));const after=await catalog();
  const changed=after.functions.filter(f=>targets.has(f.name));assert.equal(changed.length,5);
  for(const f of changed){const old=before.functions.find(o=>o.schema===f.schema&&o.name===f.name&&o.identity===f.identity);assert.ok(old);assert.deepEqual(f.grants,old.grants);assert.equal(f.security_definer,old.security_definer);assert.deepEqual(f.config,old.config);}
  const fn=after.functions.find(f=>f.name==='rectificar_alo_accesorios');const table=after.relations.find(f=>f.name==='rectificaciones_alo_accesorios');
  assert.equal(fn.security_definer,false);assert.ok(table.rls);assert.equal(table.policy_count,0);
  for(const o of [fn,table])assert.deepEqual(o.grants.filter(g=>g.grantee!==o.owner),[]);
  await db.exec('GRANT USAGE ON SCHEMA kora_private TO anon,authenticated,service_role');
  for(const role of ['anon','authenticated','service_role']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('select kora_private.rectificar_alo_accesorios(null,null,1,1,1)'),e=>e.code==='42501');await assert.rejects(db.query('select * from kora_private.rectificaciones_alo_accesorios'),e=>e.code==='42501');await db.exec('RESET ROLE');}
  await db.exec('set role anon');await assert.rejects(db.query('select public.aliados_importar_liquidacion(null,null,null,null,null,null,null,null,null,null,null,null,null)'),e=>e.code==='42501');await db.exec('reset role');
  const objs=[...changed.map(f=>({...f,kind:'function'})),{...fn,kind:'function'},table];
  const contract={schema_version:1,project:'kora',objects:objs.map(o=>({...o,grants:o.grants.filter(g=>g.grantee!==o.owner),column_acls:{},isolation_test:testPath,justification:'Existing privileges preserved; private correction remains inaccessible to API roles.'}))};
  const created=objs.map(o=>({schema:o.schema,name:o.name,kind:o.kind,...(o.identity===undefined?{}:{identity:o.identity})}));
  const result=checkPermissionContract({before,after,contract,created});assert.ok(result.ok,result.errors.join('; '));
  return {before,after,contract,created};
 }finally{await db.close();}
}
if(process.argv.includes('--emit')){
 mkdirSync(folder,{recursive:true});
 const pin=(p,v)=>{const s=JSON.stringify(v,null,2)+'\n';writeFileSync(p,s);return{path:p,sha256:hash(s)};};
 const previous='tests/fixtures/supabase-compat/alo-accesorios/release.json';
 const evidence={schema_version:1,project:'kora',scope:'Combined isolated Aló correction and whole-peso liquidation upgrade/rebuild; reduced fictitious fixture, not a production RLS certification.',supersedes:[{path:previous,sha256:hash(read(previous))}],migration_sha256:{[prior]:hash(read(prior)),[migration]:hash(read(migration))},isolation_tests:[{path:testPath,sha256:hash(read(testPath))}],test_runner_sha256:hash(read('scripts/run-kora-local-tests.mjs'))};
 for(const scenario of ['upgrade','rebuild']){evidence[scenario]={};for(const[k,v]of Object.entries(await capture(scenario)))evidence[scenario][k]=pin(folder+'/'+scenario+'-'+k+'.json',v);}
 const ref=pin(folder+'/release.json',evidence);const rootPath='config/kora-permission-release.json';const root=JSON.parse(read(rootPath));
 root.additional_releases=root.additional_releases.filter(x=>x.path!==ref.path);if(!root.additional_releases.some(x=>x.path===previous))root.additional_releases.unshift(evidence.supersedes[0]);root.additional_releases.push(ref);pin(rootPath,root);
 console.log('Combined permission evidence recorded.');
}
