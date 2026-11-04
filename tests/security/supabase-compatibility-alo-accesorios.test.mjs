import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {capture,folder,migration} from '../../scripts/supabase-compat/alo-permission-evidence.mjs';
import {checkPermissionContract} from '../../scripts/supabase-compat/check-permission-contract.mjs';
for(const scenario of ['upgrade','rebuild'])test('Aló permission delta: '+scenario,async()=>{
 const d=await capture(scenario);
 assert.deepEqual(checkPermissionContract(d).errors,[]);
 const expected=JSON.parse(readFileSync(folder+'/'+scenario+'-after.json'));
 assert.deepEqual(d.after,expected);
 const release=JSON.parse(readFileSync(folder+'/release.json'));
 assert.equal(release.migration_sha256[migration],createHash('sha256').update(readFileSync(migration)).digest('hex'));
 const bad=structuredClone(d);bad.after.functions.find(f=>f.name==='rectificar_alo_accesorios').grants.push({grantor:'postgres',grantee:'anon',privilege:'EXECUTE',grantable:false});
 assert.equal(checkPermissionContract(bad).ok,false);
});
