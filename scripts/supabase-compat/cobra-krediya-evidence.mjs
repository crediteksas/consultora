// Native, wholly fictional release evidence. No network or production database.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {checkPermissionContract} from './check-permission-contract.mjs';
const root='releases/cobra-krediya-20261125';
const folder='tests/fixtures/supabase-compat/cobra-krediya';
const testPath='tests/security/supabase-compatibility-cobra-krediya.test.mjs';
const context='colima-cobra-krediya-20261125',container='cobra-krediya-release-evidence';
const image='sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94';
const migrations=['20261126012515_cobra_krediya_cut_history.sql','20261126013403_cobra_krediya_collection_operation_link.sql'].map(n=>'supabase/migrations/'+n);
const read=p=>readFileSync(p,'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const key=x=>x.schema+'.'+x.name+(x.identity===undefined?'':'('+x.identity+')');
const objects=s=>[...s.relations,...s.functions.map(f=>({...f,kind:'function'}))];
const runtime=new Set(['cobra_quality_operator','cobra_quality_importer','cobra_quality_fold','cobra_quality_document','cobra_krediya_payload_digest','cobra_krediya_save_cut','cobra_krediya_save_collection']);
const triggerFunctions=new Set(['cobra_krediya_prepare_cut','cobra_krediya_link_cut','cobra_krediya_immutable','cobra_krediya_validate_event','cobra_krediya_guard_event_history']);
const grants=o=>o.grants.filter(g=>g.grantee!==o.owner);
export function assertExpected(after,before){
 const functions=after.functions.filter(f=>f.name.startsWith('cobra_'));
 assert.equal(functions.length,12);
 for(const f of functions){
  assert.equal(f.schema,'public');assert.equal(f.owner,'postgres');assert.equal(f.security_definer,false);
  assert.deepEqual(f.config,['search_path=""']);
  assert.ok(runtime.has(f.name)||triggerFunctions.has(f.name));
  assert.deepEqual(grants(f).map(g=>[g.grantee,g.privilege,g.grantable]),runtime.has(f.name)?[['authenticated','EXECUTE',false]]:[]);
 }
 const cuts=after.relations.find(r=>r.name==='cobra_krediya_cuts');
 const links=after.relations.find(r=>r.name==='cobra_krediya_cut_operations');
 const events=after.relations.find(r=>r.name==='credit_collection_events');
 for(const r of [cuts,links,events]){assert.equal(r.schema,'public');assert.equal(r.kind,'r');assert.equal(r.owner,'postgres');}
 for(const r of [cuts,links]){assert.ok(r.rls&&r.force_rls);assert.equal(r.policy_count,2);}
 assert.deepEqual(grants(cuts),[]);
 assert.deepEqual(grants(links).map(g=>[g.grantee,g.privilege,g.grantable]),[['authenticated','SELECT',false]]);
 assert.ok(events.rls);assert.equal(events.force_rls,false);assert.equal(events.policy_count,3);
 // A deliberately broad existing fixture grant is retained, not newly introduced.
 // Column ACL assertions below describe exact catalog changes, not effective INSERT limits.
 assert.deepEqual(grants(events).map(g=>[g.grantee,g.privilege,g.grantable]),[['authenticated','INSERT',false],['authenticated','SELECT',false]]);
 const selectCols=new Set('id request_id file_sha256 payload_sha256 cohort_month cutoff source_name observations link_keys row_count received_by received_at schema_version'.split(' '));
 const insertCols=new Set('request_id file_sha256 cohort_month cutoff source_name source_rows'.split(' '));
 for(const c of cuts.columns){const rights=(insertCols.has(c.name)?'a':'')+(selectCols.has(c.name)?'r':'');assert.equal(c.acl,rights?'{authenticated='+rights+'/postgres}':null);}
 for(const c of links.columns)assert.equal(c.acl,'{authenticated=a/postgres}');
 const eventInsert=new Set('operation_id client_request_id obligation_id actor_type event_type channel note promise_date promise_amount created_by'.split(' '));
 for(const c of events.columns)assert.equal(c.acl,eventInsert.has(c.name)?'{authenticated=a/postgres}':null);
 const expected=JSON.parse(read(folder+'/expected-policy-triggers.json'));
 assert.equal(expected.policies.length,6);assert.equal(expected.triggers.length,9);
 for(const catalog of ['policies','triggers']){
  const sort=values=>values.map(stable).sort();
  assert.deepEqual(sort(after[catalog]),sort([...before[catalog],...expected[catalog]]),catalog+' changed beyond the independently reviewed additions');
 }
}
export function makeBundle(before,after){
 assertExpected(after,before);
 const prior=new Map(objects(before).map(o=>[key(o),o]));
 const changed=objects(after).filter(o=>!prior.has(key(o))||stable(o)!==stable(prior.get(key(o))));
 assert.equal(changed.length,15);
 assert.ok(changed.every(o=>o.name.startsWith('cobra_')||o.name==='credit_collection_events'));
 const contract={schema_version:1,project:'kora',objects:changed.map(o=>({...o,grants:grants(o),column_acls:Object.fromEntries((o.columns||[]).filter(c=>c.acl).map(c=>[c.name,c.acl])),isolation_test:testPath,justification:'Immutable provider cuts and validated collection events; explicit operators only; no payment or source-ledger writes. Fictional native dependency model.'})),allow_catalog_changes:{policies:stable(after.policies),triggers:stable(after.triggers)}};
 const created=changed.map(({schema,name,kind,identity})=>({schema,name,kind,identity}));
 const result=checkPermissionContract({before,after,contract,created});assert.ok(result.ok,result.errors.join('\n'));
 return {before,after,contract,created};
}
if(process.argv.includes('--emit')){
 const docker=args=>execFileSync('docker',['--context',context,...args],{encoding:'utf8'});
 const inspection=JSON.parse(docker(['inspect',container]))[0];
 assert.equal(inspection.Image,image);assert.equal(inspection.HostConfig.NetworkMode,'none');assert.equal(inspection.Mounts.filter(m=>m.Type==='bind').length,0);assert.equal(Object.keys(inspection.HostConfig.PortBindings||{}).length,0);
 const run=(db,sql)=>execFileSync('docker',['--context',context,'exec','-i',container,'psql','-X','-A','-t','-q','-U','postgres','-v','ON_ERROR_STOP=1','-d',db],{input:sql,encoding:'utf8',maxBuffer:10*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
 mkdirSync(folder,{recursive:true});
 const pin=(path,value)=>{const text=JSON.stringify(value,null,2)+'\n';writeFileSync(path,text);return{path,sha256:sha(text)};};
 const receipt={run_id:randomUUID(),image,runner_sha256:sha(read(import.meta.filename)),fixture_sha256:sha(read(root+'/db-tests/fixture.sql')),setup_sha256:sha(read(folder+'/setup.sql')),expected_catalog_sha256:sha(read(folder+'/expected-policy-triggers.json')),catalog_query_sha256:sha(read('scripts/supabase-compat/catalog-query.sql')),network:'none',production_operations:0,scenarios:{}};
 const release={schema_version:1,project:'kora',scope:'Two exact migrations together in PostgreSQL 17.6, permissive and restricted defaults, fictional dependencies only. A pre-existing broad INSERT grant on events is intentionally preserved; column ACLs do not narrow it. Not a full production rebuild.',migration_sha256:Object.fromEntries(migrations.map(p=>[p,sha(read(p))])),isolation_tests:[{path:testPath,sha256:sha(read(testPath))}],test_runner_sha256:sha(read('scripts/run-kora-local-tests.mjs'))};
 for(const scenario of ['upgrade','rebuild']){
  const db='cobra_release_'+randomUUID().replaceAll('-','');run('postgres','create database '+db);
  try{
   run(db,read(root+'/db-tests/fixture.sql')+'\n'+read(folder+'/setup.sql'));
   if(scenario==='rebuild')run(db,'alter default privileges in schema public revoke all on tables from anon,authenticated,service_role; alter default privileges in schema public revoke execute on functions from anon,authenticated,service_role; alter default privileges revoke execute on functions from public;');
   const capture=()=>{const s=JSON.parse(run(db,read('scripts/supabase-compat/catalog-query.sql')));assert.ok(s.server_version.startsWith('17.6'));delete s.captured_at;return s;};
   const before=capture();for(const p of migrations)run(db,read(p));const after=capture();
   const bundle=makeBundle(before,after);release[scenario]=Object.fromEntries(Object.entries(bundle).map(([k,v])=>[k,pin(folder+'/'+scenario+'-'+k+'.json',v)]));
   const user='11111111-1111-4111-8111-111111111111',manager='66666666-6666-4666-8666-666666666666';
   const asUser=id=>"set role authenticated;select set_config('request.jwt.claim.sub','"+id+"',false);";
   const row={contract:'fiction001',document:'111001',customer:'Ana Ejemplo',store:'Tienda Ficticia A',created:'2026-10-01',financed_cents:40000000,fee_cents:5000000,total_installments:12,frequency:15,cycled:3,paid:1,overdue:2,contract_status:'signed_approved'};
   const last=sql=>JSON.parse(run(db,sql).split('\n').at(-1));
   const saved=last(asUser(user)+"select public.cobra_krediya_save_cut(gen_random_uuid(),repeat('a',64),'2026-10-01','2026-11-25','fiction.xlsx','"+JSON.stringify([row])+"');");assert.equal(saved.row_count,1);
   const event=last(asUser(manager)+"select public.cobra_krediya_save_collection(gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','note','internal','Fictional release check');");assert.equal(event.payment_created,false);
   assert.equal(last(asUser(manager)+'select count(*) from public.liquidation_operations;'),0);
   assert.throws(()=>run(db,"set role anon;select public.cobra_quality_operator();"),/permission denied/);
   assert.equal(last(asUser('33333333-3333-4333-8333-333333333333')+'select count(id) from public.cobra_krediya_cuts;'),0);
   assert.equal(last('select count(*) from public.credit_repayments;'),0);
   receipt.scenarios[scenario]={database:db,server_version:after.server_version,contracted_objects:bundle.contract.objects.length,captured_before_and_after:true,checks:['qualified importer saves a cut','tracking manager saves a note without payment','manager has no source rows','anonymous RPC denied','ordinary user cannot read cuts','payment table unchanged'],snapshot_sha256:Object.fromEntries(Object.entries(release[scenario]).map(([k,v])=>[k,v.sha256]))};
  }finally{run('postgres','drop database '+db);}
 }
 receipt.migration_sha256=release.migration_sha256;release.native_receipt=pin(folder+'/native-receipt.json',receipt);
 const ref=pin(folder+'/release.json',release),configPath='config/kora-permission-release.json',config=JSON.parse(read(configPath));
 config.additional_releases=config.additional_releases.filter(x=>x.path!==ref.path);config.additional_releases.push(ref);pin(configPath,config);
 console.log(JSON.stringify({ok:true,run_id:receipt.run_id,scenarios:receipt.scenarios}));
}
