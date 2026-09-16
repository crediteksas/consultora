import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';

test('B2B muestra nombres, mantiene identidad y exporta el mismo período sin financieras',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.endsWith('tailwind.min.css'))return route.fulfill({contentType:'text/css',body:'.hidden{display:none}.invisible{visibility:hidden}.text-right{text-align:right}'});
   if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const f=resolve(process.cwd(),'.'+u.pathname);if(!f.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   const fecha=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const data=[
    {margen_id:'1',fecha,remision_id:'r1',consecutivo:1,tienda_codigo:'CK-02',referencia:'A1',producto_nombre:'Samsung Galaxy A17 128GB',cantidad:2,facturado:1200000,costo:1000000},
    {margen_id:'2',fecha,remision_id:'r2',consecutivo:2,tienda_codigo:'CK-06',referencia:'B1',producto_nombre:'Vidrio templado',cantidad:10,facturado:200000,costo:100000},
    {margen_id:'3',fecha,remision_id:'r3',consecutivo:3,tienda_codigo:'EXT1',referencia:'A1',producto_nombre:'Samsung Galaxy A17 128GB',cantidad:1,facturado:600000,costo:500000},
   ];
   const tiendas=[{codigo:'CK-02',nombre:'Móvil Shopping',tipo:'propia',activo:true},{codigo:'CK-06',nombre:'Creditel Chinú',tipo:'propia',activo:true},{codigo:'EXT1',nombre:'Cliente histórico',tipo:'aliado',activo:false}];
   window.__KORA_ENV__={};
   window.SB={auth:{getSession:async()=>({data:{session:{user:{email:'prueba@example.test'}}}})},rpc:async name=>({data:name==='rol_actual'?'gerencia':data}),from(){return {select(){return this},order:async()=>({data:tiendas})}}};
   window.Chart=class {destroy(){}};
   window.XLSX={utils:{book_new:()=>[],aoa_to_sheet:x=>x,json_to_sheet:x=>x,book_append_sheet:(book,sheet,name)=>book.push({name,sheet})},writeFile:book=>{window.exportedBook=book}};
  });
  await page.goto('https://kora.test/creditek/erp/utilidad-creditek.html');
  await page.locator('#tbody-tienda').getByText('Móvil Shopping').waitFor();
  assert.match(await page.locator('#tbody-tienda').textContent(),/Creditel Chinú/);
  assert.match(await page.locator('#tbody-referencia').textContent(),/Samsung Galaxy A17 128GB/);
  assert.doesNotMatch(await page.locator('.summary-grid').textContent(),/CK-02|CK-06|Resumen por plataforma/);
  assert.equal(await page.locator('#kpi-utilidad').textContent(),'$\u00a0400.000');
  assert.equal(await page.locator('#filtro-tienda option[value="EXT1"]').textContent(),'Cliente histórico');
  await page.locator('#filtro-referencia').selectOption('A1');
  assert.equal(await page.locator('#kpi-utilidad').textContent(),'$\u00a0300.000');
  await page.locator('#btn-exportar').click();
  const book=await page.evaluate(()=>window.exportedBook);
  assert.deepEqual(book.map(x=>x.name),['Resumen','Detalle','Por tienda','Por referencia']);
  assert.equal(book[1].sheet[0].Tienda,'Móvil Shopping');
  assert.equal(book[1].sheet[0].Referencia,'Samsung Galaxy A17 128GB');
  await page.locator('#filtro-referencia').selectOption('');
  for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:1000});
   await page.locator('.summary-grid').scrollIntoViewIfNeeded();
   await page.screenshot({path:`/tmp/kora-b2b-nombres-${width}.png`});
   const overflow=await page.evaluate(()=>({width:innerWidth,total:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>[e.id,e.className,e.getBoundingClientRect().width])}));
   assert.ok(overflow.total<=width+1,JSON.stringify(overflow));
   await page.locator('#tbody-tienda').evaluate(e=>{e.closest('.table-wrap').scrollLeft=1000});
   const visible=await page.locator('#tbody-tienda td').first().evaluate(e=>{
    const a=e.getBoundingClientRect(),b=e.closest('.table-wrap').getBoundingClientRect();return a.left>=b.left-1 && a.right<=b.right+1;
   });
   assert.ok(visible,'el nombre permanece visible al desplazar la tabla');
   await page.locator('#tbody-tienda').evaluate(e=>{e.closest('.table-wrap').scrollLeft=0});
   await page.screenshot({path:`/tmp/kora-b2b-nombres-${width}.png`});
  }
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
