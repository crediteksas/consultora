// Facturas, proveedores y RPC completamente ficticios. Se ejecutan el HTML,
// los manejadores y el lector XML/ZIP reales sin SDK ni sesión de producción.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, expect} from '@playwright/test';
import {zipSync, strToU8} from 'fflate';

const root = fileURLToPath(new URL('../../',import.meta.url));
const pagePath = '/creditek/erp/compra-proveedor.html';
const xml = ({nit='900000001', numero='QA-1', base='1000.00', iva='190.00', total='1190.00'}={}) => `<?xml version="1.0"?><Invoice>
<ID>${numero}</ID><DocumentCurrencyCode>COP</DocumentCurrencyCode>
<AccountingSupplierParty><Party><PartyTaxScheme><CompanyID>${nit}</CompanyID></PartyTaxScheme></Party></AccountingSupplierParty>
<LegalMonetaryTotal><TaxExclusiveAmount>${base}</TaxExclusiveAmount><TaxInclusiveAmount>${total}</TaxInclusiveAmount></LegalMonetaryTotal>
<TaxTotal><TaxSubtotal><TaxAmount>${iva}</TaxAmount><TaxCategory><TaxScheme><ID>01</ID><Name>IVA</Name></TaxScheme></TaxCategory></TaxSubtotal></TaxTotal></Invoice>`;
const xmlFile = (options, name='factura-ficticia.xml') => ({name,mimeType:'application/xml',buffer:Buffer.from(xml(options))});

