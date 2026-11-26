import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {capture} from '../../scripts/supabase-compat/prior-nova-auto-alerts-evidence.mjs';
import '../../releases/nova-lujored-20261126/tests.mjs';
import '../../releases/nova-auto-alerts-20261126/tests.mjs';
for(const scenario of ['upgrade','rebuild'])test('combined NOVA automatic alert permission preservation '+scenario,async()=>{const x=await capture(scenario);assert.equal(x.contract.objects.length,13);for(const part of ['before','after','contract','created'])assert.deepEqual(x[part],JSON.parse(readFileSync(new URL('../fixtures/supabase-compat/prior-nova-auto-alerts/'+scenario+'-'+part+'.json',import.meta.url),'utf8')));});
