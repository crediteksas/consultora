import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from '@playwright/test';
for(const engine of ['chromium','webkit'])test(`Novedades: ejecutivo y Retail reales, con perfil Gestión y responsive ${engine}`,async()=>{
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 try{
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const f=resolve(process.cwd(),'.'+u.pathname);if(!f.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   window.testCalls=[];window.testFail=false;window.testStale=false;window.testFrozen=false;window.testPlatform='alo';
   const masters={};
   const operations=['FULL ACCESORIOS LA 72','Comercio con clasificación pendiente'].map((name,i)=>({id:'op'+i,liquidation_id:'alo',plataforma:'alo',reconocida:true,establishment_name:name,referencia:'Equipo 128GB',origen_codigo:'LOCAL-'+i,tipo_establecimiento:'aliado',operation_at:'2026-09-03',monto_credito:900000,inicial:100000,ejecutivo_id:null}));
   const incidents=operations.flatMap(op=>['aliado_sin_ejecutivo','beneficiario_sin_identificacion'].map(tipo=>({id:op.id+tipo,liquidation_id:'alo',operation_id:op.id,tipo,estado:'abierta',bloquea_aprobacion:false,descripcion:tipo,liquidation_operations:op})));
   const pending=()=>window.testStale?[]:operations.filter(op=>op.tipo_establecimiento==='aliado').map(op=>({id:op.id,liquidation_id:'alo',origen_codigo:op.origen_codigo,comercio:op.establishment_name,ejecutivo_actual:masters[op.origen_codigo]||null,falta_ejecutivo:!masters[op.origen_codigo]}));
   const sb={auth:{getSession:async()=>({data:{session:{user:{id:'gestion'}}}})},from(table){let filters=[],single=false;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},range(){return q},maybeSingle(){single=true;return q},then(ok,bad){
    let data=table==='aliados_operadores'?[{capacidad:'revisor'}]:table==='liquidations'?[{id:'alo',plataforma:window.testPlatform,estado:window.testFrozen?'aprobada':'calculada',frozen_at:window.testFrozen?'2026-09-07':null,fecha_corte:'2026-09-06',imported_at:'2026-09-07',liquidation_operations:operations}]:table==='liquidation_operations'?operations:table==='liquidation_incidents'?incidents:table==='ejecutivos'?[{id:'exec-1',nombre:'Ejecutivo de prueba',activo:true}]:table==='origenes'?[{codigo:'CK-11',nombre:'Creditel Coveñas',activo:true,tipo:'propia'},{codigo:'CK-01',nombre:'Celfiao Tolú',activo:true,tipo:'propia'},{codigo:'ALIADO-X',nombre:'No es Retail',activo:true,tipo:'aliado'}]:[];
    if(table==='liquidations')Object.assign(data[0],{total_pago_aliados:2103100,total_bonos:120000,total_utilidad:1074100,total_pagar:3148100});
    if(table==='liquidations'&&window.testHistory)data=Array.from({length:7},(_,i)=>({...data[0],id:'history'+i,approved_at:'2026-09-0'+(i+1),fecha_corte:'2026-09-0'+(i+1)}));
    data=data.filter(r=>filters.every(([k,v])=>r[k]===undefined||r[k]===v));return Promise.resolve({data:single?data[0]:data}).then(ok,bad);
   }};return q},async rpc(name,params){
    window.testCalls.push({name,params});if(name==='tiene_capacidad_aliados')return {data:true};
    if(name==='tesoreria_pendientes_liquidacion')return {data:pending()};
    if(name==='aliados_contextos_precios_krediya')return {data:[]};
    if(name==='tesoreria_asignar_ejecutivo'){if(window.testFail)return {error:{message:'El ejecutivo cambió. Actualiza antes de guardar'}};masters[params.p_origen]=params.p_ejecutivo;return {data:{ok:true}};}
    if(name==='aliados_calcular_liquidacion'){operations.forEach(op=>{op.ejecutivo_id=masters[op.origen_codigo]||null});incidents.forEach(i=>{if(i.tipo==='aliado_sin_ejecutivo'&&i.liquidation_operations.ejecutivo_id)i.estado='resuelta'});return {data:{}};}
    if(name==='tesoreria_vincular_operacion_retail'){
      if(window.testFail)return {error:{message:'El lote ya tiene pagos en gestión'}};
      const op=operations.find(o=>o.id===params.p_operation_id);op.tipo_establecimiento='propia';op.origen_codigo=params.p_retail;op.ejecutivo_id=null;incidents.filter(i=>i.operation_id===op.id).forEach(i=>i.estado='resuelta');
      return {data:{ok:true,tipo:'propia',nombre:'Creditel Coveñas',origen_codigo:params.p_retail}};
    }
    throw Error('RPC inesperado: '+name);
   }};window.creditekSidebar={sb,perfil:{rol:'auditoria'}};
  });
  await page.goto('https://kora.test/creditek/erp/aliados-liquidaciones.html');await page.evaluate(()=>document.getElementById('app').classList.remove('hidden'));
  await page.locator('#batches small').first().waitFor();
  // Las etiquetas provisionales no pueden pegarse al importe ni invadir otra columna.
  for(const width of [390,768,1128,1255,1440]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.locator('#batches small').evaluateAll(labels=>labels.every(label=>{
    const cell=label.parentElement,range=document.createRange();range.selectNodeContents(cell.firstChild);
    const amount=range.getBoundingClientRect(),note=label.getBoundingClientRect(),box=cell.getBoundingClientRect();
    return note.top>=amount.bottom && note.right<=box.right+1 && note.left>=box.left-1;
   })),`Provisional debe quedar debajo y dentro de su celda a ${width}px`);
  }
  await page.screenshot({path:`/private/tmp/liquidaciones-provisional-${engine}.png`,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-open=alo]').click();
  await page.getByRole('button',{name:'Asignar ejecutivos',exact:true}).click();
  await page.getByRole('heading',{name:'Estas tiendas no tienen ejecutivo'}).waitFor();
  assert.equal(await page.locator('dialog select').count(),2);
  assert.ok(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:`/private/tmp/liquidaciones-asignacion-compacta-${engine}.png`});
  await page.locator('dialog [data-close]').click();await page.locator('[data-tab=incidents]').click();
  assert.equal(await page.getByRole('button',{name:'Revisar y justificar'}).count(),0);
  assert.match(await page.getByRole('link',{name:'Completar cliente y cuenta'}).first().getAttribute('href'),/origen=LOCAL-0/);
  await page.getByRole('button',{name:'Asignar ejecutivo',exact:true}).first().click();
  const select=page.getByLabel('Ejecutivo o Retail',{exact:true});await select.waitFor();assert.equal(await select.inputValue(),'');
  assert.match(await select.textContent(),/Retail · tienda propia/);assert.match(await select.textContent(),/Ejecutivo de prueba/);
  await select.selectOption('retail');assert.equal(await page.getByLabel('Tienda propia',{exact:true}).inputValue(),'');
  assert.doesNotMatch(await page.getByLabel('Tienda propia',{exact:true}).textContent(),/No es Retail/);
  for(const size of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1280,height:900}]){
   await page.setViewportSize(size);assert.ok(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'desborde '+JSON.stringify(size));
  }
  await select.selectOption('exec-1');await page.evaluate(()=>window.testFail=true);await page.getByRole('button',{name:'Guardar ejecutivo',exact:true}).click();
  await page.locator('dialog [role=alert]').filter({hasText:'El ejecutivo cambió'}).waitFor();assert.equal(await select.inputValue(),'exec-1');
  await page.evaluate(()=>window.testFail=false);await page.getByRole('button',{name:'Guardar ejecutivo',exact:true}).click();await page.locator('dialog [role=status]').filter({hasText:'Ejecutivo guardado'}).waitFor();
  assert.equal(await page.evaluate(()=>window.testCalls.filter(c=>c.name==='aliados_calcular_liquidacion').length),0);
  await page.locator('dialog [data-close]').click();await page.getByRole('button',{name:'Asignar ejecutivo',exact:true}).first().click();
  await page.locator('dialog [role=status]').filter({hasText:'Ejecutivo ya registrado'}).waitFor();assert.equal(await page.locator('dialog select').count(),0);
  await page.locator('dialog [data-recalculate]').click();await page.waitForFunction(()=>window.testCalls.some(c=>c.name==='aliados_calcular_liquidacion'));
  await page.locator('[data-tab=incidents]').click();await page.getByRole('button',{name:'Asignar ejecutivo',exact:true}).waitFor();
  // El servidor puede rechazar un pendiente que acaba de cambiar: sin escritura ni justificación.
  await page.evaluate(()=>window.testStale=true);await page.getByRole('button',{name:'Asignar ejecutivo',exact:true}).click();
  await page.locator('dialog [role=alert]').filter({hasText:'dejó de ser editable'}).waitFor();assert.equal(await page.locator('dialog select').count(),0);
  await page.locator('dialog [data-close]').click();await page.evaluate(()=>window.testStale=false);
  // En Krediya tampoco se esconde la asignación detrás de la etiqueta de seguimiento.
  await page.evaluate(()=>window.testPlatform='krediya');await page.locator('[data-open=alo]').click();await page.locator('[data-tab=incidents]').click();
  await page.getByRole('button',{name:'Asignar ejecutivo',exact:true}).click();await select.selectOption('retail');
  await page.getByLabel('Tienda propia',{exact:true}).selectOption('CK-11');await page.locator('dialog [name=verified]').check();
  await page.evaluate(()=>window.testFail=true);await page.getByRole('button',{name:'Guardar Retail y recalcular lote'}).click();
  await page.locator('dialog [role=alert]').filter({hasText:'pagos en gestión'}).waitFor();assert.equal(await page.getByLabel('Tienda propia',{exact:true}).inputValue(),'CK-11');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`/private/tmp/novedades-ejecutivo-retail-${engine}.png`});
  await page.evaluate(()=>window.testFail=false);await page.getByRole('button',{name:'Guardar Retail y recalcular lote'}).click();
  await page.locator('dialog [role=status]').filter({hasText:'Cálculo del lote actualizado'}).waitFor();await page.locator('dialog [data-close]').click();
  assert.equal(await page.getByRole('button',{name:'Asignar ejecutivo',exact:true}).count(),0);
  await page.evaluate(()=>window.testFrozen=true);await page.locator('#refreshBatches').click();await page.locator('#showHistory').click();await page.locator('[data-open=alo]').click();await page.locator('[data-tab=incidents]').click();
  assert.equal(await page.locator('#approve').isVisible(),false);
  assert.equal(await page.locator('#calculate').isVisible(),false);
  assert.equal(await page.locator('#review').isVisible(),false);
  assert.match(await page.locator('#showPending').textContent(),/\(0\)/);
  assert.equal(await page.getByRole('link',{name:'Completar cliente y cuenta'}).count(),0);
  const calls=await page.evaluate(()=>window.testCalls);
  assert.deepEqual(calls.find(c=>c.name==='tesoreria_asignar_ejecutivo').params,{p_origen:'LOCAL-0',p_anterior:null,p_ejecutivo:'exec-1'});
  assert.deepEqual(calls.find(c=>c.name==='tesoreria_vincular_operacion_retail').params,{p_operation_id:'op1',p_origen_anterior:'LOCAL-1',p_retail:'CK-11'});
  assert.ok(calls.every(c=>['tiene_capacidad_aliados','tesoreria_pendientes_liquidacion','tesoreria_asignar_ejecutivo','aliados_calcular_liquidacion','aliados_contextos_precios_krediya','tesoreria_vincular_operacion_retail'].includes(c.name)));
  await page.evaluate(()=>window.testHistory=true);await page.locator('#refreshBatches').click();await page.locator('#showPending').click();
  assert.equal(await page.locator('[data-recent]').count(),4);
  assert.equal(await page.locator('#recentBatches').isVisible(),true);
  await page.locator('#recentBatches').scrollIntoViewIfNeeded();
  await page.screenshot({path:`/private/tmp/liquidaciones-cuatro-recientes-${engine}.png`});
  await page.locator('#showHistory').click();await page.locator('#historyFrom').fill('2026-09-05');await page.locator('#historyUntil').fill('2026-09-06');await page.locator('#historyUntil').blur();
  assert.equal(await page.locator('#batches [data-open]').count(),2);
  const download=page.waitForEvent('download');await page.locator('#downloadHistory').click();assert.equal((await download).suggestedFilename(),'rentabilidad-liquidaciones.csv');
  assert.deepEqual(errors,[]);
 }catch(error){console.error('Dialog:',await page.locator('dialog').allTextContents(),'Page errors:',errors);throw error;}finally{await browser.close();}
});
