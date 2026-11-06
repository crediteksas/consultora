const scalar=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const ID=/^\d+$/;const POST=/^\d+(?:_\d+)?$/;const CURSOR=/^[A-Za-z0-9_=-]{1,2048}$/;
export function safePostLink(value,channel){try{const u=new URL(value);const hosts=channel==='instagram'?['instagram.com','www.instagram.com']:['facebook.com','www.facebook.com','m.facebook.com'];return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname!=='/'&&hosts.includes(u.hostname)?u.href:null}catch{return null}}
export function readOptions(url){const q=new URL(url).searchParams;const channel=q.get('channel');const after=q.get('after');if(!['instagram','facebook'].includes(channel)||after&&!CURSOR.test(after))throw Error('INVALID_QUERY');return{channel,after:after||null}}
// Dedicated GET-only transport: never accepts a URL, method, or token from the browser.
export async function metaRead(env,token,path,params,fetchImpl=fetch){
 if(!token||!/^v\d+\.0$/.test(env.META_GRAPH_VERSION||'v25.0')||!/^\d+(?:_\d+)?\/(?:media|published_posts|insights)$/.test(path))throw Error('READ_CONFIG_INVALID');
 const u=new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION||'v25.0'}/${path}`);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));
 let r,j;try{r=await fetchImpl(u,{method:'GET',redirect:'manual',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});j=await r.json()}catch{throw Error('META_READ_UNAVAILABLE')}
 if(!r.ok||!j||j.error)throw Object.assign(Error([10,190,200].includes(j?.error?.code)?'META_READ_PERMISSION_REQUIRED':'META_READ_UNAVAILABLE'),{providerStatus:r.status,providerCode:Number.isInteger(j?.error?.code)?j.error.code:null});return j;
}
export async function readExistingPosts({channel,after=null,connection,read,now=()=>Date.now()}){
 if(!['instagram','facebook'].includes(channel)||after&&!CURSOR.test(after))throw Error('INVALID_QUERY');
 const accountId=channel==='facebook'?connection.page_id:connection.instagram_id;if(typeof accountId!=='string'||!ID.test(accountId))throw Error('ACCOUNT_NOT_CONNECTED');
 const fields=channel==='instagram'?'id,caption,timestamp,media_type,permalink,like_count,comments_count':'id,message,created_time,permalink_url,is_published,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares';
 const page=await read(`${accountId}/${channel==='instagram'?'media':'published_posts'}`,{fields,limit:10,...(after?{after}:{})});
 if(!Array.isArray(page.data)||page.data.length>10)throw Error('META_RESPONSE_INVALID');
 const rows=[],seen=new Set();let omitted=0;
 for(const p of page.data){const id=p?.id,date=channel==='instagram'?p?.timestamp:p?.created_time;const ts=typeof date==='string'?Date.parse(date):NaN;const link=safePostLink(channel==='instagram'?p?.permalink:p?.permalink_url,channel);
 if(typeof id!=='string'||!POST.test(id)||channel==='facebook'&&(!id.startsWith(accountId+'_')||p.is_published!==true)||seen.has(id)||!Number.isFinite(ts)||ts>now()||!link){omitted++;continue}seen.add(id);
 const metrics={views:null,reach:null,reactions:scalar(channel==='instagram'?p.like_count:p.reactions?.summary?.total_count),comments:scalar(channel==='instagram'?p.comments_count:p.comments?.summary?.total_count),shares:channel==='facebook'?scalar(p.shares?.count):null,saved:null};const unavailable=[];
 // Missing/unsupported metrics are never synthesized as zero or summed across posts.
 const names=channel==='instagram'?['reach','views','saved','shares']:['post_media_view'];
 try{const insights=await read(`${id}/insights`,{metric:names.join(',')});if(!Array.isArray(insights.data))throw Error('META_RESPONSE_INVALID');for(const name of names){const items=insights.data.filter(x=>x?.name===name);const m=items.length===1?items[0]:null;const values=m?.values;const value=scalar(m?.total_value?.value??(Array.isArray(values)&&values.length===1?values[0].value:null));const key=name==='post_media_view'?'views':name;metrics[key]=value;if(value===null)unavailable.push(name)}}catch(e){unavailable.push(e.message==='META_READ_PERMISSION_REQUIRED'?'PERMISSION_REQUIRED':'INSIGHTS_UNAVAILABLE')}
 rows.push({id,accountId,channel,caption:typeof(p.caption??p.message)==='string'?(p.caption??p.message).slice(0,2000):'',type:channel==='instagram'?String(p.media_type||'PUBLICATION'):'PUBLICATION',publishedAt:new Date(ts).toISOString(),permalink:link,metrics,observedAt:new Date(now()).toISOString(),unavailable});
 }
 const next=page.paging?.cursors?.after;const hasMore=Boolean(page.paging?.next);return{source:'meta_read_only',channel,accountId,rows,omitted,nextCursor:hasMore&&typeof next==='string'&&CURSOR.test(next)&&next!==after?next:null,paginationIncomplete:hasMore&&!(typeof next==='string'&&CURSOR.test(next)&&next!==after),queriedAt:new Date(now()).toISOString(),metricScope:'lifetime_as_returned_by_meta',writes:false};
}

export function readFailure(error,stage){const reason=['INVALID_QUERY','META_READ_PERMISSION_REQUIRED'].includes(error?.message)?error.message:'META_READ_UNAVAILABLE';return{error:reason,diagnostic:{reason:['ACCOUNT_NOT_CONNECTED','META_RESPONSE_INVALID','READ_CONFIG_INVALID','META_READ_UNAVAILABLE','META_READ_PERMISSION_REQUIRED'].includes(error?.message)?error.message:'UNKNOWN',stage:['query','connection','list'].includes(stage)?stage:'unknown',providerStatus:Number.isInteger(error?.providerStatus)?error.providerStatus:null,providerCode:Number.isInteger(error?.providerCode)?error.providerCode:null}}}
