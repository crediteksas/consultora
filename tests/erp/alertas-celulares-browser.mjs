// Prueba local aislada, sin sesión ni escrituras en producción.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({body:'<!doctype html><body></body>',contentType:'text/html'}));
 await page.goto('https://kora.test/');
 const css=readFileSync('creditek/erp/alertas-celulares.css','utf8');
 for(const width of [320,390,1100]) {
  await page.setViewportSize({width,height:950});
  await page.setContent(`<style>body{margin:12px;font-family:Arial;background:#f7f9fb}${css}</style><section id="card" class="kora-phone-alerts ${width>500?'kora-phone-alerts--wide':''}"></section>`);
  await page.addScriptTag({content:readFileSync('creditek/erp/alertas-celulares.js','utf8')});
  await page.evaluate(async()=>{
   const data={productos:[{id:'p',nombre:'Samsung Galaxy A07 128 GB / 4 GB',categoria:'CELULAR',tipo:'serializado',activo:true}],origenes:[{codigo:'A',nombre:'Chinucell',tipo:'propia',activo:true}],ventas:[{id:'v',fecha:KoraAlertasCelulares.period().end,tienda_codigo:'A',anulada:false,items:[{producto_id:'p',cantidad:3}]}]};
   const sb={from(table){return{select(){return this;},order(){return this;},eq(){return this;},in(){return this;},gte(){return this;},lte(){return this;},range:async()=>({data:data[table]||[]})};}};
   await KoraAlertasCelulares.mount(document.getElementById('card'),sb,{activo:true,rol:'gerencia'});
  });
  await page.getByRole('button',{name:'Más vendidos',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Más vendidos',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await page.getByText('Sin stock',{exact:true}).waitFor();
  await page.screenshot({path:`/private/tmp/kora-celulares-${width}.png`,fullPage:true});
 }
 console.log('OK: 320, 390 y 1100px; actualización, pestañas, sin desborde.');
} finally { await browser.close(); }
