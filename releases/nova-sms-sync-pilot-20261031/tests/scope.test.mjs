import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline,candidate,baselineForm,candidateForm} from './fixture.mjs';
import {transformBundle,transformForm,providerFunction,managedUiFunction,embeddedForm,BASELINE_WORKER_SHA256,BASELINE_FORM_SHA256,PROVIDER_TIMEOUT_BEFORE,PROVIDER_TIMEOUT_AFTER,UI_TIMEOUT_BEFORE,UI_TIMEOUT_AFTER,sha} from '../transform.mjs';
test('pins exact published Worker/HTML and reproduces candidate deterministically',()=>{
 assert.equal(sha(baseline),BASELINE_WORKER_SHA256);assert.equal(sha(baselineForm),BASELINE_FORM_SHA256);const result=transformBundle(baseline,baselineForm);assert.equal(result.worker,candidate);assert.equal(result.form,candidateForm);assert.equal(embeddedForm(candidate).form,candidateForm);
});
test('reversing exactly the two timeout replacements restores all published bytes',()=>{
 const f=providerFunction(candidate),original=providerFunction(baseline);assert.equal(f.text.replace(PROVIDER_TIMEOUT_AFTER,PROVIDER_TIMEOUT_BEFORE),original.text);
 const normalized=candidate.slice(0,f.start)+original.text+candidate.slice(f.end),embedded=embeddedForm(normalized),oldEmbedded=embeddedForm(baseline);
 assert.equal(normalized.slice(0,embedded.start)+oldEmbedded.literal+normalized.slice(embedded.end),baseline);
 assert.equal(candidateForm.replace(UI_TIMEOUT_AFTER,UI_TIMEOUT_BEFORE),baselineForm);
});
test('only managed SMS browser send receives90s; ordinary WhatsApp and all other endpoints are unchanged',()=>{
 const before=managedUiFunction(baselineForm),after=managedUiFunction(candidateForm);assert.equal(after.text.replace(UI_TIMEOUT_AFTER,UI_TIMEOUT_BEFORE),before.text);assert.equal(after.text.split(UI_TIMEOUT_AFTER).length,2);
 assert.equal(candidateForm.slice(0,after.start),baselineForm.slice(0,before.start));assert.equal(candidateForm.slice(after.end),baselineForm.slice(before.end));
});
test('stale baseline, modified HTML and second application fail closed',()=>{
 assert.throws(()=>transformBundle(baseline+'\n',baselineForm),/WORKER_BASELINE_DRIFT/);assert.throws(()=>transformBundle(baseline,baselineForm+'\n'),/EMBEDDED_BASELINE_MISMATCH/);assert.throws(()=>transformBundle(candidate,candidateForm),/WORKER_BASELINE_DRIFT/);assert.throws(()=>transformForm(candidateForm),/FORM_BASELINE_DRIFT/);
});
test('all inline scripts parse and no reset/replacement that could discard Files is introduced',()=>{
 let n=0;for(const match of candidateForm.matchAll(/<script>([\s\S]*?)<\/script>/g)){new Function(match[1]);n++;}assert.ok(n>=2);assert.equal(candidateForm.includes('form.reset('),false);
});
test('async:false, response validation,5min TTL and8s RPC/WhatsApp waits remain unchanged',()=>{
 const strip=source=>{const f=providerFunction(source),e=embeddedForm(source);return source.slice(0,f.start)+'PROVIDER'+source.slice(f.end,e.start)+'FORM'+source.slice(e.end);};assert.equal(strip(candidate),strip(baseline));
 assert.match(candidate,/JSON\.stringify\(\{ recipients: \[phone\], content, async: false \}\)/);assert.match(candidate,/var TTL = 3e5;/);assert.match(candidate,/httpStatus === 200 && body3.ok === true && EXPRESS_SMS_UUID.test\(body3.consumptionId/);assert.match(candidate,/httpStatus === 202 && body3.ok === true/);
});
