(function(root){
'use strict';
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const digits=v=>String(v??'').replace(/\D/g,'');
function money(value,locale='co'){
 if(value==null||String(value).trim()==='')return null;
 if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value*100-Math.round(value*100))>0.0001||!Number.isSafeInteger(Math.round(value*100)))throw Error('Importe inválido o con más de dos decimales');return Math.round(value*100);}
 let s=String(value).trim().replace(/^(COP|\$)\s*/i,'').replace(/\s/g,'');let negative=false;
 if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1);}if(s.startsWith('-')){if(negative)throw Error('Signo duplicado');negative=true;s=s.slice(1);}else if(s.startsWith('+'))s=s.slice(1);
 const valid=locale==='co'?/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/:/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
 if(!valid.test(s))throw Error('Formato de importe no coincide con la selección');
 s=locale==='co'?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');const n=Number(s)* (negative?-1:1);const cents=Math.round(n*100);if(!Number.isSafeInteger(cents))throw Error('Importe fuera de rango');return cents;
}
function day(value,format='dmy',date1904=false){
 let y,m,d;
 if(value instanceof Date){if(!Number.isFinite(value.getTime()))throw Error('Fecha inválida');[y,m,d]=[value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate()];}
 else if(typeof value==='number'&&format==='excel'){if(!Number.isInteger(value)||value<1||(!date1904&&value===60))throw Error('Fecha Excel inválida');const dt=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+value*86400000);[y,m,d]=[dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate()];}
 else{const s=String(value??'').trim();let a;if((a=s.match(/^(\d{4})-(\d{2})-(\d{2})$/)))[y,m,d]=a.slice(1).map(Number);else if((a=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))&&['dmy','mdy'].includes(format)){[y,m,d]=[Number(a[3]),Number(a[format==='dmy'?2:1]),Number(a[format==='dmy'?1:2])];}else throw Error('Fecha inválida; usa año de cuatro dígitos y el formato seleccionado');}
 const dt=new Date(Date.UTC(y,m-1,d));if(y<1900||y>2200||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw Error('Fecha fuera de calendario');return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function parseRows(rows,map,options){
 if(!options.account)throw Error('Selecciona la cuenta del extracto');
 const required=options.mode==='split'?['date','credit','debit']:['date','amount'];
 if(required.some(k=>!Number.isInteger(map[k])||map[k]<0)||new Set(required.map(k=>map[k])).size!==required.length)throw Error('Selecciona columnas distintas para fecha e importes');
 const parsed=[],invalid=[],outside=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i];if(!row.some(v=>v!==null&&v!==undefined&&String(v).trim()!==''))continue;
  const line=i+(options.firstRow||2);
  try{const when=day(row[map.date],options.dateFormat,options.date1904);let value;
   if(options.mode==='split'){const cr=money(row[map.credit],options.locale)??0,db=money(row[map.debit],options.locale)??0;if(cr<0||db<0||(cr!==0&&db!==0))throw Error('Crédito/débito deben ser positivos y solo uno puede tener valor');value=cr-db;}
   else {value=money(row[map.amount],options.locale);if(value===null)throw Error('Importe vacío');}
   if(!value)throw Error('Movimiento con importe cero');
   const r={id:'extracto-'+line,line,date:when,cents:value,reference:map.reference>=0?String(row[map.reference]??'').trim():'',description:map.description>=0?String(row[map.description]??'').trim():'',account:options.account};
   if(when<options.from||when>options.to)outside.push(r);else parsed.push(r);
  }catch(e){invalid.push({Fila:line,Motivo:e.message});}
 }
 return {rows:parsed,invalid,outside};
}
function match(statement,ledger,{account,days=0}){
 if(!digits(account))throw Error('Cuenta requerida');if(!Number.isInteger(days)||days<0||days>7)throw Error('Tolerancia de fecha inválida');
 const special=[],eligible=[];
 for(const r of ledger){if(digits(r['Cuenta Banco'])!==digits(account))continue;
  if(/saldo_inicial|ajuste|reverso/.test(norm(r.Tipo))||r['Variación registrada']==null){special.push(r);continue;}
  const cents=money(r['Variación registrada']);if(cents)eligible.push({id:r.ID,date:day(r['Fecha efectiva']||r.Fecha,'dmy'),cents,reference:String(r.Referencia||''),description:r.Concepto||r.Tercero||'',source:r});
 }
 const results=statement.map(s=>{const candidates=eligible.filter(k=>k.cents===s.cents&&Math.abs(Date.parse(k.date)-Date.parse(s.date))/86400000<=days);const refs=candidates.filter(k=>s.reference&&k.reference&&norm(s.reference)===norm(k.reference));return {...s,candidates:refs.length?refs:candidates,basis:refs.length?'Referencia, valor y fecha':'Valor y fecha; referencia no verificada'};});
 const uses=new Map();for(const r of results)for(const k of r.candidates)uses.set(k.id,(uses.get(k.id)||0)+1);
 for(const r of results)r.status=!r.candidates.length?'Sin coincidencia':r.candidates.length===1&&uses.get(r.candidates[0].id)===1?'Sugerencia única':'Ambiguo; revisar';
 return {rows:results,eligible,special};
}
function accept(decisions,row,key){
 if(!row.candidates.some(c=>c.id===key))throw Error('El movimiento no es candidato');
 if(Object.entries(decisions).some(([id,d])=>id!==row.id&&d.bankId===key))throw Error('Este movimiento de KORA ya fue elegido en otra fila');
 return {...decisions,[row.id]:{bankId:key,state:'Validado en esta revisión'}};
}
function pending(report){
 const list=new Map();const add=(r,reasons)=>{const key=r.Fuente+'|'+r.ID;const old=list.get(key);if(old){old.Motivos=[...new Set([...old.Motivos,...reasons])];return;}list.set(key,{...r,Clave:key,Motivos:reasons});};
 for(const r of [...report.pending,...report.details]){const reasons=[];if(!r.Identificación)reasons.push('Identificación pendiente');if(!r.Soporte)reasons.push('Soporte pendiente');if(!r.Fecha||r['Fecha real pago']==='No informada'||r['Fecha real pago']==='')reasons.push('Fecha de pago pendiente');if(r.Valor===null)reasons.push('Importe pendiente');if(String(r.Evidencia).startsWith('Histórico'))reasons.push('Histórico por validar');if(report.pending.includes(r)&&!reasons.length)reasons.push('Cruce de origen pendiente');if(reasons.length)add(r,reasons);}
 for(const r of report.reconc){const diff=r['Diferencia esperado menos aplicado'];if(diff!==null&&diff!==0)add({Fuente:'cobros_expected',ID:r.ID,Fecha:r.Corte,Tercero:r.Plataforma,Valor:diff,Concepto:r.Concepto,Evidencia:'Esperado menos confirmado aplicado'},['Diferencia en cobro']);}
 return [...list.values()].sort((a,b)=>(a.Fecha||'9999').localeCompare(b.Fecha||'9999')||a.Clave.localeCompare(b.Clave));
}
const api={money,day,parseRows,match,accept,pending};if(typeof module!=='undefined')module.exports=api;else root.KoraBankMatch=api;
})(typeof window!=='undefined'?window:globalThis);
