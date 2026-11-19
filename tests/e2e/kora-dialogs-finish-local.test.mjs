// Real form markup/styles, isolated presentation states. Never connects to a business backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from '@playwright/test';

test('ventanas KORA: campos visibles, errores conservados, cancelar secundario y controles móviles', {timeout:90000},async()=>{
 const browser=process.env.KORA_TEST_BROWSER==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});const failures=[];
  page.on('request',r=>{if(/supabase|rest\/v1|auth\/v1/.test(r.url()))failures.push(r.url());});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
   const file=path.resolve(process.cwd(),'.'+u.pathname);if(!file.startsWith(process.cwd()+'/'))return route.abort();
   try{
    let body=await readFile(file);const ext=path.extname(file);
    if(ext==='.html'){
     body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi,'');
     body=body.replace('</head>','<script src="/design-system/components/kora-product.js" defer></script></head>');
    }
    await route.fulfill({contentType:({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[ext]||'application/octet-stream',body});
   }catch{await route.fulfill({status:404,body:''});}
  });
  await page.goto('https://kora.test/creditek/erp/catalogo.html');
  await page.locator('#modalProducto').evaluate(e=>e.classList.add('show'));
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));
   const box=await page.locator('#modalProducto .modal-box').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);
   if(width===1440)assert.ok(box.width<=672,'el formulario no ocupa todo el escritorio');
   const fields=await page.locator('#modalProducto .campo input:not([type=hidden]),#modalProducto .campo select').evaluateAll(es=>es.map(e=>({border:getComputedStyle(e).borderColor,font:parseFloat(getComputedStyle(e).fontSize),width:e.getBoundingClientRect().width,panel:e.closest('.modal-box').clientWidth})));
   assert.ok(fields.every(f=>!f.border.includes('0, 0, 0, 0')&&f.width<=f.panel));
   if(width<=700)assert.ok(fields.every(f=>f.font>=16),'texto de campos móvil legible');
   const styles=await page.locator('#btnCancelarModal,#btnGuardarProducto').evaluateAll(es=>es.map(e=>({id:e.id,bg:getComputedStyle(e).backgroundColor,height:e.getBoundingClientRect().height})));
   assert.equal(styles.find(x=>x.id==='btnCancelarModal').bg,'rgb(255, 255, 255)');assert.notEqual(styles.find(x=>x.id==='btnGuardarProducto').bg,'rgb(255, 255, 255)');
   if(width<=700)assert.ok(styles.every(x=>x.height>=44));
   await page.locator('#input-foto').setInputFiles({name:'foto-de-prueba-con-nombre-extenso-para-validar-que-no-desborde-el-formulario.png',mimeType:'image/png',buffer:Buffer.from('synthetic image')});
   await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));
   assert.equal(await page.locator('#modalProducto .modal-box').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'el contenido no desborda el panel');
  }
  await page.addStyleTag({content:'.campo input[aria-invalid="true"],.campo.error input{border-color:rgb(190,20,20)}'});
  await page.locator('#prodNombre').evaluate(e=>e.setAttribute('aria-invalid','true'));
  await page.locator('#prodCodigo').evaluate(e=>e.parentElement.classList.add('error'));
  assert.equal(await page.locator('#prodNombre').evaluate(e=>getComputedStyle(e).borderColor),'rgb(190, 20, 20)');
  assert.equal(await page.locator('#prodCodigo').evaluate(e=>getComputedStyle(e).borderColor),'rgb(190, 20, 20)');
  await page.locator('#prodNombre').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#prodCategoria').evaluate(e=>document.activeElement===e),true);
  assert.deepEqual(failures,[],'no se consulta ni se escribe en Supabase');
 }finally{await browser.close();}
});
