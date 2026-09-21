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
      window.counts={kora_incidents:2,traslados:6,gastos:4,aliados_gastos_operativos:1,financial_entries:2};
      window.writes=[];window.fail=false;
      window.sb={rpc:async()=>({data:true}),from(table){let count=false,update=false;const q={select(fields,options){count=!!options?.head;return q;},eq(){return q;},in(){return q;},is(){return q;},order(){return q;},limit(){return q;},update(){window.writes.push(table);update=true;return q;},then(ok,bad){return Promise.resolve(update?{error:null}:count?{count:window.fail&&table==='traslados'?null:window.counts[table],error:window.fail&&table==='traslados'?{message:'Network error'}:null}:{data:[{id:'n1',type:'incident_resolved',title:'Incidencia corregida',message:'Prueba',incident_id:'00000000-0000-0000-0000-000000000001',read_at:null,created_at:'2026-09-21T12:00:00Z'}],error:null}).then(ok,bad);}};return q;}};
    });
    await page.addScriptTag({content:await readFile('creditek/erp/kora-notifications.js','utf8')});
    await page.evaluate(()=>KoraNotifications.mount({sb,profile:{id:'a',activo:true,rol:'gerencia'}}));
    await page.waitForFunction(()=>document.querySelector('[data-kora-notification-count]').textContent==='18');
    await page.locator('[data-kora-notifications]').click();
    await page.locator('[data-kora-notifications-read-all]').click();
    assert.equal(await page.locator('[data-kora-notification-count]').textContent(),'17');
    assert.equal(await page.locator('[data-pending="transfers"]').count(),1);
    assert.deepEqual(await page.evaluate(()=>writes),['kora_notifications']);
    await page.evaluate(()=>{counts.traslados=0;document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));});
    await page.waitForFunction(()=>!document.querySelector('[data-pending="transfers"]'));
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
