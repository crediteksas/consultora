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
 const calls=[];return {calls,from(table){calls.push(table);let records=tables[table]||[];const q={select(){return q},order(){return q},gte(k,v){records=records.filter(r=>r[k]>=v);return q},lt(k,v){records=records.filter(r=>r[k]<v);return q},lte(k,v){records=records.filter(r=>r[k]<=v);return q},eq(k,v){records=records.filter(r=>r[k]===v);return q},in(k,v){records=records.filter(r=>v.includes(r[k]));return q},range:async(a,b)=>({data:records.slice(a,b+1)})};return q}};
}
test('Retail conserva margen de ventas y presupuesto solo como referencia; filtro de tienda',async()=>{
 const sb=database({ventas:[{id:1,fecha:'2026-09-01',tienda_codigo:'t',anulada:false},{id:2,fecha:'2026-09-01',tienda_codigo:'otra',anulada:false},{id:3,fecha:'2026-09-02',tienda_codigo:'t',anulada:true}],venta_items_lectura:[{id:1,venta_id:1,utilidad:100},{id:2,venta_id:2,utilidad:500},{id:3,venta_id:3,utilidad:1000}],presupuestos:[{id:1,fecha:'2026-09-01',tienda_codigo:'t',meta_utilidad:134500782}]});
 const result=await domain.load(sb,'retail',{now,store:'t'});assert.equal(result.total,100);assert.equal(result.budget,134500782);assert.equal(sb.calls.includes('liquidation_operations'),false);
});
test('B2B usa RPC existente, pagina más de 500 filas y no confunde otra tienda',async()=>{
 let calls=0;const sb={rpc(name,params){assert.equal(name,'consultar_utilidad_creditek_rango');assert.equal(params.p_hasta,'2026-09-16');return {order(){return this},range:async(a)=>{calls++;return {data:Array.from({length:a===0?500:2},(_,i)=>({fecha:'2026-09-01',tienda_codigo:i?'t':'otra',utilidad:10}))}}}}};
 const result=await domain.load(sb,'b2b',{now,store:'t'});assert.equal(calls,2);assert.equal(result.total,5000);assert.equal(result.budget,null);
});
test('Aliados usa liquidaciones propias del negocio, sin Retail ni doble operación',async()=>{
 const op={id:'a',external_id:'a',plataforma:'payjoy',operation_at:'2026-09-01',tipo_establecimiento:'aliado',utilidad_creditek:100};
 const result=await domain.load({},'aliados',{now,store:'tienda-retail',creditData:{operations:[op,{...op,id:'copy'},{...op,id:'retail',external_id:'b',tipo_establecimiento:'propia',utilidad_creditek:999},{...op,id:'pending',external_id:'c',utilidad_creditek:null}],reversions:[]}});
 assert.equal(result.total,100);assert.equal(result.missing,1);assert.equal(result.budget,null);
});
test('errores de fuente se propagan; no muestran cero ficticio',async()=>{
 await assert.rejects(domain.load({},'invalido',{now}),/Negocio/);
 await assert.rejects(domain.load({rpc(){return {order(){return this},range:async()=>({error:Error('denegado')})}}},'b2b',{now}),/denegado/);
});
test('UI no mezcla respuestas al cambiar rápido de pestaña y elimina gráfica antigua al fallar',async()=>{
 const html=fs.readFileSync('creditek/erp/tablero.html','utf8');
 const source=html.slice(html.indexOf('async function cargarSerieUtilidadAcumulada('),html.indexOf('// ─── Alertas'));
 const nodes={};for(const id of ['chartUtilidad','utilidadTotal','utilidadContexto','utilidadPresupuesto','utilidadPanel','utilidadTitulo'])nodes[id]={setAttribute(){}};
 const pending=[];const ctx={utilidadConsulta:0,utilidadNegocio:'retail',chartUtilidadObj:null,sb:{},document:{getElementById:id=>nodes[id],querySelectorAll:()=>[]},CreditekTableroUtilidad:{load:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),chartConfig:()=>({})},fmtCOP:String,fmtCorto:String,tokenColor:String,nombreTienda:String,Chart:function(){},console:{error(){}}};
 vm.runInNewContext(source,ctx);const first=ctx.cargarSerieUtilidadAcumulada();ctx.utilidadNegocio='b2b';const second=ctx.cargarSerieUtilidadAcumulada();
 const result={name:'B2B',total:70,missing:0,period:{start:'2026-09-01'},today:'2026-09-16',budget:null};pending[1].resolve(result);await second;pending[0].resolve({...result,total:10});await first;
 assert.equal(nodes.utilidadTotal.textContent,'70');assert.match(nodes.utilidadTitulo.textContent,/B2B/);
 ctx.chartUtilidadObj={destroy(){}};const fail=ctx.cargarSerieUtilidadAcumulada();pending[2].reject(Error('error'));await fail;assert.equal(nodes.utilidadTotal.textContent,'No disponible');assert.equal(nodes.chartUtilidad.hidden,true);
 assert.match(html,/role="tablist" aria-label="Negocio de la utilidad"/);assert.match(html,/event.key === 'ArrowRight'/);
});
