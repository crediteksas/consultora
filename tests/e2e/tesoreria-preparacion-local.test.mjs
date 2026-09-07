import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from '@playwright/test';
for(const engine of ['chromium','webkit'])test(`Tesorería: pendientes y asignación responsive ${engine}`,async()=>{
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 try{
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const f=resolve(process.cwd(),'.'+u.pathname);if(!f.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   window.testCalls=[];window.testFail=false;let assigned=false;
   const rows=()=>[{id:'op-1',liquidation_id:'alo',origen_codigo:'LACHESCEL',comercio:'Lachescel soluciones',plataforma:'alo',corte:'2026-09-06',referencia:'Equipo 128GB',porcentaje:.77,neto:477050,ejecutivo_actual:assigned?'exec-1':null,falta_ejecutivo:!assigned,falta_titular:true,falta_cuenta:true,requiere_recalcular:true}];
   const sb={from(){const q={select(){return q},eq(){return q},order(){return q},then(ok){return Promise.resolve({data:[{id:'exec-1',nombre:'Ejecutivo prueba'}]}).then(ok)}};return q;},async rpc(name,params){window.testCalls.push({name,params});if(name==='tiene_capacidad_aliados')return {data:true};if(name==='tesoreria_pendientes_liquidacion')return {data:rows()};if(name==='tesoreria_asignar_ejecutivo'){if(window.testFail)return {error:{message:'El ejecutivo cambió; actualiza antes de guardar'}};assigned=true;return {data:{ok:true}};}throw Error('RPC inesperado: '+name);}};
   window.creditekSidebar={sb,perfil:{rol:'auditoria',activo:true}};
  });
  await page.goto('https://kora.test/creditek/erp/aliados-tesoreria.html?vista=preparacion&lote=alo');
  await page.getByRole('heading',{name:'Preparación de pagos',exact:true}).waitFor();
  assert.match(await page.locator('#preparationContent').textContent(),/477.050/);
  assert.match(await page.locator('#preparationContent').textContent(),/77 %/);
  for(const size of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1280,height:900}]){
   await page.setViewportSize(size);assert.ok(await page.locator('#preparationContent').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'desborde '+JSON.stringify(size));
  }
  await page.locator('[data-search]').fill('sin coincidencia');assert.equal(await page.locator('.preparation-card').count(),0);await page.locator('[data-search]').fill('Lachescel');
  await page.locator('[name=executive]').selectOption('exec-1');await page.evaluate(()=>window.testFail=true);
  await page.getByRole('button',{name:'Guardar ejecutivo'}).click();await page.getByRole('alert').filter({hasText:'El ejecutivo cambió'}).waitFor();
  assert.equal(await page.locator('[name=executive]').inputValue(),'exec-1');await page.evaluate(()=>window.testFail=false);await page.getByRole('button',{name:'Guardar ejecutivo'}).click();
  await page.waitForFunction(()=>!document.querySelector('#preparationContent [name=executive]'));
  assert.match(await page.getByRole('link',{name:'Cliente y cuenta',exact:true}).getAttribute('href'),/vista=clientes&origen=LACHESCEL/);
  assert.match(await page.getByRole('link',{name:'Volver al lote / actualizar cálculo'}).getAttribute('href'),/lote=alo/);
  await page.setViewportSize({width:390,height:844});await page.locator('.preparation-card').scrollIntoViewIfNeeded();await page.screenshot({path:`/private/tmp/tesoreria-preparacion-${engine}.png`});
  const calls=await page.evaluate(()=>window.testCalls);assert.ok(calls.every(c=>['tiene_capacidad_aliados','tesoreria_pendientes_liquidacion','tesoreria_asignar_ejecutivo'].includes(c.name)));assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
