import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';

test('resumen de saldos: totales, búsquedas, errores, permisos y responsive',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-environment|kora-product\.js/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const f=resolve(process.cwd(),'.'+u.pathname);if(!f.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   window.__KORA_ENV__={};window.calls=[];
   const sources={origenes:[{codigo:'T',nombre:'Móvil Shopping',tipo:'propia',activo:true},{codigo:'Z',nombre:'Tienda sin movimientos',tipo:'propia',activo:true}],v_cartera_clientes_b2b:[{cliente_codigo:'C',cliente:'Cliente externo',saldo:500000}],cuenta_corriente:[{id:1,tienda_codigo:'T',tipo:'cargo',monto:1000000},{id:2,tienda_codigo:'T',tipo:'abono',monto:200000}],proveedores:[{id:'p',nombre:'Proveedor prueba',activo:true}],facturas_proveedor:[{id:'f',proveedor_id:'p',saldo:700000,fecha_vencimiento:'2026-09-10'}]};
   window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},from(table){window.calls.push(table);return {select(){return this},eq(){return this},in(){return this},order(){return this},single:async()=>({data:{rol:sessionStorage.getItem('rol')||'gerencia',activo:true}}),range:async(a,b)=>window.failTable===table?{error:{message:'Fallo de prueba'}}:{data:sources[table].slice(a,b+1)}}}})};
  });
  await page.goto('https://kora.test/creditek/erp/resumen-saldos-b2b.html');
  await page.locator('#tiendasRows').getByText('Móvil Shopping').waitFor();
  assert.match(await page.locator('#porCobrar').textContent(),/1\.300\.000/);assert.match(await page.locator('#porPagar').textContent(),/700\.000/);assert.match(await page.locator('#diferencia').textContent(),/600\.000/);
  assert.equal(await page.locator('#tiendasRows tr').count(),3);
  for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   for(const table of await page.locator('.saldos-table').all())assert.ok(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.screenshot({path:`/tmp/kora-resumen-saldos-${width}.png`,fullPage:true,animations:'disabled'});
  }
  await page.locator('#buscarTiendas').fill('movil');assert.equal(await page.locator('#tiendasRows tr').count(),1);
  assert.match(await page.locator('#resumenTiendas').textContent(),/800\.000/);assert.match(await page.locator('#porCobrar').textContent(),/1\.300\.000/);
  await page.locator('#buscarProveedores').fill('No existe');assert.match(await page.locator('#proveedoresRows').textContent(),/Sin coincidencias/);
  await page.evaluate(()=>window.failTable='facturas_proveedor');await page.locator('#actualizar').click();await page.locator('#error').waitFor();
  assert.equal(await page.locator('#porCobrar').textContent(),'—');assert.equal(await page.locator('#diferencia').textContent(),'—');
  assert.doesNotMatch(await page.locator('#tiendasRows').textContent(),/Móvil/);
  await page.evaluate(()=>window.failTable=null);await page.locator('#actualizar').click();await page.locator('#tiendasRows').getByText('Móvil Shopping').waitFor();
  await page.evaluate(()=>sessionStorage.setItem('rol','admin_tienda'));await page.reload();await page.locator('#acceso').getByText(/únicamente/).waitFor();
  assert.equal(await page.locator('#app').isVisible(),false);assert.deepEqual(await page.evaluate(()=>window.calls),['perfiles']);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
