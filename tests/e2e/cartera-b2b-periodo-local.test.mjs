import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';

test('cartera completa: período, detalle, errores, exportación y diseño sin scroll lateral',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-09-16T17:00:00Z')});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='kora.test')return route.abort();
   if(/sidebar\.js|kora-access-control\.js|kora-environment/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const f=resolve(process.cwd(),'.'+u.pathname);
   if(!f.startsWith(process.cwd()+'/'))return route.abort();
   try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   window.__KORA_ENV__={};window.calls=[];
   const data={
    origenes:[{codigo:'T',nombre:'Móvil Shopping',tipo:'propia',activo:true},{codigo:'Z',nombre:'Tienda sin movimientos',tipo:'propia',activo:true},{codigo:'C',nombre:'Luis',tipo:'cliente_b2b',activo:true}],
    v_cartera_clientes_b2b:[{cuenta_id:'c1',cliente_codigo:'C',cliente:'Luis'}],
    cuenta_corriente:[{id:1,tienda_codigo:'T',tipo:'cargo',monto:1000000,created_at:'2026-08-31T12:00:00Z',concepto:'Saldo previo'},{id:2,tienda_codigo:'T',tipo:'cargo',monto:300000,created_at:'2026-09-01T12:00:00Z',concepto:'Remisión'},{id:3,tienda_codigo:'T',tipo:'abono',monto:200000,created_at:'2026-09-16T12:00:00Z',concepto:'Compensación aplicada'},{id:4,tienda_codigo:'T',tipo:'cargo',monto:900000,created_at:'2026-09-17T12:00:00Z',concepto:'Fuera de período'}],
    movimientos_cartera:[{id:'a',cuenta_id:'c1',tienda_codigo:'C',efecto:'debito',monto:500000,fecha_efectiva:'2026-09-02',concepto:'Remisión cliente'}],
    saldos_iniciales_cartera:[{id:'s1',tienda_codigo:'T',fecha_corte:'2026-09-03'}],
   };
   Object.assign(data.cuenta_corriente[0],{created_at:'2026-09-04T12:00:00Z',referencia_tipo:'saldo_inicial',referencia_id:'s1',concepto:'Carga inicial'});
   window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},from(table){window.calls.push(table);return {select(){return this},eq(){return this},in(){return this},order(){return this},single:async()=>({data:{rol:'gerencia'}}),range:async(a,b)=>window.failTable===table?{error:{message:'Fallo de prueba'}}:{data:data[table].slice(a,b+1)}}}})};
  });
  await page.goto('https://kora.test/creditek/erp/cartera-b2b.html');
  await page.locator('#rows').getByText('Móvil Shopping').waitFor();
  assert.equal(await page.locator('#rows tr').count(),3);
  assert.match(await page.locator('#kInicial').textContent(),/1\.000\.000/);
  assert.match(await page.locator('#kCargos').textContent(),/800\.000/);
  assert.match(await page.locator('#kAbonos').textContent(),/200\.000/);
  assert.match(await page.locator('#kSaldo').textContent(),/1\.600\.000/);
  assert.equal(await page.locator('#fCliente option').count(),1);
  assert.match(await page.locator('#rows').textContent(),/corte 2026-09-03/);
  for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:1000});
   await page.clock.runFor(1200);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.ok(await page.locator('.page .tablewrap').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.screenshot({path:`/tmp/kora-cartera-b2b-${width}.png`,fullPage:true,animations:'disabled'});
  }
  await page.locator('#buscar').fill('movil');
  assert.equal(await page.locator('#rows tr').count(),1);
  await page.locator('#rows').getByRole('button',{name:'Móvil Shopping'}).click();
  assert.equal(await page.locator('#dRows tr').count(),2);
  assert.doesNotMatch(await page.locator('#dRows').textContent(),/Fuera de período|Carga inicial/);
  assert.match(await page.locator('#dInicial').textContent(),/1\.000\.000.*2026-09-03.*2026-09-04/);
  await page.locator('[data-close="detalle"]').click();
  const download=page.waitForEvent('download');await page.locator('#csv').click();
  const file=await download,content=await readFile(await file.path(),'utf8');
  assert.match(content,/Saldo inicial/);assert.match(content,/Móvil Shopping/);assert.doesNotMatch(content,/Luis|Fuera de período/);
  assert.match(content,/2026-09-03/);assert.match(content,/"Saldo inicial","Carga inicial"/);
  await page.locator('#desde').fill('2026-09-20');await page.locator('#desde').dispatchEvent('change');
  assert.equal(await page.locator('#csv').isDisabled(),true);
  await page.locator('#desde').fill('2026-09-01');await page.locator('#desde').dispatchEvent('change');
  await page.evaluate(()=>window.failTable='saldos_iniciales_cartera');await page.locator('#actualizar').click();
  await page.locator('#loadError').getByText(/No fue posible cargar/).waitFor();
  assert.equal(await page.locator('#rows tr').count(),0);
  assert.equal(await page.locator('#kSaldo').textContent(),'—');
  assert.equal(await page.locator('#csv').isDisabled(),true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
