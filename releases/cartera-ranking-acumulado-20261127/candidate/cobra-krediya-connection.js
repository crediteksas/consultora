(function(root){
 'use strict';
 const P=typeof module!=='undefined'&&module.exports?require('./quality-persistence.js'):root.CobraQualityPersistence;
 const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
 const CUT_COLUMNS='id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,source_name,row_count,received_by,received_at,schema_version';
 const EVENT_COLUMNS='id,client_request_id,operation_id,obligation_id,event_type,channel,note,promise_date,promise_amount,created_by,created_at';
 function create({client,project,storage,locks,crypto=globalThis.crypto,onInvalidate=()=>{},timeoutMs=20000,now=()=>Date.now()}){
  if(!client?.auth||!client.from||!client.rpc||!/^https?:\/\/[^/]+$/.test(project))throw Error('Conexión KORA no disponible.');
  let generation=0,subject=null,disposed=false;const controllers=new Set(),uncertainIntents=new Set();
  const fail=()=>Error('La sesión cambió o venció. Vuelve a entrar y comprueba los pendientes.');
  function invalidate(){generation++;for(const c of controllers)c.abort();controllers.clear();onInvalidate();}
  const subscription=client.auth.onAuthStateChange((event,session)=>{
   const next=session?.user?.id||null;
   if(event==='SIGNED_OUT'||(subject!==null&&next!==subject)){subject=next;invalidate();}else if(next)subject=next;
  }).data.subscription;
  function assert(ctx){if(disposed||ctx.generation!==generation||subject!==ctx.user)throw fail();}
  async function bounded(fn){
   const controller=new AbortController();controllers.add(controller);let timer;
   try{return await Promise.race([fn(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('Tiempo de espera agotado. Comprueba el estado antes de reintentar.'));controller.abort();},timeoutMs);controller.signal.addEventListener('abort',()=>reject(fail()),{once:true});})]);}
   finally{clearTimeout(timer);controllers.delete(controller);}
  }
  async function context(){
   if(disposed)throw fail();const start=generation;
   const s=await bounded(()=>client.auth.getSession());
   if(start!==generation)throw fail();
   if(s.error||!uuid(s.data?.session?.user?.id)||!s.data.session.access_token||!Number.isFinite(s.data.session.expires_at)||s.data.session.expires_at*1000<=Date.now()+5000){subject=null;invalidate();throw fail();}
   const session=s.data.session,user=session.user.id;
   // Verify with Auth, pin this JWT on each query, and discard late results on identity change.
   const verified=await bounded(()=>client.auth.getUser(session.access_token));
   if(start!==generation)throw fail();
   if(verified.error||verified.data?.user?.id!==user||(subject!==null&&subject!==user)){subject=null;invalidate();throw fail();}
   subject=user;return {user,token:session.access_token,generation:start};
  }
  async function query(ctx,make){
   assert(ctx);const response=await bounded(signal=>make().setHeader('Authorization','Bearer '+ctx.token).abortSignal(signal));assert(ctx);
   if(response.error){const error=Error('No se pudo confirmar la consulta. Revisa la sesión y reintenta sin cambiar la solicitud.');error.status=response.status;error.code=response.error.code;error.databaseMessage=response.error.message;throw error;}
   return response.data;
  }
  async function permission(ctx,kind='operator'){
   if(await query(ctx,()=>client.rpc(kind==='cut'?'cobra_quality_importer':'cobra_quality_operator'))!==true)throw Error('Tu usuario no tiene permiso para esta acción.');
  }
  async function hash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');}
  async function journalKey(ctx,kind){const key='cobra-pending-v2:'+await hash(project+'|'+ctx.user)+'|'+kind;assert(ctx);return key;}
  const invalid=()=>Object.assign(Error('Pendiente local inválido: comprueba pendientes para revisar el bloqueo.'),{code:'COBRA_JOURNAL_INVALID'});
  function read(key,kind){
   let entry;try{const value=storage.getItem(key);if(!value)return null;entry=JSON.parse(value);}catch(error){if(error instanceof SyntaxError)throw invalid();throw Error('No se puede leer la recuperación local. No se enviará la gestión.');}
   const fields=entry&&Object.keys(entry).sort().join(',');
   if(!entry||!['digest,id,proof','cut,digest,id,proof','digest,id,proof,sentAt','cut,digest,id,proof,sentAt'].includes(fields)||!uuid(entry.id)||![/^[a-f0-9]{64}$/.test(entry.digest),/^[a-f0-9]{64}$/.test(entry.proof)].every(Boolean))throw invalid();
   if(Object.hasOwn(entry,'sentAt')&&(!Number.isSafeInteger(entry.sentAt)||entry.sentAt<0))throw invalid();
   if(entry.cut){const c=entry.cut,day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
    if(kind!=='cut'||Object.keys(c).sort().join(',')!=='cohort_month,cutoff,file_sha256'||!/^[a-f0-9]{64}$/.test(c.file_sha256)||!day(c.cohort_month)||!c.cohort_month.endsWith('-01')||!day(c.cutoff)||c.cutoff<c.cohort_month)throw invalid();
   }else if(Object.hasOwn(entry,'cut'))throw invalid();
   return entry;
  }
  function write(key,value){try{storage.setItem(key,JSON.stringify(value));if(storage.getItem(key)!==JSON.stringify(value))throw Error();}catch{throw Error('No se puede conservar el identificador para reintentos. No se ha enviado.');}}
  function remove(key){try{storage.removeItem(key);}catch{throw Error('No se pudo limpiar la recuperación local. Comprueba el pendiente antes de crear otra gestión.');}}
  async function exclusive(ctx,key,fn){
   if(!locks?.request)throw Error('Este navegador no permite coordinar pestañas. Abre KORA en un navegador actualizado.');
   // Bound acquisition only. An outer timeout must not return while its callback
   // later clears the recovery journal. Each API operation has its own bound.
   const controller=new AbortController();controllers.add(controller);
   const timer=setTimeout(()=>controller.abort(Error('Otra pestaña está guardando. Espera y comprueba pendientes.')),timeoutMs);
   try{return await locks.request(key,{mode:'exclusive',signal:controller.signal},async()=>{clearTimeout(timer);assert(ctx);return fn();});}
   finally{clearTimeout(timer);controllers.delete(controller);}
  }
  async function lookup(ctx,kind,id,cutKey){
   const table=kind==='cut'?'cobra_krediya_cuts':'credit_collection_events',column=kind==='cut'?'request_id':'client_request_id';
   let fallback=false;let rows=await query(ctx,()=>{let q=client.from(table).select(kind==='cut'?CUT_COLUMNS:EVENT_COLUMNS).eq(column,id);if(kind==='collection')q=q.eq('created_by',ctx.user);return q.limit(2);});
   if(!Array.isArray(rows)||rows.length>1)throw Error('La recuperación devolvió referencias ambiguas.');
   // Cuts deduplicate globally by file/month/cutoff. A lost duplicate receipt
   // may refer to an older request by another authorized importer. Keep only
   // the file fingerprint and report dates locally, never rows or filename.
   if(!rows.length&&kind==='cut'&&cutKey){fallback=true;rows=await query(ctx,()=>client.from(table).select(CUT_COLUMNS).eq('file_sha256',cutKey.file_sha256).eq('cohort_month',cutKey.cohort_month).eq('cutoff',cutKey.cutoff).limit(2));if(!Array.isArray(rows)||rows.length>1)throw Error('La recuperación devolvió referencias ambiguas.');}
   if(!rows.length)return null;const row=rows[0];
   if(!uuid(row.id)||!uuid(row[column])||(!fallback&&row[column]!==id)||(kind==='collection'&&(row.created_by!==ctx.user||!uuid(row.operation_id)))||(kind==='cut'&&!uuid(row.received_by))||(fallback&&(row.file_sha256!==cutKey.file_sha256||row.cohort_month!==cutKey.cohort_month||row.cutoff!==cutKey.cutoff)))throw Error('No se pudo verificar el pendiente.');
   return row;
  }
  const collectionBody=row=>({p_operation_id:row.operation_id,p_event_type:row.event_type,p_channel:row.channel,p_note:row.note,p_promise_date:row.promise_date??null,p_promise_amount:row.promise_amount===null||row.promise_amount===undefined?null:Number(row.promise_amount)});
  async function proofForRow(kind,row){return kind==='cut'?hash(JSON.stringify([row.file_sha256,row.cohort_month,row.cutoff,row.row_count,row.payload_sha256])):hash(JSON.stringify(collectionBody(row)));}
  function reason(error){return ({cobra_source_not_approved:'La liquidación de origen aún no está aprobada.',cobra_identity_or_terms_mismatch:'El crédito no coincide con la identidad o los valores de su liquidación.',cobra_event_invalid_promise:'Revisa la fecha y el importe del compromiso.',cobra_event_invalid_fields:'Revisa los campos de la gestión.'})[error.databaseMessage]||'Corrige el archivo o la gestión y vuelve a revisarla.';}
  function definite(error){return [400,401,403,409].includes(error.status)&&/^(P0001|42501|22|23)/.test(error.code||'');}
  const WAIT_MS=60000,ARCHIVE_TTL=7*24*60*60*1000,ARCHIVE_LIMIT=32;
  const archiveKey=key=>key.replace('cobra-pending-v2:','cobra-discarded-v2:');
  function archive(key){
   try{const value=JSON.parse(storage.getItem(archiveKey(key))||'[]');
    if(!Array.isArray(value)||value.some(x=>!x||Object.keys(x).sort().join(',')!=='discardedAt,id,kind'||(x.id!==null&&!uuid(x.id))||!['cut','collection','fund-funding','fund-action'].includes(x.kind)||!Number.isSafeInteger(x.discardedAt)||x.discardedAt<0))return {entries:[],unknown:true};
    return {entries:value.filter(x=>x.discardedAt>=now()-ARCHIVE_TTL).map(x=>({...x,discardedAt:Math.min(x.discardedAt,now())})).slice(-ARCHIVE_LIMIT),unknown:false};
   }catch{return {entries:[],unknown:true};}
  }
  // Waiting is only a UI safeguard, never evidence that a timed-out request failed.
  async function unresolved(key,entry,state='unconfirmed'){
   let raw=storage.getItem(key),reviewToken=await hash(raw||'');
   let since=entry?.sentAt;
   if(since!==undefined&&since>now()){entry={...entry,sentAt:now()};write(key,entry);since=entry.sentAt;raw=storage.getItem(key);reviewToken=await hash(raw||'');}
   if(since===undefined){const markerKey=key+'|review';let marker;try{marker=JSON.parse(storage.getItem(markerKey)||'null');}catch{}
    if(marker?.fingerprint!==reviewToken||!Number.isSafeInteger(marker?.since)||marker.since<0||marker.since>now()){marker={fingerprint:reviewToken,since:now()};write(markerKey,marker);}since=marker.since;}
   return {state,requestId:entry?.id,reviewToken,discardAfter:since+WAIT_MS,canDiscard:now()>=since+WAIT_MS};
  }
  function clearJournal(key){remove(key);remove(key+'|review');}
  async function resolveRow(ctx,key,kind,entry,row){const matches=await proofForRow(kind,row)===entry.proof;assert(ctx);clearJournal(key);return {state:matches?'confirmed':'conflict',existing:kind==='cut'&&(row.request_id!==entry.id||row.received_by!==ctx.user),row};}
  async function recover(kind){
   if(!['cut','collection'].includes(kind))throw Error('Acción inválida.');
   const ctx=await context();await permission(ctx,kind);const key=await journalKey(ctx,kind);
   return exclusive(ctx,key,async()=>{let entry;try{entry=read(key,kind);}catch(error){if(error.code!=='COBRA_JOURNAL_INVALID')throw error;return unresolved(key,null,'invalid');}
    if(!entry)return {state:'none'};const row=await lookup(ctx,kind,entry.id,entry.cut);assert(ctx);
    if(!row)return unresolved(key,entry);return resolveRow(ctx,key,kind,entry,row);});
  }
  async function discard(kind,reviewToken,acknowledgeRisk){
   if(!['cut','collection'].includes(kind)||!/^[a-f0-9]{64}$/.test(reviewToken)||acknowledgeRisk!==true)throw Error('Revisa el historial y confirma el riesgo antes de liberar el aviso local.');
   const ctx=await context();await permission(ctx,kind);const key=await journalKey(ctx,kind);
   return exclusive(ctx,key,async()=>{let entry;try{entry=read(key,kind);}catch(error){if(error.code!=='COBRA_JOURNAL_INVALID')throw error;}
    if(entry===null)return {state:'none'};
    const review=await unresolved(key,entry,entry?'unconfirmed':'invalid');assert(ctx);
    if(review.reviewToken!==reviewToken)throw Error('El pendiente cambió. Vuelve a comprobarlo.');
    if(!review.canDiscard)throw Error('Espera al menos un minuto desde el último envío o la primera revisión y comprueba pendientes otra vez.');
    if(entry){const row=await lookup(ctx,kind,entry.id,entry.cut);if(row)return resolveRow(ctx,key,kind,entry,row);}
    assert(ctx);
    // Retain only non-sensitive retry metadata for technical reconciliation.
    // Never archive arbitrary malformed storage, notes, filenames or tokens.
    const retired=archive(key).entries;retired.push({id:entry?.id||null,kind,discardedAt:now()});write(archiveKey(key),retired.slice(-ARCHIVE_LIMIT));
    clearJournal(key);return {state:'discarded',requestId:entry?.id};
   });
  }
  async function save(kind,request){
   if(!['cut','collection'].includes(kind)||!request)throw Error('Solicitud inválida.');
   // Capture edits before the first await; only attempt hashes/UUID and cut dates are stored, never tokens/notes/clients.
   let captured=JSON.parse(JSON.stringify(request));const intentId=captured.p_request_id;if(!uuid(intentId))throw Error('Falta el identificador de la solicitud.');delete captured.p_request_id;
   if(kind==='collection')captured=collectionBody({operation_id:captured.p_operation_id,event_type:captured.p_event_type,channel:captured.p_channel,note:captured.p_note,promise_date:captured.p_promise_date,promise_amount:captured.p_promise_amount});
   const started=generation,ctx=await context();if(started!==generation)throw fail();const digest=await hash(JSON.stringify(captured));assert(ctx);await permission(ctx,kind);const key=await journalKey(ctx,kind);
   let proof=digest;if(kind==='cut'){const payloadHash=await query(ctx,()=>client.rpc('cobra_krediya_payload_digest',{p_rows:captured.p_rows}));if(!/^[a-f0-9]{64}$/.test(payloadHash))throw Error('Huella de contenido no verificable.');proof=await hash(JSON.stringify([captured.p_file_sha256,captured.p_cohort_month,captured.p_cutoff,captured.p_rows.length,payloadHash]));assert(ctx);}
   return exclusive(ctx,key,async()=>{
    const old=read(key,kind),retired=archive(key);
    const wasSent=!!old||uncertainIntents.has(intentId)||retired.unknown||retired.entries.some(x=>x.id===intentId);
    if(old&&old.digest!==digest)throw Error('Hay otra solicitud sin confirmar. Comprueba pendientes antes de preparar otra.');
    const id=old?.id||intentId,cutKey=kind==='cut'?{file_sha256:captured.p_file_sha256,cohort_month:captured.p_cohort_month,cutoff:captured.p_cutoff}:undefined;assert(ctx);write(key,{id,digest,proof,sentAt:now(),...(cutKey?{cut:cutKey}:{})});
    uncertainIntents.add(id);
    // Always replay the same body/key. A lost response, aborted fetch or timeout may have committed.
    const proxy={rpc:(name,args)=>query(ctx,()=>client.rpc(name,args)).then(data=>({data,error:null}))};
    const store=kind==='cut'?P.createStore(proxy):P.createCollectionStore(proxy);
    try{const receipt=await store.save({...captured,p_request_id:id});assert(ctx);clearJournal(key);uncertainIntents.delete(id);return receipt;}
    catch(error){
     if(definite(error)){
      // A rejection of a RETRY says nothing about an earlier committed attempt.
      // Recheck scope and inspect the same intent before resolving the journal.
      await permission(ctx,kind);const found=await lookup(ctx,kind,id,cutKey);assert(ctx);
      if(found){const matches=await proofForRow(kind,found)===proof;assert(ctx);clearJournal(key);
       if(matches)return kind==='cut'?{...found,duplicate:true,status:'observations_saved',official_quality:false}:{...found,request_id:found.client_request_id,duplicate:true,status:'collection_saved',payment_created:false};
       const conflict=Error('Conflicto: existe otra versión guardada. Este contenido no se guardó; comprueba el historial.');conflict.resetIntent=true;throw conflict;}
      // Even after a minute, a previous attempt might still commit. Only a
      // first-send rejection can automatically clear the journal.
      if(wasSent)throw Error('El reintento fue rechazado, pero el primer envío sigue sin confirmar. Comprueba pendientes y el historial antes de crear otra gestión.');
      clearJournal(key);uncertainIntents.delete(id);const rejected=Error('El servidor rechazó la solicitud y no quedó guardada. '+reason(error));rejected.resetIntent=true;rejected.code=error.code;throw rejected;
     }
     throw error;
    }
   });
  }
  async function listCuts(month){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Mes inválido.');
   const ctx=await context();await permission(ctx);const all=[];let last=null;
   for(let page=0;page<100;page++){
    const batch=await query(ctx,()=>{let q=client.from('cobra_krediya_cuts').select(CUT_COLUMNS).eq('cohort_month',month+'-01').order('id').limit(100);return last?q.gt('id',last):q;});
    if(!Array.isArray(batch)||batch.some(x=>!uuid(x.id)||x.cohort_month!==month+'-01')||batch.some((x,i)=>i&&x.id<=batch[i-1].id)||batch.some(x=>last&&x.id<=last))throw Error('Lista de cortes incompleta.');
    all.push(...batch);if(batch.length<100)return all.sort((a,b)=>b.cutoff.localeCompare(a.cutoff)||b.received_at.localeCompare(a.received_at));last=batch.at(-1).id;
   }throw Error('Demasiadas versiones. Reduce el alcance antes de continuar.');
  }
  async function listAllCuts(){
   const ctx=await context();await permission(ctx);const all=[];let last=null;
   for(let page=0;page<100;page++){
    const batch=await query(ctx,()=>{let q=client.from('cobra_krediya_cuts').select(CUT_COLUMNS).order('id').limit(100);return last?q.gt('id',last):q;});
    if(!Array.isArray(batch)||batch.some(x=>!uuid(x.id)||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(x.cohort_month||''))||batch.some((x,i)=>i&&x.id<=batch[i-1].id)||batch.some(x=>last&&x.id<=last))throw Error('Lista de cortes incompleta.');
    all.push(...batch);if(batch.length<100)return all;last=batch.at(-1).id;
   }throw Error('Demasiados cortes para consultar el ranking completo.');
  }
  async function loadCut(id){
   if(!uuid(id))throw Error('Corte inválido.');const ctx=await context();await permission(ctx);
   const cut=await query(ctx,()=>client.from('cobra_krediya_cuts').select(CUT_COLUMNS+',observations').eq('id',id).single());
   if(cut?.id!==id||cut.schema_version!==1||!Number.isInteger(cut.row_count)||cut.row_count<1||cut.row_count>10000||!Array.isArray(cut.observations)||cut.observations.length!==cut.row_count||new Set(cut.observations.map(x=>x.operation_id)).size!==cut.row_count||cut.observations.some(x=>!uuid(x.operation_id)))throw Error('Corte incompleto: no se muestran indicadores parciales.');
   return cut;
  }
  async function history(operationId){
   if(!uuid(operationId))throw Error('Crédito inválido.');const ctx=await context();await permission(ctx);const result=[];let last=null;
   for(let page=0;page<100;page++){
    const batch=await query(ctx,()=>{let q=client.from('credit_collection_events').select(EVENT_COLUMNS).eq('operation_id',operationId).order('id').limit(100);return last?q.gt('id',last):q;});
    if(!Array.isArray(batch)||batch.some((x,i)=>!uuid(x.id)||x.operation_id!==operationId||(last&&x.id<=last)||(i&&x.id<=batch[i-1].id)))throw Error('Historial incompleto.');
    result.push(...batch);if(batch.length<100)return result.sort((a,b)=>b.created_at.localeCompare(a.created_at));last=batch.at(-1).id;
   }throw Error('Historial demasiado grande: requiere un alcance menor.');
  }
  function stableJSON(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stableJSON).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableJSON(v[k])).join(',')+'}';}

  async function fundCapabilities(){const ctx=await context();await permission(ctx);return {authorizer:await query(ctx,()=>client.rpc('cobra_provision_authorizer'))===true};}
  async function fundBook(){const ctx=await context();await permission(ctx);const book=await query(ctx,()=>client.rpc('cobra_provision_book'));if(!book||!Array.isArray(book.fundings)||!Array.isArray(book.actions)||book.fundings.length>10000||book.actions.length>10000||book.fundings.some(f=>!uuid(f.id))||book.actions.some(a=>!uuid(a.id)||!Number.isSafeInteger(a.event_no)||a.event_no<=0))throw Error('Libro de provisiones incompleto.');return book;}
  async function coverageBook(){const book=await fundBook();const result=book.coverage;if(result?.version!==1||result.invalid_dates!==0||!Array.isArray(result.months)||!Array.isArray(result.items)||result.months.length>1000||result.items.length>10000)throw Error('No fue posible verificar el cruce mensual.');return result;}
  async function fundSource(month){if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month))throw Error('Mes inválido.');const ctx=await context();await permission(ctx);const result=await query(ctx,()=>client.rpc('cobra_provision_source',{p_month:month}));
   if(!result||!Number.isSafeInteger(result.count)||result.count<0||!Number.isSafeInteger(result.generated_cents)||!Number.isSafeInteger(result.negative_count)||result.negative_count<0||(result.count>0&&!/^[a-f0-9]{64}$/.test(result.digest)))throw Error('Fuente de provisión incompleta.');return result;}
  async function customerHistory(operation){if(!uuid(operation))throw Error('Crédito inválido.');const ctx=await context();await permission(ctx);const result=await query(ctx,()=>client.rpc('cobra_krediya_history_cuts',{p_operation_id:operation}));if(result?.schema_version!==1||result.operation_id!==operation||result.automatic_decision!==false||result.official_quality!==false||!Array.isArray(result.cuts))throw Error('Historial no verificable.');return result;}
  async function fundLookup(ctx,kind,id){const rows=await query(ctx,()=>client.from(kind==='funding'?'cobra_provision_fundings':'cobra_provision_actions').select('id,request_id,payload,created_by').eq('request_id',id).eq('created_by',ctx.user).limit(2));if(!Array.isArray(rows)||rows.length>1)throw Error('Solicitud ambigua.');const row=rows[0];if(row&&(!uuid(row.id)||row.request_id!==id||row.created_by!==ctx.user))throw Error('Respuesta de otro usuario.');return row||null;}
  async function resolveFundRow(ctx,key,entry,row){const matches=await hash(stableJSON(row.payload))===entry.proof;assert(ctx);clearJournal(key);return {state:matches?'confirmed':'conflict',id:row.id};}
  async function recoverFund(kind){if(!['funding','action'].includes(kind))throw Error('Solicitud inválida.');const ctx=await context();await permission(ctx);const key=await journalKey(ctx,'fund-'+kind);return exclusive(ctx,key,async()=>{let pending;try{pending=read(key,'fund-'+kind);}catch(error){if(error.code!=='COBRA_JOURNAL_INVALID')throw error;return unresolved(key,null,'invalid');}if(!pending)return {state:'none'};const row=await fundLookup(ctx,kind,pending.id);assert(ctx);if(!row)return unresolved(key,pending);return resolveFundRow(ctx,key,pending,row);});}
  async function discardFund(kind,reviewToken,acknowledgeRisk){
   if(!['funding','action'].includes(kind)||!/^[a-f0-9]{64}$/.test(reviewToken)||acknowledgeRisk!==true)throw Error('Revisa el libro y confirma el riesgo antes de liberar el aviso local.');
   const ctx=await context();await permission(ctx);const key=await journalKey(ctx,'fund-'+kind);
   return exclusive(ctx,key,async()=>{let entry;try{entry=read(key,'fund-'+kind);}catch(error){if(error.code!=='COBRA_JOURNAL_INVALID')throw error;}
    if(entry===null)return {state:'none'};const review=await unresolved(key,entry,entry?'unconfirmed':'invalid');assert(ctx);
    if(review.reviewToken!==reviewToken)throw Error('El pendiente cambió. Vuelve a comprobarlo.');if(!review.canDiscard)throw Error('Espera al menos un minuto y comprueba el pendiente otra vez.');
    if(entry){const row=await fundLookup(ctx,kind,entry.id);if(row)return resolveFundRow(ctx,key,entry,row);}assert(ctx);
    const retired=archive(key).entries;retired.push({id:entry?.id||null,kind:'fund-'+kind,discardedAt:now()});write(archiveKey(key),retired.slice(-ARCHIVE_LIMIT));clearJournal(key);return {state:'discarded',requestId:entry?.id};
   });
  }
  async function saveFund(kind,request){let submitted=false;try{
   if(!['funding','action'].includes(kind)||!uuid(request?.id)||!request.payload)throw Error('Solicitud inválida.');
   const captured=JSON.parse(JSON.stringify(request)),ctx=await context();await permission(ctx);const key=await journalKey(ctx,'fund-'+kind),proof=await hash(stableJSON(captured.payload));let digest=await hash(stableJSON(captured));assert(ctx);
   return await exclusive(ctx,key,async()=>{
    const pending=read(key,'fund-'+kind),retired=archive(key),wasSent=!!pending||retired.unknown||uncertainIntents.has('fund-'+kind+':'+captured.id)||retired.entries.some(x=>x.id===captured.id);if(pending){const replayDigest=await hash(stableJSON({...captured,id:pending.id}));assert(ctx);if(pending.proof!==proof||pending.digest!==replayDigest)throw Error('Hay una solicitud pendiente. Comprueba su resultado antes de crear otra.');captured.id=pending.id;digest=replayDigest;}
    const verify=async row=>{if(!row||await hash(stableJSON(row.payload))!==proof)throw Error('El recibo no coincide con esta solicitud.');assert(ctx);clearJournal(key);uncertainIntents.delete('fund-'+kind+':'+captured.id);return {id:row.id,saved:true,payment_executed:false};};
    const found=await fundLookup(ctx,kind,captured.id);if(found)return verify(found);
    write(key,{id:captured.id,digest,proof,sentAt:now()});uncertainIntents.add('fund-'+kind+':'+captured.id);submitted=true;
    try{const receipt=await query(ctx,()=>client.rpc('cobra_provision_save',{p_request_id:captured.id,p_kind:kind,p_payload:captured.payload}));
     if(!uuid(receipt?.id)||receipt.request_id!==captured.id||receipt.saved!==true||receipt.payment_executed!==false)throw Error('No se pudo verificar el recibo.');return await verify(receipt);
    }catch(error){assert(ctx);const confirmed=await fundLookup(ctx,kind,captured.id);if(confirmed)return verify(confirmed);
     if(!wasSent&&['P0001','23514','23502','23505','22P02','22003','42501'].includes(error.code)){clearJournal(key);uncertainIntents.delete('fund-'+kind+':'+captured.id);error.resetIntent=true;}
     if(wasSent&&['P0001','23514','23502','23505','22P02','22003','42501'].includes(error.code))throw Error('El reintento fue rechazado, pero el primer envío sigue sin confirmar. Comprueba el libro y el pendiente.');
     throw error;
    }
   });
  }catch(error){if(!submitted)error.resetIntent=true;throw error;}}
  return Object.freeze({save,recover,discard,listCuts,listAllCuts,loadCut,history,fundCapabilities,fundBook,coverageBook,fundSource,customerHistory,recoverFund,discardFund,saveFund,async capabilities(){const ctx=await context();const operator=await query(ctx,()=>client.rpc('cobra_quality_operator'));const importer=operator===true?await query(ctx,()=>client.rpc('cobra_quality_importer')):false;return {operator:operator===true,importer:importer===true};},dispose(){disposed=true;invalidate();uncertainIntents.clear();subscription.unsubscribe();}});
 }
 const api={create,CUT_COLUMNS,EVENT_COLUMNS};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CobraQualityConnection=api;
})(typeof window!=='undefined'?window:globalThis);
