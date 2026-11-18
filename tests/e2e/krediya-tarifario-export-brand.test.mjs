import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');

test('tarifario con costos B2B, marca y propuestas editables',{skip:!process.env.KORA_TEST_EXCELJS},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('https://kora.test/creditek/shared/branding/creditek-logo.png',async route=>route.fulfill({status:200,contentType:'image/png',body:await fs.readFile('creditek/shared/branding/creditek-logo.png')}));
  await page.route('https://kora.test/',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><head></head><body></body></html>'}));
  await page.goto('https://kora.test/');
  await page.addScriptTag({path:process.env.KORA_TEST_EXCELJS});
  await page.addScriptTag({path:require.resolve('xlsx/dist/xlsx.full.min.js')});
  await page.addScriptTag({path:'creditek/erp/krediya-tarifario.js'});
  const result=await page.evaluate(async()=>{
   const api=window.CreditekKrediyaTarifario;
   const matrix=api.tarifaRows([{referencia:'HONOR PLAY 10 128GB 4RAM',precio_venta:750000,pagamos:550000,vigente_desde:'2026-11-18'},{referencia:'SIN COINCIDENCIA',precio_venta:1,pagamos:1,vigente_desde:'2026-11-18'}]);
   api.addB2BCosts(matrix,[{id:'p',nombre:'HONOR PLAY 10 128 4GB'}],[{id:'2',producto_id:'p',proveedor_id:'b',costo:350000,precio_tienda:370000}],[{id:'a',nombre:'A'},{id:'b',nombre:'B'}],{'HONOR PLAY 10 128GB 4RAM':'HONOR PLAY 10 128 4GB'});
   let saved;URL.createObjectURL=blob=>{saved=blob;return 'blob:test';};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};
   await api.exportTariff(matrix);
   const bytes=await saved.arrayBuffer();const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);const sheet=workbook.getWorksheet('Tarifario');
   const data=XLSX.read(bytes,{type:'array'});const roundtrip=api.readTariffReference(bytes);
   const old=XLSX.utils.book_new();XLSX.utils.book_append_sheet(old,XLSX.utils.aoa_to_sheet(matrix),'Tarifario');const legacy=api.readTariffReference(XLSX.write(old,{type:'array',bookType:'xlsx'}));
   return {cost:sheet.getCell('F7').value,storeCost:sheet.getCell('G7').value,supplier:sheet.getCell('M7').value,missing:sheet.getCell('G8').value,logo:sheet.getImages().length,headers:sheet.getRow(6).values.slice(1),editable:sheet.getCell('P7').value,fill:sheet.getCell('P7').fill.fgColor.argb,formula:sheet.getCell('U7').value.formula,profit:sheet.getCell('H7').value,creditek:sheet.getCell('J7').value,missingProfit:sheet.getCell('H8').value,roundtrip:roundtrip.length,legacy:legacy.length,sheets:data.SheetNames,bytes:Array.from(new Uint8Array(bytes))};
  });
  assert.equal(result.cost,350000);assert.equal(result.storeCost,370000);assert.equal(result.supplier,'B');assert.equal(result.missing,null);assert.equal(result.logo,1);assert.equal(result.headers[0],'Código');assert.equal(result.headers.length,22);assert.ok(!result.headers.includes('Código KrediYA'));assert.equal(result.editable,null);assert.equal(result.fill,'FFFFF2CC');assert.match(result.formula,/-55000/);assert.match(result.profit.formula,/D7-G7/);assert.equal(result.profit.result,180000);assert.match(result.creditek.formula,/C7-D7-55000/);assert.equal(result.creditek.result,145000);assert.equal(result.missingProfit.result??'','');assert.equal(result.roundtrip,2);assert.equal(result.legacy,2);
  if(process.env.KORA_TEST_OUTPUT)await fs.writeFile(process.env.KORA_TEST_OUTPUT,Buffer.from(result.bytes));
 }finally{await browser.close();}
});
