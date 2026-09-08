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
  await page.addScriptTag({path:'node_modules/xlsx/dist/xlsx.full.min.js'});
  await page.addScriptTag({path:'creditek/erp/krediya-tarifario.js'});
  await page.evaluate(()=>{
   document.body.classList.add('kora-product-page');
   document.getElementById('app').classList.remove('hidden');
   document.getElementById('liquidationsContent').classList.remove('hidden');
   document.getElementById('detail').classList.remove('hidden');
   const fixture={codigo:'T0924',id:'price',updated_at:'2026-09-05T00:00:00Z',referencia:'REDMI 15C 128GB 4RAM',precio_venta:646400,pagamos:484800,vigente_desde:'2026-08-12'};
   window.calls=[];
   window.downloads=[];XLSX.writeFile=(book,name)=>window.downloads.push({name,book});
   window.loadFailure=null;window.rpcFailure=null;
   window.reportRows=[{operation_id:'op',estado:'pendiente',contexto:{referencia:fixture.referencia,tienda:'COMERCIO DE PRUEBA CON NOMBRE COMPLETO',imei:'012345678901234',fecha:'2026-08-12',pvp_guardado:646400,pvp_liquidado:701500,impacto_bruto:55100,pagamos:484800,inicial:70150,bonos:50000,gasto_financiero:2525.4,provision:45968.89,utilidad_neta:120000,impacto_neto:39672}}];
   const sb={from(table){const q={select(){return q;},eq(){return q;},order(){return q;},range:async()=>({data:window.loadFailure?null:table==='krediya_price_rules'?[fixture]:window.reportRows,error:window.loadFailure})};return q;},rpc:async(name,args)=>{window.calls.push({name,args});return {error:window.rpcFailure};}};
   window.component=CreditekKrediyaTarifario.create({sb,money:n=>'$ '+Number(n).toLocaleString('es-CO')});
  });
  for(const width of [390,768,1128,1440]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>window.component.openTariff());
   await page.getByRole('heading',{name:'Tarifario Krediya'}).waitFor();
   assert.equal(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,`tarifario ${width}`);
   assert.match(await page.locator('dialog').evaluate(e=>getComputedStyle(e).fontFamily),/Inter|DM Sans/);
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
   assert.equal(await page.locator('.difference-status').evaluate(e=>getComputedStyle(e).whiteSpace),'nowrap');
  }
  await page.getByRole('button',{name:'Descargar informe Excel'}).click();
  const exportData=await page.evaluate(()=>window.downloads[0]);
  assert.equal(exportData.name,'Diferencias-Krediya-2026-08-30.xlsx');
  assert.equal(exportData.book.Sheets['Gestión y Gerencia'].C2.v,'012345678901234');
  assert.equal(exportData.book.Sheets['Gestión y Gerencia'].C2.t,'s');
  assert.equal(exportData.book.Sheets['Gestión y Gerencia'].J2.v,414650);
  assert.equal(exportData.book.Sheets['Gestión y Gerencia'].R2.v,2525.4);
  await page.getByText('Gestionar / ver historial',{exact:true}).click();
  await page.locator('[name=comentario]').fill('Subir el precio en Krediya a 880000.');
  await page.getByRole('button',{name:'Guardar seguimiento'}).click();
  await page.waitForFunction(()=>window.calls.length===1);
  const calls=await page.evaluate(()=>window.calls);
  assert.equal(calls[0].name,'krediya_gestionar_diferencia');
  assert.equal(calls[0].args.p_estado,'en_gestion');
  await page.getByText('Gestionar / ver historial',{exact:true}).click();
  await page.locator('[name=estado]').selectOption('resuelta');
  await page.locator('[name=comentario]').fill('Precio corregido en la plataforma.');
  await page.getByRole('button',{name:'Guardar seguimiento'}).click();
  assert.equal(await page.evaluate(()=>window.calls.length),1,'Resolver exige soporte antes de llamar al servidor');
  await page.locator('[name=soporte]').fill('Captura de referencia Krediya 2026-09-05');
  await page.getByRole('button',{name:'Guardar seguimiento'}).click();
  await page.waitForFunction(()=>window.calls.length===2);
  assert.equal(await page.evaluate(()=>window.calls[1].args.p_estado),'resuelta');

  await page.evaluate(()=>window.component.openTariff());
  await page.locator('[data-edit]').click();
  await page.locator('[name=pvp]').fill('880000');
  await page.locator('[name=pagamos]').fill('484800');
  await page.locator('[name=motivo]').fill('Actualización autorizada del PVP maestro.');
  await page.evaluate(()=>window.rpcFailure={message:'La tarifa cambió en otra sesión. Recarga antes de editar.'});
  await page.getByRole('button',{name:'Guardar nueva vigencia'}).click();
  await page.getByRole('alert').filter({hasText:'La tarifa cambió'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Guardar nueva vigencia'}).isEnabled(),true);
  await page.evaluate(()=>window.rpcFailure=null);
  await page.getByRole('button',{name:'Guardar nueva vigencia'}).click();
  await page.getByRole('button',{name:'Descargar tarifario Excel'}).waitFor();
  const tariffCall=await page.evaluate(()=>window.calls.at(-1));
  assert.equal(tariffCall.name,'krediya_guardar_tarifa');
  assert.equal(tariffCall.args.p_pvp,880000);
  assert.equal(tariffCall.args.p_pagamos,484800);
  assert.equal(tariffCall.args.p_version,'2026-09-05T00:00:00Z');
  await page.locator('[data-download]').click();
  assert.equal(await page.evaluate(()=>window.downloads.at(-1).book.Sheets.Tarifario.D2.v),484800);
  await page.locator('[data-close]').click();

  await page.evaluate(async()=>{
   window.reportRows.push({operation_id:'missing',estado:'pendiente',contexto:{referencia:'Referencia sin impacto',pagamos:null,inicial:100,impacto_neto:null},krediya_diferencias_gestiones:[{created_at:'2026-09-05',comentario:'=HYPERLINK("https://invalid.example")',autor_nombre:'QA',soporte:'Soporte '+ 'x'.repeat(250)}]});
   await window.component.report(document.getElementById('report-test'),{id:'batch',fecha_corte:'2026-08-30'});
  });
  assert.match(await page.locator('.difference-summary').innerText(),/Impacto neto parcial/);
  assert.match(await page.locator('.difference-card').last().innerText(),/No disponible/);
  await page.setViewportSize({width:390,height:900});
  assert.equal(await page.locator('#report-test').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'soportes largos no ensanchan informe');
  await page.getByRole('button',{name:'Descargar informe Excel'}).click();
  const missingRow=await page.evaluate(()=>window.downloads.at(-1).book.Sheets['Gestión y Gerencia']);
  assert.equal(missingRow.J3,undefined,'Giro desconocido no exportado como cero');
  assert.equal(missingRow.P3.t,'s');assert.equal(missingRow.P3.f,undefined,'Comentario no ejecutable como fórmula');
  if(process.env.KORA_SCREENSHOT_DIR){
   await fs.mkdir(process.env.KORA_SCREENSHOT_DIR,{recursive:true});
   await page.locator('#report-test').screenshot({path:path.join(process.env.KORA_SCREENSHOT_DIR,'krediya-informe-390.png')});
   await page.setViewportSize({width:1128,height:900});
   await page.evaluate(()=>window.component.openTariff());
   await page.locator('dialog').screenshot({path:path.join(process.env.KORA_SCREENSHOT_DIR,'krediya-tarifario-1128.png')});
   await page.locator('[data-edit]').click();
   await page.locator('dialog').screenshot({path:path.join(process.env.KORA_SCREENSHOT_DIR,'krediya-editor-1128.png')});
   await page.locator('[data-close]').click();
  }
  await page.evaluate(async()=>{
   window.loadFailure={message:'Servicio no disponible'};
   await window.component.report(document.getElementById('report-test'),{id:'batch',fecha_corte:'2026-08-30'});
  });
  assert.match(await page.locator('#report-test').innerText(),/No se pudo cargar el informe: Servicio no disponible/);
  assert.equal(await page.locator('.difference-summary').count(),0,'Fallo no presentado como cero diferencias');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
