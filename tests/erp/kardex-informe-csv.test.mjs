import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('creditek/erp/kardex.html','utf8');
const code=source.slice(source.indexOf('function filasInformeKardex('),source.indexOf('let productosCache'));
const context=vm.createContext({nombreTienda:c=>c,tipoInfo:t=>({label:t})});vm.runInContext(code,context);
test('CSV kardex cierra cantidades, no costos, y declara la consulta aplicada',()=>{
 const rows=[{created_at:'2026-10-16T05:00:00Z',tienda_codigo:'TEST',tipo:'entrada',cantidad:2,costo:50.25,unidades:{imei:'001234567890123'}},{created_at:'2026-10-16T06:00:00Z',tienda_codigo:'TEST',tipo:'salida',cantidad:1,costo:90}];
 const before=JSON.stringify(rows),filters={corte:'2026-10-16T18:00:00Z',desde:'2026-10-16',hasta:'2026-10-16',tienda:'TEST',tipo:'',producto:'',imei:''};
 const out=context.filasInformeKardex(rows,filters),total=out.find(row=>row[0]==='TOTAL CANTIDADES REGISTRADAS');
 assert.equal(total[6],3);assert.equal(total[7],'');assert.match(total[10],/No equivale a inventario disponible/);
 assert.equal(out[1][4],'001234567890123');assert.equal(out[1][7],50.25);assert.equal(JSON.stringify(rows),before);
 assert.equal(out.find(row=>row[0]==='REGISTROS')[1],2);assert.equal(out.find(row=>row[0]==='CORTE CONSULTADO')[1],filters.corte);
 assert.equal(out.find(row=>row[0]==='FILTROS APLICADOS')[2],'TEST');
 assert.match(context.filasInformeKardex([{...rows[0],cantidad:null}],filters).find(row=>row[0]==='TOTAL CANTIDADES REGISTRADAS')[6],/Pendiente/);
});
test('consulta y exportación usan filtros capturados, no controles editados después',()=>{
 const query=source.slice(source.indexOf('  function consulta()'),source.indexOf('  let data = []'));
 assert.doesNotMatch(query,/getElementById|productoSeleccionadoId/);
 assert.match(source,/contextoInformeKardex=\{\.\.\.filtrosConsulta,corte:instanteConsulta\}/);
 assert.match(source,/filasInformeKardex\(ultimoInformeKardex,contextoInformeKardex\)/);
});
