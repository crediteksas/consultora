import {REFERENCE_TEMPLATE,templateHealth} from './meta-preflight.mjs';
import {evaluateApplication,referenceProgress,storeResult,RETAIL_STORES,POLICY_VERSION} from './policy.mjs';
const KORA='https://jfkmiyvcdfbsbwchyvol.supabase.co',AURA='https://ditiwpndvmyuqcagupea.supabase.co';
const PUBLIC_KEY='sb_publishable_8iTCxvU5uzbSZ-OQmdI1GQ_6ulKKZyr';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TYPES=['frente','reverso','selfie'];
const ALLOWED_ORIGINS=new Set(['https://aura.crediteksas.com','https://registro.crediteksas.com','https://creditek-nova.comercial-853.workers.dev']);
export async function sha(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function createRetailRuntime({fetcher=fetch,now=Date.now,makeInvitation}={}){
 const headers=k=>({apikey:k,...!k?.startsWith('sb_secret_')?{authorization:'Bearer '+k}:{},'content-type':'application/json'});
 async function readText(r,max){
  if(Number(r.headers.get('content-length'))>max)throw Error('BODY_TOO_LARGE');
  const reader=r.body?.getReader();if(!reader)return '';const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('BODY_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.byteLength;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }
 async function bounded(r,max=1048576){return JSON.parse(await readText(r,max));}
 async function db(env,project,path,{method='GET',body,prefer}={}){
  const key=project==='kora'?env.KORA_SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY;
  let r;
  if(project==='kora'&&env.NOVA_RETAIL_DATABASE?.fetch){
   r=await env.NOVA_RETAIL_DATABASE.fetch(new Request('https://registration.internal/internal/retail-db',{method:'POST',headers:{authorization:'Bearer '+env.NOVA_REGISTRATION_INTAKE_TOKEN,'content-type':'application/json'},body:JSON.stringify({path,method,body,prefer}),signal:AbortSignal.timeout(12000)}));
  }else{
   if(!key)throw Error('DATABASE_NOT_CONFIGURED');
   r=await fetcher((project==='kora'?KORA:AURA)+'/rest/v1/'+path,{method,headers:{...headers(key),...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(10000)});
  }
  if(!r.ok){const e=Error('DATABASE_UNAVAILABLE');e.http=r.status;try{const d=await bounded(r,8192);e.code=d.code||d.error_code||null;}catch{}throw e;}
  if(r.status===204){await r.body?.cancel();return null;}return bounded(r);
 }
 const rpc=(env,name,args)=>db(env,'kora','rpc/'+name,{method:'POST',body:args});
 async function authenticate(request,env){
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [^\s]{20,4096}$/.test(authorization))throw Error('UNAUTHENTICATED');
  let r=await fetcher(KORA+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,authorization},redirect:'manual',signal:AbortSignal.timeout(8000)});
  let u;
  if(r.ok)u=await bounded(r,65536);
  else {
   await r.body?.cancel();
   r=await fetcher(AURA+'/auth/v1/user',{headers:{apikey:'sb_publishable_oVNantrnKzXdtXu5B7YQIg_9fxHp7aW',authorization},redirect:'manual',signal:AbortSignal.timeout(8000)});
   if(!r.ok){await r.body?.cancel();throw Error('UNAUTHENTICATED');}
   const a=await bounded(r,65536);if(!a.email_confirmed_at||typeof a.email!=='string')throw Error('UNAUTHENTICATED');
   const matches=await db(env,'kora','nova_retail_actor_emails?email=eq.'+encodeURIComponent(a.email.toLowerCase())+'&select=actor_id&limit=2');
   if(matches.length!==1)throw Error('FORBIDDEN');
   const user=env.NOVA_RETAIL_DATABASE?.fetch?await env.NOVA_RETAIL_DATABASE.fetch(new Request('https://registration.internal/internal/retail-db',{method:'POST',headers:{authorization:'Bearer '+env.NOVA_REGISTRATION_INTAKE_TOKEN,'content-type':'application/json'},body:JSON.stringify({kind:'authUser',id:matches[0].actor_id})})):await fetcher(KORA+'/auth/v1/admin/users/'+matches[0].actor_id,{headers:headers(env.KORA_SUPABASE_SERVICE_ROLE_KEY),redirect:'manual',signal:AbortSignal.timeout(8000)});
   if(!user.ok){await user.body?.cancel();throw Error('FORBIDDEN');}
   const data=await bounded(user,65536);u=data.user||data;
   if(u.email?.toLowerCase()!==a.email.toLowerCase()||Date.parse(u.banned_until)>now())throw Error('FORBIDDEN');
  }
  if(!UUID.test(u.id))throw Error('UNAUTHENTICATED');
  const profiles=await db(env,'kora','perfiles?id=eq.'+u.id+'&activo=eq.true&select=id,nombre,rol,tienda_codigo&limit=2');
  if(profiles.length!==1)throw Error('FORBIDDEN');
  const reviewers=await db(env,'kora','nova_retail_reviewers?actor_id=eq.'+u.id+'&select=can_review&limit=1');
  const global=reviewers.length===1,p=profiles[0];
  if(!global&&(!RETAIL_STORES.includes(p.tienda_codigo)||p.rol!=='admin_tienda'))throw Error('FORBIDDEN');
  return {id:u.id,name:p.nombre,store:p.tienda_codigo,global,canReview:global&&reviewers[0].can_review===true};
 }
 function assertScope(actor,c){if(!c||(!actor.global&&actor.store!==c.store_code))throw Error('NOT_FOUND');}
 async function source(env,id){const rows=await db(env,'kora','kora_nova_sources?solicitud_id=eq.'+id+'&select=*&limit=1');if(rows.length!==1||!RETAIL_STORES.includes(rows[0].registration?.p_origen_codigo))throw Error('NOT_FOUND');const effective=await rpc(env,'kora_nova_effective_references',{p_source:id});return {...rows[0],effectiveReferences:effective};}
 async function evidence(env,s){
  const id=s.solicitud_id;
  const [photoRows,documents,receipts,caseRows]=await Promise.all([
   db(env,'kora','nova_retail_photo_reviews?otp_id=eq.'+s.otp_id+'&select=results,hashes,failures,updated_at&limit=1'),
   db(env,'kora','documentos_solicitud?solicitud_id=eq.'+id+'&select=tipo,sha256,storage_path,created_at'),
   db(env,'aura','nova_registration_receipts?source_application_id=eq.'+id+'&select=application_id,payload_hash&limit=1'),
   db(env,'kora','nova_retail_cases?source_id=eq.'+id+'&select=*')]);
  const app=receipts[0]?.application_id,reg=s.registration;
  if(app&&caseRows[0]?.query_request_id)await db(env,'aura','rpc/nova_retail_requery',{method:'POST',body:{p_source:id,p_request:caseRows[0].query_request_id}});
  const [jobs,refs,dialogs,deliveries]=app?await Promise.all([
   db(env,'aura','nova_platform_jobs?application_id=eq.'+app+'&select=id,platform,status,observation,reason_code,checked_at,updated_at,consent,inputs,retail_batch_id'),
   db(env,'aura','nova_reference_verifications?superseded_at=is.null&application_id=eq.'+app+'&select=id,reference_type,contact_hash,consent_status,verification_status'),
   db(env,'aura','nova_reference_dialogues?application_id=eq.'+app+'&select=reference_id,state,status,outcome,updated_at'),
   db(env,'aura','nova_retail_reference_dispatch?source_id=eq.'+id+'&select=reference_id,state,attempts,delivered_at,updated_at')]):[[],[],[],[]];
  const declined=refs.length?await db(env,'aura','nova_reference_dialogues?status=eq.declined&contact_hash=in.('+refs.map(r=>r.contact_hash).join(',')+')&select=contact_hash'):[];
  const quality=photoRows[0];const photos=Object.fromEntries(TYPES.map(type=>{
   const found=documents.find(d=>d.tipo===type),q=quality?.results?.[type];
   return [type,{status:found&&q&&quality.hashes?.[type]===found.sha256?q.status:found?'manual_pending':'missing',attempts:quality?.failures?.[type]||0,issues:q?.issues||['quality_evidence_missing'],hash:found?.sha256||null}];
  }));
  const referenceEvidence=[];
  for(const r of refs){
   const expected=s.effectiveReferences?.find(x=>x.type===r.reference_type),dialog=dialogs.find(d=>d.reference_id===r.id),a=dialog?.state?.answers,delivery=deliveries.find(d=>d.reference_id===r.id);
   const matches=expected&&await sha(env.NOVA_PII_HASH_PEPPER+':'+expected.telefono)===r.contact_hash;
   referenceEvidence.push({id:r.id,type:r.reference_type,phone:expected?.telefono||'',name:expected?.nombre||'',reportedRelationship:a?.relationship||null,responded:dialog?.status==='completed',knowsCustomer:a?.knows,relationshipConfirmed:matches&&((r.reference_type==='family'&&a?.relationship==='family')||(r.reference_type==='personal'&&a?.relationship&&a.relationship!=='family')),contactConfirmed:a?.contact_confirmed===true,contradictory:!matches||dialog?.outcome==='does_not_know'||(a?.knows===true&&((r.reference_type==='family')!==(a.relationship==='family'))),contactDeclined:dialog?.status==='declined'||declined.some(d=>d.contact_hash===r.contact_hash),deliveryFailed:delivery?.state==='failed'&&delivery?.attempts>=5,refusedToAnswer:dialog?.outcome==='refused',deliveredAt:delivery?.delivered_at||null,dialogUpdatedAt:dialog?.updated_at||null});
  }
  const existing=caseRows[0];
  const observations=jobs.map(j=>{
   const o=j.observation||{},emptyAlo=j.platform==='ALO'&&o.identityStatus==='queried_document'&&o.reportedProducts===0&&o.reason==='ALO_NO_ACTIVE_OBLIGATIONS_REPORTED'&&j.inputs?.document===reg.p_cedula,valid=(!existing?.query_request_id||j.retail_batch_id===existing.query_request_id)&&j.status==='observed'&&o.availability==='observed'&&(o.identityStatus==='verified'||emptyAlo);
   // Adapters must explicitly certify counts. Never infer them from money or payment events.
   return {platform:j.platform,status:valid?'observed':j.status==='observed'?'unavailable':j.status,identityVerified:valid,checkedAt:j.checked_at,obligationsComplete:emptyAlo||o.obligationsComplete===true,obligations:emptyAlo?[]:Array.isArray(o.obligations)?o.obligations:[],reason:j.reason_code};
  });
  const queryAt=Date.parse(existing?.query_requested_at);
  const forDelivery=existing?.delivery_requested===true;
  const queryAttempted=Number.isFinite(queryAt)&&jobs.filter(j=>j.retail_batch_id===existing.query_request_id&&(!['queued','running'].includes(j.status)||now()-Date.parse(j.updated_at)>=120000)).length>=2;
  const input={storeCode:reg.p_origen_codigo,customerPhone:reg.p_celular,photos,references:referenceEvidence,platforms:observations,deliveryRequested:forDelivery,queriesMadeForDelivery:!forDelivery||queryAttempted};
  let decision=evaluateApplication(input,now());
  if(s.revoked_at)decision={...decision,state:'review',canProcess:false,requiresAndrea:true,reasons:['consent_revoked']};
  const querying=jobs.some(j=>['queued','running'].includes(j.status)&&now()-Date.parse(j.updated_at)<120000&&(j.platform!=='KREDIYA'||env.NOVA_KREDIYA_EXECUTOR_ENABLED==='true'))||Boolean(existing?.query_request_id&&!jobs.some(j=>j.retail_batch_id===existing.query_request_id));
  if(querying&&decision.state==='review'&&decision.reasons.every(x=>['fewer_than_two_platforms','incomplete_obligations','incomplete_payment_history'].includes(x)))decision={...decision,state:'waiting',canProcess:false,requiresAndrea:false,reasons:['platform_queries_in_progress']};
  const summary={name:reg.p_nombre_completo,storeCode:reg.p_origen_codigo,photos:TYPES.map(t=>({type:t,...photos[t]})),references:referenceEvidence.map(r=>({id:r.id,type:r.type,status:referenceProgress(r,now()).state,name:r.name,reportedRelationship:r.reportedRelationship,knowsCustomer:r.knowsCustomer??null,contactConfirmed:r.contactConfirmed,responded:r.responded,deliveredAt:r.deliveredAt})),platforms:jobs.map(j=>({platform:j.platform,status:j.status,checkedAt:j.checked_at,fresh:Number.isFinite(Date.parse(j.checked_at))&&now()-Date.parse(j.checked_at)<86400000,reason:j.reason_code,observation:j.observation})),deliveryRequested:forDelivery,queriesMadeForDelivery:queryAttempted};
  const fingerprint=await sha(JSON.stringify({source:s.input_hash,revoked:s.revoked_at,photoHashes:quality?.hashes,photoResults:quality?.results,documents:documents.map(d=>({type:d.tipo,hash:d.sha256})).sort((a,b)=>a.type.localeCompare(b.type)),summary,decision,queryRequestedAt:existing?.query_requested_at||null,renewedAt:existing?.renewed_at||null,policy:POLICY_VERSION}));
  return {decision,summary,fingerprint,documents,referenceEvidence,jobs};
 }
 async function reconcileOne(env,id){const s=await source(env,id),e=await evidence(env,s);const row=await rpc(env,'nova_retail_save',{p_source:id,p_fingerprint:e.fingerprint,p_decision:e.decision,p_summary:e.summary});await db(env,'kora','nova_retail_cases?source_id=eq.'+id,{method:'PATCH',prefer:'return=minimal',body:{last_checked_at:new Date(now()).toISOString()}});return row;}
 async function reconcile(env){
  if(env.NOVA_RETAIL_ENABLED!=='true')return {disabled:true};
  const candidates=await rpc(env,'nova_retail_candidates',{});const sources=candidates.map(id=>({solicitud_id:id}));
  let done=0;for(const s of sources){try{await reconcileOne(env,s.solicitud_id);done++;}catch{console.warn(JSON.stringify({event:'retail_reconcile_unavailable'}));}}
  return {evaluated:done};
 }
 async function sendReferences(env,sourceId){
  if(env.NOVA_RETAIL_ENABLED!=='true'||!(await templateHealth(env)).ready||typeof makeInvitation!=='function')return;
  const ids=sourceId?[sourceId]:await rpc(env,'nova_retail_candidates',{});
  for(const id of ids.slice(0,30))try{
   const s=await source(env,id);if(s.revoked_at||s.consent?.granted!==true)continue;
   const cases=await db(env,'kora','nova_retail_cases?source_id=eq.'+id+'&select=state,delivered_at&limit=1');
   if(cases[0]?.state==='rejected'||cases[0]?.delivered_at)continue;
   const receipts=await db(env,'aura','nova_registration_receipts?source_application_id=eq.'+id+'&select=application_id,payload_hash&limit=1');if(receipts.length!==1)continue;
   const refs=await db(env,'aura','nova_reference_verifications?superseded_at=is.null&application_id=eq.'+receipts[0].application_id+'&select=id,reference_type,contact_hash');
   for(const ref of refs){
    const expected=s.effectiveReferences?.find(r=>r.type===ref.reference_type);
    if(!expected||expected.contact_authorized!==true||!/^3\d{9}$/.test(expected.telefono)||await sha(env.NOVA_PII_HASH_PEPPER+':'+expected.telefono)!==ref.contact_hash)continue;
    const ctx=await db(env,'aura','rpc/nova_reference_context',{method:'POST',body:{p_reference_id:ref.id,p_contact_hash:ref.contact_hash}});
    if(!ctx||ctx.dialogue||ctx.source_application_id!==id)continue;
    const attempt=await db(env,'aura','rpc/nova_retail_reference_reserve',{method:'POST',body:{p_reference:ref.id,p_source:id,p_contact_hash:ref.contact_hash}});if(!UUID.test(attempt))continue;
    let state='uncertain',messageId=null,error=null;
    try{
     const current=await source(env,id);if(current.revoked_at)throw Error('CONSENT_CHANGED');
     const invite=await makeInvitation(ctx,env.NOVA_PII_HASH_PEPPER,now());
     const r=await fetcher('https://graph.facebook.com/v26.0/'+env.NOVA_PHONE_NUMBER_ID+'/messages',{method:'POST',redirect:'manual',headers:{authorization:'Bearer '+env.NOVA_META_ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:'57'+expected.telefono,type:'template',template:{name:REFERENCE_TEMPLATE.name,language:{code:'es_CO'},components:[{type:'body',parameters:[{type:'text',text:current.registration.p_nombre_completo},{type:'text',text:invite.url}]}]}}),signal:AbortSignal.timeout(10000)});
     const d=await bounded(r,8192);if(r.ok&&typeof d.messages?.[0]?.id==='string'){state='accepted';messageId=d.messages[0].id;}else if(r.status>=400&&r.status<500){state='failed';error=Number.isSafeInteger(d.error?.code)?d.error.code:r.status;}
    }catch{}
    await db(env,'aura','rpc/nova_retail_reference_finish',{method:'POST',body:{p_reference:ref.id,p_attempt:attempt,p_state:state,p_message_id:messageId,p_error:error}});
   }
  }catch{console.warn(JSON.stringify({event:'retail_reference_dispatch_unavailable'}));}
 }
 async function sendNotices(env){
  if(env.NOVA_RETAIL_ENABLED!=='true'||(await templateHealth(env)).staff!=='APPROVED')return;
  for(let i=0;i<5;i++){
   const n=await rpc(env,'nova_retail_notification_claim',{});if(!n)break;
   let recipient=null;
   if(n.audience==='andrea'){
    const people=await db(env,'kora','nova_retail_reviewers?can_review=eq.true&select=recipient');if(people.length===1)recipient=people[0].recipient;
   }else{
    const contact=await db(env,'kora','nova_retail_store_contacts?store_code=eq.'+n.store_code+'&select=recipient&limit=1');recipient=contact[0]?.recipient;
   }
   const finish=(state,id=null,error=null)=>rpc(env,'nova_retail_notification_finish',{p_id:n.id,p_attempt:n.attempt_id,p_state:state,p_recipient:recipient||null,p_message:id,p_error:error});
   if(!/^573\d{9}$/.test(recipient||'')){await finish('queued',null,'CONTACT_REQUIRED');continue;}
   const text=n.case_state==='review'?'Solicitud pendiente de revisión de Andrea':n.case_state==='authorized'?'Autorizado para tramitar':'Rechazado';
   try{
    const r=await fetcher('https://graph.facebook.com/v26.0/'+env.NOVA_PHONE_NUMBER_ID+'/messages',{method:'POST',redirect:'manual',headers:{authorization:'Bearer '+env.NOVA_META_ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:recipient,type:'template',template:{name:'nova_aviso_ejecutivo_v1',language:{code:'es_CO'},components:[{type:'body',parameters:[{type:'text',text:'NOVA-'+n.source_id.slice(0,8).toUpperCase()},{type:'text',text}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:n.source_id}]}]}}),signal:AbortSignal.timeout(10000)});
    const d=await bounded(r,8192);if(r.ok&&typeof d.messages?.[0]?.id==='string')await finish('accepted',d.messages[0].id);else await finish(r.status>=400&&r.status<500?'failed':'uncertain',null,String(d.error?.code||r.status));
   }catch{await finish('uncertain',null,'SEND_UNCONFIRMED');}
  }
 }
 async function statuses(request,env){
  if(env.NOVA_RETAIL_ENABLED!=='true')return;
  const raw=await readText(request,262144);if(raw.length>262144)throw Error('WEBHOOK_TOO_LARGE');
  const sig=request.headers.get('x-hub-signature-256')?.replace(/^sha256=/,'');if(!/^[a-f0-9]{64}$/.test(sig||''))return;
  const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.NOVA_META_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',k,Uint8Array.from(sig.match(/../g),x=>parseInt(x,16)),new TextEncoder().encode(raw)))return;
  const payload=JSON.parse(raw);if(payload.object!=='whatsapp_business_account')return;
  for(const entry of payload.entry||[]){if(String(entry.id)!==env.NOVA_WABA_ID)continue;for(const change of entry.changes||[]){const v=change.value;if(change.field!=='messages'||v?.metadata?.phone_number_id!==env.NOVA_PHONE_NUMBER_ID)continue;
   for(const s of v.statuses||[]){
    if(!['sent','delivered','read','failed'].includes(s.status)||!/^573\d{9}$/.test(s.recipient_id)||typeof s.id!=='string'||s.id.length>250||!Number.isFinite(Number(s.timestamp)))continue;
    const at=Number(s.timestamp)*1000;if(at>now()+60000)continue;
    await db(env,'aura','rpc/nova_retail_reference_status',{method:'POST',body:{p_message_id:s.id,p_contact_hash:await sha(env.NOVA_PII_HASH_PEPPER+':'+s.recipient_id.slice(2)),p_status:s.status,p_at:new Date(at).toISOString(),p_error:Number.isSafeInteger(s.errors?.[0]?.code)?s.errors[0].code:null}});
    const notices=await db(env,'kora','nova_retail_notifications?provider_message_id=eq.'+encodeURIComponent(s.id)+'&recipient=eq.'+s.recipient_id+'&select=id,state&limit=1');const n=notices[0];
    if(n&&!(n.state==='read'||n.state==='delivered'&&['sent','failed'].includes(s.status)))await db(env,'kora','nova_retail_notifications?id=eq.'+n.id,{method:'PATCH',prefer:'return=minimal',body:{state:s.status==='sent'?'accepted':s.status,error_code:s.errors?.[0]?.code?String(s.errors[0].code):null}});
   }
  }}
 }
 async function repairReplacements(env){
  const pending=await db(env,'kora','nova_retail_reference_replacements?applied_at=is.null&select=id,source_id,telefono&order=created_at.asc&limit=10');
  for(const r of pending){const refs=await db(env,'aura','nova_reference_verifications?id=eq.'+r.id+'&select=contact_hash&limit=1');if(refs.length===1&&refs[0].contact_hash===await sha(env.NOVA_PII_HASH_PEPPER+':'+r.telefono))await db(env,'kora','nova_retail_reference_replacements?id=eq.'+r.id,{method:'PATCH',prefer:'return=minimal',body:{applied_at:new Date(now()).toISOString()}});}
 }

 async function historyPage(env,id,cursors={}){
  const s=await source(env,id),streams=[['case','nova_retail_case_events','source_id',id],['photo','nova_retail_photo_events','otp_id',s.otp_id]];
  const all=[];let possiblyMore=false;
  for(const [kind,table,key,value]of streams){
   const cursor=cursors[kind];if(cursor!==undefined&&!/^[1-9][0-9]{0,18}$/.test(String(cursor)))throw Error('INVALID_CURSOR');
   const rows=await db(env,'kora',table+'?'+key+'=eq.'+value+(cursor?'&id=lt.'+cursor:'')+'&select=*&order=id.desc&limit=51');
   if(rows.length===51)possiblyMore=true;
   for(const e of rows)all.push(kind==='case'?{...e,kind,id:String(e.id)}:{kind,id:String(e.id),at:e.at,actor_name:'NOVA',action:'photo_review',payload:{results:e.results,failures:e.failures}});
  }
  all.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||(a.kind===b.kind?(BigInt(a.id)>BigInt(b.id)?-1:1):a.kind.localeCompare(b.kind)));
  const history=all.slice(0,50),next={...cursors};for(const e of history)next[e.kind]=e.id;
  return {history,historyCursors:next,historyHasMore:possiblyMore||all.length>50};
 }
 async function api(request,env){
  const origin=request.headers.get('origin');
  const cors=origin&&ALLOWED_ORIGINS.has(origin)?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'POST,OPTIONS'}:{};
  const reply=(b,status=200)=>Response.json(b,{status,headers:{...cors,'cache-control':'no-store'}});
  if(request.method==='OPTIONS')return new Response(null,{status:ALLOWED_ORIGINS.has(origin)?204:403,headers:cors});
  if(request.method!=='POST'||(origin&&!ALLOWED_ORIGINS.has(origin)))return reply({error:'NOT_ALLOWED'},403);
  if(env.NOVA_RETAIL_ENABLED!=='true')return reply({error:'PILOT_NOT_ACTIVE'},503);
  try{
   const actor=await authenticate(request,env);const raw=await readText(request,8192);if(raw.length>8192)return reply({error:'BODY_TOO_LARGE'},413);const b=JSON.parse(raw);
   if(b.action==='list'){
    const rows=await db(env,'kora','nova_retail_cases?select=source_id,store_code,state,revision,summary,valid_until,updated_at'+(actor.global?'':'&store_code=eq.'+actor.store)+'&order=updated_at.desc&limit=100');
    if(!actor.global&&rows.some(c=>c.store_code!==actor.store))throw Error('FORBIDDEN');
    const stores=await db(env,'kora',"origenes?codigo=in.(CK-01,CK-02,CK-03,CK-04,CK-05,CK-06,CK-07,CK-08,CK-09)&select=codigo,nombre");
    const storeName=code=>stores.find(s=>s.codigo===code)?.nombre||'Tienda sin nombre';
    const contact=RETAIL_STORES.includes(actor.store)?await db(env,'kora','nova_retail_store_contacts?store_code=eq.'+actor.store+'&select=recipient,confirmed_at&limit=1'):[];
    const proposed=RETAIL_STORES.includes(actor.store)?await db(env,'aura','tiendas?id=eq.'+actor.store+'&select=telefono&limit=1'):[];
    return reply({proposedPhone:proposed[0]?.telefono||null,actor:{name:actor.name,global:actor.global,canReview:actor.canReview,store:actor.store,storeName:storeName(actor.store)},contact:contact[0]||null,cases:rows.map(c=>({id:c.source_id,store:c.store_code,storeName:storeName(c.store_code),name:c.summary?.name,...storeResult(c),state:c.state,revision:c.revision,validUntil:c.valid_until,updatedAt:c.updated_at,...actor.global?{summary:c.summary}:{}}))});
   }
   if(b.action==='contact'){
    const store=actor.global?b.store:actor.store;if(!RETAIL_STORES.includes(store)||!/^573\d{9}$/.test(b.phone))throw Error('INVALID_CONTACT');
    await db(env,'kora','nova_retail_store_contacts?on_conflict=store_code',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{store_code:store,recipient:b.phone,confirmed_by:actor.id,confirmed_at:new Date(now()).toISOString()}});return reply({ok:true});
   }
   if(!UUID.test(b.id))throw Error('INVALID_CASE');
   const rows=await db(env,'kora','nova_retail_cases?source_id=eq.'+b.id+'&select=*&limit=1');const c=rows[0];assertScope(actor,c);
   if(b.action==='detail'){
    const fresh=await reconcileOne(env,b.id);
    if(actor.global){const corrections=fresh.state==='rejected'?[]:(fresh.summary?.references||[]).filter(r=>r.status==='replace').map(r=>({type:r.type,id:r.id,action:'replace_reference'}));const history=await historyPage(env,b.id);return reply({case:fresh,...history,corrections});}
    const s=await source(env,b.id),e=await evidence(env,s);
    return reply({id:c.source_id,name:s.registration.p_nombre_completo,state:fresh.state,...storeResult(fresh),revision:fresh.revision,deliveredAt:fresh.delivered_at,deliveryRequested:fresh.summary?.deliveryRequested===true,queriesMadeForDelivery:fresh.summary?.queriesMadeForDelivery===true,queryRequestedAt:fresh.query_requested_at,reevaluateAfter:fresh.rejected_at?new Date(Date.parse(fresh.rejected_at)+15*86400000).toISOString():null,corrections:fresh.state==='rejected'?[]:e.referenceEvidence.filter(r=>referenceProgress(r,now()).state==='replace').map(r=>({type:r.type,id:r.id,action:'replace_reference'}))});
   }
   if(b.action==='history'){if(!actor.global)throw Error('FORBIDDEN');return reply(await historyPage(env,b.id,b.cursors||{}));}
   if(b.action==='review'){
    if(!actor.canReview)throw Error('FORBIDDEN');
    await reconcileOne(env,b.id);
    const reviewed=await rpc(env,'nova_retail_review',{p_source:b.id,p_revision:b.revision,p_actor:actor.id,p_action:b.decision,p_note:b.note});return reply({ok:true,state:reviewed.state});
   }
   if(b.action==='requery'){
    const requested=await rpc(env,'nova_retail_request_queries',{p_source:b.id,p_actor:actor.id,p_delivery:b.delivery===true});
    await db(env,'aura','rpc/nova_retail_requery',{method:'POST',body:{p_source:b.id,p_request:requested.query_request_id}});
    return reply({ok:true,status:'Consultando nuevamente las plataformas'});
   }
   if(b.action==='deliver'){
    await reconcileOne(env,b.id);
    const delivered=await rpc(env,'nova_retail_confirm_delivery',{p_source:b.id,p_actor:actor.id,p_revision:b.revision});return reply({ok:delivered===true});
   }
   if(b.action==='replaceReference'){
    if(!UUID.test(b.reference)||!['family','personal'].includes(b.type)||typeof b.name!=='string'||b.name.trim().length<2||b.name.length>120||!/^3\d{9}$/.test(b.phone))throw Error('INVALID_REFERENCE');
    const s=await source(env,b.id),e=await evidence(env,s),ref=e.referenceEvidence.find(r=>r.id===b.reference&&r.type===b.type);
    if(c.state==='rejected'||!ref||referenceProgress(ref,now()).state!=='replace')throw Error('REFERENCE_NOT_REPLACEABLE');
    if(b.phone===s.registration.p_celular||s.effectiveReferences.some(r=>r.telefono===b.phone))throw Error('DUPLICATE_REFERENCE');
    const id=crypto.randomUUID();
    await db(env,'kora','nova_retail_reference_replacements',{method:'POST',prefer:'return=minimal',body:{id,source_id:b.id,reference_type:b.type,superseded_reference_id:b.reference,nombre:b.name.trim(),telefono:b.phone,parentesco:typeof b.relationship==='string'?b.relationship.slice(0,120):null,actor_id:actor.id}});
    await db(env,'aura','rpc/nova_retail_replace_reference',{method:'POST',body:{p_source:b.id,p_old:b.reference,p_new:id,p_hash:await sha(env.NOVA_PII_HASH_PEPPER+':'+b.phone),p_customer_hash:await sha(env.NOVA_PII_HASH_PEPPER+':'+s.registration.p_celular)}});
    await db(env,'kora','nova_retail_reference_replacements?id=eq.'+id,{method:'PATCH',prefer:'return=minimal',body:{applied_at:new Date(now()).toISOString()}});
    await reconcileOne(env,b.id);await sendReferences(env,b.id);return reply({ok:true});
   }
   if(b.action==='document'){
    if(!actor.global||!TYPES.includes(b.type))throw Error('FORBIDDEN');
    const docs=await db(env,'kora','documentos_solicitud?solicitud_id=eq.'+b.id+'&tipo=eq.'+b.type+'&select=storage_path&limit=1');const path=docs[0]?.storage_path;
    if(typeof path!=='string'||!path.startsWith(c.cliente_id+'/'+b.id+'/')||path.includes('..'))throw Error('NOT_FOUND');
    const r=env.NOVA_RETAIL_DATABASE?.fetch?await env.NOVA_RETAIL_DATABASE.fetch(new Request('https://registration.internal/internal/retail-db',{method:'POST',headers:{authorization:'Bearer '+env.NOVA_REGISTRATION_INTAKE_TOKEN,'content-type':'application/json'},body:JSON.stringify({kind:'document',path})})):await fetcher(KORA+'/storage/v1/object/cedulas/'+path.split('/').map(encodeURIComponent).join('/'),{headers:headers(env.KORA_SUPABASE_SERVICE_ROLE_KEY),redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(!r.ok){await r.body?.cancel();throw Error('DOCUMENT_UNAVAILABLE');}
    return new Response(r.body,{headers:{...cors,'content-type':r.headers.get('content-type')||'image/jpeg','x-content-type-options':'nosniff','cache-control':'no-store'}});
   }
   return reply({error:'UNKNOWN_ACTION'},400);
  }catch(e){const denied=['UNAUTHENTICATED','FORBIDDEN','NOT_FOUND'].includes(e.message);return reply({error:denied?e.message:'ACTION_UNAVAILABLE'},e.message==='UNAUTHENTICATED'?401:denied?403:409);}
 }
 return {api,reconcile,reconcileOne,authenticate,evidence,db,rpc,sendReferences,sendNotices,statuses,repairReplacements};
}
