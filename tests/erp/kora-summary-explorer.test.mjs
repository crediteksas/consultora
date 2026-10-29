import test from 'node:test';
import assert from 'node:assert/strict';
import X from '../../creditek/erp/kora-sales-explorer.js';
import{readFile}from'node:fs/promises';
const U=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('Retail conserva total del documento, cantidades y diferencias separadas de referencias',()=>{
 const sales=[{id:U(1),consecutivo:10,fecha:'2026-10-01',tienda_codigo:'CK-01',total:100000}];
 const items=[{id:U(2),venta_id:U(1),cantidad:2,precio_venta:30000,utilidad:15000,productos:{nombre:'Equipo A'}},{id:U(3),venta_id:U(1),cantidad:1,precio_venta:50000,utilidad:7000,productos:{nombre:'Equipo B'}}];
 const rows=X.fromRetail(sales,items,new Map([['CK-01','Tienda de prueba']]));
 assert.deepEqual(X.summarize(rows),{documents:1,quantity:3,amount:10000000,missing:0});
 assert.equal(rows.at(-1).amount,-1000000);assert.equal(rows.at(-1).reference,'Diferencia del total registrado');assert.equal(rows.at(-1).quantity,0);
 assert.equal(X.summarize(X.fromRetail(sales,items,new Map(),true)).amount,2200000);
 assert.equal(X.summarize(X.fromRetail(sales,[],new Map(),true)).amount,null);
});
test('desglose respeta nombres ausentes, pérdidas y reversión sin duplicar documentos',()=>{
 const rows=X.fromOperations([{id:U(1),operation_at:'2026-11-01T03:59:00Z',origen_codigo:'CK-01',monto_base:100000,liquidation_id:U(9)},{id:'reversion|'+U(2),reversion_id:U(2),operation_at:'2026-11-01T03:59:00Z',origen_codigo:'CK-01',monto_base:-100000,liquidation_id:U(9)}]);
 assert.equal(rows[0].date,'2026-10-31');assert.equal(rows[0].reference,'Referencia no informada');assert.equal(X.summarize(rows).amount,0);assert.equal(X.summarize(rows).quantity,0);
 const b=X.fromB2B([{margen_id:U(3),fecha:'2026-10-01',tienda_codigo:'A',tienda_nombre:'Mismo nombre',cantidad:2,facturado:100,costo:150,utilidad:-50,remision_id:U(8)}],true);
 assert.equal(b[0].amount,-5000);assert.match(b[0].href,/remisiones.html\?documento=/);
});
test('identidad de tienda no se deduce del nombre y los filtros se intersectan',()=>{
 const rows=[{id:'a',storeKey:'A',store:'Mismo nombre',reference:'Equipo',document:'Venta 1',documentKey:'1',platform:'Retail',amount:100,quantity:1},{id:'b',storeKey:'B',store:'Mismo nombre',reference:'Equipo',document:'Venta 2',documentKey:'2',platform:'Retail',amount:200,quantity:2}];
 assert.equal(X.groupRows(rows,'store').length,2);assert.equal(X.groupRows(rows,'reference').length,1);
 assert.deepEqual(X.filterRows(rows,{store:'B',reference:'Equipo',search:'venta 2'}).map(r=>r.id),['b']);assert.equal(X.filterRows(rows,{store:'A',reference:'Otro'}).length,0);
 assert.equal(X.summarize([...rows,{...rows[0],amount:null}]).amount,null);
});
test('rango y enlaces rechazan fechas inválidas, JavaScript y destinos externos',()=>{
 assert.throws(()=>X.range({from:'2026-02-30',to:'2026-03-01'}));assert.throws(()=>X.range({from:'2026-10-20',to:'2026-10-01'}));
 for(const href of ['javascript:alert(1)','https://example.com/ventas.html','http://[','//evil.invalid/creditek/erp/ventas.html'])assert.equal(X.safeHref(href),'');
 assert.equal(X.documentLink('retail','incorrecto'),'');assert.match(X.safeHref(X.documentLink('retail',U(1))),/^ventas.html\?documento=/);
});
test('lectura paginada consulta todas las filas y falla sin devolver una respuesta parcial',async()=>{
 const calls=[];const sb={from(table){return{select(){return this},order(){return this},range(from,to){calls.push([table,from,to]);return Promise.resolve({data:Array.from({length:from===0?500:1},(_,i)=>({id:from+i}))})}}}};
 assert.equal((await X.allRows(sb,'ventas','id')).length,501);assert.deepEqual(calls,[['ventas',0,499],['ventas',500,999]]);
 sb.from=()=>({select(){return this},order(){return this},range(from){return Promise.resolve(from?{error:Error('fictitious failure')}:{data:Array.from({length:500},(_,id)=>({id}))})}});
 await assert.rejects(()=>X.allRows(sb,'ventas','id'),/fictitious failure/);
});
test('gastos conservan signo y datos faltantes no se convierten en cero',()=>{
 const rows=X.ledgerRows([{id:'e',date:'2026-10-01',value:-700.25}],'Gasto general');assert.equal(X.summarize(rows).amount,-70025);assert.equal(rows[0].quantity,0);
 assert.equal(X.summarize(X.ledgerRows([{id:'m',value:null}],'Dato pendiente')).amount,null);
});

test('liquidación abre el lote existente y la fecha de operación usa el calendario del origen',async()=>{
 const row=X.fromOperations([{id:U(1),operation_at:'2026-11-01T03:59:00Z',liquidation_id:U(9)}],new Map(),false,()=> '2026-10-31')[0];
 assert.equal(row.date,'2026-10-31');assert.equal(row.href,'aliados-liquidaciones.html?lote='+U(9));
 const page=await readFile(new URL('../../creditek/erp/aliados-liquidaciones.html',import.meta.url),'utf8');
 assert.match(page,/aliados-liquidaciones-app\.js/);
 const app=await readFile(new URL('../../creditek/erp/aliados-liquidaciones-app.js',import.meta.url),'utf8');
 assert.match(app,/requestedBatch=new URLSearchParams\(location.search\).get\('lote'\)/);assert.match(app,/await openDetail\(requestedBatch\)/);
});
