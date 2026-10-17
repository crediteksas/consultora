import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
const require=createRequire(import.meta.url),XLSX=require('xlsx');

test('descarga nativa Krediya respeta búsqueda, conserva centavos y agrega contexto y cierre',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true});
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<main id="report"></main>'}));
  await page.goto('https://kora.test/krediya');
  await page.addScriptTag({path:require.resolve('xlsx/dist/xlsx.full.min.js')});
  await page.addScriptTag({content:await readFile('creditek/erp/krediya-tarifario.js','utf8')});
  await page.evaluate(async()=>{
   const context={pvp_guardado:1000,pvp_liquidado:1100.25,impacto_bruto:100.25,pagamos:800.50,inicial:100.25,bonos:10,utilidad_neta:-5.50,impacto_neto:-20.25,gasto_financiero:2.25,provision:1};
   const records=[{operation_id:'synthetic-a',estado:'pendiente',contexto:{...context,referencia:'Equipo alfa',imei:'001234567890123',tienda:'Tienda ficticia A'}},{operation_id:'synthetic-b',estado:'pendiente',contexto:{...context,referencia:'Equipo beta',imei:'001234567890124',tienda:'Tienda ficticia B'}}];
   const sb={from(table){const q={select(){return q;},eq(){return q;},order(){return q;},async maybeSingle(){return {data:null,error:null};},async range(){return {data:table==='krediya_diferencias'?records:[],error:null};}};return q;},rpc(){throw Error('No se permiten escrituras ni RPC en esta prueba');}};
   await window.CreditekKrediyaTarifario.create({sb,money:n=>String(n)}).report(document.getElementById('report'),{id:'synthetic-batch',fecha_corte:'2026-10-16',estado:'aprobada',frozen_at:'2026-10-16T12:00:00Z'});
  });
  await page.locator('[data-report-details] summary').first().click();
  await page.locator('[data-search]').fill('alfa');
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-export]').click();const download=await downloadPromise;
  const book=XLSX.read(await readFile(await download.path()),{type:'buffer'});
  const rows=XLSX.utils.sheet_to_json(book.Sheets['Gestión y Gerencia'],{header:1,defval:''});
  assert.equal(rows.length,3);assert.equal(rows[1][0],'Equipo alfa');assert.equal(rows[1][2],'001234567890123');
  assert.equal(rows[2][9],700.25);assert.equal(rows[2][12],-20.25);assert.equal(rows[2][4],'');
  assert.equal(book.Sheets['Gestión y Gerencia']['!autofilter'].ref,'A1:S2');
  const params=XLSX.utils.sheet_to_json(book.Sheets.Contexto,{header:1});
  assert.equal(params.find(row=>row[0]==='Búsqueda aplicada')[1],'alfa');assert.equal(params.find(row=>row[0]==='Registros exportados')[1],1);
  assert.doesNotMatch(JSON.stringify(rows),/Equipo beta/);
 }finally{await browser.close();}
});
