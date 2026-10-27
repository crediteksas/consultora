import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
test('socios UI: reparto, soporte, confirmación, reintento idéntico, historial y responsive',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-22T18:00Z')});
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-access-control|kora-environment|supabase-js/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const path=resolve(process.cwd(),'.'+u.pathname);if(!path.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream',body:await readFile(path)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   window.__KORA_ENV__={};window.siCalls=[];window.siUploads=[];window.siOperations=[];window.siNetworkFailure=false;window.siFailQuery=false;window.siUploadResponseLost=true;
   const cuts=[{corte_id:'positive',tienda_codigo:'A',tienda_nombre:'Tienda positiva ficticia',inicio_at:'2026-09-01',fin_at:'2026-10-07',huella:'source-hash',grupo:'socios-retail',listo:true,utilidad_neta:1000,retiros_anteriores:0,retirado:0,disponible:1000,perdida_cubierta:0,perdida_pendiente:0},
    {corte_id:'negative',tienda_codigo:'B',tienda_nombre:'Tienda negativa ficticia',inicio_at:'2026-09-01',fin_at:'2026-10-08',huella:'target-hash',grupo:'socios-retail',listo:true,utilidad_neta:-300,retiros_anteriores:0,retirado:0,disponible:0,perdida_cubierta:0,perdida_pendiente:300},
    {corte_id:'blocked',tienda_codigo:'C',tienda_nombre:'Resultado por validar',inicio_at:'2026-09-01',fin_at:'2026-10-09',huella:'blocked',grupo:'socios-retail',listo:false,utilidad_neta:50,disponible:50,bloqueos:['Pendiente ficticio de conciliación.']}];
   const tables={origenes:[{codigo:'A',nombre:'Tienda positiva ficticia'}],financial_entries:[],financial_recurring_templates:[],proveedores:[{id:'supplier',nombre:'Proveedor ficticio',activo:true}],facturas_proveedor:[{id:'bill',proveedor_id:'supplier',numero:'QA-001',saldo:1000}]};
   const sb={rpc:async(name,args)=>{
    if(name==='finanzas_generar_pendientes')return {data:[]};
    if(name!=='socios_inventario')throw Error('RPC no prevista: '+name);
    if(args.p_accion==='consultar')return window.siFailQuery?{error:{message:'Consulta ficticia fallida'}}:{data:{cortes:structuredClone(cuts),operaciones:structuredClone(window.siOperations)}};
    window.siCalls.push(structuredClone(args));
    if(!window.siOperations.some(o=>o.id===args.p_request_id)){
     const amount=args.p_datos.destinos.reduce((n,x)=>n+Number(x.monto),0);
     window.siOperations.push({id:args.p_request_id,corte_id:'positive',fecha:args.p_datos.fecha,tienda:'Tienda positiva ficticia',monto:amount,motivo:args.p_datos.motivo,
      destinos:args.p_datos.destinos.map(x=>({...x,tienda_destino:'Tienda negativa ficticia',proveedor:'Proveedor ficticio',factura:'QA-001'}))});
     cuts[0].disponible-=amount;cuts[0].retirado+=amount;
     cuts[1].perdida_cubierta=300;cuts[1].perdida_pendiente=0;
    }
    if(window.siNetworkFailure){window.siNetworkFailure=false;return {error:{message:'Respuesta perdida ficticia'}};}
    return {data:{ok:true,operacion:args.p_request_id}};
   },from(table){return {select(){return this},eq(){return this},order(){return this},range:async(a,b)=>({data:(tables[table]||[]).slice(a,b+1)}),then(resolve){resolve({data:tables[table]||[]});}};},
   storage:{from(){return {upload:async(path,file)=>{window.siUploads.push({path,name:file.name,size:file.size});if(window.siUploadResponseLost){window.siUploadResponseLost=false;return {error:{message:'Respuesta de subida perdida ficticia'}};}return {};},createSignedUrl:async path=>({data:{signedUrl:'https://kora.test/proof/'+path}})};}}};
   window.creditekSidebar={sb,perfil:{id:'fictitious-controller',rol:'auditoria',activo:true}};
  });
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('https://kora.test/creditek/erp/finanzas-programadas.html?vista=general#socios-inventario');
  await page.locator('#siFuente option[value=positive]').waitFor({state:'attached'});
  assert.equal(await page.locator('#siFuente option[value=blocked]').count(),1);
  await page.locator('#siFuente').selectOption('blocked');
  assert.match(await page.locator('#siEfectos').textContent(),/todavía no habilitado.*Pendiente ficticio/s);
  assert.equal(await page.locator('#siGuardar').isDisabled(),true);
  await page.evaluate(()=>document.getElementById('siForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await page.locator('#siEstado').filter({hasText:'No se registró el movimiento'}).waitFor();
  assert.equal((await page.evaluate(()=>window.siCalls)).length,0);assert.equal((await page.evaluate(()=>window.siUploads)).length,0);
  assert.match(await page.locator('#siResultados').textContent(),/TOTAL.*700/s);
  await page.locator('#siFuente').selectOption('positive');await page.locator('#siFecha').fill('2026-10-20');
  const first=page.locator('[data-si-destino]').nth(0);
  await first.locator('[name=monto]').fill('700');await first.locator('[name=beneficiario]').fill('Socio ficticio');
  await first.locator('[name=soporte]').setInputFiles({name:'recibo-socio.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 ficticio')});
  await page.locator('#siAgregar').click();const second=page.locator('[data-si-destino]').nth(1);
  await second.locator('[name=tipo]').selectOption('aporte');await second.locator('[name=monto]').fill('300');
  await second.locator('[name=corte]').selectOption('negative');await second.locator('[name=factura]').selectOption('bill');
  await second.locator('[name=soporte]').setInputFiles({name:'pago-proveedor.jpg',mimeType:'image/jpeg',buffer:Buffer.from('imagen ficticia')});
  await page.locator('#siMotivo').fill('Liquidación ficticia de socios y aporte a pérdida');await page.locator('#siConfirmar').check();
  assert.match(await page.locator('#siTotal').textContent(),/1\.000/);assert.equal(await page.locator('#siGuardar').isEnabled(),true);
  const qa=process.env.KORA_SOCIOS_QA_DIR;if(qa)await mkdir(qa,{recursive:true});
  for(const width of [390,768,1280]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sin desborde de página');
   if(qa)await page.locator('#socios-inventario').screenshot({path:resolve(qa,'socios-form-'+width+'.png')});}
  await page.evaluate(()=>window.siNetworkFailure=true);await page.locator('#siGuardar').click();
  await page.getByRole('button',{name:'Reintentar la misma solicitud'}).waitFor();
  assert.equal(await page.locator('#siFuente').isDisabled(),true);assert.match(await page.locator('#siEstado').textContent(),/Confirmación pendiente/);
  await page.getByRole('button',{name:'Reintentar la misma solicitud'}).click();
  await page.locator('#siEstado').filter({hasText:'Movimiento registrado'}).waitFor();
  const calls=await page.evaluate(()=>window.siCalls);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
  assert.equal((await page.evaluate(()=>window.siUploads)).length,2);assert.equal((await page.evaluate(()=>window.siOperations)).length,1);
  assert.match(await page.locator('#siHistorial').textContent(),/retiro.*1\.000.*TOTAL RETIRADO/s);
  await page.locator('#siHistorial details').evaluate(el=>el.open=true);
  assert.match(await page.locator('#siHistorial').textContent(),/Aporte de socios para cubrir pérdida.*Tienda negativa ficticia.*Proveedor ficticio/s);
  await page.locator('#siMes').fill('2026-09');assert.equal(await page.locator('#siGuardar').isDisabled(),true);
  await page.evaluate(()=>window.siFailQuery=true);await page.locator('#siActualizar').click();
  await page.locator('#siEstado').filter({hasText:'No se pudo verificar'}).waitFor();assert.equal(await page.locator('#siGuardar').isDisabled(),true);
  assert.match(await page.locator('#siResultados').textContent(),/no equivale a cero/);assert.match(await page.locator('#siHistorial').textContent(),/No se pudo comprobar/);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('socios UI: todos positivos bloqueados visibles, revisión explícita y reintento sin otro pago',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-27T18:00Z')});
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-access-control|kora-environment|supabase-js/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const path=resolve(process.cwd(),'.'+u.pathname);if(!path.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream',body:await readFile(path)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   window.__KORA_ENV__={};window.revisionCalls=[];window.withdrawalCalls=[];window.uploads=[];window.reviewLoseResponse=true;
   const blocked={corte_id:'cut-synthetic',tienda_codigo:'A',tienda_nombre:'Tienda positiva ficticia',inicio_at:'2026-09-01T05:00Z',fin_at:'2026-10-07T15:00Z',huella:'synthetic',grupo:'socios-retail',listo:false,utilidad_neta:1000,retiros_anteriores:0,retirado:0,disponible:1000,perdida_cubierta:0,perdida_pendiente:0,bloqueos:['Hay retiros anteriores cuyo período o distribución debe conciliarse con este corte.']};
   const negative={...blocked,corte_id:'negative-synthetic',tienda_nombre:'Tienda con pérdida ficticia',listo:true,utilidad_neta:-300,disponible:0,perdida_pendiente:300,bloqueos:[]};
   const old={retiro_id:'retire-synthetic',monto:200,estado:'pagado',periodo_desde:'2026-08-01',periodo_hasta:'2026-09-05',huella_fuente:'synthetic-row-hash',fuente_valida:true,requiere_revision:true,decision:null};
   const sb={rpc:async(name,args)=>{
    if(name==='finanzas_generar_pendientes')return{data:[]};if(name!=='socios_inventario')throw Error('RPC inesperada');
    if(args.p_accion==='consultar')return{data:{cortes:structuredClone(window.onlyLosses?[negative]:[blocked,negative]),operaciones:[]}};
    if(args.p_accion==='revisar_retiros')return{data:{inventario:{corte_id:blocked.corte_id,tienda:blocked.tienda_nombre,inicio_at:blocked.inicio_at,fin_at:blocked.fin_at},retiros:[structuredClone(old)]}};
    if(args.p_accion==='conciliar_retiro'){
     window.revisionCalls.push(structuredClone(args));old.requiere_revision=false;old.decision=args.p_datos.decision;old.motivo=args.p_datos.motivo;blocked.listo=true;blocked.bloqueos=[];
     if(old.decision==='este_corte'){blocked.retiros_anteriores=200;blocked.disponible=800;}
     if(window.reviewLoseResponse){window.reviewLoseResponse=false;return{error:{message:'Respuesta ficticia perdida'}};}
     return{data:{ok:true}};
    }
    window.withdrawalCalls.push(structuredClone(args));throw Error('No se debe registrar dinero en esta prueba');
   },from(){return{select(){return this;},eq(){return this;},order(){return this;},range:async()=>({data:[]}),then(resolve){resolve({data:[]});}};},
   storage:{from(){return{upload:async()=>{window.uploads.push('unexpected');throw Error('No se debe subir soporte al revisar');}};}}};
   window.creditekSidebar={sb,perfil:{id:'fictitious-controller',rol:'auditoria',activo:true}};
  });
  page.on('dialog',d=>d.accept());
  await page.goto('https://kora.test/creditek/erp/finanzas-programadas.html?vista=general#socios-inventario');
  await page.locator('#siFuente option[value=cut-synthetic]').waitFor({state:'attached'});
  assert.match(await page.locator('#siEstado').textContent(),/0 con utilidad habilitada.*1 resultados positivos por revisar/);
  assert.match(await page.locator('#siResultados').textContent(),/inventario cerrado.*Resultado por revisar/s);
  assert.match(await page.locator('#siResultados').textContent(),/Pérdida pendiente de cubrir/);
  await page.locator('#siFuente').selectOption('cut-synthetic');assert.equal(await page.locator('#siGuardar').isDisabled(),true);
  assert.match(await page.locator('#siPendientes').textContent(),/Retiros anteriores por identificar/);
  await page.getByRole('button',{name:/Revisar retiro anterior/}).click();
  await page.locator('.socios-review-item').waitFor();const form=page.locator('.socios-review-item');
  assert.equal(await form.locator('[name=decision]').inputValue(),'');assert.equal((await page.evaluate(()=>window.revisionCalls)).length,0);
  assert.match(await form.textContent(),/200.*01\/08\/2026 a 05\/09\/2026/s);
  await form.locator('[name=decision]').selectOption('anterior');await form.locator('[name=motivo]').fill('Período anterior comprobado en soporte ficticio');await form.locator('[name=confirmado]').check();
  const qa=process.env.KORA_SOCIOS_QA_DIR;if(qa)await mkdir(qa,{recursive:true});
  for(const width of[390,768,1280]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(qa)await page.locator('#socios-inventario').screenshot({path:resolve(qa,'socios-review-'+width+'.png')});}
  await form.getByRole('button',{name:'Confirmar clasificación del retiro'}).click();
  await page.getByRole('button',{name:'Reintentar la misma revisión'}).waitFor();assert.equal(await page.locator('#siMes').isDisabled(),true);assert.equal(await page.locator('#siGuardar').isDisabled(),true);
  await page.getByRole('button',{name:'Reintentar la misma revisión'}).click();
  await page.locator('#siEstado').filter({hasText:'Revisión guardada con responsable y fecha'}).waitFor();
  const calls=await page.evaluate(()=>window.revisionCalls);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal((await page.evaluate(()=>window.withdrawalCalls)).length,0);assert.equal((await page.evaluate(()=>window.uploads)).length,0);
  assert.match(await page.locator('#siResultados').textContent(),/Utilidad pendiente de retiro/);assert.match(await page.locator('#siRevisiones').textContent(),/Revisión registrada.*inventario anterior/s);
  await page.evaluate(()=>window.onlyLosses=true);await page.locator('#siActualizar').click();await page.locator('#siEstado').filter({hasText:'1 inventarios cerrados'}).waitFor();
  assert.equal(await page.locator('#siFuente').isDisabled(),true);assert.match(await page.locator('#siFuente').textContent(),/No hay inventarios con utilidad positiva/);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
