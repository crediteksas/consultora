import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import C from '../../creditek/erp/b2b-cierres.js';
const context=vm.createContext({window:{},document:{dispatchEvent(){}},CustomEvent:function(){},URL,location:{pathname:'/creditek/erp/ventas',origin:'https://kora.test'}});
vm.runInContext(await readFile('creditek/erp/kora-report-export.js','utf8'),context);
const E=context.window.KoraReportExport;
const plain=value=>JSON.parse(JSON.stringify(value));
test('rutas publicadas sin extensión tienen exactamente los mismos contratos de cierre',()=>{
 const cases=[['ventas','tbodyVentas',[8]],['caja','tbodyConsolidado',[2,3,4,5,6,7]],['caja','tbodyMovimientosCaja',[4,5]],['proveedores','tbody-detalle-lineas',[1,3]],['proveedores','tbody-detalle-pagos',[1]],['proveedores','tbody-facturas',[2]],['conciliacion','tbodyCruzados',[4,5,6]],['conciliacion','tbodySinCruce',[3]],['cartera-b2b','dRows',[2,3,4]],['kardex','tbodyKardex',[5]],['inventario','tbodyAccesorios',[2,5]],['inventario','tbodyCelulares',[4,5]],['tablero','tbodyEjecutivos',[1,2,3,4,5,6]],['remisiones','tbodyRemisiones',[4]],['gastos','tbodyGastos',[3]],['reportes','tbody-ventas',[1,2,4,5]],['traslados','tbodyTraslados',[5]],['cierre-periodo','tbodyBloques',[1]]];
 for(const [route,id,expected] of cases){
  context.location.pathname='/creditek/erp/'+route+'.html';const html=plain(E.tablePolicy(id,[]));
  context.location.pathname='/creditek/erp/'+route;const extensionless=plain(E.tablePolicy(id,[]));
  assert.deepEqual(extensionless,html,route);assert.deepEqual(html.sums,expected,route);
  const rows=Array.from({length:2},(_,i)=>['Registro '+i,...Array(11).fill(i?200.20:100.10)]);
  const table=E.completeTable({headers:Array.from({length:12},(_,i)=>'Columna '+i),rows,sumColumns:html.sums,currencyColumns:html.currency,balanceColumns:html.balances});
  for(const column of expected)assert.equal(E.typedCell(table.totalRows[0][column],html.currency?.includes(column)?'Valor':'Cantidad').value,300.3,`${route} col ${column}`);
  for(let c=1;c<12;c++)if(!expected.includes(c))assert.equal(table.totalRows[0][c],'',`${route}: no sumar otra columna`);
 }
});
test('saldos numéricos de adaptadores no pierden decimales ni se convierten en ausencia',()=>{
 const report=E.completeTable({headers:['Tercero','Saldo'],rows:[['A',100000.25],['B',-20000.75]],balanceColumns:[1]});
 assert.equal(report.totalRows[0][1],'$ 100.000,25');assert.equal(report.totalRows[1][1],'$ 20.000,75');
});
test('margen monetario numérico no se convierte en porcentaje',()=>{
 assert.equal(E.typedCell(12500.25,'Margen').kind,'currency');
 assert.equal(E.typedCell(.25,'Margen %').kind,'percent');
 assert.equal(E.typedCell(12500.25,'Valor').kind,'currency');
 assert.equal(E.typedCell('25','Margen %').kind,'percent');
 assert.equal(E.typedCell('25','Margen %').value,.25);
 assert.equal(E.typedCell('0,25','Participación costos %').value,.25);
 assert.equal(E.typedCell('-25','Margen %').value,-.25);
 assert.equal(E.typedCell(.15,'Margen %').value,.15);
 assert.equal(E.typedCell(1.5,'Crecimiento %').value,1.5);
 assert.equal(E.typedCell(-1.5,'Crecimiento %').value,-1.5);
});
test('cierre B2B declara importes y unidades, no costos unitarios ni precios',()=>{
 const items=[{pedido_id:'a',referencia:'A',producto_id:'a',cantidad:2,costo:100.10,precio:120,proveedor:'P',ciudad:'Ciudad'},{pedido_id:'b',referencia:'B',producto_id:'b',cantidad:1,costo:200.20,precio:240,proveedor:'P',ciudad:'Ciudad'}];
 const tables=C.providerReportTables(items).map(E.completeTable);
 assert.equal(tables[0].totalRows[0][2],'3');assert.equal(tables[0].totalRows[0][4],'$ 400,40');assert.equal(tables[0].totalRows[0][3],'');
 assert.equal(tables[1].totalRows[0][5],'3');assert.equal(tables[1].totalRows[0][6],'');
 const csv=C.providerExportRows(items);assert.deepEqual(csv.at(-1),['TOTAL GENERAL','','',3,'',400.4]);
 assert.equal(csv.filter(row=>row[0]==='TOTAL P').length,1);
 const missing=C.providerExportRows([{...items[0],costo:null}]);assert.match(missing.at(-1).at(-1),/Pendiente/);
});
test('notas permanecen en detalle y se omiten en resumen sin perder aclaración de cálculo',()=>{
 const table=E.completeTable({headers:['Proveedor','Saldo'],rows:[['A','$ 10']],balanceColumns:[1],notes:['A: saldo a favor sin aplicar'],policyNote:'No se compensan terceros'});
 const summary=E.summaryTables([table]);assert.deepEqual(plain(summary[0].notes),[]);assert.equal(summary[0].policyNote,'No se compensan terceros');
 const report={title:'Prueba',id:'AUDIT',filters:[],metrics:[],tables:[table]};assert.match(E.pdfDocument(report),/saldo a favor sin aplicar/);
 assert.doesNotMatch(E.pdfDocument({...report,tables:summary}),/saldo a favor sin aplicar/);
});
