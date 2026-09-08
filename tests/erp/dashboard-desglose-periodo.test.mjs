import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync('creditek/erp/aliados-v1-1-app.js','utf8');
const source=app.slice(app.indexOf('  function dashboardOperations()'),app.indexOf('  function populateDashboardFilters()'));
function fixture(){
 const nodes={}; for(const id of ['dashboardFrom','dashboardTo','dashboardBusiness','dashboardPlatform','dashboardExecutive','dashboardEstablishment','dashboardCity','dashboardFilterSummary','content'])nodes['#'+id]={value:''};
 nodes['#dashboardFrom'].value='2026-08-01';nodes['#dashboardTo'].value='2026-08-31';
 const db={operations:[],historicalCredits:[],origins:[],sites:[],expenses:[],incidents:[]};
 const ctx={db,$:s=>nodes[s],establishmentKey:v=>String(v||'').toLowerCase(),operationSaleDay:o=>String(o.operation_at).slice(0,10),date:v=>String(v).slice(0,10),businessType:o=>o.tipo_establecimiento,operationCity:o=>db.origins.find(x=>x.codigo===o.origen_codigo)?.ciudad||'',operationName:o=>o.establishment_name,operationUtilityAvailable:o=>Number(o.utilidad_creditek||0)-Number(o.resultado_cerrado||0),historicalUtilityOriginal:o=>Number(o.utilidad_final_historica??o.utilidad_neta_historica??0),historicalUtilityClosed:o=>Number(o.resultado_cerrado_historico||0),historicalUtilityAvailable:o=>Number(o.utilidad_final_historica??o.utilidad_neta_historica??0)-Number(o.resultado_cerrado_historico||0),sum:(a,k)=>a.reduce((n,x)=>n+Number(x[k]||0),0),metrics:x=>ctx.cards=x,cop:String,esc:String,badge:String,platformName:String,execName:String,paymentValue:o=>Number(o.pago_neto_beneficiario||0),rows:(a,c)=>a.map(x=>c.map(f=>f(x)).join('|')),table:(h,r)=>h.join('|')+r.join('\n'),OPERATION_CUTOFF:'2026-09-01',originFor:()=>null};
 vm.runInNewContext(source,ctx);return {ctx,db,nodes};
}
test('Krediya concilia margen antes de bonos, gasto financiero y provisión sin doble descuento',()=>{
 const {ctx,db,nodes}=fixture();
 db.operations=[{id:'k',external_id:'K',plataforma:'krediya',operation_at:'2026-08-20',tipo_establecimiento:'aliado',monto_base:14476977,bonos_aplicados:1100000,utilidad_creditek:2369089.49,policy_snapshot:{krediya_v2:{gasto_financiero:57907.91,provision:921312.60,utilidad_bruta:3290402.09}}}];
 ctx.renderDashboard();
 assert.ok(Math.abs(ctx.dashboardBreakdown(db.operations[0]).gross-4448310)<0.001);
 assert.equal(ctx.cards.find(x=>x[0]==='Utilidad final del periodo')[1],'2369089.49');
 assert.match(nodes['#content'].innerHTML,/4\.448\.310,00/);
 assert.match(nodes['#content'].innerHTML,/57\.907,91/);
 assert.match(nodes['#content'].innerHTML,/921\.312,60/);
 db.expenses=[{estado:'aprobado',fecha:'2026-09-02',valor:100}];nodes['#dashboardTo'].value='2026-09-30';ctx.renderDashboard();
 assert.equal(ctx.cards.find(x=>x[0]==='Utilidad final del periodo')[1],'2368989.49');
});
test('todas las plataformas incluye agosto histórico, deduplica contrato y no reabre resultado cerrado',()=>{
 const {ctx,db,nodes}=fixture();
 db.operations=[{id:'k',external_id:'same',plataforma:'krediya',operation_at:'2026-08-20',monto_base:100,utilidad_creditek:72,bonos_aplicados:0,policy_snapshot:{krediya_v2:{gasto_financiero:0,provision:28}}}];
 db.historicalCredits=[{id:'copy',codigo_credito:'SAME',plataforma:'krediya',fecha_credito:'2026-08-20',monto_credito:999},{id:'p',codigo_credito:'same',plataforma:'payjoy',fecha_credito:'2026-08-10',monto_credito:200,bonos_historicos:5,utilidad_neta_historica:20,resultado_cerrado_historico:20,historico_inicial:true,pagado_antes_inicio:true},{id:'a',codigo_credito:'alo',plataforma:'alo',fecha_credito:'2026-08-31',monto_credito:300,bonos_historicos:0,utilidad_neta_historica:30,resultado_cerrado_historico:30}];
 const before=JSON.stringify(db);ctx.renderDashboard();
 assert.equal(ctx.cards.find(x=>x[0]==='Créditos del periodo')[1],3);
 assert.equal(ctx.cards.find(x=>x[0]==='Ventas del periodo')[1],'600');
 assert.match(nodes['#content'].innerHTML,/Resultado no cerrado \(no equivale a saldo bancario\)\|\$\s*72,00/);
 assert.equal(ctx.cards.find(x=>x[0]==='Utilidad final del periodo')[1],'122');
 assert.equal(JSON.stringify(db),before);
 nodes['#dashboardTo'].value='2026-08-30';ctx.renderDashboard();assert.equal(ctx.cards[0][1],2);
 nodes['#dashboardPlatform'].value='payjoy';ctx.renderDashboard();assert.equal(ctx.cards[0][1],1);
 assert.match(nodes['#content'].innerHTML,/Resultado no cerrado \(no equivale a saldo bancario\)\|\$\s*0,00/);
});
test('filtros ciudad, ejecutivo y tipo también se aplican al histórico',()=>{
 const {ctx,db,nodes}=fixture();db.origins=[{codigo:'t',nombre:'Tienda',ciudad:'Cereté'}];
 db.historicalCredits=[{id:'a',codigo_credito:'A',plataforma:'alo',fecha_credito:'2026-08-15',establecimiento:'Tienda',ejecutivo_historico_id:'e',tipo_establecimiento:'aliado'}];
 nodes['#dashboardCity'].value='Cereté';nodes['#dashboardExecutive'].value='e';nodes['#dashboardBusiness'].value='aliado';ctx.renderDashboard();assert.equal(ctx.cards[0][1],1);
 nodes['#dashboardBusiness'].value='propia';ctx.renderDashboard();assert.equal(ctx.cards[0][1],0);
});
test('dato faltante no produce desglose completo ni margen inventado',()=>{
 const {ctx,db,nodes}=fixture();db.operations=[{id:'x',plataforma:'krediya',operation_at:'2026-08-15',utilidad_creditek:100}];ctx.renderDashboard();
 assert.equal(ctx.dashboardBreakdown(db.operations[0]).gross,null);
 assert.match(nodes['#content'].innerHTML,/Desglose parcial/);
});
test('margen guardado inconsistente se marca como parcial y no se fuerza a cuadrar',()=>{
 const {ctx}=fixture();const result=ctx.dashboardBreakdown({plataforma:'krediya',valor_comercial:200,pagamos:100,utilidad_creditek:50,bonos_aplicados:10,policy_snapshot:{krediya_v2:{gasto_financiero:0,provision:20}}});
 assert.equal(result.gross,100);assert.equal(result.complete,false);
});
