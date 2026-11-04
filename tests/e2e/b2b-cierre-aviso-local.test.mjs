import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,webkit} from '@playwright/test';
for(const [name,engine] of [['Chrome',chromium],['WebKit',webkit]])test('el bloqueo se explica junto al cierre · '+name,async()=>{
 const browser=await engine.launch(name==='Chrome'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<section id="cierre"></section>');
  await page.addScriptTag({content:await readFile('creditek/erp/b2b-cierres.js','utf8')});
  await page.evaluate(async()=>{
   window.KoraB2BComparativo={all:async()=>[]};
   const sb={rpc:async()=>({data:{pedidos:1,items:[{pedido_id:'x',numero:'PED-000017',tienda:'Chinucell',referencia:'Redmi 15C',cantidad:2,costo:null,precio:null,proveedor_id:null}]},error:null})};
   await KoraB2BCierres.mount({sb,container:document.querySelector('#cierre')});
  });
  assert.equal(await page.getByRole('button',{name:'Revisar y cerrar pedidos'}).isDisabled(),true);
  const status=page.locator('[data-status]');assert.match(await status.innerText(),/PED-000017.*Chinucell.*Redmi 15C/);
  assert.ok(await page.evaluate(()=>document.querySelector('[data-status]').compareDocumentPosition(document.querySelector('[data-orders]'))&Node.DOCUMENT_POSITION_FOLLOWING));
  await page.getByRole('button',{name:'Actualizar precios y pedidos'}).click();
  assert.match(await status.innerText(),/no se ha cerrado ni enviado/);
 }finally{await browser.close();}
});
