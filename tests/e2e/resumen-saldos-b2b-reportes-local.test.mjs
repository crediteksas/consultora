import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
import XLSX from 'xlsx';

test('informes de saldos B2B: resumen, detalle y totales exactos sin cruzar créditos',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|supabase-js|kora-environment|kora-product\.js/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const f=resolve(process.cwd(),'.'+u.pathname);if(!f.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   window.__KORA_ENV__={};
   const sources={
    origenes:[{codigo:'T',nombre:'Móvil Shopping',tipo:'propia',activo:true},{codigo:'Z',nombre:'Tienda sin movimientos',tipo:'propia',activo:true}],
    v_cartera_clientes_b2b:[{cliente_codigo:'C',cliente:'Cliente externo',saldo:500000},{cliente_codigo:'A',cliente:'Cliente con crédito',saldo:-100000}],
    cuenta_corriente:[{id:1,tienda_codigo:'T',tipo:'cargo',monto:1000000.6},{id:2,tienda_codigo:'T',tipo:'abono',monto:200000}],
    proveedores:[{id:'p',nombre:'Proveedor prueba',activo:true},{id:'q',nombre:'Proveedor con crédito',activo:true}],
    facturas_proveedor:[{id:'f',proveedor_id:'p',saldo:800000.25,fecha_vencimiento:'2026-09-10'},{id:'g',proveedor_id:'p',saldo:-100000},{id:'h',proveedor_id:'q',saldo:-200000.5}]
   };
   const sb={auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},from(table){return {
    select(){return this},eq(){return this},in(){return this},order(){return this},
    single:async()=>({data:{rol:'gerencia',activo:true}}),
    range:async(a,b)=>window.failTable===table?{error:{message:'Fallo de prueba'}}:{data:sources[table].slice(a,b+1)},
    then(ok,fail){return Promise.resolve({data:sources[table]}).then(ok,fail)}
   };},async rpc(name,params){window.lastReportAudit={name,params};return {data:null};}};
   window.supabase={createClient:()=>sb};window.reportSb=sb;
  });
  await page.goto('https://kora.test/creditek/erp/resumen-saldos-b2b.html');
  await page.locator('#tiendasRows').getByText('Móvil Shopping').waitFor();
  await page.evaluate(()=>document.body.insertAdjacentHTML('afterbegin','<div class="kora-topbar__actions"></div>'));
  await page.addScriptTag({url:'https://kora.test/creditek/erp/kora-report-export.js'});
  await page.evaluate(()=>window.KoraReportExport.mount({profile:{rol:'gerencia',nombre:'Óscar'},sb:window.reportSb}));
  const snapshot=mode=>page.evaluate(mode=>window.KoraReportExport.snapshot({rol:'gerencia',nombre:'Óscar'},{mode}),mode);
  const summary=await snapshot('summary'),detailed=await snapshot('detailed');
  assert.deepEqual(summary.metrics,[['Saldo neto de tiendas y clientes','$ 1.200.000,60'],['Por pagar a proveedores','$ 700.000,25'],['Capital de trabajo B2B','$ 500.000,35']]);
  assert.deepEqual(summary.metrics,detailed.metrics);
  assert.equal(summary.tables.length,2);assert.equal(detailed.tables.length,2);
  assert.doesNotMatch(JSON.stringify(summary.tables),/Móvil Shopping|Cliente externo|Proveedor prueba|Proveedor con crédito/);
  assert.deepEqual(summary.tables[0].rows,detailed.tables[0].totalRows);
  assert.deepEqual(summary.tables[1].rows,detailed.tables[1].totalRows);
  assert.deepEqual(detailed.tables[1].totalRows,[['Total por pagar mostrado','','','$ 700.000,25'],['Saldo a favor de Creditek mostrado','','','$ 200.000,50'],['Total facturas pendientes','1','','']]);
  assert.equal(detailed.tables[1].rows.find(row=>row[0]==='Proveedor prueba')[3],'$ 700.000,25');
  assert.equal(detailed.tables[1].rows.find(row=>row[0]==='Proveedor con crédito')[3],'-$ 200.000,50');
  assert.equal(detailed.tables[0].totalRows.find(row=>row[0]==='Subtotal neto Tienda Retail')[2],'$ 800.000,60');
  assert.equal(detailed.tables[0].totalRows.find(row=>row[0]==='Subtotal neto Cliente B2B')[2],'$ 400.000,00');
  assert.equal(detailed.tables[0].totalRows.find(row=>row[0]==='Total por cobrar mostrado (sin compensar clientes)')[2],'$ 1.300.000,60');
  assert.ok(detailed.tables.every(t=>t.explicitTotals));
  for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   for(const table of await page.locator('.saldos-table').all())assert.ok(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   assert.equal(await page.locator('#proveedoresTotales').getByText('Total por pagar mostrado',{exact:true}).isVisible(),true);
  }
  for(const mode of ['detailed','summary']){
   await page.getByRole('button',{name:'Generar informe',exact:true}).click();
   await page.getByRole('checkbox',{name:'Resumido',exact:true}).setChecked(mode==='summary');
   const [popup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:'Generar PDF',exact:true}).click()]);
   await popup.getByRole('heading',{name:'Resumen de saldos B2B',exact:true}).waitFor();
   const text=await popup.locator('body').textContent();
   assert.match(text,/Total por pagar mostrado/);assert.match(text,/700\.000,25/);assert.match(text,/200\.000,50/);assert.match(text,/1\.200\.000,60/);
   assert.match(text,/Capital de trabajo B2B/);
   if(mode==='summary')assert.doesNotMatch(text,/Proveedor prueba|Móvil Shopping/);
   else {assert.match(text,/Proveedor prueba/);assert.match(text,/Móvil Shopping/);assert.match(text,/Documentos vencidos antes de cruzar créditos/);assert.equal(await popup.locator('tfoot').count(),2);}
   assert.equal(await page.evaluate(()=>window.lastReportAudit.params.p_formato),'pdf');
   if(process.env.KORA_REPORT_SCREENSHOT_DIR)await popup.screenshot({path:`${process.env.KORA_REPORT_SCREENSHOT_DIR}/b2b-${mode}.png`,fullPage:true});
   await popup.close();
  }
  if(process.env.KORA_REPORT_EXCELJS_PATH){
   await page.addScriptTag({path:process.env.KORA_REPORT_EXCELJS_PATH});
   for(const mode of ['detailed','summary']){
   await page.getByRole('button',{name:'Generar informe',exact:true}).click();
   await page.getByRole('checkbox',{name:'Resumido',exact:true}).setChecked(mode==='summary');
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar Excel',exact:true}).click()]);
   const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
   const workbook=XLSX.read(Buffer.concat(chunks),{type:'buffer',cellFormula:true});
   assert.equal(workbook.SheetNames.length,3);
   const stores=workbook.Sheets[workbook.SheetNames[1]],providers=workbook.Sheets[workbook.SheetNames[2]];
   const rows=XLSX.utils.sheet_to_json(providers,{header:1}),storeRows=XLSX.utils.sheet_to_json(stores,{header:1});
   assert.equal(rows.find(row=>row[0]==='Total por pagar mostrado')[3],700000.25);
   assert.equal(rows.find(row=>row[0]==='Saldo a favor de Creditek mostrado')[3],200000.5);
   assert.equal(rows.find(row=>row[0]==='Total facturas pendientes')[1],1);
   assert.equal(storeRows.find(row=>row[0]==='Total saldo neto mostrado')[2],1200000.6);
   assert.equal(storeRows.find(row=>row[0]==='Total por cobrar mostrado (sin compensar clientes)')[2],1300000.6);
   assert.doesNotMatch(JSON.stringify(providers),/SUBTOTAL\(109/,'no inventar un neto que compense proveedores distintos');
   if(mode==='summary')assert.doesNotMatch(JSON.stringify(workbook),/Proveedor prueba|Móvil Shopping/);
   else assert.equal(rows.find(row=>row[0]==='Proveedor con crédito')[3],-200000.5);
   assert.equal(await page.evaluate(()=>window.lastReportAudit.params.p_formato),'xlsx');
   }
  }
  await page.locator('#buscarTiendas').fill('movil');await page.locator('#buscarProveedores').fill('prueba');
  const filtered=await snapshot('summary');
  assert.deepEqual(filtered.filters.filter(([label])=>label.startsWith('Buscar')),[['Buscar tienda o cliente','movil'],['Buscar proveedor','prueba']]);
  assert.equal(filtered.tables[0].rows[0][2],'$ 800.000,60');assert.equal(filtered.tables[1].rows[1][3],'$ 0,00');
  assert.deepEqual(filtered.metrics,summary.metrics,'los indicadores conservan el alcance general de la pantalla');
  await page.locator('#buscarTiendas').fill('No existe');await page.locator('#buscarProveedores').fill('No existe');
  const empty=await snapshot('detailed');
  assert.ok(empty.tables.every(t=>t.rows.length===0));assert.equal(empty.tables[0].totalRows[0][2],'$ 0,00');assert.equal(empty.tables[1].totalRows[0][3],'$ 0,00');
  await page.evaluate(()=>window.failTable='facturas_proveedor');await page.locator('#actualizar').click();await page.locator('#error').waitFor();
  const failed=await snapshot('summary');
  assert.ok(failed.metrics.every(([,value])=>value==='—'));assert.ok(failed.tables.length===0);assert.match(failed.notes.join(' '),/No fue posible consultar/);
  await assert.rejects(()=>page.evaluate(()=>window.KoraReportExport.prepareReport({rol:'gerencia',nombre:'Prueba'},{mode:'summary'})),/No hay datos consultados/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
