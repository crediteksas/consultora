// Navegador aislado, sin sesiones ni llamadas a Supabase real.
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('.'),browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.hostname!=='kora.test')return route.abort();
    if(/supabase-js/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:'window.supabase={createClient:()=>window.mockSb};'});
    if(/sidebar\.js|kora-access-control|kora-environment|kora-product\.js|caja-libro-ui|cobros-plataformas\.js/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
    const file=resolve(root,'.'+u.pathname);if(!file.startsWith(root+'/'))return route.abort();
    try{return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{return route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
    const id='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
    window.__KORA_ENV__={KORA_ERP_SUPABASE_URL:'https://kora.test',KORA_ERP_SUPABASE_ANON_KEY:'ficticia'};
    window.CreditekCajaLibroUI={montar(){}};
    window.CreditekCobrosPlataformas={create:()=>({async mount(){}})};
    const invoices=[{id:'f',proveedor_id:'p',numero:'ANT-PRUEBA',fecha:'2026-10-06',saldo:-50000},
      {id:'g',proveedor_id:'q',numero:'F-PRUEBA',fecha:'2026-10-06',saldo:100000}];
    const providers=[{id:'p',nombre:'Proveedor con crédito',activo:true},{id:'q',nombre:'Proveedor con deuda',activo:true}];
    window.mockSb={auth:{async getSession(){return {data:{session:{user:{id}}}}}},
      from(table){let filter,range;return {
        select(){return this;},eq(k,v){filter=[k,v];return this;},in(){return this;},order(){return this;},limit(){return this;},range(a,b){range=[a,b];return this;},single(){return this;},maybeSingle(){return this;},
        then(ok,bad){let data=table==='perfiles'?{id,rol:'auditoria',activo:true}:
          table==='banco_creditek_cuentas'?{saldo_actual:1000000,banco:'Bancolombia',tipo_cuenta:'ahorros',fecha_corte:'2026-10-01'}:
          table==='facturas_proveedor'?invoices:table==='proveedores'?providers:table==='origenes'?[{codigo:'CK-01',nombre:'Prueba',tipo:'propia',activo:true}]:[];
          if(Array.isArray(data)&&filter)data=data.filter(x=>x[filter[0]]===filter[1]);
          if(Array.isArray(data)&&range)data=data.slice(range[0],range[1]+1);
          return Promise.resolve({data,error:null}).then(ok,bad);
        }};
      },async rpc(name){if(name==='calcular_efectivo_esperado_tienda')return {data:{esperado:100000}};throw Error('No se permiten movimientos en esta prueba');},
    };
  });
  await page.goto('https://kora.test/creditek/erp/banco-creditek.html');
  await page.locator('#proveedor').selectOption('p');await page.locator('#monto').fill('150000');
  await page.locator('#concepto').fill('Anticipo real autorizado');
  assert.equal(await page.locator('#solicitar').isEnabled(),true);
  assert.match(await page.locator('#deuda').inputValue(),/50.000.*a favor/);
  assert.match(await page.locator('#excedenteAviso').textContent(),/200.000.*a favor/);
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:850});
    assert.ok(await page.locator('#solicitarPanel').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  }
  await page.goto('https://kora.test/creditek/erp/ajustes-gerencia.html');
  await page.locator('#tipo').selectOption('proveedor');await page.locator('#codigo').selectOption('p');
  await page.locator('#objetivo').fill('-75000');await page.locator('#motivo').fill('Nota de garantía NC-PRUEBA registrada por el proveedor');
  assert.equal(await page.locator('#preparar').isEnabled(),true);
  assert.equal(await page.locator('#objetivo').getAttribute('min'),null);
  assert.match(await page.locator('#vistaPrevia').textContent(),/A favor de Creditek/);
  await page.locator('#tipo').selectOption('caja_retail');await page.locator('#codigo').selectOption('CK-01');
  await page.locator('#objetivo').fill('-75000');
  assert.equal(await page.locator('#objetivo').getAttribute('min'),'0');
  assert.equal(await page.locator('#preparar').isEnabled(),false);
  await page.goto('https://kora.test/creditek/erp/resumen-saldos-b2b.html');
  await page.waitForFunction(()=>document.querySelector('#proveedoresRows').textContent.includes('A favor de Creditek'));
  assert.match(await page.locator('#porPagar').textContent(),/100.000/);
  assert.match(await page.locator('#proveedoresNota').textContent(),/50.000.*a favor/);
  assert.deepEqual(errors,[]);
  console.log('OK: banco permite anticipo, ajuste admite crédito sin liberar caja negativa, resumen no cruza proveedores; escritorio y móvil.');
}finally{await browser.close();}
