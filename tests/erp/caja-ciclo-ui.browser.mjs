import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
 await page.route('https://kora.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
 await page.goto('https://kora.test/');
 await page.setContent('<html><head><style>*{box-sizing:border-box}body{margin:12px;font:16px sans-serif}button,input,textarea{font:inherit}section{max-width:100%}</style></head><body><main id="test"></main></body></html>');
 await page.addStyleTag({content:readFileSync('creditek/erp/caja.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1]});
 await page.addScriptTag({ content: readFileSync('creditek/erp/caja-ciclo-ui.js','utf8') });
 await page.evaluate(async () => {
  window.llamadas=[];
  window.sbTest={rpc:async(name,p)=>{
   window.llamadas.push({name,p});
   return name==='estado_apertura_caja' ? {data:{bloqueada:true,fecha_pendiente:'2026-09-21',resumen:{esperado:350000,gastos_pendientes:0},corte:{estado:'pendiente',efectivo_contado:null}}} : {data:{ok:false,mensaje:'Diferencia registrada. Solicita revisión a Gestión.'}};
  }};
  await window.CreditekCajaCiclo.montar({sb:window.sbTest,perfil:{rol:'admin_tienda',tienda_codigo:'TEST'},contenedor:document.getElementById('test')});
 });
 assert.equal(await page.getByLabel('Efectivo contado físicamente').inputValue(),'');
 assert.equal(await page.getByRole('link').getAttribute('href'),'gastos.html?fecha=2026-09-21');
 await page.getByLabel('Efectivo contado físicamente').fill('340000');
 await page.getByLabel('Observación').fill('Conteo verificado, falta revisar');
 await page.getByRole('button',{name:'Registrar arqueo y validar'}).click();
 await page.getByRole('status').filter({hasText:'Diferencia registrada'}).waitFor();
 assert.equal(await page.evaluate(()=>window.llamadas.at(-1).p.p_efectivo_contado),340000);
 assert.equal(await page.evaluate(()=>window.llamadas.at(-1).p.p_autorizar),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/private/tmp/kora-caja-arqueo-movil.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await page.evaluate(async()=>{
  window.sbTest.from=()=>{const q={select:()=>q,eq:()=>q,order:async()=>({data:[{codigo:'TEST',nombre:'Tienda de prueba'}]})};return q;};
  window.sbTest.rpc=async()=>({data:{bloqueada:true,fecha_pendiente:'2026-09-21',resumen:{esperado:350000,gastos_pendientes:0},corte:{estado:'observada',efectivo_contado:340000}}});
  await window.CreditekCajaCiclo.montar({sb:window.sbTest,perfil:{rol:'gerencia'},contenedor:document.getElementById('test')});
 });
 assert.equal(await page.getByLabel('Efectivo contado físicamente').inputValue(),'340000');
 assert.equal(await page.getByRole('button',{name:'Autorizar diferencia registrada'}).count(),1);
 await page.screenshot({path:'/private/tmp/kora-caja-arqueo-gestion.png',fullPage:true});
 console.log('PASS: administrador, monto no autollenado, fecha de gasto, diferencia registrada, responsive y autorización central.');
} finally {await browser.close();}
