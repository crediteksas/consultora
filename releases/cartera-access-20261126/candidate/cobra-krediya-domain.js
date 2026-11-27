(function (root) {
  'use strict';
  const DAY = 86400000;
  const REQUIRED = ['Fecha','# Crédito','Cédula','Nombres','Apellidos','Tienda','Monto a Financiar','Monto Cuota','# Cuotas','Frecuencia del Pago','Cuotas cicladas','Cuotas pagadas','Cuotas atrasadas','Estado del contrato','Estado de la solicitud'];
  const clean = value => String(value ?? '').trim();
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
  function day(value) {
    const s = clean(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const ms = Date.parse(s+'T00:00:00Z');
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10)===s ? ms : null;
  }
  function date(value) {
    if (typeof value !== 'string') return null; // The platform exports text; never guess Excel serial dates.
    let s=clean(value), m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m)s=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return day(s)===null ? null : s;
  }
  function cents(value) {
    if (typeof value==='number') return Number.isFinite(value)&&value>=0&&Math.abs(value*100-Math.round(value*100))<1e-6&&Number.isSafeInteger(Math.round(value*100)) ? Math.round(value*100) : null;
    let s=clean(value).replace(/^\$\s*/,'').replace(/[\s\u00a0]/g,'');
    if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))return null;
    const [whole,frac='']=s.replace(/\./g,'').split(',');
    const result=Number(whole)*100+Number(frac.padEnd(2,'0'));
    return Number.isSafeInteger(result) ? result : null;
  }
  function integer(v) {
    if(v===null||v===undefined||clean(v)===''||!/^\d+$/.test(clean(v)))return null;
    const n=Number(v);return Number.isSafeInteger(n)?n:null;
  }
  function documentKey(value){
    const s=clean(value);
    return /^\d{1,3}(?:\.\d{3})+$/.test(s)?s.replace(/\./g,''):/^[a-z0-9-]{3,40}$/i.test(s)?s.toLowerCase():null;
  }
  function referenceCents(value){
    if(typeof value==='number')return cents(value);
    if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value))return null;
    const [whole,frac='']=value.split('.');
    if(frac.slice(2).replace(/0/g,''))return null;
    const n=Number(whole)*100+Number(frac.slice(0,2).padEnd(2,'0'));
    return Number.isSafeInteger(n)?n:null;
  }
  function parse(matrix, cutoff) {
    const errors=[], rows=[], warnings=[];
    if(day(cutoff)===null)return {rows,errors:['Selecciona una fecha de corte válida.'],warnings};
    if(!Array.isArray(matrix)||matrix.length<2)return {rows,errors:['El archivo no contiene créditos.'],warnings};
    if(matrix.length>10001)return {rows,errors:['Revisa un máximo de 10.000 créditos por archivo.'],warnings};
    const headers=matrix[0].map(v=>clean(v).normalize('NFC'));
    for(const key of REQUIRED)if(headers.filter(h=>h===key).length!==1)errors.push(`Falta la columna «${key}» o está repetida.`);
    if(errors.length)return {rows,errors,warnings};
    const seen=new Set();
    for(let i=1;i<matrix.length;i++){
      const cells=matrix[i];if(!cells.some(v=>clean(v)!==''))continue;
      const at=key=>cells[headers.indexOf(key)];
      const before=errors.length, contract=clean(at('# Crédito')).toLowerCase(), created=date(at('Fecha'));
      const fee=cents(at('Monto Cuota')), count=integer(at('# Cuotas')), frequency=integer(at('Frecuencia del Pago'));
      const financed=cents(at('Monto a Financiar')),document=clean(at('Cédula'));
      const cycled=integer(at('Cuotas cicladas')), paid=integer(at('Cuotas pagadas')), overdue=integer(at('Cuotas atrasadas'));
      const issue=text=>errors.push(`Fila ${i+1}: ${text}`);
      if(!/^[a-z0-9_-]{3,80}$/.test(contract))issue('número de crédito no válido.');
      if(seen.has(contract))issue('crédito repetido; no se sumará dos veces.');seen.add(contract);
      if(!created||created>cutoff)issue('fecha de creación inválida o posterior al corte.');
      if(fee===null||fee<=0)issue('monto de cuota inválido.');
      if(financed===null||financed<=0)issue('monto financiado inválido.');
      if(!documentKey(document))issue('documento del cliente inválido.');
      if(count===null||count<1||count>1000)issue('cantidad total de cuotas inválida.');
      if(frequency!==15)issue('esta primera versión requiere frecuencia de 15 días.');
      if([cycled,paid,overdue].some(v=>v===null)||cycled>count||paid>count||overdue>count)issue('contadores de cuotas inválidos.');
      else if(overdue!==Math.max(0,cycled-paid))issue('las cuotas atrasadas no concilian con las cicladas y pagadas.');
      if(!clean(at('Nombres'))||!clean(at('Apellidos'))||!clean(at('Tienda')))issue('faltan cliente o tienda.');
      for(const [field,expected] of [['Estado del contrato','firmado'],['Estado de la solicitud','aprobado']]){
        if(headers.includes(field)&&fold(at(field))!==expected)issue(`revisar «${field}» antes de incluir el crédito.`);
      }
      if(fee!==null&&count!==null&&!Number.isSafeInteger(fee*count))issue('importe fuera del rango permitido.');
      if(errors.length!==before)continue;
      const age=Math.round((day(cutoff)-day(created))/DAY);
      const expected=Math.min(count,Math.max(0,Math.floor(age/frequency)));
      if(expected!==cycled)warnings.push(`Fila ${i+1}: el calendario estima ${expected} cuotas cicladas y el archivo informa ${cycled}. Se conserva el dato del archivo.`);
      const dueMs=day(created)+frequency*(paid+1)*DAY;
      rows.push({contract,sourceRow:i+1,created,month:created.slice(0,7),cutoff,
        customer:`${clean(at('Nombres'))} ${clean(at('Apellidos'))}`,store:clean(at('Tienda')).replace(/\s+/g,' '),
        document,financedCents:financed,feeCents:fee,totalInstallments:count,
        frequency,cycled,paid,overdue,expectedCycles:expected,calendarMismatch:expected!==cycled,
        calendarDue:paid>=count?null:new Date(dueMs).toISOString().slice(0,10),
        calendarDays:paid>=count?0:Math.max(0,Math.round((day(cutoff)-dueMs)/DAY)),
        cycledCents:cycled*fee,arrearsCents:overdue*fee,
        group:overdue===0?'no_overdue':paid===0?'zero':paid===1?'one':'other'});
    }
    if(!rows.length&&!errors.length)errors.push('El archivo no contiene créditos.');
    const sum=key=>rows.reduce((a,r)=>a+r[key],0);
    if(!Number.isSafeInteger(sum('cycledCents'))||!Number.isSafeInteger(sum('arrearsCents')))errors.push('El total excede el rango de cálculo permitido.');
    // A partial import must never look like a valid portfolio.
    return {rows:errors.length?[]:rows,errors,warnings};
  }
  function select(rows,{month='',store='',group='',query=''}={}) {
    const needle=fold(query);
    return rows.filter(r=>(!month||r.month===month)&&(!store||r.store===store)&&(!group||r.group===group)&&(!needle||fold([r.customer,r.contract,r.document,documentKey(r.document),r.store].join(' ')).includes(needle)));
  }
  function summarize(rows) {
    const s={credits:rows.length,stores:new Set(rows.map(r=>r.store)).size,cycledCents:0,arrearsCents:0,zeroAll:0,one:0,oneOverdue:0,overdue:0,calendarMismatches:0};
    for(const r of rows){s.cycledCents+=r.cycledCents;s.arrearsCents+=r.arrearsCents;s.zeroAll+=r.paid===0;s.one+=r.paid===1;s.oneOverdue+=r.group==='one';s.overdue+=r.overdue>0;s.calendarMismatches+=r.calendarMismatch;}
    s.ratio=s.cycledCents>0?s.arrearsCents/s.cycledCents:null;
    s.targetMetEstimated=s.ratio===null?null:BigInt(s.arrearsCents)*100n<BigInt(s.cycledCents)*22n;
    return s;
  }
  function compareCuts(before,after) {
    if(!before?.length||!after?.length)throw Error('Se necesitan dos cortes válidos.');
    const cutoff=rows=>new Set(rows.map(r=>r.cutoff));
    if(cutoff(before).size!==1||cutoff(after).size!==1||after[0].cutoff<before[0].cutoff)throw Error('Los cortes deben estar ordenados por fecha.');
    const old=new Map(before.map(r=>[r.contract,r])), next=new Map(after.map(r=>[r.contract,r]));
    if(old.size!==before.length||next.size!==after.length)throw Error('Hay créditos repetidos.');
    const changes=[];
    for(const r of after){const p=old.get(r.contract);changes.push({contract:r.contract,state:!p?'new':r.created!==p.created||r.feeCents!==p.feeCents||r.totalInstallments!==p.totalInstallments||documentKey(r.document)!==documentKey(p.document)||fold(r.customer)!==fold(p.customer)||fold(r.store)!==fold(p.store)||r.financedCents!==p.financedCents||r.cycled<p.cycled?'review':r.paid<p.paid?'review':r.paid>p.paid?'count_increased':r.overdue!==p.overdue||r.cycled!==p.cycled?'schedule_changed':'same',paidDelta:p?r.paid-p.paid:null});}
    for(const p of before)if(!next.has(p.contract))changes.push({contract:p.contract,state:'absent',paidDelta:null});
    return changes; // Counts do not create payment transactions or prove a payer.
  }
  function reconcile(rows,references) {
    const byContract=new Map();
    for(const r of references||[]){if(fold(r.platform)!=='krediya')continue;const key=fold(r.contract);if(!byContract.has(key))byContract.set(key,[]);byContract.get(key).push(r);}
    return rows.map(row=>{const matches=byContract.get(row.contract)||[];
      if(matches.length!==1)return {...row,linkState:matches.length?'ambiguous':'missing',reference:null};
      const r=matches[0];
      if(!clean(r.operation_id)||fold(r.customer)!==fold(row.customer)||fold(r.store)!==fold(row.store)||r.created!==row.created||documentKey(r.document)!==documentKey(row.document)||referenceCents(r.financed_amount)!==row.financedCents)return {...row,linkState:'review',reference:null};
      return {...row,linkState:'matched',reference:{operation_id:r.operation_id,obligation_id:r.obligation_id,pre_nova:r.pre_nova,nova_decision_id:r.nova_decision_id}};
    });
  }
  function customerProfiles(rows){
    const groups=new Map();
    for(const row of rows){
      if(row.linkState!=='matched'||!row.document)continue;
      const key=documentKey(row.document);if(!key)continue;
      if(!groups.has(key))groups.set(key,{document:row.document,customer:row.customer,credits:[],identityReview:false});
      const profile=groups.get(key);if(fold(profile.customer)!==fold(row.customer))profile.identityReview=true;
      if(profile.credits.some(r=>r.contract===row.contract))throw Error('No se suman dos cortes del mismo crédito en un perfil.');
      profile.credits.push(row);
    }
    return [...groups.values()].map(p=>({...p,summary:{credits:p.credits.length,overdue:p.credits.filter(r=>r.overdue>0).length},authorizationLinks:p.credits.filter(r=>r.reference?.nova_decision_id).length}));
  }
  function coverage(cohort,references,{month,store=''}={}){
    const present=new Set(cohort.map(r=>fold(r.contract))), expected=new Set();let invalid=0;
    if(!Array.isArray(references))return {expected:0,missing:0,unexpected:present.size,invalid:1,complete:false};
    for(const r of references){
      if(!r||typeof r.platform!=='string'||typeof r.contract!=='string'||!fold(r.contract)||typeof r.created!=='string'||r.created!==clean(r.created)||day(r.created)===null||typeof r.store!=='string'||!fold(r.store)){invalid++;continue;}
      if(fold(r.platform)!=='krediya'||r.created.slice(0,7)!==month||(store&&fold(r.store)!==fold(store)))continue;
      const key=fold(r.contract);if(expected.has(key))invalid++;expected.add(key);
    }
    let missing=0,unexpected=0;
    for(const key of expected)if(!present.has(key))missing++;
    for(const key of present)if(!expected.has(key))unexpected++;
    return {expected:expected.size,missing,unexpected,invalid,complete:expected.size>0&&!missing&&!unexpected&&!invalid};
  }
  const documentSuffix=value=>(documentKey(value)||'').slice(-4);
  function formatRatio(summary){
    if(summary.ratio===null)return 'No calculable';
    const formatted=new Intl.NumberFormat('es-CO',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(summary.ratio);
    if(Math.round(summary.ratio*10000)===2200){
      const left=BigInt(summary.arrearsCents)*100n,right=BigInt(summary.cycledCents)*22n;
      if(left<right)return '< 22 %';if(left>right)return '> 22 %';
    }
    return formatted;
  }
  const API=Object.freeze({REQUIRED,day,date,cents,integer,parse,select,summarize,formatRatio,compareCuts,reconcile,customerProfiles,coverage,documentSuffix});
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  else root.CobraQuality=API;
})(typeof window!=='undefined'?window:globalThis);
