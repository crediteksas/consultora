import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BASELINE_WORKER_SHA256,BASELINE_FORM_SHA256,transformBundle,sourceProof,sha} from '../transform.mjs';
const root=new URL('../',import.meta.url),before=await readFile(new URL('../nova-sms-sync-pilot-20261031/deploy/clientes/index.mjs',root),'utf8'),form=await readFile(new URL('deploy/clientes/form.html',root),'utf8'),after=await readFile(new URL('deploy/clientes/index.mjs',root),'utf8');
test('exact published predecessor and external HTML are pinned; rebuild is identical',()=>{assert.equal(sha(before),BASELINE_WORKER_SHA256);assert.equal(sha(form),BASELINE_FORM_SHA256);assert.equal(transformBundle(before,form).worker,after);});
test('all bytes outside referenceSourceProof and both HTML copies remain identical',()=>{const b=sourceProof(before),a=sourceProof(after);assert.equal(before.slice(0,b.start),after.slice(0,a.start));assert.equal(before.slice(b.end),after.slice(a.end));assert.equal(transformBundle(before,form).form,form);});
test('baseline drift aborts before candidate output',()=>{assert.throws(()=>transformBundle(before+'\n',form),/BASELINE_DRIFT/);assert.throws(()=>transformBundle(before,form+'\n'),/BASELINE_DRIFT/);});
