import {metric} from './marketing-metrics.mjs';
// Candidate additive contract. Never deduplicate unrelated action types by guessing.
export function providerMetrics(row){
 const available=Boolean(row&&typeof row==='object'&&!Array.isArray(row));row=available?row:{};
 const totals=Object.fromEntries(['spend','impressions','reach','clicks','frequency','ctr','cpc','cpm'].map(k=>[k,metric(row[k])]));
 const actions=Object.create(null);const duplicateTypes=new Set();let malformed=false;
 if(Array.isArray(row.actions))for(const a of row.actions){
  if(!a||typeof a.action_type!=='string'||!a.action_type.trim()){malformed=true;continue}
  const k=a.action_type;if(Object.hasOwn(actions,k)){duplicateTypes.add(k);actions[k]=null}else actions[k]=metric(a.value);
 }
 return {available,totals,actions,actionsAvailable:Array.isArray(row.actions),duplicateTypes:[...duplicateTypes],malformed,attributedSales:null,roas:null};
}
// Cursor callback provided by authenticated server connector. No arbitrary next URLs.
export async function readAllPages(readPage,{maxPages=20}={}){
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>100)throw Error('Invalid page limit');
 const rows=[],seen=new Set();let cursor;
 for(let page=0;page<maxPages;page++){
  const payload=await readPage(cursor);
  if(!payload||!Array.isArray(payload.data))throw Error('Invalid provider response');
  rows.push(...payload.data);
  if(!payload.paging?.next)return {rows,complete:true,pages:page+1};
  cursor=payload.paging?.cursors?.after;
  if(typeof cursor!=='string'||!cursor||seen.has(cursor))return {rows,complete:false,reason:'invalid_or_repeated_cursor',pages:page+1};
  seen.add(cursor);
 }
 return {rows,complete:false,reason:'page_limit',pages:maxPages};
}
