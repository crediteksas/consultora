import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve} from 'node:path';

for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
 test(`abre provisiones y muestra los costos registrados (${viewport.width}px)`,async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
   const page=await browser.newPage({viewport});
   await page.setContent('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="evolution-root"></main></body></html>');
   await page.addStyleTag({path:resolve('creditek/erp/cobra-evolution.css')});
   await page.addScriptTag({path:resolve('creditek/erp/cobra-evolution-domain.js')});
   await page.addScriptTag({path:resolve('creditek/erp/cobra-evolution-ui.js')});
   await page.evaluate(async()=>{const data={version:1,invalid_dates:0,items:[],months:[{month:'2026-09-01',operations:2,missing:0,reversals:0,duplicates:0,unmatched:0,provision_pesos:1000,installments_pesos:800,cancellations_pesos:300,new_uses_pesos:0,unallocated_prior_pesos:0,potential_duplicates:0,events:2}]};await window.CobraEvolutionUI.start({coverageBook:async()=>data,fundCapabilities:async()=>({authorizer:false}),fundBook:async()=>({fundings:[],actions:[]}),listCuts:async()=>[]});});
   assert.equal(await page.locator('[data-ce-tab="fund"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#ce-fund').isVisible(),true);
   assert.equal(await page.locator('#ce-comparison').isHidden(),true);
   assert.match(await page.locator('#ce-coverage').innerText(),/2026-09/);
   assert.match(await page.locator('#ce-coverage').innerText(),/1\.000/);
   assert.match(await page.locator('#ce-coverage').innerText(),/100/);
   assert.match(await page.locator('#ce-fund').innerText(),/no se descuentan otra vez/);
   const dims=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(dims.scroll<=dims.width+1,`La pantalla se desborda: ${JSON.stringify(dims)}`);
  } finally {await browser.close();}
 });
}
