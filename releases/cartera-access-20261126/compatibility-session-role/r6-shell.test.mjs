import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{readFileSync as read}from'node:fs';import{createRequire}from'node:module';
const file=p=>read(new URL(p,import.meta.url),'utf8');const source=file('../../../creditek/erp/sidebar.js'),accessSource=file('../../../creditek/erp/kora-access-control.js');
const adapter=createRequire(import.meta.url)('../../../creditek/erp/cartera-operador-client.js');
const original=file('../../../tests/security/navigation-shell.test.mjs');let harness=original.slice(original.indexOf('function classList('),original.indexOf("\ntest('instala"));
harness=harness.replace('  session = null,','  session = null, bootstrap={data:{restricted:false}},');
harness=harness.replace("return Promise.resolve({data:name==='cartera_operador_inicio'?{restricted:false}:false,error:null});","return Promise.resolve(name==='cartera_operador_inicio'?bootstrap:{data:false,error:null});");
harness=harness.replace('      KoraConfirmacionDeuda:','      KoraPortfolioClient: adapter,\n      KoraConfirmacionDeuda:');
const createHarness=vm.runInNewContext(harness+';createHarness',{source,accessSource,adapter,vm,queueMicrotask,setTimeout,clearTimeout,console,JSON});
const id='11111111-1111-4111-8111-111111111111',data={restricted:true,profile:{id,nombre:'Ficticia',rol:'operador_cartera',activo:true,tienda_codigo:'fiction-A'},read:true,manage:true,importer:false,authorizer:false};
test('actual dedicated shell opens only portfolio without profile/catalog raw requests',async()=>{
 const h=createHarness({session:{user:{id}},bootstrap:{data},appReady:true,pathname:'/creditek/erp/creditos-cartera.html'});await h.listeners.DOMContentLoaded();assert.deepEqual(Array.from(h.events.filter(e=>e.startsWith('from:'))),[]);assert.ok(h.events.includes('insert:sidebar'));assert.equal(h.getErrors().length,0);
 const blocked=createHarness({session:{user:{id}},bootstrap:{data},pathname:'/creditek/erp/ventas.html'});await blocked.listeners.DOMContentLoaded();assert.match(blocked.getBootError().innerHTML,/Acceso denegado/);assert.equal(blocked.events.some(e=>e.startsWith('from:')),false);
 const home=createHarness({session:{user:{id}},bootstrap:{data},pathname:'/creditek/erp/app'});await home.listeners.DOMContentLoaded();assert.ok(home.events.includes('replace:creditos-cartera.html'));
});
test('unverified bootstrap never falls back to ordinary profile tables',async()=>{
 for(const bootstrap of[{error:{code:'PT403'}},{data:{}},{data:{...data,profile:{...data.profile,activo:false}}}]){const h=createHarness({session:{user:{id}},bootstrap,appReady:true});await h.listeners.DOMContentLoaded();assert.equal(h.events.some(e=>e.startsWith('from:')),false);assert.equal(h.events.includes('insert:sidebar'),false);}
});
