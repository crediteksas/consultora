import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
test('Tesorería presenta la diferencia sin inventar un cobro o nueva orden',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.setDefaultTimeout(10000);
 page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
 if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
 const f=resolve(process.cwd(),'.'+u.pathname);if(!f.startsWith(process.cwd()+'/'))return route.abort();
 try {await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch {await route.fulfill({status:404,body:''});}
 });
 await page.addInitScript(()=>{
 const sb={from(table){const q=new Proxy({}, {get(_,key){if(key==='then')return ok=>Promise.resolve({count:0,data:table==='liquidation_adjustments'?[{estado:'aprobado',new_value:{diferencias_pagos:[{nombre:'Luis',pagado:220000,bono_correcto:0,diferencia:220000,estado:'pendiente_validacion_soporte'},{nombre:'Mayte',pagado:145000,bono_correcto:110000,diferencia:35000,estado:'pendiente_validacion_soporte'}]}}]:[]}).then(ok);return ()=>q;}});return q;},async rpc(){return {data:true};}};
 window.creditekSidebar={sb,perfil:{rol:'gerencia',activo:true}};
 });
 await page.goto('https://kora.test/creditek/erp/aliados-tesoreria.html');
 await page.getByRole('heading',{name:'Krediya · ajuste numérico aplicado'}).waitFor();
 assert.match(await page.locator('#rectificationSummary').textContent(),/255.000/);
 await page.getByText('Ver diferencias',{exact:true}).click();
 assert.match(await page.locator('#rectificationSummary').textContent(),/220.000/);
 for(const width of [390,768,1280]){
 await page.setViewportSize({width,height:844});
 assert.ok(await page.locator('#rectificationSummary').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 }
 assert.equal(await page.locator('#notice').textContent(),'');
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
