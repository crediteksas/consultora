import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtures,html} from '../fixtures/reportes-periodo/harness.mjs';
const plain=s=>s.replace(/\s/g,'');
test('presupuesto incluye ventas posteriores a la fila 1000 y excluye futuras/anuladas',async()=>{
 const h=await harness();await h.run('cargarPresupuesto()');const rows=h.table('tbody-presupuesto');
 assert.match(plain(rows),/60\.000/);assert.match(plain(rows),/60\.500/);
 assert.deepEqual(h.calls.filter(x=>x.table==='ventas').map(x=>[x.from,x.to]),[[0,499],[500,999],[1000,1499]]);
 assert.ok(h.calls.every(x=>x.orders.includes('id')));
 assert.match(rows,/Tienda ficticia Tres/); // genuine zero remains a zero
});
test('el filtro de tienda se repite en cada página del presupuesto',async()=>{
 const h=await harness({filter:['S02']});await h.run('cargarPresupuesto()');
 assert.doesNotMatch(h.table('tbody-presupuesto'),/Tienda ficticia Uno/);
 assert.match(plain(h.table('tbody-presupuesto')),/60\.500/);
 assert.ok(h.calls.every(x=>x.filters.some(f=>f[0]==='eq'&&f[1]==='tienda_codigo'&&f[2]==='S02')));
});
test('fallo en la segunda página no deja cifras viejas ni falsos ceros',async()=>{
 const h=await harness({fail:{table:'ventas',from:500}});h.context.document.getElementById('tbody-presupuesto').innerHTML='cifra anterior';
 await assert.rejects(h.run('cargarPresupuesto()'),e=>e.message==='Fallo ficticio de página');
 assert.match(h.table('tbody-presupuesto'),/No se pudo completar/);assert.doesNotMatch(h.table('tbody-presupuesto'),/cifra anterior|0\.0%/);
});
test('presupuesto mantiene el día de Colombia cuando UTC ya cambió de mes',async()=>{
 const h=await harness({now:'2026-12-01T02:00:00Z'});await h.run('cargarPresupuesto()');
 const q=h.calls.find(x=>x.table==='ventas');assert.ok(q.filters.some(f=>f[0]==='lte'&&f[2]==='2026-11-30'));
 assert.ok(q.filters.some(f=>f[0]==='gte'&&f[2]==='2026-11-01'));
});
const setupProfit=async({role='gerencia',cost=60,filter=[]}={})=>{
 const data={ventas:[{id:'v1',fecha:'2026-11-10',tienda_codigo:'S01',total:100,anulada:false,origen:{nombre:'Tienda ficticia Uno'},venta_items:[{cantidad:1,costo_congelado:cost,productos:{tipo:'serializado'}}]}],venta_items_lectura:[{id:'i1',venta_id:'v1',cantidad:1,costo_congelado:cost,ventas:{tienda_codigo:'S01',fecha:'2026-11-10',anulada:false}}],gastos:[{id:'g1',tienda_codigo:'S01',monto:10,estado:'aprobado',created_at:'2026-11-10T17:00:00Z'},{id:'g2',tienda_codigo:'S01',monto:999,estado:'rechazado',created_at:'2026-11-10T17:00:00Z'}]};
 const h=await harness({data,role,filter});h.context.fixtureSales=data.ventas;
 h.run(`rangoPersonalizado={desde:'2026-11-01',hasta:'2026-11-25'};periodoActual='personalizado';var fixtureCache={obtener:async key=>({data:key==='bajas'?[{tienda_codigo:'S01',valor:5}]:fixtureSales})};`);return h;
};
test('utilidad comparte exactamente el P&L: ventas menos costo, gastos y bajas',async()=>{
 const h=await setupProfit();const rows=await h.run('cargarRentabilidadTienda(fixtureCache)');assert.equal(rows.get('S01').utilidad,25);
 h.context.profit=rows;await h.run('cargarVentas(fixtureCache, Promise.resolve(profit))');
 assert.match(plain(h.table('tbody-ventas')),/\$25/);assert.match(plain(h.table('tbody-rent-tienda')),/\$25/);
 assert.equal(h.calls.filter(x=>x.table==='venta_items_lectura').length,1);
});
test('utilidad respeta rango seleccionado y no incluye gastos fuera de él',async()=>{
 const h=await setupProfit();h.run(`rangoPersonalizado={desde:'2026-11-11',hasta:'2026-11-25'}`);
 const rows=await h.run('cargarRentabilidadTienda({obtener:async()=>({data:[]})})');assert.equal(rows.size,0);
 assert.ok(h.calls.filter(x=>x.table==='ventas').every(x=>x.filters.some(f=>f[0]==='gte'&&f[2]==='2026-11-11')));
});
test('costo desconocido se presenta Por confirmar, nunca como ganancia',async()=>{
 const h=await setupProfit({cost:null});h.context.profit=await h.run('cargarRentabilidadTienda(fixtureCache)');await h.run('cargarVentas(fixtureCache, Promise.resolve(profit))');
 assert.match(h.table('tbody-ventas'),/Por confirmar/);
});
test('una pérdida conserva signo y color',async()=>{
 const h=await setupProfit({cost:110});h.context.profit=await h.run('cargarRentabilidadTienda(fixtureCache)');await h.run('cargarVentas(fixtureCache, Promise.resolve(profit))');
 assert.equal(h.context.profit.get('S01').utilidad,-25);assert.match(h.table('tbody-ventas'),/text-red-700/);assert.match(plain(h.table('tbody-ventas')),/-\$25/);
});
test('admin_tienda no recibe la columna de utilidad ni consultas centrales',async()=>{
 const h=await setupProfit({role:'admin_tienda'});h.context.profit=await h.run('cargarRentabilidadTienda(fixtureCache)');await h.run('cargarVentas(fixtureCache, profit)');
 assert.equal(h.calls.length,0);assert.equal((h.table('tbody-ventas').match(/<td /g)||[]).length,6);assert.doesNotMatch(h.table('tbody-ventas'),/Por confirmar|solo-central/);
});
test('el fallo de rentabilidad limpia la fila anterior y propaga bloqueo',async()=>{
 const h=await setupProfit();h.context.document.getElementById('tbody-ventas').innerHTML='utilidad anterior';
 await assert.rejects(h.run(`cargarVentas(fixtureCache, Promise.reject(new Error('prueba ficticia')))`),/prueba ficticia/);
 assert.match(h.table('tbody-ventas'),/No se pudo completar/);assert.doesNotMatch(h.table('tbody-ventas'),/utilidad anterior/);
});
test('título de utilidad reemplaza comparación semanal, con fuente y alcance claros',()=>{
 assert.doesNotMatch(html,/vs sem\. pasada|con comparación semanal/);
 assert.match(html,/Utilidad del período/);assert.match(html,/Los gastos generales no distribuidos/);
 assert.match(html,/const rentabilidad = cargarRentabilidadTienda\(cache\)/);
});
test('un cambio de filtro durante la paginación no mezcla las tiendas de un ciclo',async()=>{
 const h=await harness({filter:['S02']});h.run(`var originalFrom=sb.from;sb.from=function(table){const q=originalFrom(table);const range=q.range;q.range=async function(from,to){const result=await range(from,to);if(table==='ventas'&&from===0)tiendasFiltro=['S01'];return result;};return q;};`);
 await h.run('cargarPresupuesto()');assert.match(plain(h.table('tbody-presupuesto')),/60\.500/);
 assert.ok(h.calls.filter(x=>x.table==='ventas').every(x=>x.filters.some(f=>f[1]==='tienda_codigo'&&f[2]==='S02')));
});
test('auditoría conserva la misma utilidad que gerencia',async()=>{
 const h=await setupProfit({role:'auditoria'});h.context.profit=await h.run('cargarRentabilidadTienda(fixtureCache)');await h.run('cargarVentas(fixtureCache, Promise.resolve(profit))');
 assert.equal(h.context.profit.get('S01').utilidad,25);assert.equal((h.table('tbody-ventas').match(/<td /g)||[]).length,7);
});
test('refresco fallido bloquea la exportación aunque existan ventas de otra sección',async()=>{
 const h=await harness({fail:{table:'ventas',from:500}});
 h.run(`KoraAlertasCelulares={mount(){}};cargarKPIs=async()=>{};cargarVentas=async()=>{};cargarCartera=async()=>{};cargarInventario=async()=>{};cargarRentabilidadTienda=async()=>{};cargarRentabilidadCategoria=async()=>{};cargarCrecimiento=async()=>{};cargarTopProductos=async()=>{};cargarProveedores=async()=>{};reportesListos=true;`);
 await h.run('refrescarTodo()');assert.equal(h.run('reportesListos'),false);
 assert.throws(()=>h.run('window.KoraReportData.prepareExcel({})'),/incompleta/);
 assert.match(h.context.document.getElementById('estado-reportes').textContent,/Consulta incompleta/);
});
test('un fallo de gastos generales limpia también rentabilidad y sus totales',async()=>{
 const h=await setupProfit();await h.run('cargarRentabilidadTienda(fixtureCache)');assert.ok(h.footers.get('tbody-rent-tienda').innerHTML);
 h.context.window.CreditekTableroUtilidad.authorizedExpenses=async()=>{throw new Error('gastos generales ficticios no disponibles');};
 await assert.rejects(h.run('cargarRentabilidadTienda(fixtureCache)'),/no disponibles/);
 assert.match(h.table('tbody-rent-tienda'),/No se pudo completar/);assert.equal(h.footers.get('tbody-rent-tienda').innerHTML,'');
});
test('tienda sin meta tiene mensaje local y un error posterior retira ese aviso',async()=>{
 const h=await harness({role:'admin_tienda',filter:['SIN_META']});await h.run('cargarPresupuesto()');
 assert.match(h.context.document.getElementById('msg-presupuestos').textContent,/tiendas seleccionadas/);
 h.run(`sb.from=()=>{throw new Error('fallo ficticio')}`);await assert.rejects(h.run('cargarPresupuesto()'),/fallo ficticio/);
 assert.equal(h.context.document.getElementById('msg-presupuestos').textContent,'');
});
test('orquestación comparte P&L real una sola vez y conserva rango/filtro del ciclo',async()=>{
 const h=await setupProfit({filter:['S01']});h.context.originalData=h.data;
 h.context.sbCalls=[];
 h.run(`KoraAlertasCelulares={mount(){}};cargarKPIs=async()=>{};cargarCartera=async()=>{};cargarInventario=async()=>{};cargarPresupuesto=async()=>{};cargarRentabilidadCategoria=async()=>{};cargarCrecimiento=async()=>{};cargarTopProductos=async()=>{};cargarProveedores=async()=>{};sb.rpc=()=>({order(){return this},range:async()=>({data:[{tienda_codigo:'S01',valor:5}]})});`);
 await h.run('refrescarTodo()');assert.equal(h.run('reportesListos'),true);
 assert.equal(h.calls.filter(x=>x.table==='venta_items_lectura').length,1);
 assert.match(plain(h.table('tbody-ventas')),/\$25/);
 const sales=h.calls.filter(x=>x.table==='ventas');assert.equal(sales.length,2);
 assert.ok(sales.every(x=>x.filters.some(f=>f[0]==='gte'&&f[2]==='2026-11-01')&&x.filters.some(f=>f[0]==='lte'&&f[2]==='2026-11-25')));
});

