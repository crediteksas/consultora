import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto,createHash} from 'node:crypto';
import {ids} from './harness.mjs';
const source=await readFile(new URL('../../nova-otp-delivery-20261031/deploy/nova/index.mjs',import.meta.url),'utf8'),end=source.indexOf('// releases/nova-reference-buttons-20261030/logo-base64.mjs');assert.ok(end>0);
const context=vm.createContext({crypto:webcrypto,TextEncoder,Uint8Array,btoa,atob,__name:x=>x});vm.runInContext(source.slice(0,end)+'\nglobalThis.sign=createReferenceQuickReply;globalThis.verify=verifyReferenceQuickReply;',context);
const secret='synthetic-reference-secret-at-least-32-bytes',now=Date.parse('2026-10-31T18:38:42Z'),recipientHash=createHash('sha256').update(secret+':3000000002').digest('hex'),reference={reference_id:'77777777-7777-4777-8777-777777777777',application_id:ids.app,source_application_id:ids.source,reference_type:'family',payload_hash:'a'.repeat(64),contact_hash:recipientHash};
async function signed(){return context.sign({context:reference,action:'start',secret,now});}
test('unchanged NOVA quick reply accepts its exact signed version and context',async()=>{const result=await context.verify({payload:await signed(),context:reference,recipientHash,secret,now});assert.equal(result?.id,reference.reference_id);assert.equal(result?.action,'start');});
for(const [field,value] of [['application_id',ids.other],['source_application_id',ids.other],['reference_type','personal'],['payload_hash','b'.repeat(64)]])test('unchanged signed quick reply rejects mismatched '+field,async()=>{assert.equal(await context.verify({payload:await signed(),context:{...reference,[field]:value},recipientHash,secret,now}),null);});
test('unchanged signed quick reply rejects changed recipient and expiry; no old version can authorize a new contact',async()=>{const payload=await signed();assert.equal(await context.verify({payload,context:reference,recipientHash:'c'.repeat(64),secret,now}),null);assert.equal(await context.verify({payload,context:reference,recipientHash,secret,now:now+86400000}),null);assert.equal(await context.verify({payload:payload.replace(/^nrq1\./,'nrq2.'),context:reference,recipientHash,secret,now}),null);});
