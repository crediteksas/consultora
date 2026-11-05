import {metric,cost,comparison} from './marketing-metrics.mjs';
// Exact event definitions: no alias sums, no combined conversions.
const CONVERSATION='onsite_conversion.messaging_conversation_started_7d';
const LEAD='lead';
function present(m){const t=m?.totals||{},a=m?.actions||{};const spend=metric(t.spend),conversations=metric(a[CONVERSATION]),leads=metric(a[LEAD]);return{spend,conversations,leads,costConversation:cost(spend,conversations),costLead:cost(spend,leads)}}
export function presentDashboardV2(payload){
 if(payload?.ok!==true||payload.contract!==2||payload.mode!=='read'||payload.source!=='meta'||!Array.isArray(payload.campaigns)||typeof payload.quality?.complete!=='boolean'||!/^[A-Z]{3}$/.test(payload.currency||''))throw Error('METRICS_CONTRACT_REQUIRED');
 const current=present(payload.current),previous=present(payload.previous);
 return{metrics:current,previous,currency:payload.currency,timezone:payload.timezone,queriedAt:payload.queriedAt,ranges:payload.ranges,complete:payload.quality.complete,quality:payload.quality,
 comparisons:Object.fromEntries(['spend','conversations','leads'].map(k=>[k,payload.quality.complete?comparison(current[k],previous[k]):{state:'incomplete',percent:null}])),
 campaigns:payload.campaigns.map(c=>({id:c.id,name:c.name,metrics:present(c.metrics),duplicate:Boolean(c.duplicate)})),
 definitions:{conversations:CONVERSATION,leads:LEAD},attribution:{sales:null,revenue:null,roas:null}};
}
export async function loadDashboardV2({token,period=7,fetchImpl=globalThis.fetch}={}){
 if(typeof token!=='string'||!token||/\s/.test(token))throw Error('SESSION_REQUIRED');if(![7,14,30].includes(period))throw Error('INVALID_PERIOD');
 const response=await fetchImpl(`https://aura-meta-ads-api.comercial-853.workers.dev/v1/dashboard?contract=2&period=${period}`,{method:'GET',cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok)throw Error('METRICS_UNAVAILABLE');return presentDashboardV2(await response.json());
}
