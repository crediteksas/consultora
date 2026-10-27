const KORA_DB_URL='https://jfkmiyvcdfbsbwchyvol.supabase.co';
const READ=new Set(['origenes','perfiles','documentos_solicitud','kora_nova_sources','nova_retail_cases','nova_retail_case_events','nova_retail_notifications','nova_retail_store_contacts','nova_retail_reference_replacements','nova_retail_photo_reviews','nova_retail_photo_events','nova_retail_actor_emails','nova_retail_reviewers']);
const RPC=new Set(['kora_nova_effective_references','nova_retail_save','nova_retail_review','nova_retail_candidates','nova_retail_notification_claim','nova_retail_notification_finish','nova_retail_request_queries','nova_retail_confirm_delivery']);
const WRITE={nova_retail_cases:{PATCH:['last_checked_at']},nova_retail_notifications:{PATCH:['state','error_code']},nova_retail_store_contacts:{POST:['store_code','recipient','confirmed_by','confirmed_at']},nova_retail_case_events:{POST:['source_id','revision','actor_id','actor_name','action','payload']},nova_retail_reference_replacements:{POST:['id','source_id','reference_type','superseded_reference_id','nombre','telefono','parentesco','actor_id'],PATCH:['applied_at']}};
async function equal(a,b){if(!b||typeof a!=='string'||a.length>1024)return false;const enc=new TextEncoder(),[x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);let n=0;const left=new Uint8Array(x),right=new Uint8Array(y);for(let i=0;i<32;i++)n|=left[i]^right[i];return n===0;}
async function read(request){const reader=request.body?.getReader();if(!reader)throw Error();const chunks=[];let size=0;try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>262144){await reader.cancel();throw Error();}chunks.push(r.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.byteLength;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function retailDatabaseGateway(request,env,fetcher=fetch){
 if(request.method!=='POST'||new URL(request.url).pathname!=='/internal/retail-db')return Response.json({error:'NOT_FOUND'},{status:404});
 if(!await equal(request.headers.get('authorization')?.replace(/^Bearer /,''),env.NOVA_REGISTRATION_INTAKE_TOKEN))return Response.json({error:'UNAUTHORIZED'},{status:401});
 const key=env.SUPABASE_SERVICE_KEY;if(!key)return Response.json({error:'NOT_CONFIGURED'},{status:503});
 const headers={apikey:key,...!key.startsWith('sb_secret_')?{authorization:'Bearer '+key}:{},'content-type':'application/json'};
 try{
  const p=await read(request);
  if(p.kind==='document'){
   if(typeof p.path!=='string'||!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/(frente|reverso|selfie)-[a-zA-Z0-9-]{1,128}\.(jpg|jpeg|png)$/.test(p.path))throw Error();
   return fetcher(KORA_DB_URL+'/storage/v1/object/cedulas/'+p.path.split('/').map(encodeURIComponent).join('/'),{headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
  }
  if(p.kind==='authUser'){
   if(!/^[a-f0-9-]{36}$/i.test(p.id||''))throw Error();
   const r=await fetcher(KORA_DB_URL+'/auth/v1/admin/users/'+p.id,{headers,redirect:'manual',signal:AbortSignal.timeout(8000)});if(!r.ok)return r;
   const data=await read(r),u=data.user||data;return Response.json({id:u.id,email:u.email,email_confirmed_at:u.email_confirmed_at,banned_until:u.banned_until||null});
  }
  if(typeof p.path!=='string'||p.path.length>4096||/[\r\n#]/.test(p.path)||!['GET','POST','PATCH'].includes(p.method))throw Error();
  const table=p.path.split('?')[0];
  if(p.method==='GET'){if(!READ.has(table))throw Error();}
  else if(table.startsWith('rpc/')){if(p.method!=='POST'||!RPC.has(table.slice(4)))throw Error();}
  else {
   const fields=WRITE[table]?.[p.method];if(!fields||!p.body||typeof p.body!=='object'||Array.isArray(p.body)||Object.keys(p.body).some(k=>!fields.includes(k)))throw Error();
  }
  if(p.prefer&&!['return=minimal','return=representation','resolution=merge-duplicates,return=minimal'].includes(p.prefer))throw Error();
  return fetcher(KORA_DB_URL+'/rest/v1/'+p.path,{method:p.method,headers:{...headers,...p.prefer?{Prefer:p.prefer}:{}},body:p.body===undefined?undefined:JSON.stringify(p.body),redirect:'manual',signal:AbortSignal.timeout(10000)});
 }catch{return Response.json({error:'REQUEST_NOT_ALLOWED'},{status:403});}
}
