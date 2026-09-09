import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {buildAura} from '../../scripts/build-aura.mjs';
const root = new URL('../../', import.meta.url).pathname;
test('release UI verifies matching build without touching authentication or publishing', async () => {
  const code = await readFile(new URL('../../creditek/agentes/aura-release.js', import.meta.url), 'utf8');
  const label = {}, build='a'.repeat(64), calls=[];
  const context = vm.createContext({document:{readyState:'complete',querySelectorAll:()=>[label],querySelector:()=>({content:build})},AbortSignal,
    fetch:async (url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({version:'1.2.0',build})};}});
  vm.runInContext(code,context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(label.textContent,'AURA v1.2.0 · aaaaaaaa');
  assert.equal(calls.length,1);
  assert.equal(calls[0][1].cache,'no-store');
});
test('release UI does not claim a mismatched build is current', async()=>{
  const code=await readFile(new URL('../../creditek/agentes/aura-release.js',import.meta.url),'utf8');
  const label={};
  vm.runInNewContext(code,{document:{readyState:'complete',querySelectorAll:()=>[label],querySelector:()=>({content:'old'})},AbortSignal,fetch:async()=>({ok:true,json:async()=>({version:'1.2.0',build:'a'.repeat(64)})})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(label.textContent,/Recarga/);
});
test('artifact stamp is deterministic and latest live fixes remain present',async()=>{
  const out=await buildAura(root);
  const first=await readFile(out+'/creditek/agentes/aura-build-manifest.json','utf8');
  await buildAura(root);
  assert.equal(await readFile(out+'/creditek/agentes/aura-build-manifest.json','utf8'),first);
  const publisher=await readFile(out+'/creditek/agentes/agente3-meta-ads.html','utf8');
  assert.doesNotMatch(publisher,/Primero configura tu token/);
  assert.match(publisher,/publicarCampanaSegura/);
  const sofia=await readFile(out+'/creditek/agentes/creditek-agente-respuestas.html','utf8');
  assert.doesNotMatch(sofia,/rp.className='right-panel show'/);
});
