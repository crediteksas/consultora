function referenceFamilyMismatch(ref){return ref?.type==='family'&&ref.responded===true&&ref.knowsCustomer===true&&ref.contactConfirmed===true&&['friend','neighbor','coworker','other'].includes(ref.reportedRelationship)&&[null,undefined,'contradictory_information','relationship_unconfirmed'].includes(ref.reason);}
// Staff notice content only; never decides or modifies eligibility.
function andreaNoticeContent(notice,c,storeName){
 if(!/^[a-f0-9-]{36}$/i.test(notice?.source_id||'')||!Number.isSafeInteger(notice.revision)||c?.revision!==notice.revision||c?.store_code!==notice.store_code||c?.state!==notice.case_state||typeof storeName!=='string'||!storeName.trim())throw Error('NOTICE_DETAILS_UNAVAILABLE');
 const clean=(v,max)=>String(v||'').replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/g,' ').trim().slice(0,max);
 const state=c.state,workflow=storeWorkflow(c),refs=Array.isArray(c.summary?.references)?c.summary.references:[],photos=Array.isArray(c.summary?.photos)?c.summary.photos:[];
 const tasks=workflow.pending.map(p=>{
  const r=refs.find(r=>r.type===p.type);
  if(p.kind==='reference'&&p.type==='personal'&&r?.status==='replace'&&r?.reportedRelationship==='family')return 'Referencia personal: indicó ser familiar; la tienda debe cambiarla por una persona que no sea familiar.';
  if(p.kind==='reference'&&r?.status==='review'&&referenceFamilyMismatch(r))return 'Referencia familiar: respondió «'+({friend:'Amistad',neighbor:'Vecino',coworker:'Compañero de trabajo',other:'Otra relación'}[r.reportedRelationship])+'»; aclarar la relación registrada con la tienda.';
  if(p.kind==='photo'&&p.label==='Frente de cédula'&&photos.some(x=>x.type==='frente'&&x.issues?.includes('name_mismatch')))return 'Frente de cédula: revisar la diferencia detectada entre el nombre registrado y el documento.';
  return clean(p.label,100)+': '+clean(p.detail,220)+' Responsable: '+clean(p.owner,40)+'.';
 });
 let text=state==='authorized'?'Puedes continuar.':state==='rejected'?'No puedes continuar. Consulta la decisión registrada.':'Revisión pendiente.';
 for(let i=0;i<tasks.length;i++){
  const suffix=i<tasks.length-1?' Más pendientes en la ficha.':'';
  if((text+' '+tasks[i]+suffix).length>650){text+=' Otros pendientes en la ficha.';break;}text+=' '+tasks[i];
 }
 if(!tasks.length&&!['authorized','rejected'].includes(state))text+=' Revisar la observación registrada en la ficha antes de continuar.';
 return {reference:clean(storeName,110)+' · NOVA-'+notice.source_id.slice(0,8).toUpperCase(),text:clean(text,650),url:'https://aura.crediteksas.com/creditek/agentes/nova-supervision.html?solicitud='+notice.source_id};
}
// Stable intake date; midnight in Colombia is 05:00 UTC. Archiving is a view only.
function novaCaseListWindow(input={},at=Date.now()){
 const period=input.period??'today',offset=input.offset??0;
 if(!['today','archive'].includes(period)||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw Error('INVALID_LIST_WINDOW');
 const day=new Date(at-5*3600000).toISOString().slice(0,10),start=Date.parse(day+'T05:00:00.000Z'),end=start+86400000;
 return {period,offset,day,start:new Date(start).toISOString(),end:new Date(end).toISOString()};
}
function novaCaseListQuery(actor,input,at){
 const w=novaCaseListWindow(input,at);
 const scope=actor.global?'':'&store_code=eq.'+encodeURIComponent(actor.store);
 const privacy=actor.allied?'&state=not.in.(authorized,rejected)&delivered_at=is.null':'';
 const date=w.period==='today'?'&source.submitted_at=gte.'+w.start+'&source.submitted_at=lt.'+w.end:'&source.submitted_at=lt.'+w.start;
 return {window:w,path:'nova_retail_cases?select=source_id,store_code,state,revision,decision,summary,valid_until,updated_at,source:kora_nova_sources!nova_retail_cases_source_id_fkey!inner(submitted_at)'+scope+privacy+date+'&order=source(submitted_at).desc,source_id.desc&limit=101&offset='+w.offset};
}
