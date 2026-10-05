import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),U=require('../../creditek/erp/tesoreria-pagos-unificados.js');
const expense={id:'expense',status:'aprobado',approved_by:'oscar',approved_at:'2026-09-15',business_unit:'aliados',category:'nomina',concept:'Nómina Luis',beneficiary:'Luis',beneficiary_document:'00123',destination_account:'Nequi · Ahorros · 0012345678',amount:750000,due_date:'2026-09-15'};
const file={name:'comprobante.pdf',type:'application/pdf',size:200};
const ready=p=>({ready:p.authorized===true});
const supplier={id:'supplier',estado:'autorizado',autorizado_por:'oscar',autorizado_at:'2026-10-05T21:36:00Z',
  proveedores:{nombre:'Proveedor ejemplo',nit:null},monto:4000000,
  concepto:'CTA CORRIENTE BANCO EJEMPLO 00123456789\nTitular comercial · NIT 900123456-1'};
test('proveedores autorizados entran en la hoja sin duplicar, inferir destino ni mutar la solicitud',()=>{
  const input=[supplier,supplier,...['pendiente','pagado','rechazado'].map(estado=>({...supplier,id:estado,estado})),
    {...supplier,id:'no-author',autorizado_por:null},{...supplier,id:'no-date',autorizado_at:null},
    {...supplier,id:'paid-at',pagado_at:'2026-10-06'},{...supplier,id:'support',soporte_path:'proof.pdf'},
    {...supplier,id:'paid-by',pagado_por:'maite'}];
  const original=JSON.stringify(input),rows=U.reportRows([],[],[],ready,new Set(),input);
  assert.equal(rows.length,1);assert.equal(rows[0].report_ref,'BP-supplier');
  assert.equal(rows[0].valor,4000000);assert.equal(rows[0].report_date,'2026-10-05');
  assert.equal(rows[0].destination_instructions,supplier.concepto);assert.deepEqual(rows[0].bank_snapshot,{});
  assert.equal(rows[0].beneficiary_identification,'');assert.equal(JSON.stringify(input),original);
  assert.deepEqual(U.reportRows([],[],[],ready,new Set(['BP-supplier']),input),[]);
});
test('tarjetas conservan el pago autorizado después de emitir orden y solo enlazan el soporte existente',()=>{
  const html=U.supplierCards([{...supplier,concepto:'<script>instrucciones</script>'}],String,new Set(['BP-supplier']));
  assert.match(html,/Ya incluido en una orden/);assert.match(html,/banco-creditek.html#autorizados/);
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|data-banco-aprobar|data-financial-support/);
});
test('una orden reúne liquidaciones y nóminas aprobadas sin agrupar conceptos ni duplicar ID',()=>{
  const payments=[{id:'lq',estado:'programado',authorized:true,valor:10},{id:'no',estado:'programado'},{id:'paid',estado:'pagado',authorized:true}];
  const input=[expense,{...expense,id:'yeimi'},expense,...['pendiente_aprobacion','rechazado','anulado','pagado'].map(status=>({...expense,id:status,status})),{...expense,id:'invalid',approved_by:null},{...expense,id:'already',paid_at:'2026-09-15'}];
  const original=JSON.stringify([payments,input]);const rows=U.reportRows(payments,input,[],ready);
  assert.deepEqual(rows.map(r=>r.report_ref),['PO-lq','FIN-expense','FIN-yeimi']);
  assert.equal(rows.reduce((n,r)=>n+Number(r.valor),0),1500010);assert.equal(rows[1].bank_snapshot.account_number,'0012345678');
  assert.equal(rows[1].report_business,'Aliados');assert.equal(rows[1].report_kind,'Nómina');assert.equal(JSON.stringify([payments,input]),original);
});
test('incluye movimientos autorizados del circuito anterior y no pagos cerrados',()=>{
  const m={...expense,id:'legacy',unit:'tercerizacion',direction:'debit',status:'programado',authorized_by:'oscar',movement_date:'2026-09-15',aliados_gastos_operativos:{plataforma:'krediya'}};
  const rows=U.reportRows([],[],[m,{...m,id:'pending',status:'pendiente'},{...m,id:'paid',status:'pagado'},{...m,id:'denied',authorized_by:null}],ready);
  assert.deepEqual(rows.map(r=>r.report_ref),['TM-legacy']);
  assert.equal(rows[0].beneficiary_identification,'00123');
  assert.equal(rows[0].report_platform,'krediya');
});
test('cola de Mayte muestra soporte sin segunda aprobación y escapa los datos',()=>{
  const html=U.cards([{...expense,concept:'<script>nómina</script>'},{...expense,id:'paid',status:'pagado'}],String);
  assert.match(html,/Adjuntar soporte y registrar pago/);assert.match(html,/data-financial-support="expense"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/data-authorize|<script>|data-financial-support="paid"/);
});
function fixture(){
  let row={...expense},rpcCount=0,uploads=0;const paths=[];
  const sb={from(table){assert.equal(table,'financial_entries');const q={select(){return q;},eq(k,id){assert.equal(id,'expense');return q;},async single(){return {data:{...row}};}};return q;},storage:{from(bucket){assert.equal(bucket,'soportes');return {async upload(path,f,options){uploads++;paths.push(path);assert.equal(options.upsert,false);return {};},remove(){throw Error('No se borra evidencia');}};}},async rpc(name,args){rpcCount++;assert.equal(name,'finanzas_registrar_pago_con_origen');assert.equal(args.p_id,expense.id);row={...row,status:'pagado',paid_at:'now',support_path:args.p_support_path,pagado_desde_banco_creditek:args.p_desde_banco_creditek};return {data:{...row}};}};
  return {sb,get row(){return row;},set row(v){row=v;},get rpcCount(){return rpcCount;},get uploads(){return uploads;},paths};
}
test('soporte usa el ID existente, conserva autorización y un segundo intento no registra otro pago',async()=>{
  const f=fixture(),r=U.createRecorder(f.sb);const paid=await r.record('expense',file,true);
  assert.equal(paid.approved_by,'oscar');assert.equal(paid.status,'pagado');assert.match(paid.support_path,/^finanzas\/[a-f0-9-]+\.pdf$/);
  await r.record('expense',file,true);assert.equal(f.rpcCount,1);assert.equal(f.uploads,1);
});
test('no sube evidencia de gasto pagado o sin aprobar; rechaza archivo inválido',async()=>{
  for(const patch of [{status:'pagado'},{status:'pendiente_aprobacion'},{approved_by:null}]){const f=fixture();f.row={...f.row,...patch};await assert.rejects(U.createRecorder(f.sb).record('expense',file,true),/pagado|aprobado/);assert.equal(f.uploads,0);}
  for(const bad of [null,{...file,size:0},{...file,size:11*1024*1024},{...file,type:'text/html'}]){const f=fixture();await assert.rejects(U.createRecorder(f.sb).record('expense',bad,true),/PDF/);assert.equal(f.rpcCount,0);}
});
test('respuesta de red perdida confirma el pago antes de reintentar y conserva evidencia',async()=>{
  const f=fixture(),rpc=f.sb.rpc;f.sb.rpc=async(...args)=>{await rpc(...args);throw Error('Network');};
  const recorder=U.createRecorder(f.sb);assert.equal((await recorder.record('expense',file,true)).status,'pagado');assert.equal(f.rpcCount,1);
});
test('error antes del registro permite reintentar con el mismo soporte, sin doble clic',async()=>{
  const f=fixture(),original=f.sb.rpc;let release;
  f.sb.rpc=()=>new Promise(resolve=>{release=resolve;});const recorder=U.createRecorder(f.sb),first=recorder.record('expense',file,true);
  while(!release)await new Promise(resolve=>setImmediate(resolve));await assert.rejects(recorder.record('expense',file,true),/procesando/);
  release({error:{message:'Sin conexión'}});await assert.rejects(first);
  f.sb.rpc=original;await recorder.record('expense',file,true);assert.equal(f.uploads,1);assert.equal(f.rpcCount,1);
});
test('orden imprime solo las filas elegidas y conserva referencias y nóminas',()=>{
  const source=readFileSync('creditek/erp/aliados-tesoreria-app.js','utf8');
  const report=source.slice(source.indexOf('  function renderPaymentReport(rows)'),source.indexOf('  async function changeMovement'));
  let output='';const dom={dataset:{},innerHTML:'',setAttribute(){},style:{},addEventListener(){},showModal(){},querySelector(selector){return selector==='iframe'?{contentWindow:{document:{write(s){output=s;},close(){}}}}:{onclick:null};}};
  const ctx={document:{getElementById(){return null;},createElement(){return dom;},body:{appendChild(){}}},notice(){},esc:String,cop:String,profile:{nombre:'Oscar'},paymentBusinessName:()=>null,platformName:String,date:String,shortId:String,Intl,Date,URL,location:{href:'https://example.test/creditek/erp/aliados-tesoreria.html'}};
  vm.runInNewContext(report+';globalThis.renderReport=renderPaymentReport;',ctx);
  ctx.renderReport(U.reportRows([], [expense], [], ready),{consecutive:7,created_at:'2026-09-30T20:00:00Z',issued_by_name:'Oscar'});
  assert.match(output,/OP-000007/);
  assert.equal(ctx.document.title,'Orden de pago OP-000007');
  assert.match(output,/<title>Orden de pago OP-000007<\/title>/);
  assert.match(output,/FIN-expense/);assert.match(output,/Nómina Luis/);assert.match(output,/750000/);assert.doesNotMatch(output,/LQ-undefined/);
  ctx.renderReport(U.reportRows([],[],[],ready,new Set(),[supplier]),{consecutive:8,created_at:'2026-10-05T22:00:00Z',issued_by_name:'Oscar'});
  assert.match(output,/BP-supplier/);assert.match(output,/Instrucción autorizada/);
  assert.ok(output.includes(supplier.concepto));assert.match(output,/4000000/);
  assert.match(output,/titular del giro en la instrucción/);assert.doesNotMatch(output,/undefined/);
});
test('preparación consulta de nuevo y aborta si está desconectada',async()=>{
  const source=readFileSync('creditek/erp/aliados-tesoreria-app.js','utf8');
  const body=source.slice(source.indexOf('  async function paymentReport()'),source.indexOf('  function renderPaymentReport(rows)'));
  let notice='',reads=0,opened=0;const button={disabled:false};
  const ctx={financialAccessError:false,$:()=>button,load:async()=>{reads++;},authorizedReportRows:()=>U.reportRows([], [expense], [], ready),openPaymentSelection:()=>{opened++;},notice:s=>{notice=s;}};
  vm.runInNewContext(body+';globalThis.runReport=paymentReport;',ctx);
  await ctx.runReport();assert.equal(reads,1);assert.equal(opened,1);
  ctx.load=async()=>{throw Error('Offline');};await ctx.runReport();assert.equal(opened,1);assert.match(notice,/No se generó un documento parcial/);
  ctx.financialAccessError=true;await ctx.runReport();assert.equal(opened,1);assert.match(notice,/verificar el acceso/);
});

