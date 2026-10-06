import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
test('campana conserva trámites al leer avisos y actualiza estados sin mutar documentos',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:694}});
    await page.setContent('<button data-kora-notifications>Campana</button>');
    await page.addStyleTag({content:await readFile('design-system/components/kora-incident-center.css','utf8')});
    await page.evaluate(()=>{
      window.counts={kora_incidents:2,traslados:6,gastos:4,aliados_gastos_operativos:1,financial_entries:2,ventas_autorizaciones:3};
      window.writes=[];window.fail=false;
      window.sb={rpc:async name=>({data:['conteos_pendientes_cantidad','inventario_fotos_pendientes_cantidad'].includes(name)?0:true}),from(table){let count=false,update=false;const q={select(fields,options){count=!!options?.head;return q;},eq(){return q;},in(){return q;},is(){return q;},order(){return q;},limit(){return q;},update(){window.writes.push(table);update=true;return q;},then(ok,bad){return Promise.resolve(update?{error:null}:count?{count:window.fail&&table==='traslados'?null:window.counts[table],error:window.fail&&table==='traslados'?{message:'Network error'}:null}:{data:[{id:'n1',type:'incident_resolved',title:'Incidencia corregida',message:'Prueba',incident_id:'00000000-0000-0000-0000-000000000001',read_at:null,created_at:'2026-09-21T12:00:00Z'}],error:null}).then(ok,bad);}};return q;}};
    });
    await page.addScriptTag({content:await readFile('creditek/erp/kora-notifications.js','utf8')});
    await page.evaluate(()=>KoraNotifications.mount({sb,profile:{id:'a',activo:true,rol:'gerencia'}}));
    await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='20');
    assert.match(await page.locator('[data-kora-notifications-summary]').textContent(),/20 pendientes · 1 avisos sin leer/);
    await page.locator('[data-kora-notifications]').click();
    await page.locator('[data-kora-notifications-read-all]').click();
    assert.equal(await page.locator('[data-kora-notification-count]').textContent(),'20');
    assert.equal(await page.locator('[data-pending="transfers"]').count(),1);
    assert.equal(await page.locator('[data-pending="sales-approval"]').count(),1);
    assert.deepEqual(await page.evaluate(()=>writes),['kora_notifications']);
    await page.evaluate(()=>{counts.traslados=0;document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));});
    await page.waitForFunction(()=>!document.querySelector('[data-pending="transfers"]'));
    await page.evaluate(()=>{counts.ventas_autorizaciones=0;document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));});
    await page.waitForFunction(()=>!document.querySelector('[data-pending="sales-approval"]'));
    assert.equal(await page.locator('[data-pending="store-expenses"]').count(),1,'conserva los otros trámites');
    await page.evaluate(()=>{fail=true;document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));});
    await page.waitForFunction(()=>document.querySelector('[data-kora-notifications-status]').dataset.kind==='error');
    assert.match(await page.locator('[data-kora-notifications-summary]').textContent(),/incompleta/);
    for(const size of [{width:390,height:600},{width:1366,height:694}]){
      await page.setViewportSize(size);
      assert.ok(await page.locator('.kora-notifications-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}));
      await page.locator('.kora-notifications-list button').last().scrollIntoViewIfNeeded();
    }
    assert.deepEqual(await page.evaluate(()=>writes),['kora_notifications']);
  }finally{await browser.close();}
});

test('ventas en campana: permiso del servidor, error visible y enlace directo sin autorizar',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const rol of ['gerencia','auditoria']){
      const page=await browser.newPage({viewport:{width:390,height:700}});
      await page.route('https://kora.test/**',route=>route.fulfill({contentType:'text/html',body:'<button data-kora-notifications>Campana</button><h2 id="tituloAutorizaciones">Autorizaciones de ventas</h2>'}));
      await page.goto('https://kora.test/creditek/erp/ventas.html');
      await page.evaluate(()=>{
        window.allowed=false;window.failPermission=false;window.failCount=false;window.calls=[];
        window.sb={rpc:async name=>{
          calls.push(name);
          if(name==='puede_autorizar_venta_excepcional')return failPermission?{error:{message:'Error de permiso'}}:{data:allowed};
          if(name==='es_controlador_financiero')return {data:false};
          if(['conteos_pendientes_cantidad','inventario_fotos_pendientes_cantidad'].includes(name))return {data:0};
          throw new Error('RPC de escritura no permitido');
        },from(table){calls.push(table);let count=false;const q={
          select(_fields,options){count=!!options?.head;return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},
          then(ok,bad){return Promise.resolve(count?(table==='ventas_autorizaciones'&&failCount?{error:{message:'Sin conexión'}}:{count:table==='ventas_autorizaciones'?1:0}):{data:[]}).then(ok,bad);}
        };return q;}};
      });
      await page.addScriptTag({content:await readFile('creditek/erp/kora-notifications.js','utf8')});
      await page.evaluate(rol=>KoraNotifications.mount({sb,profile:{id:'usuario',activo:true,rol}}),rol);
      await page.waitForFunction(()=>document.querySelector('[data-kora-notifications-summary]').textContent==='Sin pendientes ni avisos nuevos');
      assert.equal(await page.evaluate(()=>calls.includes('ventas_autorizaciones')),false);
      await page.evaluate(()=>{failPermission=true;document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));});
      await page.waitForFunction(()=>document.querySelector('[data-kora-notifications-status]').dataset.kind==='error');
      assert.equal(await page.locator('[data-kora-notification-count]').textContent(),'!');
      await page.evaluate(()=>{failPermission=false;allowed=true;document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));});
      await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='1');
      await page.locator('[data-kora-notifications]').click();
      const sale=page.locator('[data-pending="sales-approval"]');
      assert.match(await sale.textContent(),/1 · Ventas bajo costo u obsequios por autorizar/);
      await page.evaluate(()=>{failCount=true;document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));});
      await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='1+');
      assert.equal(await sale.count(),1,'un error no borra la alerta anterior');
      await sale.click();
      await page.waitForURL('https://kora.test/creditek/erp/ventas.html#tituloAutorizaciones');
      assert.equal(await page.evaluate(()=>calls.some(n=>n==='resolver_autorizacion_venta')),false);
      await page.close();
    }
  }finally{await browser.close();}
});

