import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
import XLSX from 'xlsx';

async function readBook(download){
 const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
 return XLSX.read(Buffer.concat(chunks),{type:'buffer',cellNF:true,bookFiles:true});
}
const values=book=>JSON.stringify(Object.values(book.Sheets));

test('cartera completa: período, detalle, errores, exportación y diseño sin scroll lateral',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-09-16T17:00:00Z')});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='cdn.jsdelivr.net'&&u.pathname==='/npm/exceljs@4.4.0/dist/exceljs.min.js'){
    if(process.env.KORA_REPORT_EXCELJS_PATH)return route.fulfill({contentType:'text/javascript',body:await readFile(process.env.KORA_REPORT_EXCELJS_PATH)});
    return route.continue();
   }
   if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-access-control\.js|kora-environment|supabase-js/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const f=resolve(process.cwd(),'.'+u.pathname);
   if(!f.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   window.__KORA_ENV__={};window.calls=[];
   const data={
    origenes:[{codigo:'T',nombre:'Móvil Shopping',tipo:'propia',activo:true},{codigo:'Z',nombre:'Tienda sin movimientos',tipo:'propia',activo:true},{codigo:'C',nombre:'Luis',tipo:'cliente_b2b',activo:true},{codigo:'F',nombre:'Cliente con anticipo',tipo:'cliente_b2b',activo:true}],
    v_cartera_clientes_b2b:[{cuenta_id:'c1',cliente_codigo:'C',cliente:'Luis'},{cuenta_id:'c2',cliente_codigo:'F',cliente:'Cliente con anticipo'}],
    cuenta_corriente:[{id:1,tienda_codigo:'T',tipo:'cargo',monto:1000000,created_at:'2026-08-31T12:00:00Z',concepto:'Saldo previo'},{id:2,tienda_codigo:'T',tipo:'cargo',monto:300000,created_at:'2026-09-01T12:00:00Z',concepto:'Remisión'},{id:3,tienda_codigo:'T',tipo:'abono',monto:200000,created_at:'2026-09-16T12:00:00Z',concepto:'Compensación aplicada'},{id:4,tienda_codigo:'T',tipo:'cargo',monto:900000,created_at:'2026-09-17T12:00:00Z',concepto:'Fuera de período'}],
    movimientos_cartera:[{id:'a',cuenta_id:'c1',tienda_codigo:'C',efecto:'debito',monto:500000,fecha_efectiva:'2026-09-02',concepto:'Remisión cliente'},{id:'favor',cuenta_id:'c2',tienda_codigo:'F',efecto:'credito',monto:100000.25,fecha_efectiva:'2026-08-31',concepto:'Anticipo'}],
    saldos_iniciales_cartera:[{id:'s1',tienda_codigo:'T',fecha_corte:'2026-09-03'}],
    proveedores:[{id:'p1',nombre:'Proveedor de prueba'}],
   };
   Object.assign(data.cuenta_corriente[0],{created_at:'2026-09-04T12:00:00Z',referencia_tipo:'saldo_inicial',referencia_id:'s1',concepto:'Carga inicial'});
   window.auditCalls=[];
   window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},rpc:async(name,args)=>{if(name!=='kora_registrar_exportacion')throw new Error('Escritura no permitida');window.auditCalls.push(args);return {};},from(table){window.calls.push(table);return {select(){return this},eq(){return this},in(){return this},order(){return this},single:async()=>({data:{rol:'gerencia',nombre:'Responsable ficticio'}}),range:async(a,b)=>window.failTable===table?{error:{message:'Fallo de prueba'}}:{data:data[table].slice(a,b+1)}}}})};
  });
  await page.goto('https://kora.test/creditek/erp/cartera-b2b.html');
  try { await page.locator('#rows').getByText('Móvil Shopping').waitFor({timeout:8000}); }
  catch (error) { throw new Error(`La cartera no cargó: ${await page.locator('#loadError').textContent()} · ${errors.join(' · ')}`, {cause:error}); }
  assert.equal(await page.locator('#rows tr').count(),4);
  assert.match(await page.locator('#kInicial').textContent(),/899\.999,75/);
  assert.match(await page.locator('#kCargos').textContent(),/800\.000/);
  assert.match(await page.locator('#kAbonos').textContent(),/200\.000/);
  assert.match(await page.locator('#kSaldo').textContent(),/1\.499\.999,75/);
  assert.equal(await page.locator('#fCliente option').count(),2);
  const full=await page.evaluate(()=>window.KoraReportExport.snapshot({rol:'gerencia'}));
  const totals=full.tables.find(table=>table.sourceId==='rows').totalRows;
  assert.ok(totals.some(row=>row[0]==='TOTAL NETO'&&row[5]==='1.499.999,75'),'La captura conserva el pie neto explícito de pantalla; el informe descargado separa terceros en otra tabla.');
  const allDownload=page.waitForEvent('download');await page.locator('#csv').click();
  const allFile=await allDownload,allBook=await readBook(allFile);
  assert.match(allFile.suggestedFilename(),/detallado.*\.xlsx$/);
  const balances=allBook.Sheets[allBook.SheetNames.find(name=>name.includes('Saldos sin compensar'))];
  assert.equal(balances.B10.v,1600000);assert.equal(balances.C10.v,100000.25);
  await page.locator('#nuevo').click();
  assert.equal(await page.locator('#fDestinoWrap').isVisible(),true);
  assert.match(await page.locator('#fDestino option:checked').textContent(),/A Banco Creditek · reduce cartera y aumenta Banco/);
  assert.match(await page.locator('#fDestinoNota').textContent(),/reduce la deuda del cliente y aumenta Banco Creditek/);
  await page.locator('#fDestino').selectOption('proveedor');
  assert.match(await page.locator('#fDestinoNota').textContent(),/No aumenta ni disminuye Banco Creditek/);
  assert.equal(await page.locator('#fProveedorWrap').isVisible(),true);
  assert.equal(await page.locator('#fProveedor option').count(),2);
  await page.locator('#fEfecto').selectOption('debito');
  assert.equal(await page.locator('#fDestinoWrap').isVisible(),false);
  assert.equal(await page.locator('#fConceptoWrap').isVisible(),true);
  await page.locator('[data-close="form"]').click();
  assert.match(await page.locator('#rows').textContent(),/corte 2026-09-03/);
  for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:1000});
   await page.clock.runFor(1200);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.ok(await page.locator('.page .tablewrap').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.screenshot({path:`/tmp/kora-cartera-b2b-${width}.png`,fullPage:true,animations:'disabled'});
  }
  await page.locator('#buscar').fill('movil');
  for(const [id,changed,original] of [['desde','2026-09-02','2026-09-01'],['hasta','2026-09-15','2026-09-16']]){
   await page.locator('#rows').getByRole('button',{name:'Móvil Shopping'}).click();
   await page.locator('#'+id).fill(changed);await page.locator('#'+id).dispatchEvent('change');
   assert.equal(await page.locator('#detalle').isVisible(),false,id+' invalida el detalle');
   await page.locator('#'+id).fill(original);await page.locator('#'+id).dispatchEvent('change');
  }
  await page.locator('#rows').getByRole('button',{name:'Móvil Shopping'}).click();
  await page.locator('#cliente').selectOption('C');
  assert.equal(await page.locator('#detalle').isVisible(),false,'Cambiar cliente invalida el detalle');
  await page.locator('#cliente').selectOption('');
  assert.equal(await page.locator('#rows tr').count(),1);
  await page.locator('#rows').getByRole('button',{name:'Móvil Shopping'}).click();
  assert.equal(await page.locator('#dRows tr').count(),2);
  assert.doesNotMatch(await page.locator('#dRows').textContent(),/Fuera de período|Carga inicial/);
  assert.match(await page.locator('#dInicial').textContent(),/1\.000\.000.*2026-09-03.*2026-09-04/);
  assert.equal(await page.locator('#dResumido').isChecked(),false);
  assert.match(await page.locator('#dTotales').textContent(),/300\.000.*200\.000/);
  const qa=process.env.KORA_REPORT_QA_DIR;if(qa)await mkdir(qa,{recursive:true});
  for(const summary of [false,true]){
   await page.locator('#dResumido').setChecked(summary);
   const pending=page.waitForEvent('download');await page.locator('#dExcel').click();
   const dl=await pending,book=await readBook(dl),text=values(book);
   assert.match(dl.suggestedFilename(),summary?/resumido/:/detallado/);
   assert.ok(Object.keys(book.files).some(path=>path.startsWith('xl/media/')),'Logo incrustado');
   assert.match(text,/KORA-REP-|Responsable ficticio/);assert.match(text,/Móvil Shopping/);
   assert.doesNotMatch(text,/Luis|Fuera de período/);
   assert.equal(book.SheetNames.some(name=>name.includes('Cargos, abonos')),!summary);
   const sums=book.Sheets[book.SheetNames.find(name=>name.includes('Resumen de cartera'))];
   assert.equal(sums.B9.t,'n');assert.equal(sums.F9.v,1100000);assert.equal(sums.F10.v,1100000);
   if(!summary){const ms=book.Sheets[book.SheetNames.find(name=>name.includes('Cargos, abonos'))];assert.equal(ms.A9.t,'n');assert.equal(ms.A9.z,'dd/mm/yyyy');}
   if(qa)await dl.saveAs(resolve(qa,'cartera-'+(summary?'resumido':'detallado')+'-prueba.xlsx'));
   const [popup]=await Promise.all([page.waitForEvent('popup'),page.locator('#dPdf').click()]);
   try{await popup.getByRole('heading',{name:'Resumen de cartera',exact:true}).waitFor();}
   catch(error){throw new Error('El PDF no se generó: '+await page.locator('#dEstado').textContent(),{cause:error});}
   await popup.waitForFunction(()=>document.querySelector('.brand img')?.naturalWidth>0);
   const body=await popup.locator('body').textContent();
   assert.match(body,/Móvil Shopping|KORA-REP-|Responsable ficticio/);assert.doesNotMatch(body,/Luis|Fuera de período/);
   assert.match(body,/1\.100\.000,00/);assert.equal(await popup.evaluate(()=>window.opener),null);
   assert.equal(await popup.getByRole('heading',{name:'Cargos, abonos y ajustes del período',exact:true}).count(),summary?0:1);
   assert.ok((await page.evaluate(()=>auditCalls.at(-1).p_ruta)).endsWith('#detalle-cartera'));
   assert.equal(await popup.evaluate(()=>getComputedStyle(document.querySelector('tfoot')).display),'table-row-group');
   if(qa)await popup.pdf({path:resolve(qa,'cartera-'+(summary?'resumido':'detallado')+'-prueba.pdf'),preferCSSPageSize:true,printBackground:true});
   await popup.close();
  }
  for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.locator('#detalle .box').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   const gap=await page.locator('#dResumido').evaluate(e=>e.nextElementSibling.getBoundingClientRect().x-e.getBoundingClientRect().right);
   assert.ok(gap<=12);if(qa)await page.screenshot({path:resolve(qa,'cartera-controles-'+width+'.png')});
  }
  await page.locator('[data-close="detalle"]').click();
  const download=page.waitForEvent('download');await page.locator('#csv').click();
  const file=await download,content=values(await readBook(file));
  assert.match(content,/Saldo inicial/);assert.match(content,/Móvil Shopping/);assert.doesNotMatch(content,/Luis|Fuera de período/);
  assert.match(content,/Carga inicial/);
  // Los fallos de descarga no contaminan la consulta ni exigen recargar saldos.
  await page.route('**/creditek-logo.png',route=>route.fulfill({status:503,body:''}));
  await page.locator('#csv').click();
  await page.locator('#exportEstado').getByText(/No fue posible cargar el logo/).waitFor();
  assert.equal(await page.locator('#loadError').textContent(),'');
  await page.unroute('**/creditek-logo.png');
  const retry=page.waitForEvent('download');await page.locator('#csv').click();await retry;
  await page.evaluate(()=>{window.originalOpen=window.open;window.open=()=>null;});
  await page.locator('#pdf').click();
  assert.match(await page.locator('#exportEstado').textContent(),/Permite ventanas emergentes/);
  await page.evaluate(()=>{window.open=window.originalOpen;});
  await page.locator('#rows').getByRole('button',{name:'Móvil Shopping'}).click();
  await page.locator('#buscar').fill('Luis');
  assert.equal(await page.locator('#detalle').isVisible(),false,'Cambiar el filtro invalida el detalle anterior');
  await page.locator('#buscar').fill('movil');
  await page.locator('#desde').fill('2026-09-20');await page.locator('#desde').dispatchEvent('change');
  assert.equal(await page.locator('#csv').isDisabled(),true);
  assert.match(await page.evaluate(()=>{try{window.KoraReportExport.snapshot({rol:'gerencia'});return 'permitido';}catch(error){return error.message;}}),/período válido/);
  assert.equal(await page.locator('#kSaldo').getAttribute('data-kora-report-value'),null);
  await page.locator('#desde').fill('2026-09-01');await page.locator('#desde').dispatchEvent('change');
  await page.evaluate(()=>window.failTable='saldos_iniciales_cartera');await page.locator('#actualizar').click();
  await page.locator('#loadError').getByText(/No fue posible cargar/).waitFor();
  assert.equal(await page.locator('#rows tr').count(),0);
  assert.equal(await page.locator('#kSaldo').textContent(),'—');
  assert.equal(await page.locator('#csv').isDisabled(),true);
  assert.match(await page.evaluate(()=>{try{window.KoraReportExport.snapshot({rol:'gerencia'});return 'permitido';}catch(error){return error.message;}}),/Actualiza la cartera/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
