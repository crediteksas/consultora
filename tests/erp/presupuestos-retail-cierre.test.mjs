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
 assert.equal(report.tables[0].columnTypes[5],'percentage');
 assert.equal(report.tables[0].rows[0][5],1200.75/31007.75);
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

function history(){return [{id:'ha',tienda_codigo:'CK-01',anio:2025,mes:10,venta_total:'960.60',cred_uds:2,cel_uds:2,acc_uds:7,cel_venta:300,acc_venta:100},{id:'hb',tienda_codigo:'CK-02',anio:2025,mes:10,venta_total:1000,cred_uds:0,cel_uds:1,acc_uds:0,cel_venta:100,acc_venta:0}];}
test('crecimiento mismo mes/año anterior por categoría: diferencias exactas, sin modificar el cierre',()=>{
 const current=C.resumir(fixture()),saved=JSON.stringify(current),[a,b]=C.compararConAnterior(current,history());assert.equal(JSON.stringify(current),saved);
 assert.deepEqual(a.categorias.map(m=>[m.valorAnterior,m.variacionAnual,m.crecimientoAnual]),[[960.6,240.15,.25],[2,-2,-1],[2,-1,-.5],[7,0,0]]);
 assert.deepEqual(a.categorias.map(m=>[m.presupuesto,m.realizado,m.cumplimiento]),current[0].categorias.map(m=>[m.presupuesto,m.realizado,m.cumplimiento]));
 assert.equal(b.categorias[0].variacionAnual,-99.9);assert.equal(b.categorias[1].crecimientoAnual,null);assert.equal(b.categorias[1].variacionAnual,1);assert.equal(a.comparativo.mesAnterior,'2025-10');
 const report=C.informe(a);assert.equal(report.tables.length,1);assert.deepEqual(report.tables[0].rows[0],['Ventas (COP)',960.6,31007.75,1200.75,-29807,1200.75/31007.75,240.15,.25]);assert.equal(report.tables[0].columnTypes[7],'percentage');assert.equal(report.tables[0].rows[2][7],-.5);
});
test('histórico ausente, duplicado, incompleto o fallido nunca se reemplaza por cero',()=>{
 const current=C.resumir(fixture());for(const h of [[],[...history(),history()[0]],history().map(x=>({...x,venta_total:null})),history().map(x=>({...x,venta_total:'bad'})),[null]]){
  const a=C.compararConAnterior(current,h)[0];assert.equal(a.categorias[0].valorAnterior,null);assert.equal(a.categorias[0].crecimientoAnual,null);assert.equal(a.categorias[0].variacionAnual,null);assert.equal(a.categorias[0].realizado,1200.75);assert.ok(a.notes.length);
 }
 const a=C.compararConAnterior(current,history(),{errorHistorico:true})[0];assert.equal(a.categorias[0].estadoCrecimiento,'Histórico no disponible');
});
test('unidades históricas cero con venta positiva y base cero/negativa no inventan crecimiento',()=>{
 const cur=C.resumir(fixture()),h=history();h[0].acc_uds=0;h[0].cel_uds=0;h[0].venta_total=0;let a=C.compararConAnterior(cur,h)[0];assert.equal(a.categorias[3].valorAnterior,null);assert.equal(a.categorias[2].valorAnterior,null);assert.equal(a.categorias[0].valorAnterior,0);assert.equal(a.categorias[0].crecimientoAnual,null);assert.equal(a.categorias[0].variacionAnual,1200.75);
 h[0].venta_total=-100;a=C.compararConAnterior(cur,h)[0];assert.equal(a.categorias[0].variacionAnual,1300.75);assert.equal(a.categorias[0].crecimientoAnual,null);
 h[0].acc_venta=0;a=C.compararConAnterior(cur,h)[0];assert.equal(a.categorias[3].valorAnterior,0);assert.equal(a.categorias[3].crecimientoAnual,null);
});
test('mes actual parcial conserva referencia mensual pero no calcula variación/porcentaje incomparable',()=>{
 const cur=C.resumir(fixture()).map(c=>({...c,periodo:{...c.periodo,cerrado:false,corte:'2026-10-15'}}));const a=C.compararConAnterior(cur,history())[0];assert.equal(a.categorias[0].valorAnterior,960.6);assert.ok(a.categorias.every(m=>m.crecimientoAnual===null&&m.variacionAnual===null));assert.match(a.notes.join(' '),/histórico diario verificado/);assert.equal(a.comparativo.comparable,false);
 const shifted=C.resumir(fixture()).map(c=>({...c,periodo:{...c.periodo,mes:'2027-10'}}));assert.equal(C.compararConAnterior(shifted,history())[0].categorias[0].valorAnterior,null);assert.equal(C.compararConAnterior(shifted,history().map(h=>({...h,anio:2026})))[0].categorias[0].crecimientoAnual,.25);
});
test('carga consulta histórico restringido al año/mes y tiendas; su error no oculta resultados actuales',async()=>{
 const x=fixture(),tables={presupuestos:x.presupuestos,ventas:x.ventas,venta_items_lectura:x.items,productos:x.productos,liquidation_operations:x.creditData.operations,aliados_reversiones:x.creditData.reversions,historico_mensual:[...history(),{...history()[0],id:'wrongyear',anio:2024},{...history()[0],id:'wrongmonth',mes:9}]};
 const args={perfil:{activo:true,rol:'gerencia'},tiendas:stores,mes:'2026-10',codigo:'CK-01',now:NOW},sb=client(tables);const [a]=await C.cargar({...args,sb});assert.equal(a.categorias[0].crecimientoAnual,.25);assert.equal(a.notes.length,0);assert.equal(a.tienda.codigo,'CK-01');
 const [b]=await C.cargar({...args,sb:client(tables,'historico_mensual')});assert.equal(b.categorias[0].realizado,1200.75);assert.equal(b.categorias[0].crecimientoAnual,null);assert.equal(b.categorias[0].estadoCrecimiento,'Histórico no disponible');
});

