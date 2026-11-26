import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {capture,folder} from '../../scripts/supabase-compat/rectificacion-soporte-aliados-evidence.mjs';
import {checkPermissionContract} from '../../scripts/supabase-compat/check-permission-contract.mjs';
for(const s of ['upgrade','rebuild'])test('Permisos de rectificación de soporte: '+s,async()=>{
 const d=await capture(s);assert.deepEqual(checkPermissionContract(d).errors,[]);
 assert.deepEqual(d.after,JSON.parse(readFileSync(folder+'/'+s+'-after.json')));
 const bad=structuredClone(d);bad.after.functions.find(f=>f.name==='rectificar_soporte_aliado').grants.push({grantor:'postgres',grantee:'authenticated',privilege:'EXECUTE',grantable:false});assert.equal(checkPermissionContract(bad).ok,false);
});
