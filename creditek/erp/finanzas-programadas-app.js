(function () {
  'use strict';
  const D=window.KoraFinancialDomain, $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const view=D.normalizeView(new URLSearchParams(location.search).get('vista'));
  const scope=D.scopeForView(view);
  let sb,profile,entries=[],templates=[],stores=[],modalAction=null;

  function waitForShell(){if(window.creditekSidebar?.sb)return Promise.resolve(window.creditekSidebar);return new Promise(resolve=>document.addEventListener('kora-sidebar-ready',()=>resolve(window.creditekSidebar),{once:true}));}
  function notice(message,error=false){const el=$('notice');el.hidden=!message;el.textContent=message||'';el.className=`notice card${error?' error':''}`;}
  function errorText(error){console.error(error);return error?.message||'No fue posible completar la operación.';}
  function today(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});}
  function isOscar(){return profile?.id==='6de0ad26-64af-4966-8cd9-d468880af627';}
  function storeName(code){return stores.find(store=>store.codigo===code)?.nombre||code||'—';}
  function empty(text){return `<div class="empty">${esc(text)}</div>`;}
  function field(label,name,type='text',attrs='',value=''){return `<div class="field"><label for="f_${name}">${esc(label)}</label><input id="f_${name}" name="${esc(name)}" class="control" type="${esc(type)}" value="${esc(value)}" ${attrs}></div>`;}
  function select(label,name,options,value='',attrs=''){return `<div class="field"><label for="f_${name}">${esc(label)}</label><select id="f_${name}" name="${esc(name)}" class="control" ${attrs}>${options.map(([key,text])=>`<option value="${esc(key)}" ${key===value?'selected':''}>${esc(text)}</option>`).join('')}</select></div>`;}
  function closeModal(){$('modalBg').hidden=true;$('form').reset();modalAction=null;}
  function openModal(kind,record=null){modalAction=kind;$('formKind').value=kind;$('recordId').value=record?.id||'';$('formError').hidden=true;
    if(kind==='template')renderTemplateForm(record);else if(kind==='manual')renderManualForm(record);else if(kind==='decision')renderDecisionForm(record);else renderPaymentForm(record);
    $('modalBg').hidden=false;
  }

  function renderTemplateForm(record){$('modalTitle').textContent=record?'Editar obligación periódica':'Nueva obligación periódica';$('save').textContent='Guardar configuración';
    const business=view==='retail'?'retail':record?.business_unit||'retail';
    const storeOptions=[['','Selecciona tienda'],...stores.map(s=>[s.codigo,s.nombre])];
    const amountMode=record?.amount_mode||'fijo',days=record?.payment_days||[15];
    $('formFields').innerHTML=(view==='general'?select('Negocio','business',[['retail','Retail'],['b2b','B2B'],['aliados','Aliados']],business,'required'):'')+
      (view==='retail'?select('Tienda','store',storeOptions,record?.store_code||'','required'):'')+
      select('Tipo','category',[['nomina','Nómina'],['arriendo','Arriendo'],['contador','Contador'],['servicio','Servicio'],['otro','Otro']],record?.category||'nomina','required')+
      field('Concepto','concept','text','required minlength="3"',record?.concept||'')+field('Beneficiario','beneficiary','text','required minlength="3"',record?.beneficiary||'')+
      field('CC / NIT','document','text','',record?.beneficiary_document||'')+field('Cuenta destino','account','text','',record?.destination_account||'')+
      select('Valor','amount_mode',[['fijo','Fijo'],['variable','Variable; se confirma al aprobar']],amountMode,'required')+
      field('Valor fijo','amount','number','min="1" step="1"',record?.default_amount||'')+field('Día de pago','day1','number','min="1" max="31" required',days[0]||15)+
      field('Segundo día (opcional)','day2','number','min="1" max="31"',days[1]||'')+field('Inicia','start','date','required',record?.start_date||today())+
      field('Termina (opcional)','end','date','',record?.end_date||'')+`<div class="field"><label>Estado</label><label class="check"><input name="active" type="checkbox" ${record?.active===false?'':'checked'}> Configuración activa</label></div>`;
    $('f_amount_mode').addEventListener('change',event=>{$('f_amount').disabled=event.target.value==='variable';if(event.target.value==='variable')$('f_amount').value='';});
    $('f_amount').disabled=amountMode==='variable';
  }

  function renderManualForm(record){const withdrawal=record?.entry_type==='retiro_utilidad';$('modalTitle').textContent=withdrawal?'Nuevo retiro de utilidad':'Nuevo gasto general';$('save').textContent='Enviar a aprobación';
    $('formFields').innerHTML=`<input type="hidden" name="entry_type" value="${withdrawal?'retiro_utilidad':'gasto'}">`+
      select('Negocio','business',[['retail','Retail'],['b2b','B2B'],['aliados','Aliados']],'retail','required')+field('Fecha','due','date','required',today())+
      (withdrawal?'':select('Categoría','category',[['nomina','Nómina'],['arriendo','Arriendo'],['contador','Contador'],['servicio','Servicio'],['otro','Otro']],'otro','required'))+
      field('Concepto','concept','text','required minlength="3"',withdrawal?'Retiro de utilidad':'')+field('Beneficiario','beneficiary','text','required minlength="3"',withdrawal?'Oscar Pacheco':'')+
      field('CC / NIT','document')+field('Cuenta destino','account')+field('Valor','amount','number','min="1" step="1" required')+
      (withdrawal?field('Utilidad desde','period_from','date','required')+field('Utilidad hasta','period_to','date','required'):'')+
      `<div class="field full"><label for="f_note">Nota</label><textarea id="f_note" name="note" class="control" rows="3"></textarea></div>`;
  }

  function renderDecisionForm(record){$('modalTitle').textContent='Revisar movimiento';$('save').textContent='Confirmar decisión';$('formFields').innerHTML=
    `<input type="hidden" name="id" value="${esc(record.id)}">`+select('Decisión','decision',[['aprobado','Aprobar'],['rechazado','Rechazar']],'aprobado','required')+
    field('Valor confirmado','amount','number','min="1" step="1"',record.amount||'')+`<div class="field full"><label for="f_note">Nota</label><textarea id="f_note" name="note" class="control" rows="3"></textarea></div>`;}
  function renderPaymentForm(record){$('modalTitle').textContent='Registrar pago';$('save').textContent='Subir soporte y registrar pago';$('formFields').innerHTML=`<input type="hidden" name="id" value="${esc(record.id)}"><div class="field full"><label for="f_support">Soporte PDF o imagen (máx. 10 MB)</label><input id="f_support" name="support" class="control" type="file" accept="application/pdf,image/jpeg,image/png" required></div>`;}

  function selectedEntries(){return D.filterEntries(entries,{scope,business:$('business')?.value||'',store:$('store')?.value||'',status:$('status').value,query:$('query').value,from:$('from').value,to:$('to').value});}
  function actionButtons(row){if(row.status==='pendiente_aprobacion'&&isOscar())return `<button class="btn primary" data-action="decision" data-id="${row.id}">Revisar</button>`;if(row.status==='aprobado')return `<button class="btn primary" data-action="payment" data-id="${row.id}">Registrar pago</button>`;return '';}
  function entriesTable(rows){if(!rows.length)return empty('No hay movimientos para mostrar.');return `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>${view==='retail'?'Tienda':'Negocio'}</th><th>Movimiento</th><th>Beneficiario</th><th>Valor</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.due_date)}</td><td>${esc(view==='retail'?storeName(row.store_code):(D.BUSINESS_LABELS[row.business_unit]||row.business_unit))}</td><td><b>${esc(row.concept)}</b><small>${esc(row.entry_type==='retiro_utilidad'?'Retiro de utilidad':(D.CATEGORY_LABELS[row.category]||row.category))}</small></td><td>${esc(row.beneficiary)}<small>${esc(row.beneficiary_document||'')}</small></td><td class="amount">${row.amount?D.money(row.amount):'Por confirmar'}</td><td><span class="pill ${esc(row.status)}">${esc(D.STATUS_LABELS[row.status]||row.status)}</span></td><td>${actionButtons(row)}</td></tr>`).join('')}</tbody></table></div>`;}
  function templatesTable(rows){if(!rows.length)return empty('Aún no hay obligaciones periódicas configuradas.');return `<div class="table-wrap"><table class="table"><thead><tr><th>${view==='retail'?'Tienda':'Negocio'}</th><th>Obligación</th><th>Beneficiario</th><th>Periodicidad</th><th>Valor</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(view==='retail'?storeName(row.store_code):(D.BUSINESS_LABELS[row.business_unit]||row.business_unit))}</td><td><b>${esc(row.concept)}</b><small>${esc(D.CATEGORY_LABELS[row.category]||row.category)}</small></td><td>${esc(row.beneficiary)}</td><td>${esc(D.recurrenceLabel(row.payment_days))}</td><td class="amount">${row.amount_mode==='variable'?'Variable':D.money(row.default_amount)}</td><td><span class="pill ${row.active?'aprobado':'anulado'}">${row.active?'Activa':'Pausada'}</span></td><td><button class="btn" data-action="template" data-id="${row.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`;}

  function render(){const filtered=selectedEntries(),summary=D.summarize(filtered);$('metrics').innerHTML=(view==='retail'?
    [['Pendientes',summary.pending],['Gastos registrados',D.money(summary.expenses)],['Pagados',D.money(summary.paidExpenses)],['Configuraciones activas',templates.filter(t=>t.scope===scope&&t.active).length]]:
    [['Pendientes',summary.pending],['Gastos generales',D.money(summary.expenses)],['Retiros de utilidad',D.money(summary.withdrawals)],['Pagado',D.money(summary.paidExpenses+summary.paidWithdrawals)]]).map(([label,value])=>`<article class="metric card"><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`).join('');
    $('pendingContent').innerHTML=entriesTable(filtered.filter(row=>row.status==='pendiente_aprobacion'));
    $('historyContent').innerHTML=entriesTable(filtered.filter(row=>row.status!=='pendiente_aprobacion'));
    $('templatesContent').innerHTML=templatesTable(templates.filter(row=>row.scope===scope&&(!$('business')?.value||row.business_unit===$('business').value)&&(!$('store')?.value||row.store_code===$('store').value)));
  }

  async function load(){notice('Actualizando control financiero…');const generated=await sb.rpc('finanzas_generar_pendientes');if(generated.error){notice(errorText(generated.error),true);return;}
    const [entryResult,templateResult,storeResult]=await Promise.all([sb.from('financial_entries').select('*').eq('scope',scope).order('due_date',{ascending:false}),sb.from('financial_recurring_templates').select('*').eq('scope',scope).order('created_at',{ascending:false}),sb.from('origenes').select('codigo,nombre').eq('tipo','propia').eq('activo',true).order('nombre')]);
    const error=entryResult.error||templateResult.error||storeResult.error;if(error){notice(errorText(error),true);return;}entries=entryResult.data||[];templates=templateResult.data||[];stores=storeResult.data||[];entries.forEach(row=>row.store_name=storeName(row.store_code));$('store').innerHTML='<option value="">Todas las tiendas</option>'+stores.map(store=>`<option value="${esc(store.codigo)}">${esc(store.nombre)}</option>`).join('');notice('');render();}

  async function saveTemplate(data){const days=[Number(data.get('day1')),data.get('day2')?Number(data.get('day2')):null].filter(Boolean);return sb.rpc('finanzas_guardar_recurrencia',{p_id:$('recordId').value||null,p_scope:scope,p_business_unit:view==='retail'?'retail':data.get('business'),p_store_code:view==='retail'?data.get('store'):null,p_category:data.get('category'),p_concept:data.get('concept'),p_beneficiary:data.get('beneficiary'),p_beneficiary_document:data.get('document')||null,p_destination_account:data.get('account')||null,p_amount_mode:data.get('amount_mode'),p_default_amount:data.get('amount')?Number(data.get('amount')):null,p_payment_days:days,p_start_date:data.get('start'),p_end_date:data.get('end')||null,p_active:data.get('active')==='on'});}
  async function saveManual(data){return sb.rpc('finanzas_registrar_movimiento',{p_entry_type:data.get('entry_type'),p_business_unit:data.get('business'),p_due_date:data.get('due'),p_category:data.get('entry_type')==='retiro_utilidad'?'retiro':data.get('category'),p_concept:data.get('concept'),p_beneficiary:data.get('beneficiary'),p_beneficiary_document:data.get('document')||null,p_destination_account:data.get('account')||null,p_amount:Number(data.get('amount')),p_source_period_from:data.get('period_from')||null,p_source_period_to:data.get('period_to')||null,p_note:data.get('note')||null});}
  async function saveDecision(data){return sb.rpc('finanzas_decidir_movimiento',{p_id:data.get('id'),p_decision:data.get('decision'),p_amount:data.get('amount')?Number(data.get('amount')):null,p_note:data.get('note')||null});}
  async function savePayment(data){const file=data.get('support');if(!file||file.size<1)return {error:{message:'Selecciona el soporte.'}};if(file.size>10*1024*1024)return {error:{message:'El soporte supera 10 MB.'}};const ext=(file.name.split('.').pop()||'pdf').toLowerCase();if(!['pdf','jpg','jpeg','png'].includes(ext))return {error:{message:'Usa PDF, JPG o PNG.'}};const path=`finanzas/${crypto.randomUUID()}.${ext}`;const upload=await sb.storage.from('soportes').upload(path,file,{upsert:false,contentType:file.type});if(upload.error)return upload;const result=await sb.rpc('finanzas_registrar_pago',{p_id:data.get('id'),p_support_path:path});if(result.error)await sb.storage.from('soportes').remove([path]);return result;}
  async function submit(event){event.preventDefault();$('save').disabled=true;const data=new FormData(event.currentTarget);let result;if(modalAction==='template')result=await saveTemplate(data);else if(modalAction==='manual')result=await saveManual(data);else if(modalAction==='decision')result=await saveDecision(data);else result=await savePayment(data);$('save').disabled=false;if(result.error){$('formError').textContent=errorText(result.error);$('formError').hidden=false;return;}closeModal();await load();}

  function download(){const rows=selectedEntries();if(!rows.length){notice('No hay datos en el rango seleccionado.',true);return;}const blob=new Blob([D.csv(rows)],{type:'text/csv;charset=utf-8'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`finanzas-${view}-${today()}.csv`;link.click();URL.revokeObjectURL(link.href);}
  function configurePage(){$('pageTitle').textContent=view==='retail'?'Gastos periódicos de Retail':'Gastos y retiros';$('pageSubtitle').textContent=view==='retail'?'Nómina, arriendos y obligaciones gerenciales configuradas por persona y tienda.':'Control general separado por Retail, B2B y Aliados.';$('separationNotice').innerHTML=view==='retail'?'<strong>Control separado</strong>Estos gastos no se mezclan con los gastos diarios de caja ni modifican la utilidad de la tienda.':'<strong>Regla contable protegida</strong>Los gastos se identifican por negocio. Los retiros de utilidad se muestran aparte y nunca se contabilizan como gasto.';document.querySelectorAll('.retail-only').forEach(el=>el.classList.toggle('hidden',view!=='retail'));document.querySelectorAll('.general-only').forEach(el=>el.classList.toggle('hidden',view!=='general'));}
  document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button)return;const record=(button.dataset.action==='template'?templates:entries).find(row=>row.id===button.dataset.id);if(record)openModal(button.dataset.action,record);});
  ['query','business','store','status','from','to'].forEach(id=>$(id)?.addEventListener(id==='query'?'input':'change',render));
  $('newRecurring').addEventListener('click',()=>openModal('template'));$('newExpense').addEventListener('click',()=>openModal('manual',{entry_type:'gasto'}));$('newWithdrawal').addEventListener('click',()=>openModal('manual',{entry_type:'retiro_utilidad'}));$('exportCsv').addEventListener('click',download);$('cancel').addEventListener('click',closeModal);$('form').addEventListener('submit',submit);
  configurePage();waitForShell().then(context=>{sb=context.sb;profile=context.perfil;$('app').hidden=false;load();});
})();
