import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transformForm as approvedTransform } from './ui-transform-approved-base.mjs';
import { transformForm } from '../../ui-transform.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const before=read('./ui-transform-approved-base.mjs'),after=read('../../ui-transform.mjs');
assert.equal(sha(before),'655c7238fbeac4532cf0d051eb0b4a26d982abfccd6fb6f13dc8c163a6bb921a');
const added=[
  "repairNotice.className='ref-block';repairMessage.style.cssText='margin:0 0 8px;font-size:14px';",
  "for(const button of [repairAuth,repairCheck]){button.className='btn-secondary';button.style.cssText='min-height:44px;width:100%;padding:12px 16px;white-space:normal;margin-top:8px';}",
  "  repairRecoverySave.className='btn-submit';repairRecoverySave.style.minHeight='44px';",
];
let stripped=after;
for(const line of added){assert.equal(stripped.split(line+'\n').length,2);stripped=stripped.replace(line+'\n','');}
assert.equal(stripped,before,'Removing precisely the three style lines must recover the approved core byte for byte');
const baseline=read('../../../baseline/clientes/form.html'),oldForm=approvedTransform(baseline),form=transformForm(baseline);
assert.equal(sha(oldForm),'236a2de7058e8ecfad89d8b42438d90d247a907ca3c93bdaf994271476c03890');
let strippedForm=form;for(const line of added){assert.equal(strippedForm.split(line+'\n').length,2);strippedForm=strippedForm.replace(line+'\n','');}
assert.equal(strippedForm,oldForm,'The generated form differs only by the same three style lines');
assert.equal(form.split('\n').length-oldForm.split('\n').length,3);
const vm=JSON.parse(read('../receipt.json')),chrome=JSON.parse(read('../browser/evidence/receipt.json'));
assert.equal(vm.candidateFormSha256,sha(form));assert.equal(vm.tests,33);assert.equal(vm.passed,33);assert.equal(vm.failed,0);
assert.equal(chrome.candidateFormSha256,sha(form));assert.equal(chrome.tests,4);assert.equal(chrome.passed,4);assert.equal(chrome.failed,0);
const buttons=chrome.results.flatMap(result=>result.mobileButtonGeometry||[]);assert.equal(buttons.length,3);
for(const button of buttons){assert.equal(button.viewportWidth,390);assert.ok(button.height>=44);assert.ok(button.left>=0&&button.right<=button.viewportWidth&&button.width<=button.viewportWidth);}
const diff=spawnSync('git',['diff','--no-index','--',fileURLToPath(new URL('./ui-transform-approved-base.mjs',import.meta.url)),fileURLToPath(new URL('../../ui-transform.mjs',import.meta.url))],{encoding:'utf8'});
assert.equal(diff.status,1);writeFileSync(new URL('./style-only.patch',import.meta.url),diff.stdout);
const receipt={checkedAt:new Date().toISOString(),status:'PASS',approvedModuleSha256:sha(before),newModuleSha256:sha(after),approvedFormSha256:sha(oldForm),newFormSha256:sha(form),addedLines:3,removedLines:0,approvedCoreByteIdenticalAfterRemovingStyleLines:true,vmTests:{passed:vm.passed,failed:vm.failed},chromeTests:{passed:chrome.passed,failed:chrome.failed,browser:chrome.browser},mobileButtonGeometry:buttons,screenshotSha256:Object.fromEntries(chrome.results.flatMap(result=>result.screenshots).map(path=>[path,sha(readFileSync(new URL('../browser/'+path,import.meta.url)))])),productionWrites:false,realMessages:false};
writeFileSync(new URL('./receipt.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
