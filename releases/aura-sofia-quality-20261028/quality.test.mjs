import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile,writeFile,mkdtemp,cp} from 'node:fs/promises';
import {proxyQuality} from './overlay.mjs';import {integrateQualityPanel} from './panel.mjs';import {auraQualityEntry} from './build.mjs';
import {visibilityEntry} from '../aura-shell-visibility-20261028/build.mjs';import {chatFitEntry} from '../aura-sofia-chat-fit-20261028/build.mjs';
import {Miniflare,createFetchMock} from '../../node_modules/miniflare/dist/src/index.js';
const url='https://aura.crediteksas.com/creditek/agentes/sofia-calidad/api/';
const req=(action='status',init={})=>new Request(url+action,{...init,headers:{authorization:'Bearer fictional-owner-session',...(init.headers||{})}});
test('status conserva la sesión AURA y exige autorización del servidor de calidad',async()=>{
 let seen;const r=await proxyQuality(req(),async(u,init)=>{seen={u,init};return Response.json({ok:false,code:'owner_required'},{status:403});});
 assert.equal(r.status,403);assert.equal(seen.u,'https://creditek-bot.comercial-853.workers.dev/api/sofia/quality/status');assert.equal(seen.init.headers.authorization,'Bearer fictional-owner-session');assert.equal(seen.init.headers['x-worker-secret'],undefined);assert.equal(seen.init.redirect,'manual');assert.equal(r.headers.get('cache-control'),'no-store');
});
test('rechaza falta de sesión, origen ajeno, acciones internas y métodos incorrectos antes del servicio',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({ok:true});};
 assert.equal((await proxyQuality(new Request(url+'status'),fetcher)).status,401);
 assert.equal((await proxyQuality(req('status',{headers:{origin:'https://foreign.invalid'}}),fetcher)).status,403);
 for(const action of ['reserve','settle','capture','../status'])assert.equal((await proxyQuality(req(action),fetcher)).status,404);
 assert.equal((await proxyQuality(req('budget'),fetcher)).status,405);assert.equal(calls,0);
});
test('el control de presupuesto continúa enviándose al validador existente con su revisión',async()=>{
 let received;const input={monthlyMicroUsd:15000000,expectedRevision:0};
 const r=await proxyQuality(req('budget',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),async(u,init)=>{received=JSON.parse(new TextDecoder().decode(init.body));return Response.json({ok:false,code:'unauthorized_budget_increase'},{status:400});});
 assert.deepEqual(received,input);assert.equal(r.status,400);assert.equal((await r.json()).code,'unauthorized_budget_increase');
});
test('limita el cuerpo, sanea fallos de transporte y no acepta páginas como respuesta privada',async()=>{
 assert.equal((await proxyQuality(req('preview',{method:'POST',headers:{'content-type':'text/plain'},body:'x'}))).status,415);
 assert.equal((await proxyQuality(req('preview',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(4097)}))).status,413);
 assert.equal((await proxyQuality(req(),async()=>{throw Error('secret-example');})).status,503);
 assert.equal((await proxyQuality(req(),async()=>new Response('private html'))).status,502);
});
test('el panel completo conserva revisión y reversión y elimina la segunda autenticación',async()=>{
 const html=integrateQualityPanel(await readFile(new URL('./quality-original.html',import.meta.url),'utf8'));
 assert.doesNotMatch(html,/loginForm|grant_type=password|Contraseña de AURA|Cerrar sesión|let token=/);
 for(const text of ['Presupuesto de IA','Proponer una corrección','Por revisar','Correcciones activas','Historial y reversión','expectedRevision','validated:true','parent.auraSofiaQualityRequest','refresh().catch'])assert.ok(html.includes(text),text);
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 const client=await readFile(new URL('./client.js',import.meta.url),'utf8');new vm.Script(client);
 assert.ok(client.includes('getSession()'));assert.doesNotMatch(client,/localStorage\.setItem|sessionStorage\.setItem|grant_type=password|password/);
});
const dir=await mkdtemp('/private/tmp/aura-quality-test-');await cp(new URL('../../backups/aura-shell-visibility-20261028/',import.meta.url),dir,{recursive:true});await writeFile(dir+'/visibility-ui.mjs',await visibilityEntry());await writeFile(dir+'/chat-fit.mjs',await chatFitEntry());await writeFile(dir+'/quality-ui.mjs',await auraQualityEntry());
const mock=createFetchMock();mock.disableNetConnect();const original='<!doctype html><html><head></head><body data-aura-page="sofia"><div class="topbar-left"><h1>Sofia · CRM WhatsApp</h1></div><div class="sidebar-tab" onclick="switchView(\'correcciones\',this)">IA</div><script>const operational=true;</script></body></html>';
mock.get('https://aura.crediteksas.com').intercept({path:'/creditek/agentes/creditek-agente-respuestas?embedded=1'}).reply(200,original,{headers:{'content-type':'text/html'}}).persist();
mock.get('https://creditek-bot.comercial-853.workers.dev').intercept({path:'/api/sofia/quality/status'}).reply(200,JSON.stringify({ok:true,budget:{config:{monthlyMicroUsd:15000000},ledger:{usageMicroUsd:1234}}}),{headers:{'content-type':'application/json'}}).persist();
const mf=new Miniflare({modules:true,modulesRoot:dir,scriptPath:dir+'/quality-ui.mjs',modulesRules:[{type:'ESModule',include:['**/*.mjs','**/*.js']},{type:'Text',include:['**/*.txt']}],compatibilityDate:'2026-07-23',fetchMock:mock});test.after(()=>mf.dispose());
test('el shell integra calidad, conserva el arreglo de altura y no modifica los scripts anteriores',async()=>{const r=await mf.dispatchFetch('https://aura.crediteksas.com/creditek/agentes/creditek-agente-respuestas?embedded=1');const html=await r.text();assert.equal(r.headers.get('x-sofia-chat-fit'),'20261028-1');assert.equal(r.headers.get('x-sofia-quality-aura'),'20261028-1');assert.ok(html.includes('<script>const operational=true;</script>'));assert.ok(html.includes('onclick="auraOpenSofiaQuality()"'));assert.ok(html.includes('aura-sofia-quality-client'));});
test('calidad se sirve en AURA con iframe del mismo origen y ninguna contraseña',async()=>{const r=await mf.dispatchFetch('https://aura.crediteksas.com/creditek/agentes/sofia-calidad');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'self'/);assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);assert.doesNotMatch(await r.text(),/loginForm|grant_type=password/);});
test('el menú padre, la marca y el dictado desactivado siguen conservados',async()=>{const r=await mf.dispatchFetch('https://aura.crediteksas.com/creditek/agentes/');assert.equal(r.headers.get('x-aura-shell-visibility'),'20261028-1');const dict=await mf.dispatchFetch('https://aura.crediteksas.com/creditek/agentes/aura-dictation.mjs');assert.equal(dict.headers.get('x-aura-dictation'),'disabled');});
test('el transporte real del Worker consulta el consumo con la sesión existente',async()=>{const r=await mf.dispatchFetch(url+'status',{headers:{authorization:'Bearer fictional-owner-session'}});assert.equal(r.status,200);assert.equal((await r.json()).budget.ledger.usageMicroUsd,1234);});
