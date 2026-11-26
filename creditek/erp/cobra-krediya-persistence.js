(function(root){
 'use strict';
 const D=typeof module!=='undefined'&&module.exports?require('./quality-domain.js'):root.CobraQuality;
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 async function prepareCut({bytes,name,rows,month,requestId,crypto:cryptoApi=globalThis.crypto}){
  if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>8*1024*1024)throw Error('Archivo inválido.');
  if(typeof name!=='string'||!name.trim()||name.length>180||!/\.xlsx$/i.test(name))throw Error('Nombre de archivo inválido.');
  if(!uuid(requestId)||!/^\d{4}-\d{2}$/.test(month)||D.day(month+'-01')===null)throw Error('Identificador o mes inválido.');
  if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('Primero valida el archivo completo.');
  const cutoff=rows[0].cutoff,sourceName=name.trim();const cuts=new Set(rows.map(r=>r.cutoff));if(cuts.size!==1||D.day(rows[0].cutoff)===null)throw Error('El archivo debe tener un corte explícito.');
  // Save every imported store in the selected month, never the UI search/priority subset.
  const cohort=rows.filter(r=>r.month===month).sort((a,b)=>a.contract.localeCompare(b.contract));
  if(!cohort.length||new Set(cohort.map(r=>r.contract)).size!==cohort.length)throw Error('Mes vacío o contratos repetidos.');
  const snapshot=cohort.map(r=>({contract:r.contract,document:r.document,customer:r.customer,store:r.store,created:r.created,financed_cents:r.financedCents,fee_cents:r.feeCents,total_installments:r.totalInstallments,frequency:r.frequency,cycled:r.cycled,paid:r.paid,overdue:r.overdue,contract_status:'signed_approved'}));
  for(const r of snapshot){if(D.day(r.created)===null||r.created>rows[0].cutoff||!['financed_cents','fee_cents','total_installments','frequency','cycled','paid','overdue'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0))throw Error('Observación inválida.');Object.freeze(r);}
  // Capture bytes and content BEFORE awaiting hashing; edits cannot change an in-flight cut.
  const digest=await cryptoApi.subtle.digest('SHA-256',bytes.slice());
  const sha=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  return Object.freeze({p_request_id:requestId,p_file_sha256:sha,p_cohort_month:month+'-01',p_cutoff:cutoff,p_source_name:sourceName,p_rows:Object.freeze(snapshot)});
 }
 function createStore(client){
  if(!client||typeof client.rpc!=='function')throw Error('Cliente autenticado requerido.');
  const pending=new Map();
  return Object.freeze({save(request){
   if(!request||!uuid(request.p_request_id))return Promise.reject(Error('Solicitud inválida.'));
   const key=request.p_request_id,body=JSON.stringify(request),captured=JSON.parse(body);
   const old=pending.get(key);if(old){if(old.body!==body)return Promise.reject(Error('El identificador ya tiene otro contenido.'));return old.promise;}
   const promise=(async()=>{
    const {data,error}=await client.rpc('cobra_krediya_save_cut',captured);
    if(error)throw Error('No se confirmó el guardado. Conserva el corte y reintenta con el mismo identificador.');
    if(!data||!uuid(data.id)||data.status!=='observations_saved'||data.official_quality!==false||data.file_sha256!==captured.p_file_sha256||data.cutoff!==captured.p_cutoff||data.cohort_month!==captured.p_cohort_month||data.row_count!==captured.p_rows.length||typeof data.duplicate!=='boolean'||!uuid(data.request_id)||(!data.duplicate&&data.request_id!==captured.p_request_id))throw Error('Respuesta no verificable; no se declara guardado.');
    return Object.freeze({...data});
   })().finally(()=>{if(pending.get(key)?.promise===promise)pending.delete(key);});
   pending.set(key,{body,promise});return promise;
  }});
 }
 function prepareCollection({requestId,operationId,type,channel,note,promiseDate=null,promiseAmount=null,today}){
  if(!uuid(requestId)||!uuid(operationId)||!['contact_attempt','contacted','note','promise'].includes(type)||!['call','whatsapp','email','platform','internal'].includes(channel)||typeof note!=='string'||!note.trim()||note.trim().length>600)throw Error('Completa una gestión válida para un crédito existente.');
  if(type==='promise'){
   if(D.day(today)===null||D.day(promiseDate)===null||promiseDate<today||!Number.isSafeInteger(promiseAmount)||promiseAmount<=0||!Number.isSafeInteger(promiseAmount*100))throw Error('Completa la fecha y el importe del compromiso.');
  }else if(promiseDate!==null||promiseAmount!==null)throw Error('Los importes solo corresponden a compromisos.');
  return Object.freeze({p_request_id:requestId,p_operation_id:operationId,p_event_type:type,p_channel:channel,p_note:note.trim(),p_promise_date:promiseDate,p_promise_amount:promiseAmount});
 }
 function createCollectionStore(client){
  if(!client||typeof client.rpc!=='function')throw Error('Cliente autenticado requerido.');
  const pending=new Map();
  return Object.freeze({save(request){
   if(!request||!uuid(request.p_request_id))return Promise.reject(Error('Solicitud inválida.'));
   const key=request.p_request_id,body=JSON.stringify(request),captured=JSON.parse(body),old=pending.get(key);
   if(old){if(old.body!==body)return Promise.reject(Error('El identificador ya tiene otra gestión.'));return old.promise;}
   const promise=(async()=>{
    const {data,error}=await client.rpc('cobra_krediya_save_collection',captured);
    if(error)throw Error('Guardado no confirmado. Conserva la misma gestión e identificador antes de reintentar.');
    if(!data||!uuid(data.id)||data.request_id!==captured.p_request_id||data.operation_id!==captured.p_operation_id||data.event_type!==captured.p_event_type||data.status!=='collection_saved'||data.payment_created!==false||typeof data.duplicate!=='boolean'||(data.obligation_id!==null&&!uuid(data.obligation_id))||typeof data.created_at!=='string'||Number.isNaN(Date.parse(data.created_at)))throw Error('Respuesta no verificable; no se declara guardada la gestión.');
    return Object.freeze({...data});
   })().finally(()=>{if(pending.get(key)?.promise===promise)pending.delete(key);});
   pending.set(key,{body,promise});return promise;
  }});
 }
 // Display adapter only: associates operation events to an existing portfolio row.
 // It never manufactures a portfolio row, obligation, loan, payment or balance.
 function referenceError(message){return Object.assign(Error(message),{code:'COBRA_REFERENCE_INVALID'});}
 function mapEventsToPortfolio(events,portfolio){
  if(!Array.isArray(events)||!Array.isArray(portfolio))throw referenceError('Historial incompleto.');
  const byOperation=new Map(),byObligation=new Map(),seen=new Set(),mapped=[],unlinked=[];
  for(const r of portfolio){if(!Object.hasOwn(r,'operation_id'))throw referenceError('La consulta de cartera no incluye operation_id.');if(!uuid(r.id)||byObligation.has(r.id))throw referenceError('Referencias de cartera ambiguas.');if(r.operation_id!==null&&r.operation_id!==undefined){if(!uuid(r.operation_id)||byOperation.has(r.operation_id))throw referenceError('Referencias de cartera ambiguas.');byOperation.set(r.operation_id,r);}byObligation.set(r.id,r);}
  for(const e of events){
   if(!uuid(e.id)||seen.has(e.id)||(e.operation_id!==null&&e.operation_id!==undefined&&!uuid(e.operation_id))||(e.obligation_id!==null&&!uuid(e.obligation_id)))throw referenceError('Referencia de gestión inválida.');seen.add(e.id);
   const viaOperation=byOperation.get(e.operation_id),viaObligation=byObligation.get(e.obligation_id);
   if((viaOperation&&e.obligation_id&&e.obligation_id!==viaOperation.id)||(viaObligation&&e.operation_id&&e.operation_id!==viaObligation.operation_id))throw referenceError('La gestión apunta a dos créditos diferentes.');
   const row=viaOperation||viaObligation;
   if(!row){unlinked.push({...e});continue;}
   mapped.push({...e,source_obligation_id:e.obligation_id,obligation_id:row.id});
  }
  return {events:mapped,unlinked};
 }
 const api=Object.freeze({prepareCut,createStore,prepareCollection,createCollectionStore,mapEventsToPortfolio});if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CobraQualityPersistence=api;
})(typeof window!=='undefined'?window:globalThis);
