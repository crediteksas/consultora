// Prueba de navegador aislada: sin sesiones ni datos de producción.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const source=readFileSync('creditek/erp/inventario.html','utf8');
 await page.setContent('<html><head><style>'+source.match(/<style>([\s\S]*?)<\/style>/)[1]+'</style></head><body></body></html>');
 await page.addScriptTag({content:readFileSync('node_modules/xlsx/dist/xlsx.full.min.js','utf8')});
 await page.addScriptTag({content:readFileSync('creditek/erp/conteos-domain.js','utf8')});
 await page.addScriptTag({content:readFileSync('creditek/erp/conteos-ui.js','utf8')});
 await page.evaluate(async()=>{
   window.calls=[];window.downloads=[];
   XLSX.writeFile=(book,name)=>downloads.push({names:book.SheetNames,rows:XLSX.utils.sheet_to_json(book.Sheets.Conteo||book.Sheets['Conteos y ajustes'],{defval:''}),name});
   const c={id:'11111111-1111-4111-8111-111111111111',tienda_codigo:'A',tienda_nombre:'Tienda de prueba',corte_at:new Date(Date.now()-60000).toISOString(),creado_nombre:'Operadora',estado:'abierto',base_conteo:'corte_fijo'};
   const lines=[{producto_id:'a',codigo:'VID',nombre:'Vidrio',tipo:'cantidad',imei:'',cantidad_corte:250,costo_tienda:1500,cantidad_fisica:null,esperado_conteo:null,diferencia:null,actual:233},
    {producto_id:'b',codigo:'CEL',nombre:'Equipo',tipo:'serializado',imei:'000000000000001',cantidad_corte:1,costo_tienda:400000,cantidad_fisica:null,esperado_conteo:null,diferencia:null,actual:1}];
   const sb={rpc:async(name,{p_accion:a,p_datos:d})=>{
     calls.push({a,d});
     if(a==='config')return {data:{autoriza:true,central:true,tiendas:[{codigo:'A',nombre:'Tienda de prueba'}]}};
     if(a==='informe')return {data:{cortes:[c]}};
     if(a==='subir'){c.estado='pendiente';c.contado_at=d.contado_at;c.contado_nombre='Operadora';for(const l of lines){const f=d.filas.find(f=>f.codigo===l.codigo);l.cantidad_fisica=f.cantidad;l.esperado_conteo=l.cantidad_corte;l.diferencia=f.cantidad-l.cantidad_corte;}}
     if(a==='aplicar'){c.estado='aplicado';c.autorizado_nombre='Maite';c.autorizado_at=new Date().toISOString();for(const l of lines)l.posterior=l.actual+l.diferencia;}
     return {data:structuredClone({corte:c,lineas:lines})};
   }};
   window.ui=KoraConteosUI.init({sb,XLSX,tiendaActual:()=> 'A',refrescar:async()=>{}});await ui.abrir();
 });
 await page.locator('#conteos-crear').click();
 await page.waitForFunction(()=>downloads.length===1);
 const out=await page.evaluate(()=>downloads[0]);assert.equal(out.rows.length,2);assert.equal(out.rows[1]['IMEI / serial'],'000000000000001');assert.deepEqual(out.names,['Conteo','Resumen']);
 const id='11111111-1111-4111-8111-111111111111';
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Formato','KORA-CONTEO-2'],['ID',id]]),'Resumen');
 XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{'Código producto':'VID','IMEI / serial':'','Cantidad reportada al corte':499},{'Código producto':'CEL','IMEI / serial':'000000000000001','Cantidad reportada al corte':1}]),'Conteo');
 await page.locator('#conteos-archivo').setInputFiles({name:'conteo.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})});
 assert.equal(await page.locator('#conteos-fecha-modo').count(),0);
 await page.locator('#conteos-confirmar-corte').check();
 // setContent has an opaque origin; install the digest only for this isolated harness.
 await page.evaluate(()=>{if(!crypto.subtle)Object.defineProperty(crypto,'subtle',{value:{digest:async()=>new Uint8Array(32).buffer}});});
 await page.locator('#conteos-form-subir button').click();
 await page.waitForFunction(()=>calls.some(c=>c.a==='subir'));
 assert.equal(await page.evaluate(()=>calls.find(c=>c.a==='subir').d.base_conteo),'corte_fijo');
 await page.locator('#conteos-motivo').fill('Conteo verificado');await page.locator('#conteos-soporte').fill('Acta 2026-09');await page.locator('#conteos-clasificacion').selectOption('sobrante_por_aclarar');
 assert.match(await page.locator('#conteos-lineas').innerText(),/482/);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/kora-conteos-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 page.on('dialog',d=>d.accept());await page.locator('#conteos-form-decidir button[type=submit]').click();
 await page.waitForFunction(()=>calls.some(c=>c.a==='aplicar'));
 assert.match(await page.locator('#conteos-detalle').innerText(),/Ajuste aplicado/);
 assert.deepEqual(errors,[]);console.log('Navegador: archivo mixto, ceros IMEI, carga, 482, autorización, escritorio y móvil OK.');
} finally {await browser.close();}
