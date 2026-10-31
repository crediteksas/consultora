import test from 'node:test';import assert from 'node:assert/strict';
import {applyLiquidHtml,LIQUID_MARKER,LIQUID_LINK,isAuraPresentationPath} from './presentation.mjs';
import {auraLiquidOverlay} from './overlay.mjs';
import {visualEntry,stripOverlayImport,stripReviewedExports} from './build.mjs';
const html='<!doctype html><html lang="es"><head><style>.negative{color:red}</style></head><body><form><input value="1200000" disabled><button hidden>Autorizar</button></form><script>const total=1+2;const url="/api/credito";</script><p>-$ 1.200.000,50</p></body></html>';
function strip(text){return text.replace(' '+LIQUID_MARKER,'').replace(LIQUID_LINK+'\n','');}
test('la inserción es reversible y conserva bytes de scripts, cifras y controles',()=>{const result=applyLiquidHtml(html);assert.equal(strip(result),html);assert.equal(applyLiquidHtml(result),null);for(const s of [html.replace('</head>',''),html.replace('<html ','<html><html '),'not html'])assert.equal(applyLiquidHtml(s),null);});
test('las rutas de presentación son finitas, separadas de API, archivos y registro',()=>{for(const x of ['/creditek/agentes/','/creditek/agentes/nova-supervision.html','/creditek/agentes/sofia-calidad','/creditek/agentes/creditek-agente-respuestas'])assert.ok(isAuraPresentationPath(x));for(const x of ['/api/sofia/send','/creditek/agentes/nova-supervision/api','/creditek/portal/','/creditek/agentes/aura-auth.js','/creditek/agentes/random.html'])assert.equal(isAuraPresentationPath(x),false);});
test('overlay conserva headers de seguridad, cookies y el comportamiento de los handlers',async()=>{let calls=0,cronCalls=0;const legacy={scheduled(){cronCalls++;assert.equal(this,legacy);},fetch:async()=>{calls++;return new Response(html,{headers:{'content-type':'text/html;charset=utf-8','content-security-policy':"default-src 'self'",'set-cookie':'fiction=1; HttpOnly; Secure','x-existing-release':'preserved','etag':'old'}});}};const wrapped=auraLiquidOverlay(legacy,'/* fictitious CSS */');wrapped.scheduled();assert.equal(cronCalls,1);const r=await wrapped.fetch(new Request('https://aura.crediteksas.com/creditek/agentes/'),{},{});assert.equal(calls,1);assert.equal(strip(await r.text()),html);assert.equal(r.headers.get('content-security-policy'),"default-src 'self'");assert.equal(r.headers.get('set-cookie'),'fiction=1; HttpOnly; Secure');assert.equal(r.headers.get('x-existing-release'),'preserved');assert.equal(r.headers.get('etag'),null);assert.equal(r.headers.get('x-creditek-visual'),'liquid-1');});
test('API, escrituras, otros hosts, errores y descargas pasan por el mismo handler sin modificación',async()=>{for(const [url,method,status,type]of [['https://aura.crediteksas.com/api/sofia/send','POST',200,'application/json'],['https://aura.crediteksas.com/creditek/agentes/','HEAD',200,'text/html'],['https://aura.crediteksas.com/creditek/agentes/','POST',200,'text/html'],['https://aura.crediteksas.com/creditek/agentes/','GET',401,'text/html'],['https://kora.crediteksas.com/creditek/agentes/','GET',200,'text/html'],['https://aura.crediteksas.com/creditek/agentes/','GET',200,'application/pdf']]){const source=new Response('unchanged',{status,headers:{'content-type':type}});const wrapped=auraLiquidOverlay({fetch:async()=>source},'css');assert.equal(await wrapped.fetch(new Request(url,{method}),{},{}),source);}});
test('CSS tiene GET/HEAD sin consultas ni operaciones y HTML desconocido pasa intacto',async()=>{let calls=0;const wrapped=auraLiquidOverlay({fetch:async()=>{calls++;return new Response(html.replace('</head>',''),{headers:{'content-type':'text/html'}})}},'css fixture');for(const method of ['GET','HEAD']){const r=await wrapped.fetch(new Request('https://aura.crediteksas.com/creditek/agentes/creditek-liquid.css',{method}),{},{});assert.equal(await r.text(),method==='HEAD'?'':'css fixture');assert.equal(r.headers.get('x-content-type-options'),'nosniff');}assert.equal(calls,0);const r=await wrapped.fetch(new Request('https://aura.crediteksas.com/creditek/agentes/'),{},{});assert.equal(await r.text(),html.replace('</head>',''));});
test('el límite de tamaño falla conservando exactamente la respuesta original',async()=>{const big=html+'x'.repeat(524289);const r=await auraLiquidOverlay({fetch:async()=>new Response(big,{headers:{'content-type':'text/html'}})},'css').fetch(new Request('https://aura.crediteksas.com/creditek/agentes/'),{},{});assert.equal(await r.text(),big);assert.equal(r.headers.get('x-creditek-visual'),null);});

