import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const Summary=createRequire(import.meta.url)('../../creditek/erp/liquidaciones-resumen.js');
const app=readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const html=readFileSync('creditek/erp/aliados-liquidaciones.html','utf8');
const period=Summary.periodos(new Date('2026-09-15T20:00:00Z'));
test('semana lunes a domingo y mes usan Bogotá incluso al cambiar UTC',()=>{
  assert.equal(period.semanaDesde,'2026-09-14');assert.equal(period.semanaHasta,'2026-09-20');
  assert.equal(Summary.periodos(new Date('2026-09-14T03:00:00Z')).semanaDesde,'2026-09-07');
  const january=Summary.periodos(new Date('2026-01-01T12:00:00Z'));
  assert.equal(january.semanaDesde,'2025-12-29');assert.equal(january.mesDesde,'2026-01-01');
});
const approved=(id,date,utility,extras={})=>({id,fecha_corte:date,plataforma:'payjoy',estado:'aprobada',approved_at:date+'T20:00:00Z',total_utilidad_creditek:utility,total_pago_aliados:0,total_pago_tiendas:100,total_bonos:0,total_pagar:100,operaciones_tiendas:1,...extras});
test('resumen mensual suma snapshots aprobados por corte, no mes de aprobación ni borradores',()=>{
  const rows=[approved('one','2026-09-06',175440),approved('four','2026-09-07',711960),approved('old','2026-08-31',999),approved('future','2026-09-16',999),approved('void','2026-09-14',999,{estado:'anulada'}),approved('draft','2026-09-15',999,{estado:'calculada',approved_at:null})];
  assert.deepEqual(Summary.utilidadMes(rows,period),{cantidad:2,faltantes:0,total:887400});
  assert.deepEqual(Summary.utilidadMes([],period),{cantidad:0,faltantes:0,total:0});
  assert.equal(Summary.utilidadMes([approved('missing','2026-09-14',null)],period).total,null);
  assert.equal(Summary.utilidadMes([approved('zero','2026-09-14',0)],period).total,0);
});
function render(batches,mode='week',filters={}){
  const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:filters[id]||'',textContent:'',innerHTML:''});return nodes.get(id);};
  const context={$ ,batches,listMode:mode,Summary:{...Summary,periodos:()=>period},esc:v=>String(v??'').replaceAll('<','&lt;'),money:v=>'$ '+v,platformName:String,state:String,UX:{fechaAuditoria:String,fechaCorta:String,traducirEstado:String},document:{querySelectorAll:()=>[]}};
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('  const ownStoreUtility ='),app.indexOf('  function statesForMode('))+'\n'+app.slice(app.indexOf('  function renderBatches()'),app.indexOf('  function updateActions()')),context);
  context.renderBatches();return {context,$};
}
test('principal muestra solo semana; antiguos por consulta y pendientes antiguos no desaparecen',()=>{
  const rows=[approved('current','2026-09-14',50),approved('old','2026-09-07',10),approved('pending','2026-09-05',null,{estado:'calculada',approved_at:null})];
  const week=render(rows);assert.match(week.$('batches').innerHTML,/data-open="current"/);assert.doesNotMatch(week.$('batches').innerHTML,/data-open="old"|data-open="pending"/);
  assert.match(render(rows,'pending').$('batches').innerHTML,/data-open="pending"/);
  const history=render(rows,'history',{historyFrom:'2026-09-01',historyUntil:'2026-09-10'});
  assert.match(history.$('batches').innerHTML,/data-open="old"/);assert.doesNotMatch(history.$('batches').innerHTML,/data-open="current"/);
  assert.match(week.$('monthlySummary').innerHTML,/\$ 60/);
  assert.match(render(rows,'week',{filterSearch:'missing'}).$('monthlySummary').innerHTML,/\$ 60/);
  assert.match(app,/let listMode = 'week'/);assert.match(html,/id="showWeek"/);assert.doesNotMatch(app,/Últimas 4 aprobadas/);
});
test('retail muestra sus importes aunque pago a aliados y bonos sean cero; no altera totales',()=>{
  const rows=[approved('six','2026-09-06',175440,{total_pago_tiendas:455560,total_pagar:455560}),approved('seven','2026-09-07',711960,{total_pago_tiendas:1704465,total_pagar:1704465,operaciones_tiendas:4})];
  const original=JSON.stringify(rows), view=render(rows,'history');
  assert.match(view.$('batches').innerHTML,/Tiendas: \$ 455560/);assert.match(view.$('batches').innerHTML,/Tiendas: \$ 1704465/);assert.match(view.$('batches').innerHTML,/Aliados: \$ 0/);
  assert.equal(JSON.stringify(rows),original);assert.match(html,/<th>Pago a comercios<\/th>/);
  assert.equal(view.context.commercePayment({...rows[0],total_pago_tiendas:null}),'No informado');
});
test('consulta encuentra tienda y cargue completo pagina sin escribir',async()=>{
  const row=approved('match','2026-09-14',50,{liquidation_operations:[{establishment_name:'Alfaberso'}]});
  assert.match(render([row],'week',{filterSearch:'alfaberso'}).$('batches').innerHTML,/data-open="match"/);
  const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:''});return nodes.get(id);};
  const ranges=[];
  const context={$ ,batchesRequest:0,batches:[],PENDING_STATES:[],isHistoricalBatch:()=>true,awaitingCalculation:()=>false,renderBatches(){},sb:{from(){const q={select:()=>q,order:()=>q,range(from,to){ranges.push([from,to]);return Promise.resolve({data:from===0?Array.from({length:500},(_,id)=>({...row,id})):[]});}};return q;}}};
  vm.createContext(context);vm.runInContext(app.slice(app.indexOf('  async function loadBatches()'),app.indexOf('  function renderBatches()')),context);await context.loadBatches();
  assert.equal(context.batches.length,500);assert.deepEqual(ranges,[[0,499],[500,999]]);
});
