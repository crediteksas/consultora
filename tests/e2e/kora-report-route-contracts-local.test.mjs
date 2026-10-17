import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

test('cierres del exportador funcionan con el HTML real en rutas limpias y .html',async()=>{
 const cases=[['ventas','tbodyVentas'],['caja','tbodyConsolidado'],['caja','tbodyMovimientosCaja'],['proveedores','tbody-detalle-lineas'],['proveedores','tbody-detalle-pagos'],['proveedores','tbody-facturas'],['conciliacion','tbodyCruzados'],['conciliacion','tbodySinCruce'],['cartera-b2b','dRows'],['kardex','tbodyKardex'],['inventario','tbodyAccesorios'],['inventario','tbodyCelulares'],['tablero','tbodyEjecutivos'],['remisiones','tbodyRemisiones'],['gastos','tbodyGastos'],['reportes','tbody-ventas'],['traslados','tbodyTraslados'],['cierre-periodo','tbodyBloques']];
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const exporter=await readFile('creditek/erp/kora-report-export.js','utf8');
 try{
  const context=await browser.newContext();
  await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<main><h1>Auditoría de contrato</h1></main>'}));
  const page=await context.newPage();
  for(const [name,id] of cases){
   const source=await readFile(`creditek/erp/${name}.html`,'utf8');
   let previous;
   for(const suffix of ['', '.html']){
    await page.goto(`https://kora.test/creditek/erp/${name}${suffix}`);
    await page.evaluate(({source,id})=>{
     // Parse literal modal table markup without executing application scripts.
     const markup=[...source.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)].map(m=>m[0]).find(s=>s.includes('id="'+id+'"'));
     const doc=new DOMParser().parseFromString(markup||source,'text/html'),original=doc.getElementById(id);
     if(!original)throw Error('Falta tabla '+id);
     const table=original.closest('table').cloneNode(true);table.removeAttribute('hidden');table.querySelectorAll('tfoot').forEach(n=>n.remove());
     const headers=[...table.querySelectorAll('thead th')].map(n=>n.textContent.trim()),body=table.querySelector('tbody');body.replaceChildren();
     for(const value of ['100,10','200,20']){
      const row=document.createElement('tr');
      headers.forEach((header,column)=>{const cell=document.createElement('td');cell.textContent=column===0?'Registro de prueba':/acciones?|acción/i.test(header)?'Ver':value;row.append(cell);});body.append(row);
     }
     document.querySelector('main').append(table);
    },{source,id});
    await page.addScriptTag({content:exporter});
    const reports=await page.evaluate(()=>({full:window.KoraReportExport.snapshot({rol:'gerencia'}),summary:window.KoraReportExport.snapshot({rol:'gerencia'},{mode:'summary'})}));
    const table=reports.full.tables[0];assert.ok(table.totalRows?.length,`${name}/${id}: cierre`);
    assert.ok(table.totalRows.some(row=>row.some(value=>/300,30|300,3/.test(value))),`${name}/${id}: no basta contar filas`);
    assert.doesNotMatch(JSON.stringify(reports.summary.tables),/Registro de prueba/,`${name}/${id}: resumen sin movimientos`);
    assert.deepEqual(reports.full.tables[0].totalRows,previous||reports.full.tables[0].totalRows,`${name}/${id}: misma ruta`);
    previous=reports.full.tables[0].totalRows;
    const pdf=await page.evaluate(r=>window.KoraReportExport.pdfDocument(r),reports.full);assert.match(pdf,/<tfoot>/);
   }
  }
  await context.close();
 }finally{await browser.close();}
});

test('notas no se concatenan ni desaparecen de las celdas exactas',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<main><h1>Notas</h1><table><thead><tr><th>Proveedor</th><th>Saldo</th></tr></thead><tbody><tr><td>Proveedor<small>Inactivo</small></td><td data-kora-report-value="$ 100,25"><b>$ 100</b><small>Incluye crédito sin aplicar</small></td></tr></tbody><tfoot><tr><td>Total</td><td>$ 100,25</td></tr></tfoot></table></main>'}));
  await page.goto('https://kora.test/notas');await page.addScriptTag({content:await readFile('creditek/erp/kora-report-export.js','utf8')});
  const r=await page.evaluate(()=>window.KoraReportExport.snapshot({rol:'gerencia'}));
  assert.equal(r.tables[0].rows[0][0],'Proveedor · Inactivo');assert.equal(r.tables[0].rows[0][1],'$ 100,25');assert.match(r.tables[0].notes.join(' '),/Incluye crédito sin aplicar/);
 }finally{await browser.close();}
});
