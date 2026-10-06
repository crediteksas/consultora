import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import domain from '../../creditek/erp/tablero-utilidad.js';
const now=new Date('2026-09-16T17:00:00Z');
test('acumula por día Bogotá, mantiene pérdidas, ceros, faltantes y deja futuro vacío',()=>{
 const result=domain.series([{date:'2026-09-01',value:10},{date:'2026-09-02T04:59:59Z',value:20},{date:'2026-09-02',value:-40},{date:'2026-09-03',value:null},{date:'2026-09-17',value:500},{date:'2026-08-31',value:100}],now);
 assert.deepEqual(result.values.slice(0,3),[30,-10,-10]);assert.equal(result.total,-10);assert.equal(result.missing,1);assert.equal(result.values[16],null);assert.equal(result.values.length,30);
 assert.equal(domain.series([],now).total,0);
 assert.equal(domain.series([],new Date('2028-02-29T17:00:00Z')).values.length,29);
});
test('escala automática basada solo en utilidad, sin límite de 60M ni presupuesto de 134M',()=>{
 const result={...domain.series([{date:'2026-09-01',value:12474644}],now),name:'Retail',budget:134500782};
 const config=domain.chartConfig(result,{money:String,shortMoney:String,color:String});
 assert.equal(config.data.datasets.length,1);assert.equal(config.data.datasets[0].data[15],12474644);
 assert.equal(config.options.scales.y.max,undefined);assert.equal(config.options.scales.y.min,undefined);assert.equal(config.options.scales.y.beginAtZero,true);assert.equal(config.options.scales.y.grace,'15%');
 assert.equal(config.data.datasets[0].tension,0);
});
function database(tables){
 const calls=[];return {calls,rpc:async(name,params)=>{
  if(name==='es_controlador_financiero')return {data:true,error:null};
  if(name==='gastos_inventario_no_monetarios')return {data:(tables.gastos_inventario_no_monetarios||[])
   .filter(r=>r.fecha>=params.p_desde&&r.fecha<=params.p_hasta&&(!params.p_tienda||r.tienda_codigo===params.p_tienda)),error:null};
  throw Error(`RPC inesperada: ${name}`);
 },from(table){calls.push(table);let records=tables[table]||[];const q={select(){return q},order(){return q},gte(k,v){records=records.filter(r=>r[k]>=v);return q},lt(k,v){records=records.filter(r=>r[k]<v);return q},lte(k,v){records=records.filter(r=>r[k]<=v);return q},eq(k,v){records=records.filter(r=>r[k]===v);return q},in(k,v){records=records.filter(r=>v.includes(r[k]));return q},range:async(a,b)=>({data:records.slice(a,b+1)})};return q}};
}
test('Retail muestra margen menos gastos aprobados en el día del cargue; excluye rechazados y otras tiendas',async()=>{
 const sb=database({ventas:[{id:1,fecha:'2026-09-01',tienda_codigo:'t',anulada:false},{id:2,fecha:'2026-09-01',tienda_codigo:'otra',anulada:false},{id:3,fecha:'2026-09-02',tienda_codigo:'t',anulada:true}],venta_items_lectura:[{id:1,venta_id:1,utilidad:100},{id:2,venta_id:2,utilidad:500},{id:3,venta_id:3,utilidad:1000}],gastos:[{id:1,fecha:'2026-08-31',created_at:'2026-09-01T15:00:00Z',tienda_codigo:'t',monto:40,estado:'aprobado'},{id:2,fecha:'2026-09-01',created_at:'2026-09-01T15:00:00Z',tienda_codigo:'t',monto:70,estado:'rechazado'},{id:3,fecha:'2026-09-01',created_at:'2026-09-01T15:00:00Z',tienda_codigo:'otra',monto:30,estado:'aprobado'}],presupuestos:[{id:1,fecha:'2026-09-01',tienda_codigo:'t',meta_utilidad:134500782}]});
 const result=await domain.load(sb,'retail',{now,store:'t'});assert.equal(result.total,60);assert.equal(result.budget,undefined);assert.equal(sb.calls.includes('presupuestos'),false);assert.equal(sb.calls.includes('liquidation_operations'),false);
 const detail=await domain.retailData(sb,{start:'2026-09-01',end:'2026-09-16',store:'t'});assert.equal(detail.expenses.length,1);assert.equal(detail.itemRows.length,1);
});
test('Retail descuenta una baja autorizada como gasto de inventario sin tratarla como salida de caja',async()=>{
 const sb=database({ventas:[{id:1,fecha:'2026-09-01',tienda_codigo:'t',anulada:false}],
  venta_items_lectura:[{id:1,venta_id:1,utilidad:3000}],gastos:[],
  gastos_inventario_no_monetarios:[{id:'baja-1',fecha:'2026-09-02',tienda_codigo:'t',categoria_gasto:'imperfecto',valor:1500}]});
 const result=await domain.load(sb,'retail',{now,store:'t'});
 assert.equal(result.total,1500);
 const detail=await domain.retailData(sb,{start:'2026-09-01',end:'2026-09-16',store:'t'});
 assert.equal(detail.expenses.length,0);assert.equal(detail.writeoffs.length,1);
 assert.equal(detail.rows.filter(r=>r.source==='baja_inventario').length,1);
});
test('Retail pagina todos los artículos, incluso después de mil, y respeta el rango seleccionado',async()=>{
 const items=Array.from({length:1201},(_,i)=>({id:i+1,venta_id:1,utilidad:1}));
 const sb=database({ventas:[{id:1,fecha:'2026-09-10',tienda_codigo:'t',anulada:false}],venta_items_lectura:items,gastos:[{id:1,fecha:'2026-09-10',created_at:'2026-09-10T15:00:00Z',tienda_codigo:'t',monto:201,estado:'aprobado'}]});
 const result=await domain.load(sb,'retail',{now,range:{desde:'2026-09-10',hasta:'2026-09-11'}});
 assert.equal(result.total,1000);assert.equal(result.values.length,2);assert.equal(result.values[0],1000);assert.equal(result.values[1],1000);
 assert.deepEqual(result.labels,['10/09','11/09']);
});
test('Retail consulta artículos en lotes de hasta 200 ventas para no exceder la URL de PostgREST',async()=>{
 const ventas=Array.from({length:201},(_,i)=>({id:i+1,fecha:'2026-09-10',tienda_codigo:'t',anulada:false}));
 const items=ventas.map(v=>({id:v.id,venta_id:v.id,utilidad:1}));
 const sb=database({ventas,venta_items_lectura:items});
 const from=sb.from.bind(sb),sizes=[];
 sb.from=table=>{const query=from(table);if(table==='venta_items_lectura'){
  const originalIn=query.in;
  query.in=(key,ids)=>{sizes.push(ids.length);return originalIn(key,ids)};
 }return query};
 const result=await domain.retailData(sb,{start:'2026-09-10',end:'2026-09-10'});
 assert.equal(result.itemRows.length,201);
 assert.deepEqual(sizes,[200,1]);
});
test('Retail descuenta generales solo del consolidado, al cargue o autorización y nunca al pagar otra vez',async()=>{
 const sb=database({
  ventas:[{id:1,fecha:'2026-09-10',tienda_codigo:'t',anulada:false}],
  venta_items_lectura:[{id:1,venta_id:1,utilidad:1000}],
  gastos:[
   {id:1,fecha:'2026-09-09',created_at:'2026-09-10T15:00:00Z',tienda_codigo:'t',monto:100,estado:'aprobado'},
   {id:2,fecha:'2026-09-09',created_at:'2026-09-10T15:00:00Z',tienda_codigo:'CENTRAL',monto:20,estado:'aprobado'},
   {id:3,fecha:'2026-09-10',created_at:'2026-09-10T15:00:00Z',tienda_codigo:'CENTRAL',monto:80,estado:'rechazado'},
  ],
  financial_entries:[
   {id:1,entry_type:'gasto',scope:'business_general',business_unit:'retail',status:'pagado',amount:30,approved_at:'2026-09-10T05:00:00Z',paid_at:'2026-09-11T12:00:00Z'},
   {id:2,entry_type:'gasto',scope:'business_general',business_unit:'retail',status:'aprobado',amount:40,approved_at:'2026-09-11T04:59:59Z',paid_at:null},
   {id:3,entry_type:'gasto',scope:'business_general',business_unit:'retail',status:'pagado',amount:500,approved_at:'2026-09-11T05:00:00Z'},
   {id:4,entry_type:'gasto',scope:'business_general',business_unit:'retail',status:'rechazado',amount:90,approved_at:'2026-09-10T12:00:00Z'},
   {id:5,entry_type:'retiro_utilidad',scope:'business_general',business_unit:'retail',status:'pagado',amount:100,approved_at:'2026-09-10T12:00:00Z'},
   {id:6,entry_type:'gasto',scope:'business_general',business_unit:'b2b',status:'pagado',amount:100,approved_at:'2026-09-10T12:00:00Z'},
   {id:7,entry_type:'gasto',scope:'retail_store',business_unit:'retail',status:'pagado',amount:100,approved_at:'2026-09-10T12:00:00Z'},
  ],
 });
 const all=await domain.retailData(sb,{start:'2026-09-10',end:'2026-09-10'});
 assert.equal(all.expenses.length,1);
 assert.deepEqual(all.generalExpenses.map(row=>row.amount),[20,30,40]);
 assert.deepEqual(all.generalExpenses.map(row=>row.date),['2026-09-10','2026-09-10','2026-09-10']);
 assert.equal(all.rows.reduce((sum,row)=>sum+Number(row.value),0),810);
 const chart=await domain.load(sb,'retail',{now,range:{desde:'2026-09-10',hasta:'2026-09-10'}});
 assert.equal(chart.total,810);
 const store=await domain.retailData(sb,{start:'2026-09-10',end:'2026-09-10',store:'t'});
 assert.equal(store.generalExpenses.length,0);
 assert.equal(store.rows.reduce((sum,row)=>sum+Number(row.value),0),900);
 assert.equal(sb.calls.filter(table=>table==='financial_entries').length,2);
});
test('no publica un consolidado incompleto si RLS oculta gastos generales',async()=>{
 const sb=database({ventas:[],gastos:[]});sb.rpc=async(name)=>name==='gastos_inventario_no_monetarios'?{data:[],error:null}:{data:false,error:null};
 const result=await domain.retailData(sb,{start:'2026-09-01',end:'2026-09-16'});
 assert.equal(result.generalAvailable,false);
 assert.equal(sb.calls.includes('financial_entries'),false);
 await assert.rejects(domain.load(sb,'retail',{now}),/gastos generales Retail/);
});
test('la fila total del tablero resta generales sin alterar la utilidad individual',()=>{
 const html=fs.readFileSync('creditek/erp/tablero.html','utf8');
 const source=html.slice(html.indexOf('function renderTablaTiendas('),html.indexOf('// ─── Gráficos'));
 const nodes={tbodyTiendas:{innerHTML:''},tfootTotal:{innerHTML:''},emptyTiendas:{style:{}}};
 const ctx={document:{getElementById:id=>nodes[id]},escapeHtml:String,fmtCOP:n=>`$ ${n}`,fmtCorto:String,pintarIconos(){}};
 vm.runInNewContext(source,ctx);
 const row={tienda:{nombre:'Tienda Uno'},creditosMes:1,metaMes:1,pct:100,runRate:1,pctRunRate:100,semaforo:'success',contadoMes:50,margenMes:100,gastosMes:10,utilidadMes:90,utilidadFaltante:0,cajaOk:true};
 ctx.renderTablaTiendas([row],{generalExpenses:[{amount:20}],generalAvailable:true,includeGeneral:true});
 assert.match(nodes.tbodyTiendas.innerHTML,/\$ 90/);
 assert.match(nodes.tfootTotal.innerHTML,/\$ 70/);
 assert.match(nodes.tfootTotal.innerHTML,/generales \$ 20/);
 ctx.renderTablaTiendas([row],{generalExpenses:[{amount:20}],generalAvailable:false,includeGeneral:true});
 assert.match(nodes.tfootTotal.innerHTML,/No disponible/);
 assert.match(nodes.tbodyTiendas.innerHTML,/\$ 90/);
});
test('B2B usa RPC existente, pagina más de 500 filas y descuenta gastos autorizados una vez',async()=>{
 let calls=0;const sb=database({financial_entries:[{id:1,entry_type:'gasto',scope:'business_general',business_unit:'b2b',status:'pagado',amount:100,approved_at:'2026-09-14T15:00:00Z',paid_at:'2026-09-15T15:00:00Z'},{id:2,entry_type:'retiro_utilidad',scope:'business_general',business_unit:'b2b',status:'pagado',amount:500,approved_at:'2026-09-14T15:00:00Z'}]});
 sb.rpc=(name,params)=>name==='es_controlador_financiero'?Promise.resolve({data:true,error:null}):{order(){assert.equal(name,'consultar_utilidad_creditek_rango');assert.equal(params.p_hasta,'2026-09-16');return this},range:async(a)=>{calls++;return {data:Array.from({length:a===0?500:2},(_,i)=>({fecha:'2026-09-01',tienda_codigo:i?'t':'otra',utilidad:10}))}}};
 const result=await domain.load(sb,'b2b',{now});assert.equal(calls,2);assert.equal(result.total,4920);assert.equal(result.budget,undefined);
 await assert.rejects(domain.load(sb,'b2b',{now,store:'t'}),/no se reparten por tienda/);
});
test('Aliados suma terceros y tiendas propias sin doble operación ni filtro Retail',async()=>{
 const op={id:'a',external_id:'a',plataforma:'payjoy',operation_at:'2026-09-01',tipo_establecimiento:'aliado',utilidad_creditek:100};
 const result=await domain.load(database({}),'aliados',{now,store:'tienda-retail',creditData:{operations:[op,{...op,id:'copy'},{...op,id:'retail',external_id:'b',tipo_establecimiento:'propia',utilidad_creditek:999},{...op,id:'pending',external_id:'c',utilidad_creditek:null}],reversions:[]}});
 assert.equal(result.total,1099);assert.equal(result.missing,1);assert.equal(result.budget,undefined);
 assert.match(result.description,/tiendas propias y terceros/);
});
test('Aliados conserva utilidades de los tres motores y solo acumula ventas del mes hasta hoy',async()=>{
 const operations=['payjoy','alo','krediya'].flatMap((plataforma,i)=>['propia','aliado'].map((tipo_establecimiento,j)=>({id:`${i}-${j}`,external_id:`${i}-${j}`,plataforma,tipo_establecimiento,operation_at:'2026-09-16T23:00:00-05:00',utilidad_creditek:(i+1)*100.25+j})));
 const sample=operations[0];
 operations.push({...sample,id:'agosto',external_id:'agosto',operation_at:'2026-09-01T04:59:59Z',utilidad_creditek:9999},{...sample,id:'futuro',external_id:'futuro',operation_at:'2026-09-17T00:00:00-05:00',utilidad_creditek:9999},{...sample,id:'seguimiento',external_id:'seguimiento',utilidad_creditek:null,normalized_data:{seguimientoPagoKrediya:'krediya_pago_pendiente'}});
 const before=JSON.stringify(operations);
 const result=await domain.load(database({}),'aliados',{now,creditData:{operations,reversions:[]}});
 assert.equal(result.total,1206);assert.equal(result.missing,0);assert.equal(result.values[15],1206);assert.equal(result.values[16],null);
 assert.equal(JSON.stringify(operations),before,'El resumen no modifica los cálculos guardados');
});
test('Aliados incluye Addi y descuenta nómina y gastos en autorización, sin descontar giros de nuevo',async()=>{
 const sb=database({
  addi_liquidaciones:[{id:'addi1',estado:'aprobada',fecha_venta:'2026-09-02',utilidad_creditek:50},{id:'addi2',estado:'revisada',fecha_venta:'2026-09-02',utilidad_creditek:900}],
  financial_entries:[{id:1,entry_type:'gasto',scope:'business_general',business_unit:'aliados',status:'pagado',amount:20,approved_at:'2026-09-03T10:00:00Z',paid_at:'2026-10-01T10:00:00Z'},{id:2,entry_type:'retiro_utilidad',scope:'business_general',business_unit:'aliados',status:'pagado',amount:800,approved_at:'2026-09-03T10:00:00Z'}],
  aliados_gastos_operativos:[{id:3,estado:'aprobado',valor:10,aprobado_at:'2026-09-04T10:00:00Z'}],
 });
 const result=await domain.load(sb,'aliados',{now,creditData:{operations:[{id:'op1',external_id:'op1',plataforma:'payjoy',operation_at:'2026-09-01',utilidad_creditek:100}],reversions:[]}});
 assert.equal(result.total,120);
 assert.deepEqual(result.values.slice(0,4),[100,150,130,120]);
});
test('errores de fuente se propagan; no muestran cero ficticio',async()=>{
 await assert.rejects(domain.load({},'invalido',{now}),/Negocio/);
 await assert.rejects(domain.load({rpc(){return {order(){return this},range:async()=>({error:Error('denegado')})}}},'b2b',{now}),/denegado/);
});
test('Aliados reconoce cuatro gastos históricos en septiembre, no en la autorización de octubre',async()=>{
 const historical=[6,13,20,27].map((n,i)=>({id:`hist-${i}`,estado:'aprobado',valor:450000,
  fecha_causacion_historica:`2026-09-${String(n).padStart(2,'0')}`,aprobado_at:'2026-10-06T22:00:00Z'}));
 const sb=database({aliados_gastos_operativos:[...historical,
  // La fecha escrita en un gasto normal no desplaza su autorización real.
  {id:'normal',fecha:'2026-09-06',estado:'aprobado',valor:120,aprobado_at:'2026-10-06T22:00:00Z'},
  {id:'pending',estado:'pendiente',valor:800,aprobado_at:'2026-09-01T12:00:00Z'}]});
 const options={now:new Date('2026-10-06T22:00:00Z'),creditData:{operations:[],reversions:[]}};
 const september=await domain.load(sb,'aliados',{...options,range:{desde:'2026-09-01',hasta:'2026-09-30'}});
 assert.equal(september.total,-1800000);
 assert.deepEqual([5,12,19,26].map(i=>september.values[i]),[-450000,-900000,-1350000,-1800000]);
 const october=await domain.load(sb,'aliados',options);
 assert.equal(october.total,-120,'No descuenta otra vez los históricos al autorizar');
 const full=await domain.authorizedExpenses(sb,'aliados','2026-09-01','2026-10-06');
 assert.equal(full.length,5,'Cada gasto se descuenta una sola vez');
 assert.equal(full.reduce((n,x)=>n+x.value,0),-1800120);
});
test('UI no mezcla respuestas al cambiar rápido de pestaña y elimina gráfica antigua al fallar',async()=>{
 const html=fs.readFileSync('creditek/erp/tablero.html','utf8');
 const source=html.slice(html.indexOf('async function cargarSerieUtilidadAcumulada('),html.indexOf('// ─── Alertas'));
 const nodes={};for(const id of ['chartUtilidad','utilidadTotal','utilidadContexto','utilidadPresupuesto','utilidadPanel','utilidadTitulo'])nodes[id]={setAttribute(){}};
 const pending=[];const ctx={utilidadConsulta:0,utilidadNegocio:'retail',chartUtilidadObj:null,sb:{},document:{getElementById:id=>nodes[id],querySelectorAll:()=>[]},CreditekTableroUtilidad:{load:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),chartConfig:()=>({})},rangoSeleccionado:()=>({desde:'2026-09-01',hasta:'2026-09-16'}),fmtCOP:String,fmtCorto:String,tokenColor:String,nombreTienda:String,Chart:function(){},console:{error(){}}};
 vm.runInNewContext(source,ctx);const first=ctx.cargarSerieUtilidadAcumulada();ctx.utilidadNegocio='b2b';const second=ctx.cargarSerieUtilidadAcumulada();
 const result={name:'B2B',total:70,missing:0,period:{start:'2026-09-01'},today:'2026-09-16',budget:null};pending[1].resolve(result);await second;pending[0].resolve({...result,total:10});await first;
 assert.equal(nodes.utilidadTotal.textContent,'70');assert.match(nodes.utilidadTitulo.textContent,/B2B/);
 ctx.chartUtilidadObj={destroy(){}};const fail=ctx.cargarSerieUtilidadAcumulada();pending[2].reject(Error('error'));await fail;assert.equal(nodes.utilidadTotal.textContent,'No disponible');assert.equal(nodes.chartUtilidad.hidden,true);
 assert.match(html,/role="tablist" aria-label="Negocio de la utilidad"/);assert.match(html,/event.key === 'ArrowRight'/);
});
