import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium,webkit} from '@playwright/test';
const script=await readFile('creditek/erp/tesoreria-preparacion.js','utf8');
for(const engine of ['chromium','webkit'])test(`pagos sin etapa de preparación: ${engine}`,async()=>{
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('about:blank');await page.setContent('<main id="pending"></main>');await page.addScriptTag({content:script});
 await page.evaluate(async()=>{window.calls=[];let completed=false;const ready={id:'celu',liquidation_id:'lot',estado:'aprobada',requiere_recalcular:true,comercio:'CELUOFERTA',neto:513000};const q={select(){return this},eq(){return this},order(){return this},then(ok){return Promise.resolve({data:[]}).then(ok)}};window.sb={from:()=>q,rpc:async(n)=>{calls.push(n);if(n==='tesoreria_pendientes_liquidacion')return {data:completed?[]:[ready]};if(n==='tesoreria_completar_ordenes_aprobadas'){completed=true;return {data:{ok:true}};}throw Error(n);}};await CreditekTesoreriaPreparacion.create({sb}).mount(document.getElementById('pending'));});
 assert.equal(await page.locator('#pending').textContent(),'');assert.equal(await page.getByRole('button',{name:'Preparar órdenes aprobadas'}).count(),0);
 assert.equal(await page.evaluate(()=>calls.filter(n=>n==='tesoreria_completar_ordenes_aprobadas').length),1);
 await page.evaluate(async()=>{sb.rpc=async()=>({data:[{id:'falta',liquidation_id:'lot',estado:'aprobada',comercio:'Comercio prueba',origen_codigo:'A',neto:513000,falta_cuenta:true}]});await CreditekTesoreriaPreparacion.create({sb}).mount(document.getElementById('pending'));});
 assert.match(await page.locator('#pending').textContent(),/Cuenta verificada/);assert.equal(await page.getByRole('heading',{name:'Datos pendientes de pagos'}).count(),1);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
