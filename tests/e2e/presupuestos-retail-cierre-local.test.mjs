import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from '@playwright/test';
import XLSX from 'xlsx';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{unzipSync}=require('../../creditek/erp/vendor/fflate-0.8.3.js');
const qa=process.env.KORA_CIERRE_QA_DIR,excelPath=process.env.KORA_REPORT_EXCELJS_PATH;
async function setup(browser,role='gerencia'){
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.href.includes('exceljs@4.4.0'))return excelPath?route.fulfill({contentType:'text/javascript',body:await readFile(excelPath)}):route.abort();
  if(u.hostname!=='cierre-kora.test')return route.abort();
  if(/sidebar\.js|kora-access-control\.js|kora-environment|supabase-js/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
  const file=resolve(process.cwd(),'.'+u.pathname);
  if(!file.startsWith(process.cwd()+'/'))return route.abort();
  try{return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.addInitScript(({role})=>{
  const stores=[{codigo:'CK-01',nombre:'Punto Norte',tipo:'propia',activo:true},{codigo:'CK-02',nombre:'Punto Sur',tipo:'propia',activo:true}];
  const saved=stores.flatMap(t=>Array.from({length:31},(_,i)=>({id:t.codigo+i,tienda_codigo:t.codigo,fecha:'2026-10-'+String(i+1).padStart(2,'0'),meta_venta_total:'1000.25',meta_creditos:1,meta_uds_cel:2,meta_uds_acc:3})));
  const sales=[{id:'sale1',fecha:'2026-10-05',tienda_codigo:'CK-01',tipo:'contado',total:'1200.75',anulada:false},{id:'sale2',fecha:'2026-10-06',tienda_codigo:'CK-02',tipo:'contado',total:'8888.25',anulada:false}];
  const data={origenes:stores,presupuestos:saved,ventas:sales,venta_items_lectura:[{id:'item1',venta_id:'sale1',producto_id:'phone',cantidad:1},{id:'item2',venta_id:'sale1',producto_id:'case',cantidad:3},{id:'item3',venta_id:'sale2',producto_id:'phone',cantidad:9}],productos:[{id:'phone',tipo:'serializado'},{id:'case',tipo:'cantidad'}],liquidation_operations:[{id:'credit1',plataforma:'payjoy',external_id:'credit1',operation_at:'2026-10-08T15:00:00Z',origen_codigo:'CK-01',tipo_establecimiento:'propia',reconocida:true,utilidad_creditek:0}],aliados_reversiones:[],historico_mensual:[{id:'h1',tienda_codigo:'CK-01',anio:2025,mes:10,venta_total:960.60,cred_uds:2,cel_uds:1,acc_uds:2,cel_venta:100,acc_venta:50},{id:'h2',tienda_codigo:'CK-02',anio:2025,mes:10,venta_total:4444,cred_uds:1,cel_uds:3,acc_uds:0,cel_venta:200,acc_venta:30}]};
  window.__fixture={data,failTable:null,calls:[],writes:[]};
  window.__KORA_ENV__={KORA_ERP_SUPABASE_URL:'https://fixture.invalid',KORA_ERP_SUPABASE_ANON_KEY:'synthetic-not-a-key'};
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'fixture-user'}}}})},from(table){
   const predicates=[];let key='id',start=0,end=Infinity;
   const result=()=>table===window.__fixture.failTable?{error:{message:'Fallo ficticio de la fuente'},data:null}:{data:(data[table]||[]).filter(r=>predicates.every(p=>p(r))).sort((a,b)=>String(a[key]).localeCompare(String(b[key]))).slice(start,end+1),error:null};
   const q={select(columns){window.__fixture.calls.push({table,columns});return this;},eq(c,v){predicates.push(r=>r[c]===v);return this;},gte(c,v){predicates.push(r=>r[c]>=v);return this;},lt(c,v){predicates.push(r=>r[c]<v);return this;},in(c,v){predicates.push(r=>v.includes(r[c]));return this;},order(k){key=k;return this;},range(a,b){start=a;end=b;return this;},maybeSingle:async()=>({data:{id:'fixture-user',nombre:'Revisor de prueba',rol:role,activo:true},error:null}),then(ok,no){return Promise.resolve(result()).then(ok,no);}};return q;
  },async rpc(name,params){if(name!=='kora_registrar_exportacion')throw Error('No se permite escritura operativa en el ensayo.');window.__fixture.writes.push({name,params});return window.__fixture.auditError?{data:null,error:{message:'Fallo ficticio de trazabilidad'}}:{data:null,error:null};}})};
 },{role});
 await page.goto('https://cierre-kora.test/creditek/erp/presupuestos.html');
 return {page,errors};
}
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]])test('Cierre Retail: PDF/Excel individual, cuatro categorías y sin operaciones reales · '+name,async()=>{
 const browser=await engine.launch(name==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const {page,errors}=await setup(browser);
  await page.getByRole('heading',{name:'Presupuesto de Retail',exact:true}).waitFor();
  await page.locator('#verMes').fill('2026-10');await page.locator('#verMes').dispatchEvent('change');
  await page.getByRole('button',{name:'Entrega de informe a puntos de venta',exact:true}).click();
  await page.getByRole('button',{name:'Preparar informes',exact:true}).click();
  const first=page.locator('[data-cierre-tienda="CK-01"]');await first.getByRole('heading',{name:'Punto Norte',exact:true}).waitFor();
  assert.equal(await page.locator('[data-cierre-tienda]').count(),2);
  assert.equal(await first.locator('table').count(),1);assert.equal(await first.locator('tbody tr').count(),4);assert.equal(await first.locator('thead th').count(),8);assert.match(await first.innerText(),/961/);assert.match(await first.innerText(),/25,00/);assert.match(await first.innerText(),/31\.008/);assert.match(await first.innerText(),/1\.201/);
  assert.equal((await first.innerText()).match(/1\.201/g).length,1,'El realizado aparece una sola vez en el cuadro');
  assert.doesNotMatch(await first.innerText(),/Punto Sur|8\.888/);
  const [popup]=await Promise.all([page.waitForEvent('popup'),first.getByRole('button',{name:'PDF · Punto Norte',exact:true}).click()]);
  await popup.getByRole('heading',{name:'Cierre mensual de presupuesto · Punto Norte',exact:true}).waitFor();
  await popup.waitForFunction(()=>document.querySelector('.brand img')?.naturalWidth>0);
  assert.match(await popup.locator('body').innerText(),/KORA-REP-|Trazabilidad KORA/);assert.match(await popup.locator('body').innerText(),/901.259.859-0/);
  assert.match(await popup.locator('body').innerText(),/31\.008/);assert.match(await popup.locator('body').innerText(),/1\.201/);
  assert.equal(await popup.locator('table').count(),2);assert.equal(await popup.locator('table thead th').count(),9);assert.equal(await popup.locator('tbody tr').count(),8);assert.equal((await popup.locator('tbody').allInnerTexts()).join(' ').match(/1\.201/g).length,1);
  assert.match(await popup.locator('style').innerText(),/@page\{size:A4 portrait/);
  assert.doesNotMatch(await popup.locator('body').innerText(),/Punto Sur|8\.888/);assert.equal(await popup.evaluate(()=>window.opener),null);
  if(qa&&name==='chromium'){
   await mkdir(qa,{recursive:true});await popup.pdf({path:resolve(qa,'cierre-punto-norte-octubre-ficticio.pdf'),preferCSSPageSize:true,printBackground:true});
   await popup.screenshot({path:resolve(qa,'pdf-preview.png'),fullPage:true});
  }
  assert.equal(await popup.locator('tbody tr').first().locator('td').nth(3).evaluate(c=>getComputedStyle(c).fontSize),'14px');
  assert.equal(await popup.locator('tbody tr').first().locator('td').nth(3).evaluate(c=>getComputedStyle(c).textAlign),'center');
  const pdfColors=await popup.locator('.report-matrix tbody tr:first-child td[data-report-tone]').evaluateAll(cells=>cells.map(c=>getComputedStyle(c).backgroundColor));
  assert.deepEqual(pdfColors,['rgb(254, 226, 226)','rgb(220, 252, 231)']);
  await popup.close();
  assert.ok(excelPath,'La prueba requiere ExcelJS local para verificar el archivo real.');
  const [download]=await Promise.all([page.waitForEvent('download'),first.getByRole('button',{name:'Excel · Punto Norte',exact:true}).click()]);
  const file=await download.path();const buffer=await readFile(file),book=XLSX.read(buffer,{type:'buffer',cellNF:true,cellStyles:true});
  assert.deepEqual(book.SheetNames,['Informe','01 Presupuesto y crecimiento']);
  const sheet=book.Sheets[book.SheetNames[1]];assert.equal(sheet.A9.v,'Ventas (COP)');assert.equal(sheet.B9.v,960.60);assert.equal(sheet.C9.v,31007.75);assert.equal(sheet.D9.v,1200.75);assert.equal(sheet.E9.v,-29807);assert.equal(sheet.F9.v,1200.75/31007.75);assert.equal(sheet.G9.v,240.15);assert.equal(sheet.H9.v,.25);assert.match(sheet.F9.z,/0\.00%/);assert.equal(sheet.F9.t,'n');assert.doesNotMatch(sheet.B9.z,/0\.00/);assert.doesNotMatch(sheet.D9.z,/0\.00/);assert.match(sheet.B9.z,/\$/);assert.equal(sheet.B10.z,'#,##0');
  assert.equal(sheet.A10.v,'Créditos (unidades)');assert.equal(sheet.D10.v,1);assert.equal(sheet.D11.v,1);assert.equal(sheet.D12.v,3);assert.ok(sheet.F9.c?.some(c=>/meta/.test(c.t)),'Los estados se conservan como notas de celda');
  assert.match(await first.innerText(),/Año anterior/i);
  assert.equal(await first.locator('tbody tr').first().locator('td').nth(2).evaluate(c=>getComputedStyle(c).fontSize),'14px');
  assert.equal(await first.locator('tbody tr').first().locator('td').nth(2).evaluate(c=>getComputedStyle(c).textAlign),'center');
  const salesRow=first.locator('[data-cierre-categoria="ventas"]');
  assert.equal(await salesRow.locator('td').nth(4).getAttribute('data-cierre-tono'),'negative');
  assert.equal(await salesRow.locator('td').nth(6).getAttribute('data-cierre-tono'),'positive');
  const colors=await salesRow.locator('td[data-cierre-tono]').evaluateAll(cells=>cells.map(c=>({bg:getComputedStyle(c).backgroundColor,fg:getComputedStyle(c).color})));
  assert.deepEqual(colors,[{bg:'rgb(254, 226, 226)',fg:'rgb(153, 27, 27)'},{bg:'rgb(220, 252, 231)',fg:'rgb(22, 101, 52)'}]);
  assert.match(await first.innerText(),/amarillo desde 90% y hasta menos de 100%/);
  const styleEntries=unzipSync(new Uint8Array(buffer));
  const numericStyle=await page.evaluate(({sheetXml,stylesXml})=>{const parser=new DOMParser(),sheet=parser.parseFromString(sheetXml,'application/xml'),styles=parser.parseFromString(stylesXml,'application/xml'),cell=[...sheet.getElementsByTagName('c')].find(c=>c.getAttribute('r')==='D9'),xf=styles.getElementsByTagName('cellXfs')[0].children[Number(cell.getAttribute('s'))],font=styles.getElementsByTagName('fonts')[0].children[Number(xf.getAttribute('fontId'))];return {align:xf.getElementsByTagName('alignment')[0]?.getAttribute('horizontal'),size:Number(font.getElementsByTagName('sz')[0].getAttribute('val'))};},{sheetXml:new TextDecoder().decode(styleEntries['xl/worksheets/sheet2.xml']),stylesXml:new TextDecoder().decode(styleEntries['xl/styles.xml'])});
  assert.deepEqual(numericStyle,{align:'center',size:12});
  assert.equal(sheet.F9.s.fgColor.rgb,'FEE2E2');assert.equal(sheet.H9.s.fgColor.rgb,'DCFCE7');
  assert.equal(sheet.F9.v,1200.75/31007.75);assert.equal(sheet.H9.v,.25);
  assert.ok(Object.keys(unzipSync(new Uint8Array(buffer))).some(k=>k.startsWith('xl/media/')),'El Excel lleva el logo incorporado.');
  assert.doesNotMatch(JSON.stringify(book.Sheets),/Punto Sur|8888\.25/);
  if(qa&&name==='chromium'){await download.saveAs(resolve(qa,'cierre-punto-norte-octubre-ficticio.xlsx'));await page.screenshot({path:resolve(qa,'pantalla-cierres.png'),fullPage:true});await first.screenshot({path:resolve(qa,'cuadro-unico-preview.png')});}
  const writes=await page.evaluate(()=>window.__fixture.writes);assert.equal(writes.length,2);assert.ok(writes.every(w=>w.name==='kora_registrar_exportacion'&&w.params.p_filtros.Mes==='2026-10'&&w.params.p_filtros['Punto de venta'].includes('Punto Norte')));
  await page.evaluate(()=>{const h=window.__fixture.data.historico_mensual.find(r=>r.tienda_codigo==='CK-01');h.venta_total=1200.75;h.acc_uds=0;h.acc_venta=30;window.__fixture.data.presupuestos.filter(r=>r.tienda_codigo==='CK-01').forEach(r=>r.meta_venta_total=20);});
  await page.getByRole('button',{name:'Preparar informes',exact:true}).click();await first.waitFor();
  assert.equal(await first.locator('[data-cierre-categoria="ventas"] td').nth(4).getAttribute('data-cierre-tono'),'positive');
  assert.equal(await first.locator('[data-cierre-categoria="ventas"] td').nth(6).getAttribute('data-cierre-tono'),'steady');
  assert.equal(await first.locator('[data-cierre-categoria="accesorios"] td').nth(6).getAttribute('data-cierre-tono'),'neutral');
  const [colorsPdf]=await Promise.all([page.waitForEvent('popup'),first.getByRole('button',{name:'PDF · Punto Norte',exact:true}).click()]);
  await colorsPdf.getByRole('heading',{name:'Cierre mensual de presupuesto · Punto Norte',exact:true}).waitFor();
  const tonesPdf=await colorsPdf.locator('.report-matrix tbody tr:first-child td[data-report-tone]').evaluateAll(cells=>cells.map(c=>({tone:c.getAttribute('data-report-tone'),background:getComputedStyle(c).backgroundColor})));
  assert.deepEqual(tonesPdf,[{tone:'positive',background:'rgb(220, 252, 231)'},{tone:'steady',background:'rgb(254, 243, 199)'}]);
  assert.equal(await colorsPdf.locator('.report-matrix').nth(1).locator('tbody tr').nth(3).locator('td[data-report-tone="neutral"]').count(),1);
  if(qa&&name==='chromium'){await colorsPdf.pdf({path:resolve(qa,'colores-cuatro-tonos-ficticio.pdf'),preferCSSPageSize:true,printBackground:true});}
  await colorsPdf.close();
  const [colorsDownload]=await Promise.all([page.waitForEvent('download'),first.getByRole('button',{name:'Excel · Punto Norte',exact:true}).click()]);
  const colorsBook=XLSX.read(await readFile(await colorsDownload.path()),{type:'buffer',cellStyles:true,cellNF:true}),colorsSheet=colorsBook.Sheets[colorsBook.SheetNames[1]];
  assert.equal(colorsSheet.F9.s.fgColor.rgb,'DCFCE7');assert.equal(colorsSheet.H9.s.fgColor.rgb,'FEF3C7');assert.equal(colorsSheet.H12.s.fgColor.rgb,'F1F5F9');assert.equal(colorsSheet.F10.s.fgColor.rgb,'FEE2E2');assert.equal(colorsSheet.H9.v,0);assert.equal(colorsSheet.H12.v,undefined);assert.equal(colorsSheet.F9.v,1200.75/620);
  if(qa&&name==='chromium')await colorsDownload.saveAs(resolve(qa,'colores-cuatro-tonos-ficticio.xlsx'));
  if(qa&&name==='chromium')await first.screenshot({path:resolve(qa,'colores-cumplimiento-crecimiento-ficticio.png')});
  // Banda amarilla solicitada: ratio del servidor conservado en pantalla/PDF/Excel.
  await page.evaluate(()=>window.__fixture.data.presupuestos.filter(r=>r.tienda_codigo==='CK-01').forEach((r,i)=>{r.meta_venta_total=43;r.meta_uds_acc=i===0?3:0;}));
  await page.getByRole('button',{name:'Preparar informes',exact:true}).click();await first.waitFor();
  assert.equal(await first.locator('[data-cierre-categoria="ventas"] td').nth(4).getAttribute('data-cierre-tono'),'steady');
  assert.match(await first.locator('[data-cierre-categoria="ventas"]').innerText(),/Por debajo de la meta/);
  assert.equal(await first.locator('[data-cierre-categoria="accesorios"] td').nth(4).getAttribute('data-cierre-tono'),'positive');
  const [middlePdf]=await Promise.all([page.waitForEvent('popup'),first.getByRole('button',{name:'PDF · Punto Norte',exact:true}).click()]);
  await middlePdf.getByRole('heading',{name:'Cierre mensual de presupuesto · Punto Norte',exact:true}).waitFor();
  assert.equal(await middlePdf.locator('.report-matrix').nth(1).locator('tbody tr').first().locator('td').nth(1).getAttribute('data-report-tone'),'steady');
  assert.equal(await middlePdf.locator('.report-matrix').nth(1).locator('tbody tr').first().locator('td').nth(1).evaluate(c=>getComputedStyle(c).backgroundColor),'rgb(254, 243, 199)');
  if(qa&&name==='chromium')await middlePdf.pdf({path:resolve(qa,'cumplimiento-90-ficticio.pdf'),preferCSSPageSize:true,printBackground:true});await middlePdf.close();
  const [middleDownload]=await Promise.all([page.waitForEvent('download'),first.getByRole('button',{name:'Excel · Punto Norte',exact:true}).click()]);
  const middleBook=XLSX.read(await readFile(await middleDownload.path()),{type:'buffer',cellStyles:true,cellNF:true}),middleSheet=middleBook.Sheets[middleBook.SheetNames[1]];
  assert.equal(middleSheet.F9.s.fgColor.rgb,'FEF3C7');assert.equal(middleSheet.F9.v,1200.75/1333);assert.equal(middleSheet.F12.s.fgColor.rgb,'DCFCE7');assert.equal(middleSheet.F12.v,1);assert.match(middleSheet.F9.c[0].t,/Por debajo de la meta/);
  if(qa&&name==='chromium'){await middleDownload.saveAs(resolve(qa,'cumplimiento-90-ficticio.xlsx'));await first.screenshot({path:resolve(qa,'cumplimiento-90-ficticio.png')});}
  await page.locator('#cierreTienda').selectOption('CK-01');assert.equal(await page.locator('[data-cierre-tienda]').count(),0);
  await page.getByRole('button',{name:'Preparar informes',exact:true}).click();await first.waitFor();assert.equal(await page.locator('[data-cierre-tienda]').count(),1);
  await page.evaluate(()=>window.__fixture.failTable='historico_mensual');await page.getByRole('button',{name:'Preparar informes',exact:true}).click();await page.getByText(/1 informe\(s\) preparados/).waitFor();assert.match(await first.innerText(),/Histórico no disponible/);assert.match(await first.innerText(),/1\.201/);
  await page.evaluate(()=>window.__fixture.failTable='liquidation_operations');await page.getByRole('button',{name:'Preparar informes',exact:true}).click();
  await page.getByText(/No se pudo preparar el cierre:.*Fallo ficticio/).waitFor();assert.equal(await page.locator('[data-cierre-tienda]').count(),0);
  await page.evaluate(()=>window.__fixture.failTable=null);await page.locator('#verMes').fill('2026-11');await page.locator('#verMes').dispatchEvent('change');await page.getByRole('button',{name:'Preparar informes',exact:true}).click();await first.waitFor();assert.match(await first.innerText(),/Avance del mes · cifras parciales/);assert.match(await first.innerText(),/Presupuesto incompleto/);
  await page.setViewportSize({width:390,height:844});assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=392,'La pantalla móvil conserva el ancho y solo desplaza la tabla.');
  assert.deepEqual(errors,[]);
  const denied=await setup(browser,'admin_tienda');await denied.page.getByRole('heading',{name:'Solo gerencia o auditoría'}).waitFor();assert.equal(await denied.page.locator('#btnEntregaInforme').count(),0);await denied.page.close();
 }finally{await browser.close();}
});

