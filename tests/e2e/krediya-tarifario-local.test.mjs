// Component QA with the real Liquidaciones HTML/CSS; no session or production writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {chromium} from '@playwright/test';

test('tarifario, edición e informe se adaptan a 390/768/1128/1440 con estilos KORA',async()=>{
 const root=process.cwd();
 const server=http.createServer(async(req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+'/')||!['.css','.woff2'].includes(path.extname(file))){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'font/woff2');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  page.setDefaultTimeout(10000);
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  let html=await fs.readFile('creditek/erp/aliados-liquidaciones.html','utf8');
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<head>',`<head><base href="${origin}/creditek/erp/">`);
  await page.setContent(html,{waitUntil:'networkidle'});
  await page.addStyleTag({url:origin+'/design-system/components/kora-shell.css'});
  await page.addScriptTag({path:'creditek/erp/krediya-tarifario.js'});
  await page.evaluate(()=>{
   document.body.classList.add('kora-product-page');
   document.getElementById('app').classList.remove('hidden');
   document.getElementById('liquidationsContent').classList.remove('hidden');
   document.getElementById('detail').classList.remove('hidden');
   const fixture={codigo:'T0924',id:'price',updated_at:'2026-09-05T00:00:00Z',referencia:'REDMI 15C 128GB 4RAM',precio_venta:646400,pagamos:484800,vigente_desde:'2026-08-12'};
   window.calls=[];
   const rows=[{operation_id:'op',estado:'pendiente',contexto:{referencia:fixture.referencia,tienda:'COMERCIO DE PRUEBA CON NOMBRE COMPLETO',imei:'012345678901234',fecha:'2026-08-12',pvp_guardado:646400,pvp_liquidado:701500,impacto_bruto:55100,pagamos:484800,inicial:70150,bonos:50000,utilidad_neta:120000,impacto_neto:39672}}];
   const sb={from(table){const q={select(){return q;},eq(){return q;},order(){return q;},range:async()=>({data:table==='krediya_price_rules'?[fixture]:rows,error:null})};return q;},rpc:async(name,args)=>{window.calls.push({name,args});return {error:null};}};
   window.component=CreditekKrediyaTarifario.create({sb,money:n=>'$ '+Number(n).toLocaleString('es-CO')});
  });
  for(const width of [390,768,1128,1440]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>window.component.openTariff());
   await page.getByRole('heading',{name:'Tarifario Krediya'}).waitFor();
   assert.equal(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,`tarifario ${width}`);
   await page.locator('[data-edit]').click();
   assert.equal(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,`editor ${width}`);
   await page.locator('[data-close]').click();
   await page.evaluate(async()=>{
    const wrap=document.querySelector('#detail > .table-wrap');wrap.classList.add('grouped-cards');
    document.getElementById('detailHead').innerHTML='';document.getElementById('detailBody').innerHTML='<tr><td><div id="report-test"></div></td></tr>';
    await window.component.report(document.getElementById('report-test'),{id:'batch',fecha_corte:'2026-08-30'});
   });
   await page.locator('#report-test').waitFor({state:'visible'});
   assert.equal(await page.locator('#report-test').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,`informe ${width}`);
   assert.equal(await page.locator('.difference-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,`tarjeta ${width}`);
  }
  await page.getByText('Gestionar / ver historial',{exact:true}).click();
  await page.locator('[name=comentario]').fill('Subir el precio en Krediya a 880000.');
  await page.getByRole('button',{name:'Guardar seguimiento'}).click();
  await page.waitForFunction(()=>window.calls.length===1);
  const calls=await page.evaluate(()=>window.calls);
  assert.equal(calls[0].name,'krediya_gestionar_diferencia');
  assert.equal(calls[0].args.p_estado,'en_gestion');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
