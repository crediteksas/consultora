import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from '@playwright/test';

test('incidencia: detalle separado, campos completos y regreso conserva listado y filtros',async()=>{
 const browser=process.env.KORA_TEST_BROWSER==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});const external=[];
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname!=='kora.test'){if(/supabase|rest\/v1|auth\/v1/.test(url.href)||route.request().method()!=='GET')external.push(url.hostname);return route.abort();}
   const file=path.resolve(process.cwd(),'.'+url.pathname);if(!file.startsWith(process.cwd()+'/'))return route.abort();
   try{let body=await readFile(file);const ext=path.extname(file);
    if(ext==='.html')body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</head>','<link rel="stylesheet" href="/design-system/components/kora-incident-center.css"><script src="/design-system/components/kora-product.js" defer></script></head>');
    await route.fulfill({contentType:({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[ext]||'application/octet-stream',body});
   }catch{await route.fulfill({status:404,body:''});}
  });
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:900});await page.goto('https://kora.test/creditek/erp/incidencias.html');
   await page.evaluate(()=>{
    document.querySelector('#app').classList.remove('hidden');document.body.classList.add('kora-product-page');
    document.querySelector('[data-incident-list]').innerHTML='<tr><td><button id="synthetic-case">Caso ficticio</button></td><td>Nueva</td></tr>';
    document.querySelector('[data-detail-title]').textContent='KORA-PRUEBA · Incidencia ficticia para verificar el diseño';
    document.querySelector('[data-detail-content]').innerHTML='<p>Descripción de prueba con una referencia larga sin información real.</p><h3>Acción intentada</h3><p>Consultar una operación.</p>';
    document.querySelector('[data-incident-detail]').hidden=false;
    document.querySelector('[data-incident-comment-form]').hidden=false;
    document.querySelector('[data-detail-management]').hidden=false;
   });
   const search=page.locator('[data-incident-filter=code]');await search.evaluate(e=>e.value='filtro conservado');
   assert.equal(await search.isVisible(),false);assert.equal(await page.locator('[data-incident-list]').isVisible(),false);
   assert.equal(await page.locator('[data-incident-pagination]').isVisible(),false);
   assert.equal(await page.locator('[data-incident-detail]').isVisible(),true);
   const fields=await page.locator('[data-incident-comment-form] textarea,[data-incident-comment-form] input').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,width:innerWidth})));
   assert.ok(fields.every(f=>f.x>=0&&f.right<=f.width));
   assert.ok(await page.locator('[data-comment-text]').evaluate(e=>e.getBoundingClientRect().height)>=120);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('[data-incident-detail]').evaluate(e=>e.hidden=true);
   assert.equal(await search.isVisible(),true);assert.equal(await search.inputValue(),'filtro conservado');
   assert.equal(await page.locator('#synthetic-case').count(),1);assert.equal(await page.locator('[data-incident-pagination]').isVisible(),true);
   await page.locator('[data-incident-detail]').evaluate(e=>e.hidden=false);
   await page.locator('[data-incident-comment-form]').evaluate(e=>e.hidden=true);
   await page.locator('[data-detail-management]').evaluate(e=>e.hidden=true);
   assert.equal(await page.locator('[data-incident-comment-form]').isVisible(),false,'el CSS no revela el formulario sin permiso');
   assert.equal(await page.locator('[data-detail-management]').isVisible(),false,'el CSS no revela administración sin permiso');
  }
  assert.deepEqual(external,[],'sin intentos de llamadas ni escrituras de negocio; recursos externos bloqueados');
 }finally{await browser.close();}
});
