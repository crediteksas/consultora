import {providerMetrics,readAllPages} from './metric-contract-v2.mjs';
const FIELDS='spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,actions';
function dayInZone(now,zone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const v=t=>parts.find(p=>p.type===t).value;return `${v('year')}-${v('month')}-${v('day')}`}
function shift(day,offset){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
export function reportingRanges(now,timezone,period){if(![7,14,30].includes(period))throw Error('INVALID_PERIOD');const today=dayInZone(now,timezone);const until=shift(today,-1),since=shift(until,1-period);return{current:{since,until},previous:{since:shift(since,-period),until:shift(since,-1)},period,timezone,includesToday:false}}
function uniqueRows(rows,key){const values=new Map(),duplicates=new Set();for(const row of rows){const id=row?.[key];if(typeof id!=='string'||!id)throw Error('INVALID_PROVIDER_ID');if(values.has(id)){duplicates.add(id);values.set(id,null)}else values.set(id,row)}return{values,duplicates:[...duplicates]}}
export async function readDashboardV2({env,period=7,now=new Date(),fetchImpl=globalThis.fetch}){
 // Invoked only behind existing session + read-permission guard. Server-only credentials.
 if(!/^act_\d+$/.test(env?.META_AD_ACCOUNT_ID||'')||!env?.META_ACCESS_TOKEN||!/^v\d+\.\d+$/.test(env?.META_GRAPH_VERSION||''))throw Error('META_NOT_CONFIGURED');
 if(![7,14,30].includes(period))throw Error('INVALID_PERIOD');
 const base=`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.META_AD_ACCOUNT_ID}`;
 async function request(suffix,params){const url=new URL(base+suffix);for(const[k,v]of Object.entries(params))url.searchParams.set(k,String(v));const r=await fetchImpl(url.href,{method:'GET',headers:{Authorization:`Bearer ${env.META_ACCESS_TOKEN}`,Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('META_READ_FAILED');const body=await r.json();if(!body||body.error)throw Error('META_READ_FAILED');return body}
 const account=await request('',{fields:'id,currency,timezone_name'});
 if(account.id!==env.META_AD_ACCOUNT_ID||typeof account.currency!=='string'||!/^[A-Z]{3}$/.test(account.currency)||typeof account.timezone_name!=='string')throw Error('INVALID_ACCOUNT_METADATA');
 const ranges=reportingRanges(now,account.timezone_name,period);
 const page=(suffix,params)=>readAllPages(cursor=>request(suffix,{...params,limit:100,...cursor?{after:cursor}:{}}));
 const [current,previous,campaigns,perCampaign]=await Promise.all([
  page('/insights',{fields:FIELDS,time_range:JSON.stringify(ranges.current)}),
  page('/insights',{fields:FIELDS,time_range:JSON.stringify(ranges.previous)}),
  page('/campaigns',{fields:'id,name,objective,effective_status'}),
  page('/insights',{fields:`campaign_id,${FIELDS}`,level:'campaign',time_range:JSON.stringify(ranges.current)})
 ]);
 const directory=uniqueRows(campaigns.rows,'id'),results=uniqueRows(perCampaign.rows,'campaign_id');
 const ids=new Set([...directory.values.keys(),...results.values.keys()]);
 const quality={complete:[current,previous,campaigns,perCampaign].every(x=>x.complete),pages:{current:current.pages,previous:previous.pages,campaigns:campaigns.pages,campaignMetrics:perCampaign.pages},duplicateCampaignIds:[...new Set([...directory.duplicates,...results.duplicates])],ambiguousAccountRows:current.rows.length>1||previous.rows.length>1};
 const currentMetrics=providerMetrics(current.complete&&current.rows.length===1?current.rows[0]:undefined);
 const previousMetrics=providerMetrics(previous.complete&&previous.rows.length===1?previous.rows[0]:undefined);
 const actionIssues=m=>m.malformed||m.duplicateTypes.length>0;
 quality.actionAnomalies={current:actionIssues(currentMetrics),previous:actionIssues(previousMetrics),campaigns:[...results.values].filter(([,r])=>r&&actionIssues(providerMetrics(r))).map(([id])=>id)};
 if(quality.duplicateCampaignIds.length||quality.ambiguousAccountRows||quality.actionAnomalies.current||quality.actionAnomalies.previous||quality.actionAnomalies.campaigns.length)quality.complete=false;
 return{ok:true,contract:2,mode:'read',source:'meta',currency:account.currency,timezone:account.timezone_name,queriedAt:now.toISOString(),ranges,quality,
  current:currentMetrics,
  previous:previousMetrics,
  campaigns:[...ids].map(id=>({id,name:directory.values.get(id)?.name??'Nombre no disponible',objective:directory.values.get(id)?.objective??null,status:directory.values.get(id)?.effective_status??null,metrics:providerMetrics(quality.duplicateCampaignIds.includes(id)?undefined:results.values.get(id)),duplicate:quality.duplicateCampaignIds.includes(id)})),
  attribution:{status:'unavailable',sales:null,revenue:null,roas:null}};
}
// Integration seam: dependencies must be trusted server functions, never request data.
export async function handleDashboardV2(request,{authenticate,canRead,env,fetchImpl,now}){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const user=await authenticate(request,env);if(!user)return new Response('Unauthorized',{status:401});
 if(!await canRead(user))return new Response('Forbidden',{status:403});
 const raw=new URL(request.url).searchParams.get('period')??'7';if(!['7','14','30'].includes(raw))return new Response('Invalid period',{status:400});
 try{const body=await readDashboardV2({env,period:Number(raw),fetchImpl,now});return Response.json(body,{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({ok:false,error:'METRICS_UNAVAILABLE'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
