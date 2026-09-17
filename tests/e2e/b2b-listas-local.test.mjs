import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'../..');
test('KORA: administración importa con revisión y retail pide sin datos del proveedor',async()=>{
 const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const p=path.join(root,pathname);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('content-type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 for(const role of ['auditoria','gerencia','admin_tienda','asesor']){
 const page=await browser.newPage({viewport:{width:1150,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const url=route.request().url();if(url.includes('xlsx@'))return route.fulfill({contentType:'text/javascript',body:await readFile(path.join(root,'node_modules/xlsx/dist/xlsx.full.min.js'),'utf8')});if(/supabase-js|lucide|kora-auth|kora-access-control|sidebar.js|kora-environment/.test(url))return route.fulfill({contentType:'text/javascript',body:''});if(!url.startsWith(origin))return route.abort();return route.continue();});
 await page.addInitScript(({role})=>{
  const p={id:'00000000-0000-4000-8000-000000000010',codigo:'SM17',nombre:'Samsung A17 4/128GB',categoria:'CELULAR',precio_guia:450000,version_precio:'00000000-0000-4000-8000-000000000020'};
  const provider={id:'00000000-0000-4000-8000-000000000030',nombre:'Proveedor A',nit:'900001'};
  window.calls=[];window.writes=[];
  const tables={productos:[p],proveedores:[provider],origenes:[{codigo:'A',nombre:'Tienda A'}],pedido_b2b_items:[],ordenes_compra:[],b2b_pedido_fuente:[],b2b_mejor_oferta:[],pedidos_b2b:[]};
  const query=data=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:async(start,end)=>({data:data.slice(start,end+1)}),maybeSingle:async()=>({data:{id:'u',rol:role,tienda_codigo:'A',activo:true}})};return q;};
  window.SB={auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}})},from:name=>{window.calls.push(name);return query(tables[name]||[]);},rpc:(name,payload)=>{window.calls.push(name);if(name==='catalogo_pedidos_b2b')return query([p]);window.writes.push({name,payload});return Promise.resolve({data:{id:'ok',numero:'PED-000001',filas:1}});}};
 },{role});
 await page.goto(origin+'/creditek/erp/pedidos-b2b.html');
 if(['auditoria','gerencia'].includes(role)){
  await page.getByRole('button',{name:'Cargar lista de precios',exact:true}).click();
  await page.locator('[data-file]').setInputFiles({name:'precios.csv',mimeType:'text/csv',buffer:Buffer.from('Referencia;Proveedor;Costo real;Precio retail\nSM17;Proveedor A;430000;445000\n')});
  await page.waitForFunction(()=>document.querySelector('[data-map="cost"]').value==='2');
  await page.getByRole('button',{name:'Revisar filas',exact:true}).click();
  assert.equal(await page.locator('[data-row]').count(),1);assert.match(await page.locator('[data-margin]').innerText(),/15.000/);
  assert.equal(await page.locator('[data-publish]').isDisabled(),true);
  await page.locator('[data-confirm]').check();assert.equal(await page.locator('[data-publish]').isEnabled(),true);
  await page.screenshot({path:`/tmp/kora-b2b-${role}.png`,fullPage:true});
  await page.locator('[data-publish]').click();await page.waitForFunction(()=>window.writes.length===1);
  const write=await page.evaluate(()=>window.writes[0]);assert.equal(write.name,'publicar_lista_b2b');assert.equal(write.payload.p_filas[0].costo,430000);assert.equal(write.payload.p_filas[0].precio_tienda,445000);assert.equal(write.payload.p_huella.length,64);
 }else{
  await page.getByRole('button',{name:'Agregar',exact:true}).click();await page.getByRole('button',{name:/Ver pedido/}).click();
  await page.getByRole('button',{name:'Enviar pedido',exact:true}).click();await page.waitForFunction(()=>window.writes.length===1);
  const calls=await page.evaluate(()=>window.calls);assert.ok(!calls.includes('productos'));assert.ok(!calls.includes('b2b_ofertas'));assert.ok(!calls.includes('proveedores'));
  const write=await page.evaluate(()=>window.writes[0]);assert.equal(write.name,'crear_pedido_catalogo_b2b');assert.equal(write.payload.p_items[0].precio_catalogo,450000);assert.equal(write.payload.p_items[0].costo,undefined);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`/tmp/kora-b2b-${role}.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 assert.deepEqual(errors,[]);await page.close();
 }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