test('un histórico del año actual discordante no convierte falta de operaciones en caída ficticia',()=>{
 const current=C.resumir(fixture()),h=[...history(),{...history()[0],id:'current',anio:2026,venta_total:9000}];const a=C.compararConAnterior(current,h)[0];assert.equal(a.categorias[0].realizado,1200.75);assert.equal(a.categorias[0].crecimientoAnual,null);assert.equal(a.categorias[0].variacionAnual,null);assert.equal(a.categorias[0].estadoCrecimiento,'Resultado actual por conciliar');assert.match(a.notes.join(' '),/no coincide/);
 h[2].venta_total=1200.75;assert.equal(C.compararConAnterior(current,h)[0].categorias[0].crecimientoAnual,.25);
});

test('cantidad cero en el histórico actual con venta positiva impide una caída no verificable',()=>{
 const current=C.resumir(fixture());current[0].categorias[3].realizado=0;const h=[...history(),{...history()[0],id:'current',anio:2026,acc_uds:0,acc_venta:50}];const a=C.compararConAnterior(current,h)[0];assert.equal(a.categorias[3].realizado,0);assert.equal(a.categorias[3].crecimientoAnual,null);assert.equal(a.categorias[3].estadoCrecimiento,'Resultado actual por conciliar');
});

test('cuadro único conserva cuatro filas, valores numéricos, formatos mixtos y avisos sin duplicar el realizado',()=>{
 const a=C.compararConAnterior(C.resumir(fixture()),history())[0],before=JSON.stringify(a),r=C.informe(a),t=r.tables[0];
 assert.equal(JSON.stringify(a),before);assert.equal(r.tables.length,1);assert.equal(t.rows.length,4);assert.equal(t.layout,'matrix');assert.equal(r.orientation,'portrait');assert.equal(t.pdfColumnGroups,undefined);
 assert.equal(t.headers.filter(x=>/Realizado/.test(x)).length,1);assert.equal(t.headers.length,8);assert.match(t.headers[1],/2025/);
 assert.deepEqual(t.rowTypes[0],['text','currency','currency','currency','currency','percentage','currency','percentage']);
 assert.deepEqual(t.rowTypes[1],['text','number','number','number','number','percentage','number','percentage']);
 a.categorias.forEach((m,i)=>{assert.deepEqual(t.rows[i].slice(1),[m.valorAnterior,m.presupuesto,m.realizado,m.diferencia,m.cumplimiento,m.variacionAnual,m.crecimientoAnual]);assert.equal(t.rowNotes[i][5],m.estado);assert.equal(t.rowNotes[i][7],m.estadoCrecimiento);});
 const partial={...a,periodo:{...a.periodo,cerrado:false}};const p=C.compararConAnterior([partial],history())[0];assert.ok(C.informe(p).tables[0].rows.every(row=>row[6]===null&&row[7]===null));
});

