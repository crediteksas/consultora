// Real Liquidaciones payment renderer and KORA styles, using local fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {chromium} from '@playwright/test';

test('Pagos mantiene nombres, importes y conceptos legibles sin desborde a 390/768/1128/1440',async()=>{
 const root=process.cwd();
 const server=http.createServer(async(req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+'/')||!['.css','.woff2'].includes(path.extname(file))){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'font/woff2');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.setDefaultTimeout(10000);
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  let html=await fs.readFile('creditek/erp/aliados-liquidaciones.html','utf8');
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<head>',`<head><base href="${origin}/creditek/erp/">`);
  await page.setContent(html,{waitUntil:'networkidle'});await page.addStyleTag({url:origin+'/design-system/components/kora-shell.css'});
  await page.addScriptTag({path:'creditek/erp/aliados-liquidaciones-ux.js'});
  const app=await fs.readFile('creditek/erp/aliados-liquidaciones-app.js','utf8');
  const source=app.slice(app.indexOf('  async function loadPayments()'),app.indexOf('  async function loadAudit()'));
  await page.evaluate(()=>{
   document.body.classList.add('kora-product-page');document.getElementById('app').classList.remove('hidden');document.getElementById('liquidationsContent').classList.remove('hidden');document.getElementById('detail').classList.remove('hidden');
   document.querySelector('#detail>.table-wrap').classList.add('grouped-cards');
   window.paymentFixtures=[
    {id:'pago-1',valor:950000,estado:'programado',fecha_programada:'2026-09-04',fecha_pagada:null,soporte_path:null,liquidation_beneficiaries:{nombre:'INGRID CRISTINA RAMOS · COMERCIO DISTRITOYS BARRANQUILLA',tipo:'aliado',origen_codigo:'ALIADO-DISTRITOYS-BARRANQUILLA'},beneficiary_bank_accounts:{numero_cuenta:'3001232351'},payment_items:[{concepto:'pago_aliado'},{concepto:'pago_aliado'}]},
    {id:'pago-2',valor:20000,estado:'pendiente',fecha_programada:null,fecha_pagada:null,soporte_path:null,liquidation_beneficiaries:{nombre:'Maythe Reyes',tipo:'ejecutivo'},beneficiary_bank_accounts:null,payment_items:[{concepto:'bono_fijo_universal'},{concepto:'bono_operativo'},{concepto:'bono_ejecutivo'}]}
   ];
  });
  await page.addScriptTag({content:`{
    const $=id=>document.getElementById(id),UX=CreditekAliadosUX,money=UX.formatoCOP;
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const state=value=>'<span class="badge '+esc(value)+'">'+esc(UX.traducirEstado(value))+'</span>';
    const selected={id:'lote',plataforma:'krediya',estado:'revisada',frozen_at:null},operator={capacidad:'revisor'};
    const sb={from(){const q={select(){return q;},eq:async()=>({data:window.paymentFixtures,error:null})};return q;}};
    const changePayment=()=>{throw new Error('This QA does not authorize payments');};
    ${source};window.renderTestPayments=loadPayments;
  }`});
  await page.evaluate(()=>window.renderTestPayments());
  assert.equal(await page.locator('#detailHead').innerHTML(),'');
  for(const width of [390,768,1128,1440]){
   await page.setViewportSize({width,height:900});
   for(const selector of ['#detail>.table-wrap','.grouped-summary','.grouped-values']){
    const sizes=await page.locator(selector).evaluateAll(elements=>elements.map(e=>({client:e.clientWidth,scroll:e.scrollWidth,text:e.innerText.slice(0,160)})));
    for(const size of sizes)assert.ok(size.scroll<=size.client+1,`${width}px ${selector}: ${JSON.stringify(size)}`);
   }
   assert.match(await page.locator('.grouped-summary').first().evaluate(e=>getComputedStyle(e).fontFamily),/Inter|DM Sans/);
   assert.equal(await page.getByText('Sin pago registrado',{exact:true}).count(),2);
  }
  assert.equal(await page.getByRole('button',{name:'Autorizar pago',exact:true}).count(),0);
  if(process.env.KORA_SCREENSHOT_DIR){
   await fs.mkdir(process.env.KORA_SCREENSHOT_DIR,{recursive:true});
   for(const width of [390,1128]){
    await page.setViewportSize({width,height:900});
    await page.locator('#detail>.table-wrap').screenshot({path:path.join(process.env.KORA_SCREENSHOT_DIR,`krediya-pagos-${width}.png`)});
   }
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
