import test from 'node:test';import assert from 'node:assert/strict';import {capture} from '../../scripts/supabase-compat/prior-nova-lujored-evidence.mjs';
import '../../releases/nova-lujored-20261126/tests.mjs';
for(const scenario of ['upgrade','rebuild'])test('already-applied Nova Lujo function ACL preservation '+scenario,async()=>{const x=await capture(scenario);assert.equal(x.contract.objects.length,13);});
