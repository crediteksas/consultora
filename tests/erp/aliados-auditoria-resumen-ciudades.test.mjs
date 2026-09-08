import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
  const source=app.slice(app.indexOf('  function renderDashboard()'),app.indexOf('  function populateDashboardFilters()'));
  assert.doesNotMatch(source,/Bonos nuevos|Resultado histórico final|Resultado histórico cerrado/);
  assert.match(source,/Bonificaciones del periodo/);
  assert.match(source,/<details class="card"><summary>Consultar histórico cerrado/);
  assert.doesNotMatch(source,/<details[^>]*\bopen\b/);
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
