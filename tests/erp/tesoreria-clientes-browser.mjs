// Ejecutar: node tests/erp/tesoreria-clientes-browser.mjs. Solo datos ficticios.
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('.');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage(); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const file=resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+'/'))return route.abort();
   try {await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch {await route.fulfill({status:404,body:''});}
 });
 await page.addInitScript(()=>{
  window.calls=[];window.failSave=false;
  const origins=Array.from({length:24},(_,i)=>({codigo:'aliado-'+i,nombre:i===0?'A TECH MOVIL':i===1?'A CREDICELULARES':`Comercio ${i}`,ciudad:'Montería',tipo:'aliado',activo:true}));
  const beneficiaries=[{id:'h1',tipo:'aliado',nombre:'Titular de prueba',identificacion:'123456789',origen_codigo:'aliado-0',activo:true},{id:'e1',tipo:'ejecutivo',nombre:'Ejecutivo prueba',identificacion:'7654321',activo:true}];
  const accounts=[{id:'bank1',beneficiary_id:'h1',banco:'Banco de prueba',tipo_cuenta:'ahorros',numero_cuenta:'001234567890',activo:true,validada:true,created_at:'2026-09-01'}];
  const sites=origins.map(o=>({id:'site-'+o.codigo,origen_codigo:o.codigo,aliado_id:'client-'+o.codigo,direccion:'Dirección de prueba'}));
  const clients=origins.map(o=>({id:'client-'+o.codigo,nombre_comercial:o.nombre,revision:0,contacto:'Contacto prueba',payment_beneficiary_id:o.codigo==='aliado-0'?'h1':null}));
  window.creditekSidebar={perfil:{rol:'operaciones',activo:true,es_operador_aliados:true},sb:{
   from(table){let range;return {select(){return this;},order(){return this;},eq(){return this;},gt(){return this;},range(a,b){range=[a,b];return this;},then(ok,bad){const rows=table==='origenes'?origins:table==='liquidation_beneficiaries'?beneficiaries:table==='beneficiary_bank_accounts'?accounts:table==='aliados_sedes'?sites:table==='aliados'?clients:[];return Promise.resolve({data:range?rows.slice(range[0],range[1]+1):rows,error:null,count:rows.length}).then(ok,bad);}};},
   async rpc(name,params){window.calls.push({name,params});if(name==='tiene_capacidad_aliados')return {data:true,error:null};if(!['tesoreria_guardar_cliente_cuenta','tesoreria_guardar_ficha_cliente','tesoreria_vincular_local_cliente'].includes(name))throw Error('RPC financiera inesperada');if(name==='tesoreria_vincular_local_cliente' && !window.failSave)sites.find(s=>s.origen_codigo===params.p_origen_codigo).aliado_id=params.p_cliente_destino;return {data:{ok:true},error:window.failSave?{message:'Error de prueba: cuenta no guardada'}:null};}
  }};
 });
 await page.goto('https://kora.test/creditek/erp/aliados-tesoreria.html');
 await page.locator('#showClients').click();
 await page.locator('#clientList .tc-row').first().waitFor();
 assert.equal(await page.locator('#clientList .tc-row').count(),10);
 await page.locator('#clientNext').click();assert.match(await page.locator('#clientPage').textContent(),/Página 2/);
 await page.locator('#clientSearch').fill('TECH MOVIL');assert.equal(await page.locator('#clientList .tc-row').count(),1);
 assert.equal(await page.locator('#clientList').textContent().then(t=>t.includes('001234567890')),false);
 await page.locator('[data-edit="aliado-0"]').click();
 await page.locator('#clientBankTab').click();
 assert.equal(await page.locator('[name="accountNumber"]').inputValue(),'001234567890');
 assert.equal(await page.locator('[name="name"]').inputValue(),'Titular de prueba');
 for(const width of [390,768,1280]) {
   await page.setViewportSize({width,height:850});
   assert.equal(await page.locator('[name="verified"]').evaluate(e=>e.getBoundingClientRect().height),18,`checkbox alignment ${width}`);
   assert.ok(await page.locator('#clientDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`dialog overflow ${width}`);
   assert.ok(await page.locator('#clientsContent').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`directory overflow ${width}`);
   await page.screenshot({path:`/private/tmp/tesoreria-clientes-${width}.png`});
 }
 await page.evaluate(()=>{window.failSave=true;});
 await page.locator('[name="verified"]').check();
 await page.locator('#clientSave').click();
 await page.waitForFunction(()=>document.querySelector('#clientEditorError').textContent.includes('Error de prueba'));
 assert.equal(await page.locator('[name="accountNumber"]').inputValue(),'001234567890');
 assert.equal(await page.locator('#clientDialog').evaluate(e=>e.open),true);
 await page.evaluate(()=>{window.failSave=false;});
 await page.locator('#clientSave').click();
 await page.waitForFunction(()=>!document.querySelector('#clientDialog').open);
 assert.match(await page.locator('#clientNotice').textContent(),/No se modificaron órdenes/);
 await page.locator('#clientSearch').fill('CREDICELULARES');
 await page.locator('[data-edit="aliado-1"]').click();
 assert.equal(await page.locator('[name="identification"]').inputValue(),'');
 assert.equal(await page.locator('[name="accountNumber"]').inputValue(),'');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#clientDialog').evaluate(e=>e.open),false);
 const calls=await page.evaluate(()=>window.calls);
 assert.ok(calls.every(c=>['tiene_capacidad_aliados','tesoreria_guardar_cliente_cuenta'].includes(c.name)));
 assert.equal(calls.filter(c=>c.name==='tesoreria_guardar_cliente_cuenta').length,2);
 // Local sin titular: puede elegir titular ya relacionado y unir su ficha a un cliente.
 await page.locator('[data-edit="aliado-1"]').click();await page.locator('#clientBankTab').click();
 await page.locator('#clientHolder').selectOption('h1');
 assert.equal(await page.locator('[name="accountNumber"]').inputValue(),'001234567890');
 assert.equal(await page.locator('[name="name"]').getAttribute('readonly'),'');
 await page.locator('#clientSitesTab').click();
 await page.getByText('Relacionar este local con otro cliente',{exact:true}).click();
 await page.locator('#clientDestination').selectOption('client-aliado-0');
 assert.match(await page.locator('#clientDestinationInfo').textContent(),/7890/);
 for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:850});
   assert.ok(await page.locator('#clientDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.screenshot({path:`/private/tmp/kora-multilocal-${width}.png`});
 }
 await page.locator('[name="confirmLink"]').check();await page.locator('#clientLinkSave').click();
 await page.waitForFunction(()=>!document.querySelector('#clientDialog').open);
 await page.locator('[data-edit="aliado-1"]').click();await page.locator('#clientSitesTab').click();
 assert.equal(await page.locator('#clientSitesList li').count(),2);
 await page.locator('#clientBankTab').click();
 assert.equal(await page.locator('[name="accountNumber"]').inputValue(),'001234567890');
 assert.match(await page.locator('#clientSharedAccount').textContent(),/2 local/);
 await page.locator('#clientClose').click();
 // Mismo componente en Aliados: perfil general independiente del formulario bancario.
 await page.goto('https://kora.test/creditek/erp/aliados.html');
 await page.locator('[data-edit="aliado-0"]').click();
 assert.equal(await page.locator('#clientProfile').isVisible(),true);
 await page.locator('[name="ciudad"]').fill('Sincelejo');
 await page.locator('#clientProfile [name="identificacion"]').fill('900123456-1');
 for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:850});
   assert.ok(await page.locator('#clientDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.screenshot({path:`/private/tmp/kora-ficha-${width}.png`});
 }
 await page.locator('#clientProfileSave').click();
 await page.waitForFunction(()=>!document.querySelector('#clientDialog').open);
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='tesoreria_guardar_ficha_cliente').length),1);
 assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name==='tesoreria_guardar_cliente_cuenta')),false);
 // El enlace de una orden de ejecutivo abre el mismo formulario, sin editar identidad.
 await page.goto('https://kora.test/creditek/erp/aliados-tesoreria.html?vista=clientes&beneficiario=e1');
 await page.locator('#clientDialog[open]').waitFor();
 assert.equal(await page.locator('[name="name"]').inputValue(),'Ejecutivo prueba');
 assert.equal(await page.locator('[name="name"]').getAttribute('readonly'),'');
 assert.equal(await page.locator('#clientProfileTab').isVisible(),false);
 await page.locator('#clientClose').click();
 await page.locator('#showOperational').click();
 await page.waitForFunction(()=>!document.querySelector('#outgoingContent').classList.contains('hidden'));
 await page.locator('#showHistory').click();
 assert.deepEqual(errors,[]);
 console.log('PASS: Tesorería real con fixtures; botón, búsqueda, paginación, editor, permisos de lectura, fallo/reintento, ceros, cuenta faltante, Escape y reflow 390/768/1280. Sin RPC de pagos.');
} finally {await browser.close();}
