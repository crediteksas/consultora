import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const C=require('../../creditek/erp/presupuestos-retail-cierre.js');
const NOW=new Date('2026-11-02T12:00:00Z');
const stores=[{codigo:'CK-01',nombre:'Punto Norte'},{codigo:'CK-02',nombre:'Punto Sur'}];
function fixture(){
 const presupuestos=stores.flatMap(t=>Array.from({length:31},(_,i)=>({id:t.codigo+i,tienda_codigo:t.codigo,fecha:'2026-10-'+String(i+1).padStart(2,'0'),meta_venta_total:'1000.25',meta_creditos:1,meta_uds_cel:2,meta_uds_acc:3})));
 const ventas=[{id:'A',fecha:'2026-10-05',tienda_codigo:'CK-01',tipo:'contado',total:'500.50',anulada:false},{id:'B',fecha:'2026-10-15',tienda_codigo:'CK-01',tipo:'credito',total:'700.25',anulada:false},{id:'C',fecha:'2026-10-01',tienda_codigo:'CK-02',tipo:'contado',total:'900.10',anulada:false},{id:'cancel',fecha:'2026-10-09',tienda_codigo:'CK-01',tipo:'contado',total:99999,anulada:true},{id:'future',fecha:'2026-11-01',tienda_codigo:'CK-01',tipo:'contado',total:88888,anulada:false}];
 const productos=[{id:'phone',tipo:'serializado'},{id:'case',tipo:'cantidad'}];
 const items=[{id:'a1',venta_id:'A',producto_id:'phone',cantidad:1},{id:'a2',venta_id:'A',producto_id:'case',cantidad:5},{id:'b1',venta_id:'B',producto_id:'phone',cantidad:1},{id:'b2',venta_id:'B',producto_id:'case',cantidad:2},{id:'c1',venta_id:'C',producto_id:'phone',cantidad:2},{id:'c2',venta_id:'C',producto_id:'case',cantidad:3}];
 const original={id:'old',plataforma:'payjoy',external_id:'old',operation_at:'2026-09-01T15:00:00Z',origen_codigo:'CK-01',tipo_establecimiento:'propia',reconocida:true,utilidad_creditek:0};
 const active={id:'op1',plataforma:'payjoy',external_id:'same',operation_at:'2026-10-02T15:00:00Z',origen_codigo:'CK-01',tipo_establecimiento:'propia',reconocida:true,utilidad_creditek:0};
 const creditData={operations:[original,active,{...active,id:'op2',reconocida:false,utilidad_creditek:null},{...active,id:'tz',external_id:'boundary',operation_at:'2026-10-01T01:00:00Z'},{...active,id:'sur',external_id:'south',origen_codigo:'CK-02'},{...active,id:'tracking',external_id:'track',utilidad_creditek:null,normalized_data:{seguimientoPagoKrediya:true}}],reversions:[{id:'r1',tipo:'reversion_liquidada',fecha:'2026-10-20',liquidation_id:'l1',snapshot:{original,calculo:{policy_snapshot:{}}}}]};
 return {tiendas:stores,mes:'2026-10',presupuestos,ventas,items,productos,creditData,now:NOW};
}
test('período usa Colombia, límites exactos, febrero bisiesto y mes actual parcial',()=>{
 assert.deepEqual(C.periodo('2026-10',NOW),{mes:'2026-10',inicio:'2026-10-01',fin:'2026-11-01',dias:31,corte:'2026-10-31',cerrado:true,finReal:'2026-11-01'});
 assert.equal(C.periodo('2026-11',NOW).corte,'2026-11-02');
 assert.equal(C.periodo('2026-11',NOW).cerrado,false);
 assert.equal(C.periodo('2028-02',new Date('2028-03-01T12:00Z')).dias,29);
 assert.equal(C.periodo('2026-12',new Date('2027-01-01T12:00Z')).fin,'2027-01-01');
 assert.equal(C.diaColombia(new Date('2026-11-01T02:00Z')),'2026-10-31');
 for(const m of ['2026-13','2026-00','2026-1','','2027-01'])assert.throws(()=>C.periodo(m,NOW));
});
test('cuatro categorías, dinero exacto y fuentes actuales sin mezclar tiendas',()=>{
 const [a,b]=C.resumir(fixture());
 assert.deepEqual(a.categorias.map(m=>[m.id,m.presupuesto,m.realizado,m.diferencia]),[['ventas',31007.75,1200.75,-29807],['creditos',31,0,-31],['celulares',62,1,-61],['accesorios',93,7,-86]]);
 assert.equal(b.categorias[0].realizado,900.10);assert.equal(b.categorias[1].realizado,1);
 assert.equal(a.categorias[0].cumplimiento,1200.75/31007.75);
 assert.equal(a.notes.length,0);
 const report=C.informe(a);
 assert.equal(report.tables[0].columnTypes[3],'percentage');
 assert.equal(report.tables[0].rows[0][3],1200.75/31007.75);
 assert.match(report.title,/Punto Norte/);assert.doesNotMatch(JSON.stringify(report),/Punto Sur|cliente|external_id|op1|TOKEN/);
 assert.equal(report.mode,'summary');assert.match(report.notes.join(' '),/Liquidaciones/);
});
test('metas incompletas no se presentan como ceros ni como totales mensuales',()=>{
 const x=fixture();x.presupuestos.find(b=>b.tienda_codigo==='CK-01'&&b.fecha==='2026-10-15').meta_uds_acc=null;
 const a=C.resumir(x)[0];assert.equal(a.categorias[3].presupuesto,null);assert.equal(a.categorias[3].realizado,7);assert.equal(a.categorias[3].diferencia,null);assert.equal(a.categorias[3].cumplimiento,null);
 assert.match(a.notes.join(' '),/30 de 31 días/);assert.equal(a.categorias[0].presupuesto,31007.75);
 const y=fixture();y.presupuestos=[];assert.ok(C.resumir(y)[0].categorias.every(m=>m.presupuesto===null&&m.cumplimiento===null));
});
test('cero explícito es sin meta; no aparece un cumplimiento infinito ni un premio',()=>{
 const x=fixture();x.presupuestos.forEach(b=>{for(const m of C.METRICAS)b[m.campo]=0;});
 const a=C.resumir(x)[0];assert.ok(a.categorias.every(m=>m.presupuesto===0&&m.cumplimiento===null&&m.estado==='Sin meta asignada'));
 assert.doesNotMatch(JSON.stringify(C.informe(a)),/Infinity|premio/);
});
test('faltan referencias o detalle: conserva ventas/créditos y marca unidades desconocidas',()=>{
 const x=fixture();x.productos=x.productos.filter(p=>p.id!=='case');
 const a=C.resumir(x)[0];assert.equal(a.categorias[0].realizado,1200.75);assert.equal(a.categorias[1].realizado,0);assert.equal(a.categorias[3].realizado,null);assert.equal(a.categorias[2].realizado,null);
 const y=fixture();y.items=y.items.filter(i=>i.venta_id!=='B');const b=C.resumir(y)[0];assert.equal(b.categorias[2].realizado,1);assert.equal(b.categorias[3].realizado,null);
});
test('filas duplicadas y datos inválidos fallan sin aparentar un cierre válido',()=>{
 for(const mutate of [x=>x.presupuestos.push({...x.presupuestos[0]}),x=>x.ventas.push({...x.ventas[0]}),x=>x.items.push({...x.items[0]}),x=>x.productos.push({...x.productos[0]}),x=>x.ventas[0].total=null,x=>x.ventas[0].total='NaN',x=>x.items[0].cantidad=-1,x=>x.items[0].cantidad=1.5,x=>x.presupuestos[0].meta_creditos=-2]){
  const x=fixture();mutate(x);assert.throws(()=>C.resumir(x));
 }
 assert.throws(()=>C.tiendasElegidas(stores,'OTHER'));assert.throws(()=>C.tiendasElegidas([...stores,stores[0]],'__todas__'));
});
function client(tables,failTable=null){
 const calls=[];
 return {calls,from(table){
  const predicates=[];let key='id';
  const q={select(columns){calls.push({table,columns});return this;},gte(c,v){predicates.push(r=>r[c]>=v);return this;},lt(c,v){predicates.push(r=>r[c]<v);return this;},eq(c,v){predicates.push(r=>r[c]===v);return this;},in(c,v){predicates.push(r=>v.includes(r[c]));return this;},order(k){key=k;return this;},async range(a,b){return table===failTable?{data:null,error:Error('Fallo ficticio de consulta')}:{data:(tables[table]||[]).filter(r=>predicates.every(p=>p(r))).sort((a,b)=>String(a[key]).localeCompare(String(b[key]))).slice(a,b+1),error:null};}};
  return q;
 },rpc(){throw Error('Un cierre de consulta no debe escribir.');}};
}
test('carga solo consulta, pagina más de 500 ventas y mantiene el mes seleccionado',async()=>{
 const x=fixture();const ventas=Array.from({length:601},(_,i)=>({id:'v'+String(i).padStart(4,'0'),fecha:'2026-10-05',tienda_codigo:'CK-01',tipo:'contado',total:'0.10',anulada:false}));
 const sb=client({presupuestos:x.presupuestos,ventas,venta_items_lectura:ventas.map((v,i)=>({id:'i'+i,venta_id:v.id,producto_id:'phone',cantidad:1})),productos:x.productos,liquidation_operations:x.creditData.operations,aliados_reversiones:x.creditData.reversions});
 const [a]=await C.cargar({sb,perfil:{activo:true,rol:'gerencia'},tiendas:stores,mes:'2026-10',codigo:'CK-01',now:NOW});
 assert.equal(a.categorias[0].realizado,60.1);assert.equal(a.categorias[2].realizado,601);
 assert.ok(sb.calls.filter(c=>c.table==='ventas').length>=2);
 assert.equal(a.tienda.codigo,'CK-01');
 assert.ok(sb.calls.every(c=>!c.columns.includes('cliente_nombre')&&!c.columns.includes('cliente_documento')));
});
test('errores de fuentes y perfiles no autorizados bloquean la preparación sin datos parciales',async()=>{
 const x=fixture(),tables={presupuestos:x.presupuestos,ventas:x.ventas,venta_items_lectura:x.items,productos:x.productos,liquidation_operations:x.creditData.operations,aliados_reversiones:x.creditData.reversions};
 for(const table of Object.keys(tables))await assert.rejects(()=>C.cargar({sb:client(tables,table),perfil:{activo:true,rol:'auditoria'},tiendas:stores,mes:'2026-10',now:NOW}),/Fallo ficticio/);
 for(const perfil of [{activo:true,rol:'admin_tienda'},{activo:false,rol:'gerencia'},null]){
  const sb=client(tables);await assert.rejects(()=>C.cargar({sb,perfil,tiendas:stores,mes:'2026-10',now:NOW}));assert.equal(sb.calls.length,0);
 }
});
