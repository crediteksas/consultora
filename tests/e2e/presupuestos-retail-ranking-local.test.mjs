import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,webkit} from '@playwright/test';
const source=await readFile('creditek/erp/tablero.html','utf8');
assert.match(source,/presupuestos-retail-ranking.js/);assert.match(source,/KoraPresupuestoRanking\?\.montar/);
for(const [name,engine]of [['Chromium',chromium],['WebKit',webkit]])test('Ranking mensual: cuatro pestañas, permisos, móvil y respuestas obsoletas · '+name,async()=>{
 const browser=await engine.launch(name==='Chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.abort());
  await page.setContent('<style>body{margin:0;font:14px Arial;background:#f5f8fc}main{max-width:1100px;margin:auto;padding:16px}*{box-sizing:border-box}table{border-collapse:collapse;width:100%}td,th{padding:14px;border-bottom:1px solid #dae3ec;text-align:left}thead{background:#0b1e3d;color:white}</style><main><section id="ranking" hidden></section></main>');
  await page.addStyleTag({content:await readFile('creditek/erp/presupuestos-retail-ranking.css','utf8')});
  await page.addScriptTag({content:await readFile('creditek/erp/presupuestos-retail-cierre.js','utf8')});
  await page.evaluate(()=>{
   const data=[['CK-A','Punto Norte',100,120],['CK-B','Punto Sur',1000,1000],['CK-C','Punto Centro',100,120],['CK-D','Punto sin meta',null,200]].map(([codigo,nombre,meta,real])=>({tienda:{codigo,nombre},periodo:{cerrado:true,corte:'2026-10-31'},categorias:KoraPresupuestoCierre.METRICAS.map(m=>({...m,presupuesto:meta,presupuestoCorte:meta,realizado:real,cumplimientoCorte:meta?real/meta:null,estadoCorte:meta?'Meta alcanzada':'Presupuesto incompleto',valorAnterior:codigo==='CK-A'?60:codigo==='CK-B'?2000:codigo==='CK-C'?120:null,variacionAnual:codigo==='CK-A'?60:codigo==='CK-B'?-1000:codigo==='CK-C'?0:null,crecimientoAnual:codigo==='CK-A'?1:codigo==='CK-B'?-.5:codigo==='CK-C'?0:null,estadoCrecimiento:codigo==='CK-A'?'Crecimiento':codigo==='CK-B'?'Disminución':codigo==='CK-C'?'Sin variación':'Sin histórico comparable'}))}));
   window.__fixture={data,calls:0,fail:false,defer:false,stores:[{codigo:'CK-A'},{codigo:'CK-B'}]};
   window.KoraPresupuestoCierre={...KoraPresupuestoCierre,cargar:async args=>{window.__fixture.calls++;window.__fixture.lastStoreCount=args.tiendas.length;if(window.__fixture.fail)throw Error('Fuente ficticia no disponible');if(window.__fixture.defer)return await new Promise(resolve=>window.__resolve=()=>resolve(data));return data;}};
  });
  await page.addScriptTag({content:await readFile('creditek/erp/presupuestos-retail-ranking.js','utf8')});
  await page.evaluate(()=>KoraPresupuestoRanking.montar({panel:document.getElementById('ranking'),perfil:{activo:true,rol:'gerencia'},tiendas:()=>window.__fixture.stores,sb:null,now:()=>new Date('2026-10-31T18:00Z')}));
  await page.getByRole('cell',{name:'Sin posición',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Ranking de cumplimiento y crecimiento',exact:true}).count(),1);
  // El id real es el que define la página integrada; las reglas CSS se aplican también en el ensayo.
  await page.locator('#ranking').evaluate(e=>e.id='rankingPresupuesto');
  assert.equal(await page.getByRole('tab').count(),4);assert.equal(await page.locator('tbody tr').count(),4);
  assert.equal(await page.getByRole('columnheader',{name:'Estado',exact:true}).count(),0);
  assert.equal(await page.getByRole('columnheader',{name:'Comparativo',exact:true}).count(),0);
  assert.match(await page.locator('thead').innerText(),/Variación %/);
  assert.match(await page.locator('thead').innerText(),/Crecimiento \(COP\)/);
  const north=page.locator('tbody tr').filter({has:page.getByRole('rowheader',{name:'Punto Norte'})});
  assert.match(await north.locator('td').nth(6).innerText(),/100,00\s*%/);
  assert.match(await north.locator('td').nth(7).innerText(),/\+\s*\$\s*60/);
  assert.deepEqual(await page.locator('tbody tr').filter({has:page.getByRole('rowheader',{name:'Punto Norte'})}).locator('[data-ranking-tono]').evaluateAll(cells=>cells.map(c=>c.dataset.rankingTono)),['positive','positive']);
  assert.deepEqual(await page.locator('tbody tr').last().locator('[data-ranking-tono]').evaluateAll(cells=>cells.map(c=>c.dataset.rankingTono)),['neutral','neutral']);
  assert.deepEqual(await page.locator('tbody td:first-child').allTextContents(),['1','1','3','Sin posición']);
  assert.match(await page.locator('caption').innerText(),/Ventas · 2026-10 · COP/);
  await page.locator('[data-ranking-orden]').selectOption('crecimiento');assert.deepEqual(await page.locator('tbody th').allTextContents(),['Punto Norte','Punto Centro','Punto Sur','Punto sin meta']);assert.deepEqual(await page.locator('tbody td:first-child').allTextContents(),['1','2','3','Sin posición']);assert.match(await page.locator('thead').innerText(),/Venta\s+2025/);assert.equal(await page.evaluate(()=>window.__fixture.calls),1);await page.locator('[data-ranking-orden]').selectOption('cumplimiento');
  await page.getByRole('tab',{name:'Créditos',exact:true}).click();assert.match(await page.locator('caption').innerText(),/Créditos/);assert.match(await page.locator('thead').innerText(),/Crecimiento \(unidades\)/);assert.doesNotMatch(await north.locator('td').nth(7).innerText(),/\$/);assert.equal(await page.evaluate(()=>window.__fixture.calls),1);
  await page.getByRole('tab',{name:'Créditos',exact:true}).press('End');assert.equal(await page.getByRole('tab',{name:'Accesorios',exact:true}).getAttribute('aria-selected'),'true');
  await page.locator('[data-ranking-mes]').fill('2026-09');await page.locator('[data-ranking-mes]').dispatchEvent('change');assert.equal(await page.locator('tbody').count(),0);
  await page.evaluate(()=>window.__fixture.defer=true);await page.getByRole('button',{name:'Ver ranking',exact:true}).click();
  await page.locator('[data-ranking-mes]').fill('2026-08');await page.locator('[data-ranking-mes]').dispatchEvent('change');await page.evaluate(()=>window.__resolve());
  await page.waitForFunction(()=>!document.querySelector('[data-ranking-consultar]').disabled);assert.equal(await page.locator('tbody').count(),0);
  await page.evaluate(()=>{window.__fixture.defer=false;window.__fixture.fail=true;});await page.getByRole('button',{name:'Ver ranking',exact:true}).click();await page.getByText(/No se pudo preparar el ranking/).waitFor();assert.equal(await page.locator('tbody').count(),0);
  await page.evaluate(()=>{window.__fixture.fail=false;window.__fixture.stores=[{codigo:'CK-A'},{codigo:'CK-B'},{codigo:'CK-C'}];});await page.locator('[data-ranking-mes]').fill('2026-10');await page.getByRole('button',{name:'Ver ranking',exact:true}).click();await page.locator('tbody').waitFor();
  assert.equal(await page.evaluate(()=>window.__fixture.lastStoreCount),3,'Cada consulta toma la lista vigente, incluso si fue reasignada.');
  for(const width of [390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.evaluate(()=>{for(const r of window.__fixture.data){r.periodo={mes:'2026-11',corte:'2026-11-03',cerrado:false};for(const m of r.categorias){m.valorAnterior=300;m.realizado=60;m.estadoCrecimiento='Sin comparativo al corte';}}});
  await page.getByRole('button',{name:'Ver ranking',exact:true}).click();await page.getByText(/base del año anterior al corte es estimada/i).waitFor();
  assert.match(await page.locator('thead').innerText(),/Accesorios\s+al corte\s+2025/);
  assert.match(await page.locator('tbody tr').first().locator('[data-ranking-tono]').last().getAttribute('title'),/Estimado · crecimiento/);
  await page.getByRole('tab',{name:'Ventas',exact:true}).click();assert.match(await page.locator('thead').innerText(),/Venta\s+al corte\s+2025/);
  if(process.env.KORA_CIERRE_QA_DIR&&name==='Chromium'){await mkdir(process.env.KORA_CIERRE_QA_DIR,{recursive:true});await page.screenshot({path:process.env.KORA_CIERRE_QA_DIR+'/ranking-ficticio.png',fullPage:true});}
  const denied=await page.evaluate(()=>{const p=document.createElement('section');p.hidden=true;KoraPresupuestoRanking.montar({panel:p,perfil:{activo:true,rol:'admin_tienda'}});return p.hidden&&p.innerHTML==='';});assert.equal(denied,true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
