import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile,readdir}from'node:fs/promises';
const dir=new URL('../../releases/aura-cop-whole-pesos-20261103/',import.meta.url),files=await readdir(dir),html=await readFile(new URL(files.find(n=>n.endsWith('agente3-meta-ads.html')),dir),'utf8'),wrapper=await readFile(new URL('campaign-view.js',dir),'utf8');
test('AURA COP: importes visibles enteros sin cambiar entradas ni porcentajes',()=>{
 const fn=html.match(/function fmtCOP\(n\) \{[\s\S]*?\n\}/)?.[0];assert.ok(fn);const ctx=vm.createContext({});vm.runInContext(fn,ctx);
 for(const n of [1234.75,1234.25,-1234.75,0]){assert.doesNotMatch(ctx.fmtCOP(n),/,\d/);}
 assert.match(ctx.fmtCOP(1234.75),/1\.235/);assert.match(html,/ctr\.toFixed\(2\)/);assert.match(html,/freq\.toFixed\(2\)/);
});
test('la entrega AURA conserva HTML, miniaturas, GET/HEAD, cabeceras y denegaciones de ruta/método',async()=>{
 const code=wrapper.replace(/^import .*;\n/gm,'').replace(/export \{[\s\S]*?\};/,'')+'\nglobalThis.fixtureWorker = campaign_view_default;';
 const fixture='<html><p>Solo contenido ficticio</p></html>',js='console.log("miniatura ficticia")',ctx=vm.createContext({html:fixture,thumbnails:js,URL,Response});vm.runInContext(code,ctx);const worker=ctx.fixtureWorker;
 for(const path of ['/creditek/agentes/agente3-meta-ads','/creditek/agentes/agente3-meta-ads.html','/creditek/agentes/agente3-meta-ads/']){
  const r=await worker.fetch({url:'https://fixture.invalid'+path,method:'GET'});assert.equal(r.status,200);assert.equal(await r.text(),fixture);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  const h=await worker.fetch({url:'https://fixture.invalid'+path,method:'HEAD'});assert.equal(h.status,200);assert.equal(await h.text(),'');
  assert.equal((await worker.fetch({url:'https://fixture.invalid'+path,method:'POST'})).status,405);
 }
 for(const method of ['GET','HEAD']){const r=await worker.fetch({url:'https://fixture.invalid/creditek/agentes/campaign-thumbnails.js',method});assert.equal(r.status,200);assert.equal(await r.text(),method==='HEAD'?'':js);}
 assert.equal((await worker.fetch({url:'https://fixture.invalid/api/sofia',method:'GET'})).status,404);
});
