(function () {
  'use strict';
  const D = window.KoraCreditPortfolioDomain;
  let sb, profile, rows = [], settings = null, activeTab = 'portfolio', action = null;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function waitForShell() {
    if (window.creditekSidebar?.sb) return Promise.resolve(window.creditekSidebar);
    return new Promise(resolve => document.addEventListener('kora-sidebar-ready', () => resolve(window.creditekSidebar), { once:true }));
  }
  function setNotice(message, error=false) { const n=$('notice'); n.hidden=!message; n.textContent=message||''; n.className=`notice card${error?' error':''}`; }
  function canManage() { return ['gerencia','auditoria'].includes(profile?.rol) || profile?.es_gestor_cartera === true; }
  function unique(key) { return [...new Map(rows.filter(r=>r[key]).map(r=>[r[key],r])).values()]; }
  function selectedRows() { return D.filter(rows,{query:$('query').value,platform:$('platform').value,status:$('status').value,origin:$('origin').value}); }

  function renderMetrics(filtered) {
    const s=D.summarize(filtered);
    const items=activeTab==='nova'
      ? [['Decisiones Nova',s.novaApproved],['Créditos pre‑Nova',s.preNova],['Sin decisión',filtered.filter(r=>r.nova_status==='missing').length],['Reglas activas',settings?.nova_enforcement_enabled?'Sí':'No']]
      : activeTab==='cobra'
        ? [['Créditos por gestionar',s.risk],['Saldo por cobrar',D.money(filtered.filter(r=>['late','delinquent'].includes(r.status)).reduce((n,r)=>n+D.number(r.outstanding_amount),0))],['Promesas incumplidas',s.brokenPromises],['Créditos cerrados',s.closed]]
        : [['Créditos',s.credits],['Saldo de cartera',D.money(s.outstanding)],['Pagos validados',D.money(s.paid)],['En mora',s.risk]];
    $('metrics').innerHTML=items.map(([label,value])=>`<article class="metric card"><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`).join('');
  }

  function empty(title, text) { return `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`; }
  function actionButtons(row) {
    if (!canManage()) return '';
    return `<div class="row-actions"><button class="btn" data-action="manage" data-id="${esc(row.id)}">Gestionar</button><button class="btn" data-action="payment" data-id="${esc(row.id)}">Registrar pago</button></div>`;
  }
  function portfolioTable(filtered, mode='portfolio') {
    const visible=mode==='cobra'?filtered.filter(r=>['late','delinquent','loss'].includes(r.status)||D.number(r.broken_promises)>0):filtered;
    if(!visible.length) return empty(mode==='cobra'?'No hay gestiones pendientes':'No hay créditos para mostrar',mode==='cobra'?'La cola de Cobra está al día.':'Los créditos aparecerán al registrarse el pago al aliado.');
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Crédito</th><th>Tienda</th><th>Original</th><th>Pagado</th><th>Saldo</th><th>Estado</th><th>Nova</th><th>Acciones</th></tr></thead><tbody>${visible.map(r=>`<tr><td><b>${esc(r.cliente_nombre)}</b><small>${esc(r.cliente_documento||'Sin cédula vinculada')}</small></td><td><b>${esc(r.external_credit_id)}</b><small>${esc(r.plataforma)}</small></td><td>${esc(r.tienda||r.origen_codigo||'Sin tienda')}</td><td class="amount">${D.money(r.original_amount)}</td><td class="amount">${D.money(r.validated_repayments)}</td><td class="amount">${D.money(r.outstanding_amount)}</td><td><span class="pill ${esc(r.status)}">${esc(D.statusLabel(r.status))}</span></td><td><span class="pill ${esc(r.nova_status)}">${esc(D.statusLabel(r.nova_status))}</span></td><td>${actionButtons(r)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderNova(filtered) {
    if(!filtered.length) return empty('Aún no hay decisiones asociadas','Las decisiones llegarán desde Nova por el canal de servicio seguro.');
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Plataforma</th><th>Crédito</th><th>Decisión</th><th>Regla</th><th>Origen</th></tr></thead><tbody>${filtered.map(r=>`<tr><td><b>${esc(r.cliente_nombre)}</b><small>${esc(r.cliente_documento||'')}</small></td><td>${esc(r.plataforma)}</td><td>${esc(r.external_credit_id)}</td><td><span class="pill ${esc(r.nova_status)}">${esc(D.statusLabel(r.nova_status))}</span></td><td>${esc(r.nova_rule_version||'—')}</td><td>${esc(r.tienda||r.origen_codigo||'—')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderPerformance(filtered) {
    const s=D.summarize(filtered), evaluated=Math.max(0,s.credits-s.preNova), good=s.current+s.closed;
    const cards=[['Créditos evaluables',evaluated,'Créditos vinculados a una decisión de Nova.'],['Buen comportamiento',good,'Al día o totalmente pagados.'],['Mora o pérdida',s.risk,'Resultado observado, sin convertir datos faltantes en mora.'],['Promesas incumplidas',s.brokenPromises,'Señal operativa para retroalimentar futuras reglas.']];
    $('performanceContent').innerHTML=cards.map(([title,value,text])=>`<article class="card"><b>${esc(title)}</b><strong style="display:block;font:800 26px Montserrat;margin-top:10px">${esc(value)}</strong><p>${esc(text)}</p></article>`).join('');
  }

  function render() {
    const filtered=selectedRows(); renderMetrics(filtered);
    $('portfolioContent').innerHTML=portfolioTable(filtered);
    $('novaContent').innerHTML=renderNova(filtered);
    $('cobraContent').innerHTML=portfolioTable(filtered,'cobra');
    renderPerformance(filtered);
  }
  function fillFilters() {
    $('platform').innerHTML='<option value="">Todas las plataformas</option>'+unique('plataforma').sort((a,b)=>a.plataforma.localeCompare(b.plataforma)).map(r=>`<option value="${esc(r.plataforma)}">${esc(r.plataforma)}</option>`).join('');
    $('origin').innerHTML='<option value="">Todas las tiendas</option>'+unique('origen_codigo').sort((a,b)=>(a.tienda||'').localeCompare(b.tienda||'')).map(r=>`<option value="${esc(r.origen_codigo)}">${esc(r.tienda||r.origen_codigo)}</option>`).join('');
  }
  async function loadAllPortfolio() {
    const pageSize=500, all=[];
    for(let from=0;;from+=pageSize){
      const result=await sb.from('creditos_cartera_operaciones').select('*')
        .order('ally_paid_at',{ascending:false,nullsFirst:false}).range(from,from+pageSize-1);
      if(result.error) return result;
      all.push(...(result.data||[]));
      if(!result.data||result.data.length<pageSize) return {data:all,error:null};
    }
  }
  async function load() {
    setNotice('Actualizando créditos y cartera…');
    const [config,portfolio]=await Promise.all([
      sb.from('credit_portfolio_settings').select('*').eq('singleton',true).maybeSingle(),
      loadAllPortfolio(),
    ]);
    if(config.error||portfolio.error){ console.error(config.error||portfolio.error); setNotice('No fue posible consultar el nuevo módulo. Verifica que la migración de Créditos y Cartera esté aplicada.',true); return; }
    settings=config.data; rows=portfolio.data||[]; fillFilters(); setNotice('');
    const state=$('novaState'); state.classList.toggle('on',Boolean(settings?.nova_enforcement_enabled));
    state.querySelector('span').textContent=settings?.nova_enforcement_enabled?`Nova obligatoria desde ${settings.nova_enforcement_from}`:'Nova preparada · validación obligatoria desactivada';
    render();
  }

  function field(label,name,type='text',extra='') { return `<div class="field${name==='note'?' full':''}"><label for="field_${name}">${esc(label)}</label><input class="control" id="field_${name}" name="${esc(name)}" type="${esc(type)}" ${extra}></div>`; }
  function openModal(kind,id) {
    action=kind; $('modalObligation').value=id; $('modalMessage').hidden=true;
    if(kind==='payment'){
      $('modalTitle').textContent='Registrar pago validado del cliente'; $('modalSubmit').textContent='Registrar pago';
      $('modalFields').innerHTML=field('Referencia del pago','reference','text','required')+field('Valor pagado','amount','number','min="1" step="1" required')+field('Fecha y hora','paid_at','datetime-local','required');
    } else {
      $('modalTitle').textContent='Registrar gestión de cartera'; $('modalSubmit').textContent='Guardar gestión';
      $('modalFields').innerHTML=`<div class="field"><label>Resultado</label><select class="control" name="event_type" required><option value="contacted">Cliente contactado</option><option value="contact_attempt">Intento de contacto</option><option value="promise">Promesa de pago</option><option value="promise_kept">Promesa cumplida</option><option value="promise_broken">Promesa incumplida</option><option value="dispute">Reclamo</option><option value="escalated">Escalado</option><option value="note">Nota</option></select></div><div class="field"><label>Canal</label><select class="control" name="channel"><option value="whatsapp">WhatsApp</option><option value="call">Llamada</option><option value="sms">SMS</option><option value="email">Correo</option><option value="internal">Interno</option></select></div>`+field('Fecha prometida','promise_date','date')+field('Valor prometido','promise_amount','number','min="1" step="1"')+field('Nota','note','text','maxlength="600"');
    }
    $('modalBg').hidden=false;
  }
  function closeModal(){ $('modalBg').hidden=true; action=null; $('actionForm').reset(); }
  async function submitAction(event){
    event.preventDefault(); const data=new FormData(event.currentTarget), id=$('modalObligation').value; $('modalSubmit').disabled=true;
    const request=action==='payment'
      ? sb.rpc('creditos_cartera_registrar_pago_cliente',{p_obligation_id:id,p_platform_payment_id:data.get('reference'),p_amount:Number(data.get('amount')),p_paid_at:new Date(data.get('paid_at')).toISOString(),p_evidence:{source:'kora_manual'}})
      : sb.rpc('creditos_cartera_registrar_gestion',{p_obligation_id:id,p_actor_type:'humano',p_event_type:data.get('event_type'),p_channel:data.get('channel')||null,p_note:data.get('note')||null,p_promise_date:data.get('promise_date')||null,p_promise_amount:data.get('promise_amount')?Number(data.get('promise_amount')):null});
    const {error}=await request; $('modalSubmit').disabled=false;
    if(error){$('modalMessage').textContent='No fue posible guardar. Revisa los datos e intenta nuevamente.';$('modalMessage').hidden=false;console.error(error);return;}
    closeModal(); await load();
  }

  document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button)openModal(button.dataset.action,button.dataset.id);});
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{activeTab=button.dataset.tab;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===activeTab));render();}));
  ['query','platform','status','origin'].forEach(id=>$(id).addEventListener(id==='query'?'input':'change',render));
  $('refresh').addEventListener('click',load); $('modalCancel').addEventListener('click',closeModal); $('actionForm').addEventListener('submit',submitAction);
  waitForShell().then(context=>{sb=context.sb;profile=context.perfil;$('app').hidden=false;load();});
})();
