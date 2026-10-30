import assert from 'node:assert/strict';
import test from 'node:test';
import {HELPER,OLD_LOAD,NEW_LOAD,OPEN_ANCHOR,OLD_RENDER,SCROLL_ANCHOR,patchLiveChat} from './policy.mjs';
import {liveChatOverlay} from './overlay.mjs';
const incoming={timestamp:'2026-10-30T20:50:41.526Z',direccion:'entrada',contenido:'Hola nuevo'};
const outgoing={timestamp:'2026-10-30T20:50:30.455Z',direccion:'salida',contenido:'Prueba desde AURA'};
function harness({top=300,exists=true,tel='test-1'}={}){
  let writes=0,value='';
  const container={scrollTop:top,clientHeight:200,scrollHeight:500,get innerHTML(){return value},set innerHTML(v){value=v;writes++;this.scrollHeight=700;}};
  const draft={value:'Estoy escribiendo',selectionStart:8,selectionEnd:8};
  const details={value:'sin guardar'};
  const reads=[];
  const document={getElementById(id){reads.push(id);assert.equal(id,'chat-msgs-inner','el refresco no debe reconstruir el editor ni los detalles');return exists?container:null;}};
  const policy=new Function('document','initialTel','initialGroups','let currentTel=initialTel;let grouped=initialGroups;'+HELPER+';return {refreshOpenChat,chatMessagesHtml,rememberChatMessages,setGroups:v=>grouped=v,setTel:v=>currentTel=v};')(document,tel,{'test-1':[outgoing]});
  policy.rememberChatMessages(container,policy.chatMessagesHtml([outgoing]));
  return {policy,container,draft,details,reads,get writes(){return writes}};
}
test('muestra entrada y respuesta nuevas sin tocar el borrador ni los detalles',()=>{
  const h=harness();h.policy.setGroups({'test-1':[incoming,outgoing]});h.policy.refreshOpenChat();
  assert.ok(h.container.innerHTML.includes('Hola nuevo'));assert.ok(h.container.innerHTML.indexOf('Prueba desde AURA')<h.container.innerHTML.indexOf('Hola nuevo'));
  assert.equal(h.draft.value,'Estoy escribiendo');assert.equal(h.draft.selectionStart,8);assert.equal(h.details.value,'sin guardar');assert.equal(h.writes,1);
});
test('acompaña mensajes nuevos cuando el operador está al final del chat',()=>{
  const h=harness();h.policy.setGroups({'test-1':[incoming,outgoing]});h.policy.refreshOpenChat();assert.equal(h.container.scrollTop,700);
});
test('conserva la posición cuando el operador está leyendo historial',()=>{
  const h=harness({top:50});h.policy.setGroups({'test-1':[incoming,outgoing]});h.policy.refreshOpenChat();assert.equal(h.container.scrollTop,50);
});
test('no vuelve a renderizar el historial si los datos no cambiaron',()=>{
  const h=harness();h.policy.refreshOpenChat();assert.equal(h.writes,0);h.policy.setGroups({'test-1':[incoming,outgoing]});h.policy.refreshOpenChat();h.policy.refreshOpenChat();assert.equal(h.writes,1);
});
test('solo actualiza la conversación seleccionada y tolera que no haya chat abierto',()=>{
  const h=harness();h.policy.setGroups({'test-1':[incoming,outgoing],'test-2':[{...incoming,contenido:'Otro chat'}]});h.policy.setTel('test-2');h.policy.refreshOpenChat();assert.ok(h.container.innerHTML.includes('Otro chat'));assert.ok(!h.container.innerHTML.includes('Hola nuevo'));
  for(const setup of [{exists:false},{tel:null},{tel:'missing'}]){const absent=harness(setup);absent.policy.refreshOpenChat();assert.equal(absent.writes,0);}
});
test('trata el contenido y las etiquetas recibidas como texto, no como HTML',()=>{
  const h=harness();const html=h.policy.chatMessagesHtml([{...incoming,contenido:'<img src=x onerror="alert(1)"> & \'dato\'',intent:'<b>urgente</b>'}]);assert.ok(!html.includes('<img'));assert.ok(!html.includes('<b>'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&amp;'));assert.ok(html.includes('&#39;dato&#39;'));
});
test('el refresco manual y el sondeo actualizan el chat después de recibir los datos',async()=>{
  const events=[];let loaded=false;
  const load=new Function('hideSofiaServiceUnavailable','loadTiendas','loadStats','loadConvs','loadClients','recomputeInterventions','applyFilters','refreshOpenChat',NEW_LOAD+';return loadAll;')(
    ()=>events.push('hide'),async()=>events.push('stores'),async()=>{},async()=>{await Promise.resolve();loaded=true;events.push('conversations');},async()=>{},()=>events.push('recompute'),()=>events.push('filters'),()=>{assert.equal(loaded,true);events.push('chat');});
  await load();assert.deepEqual(events,['hide','stores','conversations','recompute','filters','chat']);
});
const fixture='<script>'+OLD_LOAD+'\n'+OPEN_ANCHOR+'\n'+OLD_RENDER+'\n'+SCROLL_ANCHOR+'\n}</script>';
const target='https://aura.crediteksas.com/creditek/agentes/creditek-agente-respuestas?embedded=1';
test('la corrección falla cerrada ante un HTML distinto o duplicado',()=>{assert.ok(patchLiveChat(fixture));assert.equal(patchLiveChat('otra versión'),null);assert.equal(patchLiveChat(fixture+fixture),null);});
test('la capa conserva las reglas previas y no toca APIs ni POST',async()=>{
  const worker=liveChatOverlay({fetch:async()=>new Response(fixture,{headers:{'content-type':'text/html','x-sofia-intervention-rule':'questions-only-20261030'}})});
  const response=await worker.fetch(new Request(target),{},{});assert.equal(response.headers.get('x-sofia-live-chat'),'20261030-1');assert.equal(response.headers.get('x-sofia-intervention-rule'),'questions-only-20261030');assert.equal(await response.text(),patchLiveChat(fixture));
  for(const request of [new Request('https://aura.crediteksas.com/api/sofia/stats'),new Request(target,{method:'POST'})]){const original=await worker.fetch(request,{},{});assert.equal(await original.text(),fixture);assert.equal(original.headers.get('x-sofia-live-chat'),null);}
});
