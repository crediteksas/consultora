import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),U=require('../../creditek/erp/tesoreria-pagos-unificados.js');
const expense={id:'expense',status:'aprobado',approved_by:'oscar',approved_at:'2026-09-15',business_unit:'aliados',category:'nomina',concept:'Nómina Luis',beneficiary:'Luis',beneficiary_document:'00123',destination_account:'Nequi · Ahorros · 0012345678',amount:750000,due_date:'2026-09-15'};
const file={name:'comprobante.pdf',type:'application/pdf',size:200};
const ready=p=>({ready:p.authorized===true});
test('una orden reúne liquidaciones y nóminas aprobadas sin agrupar conceptos ni duplicar ID',()=>{
  const payments=[{id:'lq',estado:'programado',authorized:true,valor:10},{id:'no',estado:'programado'},{id:'paid',estado:'pagado',authorized:true}];
  const input=[expense,{...expense,id:'yeimi'},expense,...['pendiente_aprobacion','rechazado','anulado','pagado'].map(status=>({...expense,id:status,status})),{...expense,id:'invalid',approved_by:null},{...expense,id:'already',paid_at:'2026-09-15'}];
  const original=JSON.stringify([payments,input]);const rows=U.reportRows(payments,input,[],ready);
  assert.deepEqual(rows.map(r=>r.report_ref),['PO-lq','FIN-expense','FIN-yeimi']);
  assert.equal(rows.reduce((n,r)=>n+Number(r.valor),0),1500010);assert.equal(rows[1].bank_snapshot.account_number,'0012345678');
  assert.equal(rows[1].report_business,'Aliados');assert.equal(rows[1].report_kind,'Nómina');assert.equal(JSON.stringify([payments,input]),original);
});
test('incluye movimientos autorizados del circuito anterior y no pagos cerrados',()=>{
  const m={...expense,id:'legacy',unit:'tercerizacion',direction:'debit',status:'programado',authorized_by:'oscar',movement_date:'2026-09-15'};
  assert.deepEqual(U.reportRows([],[],[m,{...m,id:'pending',status:'pendiente'},{...m,id:'paid',status:'pagado'},{...m,id:'denied',authorized_by:null}],ready).map(r=>r.report_ref),['TM-legacy']);
});
test('cola de Mayte muestra soporte sin segunda aprobación y escapa los datos',()=>{
  const html=U.cards([{...expense,concept:'<script>nómina</script>'},{...expense,id:'paid',status:'pagado'}],String);
  assert.match(html,/Adjuntar soporte y registrar pago/);assert.match(html,/data-financial-support="expense"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/data-authorize|<script>|data-financial-support="paid"/);
});
function fixture(){
  let row={...expense},rpcCount=0,uploads=0;const paths=[];
  const sb={from(table){assert.equal(table,'financial_entries');const q={select(){return q;},eq(k,id){assert.equal(id,'expense');return q;},async single(){return {data:{...row}};}};return q;},storage:{from(bucket){assert.equal(bucket,'soportes');return {async upload(path,f,options){uploads++;paths.push(path);assert.equal(options.upsert,false);return {};},remove(){throw Error('No se borra evidencia');}};}},async rpc(name,args){rpcCount++;assert.equal(name,'finanzas_registrar_pago');assert.equal(args.p_id,expense.id);row={...row,status:'pagado',paid_at:'now',support_path:args.p_support_path};return {data:{...row}};}};
  return {sb,get row(){return row;},set row(v){row=v;},get rpcCount(){return rpcCount;},get uploads(){return uploads;},paths};
}
test('soporte usa el ID existente, conserva autorización y un segundo intento no registra otro pago',async()=>{
  const f=fixture(),r=U.createRecorder(f.sb);const paid=await r.record('expense',file);
  assert.equal(paid.approved_by,'oscar');assert.equal(paid.status,'pagado');assert.match(paid.support_path,/^finanzas\/[a-f0-9-]+\.pdf$/);
  await r.record('expense',file);assert.equal(f.rpcCount,1);assert.equal(f.uploads,1);
});
test('no sube evidencia de gasto pagado o sin aprobar; rechaza archivo inválido',async()=>{
  for(const patch of [{status:'pagado'},{status:'pendiente_aprobacion'},{approved_by:null}]){const f=fixture();f.row={...f.row,...patch};await assert.rejects(U.createRecorder(f.sb).record('expense',file),/pagado|aprobado/);assert.equal(f.uploads,0);}
  for(const bad of [null,{...file,size:0},{...file,size:11*1024*1024},{...file,type:'text/html'}]){const f=fixture();await assert.rejects(U.createRecorder(f.sb).record('expense',bad),/PDF/);assert.equal(f.rpcCount,0);}
});
test('respuesta de red perdida confirma el pago antes de reintentar y conserva evidencia',async()=>{
  const f=fixture(),rpc=f.sb.rpc;f.sb.rpc=async(...args)=>{await rpc(...args);throw Error('Network');};
  const recorder=U.createRecorder(f.sb);assert.equal((await recorder.record('expense',file)).status,'pagado');assert.equal(f.rpcCount,1);
});
test('error antes del registro permite reintentar con el mismo soporte, sin doble clic',async()=>{
  const f=fixture(),original=f.sb.rpc;let release;
  f.sb.rpc=()=>new Promise(resolve=>{release=resolve;});const recorder=U.createRecorder(f.sb),first=recorder.record('expense',file);
  while(!release)await new Promise(resolve=>setImmediate(resolve));await assert.rejects(recorder.record('expense',file),/procesando/);
  release({error:{message:'Sin conexión'}});await assert.rejects(first);
  f.sb.rpc=original;await recorder.record('expense',file);assert.equal(f.uploads,1);assert.equal(f.rpcCount,1);
});
test('generador real conserva documento único, identifica nóminas y aborta ante consulta fallida',async()=>{
  const source=readFileSync('creditek/erp/aliados-tesoreria-app.js','utf8');
  const report=source.slice(source.indexOf('  async function paymentReport()'),source.indexOf('  async function changeMovement'));
  let output='',notice='',reads=0;const button={},dom={innerHTML:'',setAttribute(){},style:{},addEventListener(){},showModal(){},querySelector(selector){return selector==='iframe'?{contentWindow:{document:{open(){},write(s){output=s;},close(){}}}}:{onclick:null};}};
  const ctx={data:{payments:[],financialEntries:[expense],movements:[]},load:async()=>{reads++;},$:()=>button,window:{CreditekPagosUnificados:U,CreditekTesoreriaTercerizacion:{paymentReadiness:ready}},document:{getElementById(){return null;},createElement(){return dom;},body:{appendChild(){}},querySelector(){return null;}},notice:(s)=>{notice=s;},missingPaymentData:p=>Object.values(p.bank_snapshot).some(x=>!x)?['bank']:[],esc:String,cop:String,profile:{nombre:'Oscar'},paymentBusinessName:()=>null,platformName:String,date:String,shortId:String,bogotaDateTime:String,Intl,Date,URL,location:{href:'https://example.test/creditek/erp/aliados-tesoreria.html'}};
  ctx.financialAccessError=false;
  vm.runInNewContext(report+';globalThis.runReport=paymentReport;',ctx);await ctx.runReport();assert.equal(reads,1);assert.match(output,/FIN-expense/);assert.match(output,/Nómina Luis/);assert.match(output,/750000/);assert.doesNotMatch(output,/LQ-undefined/);
  output='';ctx.load=async()=>{throw Error('Offline');};await ctx.runReport();assert.equal(output,'');assert.match(notice,/No se generó un documento parcial/);
  ctx.financialAccessError=true;await ctx.runReport();assert.equal(output,'');assert.match(notice,/verificar el acceso/);
});
