import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {setup,seed,apply} from '../../scripts/supabase-compat/krediya-venta-fixture.mjs';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',lot='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const app=await readFile('creditek/erp/aliados-liquidaciones-app.js','utf8');
const editor=app.slice(app.indexOf('  async function openPriceEditor('),app.indexOf('  async function stateRpc('));
const identity=app.slice(app.indexOf('  function executiveIdentity('),app.indexOf('  function renderStandardOperations('));
const renderer=app.slice(app.indexOf('  function renderKrediyaOperations('),app.indexOf('  async function loadIncidents('));
const review=await readFile('creditek/erp/krediya-review-ui.js','utf8');
const html=(await readFile('creditek/erp/aliados-liquidaciones.html','utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
const scalar=async(db,q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
const unaffected=async db=>({
 peers:await scalar(db,'select jsonb_agg(to_jsonb(t) order by id) from liquidation_operations t where id<>$1',[id]),
 tariffs:await scalar(db,'select jsonb_agg(to_jsonb(t) order by id) from krediya_price_rules t'),
 payments:await scalar(db,'select jsonb_agg(to_jsonb(t) order by id) from payment_orders t'),
 otherLots:await scalar(db,'select jsonb_agg(to_jsonb(t) order by id) from liquidations t where id<>$1',[lot]),
 peerIncidents:await scalar(db,'select jsonb_agg(to_jsonb(t) order by id) from liquidation_incidents t where operation_id<>$1',[id])
});
test('guardar sin nota desde el navegador persiste la corrección con SQL real y conserva las demás ventas',async()=>{
 const db=await setup();let browser;
 try{
  await seed(db);await apply(db);await db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[lot]);
  await db.exec("insert into liquidations(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab');insert into liquidation_incidents(operation_id,tipo) values('"+id+"','krediya_precio_venta_diferente'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','krediya_precio_venta_diferente')");
  const before=await unaffected(db),calls=[],external=[];
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='kora.test'){external.push(u.hostname);return route.abort();}return route.fulfill(u.pathname==='/editor'?{contentType:'text/html',body:html}:{status:404,body:''});});
  await page.exposeFunction('fictionalRpc',async(name,args)=>{
   calls.push({name,args});
   try{
    if(name==='aliados_contexto_precio_krediya')return {data:await scalar(db,'select public.aliados_contexto_precio_krediya($1)',[args.p_operation_id])};
    if(name==='aliados_resolver_precio_krediya')return {data:await scalar(db,'select public.aliados_resolver_precio_krediya($1,$2,$3,$4,$5)',[args.p_operation_id,args.p_decision,args.p_precio_venta,args.p_pagamos,args.p_justificacion])};
    throw Error('RPC no permitida en esta prueba');
   }catch(e){return {error:{message:e.message}};}
  });
  await page.exposeFunction('fictionalProjection',async()=>{
   const row=(await db.query('select * from liquidation_operations where id=$1',[id])).rows[0];row.liquidation_calculations=(await db.query('select * from liquidation_calculations where operation_id=$1',[id])).rows;
   const c=await scalar(db,'select public.aliados_contexto_precio_krediya($1)',[id]);c.automatica=await scalar(db,'select krediya_private.utilidad_consulta($1)',[id]);return {row,c};
  });
  const boot=async()=>{
   await page.addScriptTag({content:review});
   await page.evaluate(({editor,identity,renderer,lot})=>{
    window.$=id=>document.getElementById(id);window.money=v=>String(v);window.esc=v=>String(v??'');window.selected={id:lot};window.fixtureNavigation=[];window.operator={capacidad:'aprobador'};window.KREDIYA_FOLLOWUP_TYPES=new Set();window.Review=window.CreditekKrediyaReview;window.sb={rpc:(...args)=>window.fictionalRpc(...args)};window.loadBatches=window.openDetail=async()=>{};
    const api=Function(identity+renderer+editor+';return {open:openPriceEditor,render:renderKrediyaOperations};')();window.fixtureOpen=api.open;window.fixtureRender=api.render;
    window.loadTab=async(...x)=>{const p=await window.fictionalProjection();$('app').classList.remove('hidden');$('liquidationsContent').classList.remove('hidden');$('detail').classList.remove('hidden');window.fixtureRender([p.row],[p.c],[],x[1]);window.fixtureNavigation.push(x);};
   },{editor,identity,renderer,lot});
  };
  await page.goto('https://kora.test/editor');await boot();
  await page.evaluate(id=>window.fixtureOpen(id,{operationOnly:true}),id);
  assert.equal(await page.locator('#priceReason').getAttribute('required'),null);assert.equal(await page.locator('#savePriceDecision').isEnabled(),true);
  await page.locator('#decisionPvp').fill('1100000');await page.locator('#decisionPagamos').fill('780000');await page.locator('#savePriceDecision').click();
  await page.waitForFunction(()=>window.fixtureNavigation.length===1,{},{timeout:10000});
  let saved=await scalar(db,"select policy_snapshot->'decision_precio' from liquidation_operations where id=$1",[id]);
  assert.equal(saved.ambito,'venta_v1');assert.equal(saved.decision,'editar_operacion');assert.equal(saved.precio_venta,1100000);assert.equal(saved.pagamos,780000);assert.equal(saved.motivo,'Corrección individual de PVP y PAGAMOS');
  const audit=(await db.query("select * from audit_log where accion='krediya_decision_precio' and registro_id=$1",[id])).rows;assert.equal(audit.length,1);assert.equal(audit[0].usuario,'11111111-1111-4111-8111-111111111111');assert.ok(Object.hasOwn(audit[0].detalle,'antes'));assert.deepEqual(audit[0].detalle.despues,saved);
  assert.equal(await scalar(db,"select count(*) from liquidation_incidents where operation_id=$1 and estado='abierta'",[id]),0);assert.equal(await scalar(db,'select estado from krediya_diferencias where operation_id=$1',[id]),'resuelta');
  assert.deepEqual((await db.query('select estado,reviewed_at,reviewed_by from liquidations where id=$1',[lot])).rows[0],{estado:'importada',reviewed_at:null,reviewed_by:null});assert.deepEqual(await unaffected(db),before);
  const preview=await scalar(db,'select krediya_private.utilidad_consulta($1)',[id]);assert.equal(preview.pvp,1100000);assert.equal(preview.pagamos,780000);assert.equal(preview.giro,680000);assert.equal(preview.utilidad_neta,228096);
  await page.reload();await boot();await page.evaluate(id=>window.loadTab('operations',id),id);
  const card=page.getByRole('article',{name:'Equipo Ficticio',exact:true});
  assert.match(await card.locator('.operation-footer').innerText(),/Corrección guardada: PVP 1100000 · PAGAMOS 780000/);assert.doesNotMatch(await card.locator('.operation-values').first().innerText(),/PVP KORA/);assert.match(await card.locator('.operation-details').textContent(),/PVP configurado de referencia[\s\S]*1000000/);
  await card.getByRole('button',{name:'Editar PVP y PAGAMOS',exact:true}).click();
  assert.equal(await page.locator('#decisionPvp').inputValue(),'1100000');assert.equal(await page.locator('#decisionPagamos').inputValue(),'780000');assert.match(await page.locator('#saleSavedPrices').innerText(),/Corrección guardada: PVP 1100000 · PAGAMOS 780000/);
  assert.equal(await page.locator('#priceSourceDetails').getAttribute('open'),null);assert.equal(await page.locator('#priceSourceDetails input').count(),0);const original=await page.locator('#priceSourceDetails').textContent();assert.match(original,/900000/);assert.match(original,/1000000/);
  await page.locator('#priceReason').fill('  Acuerdo ficticio confirmado  ');await page.locator('#savePriceDecision').click();await page.waitForFunction(()=>window.fixtureNavigation.length===2,{},{timeout:10000});
  saved=await scalar(db,"select policy_snapshot->'decision_precio' from liquidation_operations where id=$1",[id]);assert.equal(saved.motivo,'Acuerdo ficticio confirmado');assert.equal(calls.filter(x=>x.name==='aliados_resolver_precio_krediya').length,2);assert.deepEqual(await unaffected(db),before);assert.deepEqual(external,[]);
 }finally{if(browser)await browser.close();await db.close();}
});
