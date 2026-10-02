import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';

// Incluye también el diseño compartido: su hover transparente causaba la regresión.
function localCSS(file) {
  return fs.readFileSync(file,'utf8').replace(/@import\s+url\(["']([^"']+)["']\);/g,
    (_,url)=>/^https?:/.test(url)?'':localCSS(path.resolve(path.dirname(file),url)));
}
const source=fs.readFileSync('creditek/erp/presupuestos.html','utf8');
const styles=source.match(/<style>([\s\S]*?)<\/style>/)[1]+'\n'+localCSS('design-system/components/kora-product.css');
const render=source.slice(source.indexOf('function renderTabla()'),source.indexOf('function abrirModalCelda('));

test('Presupuestos: Tienda y Total mes permanecen opacos al resaltar y desplazar; no cambian importes',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {for(const width of [1100,560,390]){
    const page=await browser.newPage({viewport:{width,height:850}});
    await page.route('**/*',route=>route.abort());
    await page.setContent(`<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style>
      <body class="kora-product-page"><main style="padding:16px"><section id="totalesMes" class="totales-mes" hidden><h2 id="totalesMesTitulo"></h2><div id="totalesMesValores" class="totales-mes-grid"></div></section><div class="tabla-wrap"><table id="tablaPresupuesto">
      <thead><tr id="theadFila"></tr></thead><tbody id="tbodyPresupuesto"></tbody><tfoot id="tfootPresupuesto"></tfoot></table>
      <div id="emptyPresupuesto"></div></div></main></body></html>`);
    await page.evaluate(()=>{
      window.tiendasCache=Array.from({length:20},(_,i)=>({codigo:'TEST-'+i,nombre:'Tienda '+(i+1)}));
      window.presupuestoCache=window.tiendasCache.flatMap(t=>Array.from({length:31},(_,i)=>({
        tienda_codigo:t.codigo,fecha:'2026-10-'+String(i+1).padStart(2,'0'),meta_venta_total:1000000+i,meta_creditos:2,meta_uds_cel:3,meta_uds_acc:4,meta_utilidad:12345, generado_desde:'manual'
      })));
      window.presupuestoCache.push({tienda_codigo:'AJENA',fecha:'2026-10-01',meta_venta_total:999999999});
      window.metricaActual='meta_venta_total';window.propuestaActual=null;window.diasDelMesSeleccionado=()=>({y:2026,m:10,dias:31});
      window.fmtCOP=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
      window.escapeHtml=String;window.ediciones=0;window.abrirModalCelda=()=>{window.ediciones++;};
    });
    await page.addScriptTag({content:render+'\nrenderTabla();'});
    const table=page.locator('#tablaPresupuesto'),row=page.locator('tbody tr').first();
    const original=await table.innerText();
    assert.match(await row.locator('.total-mes').innerText(),/31\.000\.465/);
    assert.match(await page.locator('[data-total-metrica="meta_venta_total"]').innerText(),/620\.009\.300/);
    assert.match(await page.locator('#tfootPresupuesto .total-mes').innerText(),/620\.009\.300/);
    assert.equal(await page.locator('[data-total-metrica="meta_uds_cel"]').innerText(),'1.860');
    assert.equal(await page.locator('[data-total-metrica="meta_uds_acc"]').innerText(),'2.480');
    assert.equal(await page.locator('[data-total-metrica="meta_creditos"]').innerText(),'1.240');
    assert.equal(await page.locator('[data-total-metrica="meta_utilidad"]').count(),0);
    assert.ok(await page.locator('#totalesMes').isVisible());
    for(const fraction of [0,0.45,1]){
      await page.locator('.tabla-wrap').evaluate((el,f)=>{el.scrollLeft=(el.scrollWidth-el.clientWidth)*f;},fraction);
      await row.locator('.total-mes').hover();
      for(const delay of [0,60,180]){
        if(delay)await page.waitForTimeout(delay);
        const cells=await row.locator('.tienda-nombre,.total-mes').evaluateAll(nodes=>nodes.map(el=>{
          const style=getComputedStyle(el),canvas=document.createElement('canvas');canvas.width=canvas.height=1;
          const ctx=canvas.getContext('2d');ctx.fillStyle=style.backgroundColor;ctx.fillRect(0,0,1,1);
          return {alpha:ctx.getImageData(0,0,1,1).data[3],position:style.position};
        }));
        for(const c of cells){assert.equal(c.alpha,255,`fondo sólido: ancho ${width}, scroll ${fraction}, demora ${delay}`);assert.equal(c.position,'sticky');}
      }
      assert.equal(await table.innerText(),original,'hover y scroll no cambian valores ni suma');
      await row.locator('.total-mes').click();assert.equal(await page.evaluate(()=>window.ediciones),0);
    }
    await page.locator('.tabla-wrap').evaluate(el=>{el.scrollLeft=0;});
    if(width===1100){
      await row.locator('.dia-celda').first().click();assert.equal(await page.evaluate(()=>window.ediciones),1,'los días siguen editables');
      await row.locator('.total-mes').hover();
      await page.screenshot({path:'/tmp/kora-presupuesto-columnas-fijas.png'});
    }
    for(const metrica of ['meta_creditos','meta_uds_cel','meta_uds_acc']){
      await page.evaluate(m=>{window.metricaActual=m;renderTabla();},metrica);
      assert.equal(await page.locator('#tfootPresupuesto .total-mes').innerText(),await page.locator(`[data-total-metrica="${metrica}"]`).innerText());
    }
    await page.evaluate(()=>{window.propuestaActual={};renderTabla();});
    assert.match(await page.locator('#totalesMesTitulo').innerText(),/Propuesta sin aprobar/);
    await page.evaluate(()=>{window.presupuestoCache=[];renderTabla();});
    assert.ok(await page.locator('#totalesMes').isHidden());
    assert.equal(await page.locator('#tfootPresupuesto').innerText(),'');
    assert.equal(await page.locator('#tbodyPresupuesto').innerText(),'');
    await page.close();
  }} finally {await browser.close();}
});
