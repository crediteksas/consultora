import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

async function boot(browser){
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const html=(await readFile('creditek/erp/confirmaciones-deuda.html','utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
 await page.route('**/*',route=>route.abort());
 await page.route('https://kora.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('https://kora.test/creditek/erp/confirmaciones-deuda.html');
 await page.evaluate(()=>{
  window.calls=[];window.fail=false;window.hold=false;window.releaseRead=null;
  window.rows=[{tienda:'Tienda A',administrador:'Persona A',confirmacion:{saldo_sistema:100.20,saldo_declarado:90.10,diferencia:-10.10,confirmado_at:'2026-10-19T13:00:00Z'}},
   {tienda:'Tienda B',administrador:'Persona B',confirmacion:{saldo_sistema:'20.60',saldo_declarado:'20.60',diferencia:0,confirmado_at:'2026-10-19T13:01:00Z'}}];
  window.__KORA_ENV__={};window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'usuario-ficticio'}}}})},rpc:async(name,args)=>{
   calls.push({name,args});if(fail)return {error:{message:'Sin conexión'}};
   const data={diarias:structuredClone(rows),diferencias:[]};
   if(hold){hold=false;return new Promise(resolve=>{releaseRead=()=>resolve({data});});}
   return {data};
  }})};
 });
 await page.addScriptTag({content:await readFile('creditek/erp/confirmaciones-deuda-gestion.js','utf8')});
 await page.waitForFunction(()=>!document.querySelector('#totales').hidden);
 return page;
}
const cash=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(value);

test('pie visible suma las dos columnas, distingue total parcial y no mueve deudas',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await boot(browser);
  assert.equal(await page.locator('#totalEtiqueta').textContent(),'TOTAL');
  assert.equal(await page.locator('#totalSistema').textContent(),cash(120.8));
  assert.equal(await page.locator('#totalDeclarado').textContent(),cash(110.7));
  assert.equal(await page.locator('#totalAlcance').textContent(),'2 de 2 confirmadas');
  assert.equal(await page.locator('#filas tr').count(),2);
  assert.equal(await page.locator('table').evaluate(t=>t.tFoot.previousElementSibling.id),'filas');
  await page.evaluate(()=>rows.push({tienda:'Tienda C',administrador:'Persona C',confirmacion:null}));
  await page.locator('#actualizar').click();await page.waitForFunction(()=>document.querySelector('#totalEtiqueta').textContent==='TOTAL PARCIAL');
  assert.equal(await page.locator('#totalSistema').textContent(),cash(120.8));
  assert.equal(await page.locator('#totalAlcance').textContent(),'2 de 3 confirmadas');
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.locator('#totalEtiqueta').scrollIntoViewIfNeeded();
   assert.equal(await page.locator('#totales').isVisible(),true);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'La tabla desplaza dentro de su contenedor, no toda la página');
   await page.screenshot({path:'/private/tmp/kora-confirmaciones-totales-'+viewport.width+'-20261019.png'});
  }
  await page.evaluate(()=>rows=rows.map(r=>({...r,confirmacion:null})));
  await page.locator('#actualizar').click();await page.waitForFunction(()=>document.querySelector('#totalAlcance').textContent==='0 de 3 confirmadas');
  assert.equal(await page.locator('#totalSistema').textContent(),'—');assert.equal(await page.locator('#totalDeclarado').textContent(),'—');
  assert.ok((await page.evaluate(()=>calls)).every(c=>c.name==='listar_confirmaciones_deuda'));
 }finally{await browser.close();}
});

test('cambiar de día o fallar la consulta oculta totales viejos; un día vacío es cero',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await boot(browser);
  await page.evaluate(()=>{hold=true;rows=[];});
  await page.locator('#fecha').fill('2026-10-18');await page.locator('#fecha').dispatchEvent('change');
  await page.waitForFunction(()=>!!releaseRead);
  assert.equal(await page.locator('#totales').isVisible(),false);
  await page.evaluate(()=>releaseRead());await page.waitForFunction(()=>!document.querySelector('#totales').hidden);
  assert.equal(await page.locator('#totalSistema').textContent(),cash(0));assert.equal(await page.locator('#totalAlcance').textContent(),'0 de 0 confirmadas');
  await page.evaluate(()=>fail=true);await page.locator('#actualizar').click();
  await page.waitForFunction(()=>document.querySelector('#estado').textContent.includes('Sin conexión'));
  assert.equal(await page.locator('#totales').isVisible(),false);assert.equal(await page.locator('#filas tr').count(),0);
 }finally{await browser.close();}
});
