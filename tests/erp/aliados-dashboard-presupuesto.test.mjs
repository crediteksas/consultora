import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import CreditekReversiones from '../../creditek/erp/aliados-reversiones-domain.js';
const app=fs.readFileSync('creditek/erp/aliados-v1-1-app.js','utf8');
function render(operations=[],selection={},goals=[{estado:'vigente',plataforma:'payjoy',periodo_desde:'2026-09-01',periodo_hasta:'2026-09-30',meta_creditos:10}]){
 const ctx={db:{platformGoals:goals},CreditekReversiones,esc:String,platformName:String,operationSaleDay:o=>o.operation_at.slice(0,10)};
 vm.runInNewContext(app.slice(app.indexOf('  function dashboardGoalCharts('),app.indexOf('  function renderDashboard(')),ctx);
 return ctx.dashboardGoalCharts(CreditekReversiones.reportingOperations(operations,[]),{from:'2026-09-01',to:'2026-09-17',...selection});
}
const op=(id,extra={})=>({id,external_id:id,plataforma:'payjoy',operation_at:'2026-09-10',reconocida:true,...extra});
test('presupuesto usa metas existentes, fecha de venta y referencias numéricas exactas',()=>{
 const html=render([op('a'),op('b'),op('c',{operation_at:'2026-10-01'}),op('x',{reconocida:false})]);
 assert.match(html,/2 de 10/);assert.match(html,/20% de cumplimiento/);assert.match(html,/Faltan 8/);assert.match(html,/width:20%/);assert.match(html,/2026-09-30/);assert.match(html,/role="img"/);
});
test('duplicados no inflan cumplimiento y meta superada no oculta porcentaje real',()=>{
 const a=Array.from({length:12},(_,i)=>op(String(i)));a.push(op('0'));
 const html=render(a);assert.match(html,/12 de 10/);assert.match(html,/120% de cumplimiento/);assert.match(html,/width:100%/);assert.match(html,/2 adicionales/);
});
test('filtros de población no comparan una tienda con la meta global',()=>{
 for(const field of ['business','executive','establishment','city','paymentState'])assert.match(render([op('a')],{[field]:'x'}),/Quita los filtros/);
 assert.match(render([],{platform:'krediya'}),/No hay presupuesto cargado/);
 assert.match(render([],{},[]),/No hay presupuesto cargado/);
});
test('metas no vigentes o fuera del periodo no se muestran',()=>{
 assert.match(render([],{},[{estado:'anulada',plataforma:'payjoy',periodo_desde:'2026-09-01',periodo_hasta:'2026-09-30',meta_creditos:30}]),/No hay presupuesto cargado/);
});
test('Reportes sale del menú y enlaces antiguos abren el único Dashboard',()=>{
 const access=fs.readFileSync('creditek/erp/kora-access-control.js','utf8');
 assert.doesNotMatch(access,/label: 'Reportes Aliados'/);
 assert.match(app,/if \(view === "reports"\) \{\s*window.location.replace\("aliados-dashboard.html"\);\s*return;/);
});
