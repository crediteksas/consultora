import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {capture,folder} from '../../scripts/supabase-compat/liquidaciones-pesos-evidence.mjs';
import {checkPermissionContract} from '../../scripts/supabase-compat/check-permission-contract.mjs';
for(const scenario of ['upgrade','rebuild'])test('Permisos de liquidaciones enteras: '+scenario,async()=>{
 const state=await capture(scenario);
 assert.deepEqual(checkPermissionContract(state).errors,[]);
 assert.deepEqual(state.after,JSON.parse(readFileSync(folder+'/'+scenario+'-after.json')));
 const bad=structuredClone(state);bad.after.functions.find(f=>f.name==='aliados_importar_liquidacion').grants.push({grantor:'postgres',grantee:'anon',privilege:'EXECUTE',grantable:false});
 assert.equal(checkPermissionContract(bad).ok,false);
});
