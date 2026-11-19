import test from 'node:test';import assert from 'node:assert/strict';import I from '../../creditek/erp/socios-inventario-informe.js';
test('totales incluyen pérdida pendiente sin habilitar retiro ni confundirla con el validado',()=>{
 const cuts=[{listo:true,utilidad_neta:1000.25},{listo:true,utilidad_neta:-300.50},{listo:false,utilidad_neta:-800.75}];
 const original=structuredClone(cuts);
 assert.deepEqual(I.totals(cuts),{general:-101,validated:699.75,pending:-800.75,validCount:2,pendingCount:1});assert.deepEqual(cuts,original);
 assert.equal(I.totals([...cuts,{listo:false,utilidad_neta:null}]).general,null);
});
test('diagnóstico diferencia bloqueo de límite, aviso interior, anuladas y tiendas ajenas',()=>{
 const cut={tienda_codigo:'TEST',inicio_at:'2026-10-07T14:00:00+00:00',fin_at:'2026-11-09T13:00:00+00:00'};
 const sale={tienda_codigo:'TEST',fecha:'2026-10-06',created_at:'2026-10-07T10:00:00-05:00',total:0,venta_items:[{cantidad:6,costo_tienda_congelado:1500}]};
 const rows=I.sales(cut,[sale,{...sale,fecha:'2026-10-13',created_at:'2026-10-18T17:00:00Z'},{...sale,anulada:true},{...sale,tienda_codigo:'OTHER'},{...sale,created_at:'2026-11-09T14:00:00Z'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].blocks,true);assert.equal(rows[0].cost,9000);assert.equal(rows[1].blocks,false);
 assert.equal(I.sales(cut,[{...sale,venta_items:[]}])[0].cost,null);
});

test('corte con fecha sin hora mantiene su día local',()=>{
 const rows=I.sales({tienda_codigo:'T',inicio_at:'2026-09-01',fin_at:'2026-10-09'},[{tienda_codigo:'T',created_at:'2026-09-02T15:00:00Z',fecha:'2026-09-01'}]);assert.equal(rows[0].blocks,true);
});

test('límites sin hora se convierten a medianoche Bogotá en filtro y consulta',()=>{
 const cut={tienda_codigo:'T',inicio_at:'2026-09-01',fin_at:'2026-10-09'};
 const sale={tienda_codigo:'T',fecha:'2026-08-30'};
 const rows=I.sales(cut,[{...sale,created_at:'2026-09-01T01:00:00Z'},{...sale,created_at:'2026-10-09T01:00:00Z'}]);
 assert.equal(rows.length,1);assert.equal(rows[0].created_at,'2026-10-09T01:00:00Z');assert.equal(I.instant(cut.inicio_at),'2026-09-01T00:00:00-05:00');
 assert.equal(I.totals([{listo:false,utilidad_neta:10}]).validated,null);
});
