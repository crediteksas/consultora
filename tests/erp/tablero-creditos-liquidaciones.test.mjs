import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import domain from '../../creditek/erp/tablero-ejecutivos.js';
import reversions from '../../creditek/erp/aliados-reversiones-domain.js';
const period={start:'2026-09-01',end:'2026-10-01'};
const op=(id,extra={})=>({id,external_id:id,plataforma:'payjoy',origen_codigo:'t',tipo_establecimiento:'propia',operation_at:'2026-09-05T12:00:00-05:00',...extra});
const html=fs.readFileSync('creditek/erp/tablero.html','utf8');
const helper=html.slice(html.indexOf('let creditosLiquidacionesPromise'),html.indexOf('function pintarVariacion('));
function scope(data) {
 const ctx={CreditekTableroEjecutivos:{...domain,loadCreditData:async()=>data},CreditekReversiones:reversions,sb:{},tiendasCache:[{codigo:'t'}],console:{error(){}}};
 vm.runInNewContext(helper,ctx); return ctx;
}
test('solo Liquidaciones: las tres plataformas por tienda, sin históricos ni ventas locales',()=>{
 const ctx=scope({});
 const data={operations:[op('p'),op('a',{plataforma:'alo'}),op('k',{plataforma:'krediya'}),op('copy',{external_id:'p'}),op('other',{origen_codigo:'otra'}),op('ally',{tipo_establecimiento:'aliado'})],reversions:[],historical:[op('hist')],ventas:[op('local')]};
 assert.equal(reversions.creditCount(ctx.creditosTiendas(data,period,[{codigo:'t'}])),3);
 assert.equal(ctx.creditosTiendas(data,period,[]).length,0);
});
test('deduplica antes del filtro temporal y respeta Bogotá y las anulaciones',()=>{
 const paid=op('paid',{utilidad_creditek:100,operation_at:'2026-08-31T12:00:00-05:00'});
 const data={operations:[paid,op('tracking',{external_id:'paid',normalized_data:{seguimientoPagoKrediya:true}}),op('void'),op('edge',{operation_at:'2026-10-01T04:59:59Z'}),op('next',{operation_at:'2026-10-01T05:00:00Z'})],reversions:[{tipo:'sin_desembolso',original_operation_id:'void'}]};
 assert.deepEqual(domain.credits(data,period).map(o=>o.id),['edge']);
 data.reversions.push({id:'r',tipo:'reversion_liquidada',fecha:'2026-09-10',snapshot:{original:paid,calculo:{policy_snapshot:{}}}});
 assert.equal(reversions.creditCount(domain.credits(data,period)),0);
});
test('KPI y gráfica usan el mismo conteo aunque la tienda haya registrado veinte créditos',async()=>{
 const ctx=scope({operations:[op('p'),op('a',{plataforma:'alo'})],reversions:[]});
 const query={select(){return this},gte(){return this},lte(){return this},eq(){return this},in(){return this},then(resolve){resolve({data:Array.from({length:20},(_,i)=>({id:i,tipo:'credito',total:100,utilidad:10}))})}};
 ctx.sb.from=()=>query;
 const result=await ctx.sumVentasCreditosUtilidad('2026-09-01','2026-09-30','t');
 assert.equal(result.creditos,2);assert.equal(result.ventas,2000);assert.equal(result.utilidad,200);
 assert.match(html,/const creditosMes = CreditekReversiones.creditCount\(operacionesMes.filter/);
 assert.doesNotMatch(html,/filter\(v => v.tipo === 'credito'\)\.length/);
});
test('error de Liquidaciones no se sustituye por ventas ni cero, permite reintentar',async()=>{
 const ctx=scope({operations:[],reversions:[]});
 ctx.CreditekTableroEjecutivos.loadCreditData=async()=>{throw Error('denegado')};
 const query={select(){return this},gte(){return this},lte(){return this},eq(){return this},then(resolve){resolve({data:[]})}};ctx.sb.from=()=>query;
 assert.equal((await ctx.sumVentasCreditosUtilidad('2026-09-01','2026-09-30','')).creditos,null);
 ctx.CreditekTableroEjecutivos.loadCreditData=async()=>({operations:[op('ok')],reversions:[]});
 assert.equal((await ctx.sumVentasCreditosUtilidad('2026-09-01','2026-09-30','')).creditos,1);
 assert.match(html,/Créditos no disponibles. No se sustituyen por ventas de tienda/);
});
test('consulta paginada de fuente única, sin tablas de ventas ni históricos',async()=>{
 const tables=[];const sb={from(table){tables.push(table);return {select(){return this},order(){return this},range:async()=>({data:[]})}}};
 const result=await domain.loadCreditData(sb);
 assert.deepEqual(tables,['liquidation_operations','aliados_reversiones']);
 assert.deepEqual(result,{operations:[],reversions:[]});
});
