import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

test('descarga CSV kardex conserva cierre, filtros consultados y cadenas sensibles',async()=>{
 const source=await readFile('creditek/erp/kardex.html','utf8');
 const helper=source.slice(source.indexOf('function filasInformeKardex('),source.indexOf('let productosCache'));
 const handler=source.slice(source.indexOf("  document.getElementById('btnExportarKardex').addEventListener"),source.indexOf("  document.getElementById('btnLimpiarFiltros').addEventListener"));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true});await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<button id="btnExportarKardex">Descargar</button>'}));await page.goto('https://kora.test/kardex');
  await page.addScriptTag({content:`const nombreTienda=c=>c,tipoInfo=t=>({label:t});const ultimoInformeKardex=[{created_at:'2026-10-16T05:00:00Z',tienda_codigo:'TEST',tipo:'entrada',cantidad:2,costo:123.25,productos:{nombre:'=SUM(A1)',codigo:'0002'},unidades:{imei:'001234567890123'},nota:'Texto "con comillas"'}];const contextoInformeKardex={corte:'2026-10-16T18:00:00Z',desde:'2026-10-16',hasta:'2026-10-16',tienda:'TEST',tipo:'entrada',producto:'synthetic-product'};\n${helper}\n${handler}`});
  const promise=page.waitForEvent('download');await page.locator('#btnExportarKardex').click();const download=await promise;
  const csv=await readFile(await download.path(),'utf8');
  assert.match(csv,/"001234567890123"/);assert.match(csv,/"123.25"/);assert.match(csv,/"'=SUM\(A1\)"/);assert.match(csv,/"Texto ""con comillas"""/);
  assert.match(csv,/"TOTAL CANTIDADES REGISTRADAS","","","","","","2",""/);
  assert.match(csv,/"CORTE CONSULTADO","2026-10-16T18:00:00Z"/);assert.match(csv,/"FILTROS APLICADOS","Tienda","TEST"/);
 }finally{await browser.close();}
});
