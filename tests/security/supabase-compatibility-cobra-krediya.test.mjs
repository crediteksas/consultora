// The official test:local runner discovers this file without changing its reviewed fingerprint.
import '../erp/cobra-krediya-quality.test.mjs';
import '../erp/cobra-krediya-persistence.test.mjs';
import '../erp/cobra-krediya-connection.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeBundle,assertExpected} from '../../scripts/supabase-compat/cobra-krediya-evidence.mjs';
import {checkPermissionContract} from '../../scripts/supabase-compat/check-permission-contract.mjs';
const folder='tests/fixtures/supabase-compat/cobra-krediya';
const read=p=>readFileSync(p,'utf8');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
test('active COBRA assets and SQL equal the reviewed candidate',()=>{
 const root='releases/cobra-krediya-20261125',m=JSON.parse(read(root+'/integration/source-manifest.json'));
 for(const [p,v] of Object.entries(m.sources)){assert.equal(sha(root+'/'+p),v.sha256);assert.equal(sha(v.target),v.sha256);}
 for(const name of ['20261126012515_cobra_krediya_cut_history.sql','20261126013403_cobra_krediya_collection_operation_link.sql'])assert.equal(sha('supabase/migrations/'+name),sha(root+'/supabase/migrations/'+name));
});
for(const scenario of ['upgrade','rebuild'])test('native '+scenario+' contract is pinned and rejects excessive permissions',()=>{
 const release=JSON.parse(read(folder+'/release.json'));
 assert.equal(sha(release.native_receipt.path),release.native_receipt.sha256);
 const receipt=JSON.parse(read(release.native_receipt.path));
 assert.equal(receipt.runner_sha256,sha('scripts/supabase-compat/cobra-krediya-evidence.mjs'));
 assert.equal(receipt.fixture_sha256,sha('releases/cobra-krediya-20261125/db-tests/fixture.sql'));
 assert.equal(receipt.setup_sha256,sha(folder+'/setup.sql'));
 assert.equal(receipt.expected_catalog_sha256,sha(folder+'/expected-policy-triggers.json'));
 assert.equal(receipt.catalog_query_sha256,sha('scripts/supabase-compat/catalog-query.sql'));
 assert.equal(receipt.network,'none');assert.equal(receipt.production_operations,0);
 assert.equal(receipt.scenarios[scenario].checks.length,6);
 for(const [p,h] of Object.entries(release.migration_sha256)){assert.equal(sha(p),h);assert.equal(receipt.migration_sha256[p],h);}
 for(const [k,p] of Object.entries(release[scenario]))assert.equal(receipt.scenarios[scenario].snapshot_sha256[k],p.sha256);
 const bundle=Object.fromEntries(Object.entries(release[scenario]).map(([k,p])=>{assert.equal(sha(p.path),p.sha256);return[k,JSON.parse(read(p.path))];}));
 assert.ok(checkPermissionContract(bundle).ok);assert.deepEqual(makeBundle(bundle.before,bundle.after).contract,bundle.contract);
 for(const mutate of [s=>s.functions.find(f=>f.name==='cobra_krediya_save_cut').grants.push({grantee:'anon',privilege:'EXECUTE',grantable:false,grantor:'postgres'}),s=>s.relations.find(r=>r.name==='cobra_krediya_cuts').rls=false,s=>s.relations.find(r=>r.name==='cobra_krediya_cuts').columns.find(c=>c.name==='source_rows').acl='{authenticated=ar/postgres}',s=>s.policies.find(p=>p.name==='cobra_quality_cuts_read').using_md5='00000000000000000000000000000000',s=>s.policies.find(p=>p.name==='fictional_source_access').roles=['anon'],s=>s.triggers.splice(s.triggers.findIndex(t=>t.name==='cobra_events_no_truncate'),1)]){
  const after=structuredClone(bundle.after);mutate(after);assert.throws(()=>assertExpected(after,bundle.before));assert.equal(checkPermissionContract({...bundle,after}).ok,false);
 }
});
