import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium} from '@playwright/test';
import CreditekReversiones from '../../creditek/erp/aliados-reversiones-domain.js';
test('gráficas del presupuesto legibles en escritorio y móvil',async()=>{
 const app=fs.readFileSync('creditek/erp/aliados-v1-1-app.js','utf8');
 const names={payjoy:'PayJoy',krediya:'Krediya',alo:'ALO Credit'};
 const goals=[['payjoy',170,63],['krediya',80,35],['alo',60,9]];
 const db={platformGoals:goals.map(([plataforma,meta_creditos])=>({plataforma,meta_creditos,estado:'vigente',periodo_desde:'2026-09-01',periodo_hasta:'2026-09-30'}))};
 const ctx={db,CreditekReversiones,esc:String,platformName:p=>names[p],operationSaleDay:o=>o.operation_at};
 vm.runInNewContext(app.slice(app.indexOf('  function dashboardGoalCharts('),app.indexOf('  function renderDashboard(')),ctx);
 const ops=goals.flatMap(([plataforma,,n])=>Array.from({length:n},()=>({plataforma,operation_at:'2026-09-16',reconocida:true})));
 const html=ctx.dashboardGoalCharts(ops,{from:'2026-09-01',to:'2026-09-17'});
 const css=fs.readFileSync('creditek/erp/aliados-v1-1.css','utf8');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [1100,390]){
  const page=await browser.newPage({viewport:{width,height:950}});
  await page.setContent(`<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px}.card{margin:0}</style><body>${html}</body></html>`);
  assert.equal(await page.getByRole('img').count(),3);
  assert.match(await page.locator('body').innerText(),/63 de 170/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`/tmp/kora-presupuesto-${width}.png`,fullPage:true});
  await page.close();
 }}finally{await browser.close();}
});
