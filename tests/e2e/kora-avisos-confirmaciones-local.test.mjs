import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

async function boot(browser,{hold=false,failAfterSave=false,mountBell=true}={}){
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.clock.install({time:new Date('2026-10-18T18:00:00Z')});
 const html=(await readFile('creditek/erp/confirmaciones-deuda.html','utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'').replace('<main class="main-content">','<main class="main-content"><button data-kora-notifications>Campana</button>');
 await page.route('https://kora.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('https://kora.test/creditek/erp/confirmaciones-deuda.html#diferenciasPendientes');
 await page.addStyleTag({content:await readFile('design-system/components/kora-incident-center.css','utf8')});
 await page.evaluate(({hold,failAfterSave})=>{
  window.calls=[];window.refreshes=0;window.releaseRead=null;window.holdRead=hold;window.failReads=false;window.failSave=false;window.failAfterSave=failAfterSave;
  window.payload={diarias:[
   {tienda:'Tienda A',administrador:'Persona A',confirmacion:{saldo_sistema:100,saldo_declarado:100,diferencia:0,confirmado_at:'2026-10-18T13:00:00Z'}},
   {tienda:'Tienda B',administrador:'Persona B',confirmacion:null},
   {tienda:'Tienda C',administrador:'Persona C',confirmacion:null}
  ],diferencias:Array.from({length:4},(_,i)=>({id:'reporte-'+i,tienda:i<3?'Tienda A':'Tienda Z',administrador:i<3?'Persona A':'Persona Z',fecha:'2026-10-'+(15+i%3),saldo_sistema:100,saldo_declarado:105,diferencia:5,observacion:'Comprobante por revisar'}))};
  const rpc=async(name,args)=>{
   calls.push({name,args});
   if(name==='listar_confirmaciones_deuda'){
    if(failReads)return {error:{message:'Lectura sin conexión'}};
    const data=args.p_fecha==='2026-10-17'?{diarias:[{tienda:'Solo día anterior',administrador:'Persona anterior',confirmacion:null}],diferencias:[]}:structuredClone(payload);
    if(holdRead){holdRead=false;return new Promise(resolve=>{releaseRead=()=>resolve({data});});}
    return {data};
   }
   if(name==='revisar_confirmacion_deuda'){
    if(failSave)return {error:{message:'Revisión denegada'}};
    payload.diferencias=payload.diferencias.filter(c=>c.id!==args.p_id);
    if(failAfterSave)failReads=true;
    return {data:null};
   }
   if(['inventario_fotos_pendientes_cantidad','conteos_pendientes_cantidad'].includes(name))return {data:0};
   if(['es_controlador_financiero','puede_autorizar_venta_excepcional'].includes(name))return {data:false};
   throw Error('RPC inesperada '+name);
  };
  window.sb={auth:{getSession:async()=>({data:{session:{user:{id:'gerente-ficticio'}}}})},rpc,from(){let head=false;const q={select(_fields,options){head=!!options?.head;return q;},in(){return q;},eq(){return q;},is(){return q;},order(){return q;},limit(){return q;},then(ok,bad){return Promise.resolve(head?{count:0}:{data:[]}).then(ok,bad);}};return q;}};
  window.__KORA_ENV__={};window.supabase={createClient:()=>sb};
  document.addEventListener('kora-notifications-refresh',()=>refreshes++);
 },{hold,failAfterSave});
 await page.addScriptTag({content:await readFile('creditek/erp/confirmaciones-deuda-gestion.js','utf8')});
 if(mountBell){
  await page.addScriptTag({content:await readFile('creditek/erp/kora-notifications.js','utf8')});
  await page.evaluate(()=>KoraNotifications.mount({sb,profile:{id:'gerente-ficticio',rol:'gerencia',activo:true}}));
 }
 return page;
}

test('campana y pantalla distinguen 2 sin confirmar de 4 reportes de dos tiendas; revisar retira solo el aviso elegido',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await boot(browser);
  await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='6');
  assert.match(await page.locator('#resumenDiarias').textContent(),/2 sin confirmar/);
  assert.match(await page.locator('#resumenDiferencias').textContent(),/4 reportes por revisar · 2 tiendas/);
  assert.equal(await page.locator('#diferencias form').count(),4);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'diferenciasPendientes');
  await page.locator('[data-kora-notifications]').click();
  assert.match(await page.locator('[data-pending="store-debt-confirmations"]').textContent(),/^2 · Tiendas sin confirmar/);
  assert.match(await page.locator('[data-pending="store-debt-differences"]').textContent(),/^4 · Reportes de diferencias/);
  assert.match(await page.locator('[data-pending="store-debt-differences"]').textContent(),/Incluye días anteriores/);
  await page.keyboard.press('Escape');
  const form=page.locator('#diferencias form').first();
  await form.locator('textarea').fill('Revisión realizada; documento conciliado.');await form.locator('button').click();
  await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='5');
  assert.equal(await page.locator('#diferencias form').count(),3);
  assert.equal(await page.evaluate(()=>refreshes),1);
  assert.deepEqual(await page.evaluate(()=>calls.filter(c=>c.name==='revisar_confirmacion_deuda').map(c=>c.args.p_id)),['reporte-0']);
  await page.evaluate(()=>{payload.diarias[0].confirmacion.diferencia=5;payload.diarias[0].confirmacion.revisado_at='2026-10-18T14:00:00Z';});
  await page.locator('#actualizar').click();
  await page.waitForFunction(()=>document.querySelector('#filas').textContent.includes('Diferencia revisada'));
  for(const viewport of [{width:390,height:700},{width:1280,height:800}]){
   await page.setViewportSize(viewport);await page.locator('[data-kora-notifications]').click();
   assert.ok(await page.locator('.kora-notifications-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}));
   await page.screenshot({path:viewport.width===390?'/private/tmp/kora-avisos-movil-20261018.png':'/private/tmp/kora-avisos-desktop-20261018.png'});
   await page.keyboard.press('Escape');
  }
 }finally{await browser.close();}
});

