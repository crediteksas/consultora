// Existing reviewed Nova business regressions remain independent from the fiscal module.
import '../../releases/nova-allied-flow-20261125/tests.mjs';
import '../../releases/nova-overdue-rule-20261125/tests.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {capture} from '../../scripts/supabase-compat/prior-nova-main-evidence.mjs';
for(const scenario of ['upgrade','rebuild'])test('previously applied Nova sources preserve service-only grants: '+scenario,async()=>{const r=await capture(scenario);assert.equal(r.created.length,11);});
