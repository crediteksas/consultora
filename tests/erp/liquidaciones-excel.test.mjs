import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync('creditek/erp/liquidaciones-excel.js','utf8'),context);
const {build,load,loadMany}=context.CreditekLiquidacionesExcel;
const batch=plataforma=>({id:'lote',plataforma,fecha_corte:'2026-09-20',estado:'aprobada'});
const op=overrides=>({id:'op1',reconocida:true,tipo_establecimiento:'propia',imei:'035625324258404',operation_at:'2026-09-20',
  external_id:'CRED-001',normalized_data:{vendedorNombre:'Luisa Pérez'},
  monto_credito:544000,inicial:81600,pagamos:413440,pago_neto_beneficiario:331840,bonos_aplicados:0,utilidad_creditek:130560,
  liquidation_calculations:[{policy_snapshot:{}}],...overrides});
const value=(row,col)=>row[col-1]?.result ?? row[col-1];

test('PayJoy resta la inicial una vez y formula giro y utilidad sin provisión',()=>{
  const t=build(batch('payjoy'),[op()]),r=t.rows[0];
  assert.equal(value(r,9),462400);assert.equal(value(r,12),331840);assert.equal(value(r,20),130560);
  assert.equal(r[14],0);assert.equal(r[17],0);assert.equal(value(r,24),'Coincide');
  assert.equal(r[2],'035625324258404');assert.equal(t.columns[2][2],'@');
  assert.match(r[8].formula,/G6-H6/);assert.match(r[19].formula,/Q6-S6/);
});
test('ALO conserva crédito financiado como ingreso esperado',()=>{
  const r=build(batch('alo'),[op({utilidad_creditek:212160})]).rows[0];
  assert.equal(value(r,9),544000);assert.equal(value(r,20),212160);assert.equal(value(r,24),'Coincide');
});
test('Krediya separa bonos, gasto financiero y provisión de la política guardada',()=>{
  const r=build(batch('krediya'),[op({monto_credito:701250,inicial:123750,valor_comercial:825000,pagamos:637000,
    pago_neto_beneficiario:513250,bonos_aplicados:50000,utilidad_creditek:97340.4,
    liquidation_calculations:[{policy_snapshot:{tasa_gasto_financiero:.004,provision_porcentaje:.28}}]})]).rows[0];
  assert.equal(value(r,16),2805);assert.equal(value(r,17),135195);assert.equal(value(r,19),37854.6);
  assert.equal(value(r,20),97340.4);assert.equal(value(r,24),'Coincide');
});
test('todas las plataformas exportan vendedor, código, lote y responsable sin confundir vendedor y ejecutivo',()=>{
  const t=build(batch('krediya'),[op({tipo_establecimiento:'aliado',ejecutivo_id:'ejecutivo-creditek',ejecutivos:{nombre:'Alexander Fernández'}})]),r=t.rows[0];
  assert.equal(t.headers.slice(-5).join('|'),'Lote|Corte|Vendedor del comercio|Código del crédito|Ejecutivo Creditek / tipo');
  assert.equal(r.at(-3),'Luisa Pérez');assert.equal(r.at(-2),'CRED-001');assert.equal(r.at(-5),'lote');
  assert.equal(r.at(-1),'Alexander Fernández');assert.notEqual(r.at(-3),r.at(-1));
  const retail=build(batch('payjoy'),[op({tipo_establecimiento:'propia'})]).rows[0];
  assert.equal(retail.at(-1),'Tienda propia (Retail)');
});
test('faltantes y bono pendiente no se convierten en cero; diferencias no se ocultan',()=>{
  let r=build(batch('payjoy'),[op({inicial:null})]).rows[0];assert.equal(value(r,20),'Faltan datos');assert.equal(value(r,24),'Faltan datos');
  r=build(batch('payjoy'),[op({tipo_establecimiento:'aliado',ejecutivo_id:null})]).rows[0];assert.equal(value(r,20),'Faltan datos');
  r=build(batch('payjoy'),[op({pago_neto_beneficiario:999})]).rows[0];assert.equal(value(r,24),'REVISAR DIFERENCIA');
  r=build(batch('krediya'),[op()]).rows[0];assert.equal(value(r,19),'Faltan datos');
});
test('excluidas conservan datos fuente sin participar y rechaza duplicados',()=>{
  const r=build(batch('krediya'),[op({reconocida:false})]).rows[0];
  assert.equal(r[6],544000);assert.equal(value(r,9),'');assert.equal(value(r,20),'');assert.equal(value(r,24),'No incluida');
  assert.throws(()=>build(batch('payjoy'),[op(),op()]),/repetidas/);
  assert.throws(()=>build(batch('payjoy'),[op({liquidation_calculations:[{},{}]})]),/varios cálculos/);
});
test('carga todas las páginas del lote, sin truncar al límite de la API',async()=>{
  const ranges=[];const sb={from(name){assert.equal(name,'liquidation_operations');return this;},select(){return this;},eq(key,id){assert.equal(id,'lote');return this;},order(){return this;},async range(a,b){ranges.push([a,b]);return {data:Array.from({length:a===0?500:2},(_,i)=>op({id:String(a+i)}))};}};
  const result=await load(sb,batch('payjoy'));assert.equal(result.rows.length,502);assert.deepEqual(ranges,[[0,499],[500,999]]);
  assert.match(result.rows[501][11].formula,/K507-H507/);
});
test('errores de lectura impiden descargar un archivo parcial',async()=>{
  const sb={from(){return this;},select(){return this;},eq(){return this;},order(){return this;},async range(){return {error:new Error('sin acceso')};}};
  await assert.rejects(()=>load(sb,batch('payjoy')),/sin acceso/);
});
test('genera una hoja consolidada por financiera para todos los lotes visibles',async()=>{
  const batches=[batch('krediya'),{...batch('payjoy'),id:'payjoy-lote'},{...batch('alo'),id:'alo-lote'}];
  const sb={from(){return this;},select(){return this;},eq(_key,id){this.id=id;return this;},order(){return this;},async range(){return {data:[op({id:`op-${this.id}`,liquidation_id:this.id})]};}};
  const tables=await loadMany(sb,batches);
  assert.equal(tables.map(table=>table.heading).join('|'),'Krediya|PayJoy|ALO Credit');
  assert.ok(tables.every(table=>table.headers.includes('Vendedor del comercio')&&table.headers.includes('Código del crédito')&&table.headers.includes('Ejecutivo Creditek / tipo')));
});
test('integración sustituye solo tarjetas y conserva resumen y otras tablas',()=>{
  const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
  const exporter=fs.readFileSync('creditek/erp/kora-report-export.js','utf8');
  assert.match(app,/sourceId === 'detailBody'/);assert.match(app,/loadMany\(sb, exportBatches\)/);
  assert.match(app,/Hojas por financiera/);
  assert.match(exporter,/await window.KoraReportData.prepareExcel/);assert.match(exporter,/fullCalcOnLoad=true/);
  assert.match(exporter,/structuredSheet\(workbook,table,index,report,imageId\)/);
  assert.match(exporter,/sheet\.addImage\(imageId/);
  assert.match(exporter,/addWorksheet\('Resumen'/);assert.match(exporter,/addConditionalFormatting/);
});
