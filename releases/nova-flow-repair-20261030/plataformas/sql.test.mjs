import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {NativePostgres} from './native-postgres.mjs';
import {prepareDatabase,id,migration,rollback,originals,predecessors} from './fixture.mjs';
const native=process.env.NOVA_SQL_NATIVE_CONTAINER;
const modulePath=process.env.PGLITE_MODULE;
if(!native&&!modulePath)throw Error('Set PGLITE_MODULE or NOVA_SQL_NATIVE_CONTAINER; no installs or remote databases.');
const {PGlite}=native?{}:await import(modulePath.startsWith('/')?pathToFileURL(modulePath):modulePath);
const here=new URL('./',import.meta.url),receipt=[];
async function setup(options){
 const db=native?new NativePostgres(native):new PGlite();
 try{return await prepareDatabase(db,options);}catch(error){await db.close();throw error;}
}
for(const [name,sql,args]of[
 ['approve',"SELECT public.nova_retail_review($1,1,$2,'approve','Revisión sintética')",[id.source,id.actor]],
 ['request queries','SELECT public.nova_retail_request_queries($1,$2,false)',[id.source,id.actor]],
 ['confirm delivery','SELECT public.nova_retail_confirm_delivery($1,$2,1)',[id.source,id.actor]]
])test('SQL master revocation blocks '+name,async()=>{
 const{db}=await setup();try{await assert.rejects(db.query(sql,args),/CONSENT_REVOKED/);const r=await db.query('SELECT state,revision FROM public.nova_retail_cases');assert.deepEqual(r.rows,[{state:'review',revision:1}]);receipt.push(name+' revoked blocked');}finally{await db.close();}
});
test('SQL source revocation blocks approval even with current customer authorization',async()=>{
 const{db}=await setup({enabled:true,revoked:true});try{await assert.rejects(db.query("SELECT public.nova_retail_review($1,1,$2,'approve','Revisión sintética')",[id.source,id.actor]),/CONSENT_REVOKED/);receipt.push('source revocation blocked');}finally{await db.close();}
});
test('SQL general authorization is independent of expired platform query TTL',async()=>{
 const{db}=await setup({enabled:true});try{
  const c=await db.query('SELECT public.nova_retail_consent_current($1) active',[id.source]);assert.equal(c.rows[0].active,true);
  const r=await db.query("SELECT public.nova_retail_review($1,1,$2,'approve','Revisión sintética') r",[id.source,id.actor]);assert.equal(r.rows[0].r.state,'authorized');
  receipt.push('expired query TTL does not revoke general data authorization');
 }finally{await db.close();}
});
test('SQL save invalidates cached authorization after master revocation and retains historical evidence',async()=>{
 const{db,summary}=await setup();try{
  await db.query("UPDATE public.nova_retail_cases SET state='authorized',decision=$1,valid_until=now()+interval '1 day'",[{state:'authorized',canProcess:true,reasons:[]}]);
  const r=await db.query('SELECT public.nova_retail_save($1,$2,$3,$4) r',[id.source,'b'.repeat(64),{state:'authorized',canProcess:true,reasons:[]},summary]);
  assert.equal(r.rows[0].r.state,'review');assert.equal(r.rows[0].r.decision.canProcess,false);assert.deepEqual(r.rows[0].r.decision.reasons,['consent_revoked']);assert.deepEqual(r.rows[0].r.summary,summary);
  receipt.push('cached approval invalidated; evidence retained');
 }finally{await db.close();}
});
test('SQL helper rejects unknown sources and exposes no identities or public execution',async()=>{
 const{db}=await setup({enabled:true});try{
  const r=await db.query("SELECT public.nova_retail_consent_current('99999999-9999-4999-8999-999999999999') active");assert.equal(r.rows[0].active,false);
  const acl=await db.query("SELECT prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated,has_function_privilege('service_role',oid,'execute') service FROM pg_proc WHERE proname='nova_retail_consent_current'");
  assert.equal(acl.rows[0].prosecdef,false);assert.equal(acl.rows[0].anon,false);assert.equal(acl.rows[0].authenticated,false);assert.equal(acl.rows[0].service,true);assert.deepEqual(acl.rows[0].proconfig,['search_path=""']);
  receipt.push('helper invoker, service only, boolean output');
 }finally{await db.close();}
});
test('SQL predecessor drift aborts before creating helper',async()=>{
 const{db}=await setup({install:false});try{
  const row=originals.find(x=>x.proname==='nova_retail_review');await db.exec(row.definition.replace('NOTE_REQUIRED','CHANGED_NOTE_REQUIRED'));
  await assert.rejects(db.exec(migration),/NOVA_CONSENT_PREDECESSOR_DRIFT/);
  const r=await db.query("SELECT to_regprocedure('public.nova_retail_consent_current(uuid)') name");assert.equal(r.rows[0].name,null);
  receipt.push('predecessor drift rejected');
 }finally{await db.close();}
});
test('SQL rollback restores exact predecessor definitions and retains cases',async()=>{
 const{db,summary}=await setup();try{
  await db.exec(rollback);
  const r=await db.query("SELECT proname,md5(pg_get_functiondef(oid)) hash FROM pg_proc WHERE proname=ANY($1::text[]) ORDER BY proname",[predecessors.map(x=>x.proname)]);
  for(const row of r.rows)assert.equal(row.hash,predecessors.find(x=>x.proname===row.proname).definition_md5);
  const c=await db.query('SELECT summary FROM public.nova_retail_cases');assert.deepEqual(c.rows[0].summary,summary);
  receipt.push('exact rollback bodies, existing history retained');
 }finally{await db.close();}
});
test('SQL retains unchanged manual approval and audits revocation/restoration without resurrecting it',async()=>{
 const{db,summary}=await setup({enabled:true});try{
  await db.query("SELECT public.nova_retail_review($1,1,$2,'approve','Aprobación previa comprobada')",[id.source,id.actor]);
  const before=(await db.query('SELECT * FROM public.nova_retail_cases')).rows[0];
  const decision={state:'review',canProcess:false,reasons:['fewer_than_two_platforms']};
  const unchanged=(await db.query('SELECT public.nova_retail_save($1,$2,$3,$4) r',[id.source,'b'.repeat(64),decision,summary])).rows[0].r;
  assert.equal(unchanged.state,'authorized');assert.equal(unchanged.revision,before.revision);assert.equal(unchanged.manual_actor,id.actor);assert.equal(unchanged.manual_note,'Aprobación previa comprobada');
  await db.query('UPDATE public.clientes SET autorizacion_datos=false WHERE id=$1',[id.client]);
  const revoked=(await db.query('SELECT public.nova_retail_save($1,$2,$3,$4) r',[id.source,'c'.repeat(64),decision,summary])).rows[0].r;
  assert.equal(revoked.state,'review');assert.deepEqual(revoked.decision.reasons,['consent_revoked']);assert.deepEqual(revoked.summary,summary);
  await db.query('UPDATE public.clientes SET autorizacion_datos=true WHERE id=$1',[id.client]);
  const restored=(await db.query('SELECT public.nova_retail_save($1,$2,$3,$4) r',[id.source,'b'.repeat(64),decision,summary])).rows[0].r;
  assert.equal(restored.state,'review');assert.deepEqual(restored.decision.reasons,['fewer_than_two_platforms']);assert.equal(restored.manual_actor,null);assert.deepEqual(restored.summary,summary);
  const history=(await db.query("SELECT count(*)::int n FROM public.nova_retail_case_events WHERE action='review_approve'")).rows[0];assert.equal(history.n,1);
  receipt.push('unchanged manual approval retained; revocation/restoration audited without blind resurrection');
 }finally{await db.close();}
});
test.after(async()=>{await writeFile(new URL(native?'sql-native-test-receipt.json':'sql-test-receipt.json',here),JSON.stringify({mode:native?'isolated local native PostgreSQL; docker exec only':'isolated in-memory PGlite; zero production mutation or network',migrationSha256:createHash('sha256').update(migration).digest('hex'),passed:receipt.length,tests:receipt},null,2)+'\n');});

