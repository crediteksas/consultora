// Synthetic data only. Runs the real page handlers; never connects to production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,expect} from '@playwright/test';

test('proveedores: formulario modal, agenda conciliada y diseño adaptable', {timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:1000}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-09-16T17:00:00Z')});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.href.includes('@supabase/supabase-js'))return route.fulfill({body:''});
   if(['cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com','unpkg.com'].includes(u.hostname)&&route.request().method()==='GET')return route.continue();
   if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const file=resolve(process.cwd(),'.'+u.pathname);
   if(!file.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   window.qa={writes:[],reads:[],fail:false,saveError:false};
   const proveedores=[{id:'p1',nombre:'Proveedor sintético uno',nit:'QA-1',contacto:'Contacto prueba',telefono:'000000',activo:true},{id:'p2',nombre:'Proveedor dos',nit:'QA-2',activo:true}];
   const facturas=[
    {id:'sin',proveedor_id:'p1',numero:'SIN-FECHA',total:200,saldo:200,fecha:'2026-09-01',fecha_vencimiento:null},
    {id:'fut',proveedor_id:'p1',numero:'PROXIMA',total:900,saldo:400,fecha:'2026-09-02',fecha_vencimiento:'2026-09-30'},
    {id:'pas',proveedor_id:'p1',numero:'VENCIDA',total:500,saldo:100,fecha:'2026-09-01',fecha_vencimiento:'2026-09-15'},
    {id:'hoy',proveedor_id:'p2',numero:'HOY',total:300,saldo:300,fecha:'2026-09-01',fecha_vencimiento:'2026-09-16'},
    {id:'pag',proveedor_id:'p2',numero:'PAGADA',total:500,saldo:0,fecha:'2026-09-01',fecha_vencimiento:'2026-09-10'},
   ];
   window.SB={
    auth:{getSession:async()=>({data:{session:{user:{id:'qa',email:'qa@example.invalid'}}}})},
    from(table){
     let selected=table==='proveedores'?proveedores:table==='facturas_proveedor'?facturas:[],write=null;
     const q={select(){return q;},order(){return q;},eq(k,v){selected=selected.filter(r=>r[k]===v);return q;},range(a,b){selected=selected.slice(a,b+1);return q;},
      insert(payload){write={kind:'insert',payload};return q;},update(payload){write={kind:'update',payload};return q;},
      then(resolve,reject){
       if(write)window.qa.writes.push({table,...write});else window.qa.reads.push(table);
       return Promise.resolve({data:selected,error:(write&&window.qa.saveError)?{message:'Error sintético guardando'}:(!write&&window.qa.fail)?{message:'Error sintético consulta'}:null}).then(resolve,reject);
      }};return q;
    },
    async rpc(name,args){
     window.qa.reads.push(name);
     if(name==='rol_actual')return {data:'gerencia'};
     if(name==='obtener_detalle_factura_proveedor')return {data:{factura:{...facturas.find(f=>f.id===args.p_factura_id),proveedor_nombre:'Proveedor sintético uno'},lineas:[],pagos:[]}};
     throw new Error('No se permite un RPC de escritura en esta prueba');
    }
   };
  });
  await page.goto('https://kora.test/creditek/erp/proveedores.html',{waitUntil:'networkidle'});
  await expect(page.locator('#contador')).toHaveText('2 de 2 proveedores');
  await expect(page.locator('#modal-proveedor')).toBeHidden();
  await expect(page.locator('#card-total-por-pagar [data-valor]')).toContainText('1.000');
  await expect(page.locator('#card-por-vencer [data-valor]')).toContainText('700');
  await page.locator('#btn-vencimientos').click();
  assert.deepEqual(await page.locator('#tbody-vencimientos [data-detalle-factura]').evaluateAll(es=>es.map(e=>e.dataset.detalleFactura)),['pas','hoy','fut','sin']);
  await expect(page.locator('#vencimientos-resumen')).toContainText('4 facturas');
  for(const [estado,cantidad,valor] of [['vencidas',1,'100'],['porVencer',2,'700'],['sinVencimiento',1,'200']]){
   await page.locator('#filtro-vencimiento').selectOption(estado);
   await expect(page.locator('#tbody-vencimientos tr')).toHaveCount(cantidad);
   await expect(page.locator('#vencimientos-resumen')).toContainText(valor);
  }
  await page.locator('#filtro-vencimiento').selectOption('pendientes');
  await page.locator('#filtro-texto').fill('QA-1');
  await expect(page.locator('#tbody-proveedores tr')).toHaveCount(1);
  await expect(page.locator('#tbody-vencimientos tr')).toHaveCount(3);
  await page.locator('#filtro-texto').fill('');
  for(const width of [390,768,1100,1440]){
   await page.setViewportSize({width,height:1000});
   await page.screenshot({path:`/tmp/kora-proveedores-${width}.png`,fullPage:true});
   const fuera=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1;}).slice(0,16).map(e=>({tag:e.tagName,id:e.id,clase:e.className,right:e.getBoundingClientRect().right})));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sin desbordamiento de página '+width+' '+JSON.stringify(fuera));
   const overflow=await page.locator('.proveedores-table').evaluateAll(es=>es.filter(e=>e.offsetHeight>0&&e.scrollWidth>e.clientWidth+1).map(e=>({width:e.clientWidth,scroll:e.scrollWidth})));
   assert.deepEqual(overflow,[],'tablas sin scroll lateral '+width);
   const solapados=await page.locator('.proveedores-table td').evaluateAll(es=>es.filter(e=>e.offsetHeight>0&&[...e.children].some(c=>c.getBoundingClientRect().bottom>e.getBoundingClientRect().bottom+1)).map(e=>e.dataset.label));
   assert.deepEqual(solapados,[],'contenido dentro de cada celda '+width);
   await page.locator('#btn-nuevo-proveedor').click();
   await expect(page.locator('#prov-nombre')).toBeFocused();
   const bounds=await page.locator('#modal-proveedor').boundingBox();
   assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
   await page.screenshot({path:`/tmp/kora-proveedores-modal-${width}.png`});
   await page.keyboard.press('Escape');await expect(page.locator('#modal-proveedor')).toBeHidden();
   await expect(page.locator('#btn-nuevo-proveedor')).toBeFocused();
   await page.locator('#app').scrollIntoViewIfNeeded();
   await page.screenshot({path:`/tmp/kora-proveedores-${width}.png`,fullPage:true});
  }
  assert.deepEqual(await page.evaluate(()=>window.qa.writes),[],'leer y abrir/cerrar no escribe');
  await page.locator('[data-editar="p1"]').click();await expect(page.locator('#form-titulo')).toHaveText('Editar proveedor');
  await expect(page.locator('#prov-nombre')).toHaveValue('Proveedor sintético uno');
  await page.locator('#btn-cancelar').click();
  await page.locator('#btn-nuevo-proveedor').click();await expect(page.locator('#prov-nombre')).toHaveValue('');
  await page.locator('#prov-nombre').fill('QA sin datos reales');
  await page.evaluate(()=>window.qa.saveError=true);await page.locator('#btn-guardar').click();
  await expect(page.locator('#error-proveedor')).toContainText('Error sintético guardando');await expect(page.locator('#modal-proveedor')).toBeVisible();
  await page.evaluate(()=>window.qa.saveError=false);await page.locator('#btn-guardar').click();await expect(page.locator('#modal-proveedor')).toBeHidden();
  await page.locator('#tbody-vencimientos [data-detalle-factura="pas"]').click();
  await expect(page.locator('#detalle-factura-titulo')).toContainText('VENCIDA');
  assert.ok((await page.evaluate(()=>window.qa.reads)).includes('obtener_detalle_factura_proveedor'));
  await page.evaluate(()=>window.qa.fail=true);await page.locator('#btn-actualizar').click();await expect(page.locator('#error-cartera')).toContainText('desactualizados');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