// Todo efecto de negocio se captura en RAM. Solo CSS/fuentes públicas pueden salir.
test('compra: IVA, XML/ZIP, eventos y contrato RPC con datos ficticios', {timeout:120000}, async t => {
 const original = await readFile(path.join(root,pagePath),'utf8');
 const inline = [...original.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
   .find(([,attrs,source])=>!/\bsrc\s*=/.test(attrs)&&source.includes('async function guardarCompra'))?.[2];
 assert.ok(inline && inline.includes('// BOOT'));
 const html = original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const server = createServer(async(req,res)=>{
  try {
   const pathname = new URL(req.url,'http://localhost').pathname;
   const file = path.resolve(root,`.${pathname}`);
   const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(pathname)];
   if(req.method!=='GET'||!file.startsWith(root)||!mime) return res.writeHead(404).end();
   res.setHeader('Content-Type',mime);
   res.end(pathname===pagePath?html:await readFile(file));
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const origin = `http://127.0.0.1:${server.address().port}`;
  const rejected=[], errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let cssLoaded=false;
  page.on('response',r=>{if(r.url()==='https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css' && r.ok())cssLoaded=true;});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   const allowed=url.origin===origin || url.href==='https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css'
     || url.href==='https://unpkg.com/lucide@1.27.0/dist/umd/lucide.min.js' || ['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname);
   if(allowed && route.request().method()==='GET')return route.continue();
   rejected.push(url.href);return route.abort();
  });
  await page.goto(origin+pagePath,{waitUntil:'networkidle'});
  assert.equal(cssLoaded,true,'CSS real cargado');
  await page.evaluate(()=>{
   window.qaCalls=[];
   window.SB={auth:{getSession(){throw Error('No debe consultar Auth');}},
    from(){throw Error('No debe consultar registros');},storage:{from(){throw Error('No debe subir archivos');}},
    async rpc(name,args){window.qaCalls.push({name,args});return {data:{ok:true,total:1190,total_retenido:25},error:null};}};
  });
  for(const script of ['vendor/fflate-0.8.3.js','proveedores-impuestos.js','compra-retencion-automatica.js'])
   await page.addScriptTag({url:origin+'/creditek/erp/'+script});
  await page.addScriptTag({url:origin+'/design-system/components/kora-product.js'});
  await page.addScriptTag({content:inline.slice(0,inline.indexOf('// BOOT'))+`
   window.qaReset=()=>{
    rolActual='gerencia';politicasRetencionCargadas=true;
    proveedores=[{id:'qa-auto',nombre:'Proveedor ficticio con retención',nit:'900000001-0'},
                 {id:'qa-normal',nombre:'Proveedor ficticio sin política',nit:'900000002-0'}];
    politicasRetencion=[{proveedor_id:'qa-auto',tarifa_porcentaje:2.5}];
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('sel-proveedor').innerHTML=proveedores.map(p=>'<option value="'+p.id+'">'+p.nombre+'</option>').join('');
    document.getElementById('num-factura').value='QA-1';
    document.getElementById('fecha-factura').value='2026-01-01';
    document.getElementById('fecha-vencimiento').value='2026-02-01';
    document.getElementById('tipo-compra').value='credito';
    document.getElementById('compra-retenciones').replaceChildren();
    document.getElementById('panel-exito').classList.add('hidden');
    document.getElementById('toast').classList.add('hidden');
    items=[{tempId:'qa-line',producto_id:'qa-product',producto_nombre:'Producto ficticio',producto_tipo:'cantidad',cantidad:1,costo_unitario:1190,precio_remision:1500,margen_tipo:'valor_fijo',margen_valor:310,precio_manual:true}];
    window.qaCalls=[];cambiarProveedorRetencion();renderItems();
   };
   window.qaPolicyUnavailable=()=>{politicasRetencionCargadas=false;};
   window.qaTotal=total=>{items[0].costo_unitario=total;renderItems();};
  `});
  const reset=()=>page.evaluate(()=>window.qaReset());
  const iva=page.locator('#retencion-auto-iva'), base=page.locator('#retencion-auto-base'), state=page.locator('#retencion-auto-estado');
  const net=page.locator('#compra-neto'), save=page.locator('#btn-guardar'), file=page.locator('#retencion-auto-xml');
  const noCalls=async()=>assert.deepEqual(await page.evaluate(()=>window.qaCalls),[]);
  const upload=async options=>{await file.setInputFiles(xmlFile(options));await expect(state).not.toContainText('Espera');};

  await t.test('IVA manual: preview y registro concordantes; base solo lectura y bruto intacto',async()=>{
   await reset();await expect(base).toHaveAttribute('readonly','');
   await save.click();await noCalls();await expect(net).toHaveText('Por calcular');
   await iva.fill('190');await expect(base).toHaveValue(/1\.000/);await expect(net).toHaveText(/1\.165/);
   await page.evaluate(()=>document.getElementById('retencion-auto-base').value='999999');
   await save.click();const calls=await page.evaluate(()=>window.qaCalls);
   assert.equal(calls.length,1);assert.equal(calls[0].name,'registrar_compra_proveedor_automatica');
   assert.equal(calls[0].args.p_base_sin_iva,1000);assert.equal(calls[0].args.p_items[0].costo_unitario,1190);
   assert.deepEqual(calls[0].args.p_retenciones,[],'el cliente no duplica ReteFuente');
  });
  await t.test('sin IVA, mezcla de tarifas y retenciones adicionales',async()=>{
   await reset();await page.evaluate(()=>window.qaTotal(1000));
   await page.locator('#retencion-auto-sin-iva').check();await expect(iva).toHaveValue('0');await expect(net).toHaveText(/975/);
   await page.locator('#retencion-auto-sin-iva').uncheck();await expect(net).toHaveText('Por calcular');
   await page.evaluate(()=>window.qaTotal(1700));await iva.fill('200');await expect(base).toHaveValue(/1\.500/);
   await page.locator('#compra-agregar-retencion').click();const row=page.locator('#compra-retenciones fieldset');
   await expect(row.locator('option').filter({hasText:'ReteFuente'})).toHaveAttribute('disabled','');
   await row.locator('select').selectOption('ReteICA');await row.locator('[name=base]').fill('1500');await row.locator('[name=tarifa]').fill('1');
   await expect(row.locator('[name=valor]')).toHaveValue('15.00');await expect(net).toHaveText(/1\.648/);
   await save.click();const args=(await page.evaluate(()=>window.qaCalls))[0].args;
   assert.equal(args.p_base_sin_iva,1500);assert.equal(args.p_retenciones.length,1);assert.equal(args.p_retenciones[0].tipo,'ReteICA');
  });
  await t.test('XML antes de terminar productos se conserva; total distinto bloquea el registro',async()=>{
   await reset();await page.evaluate(()=>window.qaTotal(0));await upload();await expect(state).toContainText('no coincide');await expect(net).toHaveText('Por calcular');
   await page.evaluate(()=>window.qaTotal(1190));await expect(state).toContainText('XML');await expect(base).toHaveValue(/1\.000/);
   await page.evaluate(()=>window.qaTotal(1190.01));await save.click();await noCalls();await expect(net).toHaveText('Por calcular');
   await page.evaluate(()=>window.qaTotal(1190));await save.click();assert.equal((await page.evaluate(()=>window.qaCalls))[0].args.p_base_sin_iva,1000);
   await iva.fill('100');await expect(state).toContainText('confirmado');await expect(base).toHaveValue(/1\.090/);
  });
  await t.test('ZIP real, proveedor/número distintos, duplicados y XML fiscal inconsistente',async()=>{
   await reset();const zip={name:'factura-ficticia.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'factura.xml':strToU8(xml())}))};
   await file.setInputFiles(zip);await expect(state).toContainText('IVA leído del XML');await expect(iva).toHaveValue('190');
   for(const options of [{nit:'900000099'},{numero:'QA-OTRA'},{iva:'191.00'}]){
    await upload(options);await save.click();await noCalls();await expect(net).toHaveText('Por calcular');
   }
   await file.setInputFiles({...zip,buffer:Buffer.from(zipSync({'a.xml':strToU8(xml()),'b.xml':strToU8(xml())}))});
   await expect(state).toContainText('sin duplicados');await save.click();await noCalls();
  });
  await t.test('otra factura/proveedor borra el IVA previo; proveedor sin política usa RPC habitual',async()=>{
   await reset();await iva.fill('190');await page.locator('#num-factura').fill('QA-2');await expect(iva).toHaveValue('');await save.click();await noCalls();
   await page.locator('#sel-proveedor').selectOption('qa-normal');await expect(page.locator('#retencion-auto-panel')).toBeHidden();
   await save.click();const call=(await page.evaluate(()=>window.qaCalls))[0];
   assert.equal(call.name,'registrar_compra_proveedor_operativa');assert.equal('p_base_sin_iva' in call.args,false);
   await page.locator('#sel-proveedor').selectOption('qa-auto');await expect(iva).toHaveValue('');await expect(net).toHaveText('Por calcular');
  });
  await t.test('lecturas fuera de orden y cambios de identidad no restauran un IVA antiguo',async()=>{
   await reset();await page.evaluate(()=>{
    window.qaOriginalReader=window.CreditekProveedoresImpuestos.leerArchivo;window.qaPending={};
    window.CreditekProveedoresImpuestos.leerArchivo=file=>new Promise((resolve,reject)=>{window.qaPending[file.name]={resolve,reject};});
   });
   await file.setInputFiles(xmlFile({},'viejo.xml'));await expect(state).toContainText('Espera');await save.click();await noCalls();
   await file.setInputFiles(xmlFile({},'nuevo.xml'));
   await page.evaluate(()=>window.qaPending['nuevo.xml'].resolve([{nit:'900000001',numero:'QA1',total:1190,baseAntesIVA:1000,iva:190,detalleIVA:[{}]}]));
   await expect(iva).toHaveValue('190');
   await page.evaluate(()=>window.qaPending['viejo.xml'].reject(Error('respuesta antigua')));await expect(state).toContainText('XML');
   await file.setInputFiles(xmlFile({},'identidad.xml'));
   await page.locator('#sel-proveedor').selectOption('qa-normal');await page.locator('#sel-proveedor').selectOption('qa-auto');
   await page.evaluate(()=>window.qaPending['identidad.xml'].resolve([{nit:'900000001',numero:'QA1',total:1190,baseAntesIVA:1000,iva:190,detalleIVA:[{}]}]));
   await expect(iva).toHaveValue('');await expect(net).toHaveText('Por calcular');
   await page.evaluate(()=>window.CreditekProveedoresImpuestos.leerArchivo=window.qaOriginalReader);
  });
  await t.test('validación del IVA y política pendiente impiden cualquier RPC',async()=>{
   await reset();for(const invalid of ['', '-1','1190','1191','0.001']){await iva.fill(invalid);await save.click();await noCalls();await expect(net).toHaveText('Por calcular');}
   await iva.fill('190');await page.evaluate(()=>window.qaPolicyUnavailable());await save.click();await noCalls();await expect(page.locator('#toast')).toContainText('verificar la retención');
  });
  await t.test('Limpiar formulario invalida IVA, XML y lecturas pendientes de la factura anterior',async()=>{
   await reset();await upload();await expect(iva).toHaveValue('190');
   page.once('dialog',dialog=>dialog.accept());await page.locator('#btn-limpiar').click();
   await expect(iva).toHaveValue('');await expect(base).toHaveValue('');
   await expect(page.locator('#sel-proveedor')).toHaveValue('');await expect(page.locator('#num-factura')).toHaveValue('');
   await expect(page.locator('#tbody-items tr')).toHaveCount(0);
   assert.equal(await file.evaluate(e=>e.files.length),0);
   await reset();await page.evaluate(()=>{
    window.qaOriginalReader=window.CreditekProveedoresImpuestos.leerArchivo;
    window.CreditekProveedoresImpuestos.leerArchivo=()=>new Promise(resolve=>{window.qaAfterClear=resolve;});
   });
   await file.setInputFiles(xmlFile());await expect(state).toContainText('Espera');
   page.once('dialog',dialog=>dialog.accept());await page.locator('#btn-limpiar').click();
   await page.evaluate(()=>window.qaAfterClear([{nit:'900000001',numero:'QA1',total:1190,baseAntesIVA:1000,iva:190,detalleIVA:[{}]}]));
   await expect(iva).toHaveValue('');await expect(base).toHaveValue('');await noCalls();
   await page.evaluate(()=>window.CreditekProveedoresImpuestos.leerArchivo=window.qaOriginalReader);
  });
  await t.test('presentación escritorio y móvil sin recorte en el panel de retención',async()=>{
   await reset();await iva.fill('190');
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.locator('#retencion-auto-panel').scrollIntoViewIfNeeded();
    const measurements=await page.locator('#retencion-auto-panel').evaluate(panel=>{
     const r=panel.getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth,overflow:panel.scrollWidth-panel.clientWidth};
    });
    assert.ok(measurements.left>=0&&measurements.right<=width+1&&measurements.overflow<=1,JSON.stringify(measurements));
    if(process.env.KORA_SCREENSHOT_DIR){await mkdir(process.env.KORA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.KORA_SCREENSHOT_DIR,`retencion-${width}.png`)});}
   }
  });
  assert.deepEqual(rejected,[],'sin solicitudes a servicios de negocio');assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
