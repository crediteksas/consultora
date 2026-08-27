import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AuraChannelWorkerSandbox} from '../../src/channel-worker/aura-channel-worker.mjs';
import {MemoryMessageIdempotency} from '../../src/channel-worker/memory-idempotency.mjs';
import {AuraChannelRouter} from '../../src/channel-router/aura-channel-router.mjs';
import {createSandboxIdentityDirectory} from '../../src/channel-router/identity-directory.mjs';

const router=new AuraChannelRouter({identities:createSandboxIdentityDirectory()});
const signed=()=>new AuraChannelWorkerSandbox({router,idempotency:new MemoryMessageIdempotency(),verifySignature:async()=>true});
const envelope=(id='wamid.sandbox')=>JSON.stringify({entry:[{changes:[{value:{messages:[{id,from:'SANDBOX_RETAIL_01',timestamp:'1787800000',type:'text',text:{body:'Solicitar autorización'}}]}}]}]});

test('verificación sandbox exige token inyectado y no lo persiste',()=>{
  const worker=signed();
  assert.equal(worker.verifyWebhook('https://sandbox.invalid/webhook?hub.mode=subscribe&hub.verify_token=PRIVATE&hub.challenge=OK','PRIVATE').status,200);
  assert.equal(worker.verifyWebhook('https://sandbox.invalid/webhook?hub.mode=subscribe&hub.verify_token=WRONG','PRIVATE').status,403);
});

test('webhook rechaza firma inválida antes de leer el payload',async()=>{
  const worker=new AuraChannelWorkerSandbox({router,idempotency:new MemoryMessageIdempotency(),verifySignature:async()=>false});
  assert.equal((await worker.receive({rawBody:envelope(),signature:'invalid'})).status,401);
});

test('mensaje válido se normaliza y enruta a NOVA sin envío real',async()=>{
  const result=await signed().receive({rawBody:envelope(),signature:'sandbox'});
  assert.equal(result.status,200);
  assert.equal(result.body.accepted,1);
  assert.equal(result.body.decisions[0].destination,'NOVA');
  assert.equal(result.body.real_messages_sent,0);
  assert.equal(result.body.outbound_enabled,false);
});

test('idempotencia evita procesar dos veces el mismo message id',async()=>{
  const worker=signed(),body=envelope('wamid.duplicate');
  assert.equal((await worker.receive({rawBody:body,signature:'sandbox'})).body.accepted,1);
  assert.equal((await worker.receive({rawBody:body,signature:'sandbox'})).body.accepted,0);
});

test('payload inválido responde controladamente',async()=>{
  assert.deepEqual(await signed().receive({rawBody:'{',signature:'sandbox'}),{status:400,body:{error:'INVALID_JSON'}});
});

test('worker sandbox no contiene transporte, secretos ni referencias a Sofía',async()=>{
  const source=await readFile(new URL('../../src/channel-worker/aura-channel-worker.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/graph\.facebook\.com|fetch\s*\(|WHATSAPP_TOKEN|PHONE_NUMBER_ID|SOFIA|wrangler deploy/i);
});
