import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const fn=app.slice(app.indexOf('  async function stateRpc('),app.indexOf('  async function changePayment('));
test('RPC conserva seguridad por capacidad con acceso acotado y sin abrir kora_private',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema kora_private;
 create table liquidations(id uuid,estado text);
 create function kora_private.cambiar_estado_liquidacion(p_id uuid,p_estado text,p_comentario text default null) returns liquidations language plpgsql security definer set search_path='' as $$declare r public.liquidations;begin
 if current_setting('test.aprobador',true) is distinct from 'true' then raise exception 'No autorizado';end if;
 update public.liquidations set estado=p_estado where id=p_id returning * into r;return r;end$$;
 grant execute on function kora_private.cambiar_estado_liquidacion(uuid,text,text) to authenticated;
 create function public.aliados_cambiar_estado(p_id uuid,p_estado text,p_comentario text default null) returns liquidations language sql set search_path='' as $$select kora_private.cambiar_estado_liquidacion(p_id,p_estado,p_comentario)$$;
 grant execute on function public.aliados_cambiar_estado(uuid,text,text) to authenticated;
 insert into liquidations values('00000000-0000-0000-0000-000000000001','revisada');set role authenticated;`);
 const call="select public.aliados_cambiar_estado('00000000-0000-0000-0000-000000000001','aprobada')";
 await assert.rejects(db.query(call),/permission denied for schema kora_private/);
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/20260910215916_liquidaciones_aprobacion_acceso_acotado.sql','utf8'));
 await db.exec('set role anon');await assert.rejects(db.query(call),/permission denied/);
 await db.exec('set role authenticated');await assert.rejects(db.query(call),/No autorizado/);
 await db.exec("set test.aprobador='true'");await db.query(call);
 assert.equal((await db.query("select has_schema_privilege('authenticated','kora_private','USAGE') ok")).rows[0].ok,false);
 await db.exec('reset role');assert.equal((await db.query('select estado from liquidations')).rows[0].estado,'aprobada');
 }finally{await db.close();}
});
test('lista Krediya consulta utilidad automática, sin inventar totales si faltan datos',async()=>{
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:''});return nodes.get(id);};
 const batch={id:'k',plataforma:'krediya',estado:'con_novedades',liquidation_operations:[{id:'a',reconocida:true,tipo_establecimiento:'aliado'},{id:'p',reconocida:true,tipo_establecimiento:'propia'}]};
 const c={$ ,batchesRequest:0,batches:[],PENDING_STATES:['con_novedades'],isHistoricalBatch:()=>false,awaitingCalculation:()=>true,renderBatches(){},Intl,
 sb:{from:()=>({select:()=>({order:async()=>({data:[structuredClone(batch)]})})}),rpc:async()=>({data:[{operation_id:'a',automatica:{disponible:true,giro:100,bonos:20,utilidad_neta:-5}},{operation_id:'p',automatica:{disponible:true,giro:300,bonos:0,utilidad_neta:50}}]})}};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('  async function loadBatches()'),app.indexOf('  function renderBatches()')),c);
 await c.loadBatches();assert.deepEqual(Array.from(c.batches[0].previewValues),[100,20,45,120]);
 c.sb.rpc=async()=>({error:{message:'error'}});await c.loadBatches();assert.equal(c.batches[0].previewValues,undefined);assert.equal(c.batches[0].previewError,'No se pudo consultar');
});
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