test('aprobación, pago y cierre sincronizan dos ventanas; avisos históricos no inflan pendientes',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const rows={gastos:Array.from({length:3},()=>({estado:'registrado'})),
    financial_entries:[{status:'pendiente_aprobacion'},{status:'pendiente_aprobacion'},{status:'aprobado'}],
    kora_incidents:[{status:'nuevo'},{status:'pendiente_validacion'}]};
  const writes=[];
  try{
    const context=await browser.newContext();
    await context.route('https://kora.test/**',route=>route.fulfill({contentType:'text/html',body:'<button data-kora-notifications>Campana</button>'}));
    const pages=[];
    for(let i=0;i<2;i++){
      const page=await context.newPage();pages.push(page);
      await page.exposeFunction('readPendingRows',(table,filters)=>({count:(rows[table]||[]).filter(r=>filters.every(([method,k,v])=>method==='in'?v.includes(r[k]):r[k]===v)).length}));
      await page.exposeFunction('unexpectedWrite',table=>writes.push(table));
      await page.goto('https://kora.test/creditek/erp/app.html');
      await page.evaluate(()=>{
        window.sb={rpc:async name=>({data:['conteos_pendientes_cantidad','inventario_fotos_pendientes_cantidad'].includes(name)?0:true}),from(table){let count=false;const filters=[];const q={
          select(_fields,options){count=!!options?.head;return q;},eq(k,v){filters.push(['eq',k,v]);return q;},in(k,v){filters.push(['in',k,v]);return q;},order(){return q;},limit(){return q;},
          update(){unexpectedWrite(table);return q;},
          then(ok,bad){return (count?readPendingRows(table,filters):Promise.resolve({data:[{id:'aviso-viejo',type:'incident_assigned',title:'Incidencia ya cerrada',message:'Historial',incident_id:'00000000-0000-0000-0000-000000000001',created_at:'2026-09-21T12:00:00Z',read_at:null}]})).then(ok,bad);}
        };return q;}};
      });
      await page.addScriptTag({content:await readFile('creditek/erp/kora-notifications.js','utf8')});
      await page.evaluate(()=>KoraNotifications.mount({sb,profile:{id:'gerente',activo:true,rol:'gerencia'}}));
      await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='8');
    }
    const refresh=async()=>{
      await pages[0].evaluate(()=>document.dispatchEvent(new CustomEvent('kora-notifications-refresh')));
    };
    rows.financial_entries.forEach(r=>r.status='aprobado');await refresh();
    for(const page of pages){
      await page.waitForFunction(()=>!document.querySelector('[data-pending="financial-approval"]')&&document.querySelector('[data-pending="financial-payment"]')?.textContent.startsWith('3 ·'));
      assert.equal(await page.locator('[data-kora-notification-count]').textContent(),'8','aprobar pasa a pago pendiente, no crea ni duplica trámites');
      assert.match(await page.locator('[data-pending="financial-payment"]').textContent(),/no necesitan otra aprobación/);
    }
    rows.financial_entries.forEach(r=>r.status='pagado');await refresh();
    for(const page of pages)await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='5');
    rows.gastos.forEach(r=>r.estado='aprobado');await refresh();
    for(const page of pages)await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='2');
    rows.kora_incidents.forEach(r=>r.status='corregido');await refresh();
    for(const page of pages){
      await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').hidden);
      assert.match(await page.locator('[data-kora-notifications-summary]').textContent(),/0 pendientes · 1 avisos sin leer/);
      assert.match(await page.locator('[data-kora-notifications-list]').textContent(),/Historial de avisos/);
      assert.equal(await page.locator('[data-pending]').count(),0);
    }
    assert.deepEqual(writes,[],'sin aprobar, pagar, cerrar ni marcar leído ningún registro');
  }finally{await browser.close();}
});

test('no pierde actualizaciones durante una consulta en vuelo y vuelve a consultar al regresar',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<button data-kora-notifications>Campana</button>');
    await page.evaluate(()=>{
      window.expenses=2;window.rounds=0;window.release=null;window.hold=true;
      window.sb={rpc:async()=>({data:false}),from(table){let count=false;const q={
        select(_fields,options){count=!!options?.head;return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},
        then(ok,bad){const result=count?{count:table==='gastos'?expenses:0}:{data:[]};
          if(table==='gastos'){rounds++;if(hold){hold=false;return new Promise(resolve=>{release=()=>resolve(result);}).then(ok,bad);}}
          return Promise.resolve(result).then(ok,bad);
        }
      };return q;}};
    });
    await page.addScriptTag({content:await readFile('creditek/erp/kora-notifications.js','utf8')});
    await page.evaluate(()=>KoraNotifications.mount({sb,profile:{id:'gerente',activo:true,rol:'gerencia'}}));
    await page.waitForFunction(()=>!!release);
    await page.evaluate(()=>{expenses=0;document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));release();});
    await page.waitForFunction(()=>rounds>=2&&document.querySelector('[data-kora-notifications-summary]').textContent==='Sin pendientes ni avisos nuevos');
    await page.evaluate(()=>{expenses=1;window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='1');
    await page.evaluate(()=>{expenses=0;window.dispatchEvent(new Event('online'));});
    await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').hidden);
  }finally{await browser.close();}
});
