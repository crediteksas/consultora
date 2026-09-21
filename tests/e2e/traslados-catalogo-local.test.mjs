import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

test('000052: buscar y seleccionar el parlante 28 sin crear traslado',async()=>{
  const html=await readFile('creditek/erp/traslados.html','utf8');
  const source=html.slice(html.indexOf('function agregarItemAccesorioTra()'),html.indexOf('async function renderItemsTraslado()'));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:694}});
    await page.setContent('<style>.buscador-resultados{max-height:180px;overflow-y:auto}.buscador-resultados button{display:block;width:100%;padding:12px}</style><div id="itemsTrasladoContainer"></div>');
    await page.evaluate(source=>{
      window.productosCache=Array.from({length:28},(_,i)=>({id:String(i),codigo:`P${i}`,nombre:`PARLANTE ${i+1}`,tipo:'cantidad'}));
      window.itemsTraslado=[];
      window.escapeHtml=s=>s;
      window.renderItemsTraslado=()=>{};
      window.eval(source);
      window.agregarItemAccesorioTra();
    },source);
    await page.locator('input').fill('parlante');
    assert.equal(await page.locator('button[data-id]').count(),28);
    assert.match(await page.locator('[role=status]').textContent(),/28 coincidencias/);
    await page.locator('button[data-id="27"]').click();
    assert.equal(await page.evaluate(()=>itemsTraslado[0].producto_id),'27');
    for(const size of [{width:390,height:844},{width:1366,height:694}]){
      await page.setViewportSize(size);
      await page.evaluate(()=>{document.getElementById('itemsTrasladoContainer').innerHTML='';agregarItemAccesorioTra();});
      await page.locator('input').fill('P27');
      assert.equal(await page.locator('button[data-id]').count(),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
  }finally{await browser.close();}
});
