const endpoint='https://aura-meta-ads-api.comercial-853.workers.dev/v1/organic/calendars';
const states={published:'Publicada según registro',scheduled:'Programada',preparing:'En preparación',creating:'Preparando archivo',container_ready:'Archivo listo; no publicado',sending:'Enviando; sin confirmar',accepted:'Aceptada; falta verificación',needs_verification:'Requiere verificación',uncertain:'Resultado incierto',failed:'Falló',blocked:'Bloqueada',cancelled:'Cancelada'};
const scalar=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const text=x=>typeof x==='string'?x:'';
function date(x,now){const t=typeof x==='string'?Date.parse(x):NaN;return Number.isFinite(t)&&t<=now?new Date(t).toISOString():null}
function link(value,channel){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.pathname==='/')return null;const hosts=channel==='instagram'?['instagram.com','www.instagram.com']:['facebook.com','www.facebook.com','m.facebook.com'];return hosts.includes(u.hostname)?u.href:null}catch{return null}}
export function presentTracking(payload,now=Date.now()){
 if(!Array.isArray(payload?.calendars)||payload.calendars.length>200)throw Error('TRACKING_CONTRACT_REQUIRED');
 const rows=[],keys=new Set();let malformed=false;
 for(const c of payload.calendars){if(!c||typeof c.id!=='string'||!Array.isArray(c.pieces)){malformed=true;continue}
 for(const p of c.pieces){if(!p||typeof p.id!=='string'||!Array.isArray(p.channels)){malformed=true;continue}
 for(const channel of p.channels){if(!['facebook','instagram'].includes(channel)){malformed=true;continue}
 const key=JSON.stringify([c.id,p.id,channel]);if(keys.has(key)){malformed=true;continue}keys.add(key);
 const r=p.results?.[channel]||{},accountId=channel==='facebook'?c.approval?.page_id:c.approval?.instagram_id;
 const validIdentity=typeof accountId==='string'&&/^\d+$/.test(accountId)&&typeof r.id==='string'&&/^[\d_]+$/.test(r.id);
 const recordedPublished=r.status==='published'&&validIdentity&&date(r.published_at,now)&&link(r.permalink,channel);
 const snapshots=Array.isArray(r.snapshots)?r.snapshots:[];
 // Keep the newest snapshot as a whole; never mix metrics measured at different times.
 const recent=snapshots.filter(s=>s?.source==='meta'&&date(s.observed_at,now)).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at))[0];
 const duplicateTimes=recent&&snapshots.filter(s=>s?.source==='meta'&&s.observed_at===recent.observed_at).length>1;
 const snapshot=recordedPublished&&!duplicateTimes?recent:null;
 rows.push({key,calendarId:c.id,pieceId:p.id,title:text(c.title),topic:text(p.topic),channel,accountId:typeof accountId==='string'?accountId:null,postId:validIdentity?r.id:null,
 status:r.status==='published'&&!recordedPublished?'unknown':Object.hasOwn(states,r.status)?r.status:'unknown',
 label:r.status==='published'&&!recordedPublished?'Registro incompleto; verificar':(Object.hasOwn(states,r.status)?states[r.status]:'Sin estado confirmado'),
 scheduledAt:text(p.scheduled_at)||null,recordedPublishedAt:recordedPublished?r.published_at:null,verifiedAt:null,permalink:recordedPublished?link(r.permalink,channel):null,
 metrics:Object.fromEntries(['reach','likes','comments','shares','saved'].map(k=>[k,snapshot?scalar(snapshot[k]):null])),metricsObservedAt:snapshot?.observed_at||null,
 metricsPartial:!snapshot||!Array.isArray(snapshot.errors)||snapshot.errors.length>0||Boolean(r.metrics_error),requiresAttention:!recordedPublished&&r.status!=='scheduled'||Boolean(r.metrics_error)||Boolean(duplicateTimes)});
 if(rows.length>12400)throw Error('TRACKING_LIMIT');
 }}}
 const posts=new Map();for(const r of rows){const k=r.postId?JSON.stringify([r.channel,r.accountId,r.postId]):null;if(k){if(posts.has(k)){r.duplicate=true;posts.get(k).duplicate=true}else posts.set(k,r)}}
 return{source:'aura_saved_registry',rows,queriedAt:new Date(now).toISOString(),limited:payload.calendars.length===200,malformed,freshPlatformVerification:false};
}
export async function loadTracking({token,fetchImpl=globalThis.fetch,now=Date.now()}={}){
 if(typeof token!=='string'||!token||/\s/.test(token))throw Error('SESSION_REQUIRED');
 const r=await fetchImpl(endpoint,{method:'GET',cache:'no-store',redirect:'error',headers:{Authorization:`Bearer ${token}`}});
 if(!r.ok)throw Error(r.status===403?'TRACKING_FORBIDDEN':'TRACKING_UNAVAILABLE');return presentTracking(await r.json(),now);
}
