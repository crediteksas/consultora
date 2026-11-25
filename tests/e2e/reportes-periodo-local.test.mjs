import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
import {html,appSource,cacheSource,backend,fixtures} from '../fixtures/reportes-periodo/harness.mjs';
const plain=s=>s.replace(/\s/g,'');
const evidence=process.env.KORA_FICTIONAL_SCREENSHOTS;
async function pageFixture(browser,role='gerencia'){
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 let cssLoaded=false;page.on('response',r=>{if(r.url()==='https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css'&&r.ok())cssLoaded=true;});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='GET'&&(url.href==='https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css'||url.href==='https://unpkg.com/lucide@1.27.0/dist/umd/lucide.min.js'||['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)))return route.continue();
  if(url.hostname!=='kora.test'){external.push(url.hostname);return route.abort();}
  if(url.pathname==='/creditek/erp/reportes.html')return route.fulfill({contentType:'text/html',body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')});
  const p=resolve(process.cwd(),'.'+url.pathname);if(!p.startsWith(process.cwd()+'/'))return route.abort();
  try{return route.fulfill({contentType:({'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'})[extname(p)]||'application/octet-stream',body:await readFile(p)});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('https://kora.test/creditek/erp/reportes.html',{waitUntil:'networkidle'});
 assert.equal(cssLoaded,true,'Tailwind real cargado; APIs de negocio bloqueadas');
 await page.addScriptTag({content:`window.makeBackend=${backend.toString()};`});
 await page.evaluate(({data,role})=>{
  data.perfiles=[{id:'fictional-user',nombre:'Operador ficticio',activo:true,rol:role,tienda_codigo:role==='admin_tienda'?'S01':null}];
  data.origenes=[{codigo:'S01',nombre:'Tienda ficticia Uno',ciudad:'Ciudad ficticia',tipo:'propia',activo:true},{codigo:'S02',nombre:'Tienda ficticia Dos',ciudad:'Ciudad ficticia',tipo:'propia',activo:true}];
  data.venta_items_lectura=data.ventas.filter(v=>!v.anulada&&v.fecha<='2026-11-25').map(v=>{const cost=v.tienda_codigo==='S01'?60:110;v.venta_items[0].costo_congelado=cost;return {id:'item-'+v.id,venta_id:v.id,cantidad:1,costo_congelado:cost,ventas:{tienda_codigo:v.tienda_codigo,fecha:v.fecha,anulada:false}};});
  window.fixtureData=data;window.fixtureCalls=[];window.fixtureFailure={};window.fixtureRole=role;
  window.__KORA_ENV__={};window.supabase={createClient:()=>window.makeBackend(data,window.fixtureCalls,window.fixtureFailure)};
  window.CreditekTableroUtilidad={authorizedExpenses:async()=>[]};window.Chart=class{destroy(){}};
  const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-25T17:00:00Z']));}static now(){return new NativeDate('2026-11-25T17:00:00Z').getTime();}};
 },{data:fixtures(),role});
 await page.addScriptTag({url:'https://kora.test/design-system/components/kora-product.js'});
 await page.addScriptTag({content:cacheSource});await page.addScriptTag({content:appSource});
 await page.evaluate(`(async()=>{await verificarAuth();document.getElementById('tbody-presupuesto').closest('details').open=true;document.getElementById('auth-guard').classList.add('hidden');sb.rpc=()=>({order(){return this},range:async()=>({data:[],error:null})});})()`);
 return {page,errors,external};
}
test('Dashboard: presupuesto completo y utilidad en el mismo cuadro, solo ficticios',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  await t.test('más de 1000 ventas, utilidad y tabla legible en escritorio/móvil',async()=>{
   const {page,errors,external}=await pageFixture(browser);
   await page.evaluate(`(async()=>{await cargarPresupuesto();const cache=crearCacheRefresco();const rentabilidad=cargarRentabilidadTienda(cache);await cargarVentas(cache,rentabilidad);})()`);
   const table=page.locator('#tbody-ventas').locator('..');
   assert.match(await table.innerText(),/Utilidad del período/i);assert.doesNotMatch(await table.innerText(),/sem\. pasada/);
   assert.match(plain(await table.innerText()),/24\.000/);assert.match(plain(await table.innerText()),/-\$6\.050/);
   assert.match(plain(await page.locator('#tbody-presupuesto').innerText()),/60\.500/);
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1050});await table.scrollIntoViewIfNeeded();
    assert.equal(await table.isVisible(),true);const box=await table.boundingBox();assert.ok(box&&box.width>0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:resolve(evidence,`utilidad-${width}.png`)});}
   }
   await page.addScriptTag({url:'https://kora.test/creditek/erp/kora-report-export.js'});
   const exported=await page.evaluate(()=>{document.querySelectorAll('section').forEach(s=>{if(!s.querySelector('#tbody-ventas'))s.hidden=true;});return KoraReportExport.snapshot({rol:'gerencia',nombre:'Operador ficticio'}).tables.find(t=>t.sourceId==='tbody-ventas');});
   assert.equal(exported.headers.length,7);assert.match(exported.headers[6],/Utilidad del período/i);assert.equal(exported.rows[0].length,7);
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
  });
  await t.test('cambiar tienda recalcula presupuesto y elimina tiendas excluidas',async()=>{
   const {page,errors}=await pageFixture(browser);await page.evaluate(`(async()=>{await cargarPresupuesto();tiendasFiltro=['S02'];await cargarPresupuesto();})()`);
   const text=await page.locator('#tbody-presupuesto').innerText();assert.match(text,/Tienda ficticia Dos/);assert.doesNotMatch(text,/Uno|Tres/);assert.match(plain(text),/60\.500/);assert.deepEqual(errors,[]);await page.close();
  });
  await t.test('error de paginación sustituye resultados previos por aviso',async()=>{
   const {page,errors}=await pageFixture(browser);await page.evaluate(`(async()=>{await cargarPresupuesto();fixtureFailure.table='ventas';fixtureFailure.from=500;try{await cargarPresupuesto();}catch{}})()`);
   const text=await page.locator('#tbody-presupuesto').innerText();assert.match(text,/No se pudo completar/);assert.doesNotMatch(text,/60\.500|0\.0%/);assert.deepEqual(errors,[]);await page.close();
  });
  await t.test('admin_tienda mantiene seis columnas sin utilidad central',async()=>{
   const {page,errors}=await pageFixture(browser,'admin_tienda');await page.evaluate(`cargarVentas({obtener:async()=>({data:fixtureData.ventas.slice(0,1)})},cargarRentabilidadTienda({}))`);
   const row=page.locator('#tbody-ventas tr').first();assert.equal(await row.locator('td').count(),6);
   assert.equal(await page.getByRole('columnheader',{name:'Utilidad del período',exact:true}).isVisible(),false);
   await page.addScriptTag({url:'https://kora.test/creditek/erp/kora-report-export.js'});
   const exported=await page.evaluate(()=>{document.querySelectorAll('section').forEach(s=>{if(!s.querySelector('#tbody-ventas'))s.hidden=true;});return KoraReportExport.snapshot({rol:'admin_tienda',nombre:'Operador ficticio',tienda_codigo:'S01'}).tables.find(t=>t.sourceId==='tbody-ventas');});
   assert.equal(exported.headers.length,6);assert.equal(exported.rows[0].length,6);assert.ok(exported.headers.every(x=>!x.includes('Utilidad')));
   assert.deepEqual(errors,[]);await page.close();
  });
 }finally{await browser.close();}
});