for(const [name,engine]of [['chromium',chromium],['webkit',webkit]])test('ZIP PDF: todos los puntos aun con filtro individual, trazabilidad, fallos atómicos y mes cancelado · '+name,async()=>{
 const browser=await engine.launch(name==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const {page,errors}=await setup(browser);await page.getByRole('heading',{name:'Presupuesto de Retail',exact:true}).waitFor();
  await page.locator('#verMes').fill('2026-10');await page.locator('#verMes').dispatchEvent('change');await page.getByRole('button',{name:'Entrega de informe a puntos de venta',exact:true}).click();await page.locator('#cierreTienda').selectOption('CK-01');
  const zipButton=page.getByRole('button',{name:'Descargar todos los PDF (ZIP)',exact:true});let downloads=0;page.on('download',()=>downloads++);
  const [zipDownload]=await Promise.all([page.waitForEvent('download'),zipButton.click()]);await page.getByText('ZIP preparado con 2 PDF, uno por punto de venta de 2026-10. Revisa Descargas en tu navegador.',{exact:true}).waitFor();
  assert.equal(zipDownload.suggestedFilename(),'Cierres PPTO Tiendas 2026-10.zip');
  const zip=await readFile(await zipDownload.path()),entries=unzipSync(new Uint8Array(zip)),names=Object.keys(entries);assert.equal(names.length,2);assert.ok(names.every(n=>n.endsWith('.pdf')&&!/[\\/]/.test(n)));assert.ok(names.some(n=>n.includes('Punto Norte'))&&names.some(n=>n.includes('Punto Sur')));
  for(const bytes of Object.values(entries)){
   assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');assert.ok(bytes.length>3000);assert.doesNotMatch(new TextDecoder().decode(bytes.slice(0,100)),/<html/i);
   const mediaBox=new TextDecoder('latin1').decode(bytes).match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
   assert.ok(mediaBox,'El PDF declara el tamaño de página');assert.ok(Number(mediaBox[2])>Number(mediaBox[1]),'Cada PDF del ZIP usa hoja vertical');
  }
  const writes=await page.evaluate(()=>window.__fixture.writes);assert.equal(writes.length,2);assert.ok(writes.every(w=>w.name==='kora_registrar_exportacion'&&w.params.p_formato==='pdf'&&w.params.p_filtros.Entrega==='ZIP de PDF'&&w.params.p_filtros.Mes==='2026-10'&&w.params.p_registros===4));assert.equal(new Set(writes.map(w=>w.params.p_reporte_id)).size,2);assert.equal(await page.locator('#cierreTienda').inputValue(),'CK-01');
  if(qa&&name==='chromium'){await mkdir(qa,{recursive:true});await zipDownload.saveAs(resolve(qa,'informes-dos-tiendas-ficticios.zip'));for(let i=0;i<names.length;i++)await (await import('node:fs/promises')).writeFile(resolve(qa,'zip-informe-'+(i+1)+'.pdf'),entries[names[i]]);}
  // Un fallo en el segundo documento no descarga un ZIP parcial ni registra el primero.
  await page.evaluate(()=>{window.__fixture.writes=[];window.__fixture.originalPdf=window.KoraCierrePdfZip;window.KoraCierrePdfZip={...window.KoraCierrePdfZip,pdf(report,...args){if(report.pdfBatch.tiendaCodigo==='CK-02')throw Error('Fallo PDF ficticio');return window.__fixture.originalPdf.pdf(report,...args);}};});
  await zipButton.click();await page.getByText(/No se pudo descargar el ZIP:.*Fallo PDF ficticio/).waitFor();assert.equal(downloads,1);assert.deepEqual(await page.evaluate(()=>window.__fixture.writes),[]);assert.equal(await zipButton.isEnabled(),true);
  await page.evaluate(()=>{window.KoraCierrePdfZip=window.__fixture.originalPdf;window.__fixture.auditError=true;});await zipButton.click();await page.getByText(/No se pudo descargar el ZIP:.*trazabilidad/).waitFor();assert.equal(downloads,1);assert.equal(await zipButton.isEnabled(),true);
  await page.evaluate(()=>{window.__fixture.auditError=false;window.__fixture.writes=[];});
  let releaseLogo,logoReached;const atLogo=new Promise(resolve=>logoReached=resolve);
  await page.route('**/creditek/shared/branding/creditek-logo.png',async route=>{logoReached();await new Promise(resolve=>releaseLogo=resolve);await route.fulfill({contentType:'image/png',body:await readFile(resolve(process.cwd(),'creditek/shared/branding/creditek-logo.png'))});});
  await zipButton.click();await atLogo;await page.locator('#verMes').fill('2026-11');await page.locator('#verMes').dispatchEvent('change');releaseLogo();await page.waitForFunction(()=>!document.querySelector('[data-cierre-zip]').disabled);
  assert.equal(downloads,1);assert.deepEqual(await page.evaluate(()=>window.__fixture.writes),[]);assert.doesNotMatch(await page.locator('[data-cierre-status]').innerText(),/ZIP preparado/);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

for(const [name,engine]of [['chromium',chromium],['webkit',webkit]])test('Cierre adaptable: ocho columnas completas y categorías móviles con las mismas cifras · '+name,async()=>{
 const browser=await engine.launch(name==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const {page,errors}=await setup(browser);await page.getByRole('heading',{name:'Presupuesto de Retail',exact:true}).waitFor();
  await page.evaluate(()=>{
   document.body.classList.add('kora-product-page');
   const data=window.__fixture.data;data.ventas.find(s=>s.id==='sale1').total='33876543.25';
   data.presupuestos.filter(r=>r.tienda_codigo==='CK-01').forEach(r=>r.meta_venta_total='1000025.25');
   data.historico_mensual.find(r=>r.tienda_codigo==='CK-01').venta_total=27654321.50;
   // Simula el espacio que ocupa el menú lateral, conservando el CSS real del producto.
   document.querySelector('.main-content').style.maxWidth='calc(100% - 260px)';
  });
  await page.locator('#verMes').fill('2026-10');await page.locator('#verMes').dispatchEvent('change');await page.getByRole('button',{name:'Entrega de informe a puntos de venta',exact:true}).click();await page.getByRole('button',{name:'Preparar informes',exact:true}).click();
  const first=page.locator('[data-cierre-tienda="CK-01"]');await first.waitFor();
  for(const width of [1440,1208,1024,768,390,320]){
   await page.setViewportSize({width,height:1000});
   if(width<1000)await page.evaluate(()=>document.querySelector('.main-content').style.maxWidth='100%');
   const bounds=await first.evaluate(article=>{const region=article.querySelector('.cierre-pdv-tabla'),table=region.querySelector('table'),r=region.getBoundingClientRect(),row=table.querySelector('tbody tr');return {region:region.clientWidth,scroll:region.scrollWidth,table:table.getBoundingClientRect().width,layout:getComputedStyle(row).display,viewport:innerWidth,document:document.documentElement.scrollWidth,cells:[...row.children].map(c=>{const b=c.getBoundingClientRect();return {left:b.left-r.left,right:b.right-r.left,width:b.width,content:c.scrollWidth,visible:c.clientWidth,label:c.dataset.cierreLabel,tag:c.tagName,font:getComputedStyle(c).fontSize,pseudo:getComputedStyle(c,'::before').content};})};});
   assert.ok(bounds.document<=width+1,`${name}/${width}: sin desplazamiento de toda la página`);
   assert.ok(bounds.scroll<=bounds.region+1,`${name}/${width}: todas las columnas o campos caben (${JSON.stringify(bounds)})`);
   assert.ok(bounds.cells.every(c=>c.left>=-1&&c.right<=bounds.region+1&&c.content<=c.visible+1),`${name}/${width}: ninguna cifra recortada`);
   assert.equal(await first.getByRole('rowheader').count(),4);assert.equal(await first.getByRole('cell').count(),28);
   assert.equal(bounds.cells.filter(c=>c.label).length,7);assert.match(await first.innerText(),/33\.876\.543/);assert.doesNotMatch(await first.innerText(),/33\.876\.543,25/);
   if(bounds.layout==='grid')assert.ok(bounds.cells.filter(c=>c.label).every(c=>c.pseudo.includes(c.label)),`${name}/${width}: cada valor conserva su etiqueta`);
   else assert.equal(bounds.layout,'table-row');
   if(qa&&name==='chromium'&&[1208,390].includes(width))await first.screenshot({path:resolve(qa,`responsive-${width}.png`)});
  }
  assert.deepEqual(await page.evaluate(()=>window.__fixture.writes),[]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