test('colores de lectura: límites exactos y datos ausentes sin cambiar ratios o estados',()=>{
 for(const [ratio,tone]of [[1,'positive'],[1.27,'positive'],[.999999,'steady'],[.9999,'steady'],[.900001,'steady'],[.9,'steady'],[.899999,'negative'],[.8999,'negative'],[0,'negative'],[-.01,'negative'],[null,'neutral'],[undefined,'neutral'],[NaN,'neutral'],[Infinity,'neutral'],['1','neutral']])assert.equal(C.tonosCategoria({cumplimiento:ratio}).cumplimiento,tone);
 for(const [ratio,tone]of [[.00001,'positive'],[.42,'positive'],[0,'steady'],[-0,'steady'],[-.00001,'negative'],[-.27,'negative'],[null,'neutral'],[undefined,'neutral'],[NaN,'neutral'],[Infinity,'neutral'],['0','neutral']])assert.equal(C.tonosCategoria({crecimientoAnual:ratio}).crecimiento,tone);
 const c={cumplimiento:1.01,crecimientoAnual:-.2,estado:'Meta alcanzada',estadoCrecimiento:'Disminución'},before=JSON.stringify(c);C.tonosCategoria(c);assert.equal(JSON.stringify(c),before);
});
test('PDF y Excel reciben colores solo para las dos columnas solicitadas, sin mutar valores',()=>{
 const cierre=C.compararConAnterior(C.resumir(fixture()),history())[0],before=JSON.stringify(cierre),report=C.informe(cierre),table=report.tables[0];
 assert.equal(JSON.stringify(cierre),before);assert.equal(table.rowTones.length,4);
 for(let i=0;i<4;i++){
  assert.equal(table.rowTones[i].length,8);assert.deepEqual(table.rowTones[i].filter(Boolean),Object.values(C.tonosCategoria(cierre.categorias[i])));
  for(const col of [0,1,2,3,4,6])assert.equal(table.rowTones[i][col],'');
  assert.equal(table.rows[i][5],cierre.categorias[i].cumplimiento);assert.equal(table.rows[i][7],cierre.categorias[i].crecimientoAnual);
 }
 assert.ok(report.notes.includes(C.LEYENDA_COLORES));assert.match(C.LEYENDA_COLORES,/amarillo desde 90% y hasta menos de 100%/);assert.match(C.LEYENDA_COLORES,/rojo por debajo de 90%/);assert.match(C.LEYENDA_COLORES,/Gris: sin porcentaje comparable/);
});

const ZIP=require('../../creditek/erp/presupuestos-retail-cierre-descarga.js');
test('ZIP de cierres: un nombre PDF seguro por tienda, mismo mes y sin mutar importes',()=>{
 const reports=C.compararConAnterior(C.resumir(fixture()),history()).map(C.informe),before=JSON.stringify(reports),files=ZIP.archivos(reports);
 assert.equal(files.length,2);assert.match(files[0].nombre,/Cierre PPTO Punto Norte CK-01 2026-10\.pdf$/);assert.match(files[1].nombre,/Punto Sur/);assert.equal(JSON.stringify(reports),before);
 reports[0].pdfBatch.tiendaNombre='../Punto / Norte:..';assert.doesNotMatch(ZIP.archivos(reports)[0].nombre,/[\\/:]/);
 assert.equal(reports[0].tables[0].numericPresentation,'large-centered');
});
test('ZIP de cierres: rechaza mezcla, duplicados o cifras no verificables sin inventar PDFs',()=>{
 const make=()=>C.resumir(fixture()).map(C.informe);
 assert.throws(()=>ZIP.archivos([]));assert.throws(()=>ZIP.archivos([make()[0],make()[0]]));
 for(const mutate of [r=>r[1].pdfBatch.mes='2026-09',r=>r[1].pdfBatch.cerrado=false,r=>r[0].tables[0].rows[0][3]=NaN,r=>r[0].tables[0].rows[0][3]='1200',r=>r[0].tables[0].rows.pop(),r=>r[0].scope.business='b2b',r=>r[0].pdfBatch.tiendaCodigo='']){const reports=make();mutate(reports);assert.throws(()=>ZIP.archivos(reports));}
 const partial=make();partial.forEach(r=>r.pdfBatch.cerrado=false);assert.match(ZIP.archivos(partial)[0].nombre,/^Avance PPTO/);
});
