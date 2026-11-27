/* Review candidate. Pure calculations over canonical observations; no credit decisions. */
(function(root){
'use strict';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const month=x=>typeof x==='string'&&/^\d{4}-(0[1-9]|1[0-2])-01$/.test(x);
function requireTrue(ok,message){if(!ok)throw Error(message);}
function integer(x){return Number.isSafeInteger(x)&&x>=0;}
function sum(rows,key){let total=0;for(const r of rows){total+=r[key];requireTrue(Number.isSafeInteger(total),'Importe fuera del rango permitido.');}return total;}
function cut(value){
 requireTrue(value&&uuid(value.id)&&month(value.cohort_month)&&day(value.cutoff)&&value.cutoff>=value.cohort_month&&Array.isArray(value.observations)&&value.observations.length>0&&value.observations.length<=10000&&value.row_count===value.observations.length,'Corte incompleto.');
 const ids=new Set(),contracts=new Set();
 for(const r of value.observations){
  requireTrue(uuid(r.operation_id)&&!ids.has(r.operation_id)&&typeof r.contract==='string'&&r.contract&&!contracts.has(r.contract),'Crédito duplicado o sin vínculo.');ids.add(r.operation_id);contracts.add(r.contract);
  requireTrue(['document','customer','store'].every(k=>typeof r[k]==='string'&&r[k].trim())&&day(r.created)&&r.created.slice(0,7)===value.cohort_month.slice(0,7)&&r.created<=value.cutoff,'Identidad o mes incompleto.');
  requireTrue(['paid','cycled','overdue','total_installments','fee_cents','financed_cents','cycled_cents','arrears_cents'].every(k=>integer(r[k]))&&r.fee_cents>0&&r.financed_cents>0&&r.frequency===15&&r.total_installments>0&&r.paid<=r.total_installments&&r.cycled<=r.total_installments&&r.overdue===Math.max(0,r.cycled-r.paid)&&Number.isSafeInteger(r.fee_cents*r.total_installments)&&r.cycled_cents===r.cycled*r.fee_cents&&r.arrears_cents===r.overdue*r.fee_cents,'Cuotas incompletas o incoherentes.');
 }
 sum(value.observations,'cycled_cents');sum(value.observations,'arrears_cents');return value;
}
function summary(rows){const cycled=sum(rows,'cycled_cents'),arrears=sum(rows,'arrears_cents');return {credits:rows.length,cycled,arrears,ratio:cycled?arrears/cycled:null,zero:rows.filter(r=>r.paid===0&&r.overdue>0).length,one:rows.filter(r=>r.paid===1&&r.overdue>0).length,overdue:rows.filter(r=>r.overdue>0).length,targetMet:cycled?BigInt(arrears)*100n<BigInt(cycled)*22n:null};}
const sameTerms=(a,b)=>['contract','document','customer','store','created','financed_cents','fee_cents','total_installments','frequency'].every(k=>a[k]===b[k]);
function compare(previous,current){
 cut(previous);cut(current);requireTrue(previous.cohort_month===current.cohort_month,'Compara el mismo mes de venta.');requireTrue(previous.cutoff<current.cutoff,'Selecciona un corte de una fecha anterior.');
 const before=new Map(previous.observations.map(r=>[r.operation_id,r])),after=new Map(current.observations.map(r=>[r.operation_id,r])),changes=[],oldCommon=[],newCommon=[];
 for(const r of current.observations){const p=before.get(r.operation_id);let state='new';if(p){state=!sameTerms(p,r)||r.paid<p.paid||r.cycled<p.cycled?'review':r.paid>p.paid?'payments_reported':r.overdue>p.overdue?'new_overdue':r.cycled!==p.cycled?'schedule_changed':'unchanged';if(state!=='review'){oldCommon.push(p);newCommon.push(r);}}
  changes.push({operation_id:r.operation_id,contract:r.contract,customer:r.customer,store:r.store,state,paidBefore:p?.paid??null,paidNow:r.paid,overdueBefore:p?.overdue??null,overdueNow:r.overdue,paidDelta:p&&state!=='review'?r.paid-p.paid:null});}
 for(const r of previous.observations)if(!after.has(r.operation_id))changes.push({operation_id:r.operation_id,contract:r.contract,customer:r.customer,store:r.store,state:'absent',paidBefore:r.paid,paidNow:null,overdueBefore:r.overdue,overdueNow:null,paidDelta:null});
 const a=summary(previous.observations),b=summary(current.observations),matchedBefore=summary(oldCommon),matchedAfter=summary(newCommon);
 return {previous:a,current:b,days:(Date.parse(current.cutoff)-Date.parse(previous.cutoff))/86400000,changes,counts:Object.fromEntries(['new','review','payments_reported','new_overdue','schedule_changed','unchanged','absent'].map(k=>[k,changes.filter(r=>r.state===k).length])),matchedBefore,matchedAfter,percentagePoints:changes.every(r=>!['new','absent','review'].includes(r.state))&&a.ratio!==null&&b.ratio!==null?(b.ratio-a.ratio)*100:null,samePopulation:changes.every(r=>!['new','absent','review'].includes(r.state)),paymentTransactionsCreated:false};
}
function history(cuts,operationId,asOf,projected=false){
 requireTrue(uuid(operationId)&&day(asOf),'Selecciona un crédito y una fecha válidos.');requireTrue(Array.isArray(cuts)&&cuts.length<=1000&&new Set(cuts.map(c=>c.id)).size===cuts.length,'Historial duplicado o demasiado grande.');cuts.forEach(c=>{if(!projected)cut(c);else {requireTrue(uuid(c.id)&&month(c.cohort_month)&&day(c.cutoff)&&c.cutoff>=c.cohort_month&&Number.isSafeInteger(c.population_count)&&c.population_count>0&&Array.isArray(c.observations)&&c.observations.length<=c.population_count,'Historial incompleto.');if(c.observations.length)cut({...c,row_count:c.observations.length});}});
 const anchors=cuts.filter(c=>c.cutoff<=asOf).flatMap(c=>c.observations.filter(r=>r.operation_id===operationId));requireTrue(anchors.length>0,'El crédito no tiene cortes guardados.');
 const document=anchors[0].document;requireTrue(anchors.every(r=>r.document===document),'La identidad requiere revisión.');
 const relevant=cuts.filter(c=>c.cutoff<=asOf).sort((a,b)=>a.cutoff.localeCompare(b.cutoff)||(a.received_at||'').localeCompare(b.received_at||'')||a.id.localeCompare(b.id));
 const rows=relevant.flatMap(c=>c.observations.filter(r=>r.document===document).map(r=>({...r,cut_id:c.id,cutoff:c.cutoff,cohort_month:c.cohort_month}))),groups=new Map();
 for(const r of rows){if(!groups.has(r.operation_id))groups.set(r.operation_id,[]);groups.get(r.operation_id).push(r);}
 const credits=[...groups.values()].map(observations=>{const latest=observations.at(-1),monthLatest=relevant.filter(c=>c.cohort_month===latest.cohort_month).at(-1),missingLatest=!monthLatest.observations.some(r=>r.operation_id===latest.operation_id),identityReview=observations.some(r=>!sameTerms(observations[0],r)),counterReview=observations.some((r,i)=>i&&(r.paid<observations[i-1].paid||r.cycled<observations[i-1].cycled)),ambiguousVersion=observations.some((r,i)=>i&&r.cutoff===observations[i-1].cutoff&&['paid','cycled','overdue'].some(k=>r[k]!==observations[i-1][k]));
 return {operation_id:latest.operation_id,contract:latest.contract,store:latest.store,month:latest.cohort_month,latest,observations,missingLatest,identityReview,counterReview,ambiguousVersion,staleDays:(Date.parse(asOf)-Date.parse(latest.cutoff))/86400000};});
 return {schema_version:1,source:'kora_saved_krediya_cuts',as_of:asOf,operation_id:operationId,credits,identityReview:new Set(rows.map(r=>r.customer)).size>1,automatic_decision:false,score:null,payer_known:false,official_quality:false};
}
// Financial workflow projections. The database is the authority; these are never authorization checks.
function fundSummary(fundings,actions){
 requireTrue(Array.isArray(fundings)&&Array.isArray(actions),'Fondo incompleto.');const funds=new Map();
 for(const f of fundings){requireTrue(uuid(f.id)&&!funds.has(f.id)&&month(f.source_month)&&Number.isSafeInteger(f.available_cents),'Conciliación inválida.');funds.set(f.id,{...f,reserved_cents:0,spent_cents:0});}
 requireTrue(new Set(actions.map(a=>a.id)).size===actions.length,'Movimiento duplicado.');requireTrue(actions.every(a=>integer(a.event_no)&&a.event_no>0)&&new Set(actions.map(a=>a.event_no)).size===actions.length,'Secuencia de movimientos inválida.');actions=[...actions].sort((a,b)=>a.event_no-b.event_no);const requests=new Map();
 for(const a of actions){requireTrue(uuid(a.id)&&['request','authorize','reject','release','execute'].includes(a.kind)&&integer(a.amount_cents),'Movimiento inválido.');if(a.kind==='request'){requireTrue(!requests.has(a.id)&&a.amount_cents>0,'Solicitud inválida.');requests.set(a.id,{...a,state:'pending',allocations:[]});continue;}
  const r=requests.get(a.parent_id);requireTrue(r,'Solicitud faltante.');
  if(a.kind==='authorize'){requireTrue(r.state==='pending'&&a.amount_cents===r.amount_cents&&Array.isArray(a.allocations)&&a.allocations.length>0,'Autorización inválida.');let total=0;const seen=new Set();for(const x of a.allocations){const f=funds.get(x.fund_id);requireTrue(f&&!seen.has(x.fund_id)&&integer(x.cents)&&x.cents>0&&f.available_cents-f.reserved_cents-f.spent_cents>=x.cents,'Asignación sin fondos.');seen.add(x.fund_id);f.reserved_cents+=x.cents;total+=x.cents;requireTrue(Number.isSafeInteger(total),'Importe fuera de rango.');}requireTrue(total===r.amount_cents,'La asignación no coincide.');r.allocations=a.allocations;r.state='authorized';}
  else if(a.kind==='reject'){requireTrue(r.state==='pending'&&a.amount_cents===0,'Ya resuelta.');r.state='rejected';}
  else {requireTrue(r.state==='authorized','Falta autorización.');requireTrue(a.kind!=='release'||a.amount_cents===0,'Liberación inválida.');requireTrue(a.kind!=='execute'||(a.amount_cents>0&&a.amount_cents<=r.amount_cents&&typeof a.evidence==='string'&&a.evidence.trim().length>=5),'Falta soporte o excede autorización.');let remaining=a.kind==='execute'?a.amount_cents:0;for(const x of r.allocations){const f=funds.get(x.fund_id);f.reserved_cents-=x.cents;const used=Math.min(remaining,x.cents);f.spent_cents+=used;remaining-=used;}r.state=a.kind==='execute'?'executed':'released';r.executed_cents=a.kind==='execute'?a.amount_cents:0;}
 }
 const list=[...funds.values()].map(f=>({...f,remaining_cents:f.available_cents-f.reserved_cents-f.spent_cents}));return {funds:list,requests:[...requests.values()],available_cents:sum(list,'remaining_cents'),reserved_cents:sum(list,'reserved_cents'),spent_cents:sum(list,'spent_cents'),deficit_cents:Math.max(0,-sum(list,'remaining_cents'))};
}
function cohortCosts(fundings,actions){
 const ledger=fundSummary(fundings,actions),groups=new Map();
 const get=m=>{requireTrue(month(m),'Mes incompleto.');if(!groups.has(m))groups.set(m,{month:m,generated_cents:0,prior_used_source_cents:0,spent_cents:0,reserved_cents:0,other_month_cents:0,has_source:false});return groups.get(m);};
 for(const f of fundings){requireTrue(Number.isSafeInteger(f.generated_cents)&&integer(f.prior_used_cents),'Conciliación incompleta.');const g=get(f.source_month);g.generated_cents+=f.generated_cents;g.prior_used_source_cents+=f.prior_used_cents;g.has_source=true;}
 for(const r of ledger.requests){const g=get(r.cohort_month);if(r.state==='authorized')g.reserved_cents+=r.amount_cents;if(r.state==='executed')g.spent_cents+=r.executed_cents;let left=r.state==='executed'?r.executed_cents:r.state==='authorized'?r.amount_cents:0;for(const a of r.allocations){const used=Math.min(left,a.cents);left-=used;if(fundings.find(f=>f.id===a.fund_id).source_month!==r.cohort_month)g.other_month_cents+=used;}}
 return [...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(g=>{requireTrue(['generated_cents','prior_used_source_cents','spent_cents','reserved_cents','other_month_cents'].every(k=>Number.isSafeInteger(g[k]))&&Number.isSafeInteger(g.spent_cents+g.reserved_cents),'Importe fuera de rango.');return {...g,tracked_exceeds_generated:g.has_source?g.spent_cents+g.reserved_cents>g.generated_cents:null,historical_target_unallocated:g.prior_used_source_cents>0};});
}
function coverageRows(report){
 requireTrue(report?.version===1&&report.invalid_dates===0&&Array.isArray(report.months)&&Array.isArray(report.items),'Cruce incompleto.');
 for(const item of report.items)requireTrue(item&&typeof item.credit==='string'&&item.credit.length>0&&month(item.month)&&['installments','cancellation'].includes(item.kind)&&integer(item.amount_pesos)&&item.amount_pesos>0&&item.amount_pesos<=90071992547409&&Number.isSafeInteger(item.source_row)&&item.source_row>0&&typeof item.source_name==='string'&&item.source_name.length>0&&(item.effective_date===null||day(item.effective_date)),'Detalle inválido.');
 let total=0,complete=true;const seen=new Set();
 return [...report.months].sort((a,b)=>String(a.month).localeCompare(String(b.month))).map(row=>{requireTrue(month(row.month)&&!seen.has(row.month),'Mes duplicado o inválido.');seen.add(row.month);
  for(const key of ['installments_pesos','cancellations_pesos','new_uses_pesos','unallocated_prior_pesos','missing','reversals','duplicates','unmatched','events','potential_duplicates'])requireTrue(integer(row[key])&&row[key]<=90071992547409,'Importe o dato inválido.');
  const prov=row.provision_pesos;requireTrue(prov===null||(Number.isSafeInteger(prov)&&Math.abs(prov)<=90071992547409),'Provisión inválida.');
  const spent=row.installments_pesos+row.cancellations_pesos+row.new_uses_pesos;requireTrue(Number.isSafeInteger(spent)&&spent<=90071992547409,'Importe fuera de rango.');
  const ready=prov!==null&&!row.missing&&!row.reversals&&!row.duplicates&&!row.unmatched&&!row.unallocated_prior_pesos&&!row.potential_duplicates;const balance=ready?prov-spent:null;
  if(balance===null)complete=false;else if(complete){total+=balance;requireTrue(Number.isSafeInteger(total)&&Math.abs(total)<=90071992547409,'Acumulado fuera de rango.');}
  return {...row,spent_pesos:spent,balance_pesos:balance,accumulated_pesos:complete?total:null};
 });
}
function storeRanking(cuts,report,asOf,book={fundings:[],actions:[]}){
 requireTrue(Array.isArray(cuts)&&cuts.length<=10000&&day(asOf),'Información de cortes incompleta.');
 coverageRows(report);cuts.forEach(cut);
 requireTrue(new Set(cuts.map(c=>c.id)).size===cuts.length,'Hay cortes duplicados.');
 const byMonth=new Map();for(const c of cuts){if(c.cutoff>asOf)continue;if(!byMonth.has(c.cohort_month))byMonth.set(c.cohort_month,[]);byMonth.get(c.cohort_month).push(c);}
 const groups=new Map(),contracts=new Map(),operations=new Map(),historical=new Set();
 const group=name=>{const key=name.trim().replace(/\s+/g,' ').toLocaleUpperCase('es');if(!groups.has(key))groups.set(key,{store:name.trim(),credits:[],unknown:[],conflicts:0,cost_cents:0,cost_events:0,months:new Set()});return groups.get(key);};
 const latest=[];
 for(const [month,versions] of byMonth){
  versions.sort((a,b)=>b.cutoff.localeCompare(a.cutoff)||(b.received_at||'').localeCompare(a.received_at||'')||b.id.localeCompare(a.id));
  const current=versions[0];requireTrue(!versions.some((c,i)=>i>0&&c.cutoff===current.cutoff&&c.payload_sha256!==current.payload_sha256),'Hay dos versiones distintas del mismo corte; revisa antes de generar el ranking.');
  latest.push({month,cutoff:current.cutoff});const present=new Set(current.observations.map(r=>r.operation_id)),seenOld=new Set(),older=new Map();
  for(const previous of versions.slice(1))for(const row of previous.observations){if(!older.has(row.operation_id))older.set(row.operation_id,[]);older.get(row.operation_id).push(row);}
  for(const row of current.observations){const key=row.contract.trim().toLocaleLowerCase('es');requireTrue(!contracts.has(key)&&!operations.has(row.operation_id),'Un crédito aparece en más de un mes; requiere revisión.');const g=group(row.store),contradiction=(older.get(row.operation_id)||[]).some(x=>x.store.trim().toLocaleUpperCase('es')!==row.store.trim().toLocaleUpperCase('es')||x.contract.trim().toLocaleLowerCase('es')!==key);g.credits.push({...row,cutoff:current.cutoff,month});g.months.add(month);if(contradiction)g.conflicts++;const ref={group:g,month,ambiguous:contradiction,credit:key};contracts.set(key,ref);operations.set(row.operation_id,ref);}
  for(const old of versions.slice(1))for(const row of old.observations){if(present.has(row.operation_id)||seenOld.has(row.operation_id))continue;seenOld.add(row.operation_id);const g=group(row.store);g.unknown.push({contract:row.contract,customer:row.customer,cutoff:old.cutoff});g.months.add(month);}
 }
 let unassigned_cents=0,unassigned_events=0,possible_duplicates=0;
 for(const item of report.items){const key=item.credit.trim().toLocaleLowerCase('es');historical.add(key);const match=contracts.get(key),amount=item.amount_pesos*100;if(!match||match.month!==item.month||match.ambiguous){unassigned_cents+=amount;unassigned_events++;continue;}const g=match.group;g.cost_cents+=amount;g.cost_events++;requireTrue(Number.isSafeInteger(g.cost_cents),'Costo fuera de rango.');}
 const ledger=fundSummary(book.fundings,book.actions);for(const r of ledger.requests.filter(x=>x.state==='executed')){const match=operations.get(r.operation_id);if(!match||match.month!==r.cohort_month||match.ambiguous){unassigned_cents+=r.executed_cents;unassigned_events++;continue;}if(historical.has(match.credit)){possible_duplicates++;unassigned_cents+=r.executed_cents;unassigned_events++;continue;}match.group.cost_cents+=r.executed_cents;match.group.cost_events++;requireTrue(Number.isSafeInteger(match.group.cost_cents),'Costo fuera de rango.');}
 requireTrue(Number.isSafeInteger(unassigned_cents),'Costo fuera de rango.');
 const stores=[...groups.values()].map(g=>{const pastDue=g.credits.filter(x=>x.overdue>0),ratio=g.credits.length?pastDue.length/g.credits.length:null,oldest=g.credits.map(x=>x.cutoff).sort()[0]||null,stale=oldest&&(Date.parse(asOf)-Date.parse(oldest))/86400000>7;return {...g,months:[...g.months].sort(),months_overdue:[...new Set(pastDue.map(x=>x.month))].sort(),overdue:pastDue.length,arrears_cents:sum(pastDue,'arrears_cents'),ratio,assessment:ratio===null?'Sin dato actual':g.unknown.length||g.conflicts?'Datos incompletos':stale?'Corte desactualizado':g.credits.length<5?'Muestra pequeña':ratio>=0.5?'Alerta alta':ratio>0?'En seguimiento':'Al día en el corte',oldest_cutoff:oldest};});
 stores.sort((a,b)=>(b.ratio??-1)-(a.ratio??-1)||b.arrears_cents-a.arrears_cents||a.store.localeCompare(b.store,'es'));
 return {stores,latest:latest.sort((a,b)=>a.month.localeCompare(b.month)),unassigned_cents,unassigned_events,possible_duplicates};
}
const api={cut,summary,compare,history,fundSummary,cohortCosts,coverageRows,storeRanking,day,uuid};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CobraEvolution=api;
})(typeof window!=='undefined'?window:globalThis);
