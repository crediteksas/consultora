import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const fn=app.slice(app.indexOf('  async function stateRpc('),app.indexOf('  async function changePayment('));
function fixture(rpc){
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){}},prepend(p){this.textContent=p.textContent;},scrollIntoView(){this.scrolled=true;}});return nodes.get(id);};
 const c={$ ,selected:{id:'lot',estado:'revisada'},batches:[{id:'lot',estado:'revisada'}],batchesRequest:1,sb:{rpc},document:{createElement:()=>({textContent:''})},loadBatches:async()=>{throw Error('No requiere recargar');},openDetail:async()=>{$('approve').disabled=false;},loadTab:async()=>{},renderBatches:()=>{},setListMode:mode=>{c.mode=mode;c.selected=null;},statesForMode:()=>['revisada']};
 vm.createContext(c);vm.runInContext(fn,c);return c;
}
test('aprobación confirmada retira el pendiente sin segunda consulta y cancela consultas antiguas',async()=>{
 const c=fixture(async()=>({data:{id:'lot',estado:'aprobada',approved_at:'2026-09-10T21:00:00Z'},error:null}));
 await c.stateRpc('aprobada');assert.equal(c.selected,null);assert.equal(c.mode,'pending');assert.equal(c.batches[0].estado,'aprobada');assert.equal(c.batchesRequest,2);
 assert.match(c.$('lastUpdated').textContent,/Liquidación aprobada/);
});
test('fallos o respuesta sin confirmación no eliminan pendientes y muestran el error',async()=>{
 for(const rpc of [async()=>({data:null,error:null}),async()=>({error:{message:'Error de aprobación'}}),async()=>{throw Error('Sin conexión');}]){
 const c=fixture(rpc);await c.stateRpc('aprobada');assert.equal(c.batches[0].estado,'revisada');assert.equal(c.$('approve').disabled,false);assert.equal(c.$('workflowError').scrolled,true);assert.match(c.$('lastUpdated').textContent,/no se completó/);
 }
});
test('la consulta antigua se descarta y la fecha de aprobación excluye pendientes',()=>{
 assert.match(app,/request !== batchesRequest/);assert.match(app,/isHistoricalBatch = \(batch\) => Boolean\(batch.approved_at\)/);
});
