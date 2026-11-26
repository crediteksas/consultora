(function(){
  'use strict';
  const D=window.CobraQuality,$=id=>document.getElementById(id);
  const money=c=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(c/100);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=s=>s?s.split('-').reverse().join('/'):'—';
  const groupLabels={zero:'Sin pagos y con atraso',one:'Un pago y con atraso',other:'Cuotas atrasadas',no_overdue:'Sin cuotas atrasadas reportadas'};
  let rows=[],warnings=[],references=null,drafts=new Map(),activeCase=null,revision=0,comparisonRevision=0,sourceLabel='';
  function status(text){$('status').textContent=text;}
  function error(messages){$('errors').hidden=!messages.length;$('errors').textContent=messages.slice(0,30).join('\n')+(messages.length>30?`\nY ${messages.length-30} errores más.`:'');}
  function reset(){revision++;comparisonRevision++;$('previous-form').reset();$('previous-form').querySelector('button').disabled=false;rows=[];warnings=[];references=null;drafts.clear();activeCase=null;$('case-dialog').close();$('workspace').hidden=true;$('changes').replaceChildren();$('changes-status').textContent='';$('query').value='';$('group').value='';error([]);}
  async function read(file,cutoff){
    if(!file||!file.name.toLowerCase().endsWith('.xlsx'))throw Error('Selecciona la exportación .xlsx de KrediYA.');
    if(file.size>8*1024*1024)throw Error('El archivo supera el límite de 8 MB de esta revisión.');
    if(!window.XLSX)throw Error('El lector de Excel no está disponible. Recarga la vista previa.');
    const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,sheetRows:10002,cellFormula:true});
    const candidates=book.SheetNames.filter(name=>{const s=book.Sheets[name];return XLSX.utils.sheet_to_json(s,{header:1,raw:true,defval:null,range:0,blankrows:true}).slice(0,1).some(r=>{const headers=r.map(v=>String(v??'').trim().normalize('NFC'));return headers.includes('# Crédito')&&headers.includes('Cuotas pagadas');});});
    if(candidates.length!==1)throw Error('Debe haber una única hoja con créditos y cuotas pagadas.');
    const sheet=book.Sheets[candidates[0]],range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
    if(range.e.r>=10001||range.e.c>100)throw Error('El archivo excede el tamaño de tabla permitido.');
    if(Object.entries(sheet).some(([key,value])=>!key.startsWith('!')&&value?.f))throw Error('El archivo contiene fórmulas. Usa la exportación original con valores.');
    if(range.s.r!==0||range.s.c!==0)throw Error('La tabla debe comenzar en A1 como en la exportación original.');
    const parsed=D.parse(XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,range:0,blankrows:true}),cutoff);
    if(parsed.errors.length){const err=Error('Archivo inválido.');err.issues=parsed.errors;throw err;}
    return parsed;
  }
  function setup(){
    $('workspace').hidden=false;$('source').textContent=sourceLabel;
    $('month').innerHTML=[...new Set(rows.map(r=>r.month))].sort().reverse().map(m=>`<option>${esc(m)}</option>`).join('');
    $('store').innerHTML='<option value="">Todas las tiendas</option>'+[...new Set(rows.map(r=>r.store))].sort().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
    $('warnings-box').hidden=!warnings.length;$('warning-count').textContent=`${warnings.length} diferencias entre calendario y archivo`;
    $('warnings').innerHTML=warnings.map(w=>`<li>${esc(w)}</li>`).join('');render();
  }
  function render(){
    const cohort=D.select(rows,{month:$('month').value,store:$('store').value});
    const visible=D.select(cohort,{group:$('group').value,query:$('query').value});
    const s=D.summarize(cohort);
    $('ratio').textContent=D.formatRatio(s);$('ratio-detail').textContent=`${money(s.arrearsCents)} estimados / ${money(s.cycledCents)} ciclados`;
    $('target').textContent=s.ratio===null?'Sin base ciclada':s.targetMetEstimated?'Estimación menor del 22% · pendiente de confirmación oficial':'Estimación fuera del objetivo menor del 22%';
    $('credits').textContent=s.credits;$('coverage').textContent=`${s.stores} tiendas · ${s.overdue} créditos con cuotas atrasadas`;
    $('zero').textContent=cohort.filter(r=>r.group==='zero').length;$('one').textContent=s.oneOverdue;
    $('one-detail').textContent=`${s.one} con un pago en total; ${s.one-s.oneOverdue} sin cuotas atrasadas`;
    $('scope-note').textContent=`Corte ${fmt(rows[0]?.cutoff)}. La búsqueda y prioridad solo filtran la cola; no cambian el porcentaje del mes.`;
    $('queue-count').textContent=`${visible.length} de ${cohort.length} créditos del alcance`;
    const linked=cohort.filter(r=>r.linkState==='matched').length;
    $('reference-status').textContent=references?`${linked} de ${cohort.length} enlazados a liquidaciones existentes. No se crean créditos nuevos. ${references.scope||''}`:'Referencia KORA no disponible. El cruce queda pendiente; esto no significa que el crédito no exista.';
    if(references){const c=D.coverage(cohort,references.rows,{month:$('month').value,store:$('store').value});$('reference-status').textContent+=c.complete?' La cobertura coincide con la referencia local de este mes.':` Cobertura por revisar: ${c.missing} liquidaciones ausentes del archivo, ${c.unexpected} contratos fuera de referencia y ${c.invalid} referencias inválidas o repetidas. La calidad representa solo los créditos cargados.`;}
    $('empty').hidden=visible.length>0;
    $('credits-body').innerHTML=visible.map(r=>`<tr><td><strong>${esc(r.customer)}</strong><small>${esc(r.contract)}</small><small>${esc(groupLabels[r.group])}</small></td><td>${esc(r.store)}</td><td>${r.paid} pagadas / ${r.cycled} cicladas<small>${r.overdue} atrasadas</small></td><td>${fmt(r.calendarDue)}<small>${r.calendarDays} días estimados${r.calendarMismatch?' · revisar calendario':''}</small></td><td class="num">${money(r.arrearsCents)}</td><td>${r.linkState==='matched'?'Liquidación vinculada':r.linkState==='review'||r.linkState==='ambiguous'?'Revisar coincidencia':'Cruce pendiente'}<small>${r.reference?.obligation_id?'Gestión COBRA vinculada':r.linkState==='matched'?'Falta enlazar la ficha de gestión':''}</small></td><td><button type="button" data-case="${esc(r.contract)}">Ver ficha</button>${drafts.has(r.contract)?'<small>Borrador en esta pestaña</small>':''}</td></tr>`).join('');
    const stores=[...new Set(cohort.map(r=>r.store))].map(store=>({store,s:D.summarize(cohort.filter(r=>r.store===store))})).sort((a,b)=>(b.s.ratio??-1)-(a.s.ratio??-1));
    $('stores-body').innerHTML=stores.map(({store,s})=>`<tr><td>${esc(store)}</td><td class="num">${s.credits}</td><td class="num">${s.overdue}</td><td class="num">${money(s.cycledCents)}</td><td class="num">${money(s.arrearsCents)}</td><td class="num">${D.formatRatio(s)}</td></tr>`).join('');
    const profiles=D.customerProfiles(cohort);
    $('profile-coverage').textContent=`${profiles.length} clientes con identidad contrastada en el mes y tienda seleccionados. Las estadísticas se limitan al corte cargado; no equivalen a un historial completo ni a una calificación de riesgo.`;
    $('profiles-body').innerHTML=profiles.map(p=>`<tr><td>${esc(p.customer)}<small>Documento terminado en ${esc(D.documentSuffix(p.document))}</small></td><td class="num">${p.summary.credits}</td><td class="num">${p.credits.filter(r=>r.group==='zero').length}</td><td class="num">${p.summary.overdue}</td><td class="num">${p.authorizationLinks} de ${p.summary.credits}</td><td>${p.identityReview?'Identidad por revisar':p.summary.credits===1?'Un crédito observado':'Varios contratos en este corte'}<small>Datos para análisis; sin decisión automática</small></td></tr>`).join('');
  }
  $('import-form').addEventListener('submit',async e=>{e.preventDefault();reset();const ticket=revision;$('read').disabled=true;status('Revisando el archivo…');
    try{const file=$('file').files[0],cutoff=$('cutoff').value,result=await read(file,cutoff);if(ticket!==revision)return;
      rows=result.rows;warnings=result.warnings;sourceLabel=`${file.name} · corte indicado: ${fmt(cutoff)} · revisión local`;
      try{const response=await fetch('/reference.json',{cache:'no-store'});if(!response.ok)throw Error();const ref=await response.json();if(ticket!==revision)return;references=ref;rows=D.reconcile(rows,ref.rows);}catch{references=null;}
      if(ticket!==revision)return;setup();status('Revisión preparada. No se han guardado datos en KORA.');
    }catch(err){if(ticket===revision){error(err.issues||[err.message]);status('No se calculan resultados de un archivo incompleto o inválido.');}}
    finally{if(ticket===revision)$('read').disabled=false;}
  });
  $('demo').addEventListener('click',()=>{reset();$('read').disabled=false;const matrix=[D.REQUIRED];const refs=[];
    const examples=[['fx001','111001','Ana','Ejemplo','Tienda de ejemplo A',3,0],['fx002','111002','Luis','Ejemplo','Tienda de ejemplo A',3,1],['fx003','111003','María','Ejemplo','Tienda de ejemplo B',3,3],['fx004','111001','Ana','Ejemplo','Tienda de ejemplo B',3,2]];
    examples.forEach(([contract,document,name,surname,store,cycled,paid],i)=>{const obj={'Fecha':'1/10/2026','# Crédito':contract,'Cédula':document,Nombres:name,Apellidos:surname,Tienda:store,'Monto a Financiar':'$ 400.000,00','Monto Cuota':'$ 50.000,00','# Cuotas':12,'Frecuencia del Pago':15,'Cuotas cicladas':cycled,'Cuotas pagadas':paid,'Cuotas atrasadas':cycled-paid,'Estado del contrato':'FIRMADO','Estado de la solicitud':'Aprobado'};matrix.push(D.REQUIRED.map(h=>obj[h]));refs.push({platform:'krediya',contract,document,customer:name+' '+surname,store,created:'2026-10-01',financed_amount:400000,operation_id:`demo-operation-${i}`,obligation_id:`demo-obligation-${i}`,nova_decision_id:i===0?'demo-authorization':null});});
    const result=D.parse(matrix,'2026-11-20');rows=D.reconcile(result.rows,refs);references={scope:'Referencia ficticia.',rows:refs};warnings=result.warnings;sourceLabel='Ejemplo ficticio · no representa clientes ni cifras reales';setup();status('Ejemplo ficticio para probar el recorrido.');
  });
  $('clear').addEventListener('click',()=>{reset();$('read').disabled=false;$('file').value='';status('Revisión retirada de esta pestaña.');});
  for(const id of ['month','store','group','query'])$(id).addEventListener(id==='query'?'input':'change',()=>{if(id==='month'||id==='store'){comparisonRevision++;$('previous-form').querySelector('button').disabled=false;$('changes').replaceChildren();$('changes-status').textContent='Vuelve a comparar para el alcance seleccionado.';}if(rows.length)render();});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view);}));
  $('credits-body').addEventListener('click',e=>{const b=e.target.closest('[data-case]');if(!b)return;activeCase=rows.find(r=>r.contract===b.dataset.case);if(!activeCase)return;
    const r=activeCase,ref=r.reference;$('case-form').reset();$('case-error').textContent='';$('case-title').textContent=r.customer;$('case-subtitle').textContent=`${r.contract} · ${r.store}`;
    const facts=[['Crédito creado',fmt(r.created)],['Documento',`Terminado en ${D.documentSuffix(r.document)}`],['Cuotas pagadas / cicladas',`${r.paid} / ${r.cycled}`],['Mora estimada',money(r.arrearsCents)],['Operación KORA',ref?.operation_id?'Liquidación existente':'Cruce por revisar'],['Autorización',ref?.nova_decision_id?'Enlazada':ref?.pre_nova?'Histórico anterior a Nova':'Sin evidencia enlazada'],['Gestión COBRA',ref?.obligation_id?'Ficha existente':'Enlace de gestión pendiente']];
    $('case-facts').innerHTML=facts.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');const draft=drafts.get(r.contract);if(draft){$('event-type').value=draft.type;$('promise-date').value=draft.date;$('promise-amount').value=draft.amount;$('note').value=draft.note;}setPromise();$('case-dialog').showModal();
  });
  function setPromise(){const needed=$('event-type').value==='promise';$('promise-date').required=needed;$('promise-amount').required=needed;}
  $('event-type').addEventListener('change',setPromise);$('close-case').addEventListener('click',()=>$('case-dialog').close());
  $('case-form').addEventListener('submit',e=>{e.preventDefault();if(!activeCase)return;const type=$('event-type').value,date=$('promise-date').value,amount=$('promise-amount').value,note=$('note').value.trim();if(!note||(type==='promise'&&(D.day(date)===null||D.integer(amount)===null||Number(amount)<1||!Number.isSafeInteger(Number(amount)*100)||date<activeCase.cutoff))){$('case-error').textContent='Completa la observación y, para un compromiso, fecha desde el corte e importe válidos.';return;}drafts.set(activeCase.contract,{type,date:type==='promise'?date:'',amount:type==='promise'?amount:'',note});$('case-dialog').close();render();status('Borrador conservado solo en esta pestaña. No se guardó una gestión real.');});
  $('previous-form').addEventListener('submit',async e=>{e.preventDefault();const ticket=revision,comparison=++comparisonRevision;$('previous-form').querySelector('button').disabled=true;$('changes').replaceChildren();$('changes-status').textContent='Comparando…';try{const previous=await read($('previous-file').files[0],$('previous-cutoff').value);if(ticket!==revision||comparison!==comparisonRevision)return;const changes=D.compareCuts(previous.rows,rows);const month=$('month').value,store=$('store').value;const scope=new Set([...D.select(previous.rows,{month,store}),...D.select(rows,{month,store})].map(r=>r.contract));const relevant=changes.filter(c=>scope.has(c.contract)&&c.state!=='same');const labels={new:'Solo en el corte nuevo; revisar cobertura',absent:'Ausente del nuevo corte; no se considera pagado',review:'Cambio que requiere revisión',count_increased:'Aumentó el número de cuotas pagadas',schedule_changed:'Cambió el número de cuotas cicladas o atrasadas; revisar evolución'};$('changes-status').textContent=`${relevant.length} cambios reportados para el mes y tienda seleccionados. No se crean pagos ni créditos.`;$('changes').innerHTML=relevant.map(c=>`<li><strong>${esc(c.contract)}</strong>: ${esc(labels[c.state])}${c.state==='count_increased'?` (${c.paidDelta} cuota/s)`:''}.</li>`).join('');}catch(err){if(ticket===revision&&comparison===comparisonRevision)$('changes-status').textContent=err.message;}finally{if(ticket===revision&&comparison===comparisonRevision)$('previous-form').querySelector('button').disabled=false;}});
})();
