// Actual dashboard styles, fictitious content, no business scripts or external services.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {chromium,webkit} from '@playwright/test';
const out=process.env.CREDITEK_VISUAL_CAPTURE_DIR;
const preexistingToggle="function onCambioFiltro() {\n  const periodo = document.getElementById('filtroPeriodo').value;\n  document.getElementById('campoRangoDesde').style.display = periodo === 'rango' ? 'block' : 'none';\n  document.getElementById('campoRangoHasta').style.display = periodo === 'rango' ? 'block' : 'none';\n  if (periodo !== 'rango') actualizarPeriodo();\n  else cargarCierreSeptiembre();\n}";
const source=`<!doctype html><html lang="es" data-creditek-visual="liquid-1"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-system/components/kora-dashboard.css"><link rel="stylesheet" href="/design-system/components/kora-dashboard-premium.css"><link rel="stylesheet" href="/design-system/components/creditek-liquid.css"><style>.global-incident-launch svg{width:17px;height:17px}#app .global-incident-launch.danger{background:#fee2e2!important;color:#991b1b!important}.finance-negative{color:var(--red)}.finance-positive{color:var(--green)}</style></head><body data-kora-dashboard="1.0.0" data-aura-page="finanzas"><div class="kora-shell-root"><main class="page"><h1>Resumen ficticio</h1><div id="app" class="show"><button class="global-incident-launch" id="idleIncident" data-aura-global-incident type="button" aria-label="Reportar incidencia" title="Reportar incidencia" aria-controls="view-configuracion"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4"/><path d="M18 13h4"/><path d="M21 21c0-2.1-1.7-3.9-3.8-4"/></svg></button><button class="global-incident-launch danger" id="dangerIncident">Estado crítico ficticio</button><button id="disabledDashboard" disabled>Acción deshabilitada</button><button id="hiddenDashboard" hidden>Acción oculta</button></div><section class="dashboard-filterbar"><label>Período<select id="filtroPeriodo"><option value="mes">Mes de prueba</option><option value="rango">Rango personalizado</option></select><div class="campo-rango" id="campoRangoDesde"><input type="date" value="2026-10-01"></div><div class="campo-rango" id="campoRangoHasta"><input type="date" value="2026-10-31"></div></label></section><section class="dashboard-metrics"><article class="dashboard-metric"><div class="kpi-valor">$ 1.234.567.890,50</div><p class="finance-negative">-$ 320.000,25</p><p class="finance-positive">$ 420.000,75</p></article></section><section class="dashboard-primary-grid"><article class="dashboard-panel"><table><thead><tr><th>Tienda</th><th>Saldo</th></tr></thead><tbody><tr><td>Ficticia</td><td>$ 120.000,50</td></tr></tbody></table></article></section><section class="dashboard-chart-panel"><div class="dashboard-profit-tabs"><button id="printSelected" aria-selected="true">Retail</button><button id="printOther" aria-selected="false">B2B</button></div></section><section class="dashboard-support-grid"><p>Detalle ficticio</p></section><section class="dashboard-executives"><p>Ejecutivo ficticio</p></section></main></div></body></html>`;
for(const [name,type] of [['chromium',chromium],['webkit',webkit]])test('dashboard real CSS: impresión estática, importes, foco y variables financieras; '+name,async()=>{
 const browser=await type.launch(name==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!=='https://visual.test')return route.abort();
   if(url.pathname==='/dashboard')return route.fulfill({contentType:'text/html',body:source});
   if(!url.pathname.startsWith('/design-system/'))return route.abort();
   const file=path.resolve(process.cwd(),'.'+url.pathname);if(!file.startsWith(process.cwd()+'/design-system/'))return route.abort();
   try{return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'application/octet-stream',body:await fs.readFile(file)});}catch{return route.fulfill({status:404,body:''});}
  });
  await page.goto('https://visual.test/dashboard');const initial=await page.locator('main').textContent();
  await page.addScriptTag({content:'window.actualizarPeriodo=()=>{};window.cargarCierreSeptiembre=()=>{};'+preexistingToggle+';document.getElementById("filtroPeriodo").addEventListener("change",onCambioFiltro);'});
  assert.equal(await page.locator('#campoRangoDesde').isVisible(),false);
  await page.locator('#filtroPeriodo').selectOption('rango');assert.equal(await page.locator('#campoRangoDesde').isVisible(),true);assert.equal(await page.locator('#campoRangoHasta').isVisible(),true);
  await page.locator('#filtroPeriodo').selectOption('mes');assert.equal(await page.locator('#campoRangoDesde').isVisible(),false);
  assert.equal(await page.locator('#idleIncident').getAttribute('aria-label'),'Reportar incidencia');
  assert.equal((await page.locator('#idleIncident').textContent()).trim(),'');
  assert.ok(await page.locator('#idleIncident').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1));
  assert.equal(await page.locator('#idleIncident').isVisible(),true);assert.equal(await page.locator('#dangerIncident').isVisible(),true);
  assert.equal(await page.locator('#idleIncident').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  assert.equal(await page.locator('#dangerIncident').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(254, 226, 226)');
  assert.equal(await page.locator('#dangerIncident').evaluate(el=>getComputedStyle(el).color),'rgb(153, 27, 27)');
  assert.equal(await page.locator('#disabledDashboard').isDisabled(),true);assert.equal(await page.locator('#hiddenDashboard').isVisible(),false);
  assert.equal(await page.locator('.finance-negative').evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 50)');
  assert.equal(await page.locator('.finance-positive').evaluate(el=>getComputedStyle(el).color),'rgb(8, 118, 94)');
  await page.locator('#filtroPeriodo').focus();assert.ok(await page.locator('#filtroPeriodo').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('main').textContent(),initial);}
  await page.evaluate(()=>document.body.classList.add('kora-product-page'));
  await page.emulateMedia({media:'print'});
  const tabStyle=await page.locator('#printSelected').evaluate(el=>{const c=getComputedStyle(el);return {radius:c.borderRadius,background:c.backgroundColor,padding:c.padding,fontSize:c.fontSize};});
  assert.equal(tabStyle.radius,'7px');assert.equal(tabStyle.background,'rgb(255, 255, 255)');assert.equal(tabStyle.padding,'7px 16px');assert.equal(tabStyle.fontSize,'13px');
  for(const selector of ['.dashboard-filterbar','.dashboard-metrics','.dashboard-primary-grid','.dashboard-support-grid','.dashboard-executives']){
   const css=await page.locator(selector).evaluate(el=>{const c=getComputedStyle(el);return {opacity:c.opacity,animation:c.animationName,transform:c.transform,display:c.display};});
   assert.equal(css.opacity,'1',selector);assert.equal(css.animation,'none',selector);assert.equal(css.transform,'none',selector);assert.notEqual(css.display,'none',selector);
  }
  await page.evaluate(()=>document.body.removeAttribute('data-kora-dashboard'));
  for(const selector of ['.dashboard-filterbar','.dashboard-metrics','.dashboard-primary-grid','.dashboard-support-grid','.dashboard-executives'])assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.evaluate(()=>document.body.setAttribute('data-kora-dashboard','1.0.0'));
  assert.equal(await page.locator('main').textContent(),initial);assert.equal(await page.locator('.kpi-valor').isVisible(),true);assert.ok(await page.locator('.kpi-valor').evaluate(el=>el.clientWidth>0&&el.scrollWidth<=el.clientWidth+1));
  if(out){await fs.mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'dashboard-print-'+name+'.png')});if(name==='chromium')await page.pdf({path:path.join(out,'dashboard-print-synthetic.pdf'),format:'A4',printBackground:true});}
  if(name==='chromium'){
   await page.emulateMedia({media:'screen',forcedColors:'active'});assert.equal(await page.evaluate(()=>matchMedia('(forced-colors: active)').matches),true);
   assert.equal(await page.locator('.kora-shell-root').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
   assert.equal(await page.locator('.dashboard-metrics').evaluate(el=>getComputedStyle(el).boxShadow),'none');
  }
  assert.deepEqual(errors,[]);await page.close();
 }finally{await browser.close();}
});
