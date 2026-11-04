import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,webkit} from '@playwright/test';

for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]])test('ofertas vigentes muestran fecha de publicación y detalle · '+name,async()=>{
 const browser=await engine.launch(name==='Chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<main><section id="listasVigentes"></section></main>');
  await page.addScriptTag({content:await readFile('creditek/erp/b2b-listas-vigentes.js','utf8')});
  await page.evaluate(async()=>{
   window.KoraB2BComparativo={all:async()=>[{id:'o',lista_id:'l',proveedor_id:'p',producto_id:'x',costo:355000,precio_tienda:405000,vigente:true,b2b_listas_precios:{creado_at:'2026-11-03T19:00:00Z'}}]};
   await KoraB2BListasVigentes.cargar({sb:{},container:document.querySelector('#listasVigentes'),providers:[{id:'p',nombre:'Comunicaribe'}],products:[{id:'x',nombre:'Samsung A07'}]});
  });
  const card=page.locator('details');assert.match(await card.locator('summary').innerText(),/Comunicaribe.*3 de nov/);
  await card.locator('summary').click();assert.equal(await page.getByText('Samsung A07').count(),1);assert.match(await card.innerText(),/355\.000/);
 }finally{await browser.close();}
});