test('guardado refresca avisos aunque falle recarga; una revisión rechazada no borra ni notifica',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await boot(browser,{failAfterSave:true});
  await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='6');
  await page.locator('#diferencias textarea').first().fill('Revisado por Gestión, resuelto.');await page.locator('#diferencias form button').first().click();
  await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='!');
  assert.equal(await page.evaluate(()=>refreshes),1);assert.equal(await page.evaluate(()=>payload.diferencias.length),3);
  assert.match(await page.locator('#estado').textContent(),/No se pudo consultar/);
  assert.match(await page.locator('[data-pending="store-debt-differences"]').textContent(),/Por comprobar/);
  await page.close();
  const denied=await boot(browser);await denied.waitForSelector('#diferencias form');
  await denied.evaluate(()=>{failSave=true;});
  await denied.locator('#diferencias textarea').first().fill('Esta operación será rechazada.');await denied.locator('#diferencias form button').first().click();
  await denied.waitForFunction(()=>document.querySelector('#diferencias').textContent.includes('Revisión denegada'));
  assert.equal(await denied.evaluate(()=>refreshes),0);assert.equal(await denied.evaluate(()=>payload.diferencias.length),4);
 }finally{await browser.close();}
});

test('cambio de fecha durante una consulta no muestra la respuesta anterior; consulta colgada permite reintentar',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await boot(browser,{hold:true,mountBell:false});
  await page.waitForFunction(()=>!!releaseRead);
  await page.locator('#fecha').fill('2026-10-17');await page.locator('#fecha').dispatchEvent('change');
  await page.evaluate(()=>releaseRead());
  await page.waitForFunction(()=>document.querySelector('#filas').textContent.includes('Solo día anterior'));
  assert.doesNotMatch(await page.locator('#filas').textContent(),/Tienda A/);assert.match(await page.locator('#estado').textContent(),/2026-10-17/);
  await page.close();
  const slow=await boot(browser,{hold:true,mountBell:false});await slow.waitForFunction(()=>!!releaseRead);
  await slow.clock.fastForward(16000);
  await slow.waitForFunction(()=>document.querySelector('#estado').textContent.includes('tardó demasiado'));
  assert.equal(await slow.locator('#actualizar').isEnabled(),true);
  await slow.locator('#actualizar').click();await slow.waitForSelector('#diferencias form');
  assert.equal(await slow.locator('#diferencias form').count(),4);
 }finally{await browser.close();}
});
