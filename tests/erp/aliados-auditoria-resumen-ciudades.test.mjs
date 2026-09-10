import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import CreditekReversiones from '../../creditek/erp/aliados-reversiones-domain.js';
const app = fs.readFileSync('creditek/erp/aliados-v1-1-app.js','utf8');
const liquidaciones = fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const citySource = app.slice(app.indexOf('  function operationCity('),app.indexOf('  function liquidationForOperation('));
test('ciudad usa origen o sede vinculada sin tomar ciudad de otro local',()=>{
  const ctx={db:{origins:[{codigo:'a',ciudad:null},{codigo:'b',ciudad:'Tolú'}],sites:[{origen_codigo:'a',ciudad:'Montería'},{origen_codigo:'b',ciudad:'Bogotá'}]}};
  vm.runInNewContext(citySource,ctx);
  assert.equal(ctx.operationCity({origen_codigo:'a'}),'Montería');
  assert.equal(ctx.operationCity({origen_codigo:'b'}),'Tolú');
  assert.equal(ctx.operationCity({origen_codigo:'c'}),'');
  ctx.db.sites.push({origen_codigo:'a',ciudad:'Cereté'});
  assert.equal(ctx.operationCity({origen_codigo:'a'}),'');
});
test('dashboard compacto conserva histórico cerrado bajo consulta',()=>{
  const source=app.slice(app.indexOf('  function renderDashboard('),app.indexOf('  function populateDashboardFilters()'));
  assert.doesNotMatch(source,/Bonos nuevos|Resultado histórico final|Resultado histórico cerrado/);
  assert.match(source,/Bonificaciones del periodo/);
  assert.match(source,/<details class="card"><summary>Consultar histórico cerrado/);
  assert.doesNotMatch(source,/<details[^>]*\bopen\b/);
});
test('recupera ciudad de ficha original sin propagar la ciudad del titular compartido',()=>{
 const ctx={db:{origins:[],sites:[{origen_codigo:'cerete',aliado_id:'grupo',nombre:'CELUVENTAS CERETE'},{origen_codigo:'monteria',aliado_id:'grupo',nombre:'CELUVENTAS MONTERIA'},{origen_codigo:'dk',aliado_id:'dk'}],allies:[{id:'grupo',nombre_comercial:'CELUVENTAS MONTERIA',ciudad_principal:'Montería'},{id:'original',nombre_comercial:'CELUVENTAS CERETE',ciudad_principal:'Cereté'},{id:'dk',nombre_comercial:'DKCHE',ciudad_principal:'Lorica'}]}};
 vm.runInNewContext(citySource,ctx);
 assert.equal(ctx.operationCity({origen_codigo:'cerete',establishment_name:'A CELUVENTAS CERETE'}),'Cereté');
 assert.equal(ctx.operationCity({origen_codigo:'monteria'}),'Montería');
 assert.equal(ctx.operationCity({origen_codigo:'dk'}),'Lorica');
 assert.equal(ctx.operationCity({origen_codigo:'desconocido'}),'');
});
test('provisión usa snapshot guardado y distingue cálculo ausente de cero',()=>{
 const ctx={};vm.runInNewContext(citySource,ctx);
 assert.equal(ctx.operationProvision({policy_snapshot:{krediya_v2:{provision:'921312.60'}}}),921312.6);
 assert.equal(ctx.operationProvision({policy_snapshot:{krediya_v2:{provision:0}}}),0);
 assert.equal(ctx.operationProvision({}),null);
});
test('dashboard filtra provisión y bonos por crédito sin restar dos veces la reserva',()=>{
 const nodes={};for(const id of ['dashboardFrom','dashboardTo','dashboardBusiness','dashboardPlatform','dashboardExecutive','dashboardEstablishment','dashboardCity','dashboardFilterSummary','content'])nodes['#'+id]={value:''};
 nodes['#dashboardCity'].value='Cereté';let cards;
 const ctx={$:s=>nodes[s],db:{operations:[{id:'a',liquidation_id:'l',origen_codigo:'a',plataforma:'krediya',monto_base:100,utility:72,policy_snapshot:{krediya_v2:{provision:28}}},{id:'b',liquidation_id:'l',origen_codigo:'b',plataforma:'krediya',monto_base:200,utility:144,policy_snapshot:{krediya_v2:{provision:56}}}],origins:[{codigo:'a',ciudad:'Cereté'},{codigo:'b',ciudad:'Montería'}],sites:[],allies:[],bonuses:[{operation_id:'a',liquidation_id:'l',valor:5},{operation_id:'b',liquidation_id:'l',valor:10}],beneficiaries:[],incidents:[]},operationIsCurrent:()=>true,operationSaleDay:()=> '2026-08-25',businessType:()=> 'aliado',sum:(a,k)=>a.reduce((n,x)=>n+Number(x[k]||0),0),historicalUtilityOriginal:()=>0,historicalUtilityClosed:()=>0,historicalUtilityAvailable:()=>0,operationUtilityAvailable:o=>o.utility,metrics:x=>cards=x,cop:String,operationName:o=>o.origen_codigo,paymentValue:()=>0,esc:String,execName:()=>'',badge:String,platformName:String,rows:(a,cols)=>a.map(x=>cols.map(c=>c(x)).join('|')),table:(h,r)=>h.join('|')+r.join('\n')};
 ctx.CreditekReversiones=CreditekReversiones;ctx.db.operations.forEach(o=>{o.utilidad_creditek=o.utility;o.bonos_aplicados=o.id==='a'?5:10;o.policy_snapshot.krediya_v2.gasto_financiero=0;});
 vm.runInNewContext(citySource+app.slice(app.indexOf('  function dashboardOperations()'),app.indexOf('  function populateDashboardFilters()')),ctx);ctx.renderDashboard();
 assert.equal(cards.find(c=>c[0]==='Provisión calculada del periodo')[1],'28');
 assert.equal(cards.find(c=>c[0]==='Utilidad final del periodo')[1],'72');
 assert.equal(cards.find(c=>c[0]==='Bonificaciones del periodo')[1],'5');
 assert.match(nodes['#content'].innerHTML,/Provisión/);
 assert.match(nodes['#content'].innerHTML,/ya está descontada/);
});
const auditSource=liquidaciones.slice(liquidaciones.indexOf('  async function loadAudit('),liquidaciones.indexOf('  async function loadGrouped('));
async function audit(profileError=false,stale=false){
  const nodes={detailHead:{},detailBody:{}};const calls=[];
  const ctx={selected:{id:'lote'},$:(id)=>nodes[id],esc:String,UX:{describirAuditoria:()=>({accion:'Aprobación',descripcion:'Lote aprobado',resultado:'OK'}),traducirEstado:String,fechaAuditoria:String,detalleTecnico:JSON.stringify},sb:{from(table){return {select(fields){calls.push([table,fields]);return this;},eq(){return this;},order:async()=>({data:[{accion:'aprobar',usuario:'u',created_at:'2026-09-07',detalle:{}}]}),in:async()=>({error:profileError?{}:null,data:[{id:'u',nombre:'Oscar',rol:'gerencia'}]})};}}};
  vm.runInNewContext(auditSource,ctx);await ctx.loadAudit(()=>!stale);return {nodes,calls};
}
test('auditoría consulta perfiles por ID sin relación inexistente',async()=>{
  const {nodes,calls}=await audit();assert.match(nodes.detailBody.innerHTML,/Oscar/);
  assert.equal(calls[0][1],'accion,usuario,created_at,detalle');
  assert.equal(calls[1][0],'perfiles');
});
test('auditoría conserva eventos si perfil no es accesible y evita respuesta antigua',async()=>{
  assert.match((await audit(true)).nodes.detailBody.innerHTML,/Usuario KORA/);
  assert.equal((await audit(false,true)).nodes.detailBody.innerHTML,undefined);
});