test('inventario usa páginas de cien y conserva filtro, orden y caché compartida',async()=>{
 const data={stock_cantidad_lectura:Array.from({length:205},(_,i)=>({producto_id:String(i).padStart(4,'0'),tienda_codigo:'S01',cantidad:2,costo_promedio:5})),unidades_lectura:[]};
 data.stock_cantidad_lectura.push({producto_id:'9999',tienda_codigo:'S02',cantidad:9,costo_promedio:99});
 const h=await harness({data,filter:['S01']});
 const [first,second]=await h.run(`(async()=>{const c=crearCacheRefresco();return Promise.all([c.obtener('inventario'),c.obtener('inventario')]);})()`);
 assert.equal(first,second);assert.equal(first[1].data.length,205);
 assert.equal(first[1].data.reduce((sum,r)=>sum+r.cantidad*r.costo_promedio,0),2050);
 const calls=h.calls.filter(c=>c.table==='stock_cantidad_lectura');
 assert.deepEqual(calls.map(c=>[c.from,c.to]),[[0,99],[100,199],[200,299]]);
 assert.ok(calls.every(c=>c.filters.some(f=>f[0]==='eq'&&f[1]==='tienda_codigo'&&f[2]==='S01')&&c.orders.join(',')==='tienda_codigo,producto_id'));
});
