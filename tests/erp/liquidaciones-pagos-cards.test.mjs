import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const UX=require('../../creditek/erp/aliados-liquidaciones-ux.js');
const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function extract(start,end){const from=app.indexOf(start),to=app.indexOf(end,from);assert.ok(from>=0&&to>from);return app.slice(from,to);}
async function render(payments,{batch={id:'lote',plataforma:'krediya',estado:'revisada',frozen_at:null},capacidad='revisor',error=null}={}){
 const nodes={detailHead:{innerHTML:'tabla anterior'},detailBody:{innerHTML:''}},buttons=[],calls=[];
 const query={select(fields){assert.match(fields,/payment_items\(concepto\)/);return query;},eq(field,id){assert.equal(field,'liquidation_id');assert.equal(id,batch.id);return Promise.resolve({data:payments,error});}};
 const context={$:id=>nodes[id],selected:batch,operator:{capacidad},UX,esc,money:UX.formatoCOP,state:value=>`<span class="badge ${esc(value)}">${esc(UX.traducirEstado(value))}</span>`,sb:{from:table=>{assert.equal(table,'payment_orders');return query;}},changePayment:(id,next)=>calls.push({id,next}),document:{querySelectorAll(selector){assert.equal(selector,'[data-payment]');for(const match of nodes.detailBody.innerHTML.matchAll(/data-payment="([^"]+)" data-next="([^"]+)"/g))buttons.push({dataset:{payment:match[1],next:match[2]}});return buttons;}}};
 vm.runInNewContext(`${extract('  async function loadPayments()', '  async function loadAudit()')};this.run=loadPayments;`,context);
 await context.run();return {head:nodes.detailHead.innerHTML,html:nodes.detailBody.innerHTML,buttons,calls};
}
const payment={id:'pago-1',valor:15000,estado:'pendiente',fecha_programada:null,fecha_pagada:null,soporte_path:null,liquidation_beneficiaries:{nombre:'Maythe Reyes',tipo:'ejecutivo',origen_codigo:null},beneficiary_bank_accounts:{numero_cuenta:'123456782835'},payment_items:[{concepto:'bono_operativo'},{concepto:'bono_operativo'},{concepto:'bono_ejecutivo'}]};
function metric(html,label){const value=html.match(new RegExp(`<dt>${label}</dt><dd[^>]*>([\\s\\S]*?)</dd>`));assert.ok(value,`Métrica ${label}`);return value[1];}

