import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
test('dashboard y reporte muestran puente de utilidad y todas las financieras sin errores',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
  if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
  const f=resolve(process.cwd(),'.'+u.pathname);if(!f.startsWith(process.cwd()+'/'))return route.abort();
  try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await route.fulfill({status:404,body:''});}
 });
 await page.addInitScript(()=>{
  const data={liquidation_operations:[{id:'k',external_id:'K',plataforma:'krediya',operation_at:'2026-08-20T17:00:00Z',tipo_establecimiento:'aliado',establishment_name:'Tienda de prueba',monto_base:14476977,bonos_aplicados:1100000,utilidad_creditek:2369089.49,policy_snapshot:{krediya_v2:{gasto_financiero:57907.91,provision:921312.6}}}],creditos_historicos_plataforma:[{id:'p',codigo_credito:'P',plataforma:'payjoy',fecha_credito:'2026-08-10T17:00:00Z',establecimiento:'Histórica',tipo_establecimiento:'aliado',monto_credito:200,bonos_historicos:0,utilidad_neta_historica:20,resultado_cerrado_historico:20}]};
  window.creditekSidebar={perfil:{rol:'gerencia',activo:true},sb:{from(table){const q=new Proxy({}, {get(_,key){if(key==='then')return ok=>Promise.resolve(localStorage.getItem('simulateLoadFailure') && table==='aliados_gastos_operativos' ? {error:{message:'simulated failure'}} : {data:data[table]||[]}).then(ok);return ()=>q;}});return q;}}};
 });
 await page.goto('https://kora.test/creditek/erp/aliados-dashboard.html');
 await page.getByRole('heading',{name:'Cómo se obtiene la utilidad'}).waitFor();
 await page.locator('#dashboardFrom').fill('2026-08-01');await page.locator('#dashboardTo').fill('2026-08-31');await page.locator('#dashboardTo').dispatchEvent('change');
 await page.locator('#dashboardPlatform').selectOption('krediya');
 assert.match(await page.locator('#content').textContent(),/4\.448\.310,00/);
 assert.match(await page.locator('#content').textContent(),/2\.369\.089,49/);
 await page.locator('#dashboardPlatform').selectOption('');
 assert.match(await page.locator('#dashboardFilterSummary').textContent(),/2 créditos/);
 assert.match(await page.locator('#dashboardFilterSummary').textContent(),/PayJoy/);
 for(const width of [390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#metrics').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 await page.emulateMedia({media:'print'});assert.match(await page.locator('#content').textContent(),/Menos: bonificaciones/);
 const dashboardMetrics=await page.locator('#metrics').textContent();
 await page.goto('https://kora.test/creditek/erp/aliados-reportes.html');
 await page.getByRole('heading',{name:'Cómo se obtiene la utilidad'}).waitFor();
 await page.locator('#reportFrom').fill('2026-08-01');await page.locator('#reportTo').fill('2026-08-31');await page.locator('#reportTo').dispatchEvent('change');
 assert.equal(await page.locator('#metrics').textContent(),dashboardMetrics);
 await page.locator('#reportPlatform').selectOption('payjoy');
 assert.match(await page.locator('#content').textContent(),/1 créditos/);
 await page.evaluate(()=>localStorage.setItem('simulateLoadFailure','1'));await page.reload();
 await page.getByRole('heading',{name:'Informe no disponible'}).waitFor();
 assert.equal(await page.locator('#metrics').textContent(),'');
 assert.doesNotMatch(await page.locator('#content').textContent(),/2\.369\.089/);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
