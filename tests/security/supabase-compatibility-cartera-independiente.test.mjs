import '../erp/cartera-independiente-deuda.test.mjs';
import '../erp/cartera-independiente-regla-real.test.mjs';
import '../erp/cartera-ui-deuda.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(p);const sha=b=>createHash('sha256').update(b).digest('hex');
const dir='tests/fixtures/supabase-compat/cartera-access';
test('la evidencia conserva la prueba anterior y distingue la prueba nueva',()=>{
 const release=JSON.parse(read(dir+'/release.json'));
 for(const scenario of ['upgrade','rebuild']){
  const prior=release.prior_native_receipts[scenario], current=release.prior_independent_receipts[scenario];
  assert.equal(sha(read(prior.path)),prior.sha256);assert.equal(JSON.parse(read(prior.path)).passed,true);
  assert.equal(sha(read(current.path)),current.sha256);const result=JSON.parse(read(current.path));
  assert.equal(result.passed,true);assert.equal(result.scenario,scenario);assert.equal(result.production_operations,0);
  assert.ok(result.checks.includes('dedicated mode remains safely closed on guard change'));
  assert.ok(result.checks.includes('authorized store manager can open independent KrediYA'));
  assert.equal(result.source_sha256['20261127195036_cartera_independiente_confirmacion_tienda.sql'],sha(read('supabase/migrations/20261127195036_cartera_independiente_confirmacion_tienda.sql')));
  assert.equal(result.source_sha256['native-independent-proof.py'],sha(read('releases/cartera-access-20261126/compatibility-session-role/native-independent-proof.py')));
 }
});