test('Pagos usa tarjetas legibles, conceptos únicos y cuenta enmascarada',async()=>{
 const {head,html}=await render([payment]);assert.equal(head,'');
 assert.match(html,/<article class="[^"]*grouped-summary/);assert.match(html,/<h3>Maythe Reyes<\/h3>/);assert.doesNotMatch(html,/<th\b/);
 assert.equal(metric(html,'Concepto'),'bono operativo · bono ejecutivo');
 assert.equal(metric(html,'Cuenta destino'),'•••• 2835');assert.doesNotMatch(html,/123456782835/);
 assert.equal(metric(html,'Valor a pagar'),UX.formatoCOP(15000));
});
test('ausencia de fechas y soporte no implica un pago realizado',async()=>{
 const {html}=await render([{...payment,beneficiary_bank_accounts:null}]);
 assert.equal(metric(html,'Fecha programada'),'Sin programar');
 assert.equal(metric(html,'Fecha de pago'),'Sin pago registrado');
 assert.equal(metric(html,'Soporte'),'Pendiente de adjuntar');
 assert.equal(metric(html,'Cuenta destino'),'Pendiente de registrar');
 assert.doesNotMatch(html,/>Pagado<|data-next="pagado"/);
});
test('fechas reales y soporte se presentan sin cambiar el día por zona horaria',async()=>{
 const {html}=await render([{...payment,estado:'pagado',fecha_programada:'2026-09-03',fecha_pagada:'2026-09-04',soporte_path:'soportes/archivo.pdf'}]);
 assert.equal(metric(html,'Fecha programada'),'2026-09-03');assert.equal(metric(html,'Fecha de pago'),'2026-09-04');
 assert.equal(metric(html,'Soporte'),'Adjunto');assert.match(html,/Continuar en Tesorería/);
 assert.doesNotMatch(html,/Autorizar pago|soportes\/archivo.pdf/);
});
test('solo un aprobador con liquidación aprobada y congelada puede programar el pago pendiente',async()=>{
 const approved={id:'lote',plataforma:'krediya',estado:'aprobada',frozen_at:'2026-09-05T00:00:00Z'};
 const result=await render([payment],{batch:approved,capacidad:'aprobador'});
 assert.equal(result.buttons.length,1);result.buttons[0].onclick();
 assert.deepEqual(result.calls,[{id:'pago-1',next:'programado'}]);
 for(const options of [{batch:approved,capacidad:'revisor'},{batch:{...approved,frozen_at:null},capacidad:'aprobador'},{batch:{...approved,estado:'revisada'},capacidad:'aprobador'}]){
  const blocked=await render([payment],options);assert.equal(blocked.buttons.length,0);assert.doesNotMatch(blocked.html,/Autorizar pago/);
 }
 for(const estado of ['programado','pagado','anulado','rechazado','estado_inexistente']){
  const result=await render([{...payment,estado}],{batch:approved,capacidad:'aprobador'});assert.equal(result.buttons.length,0);
 }
});
test('nombres, origen y conceptos se escapan; vacío o error no deja una tabla engañosa',async()=>{
 const {html}=await render([{...payment,liquidation_beneficiaries:{nombre:'<img src=x onerror=alert(1)>',origen_codigo:'<comercio>'},payment_items:[{concepto:'<script>mal</script>'}]}]);
 assert.match(html,/&lt;img/);assert.match(html,/&lt;comercio&gt;/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img|<script/);
 const empty=await render([]);assert.equal(empty.head,'');assert.match(empty.html,/Sin pagos/);
 await assert.rejects(render(null,{error:new Error('No autorizado')}),/No autorizado/);
});
test('pestaña Pagos activa grouped-cards y elimina el formato de operaciones',async()=>{
 const classes=new Set(['operations-cards','operations-table']),calls=[];
 const wrapper={classList:{remove:(...names)=>names.forEach(n=>classes.delete(n)),toggle:(n,on)=>on?classes.add(n):classes.delete(n)}};
 const context={activeTab:'operations',document:{querySelector:()=>wrapper,querySelectorAll:()=>[]},loadPayments:async()=>calls.push('payments'),esc,$:()=>({innerHTML:''})};
 vm.runInNewContext(`${extract('  async function loadTab(', '  async function savePagamos(')};this.run=loadTab;`,context);
 await context.run('payments');assert.ok(classes.has('grouped-cards'));assert.ok(!classes.has('operations-table'));assert.ok(!classes.has('operations-cards'));assert.deepEqual(calls,['payments']);
});
test('Krediya histórico editable sigue en Pendientes, pero estados finales y otras plataformas conservan historial',()=>{
 const context={};vm.runInNewContext(`${extract('  const PENDING_STATES', '  function statesForMode()')};this.historical=isHistoricalBatch;`,context);
 for(const estado of ['importada','validada','con_novedades','calculada','revisada']){
  assert.equal(context.historical({plataforma:'krediya',fecha_corte:'2026-08-30',estado}),false,estado);
  for(const plataforma of ['payjoy','alo'])assert.equal(context.historical({plataforma,fecha_corte:'2026-08-30',estado}),true,`${plataforma} mantiene corte histórico`);
 }
 for(const estado of ['aprobada','programada','pagada','conciliada','cerrada','anulada']){
  for(const plataforma of ['krediya','payjoy','alo'])assert.equal(context.historical({plataforma,fecha_corte:'2026-09-03',estado,frozen_at:'2026-09-05T00:00:00Z'}),true);
 }
});
