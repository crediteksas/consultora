// Execute the actual candidate shell in the existing bounded DOM harness.
import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{readFileSync}from'node:fs';import{createRequire}from'node:module';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('./candidate/sidebar.js'),accessSource=read('./candidate/kora-access-control.js');
const adapter=createRequire(import.meta.url)('./candidate/cartera-operador-client.js');
const original=read('../../tests/security/navigation-shell.test.mjs');
let harness=original.slice(original.indexOf('function classList('),original.indexOf("\ntest('instala"));
harness=harness.replace("  session = null,","  session = null, bootstrap = {data:{restricted:false}},");
harness=harness.replace("  const client = {","  const client = {\n rpc(name){events.push('rpc:'+name);return Promise.resolve(name==='cartera_operador_inicio'?bootstrap:{data:false,error:null});},");
harness=harness.replace("      KoraConfirmacionDeuda:","      KoraPortfolioClient: adapter,\n      KoraConfirmacionDeuda:");
harness=harness.replace('    getClientCreations:',"    getExposedClient: () => context.window.creditekSidebar?.sb,\n    getClientCreations:");
const createHarness=vm.runInNewContext(harness+';createHarness',{source,accessSource,adapter,vm,queueMicrotask,setTimeout,clearTimeout,console,JSON});
const user='11111111-1111-4111-8111-111111111111';
const boot={data:{restricted:true,profile:{id:user,nombre:'Ficticia',rol:'operador_cartera',activo:true,tienda_codigo:'fiction-A'},read:true,manage:true,importer:false,authorizer:false}};
test('ordinary store follows old profile path only after explicit bootstrap=false and mounts debt confirmation',async()=>{
 const h=createHarness({session:{user:{id:user}},appReady:true});await h.listeners.DOMContentLoaded();
 assert.ok(h.events.indexOf('rpc:cartera_operador_inicio')<h.events.indexOf('from:perfiles'));assert.ok(h.events.includes('debt:checked'));assert.ok(h.events.includes('insert:sidebar'));assert.equal(h.getErrors().length,0);
});
test('dedicated operator enters portfolio without raw profile/capability/store calls',async()=>{
 const h=createHarness({session:{user:{id:user}},appReady:true,bootstrap:boot,pathname:'/creditek/erp/creditos-cartera.html'});const raw=h.createPageClient();await h.listeners.DOMContentLoaded();
 assert.deepEqual(Array.from(h.events.filter(x=>x.startsWith('from:'))),[]);
 assert.deepEqual(Array.from(h.events.filter(x=>x.startsWith('rpc:'))),['rpc:cartera_operador_inicio']);
 assert.ok(h.events.includes('insert:sidebar'));assert.equal(h.getErrors().length,0);
 assert.equal(h.getExposedClient().rpc('cobra_provision_authorizer').constructor.name,'Request');
 assert.notEqual(h.getExposedClient(),raw);assert.equal(h.getExposedClient().storage,undefined);
});

test('bootstrap validator in shell is exactly the reviewed client validator',()=>{
 const adapterCode=read('./candidate/cartera-operador-client.js');
 const validator=adapterCode.slice(adapterCode.indexOf(' const uuid='),adapterCode.indexOf(' function create('));
 assert.ok(source.includes('  const resolvePortfolioBootstrap = (()=>{\n'+validator+'\n return resolveBootstrap;\n  })();'));
});
test('failed, non-JSON or invalid bootstrap cannot fall back to legacy tables or reveal content',async()=>{
 for(const bootstrap of[{error:{code:'PT403'}},{data:'not JSON'},{data:{}},{data:{...boot.data,profile:{...boot.data.profile,activo:false}}}]){
  const h=createHarness({session:{user:{id:user}},appReady:true,bootstrap});await h.listeners.DOMContentLoaded();assert.equal(h.events.includes('from:perfiles'),false);assert.equal(h.events.includes('insert:sidebar'),false);assert.equal(h.rootClasses.contains('creditek-shell-error'),true);
 }
});
test('dedicated operator cannot open sales and app landing redirects to portfolio without other data',async()=>{
 const denied=createHarness({session:{user:{id:user}},bootstrap:boot,pathname:'/creditek/erp/ventas.html'});await denied.listeners.DOMContentLoaded();assert.equal(denied.events.some(x=>x.startsWith('from:')),false);assert.match(denied.getBootError().innerHTML,/Acceso denegado/);
 const home=createHarness({session:{user:{id:user}},bootstrap:boot,pathname:'/creditek/erp/app'});await home.listeners.DOMContentLoaded();assert.ok(home.events.includes('replace:creditos-cartera.html'));assert.equal(home.events.some(x=>x.startsWith('from:')),false);
});
