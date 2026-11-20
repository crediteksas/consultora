import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,webkit} from '@playwright/test';

test('último corte: tarjetas separan estados y pérdidas sin cambiar cifras ni sumar provisionales',async()=>{
 const browser=process.env.KORA_TEST_BROWSER==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();const source=await readFile('creditek/erp/inventario.html','utf8');
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>'+source.match(/<style>([\s\S]*?)<\/style>/)[1]+'</style><body class="kora-product-page" data-kora-finish="2026.11"></body>'}));
  await page.goto('https://kora.test/creditek/erp/inventario.html');await page.addStyleTag({path:resolve('creditek/erp/kora-finish.css')});await page.addScriptTag({path:resolve('creditek/erp/conteos-ui.js')});
  await page.evaluate(async()=>{
   const tiendas=[{codigo:'CK-1',nombre:'Tienda ficticia positiva'},{codigo:'CK-2',nombre:'Tienda ficticia pérdida'},{codigo:'CK-3',nombre:'Tienda ficticia sin corte'}];
   const cortes=tiendas.slice(0,2).map(t=>({id:t.codigo,tienda_codigo:t.codigo,estado:'aplicado',base_conteo:'corte_fijo',corte_at:'2026-10-07T15:00:00Z',contado_at:'2026-10-07T15:00:00Z',autorizado_at:'2026-10-08T15:00:00Z'}));
   window.calls=[];
   const sb={rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='cierre_utilidad_retail')return {data:{ventas_totales:200,costo_vendido:100,gastos_totales:0,perdidas_ajustes:0,ganancias_ajustes:0,ajuste_conciliacion:0,utilidad_neta:args.p_corte_id==='CK-1'?100:-50,listo:true,cerrado:args.p_corte_id==='CK-1'}};
    if(args.p_accion==='config')return {data:{central:true,autoriza:true,tiendas}};
    if(args.p_accion==='informe')return {data:{cortes}};
    if(args.p_accion==='ver')return {data:{corte:cortes.find(c=>c.id===args.p_datos.id),lineas:[{nombre:'Producto ficticio',cantidad_corte:1,cantidad_fisica:1,diferencia:0,costo_tienda:100}]}};
    throw Error('Acción no prevista: '+name+' '+args.p_accion);
   }};
   const ui=KoraConteosUI.init({sb,XLSX:{},tiendaActual:()=>'',refrescar:async()=>{},perfil:{rol:'gerencia',nombre:'Usuario ficticio'}});await ui.abrirUtilidadUltima();
  });
  const panel=page.locator('#conteos-utilidad-general');assert.equal(await panel.locator('.kora-last-cuts > li').count(),3);
  assert.match(await panel.innerText(),/Utilidad neta confirmada:.*100/);assert.match(await panel.innerText(),/1 de 3 tiendas/);
  assert.equal(await panel.locator('[data-resultado="Pérdida"]').count(),1);assert.match(await panel.locator('[data-resultado="Pérdida"]').innerText(),/-.*50/);
  assert.match(await panel.locator('li').nth(1).innerText(),/Calculada, pendiente de cierre/);assert.match(await panel.locator('li').nth(2).innerText(),/Sin corte.*Por confirmar/s);
  assert.equal(await panel.locator('[data-resultado="Pérdida"]').evaluate(e=>getComputedStyle(e).color),'rgb(180, 35, 24)');
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:900});
   const bounds=await panel.locator('li').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
   assert.ok(bounds.every(b=>b.left>=0&&b.right<=width));
   if(width===390)assert.ok(bounds[1].y>bounds[0].y,'tarjetas de una columna en móvil');
   if(width===1440)assert.equal(bounds[0].y,bounds[2].y,'tres tarjetas en escritorio');
   assert.equal(await panel.evaluate(e=>e.scrollWidth>e.clientWidth),false);
  }
  const calls=await page.evaluate(()=>window.calls);assert.ok(calls.length>0);assert.ok(calls.every(c=>c.name==='cierre_utilidad_retail'?c.args.p_accion==='vista':['config','informe','ver'].includes(c.args.p_accion)),'solo consultas; sin modificar ni confirmar cortes');
 }finally{await browser.close();}
});
