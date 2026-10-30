import assert from 'node:assert/strict';
import test from 'node:test';
import {patchQuestionAlert,OLD_GUARD,NEW_GUARD} from './policy.mjs';
import {questionAlertOverlay} from './overlay.mjs';

const html="<script>function interventionReasons(messages,client){"+OLD_GUARD+"}</script>";
const target='https://aura.crediteksas.com/creditek/agentes/creditek-agente-respuestas?embedded=1';
test('modifica solo el detector de preguntas, conserva el aviso y falla cerrado ante versiones distintas',()=>{
  const result=patchQuestionAlert(html);
  assert.ok(result.includes(NEW_GUARD));
  assert.ok(result.includes('function isConversationQuestion'));
  assert.equal(patchQuestionAlert('otra versión'),null);
  assert.equal(patchQuestionAlert(html+html),null);
});
test('conserva cabeceras previas y solo transforma la página de Sofía',async()=>{
  const legacy={fetch:async()=>new Response(html,{headers:{'content-type':'text/html','x-sofia-quality-aura':'20261028-1'}})};
  const worker=questionAlertOverlay(legacy);
  const modified=await worker.fetch(new Request(target),{},{});
  assert.equal(modified.headers.get('x-sofia-intervention-rule'),'questions-only-20261030');
  assert.equal(modified.headers.get('x-sofia-quality-aura'),'20261028-1');
  assert.equal(await modified.text(),patchQuestionAlert(html));
  for(const request of [new Request('https://aura.crediteksas.com/api/sofia/stats'),new Request(target,{method:'POST'})]){
    const untouched=await worker.fetch(request,{},{});assert.equal(await untouched.text(),html);assert.equal(untouched.headers.get('x-sofia-intervention-rule'),null);
  }
});
test('no rompe una página cambiada ni una respuesta que excede el límite',async()=>{
  for(const body of ['otra versión','a'.repeat(270000)]){
    const worker=questionAlertOverlay({fetch:async()=>new Response(body,{headers:{'content-type':'text/html'}})});
    const response=await worker.fetch(new Request(target),{},{});
    assert.equal(await response.text(),body);assert.equal(response.headers.get('x-sofia-intervention-rule'),null);
  }
});
