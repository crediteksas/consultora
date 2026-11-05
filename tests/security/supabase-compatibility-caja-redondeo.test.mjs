import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {capture,folder,migration} from '../../scripts/supabase-compat/caja-redondeo-evidence.mjs';
import {checkPermissionContract} from '../../scripts/supabase-compat/check-permission-contract.mjs';
for(const scenario of ['upgrade','rebuild'])test('Permisos de caja redondeada: '+scenario,async()=>{
 const data=await capture(scenario);assert.deepEqual(checkPermissionContract(data).errors,[]);
 assert.deepEqual(data.after,JSON.parse(readFileSync(folder+'/'+scenario+'-after.json')));
 const release=JSON.parse(readFileSync(folder+'/release.json'));
 assert.equal(release.migration_sha256[migration],createHash('sha256').update(readFileSync(migration)).digest('hex'));
 const bad=structuredClone(data);bad.after.functions.find(f=>f.name==='validar_arqueo_caja').grants.push({grantor:'postgres',grantee:'anon',privilege:'EXECUTE',grantable:false});
 assert.equal(checkPermissionContract(bad).ok,false);
});