test('orden no presenta una identificación temporal de ejecutivo como documento válido',()=>{
  const source=readFileSync('creditek/erp/aliados-tesoreria-app.js','utf8');
  const body=source.slice(source.indexOf('  function reportMissing(p)'),source.indexOf('  function reportSignature(p)'));
  const ctx={missingPaymentData:()=>[]};
  vm.runInNewContext(body+';globalThis.validate=reportMissing;',ctx);
  for(const prefix of ['PO','FIN','TM']){
    assert.ok(ctx.validate({report_ref:prefix+'-test',valor:400000,beneficiary_identification:'EJECUTIVO-TEMP-MAYTHE-REYES'}).includes('identificación válida'));
    assert.equal(ctx.validate({report_ref:prefix+'-test',valor:400000,beneficiary_identification:'22624685'}).length,0);
  }
  const row=U.supplierRows([supplier])[0];assert.equal(ctx.validate(row).length,0);
  assert.ok(ctx.validate({...row,destination_instructions:''}).includes('instrucciones de giro autorizadas'));
  assert.ok(ctx.validate({...row,beneficiary_name:''}).includes('proveedor'));
  assert.ok(ctx.validate({...row,valor:-1}).includes('valor positivo'));
});

test('Tesorería carga proveedores con paginación, refresca al autorizar y enlaza sus soportes por BP',()=>{
 const source=readFileSync('creditek/erp/aliados-tesoreria-app.js','utf8');
 assert.match(source,/loadCompensations\('banco_creditek_pagos_proveedor','\*,proveedores\(id,nombre,nit\)','solicitado_at'\)/);
 assert.match(source,/kora-supplier-payment-changed/);
 const body=source.slice(source.indexOf('  function dispatchSupport(item)'),source.indexOf('  function renderDispatchHistory()'));
 const ctx={data:{supplierBankPayments:[{id:'supplier',soporte_path:'supplier-proof.pdf'}],payments:[{id:'supplier',soporte_path:'wrong-proof.pdf'}]}};
 vm.runInNewContext(body+';globalThis.support=dispatchSupport;',ctx);
 assert.equal(ctx.support({report_ref:'BP-supplier',snapshot:{id:'supplier'}}),'supplier-proof.pdf');
});

test('pagos de una orden emitida no vuelven a ofrecerse, pero conservan el botón de soporte',()=>{
 const rows=U.reportRows([], [expense], [], ready,new Set(['FIN-expense']));assert.deepEqual(rows,[]);
 assert.match(U.cards([expense],String),/data-financial-support="expense"/);
});