test('la identidad visual dice AURA y no sustituye cadenas dentro de scripts o estilos',()=>{const tag='<div data-kora-brand data-variant="public">';const original='<html><head></head><body>'+tag+'</div><script>const example='+JSON.stringify(tag)+'</script></body></html>';const result=applyLiquidHtml(original);assert.ok(result.includes(tag.replace('>',' data-product-name="AURA">')));assert.ok(result.includes('<script>const example='+JSON.stringify(tag)+'</script>'));});

test('un fallo de lectura de presentación devuelve la respuesta original sin sustituir errores de negocio',async()=>{const body=new ReadableStream({start(c){c.error(new Error('fictitious transport failure'));}});const original=new Response(body,{headers:{'content-type':'text/html'}});const response=await auraLiquidOverlay({fetch:async()=>original},'css').fetch(new Request('https://aura.crediteksas.com/creditek/agentes/'),{},{});assert.equal(response,original);assert.equal(response.headers.get('x-creditek-visual'),null);});

test('script/style sin cierre o cierres huérfanos conservan la respuesta original',async()=>{
 for(const body of ['<script>const example="<div data-kora-brand data-variant=\\"public\\">";', '<style>.a{color:red}', '</script><p>orphan</p>', '</style>']){
  const input='<html><head></head><body>'+body+'</body></html>';assert.equal(applyLiquidHtml(input),null);
  const original=new Response(input,{headers:{'content-type':'text/html'}});
  assert.equal(await auraLiquidOverlay({fetch:async()=>original},'css').fetch(new Request('https://aura.crediteksas.com/creditek/agentes/'),{},{}),original);
 }
 const raw='<script>const example="<script> <div data-kora-brand data-variant=\\"public\\">";</script>';
 const input='<html><head></head><body>'+raw+'</body></html>';assert.equal(strip(applyLiquidHtml(input)),input);
});
test('formas de entrada no soportadas se rechazan explícitamente antes de integrar',()=>{
 class Legacy{#events=[];scheduled(v){this.#events.push(v);return this.#events.length;}queue(v){this.#events.push(v);return this.#events.length;}async fetch(){return new Response(String(this.#events.length));}}
 assert.throws(()=>auraLiquidOverlay(new Legacy(),'css'),/plain-object/);
 const symbol={fetch(){},[Symbol('rpc')]:()=>{}};assert.throws(()=>auraLiquidOverlay(symbol,'css'),/Symbol exports/);
 const hidden=Object.defineProperty({fetch(){}},'queue',{value(){},enumerable:false});assert.throws(()=>auraLiquidOverlay(hidden,'css'),/Non-enumerable exports/);
 const getter={fetch(){},get queue(){throw Error('getter must not execute');}};assert.throws(()=>auraLiquidOverlay(getter,'css'),/Accessor exports/);
 assert.throws(()=>auraLiquidOverlay({},'css'),/existing fetch/);
});
test('todas las funciones propias, incluido tailStream, mantienen el contexto original',()=>{
 const legacy={calls:[],fetch(){},tailStream(v){this.calls.push(v);return this.calls.length;},customHandler(v){this.calls.push(v);return this.calls.length;}};
 const wrapped=auraLiquidOverlay(legacy,'css');assert.equal(wrapped.tailStream('tail'),1);assert.equal(wrapped.customHandler('custom'),2);assert.deepEqual(legacy.calls,['tail','custom']);assert.equal(wrapped.calls,legacy.calls);
});
test('head ausente, duplicado o fuera de orden no recibe una hoja de estilo',()=>{
 for(const input of ['<html><body></head></body></html>','<html></head><head></head><body></body></html>','<html></head><head><body></body></html>','<head></head><html><body></body></html>','<html><head></head><head></head></html>'])assert.equal(applyLiquidHtml(input),null);
});
test('los literales de script no cuentan como etiquetas ni reciben inserciones',()=>{
 const missing='<html><body><script>const template="</head>";</script></body></html>';assert.equal(applyLiquidHtml(missing),null);
 const raw='<script>const template="<html lang=x> </head>";</script>';
 const input='<html><head></head><body>'+raw+'</body></html>';assert.equal(strip(applyLiquidHtml(input)),input);assert.ok(applyLiquidHtml(input).includes(raw));
});
test('CSS revalida por contenido y devuelve 304 sin ejecutar el Worker original',async()=>{
 const wrapped=auraLiquidOverlay({fetch(){throw Error('must not call backend');}},'static fictitious css');const url='https://aura.crediteksas.com/creditek/agentes/creditek-liquid.css';
 const first=await wrapped.fetch(new Request(url),{},{}),etag=first.headers.get('etag');assert.match(etag,/^"[a-f0-9]{64}"$/);assert.equal(await first.text(),'static fictitious css');
 for(const method of ['GET','HEAD'])for(const match of [etag,'W/'+etag,'"other", '+etag,'*']){const response=await wrapped.fetch(new Request(url,{method,headers:{'if-none-match':match}}),{},{});assert.equal(response.status,304);assert.equal(await response.text(),'');assert.equal(response.headers.get('etag'),etag);}
 const changed=await auraLiquidOverlay({fetch(){}},'changed fictitious css').fetch(new Request(url,{headers:{'if-none-match':etag}}),{},{});assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),etag);
});
test('el generador rechaza rutas fuera del módulo local y compone una entrada ejecutable',async()=>{
 for(const value of ['../legacy.mjs','/legacy.mjs','dir/legacy.mjs','legacy.txt','legacy.mjs?x','..mjs','legacy..mjs','\\legacy.js',null])await assert.rejects(()=>visualEntry(value),/Invalid entry module/);
 const source=await visualEntry('./legacy.mjs');assert.match(source,/^import legacy from "\.\/legacy\.mjs";/);assert.doesNotMatch(source,/^import .*presentation\.mjs/m);assert.match(source,/const visualCss=/);
 const executable=source.replace('import legacy from "./legacy.mjs";','const legacy={fetch:async()=>new Response("unchanged",{headers:{"content-type":"text/plain"}})};');
 const module=await import('data:text/javascript;base64,'+Buffer.from(executable).toString('base64'));
 assert.equal(await (await module.default.fetch(new Request('https://aura.crediteksas.com/api/existing'),{},{})).text(),'unchanged');
 const css=await module.default.fetch(new Request('https://aura.crediteksas.com/creditek/agentes/creditek-liquid.css'),{},{});assert.match(await css.text(),/Creditek Liquid/);
});
test('el generador falla explícitamente si cambian sus imports internos',()=>{
 const prefix="import {applyLiquidHtml,isAuraPresentationPath} from './presentation.mjs';\n";
 assert.equal(stripOverlayImport(prefix+'export function example(){}'),'export function example(){}');
 assert.throws(()=>stripOverlayImport('// inserted header\n'+prefix+'export function example(){}'),/import contract changed/);
 assert.throws(()=>stripOverlayImport(prefix+"import other from './other.mjs';\nexport function example(){}"),/Additional overlay imports/);
});
test('una forma de marca desconocida o etiquetas estructurales ambiguas no se modifican parcialmente',()=>{
 for(const body of ["<div data-variant='public' data-kora-brand></div>",'<div data-kora-brand class="changed"></div>','<!-- <html lang="x"> </head> -->','<div data-example="</head>"></div>']){
  assert.equal(applyLiquidHtml('<html><head></head><body>'+body+'</body></html>'),null);
 }
 const branded='<html><head></head><body><div data-kora-brand data-product-name="AURA"></div></body></html>';assert.ok(applyLiquidHtml(branded));
});
test('dos cookies independientes se conservan después de transformar HTML',async()=>{
 const headers=new Headers({'content-type':'text/html'});headers.append('set-cookie','fictitious_a=1; HttpOnly; Secure');headers.append('set-cookie','fictitious_b=2; HttpOnly; Secure');
 const original=new Response(html,{headers}),expected=original.headers.getSetCookie();
 const changed=await auraLiquidOverlay({fetch:async()=>original},'css').fetch(new Request('https://aura.crediteksas.com/creditek/agentes/'),{},{});
 assert.deepEqual(changed.headers.getSetCookie(),expected);assert.equal(expected.length,2);
});

test("el generador no corrompe literales export de líneas nuevas",()=>{
 assert.equal(stripReviewedExports("export const SAFE = 1;",["const SAFE"]),"const SAFE = 1;");
 assert.throws(()=>stripReviewedExports("export const SAFE = 1;\nconst example = \`\nexport const SAFE = 2;\n\`;",["const SAFE"]),/export contract changed/);
 assert.throws(()=>stripReviewedExports("export const SAFE = 1;\nexport example",["const SAFE"]),/Additional export text/);
});
