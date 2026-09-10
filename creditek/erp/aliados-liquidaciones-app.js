(function () {
  'use strict';

  const D = CreditekAliadosLiquidaciones;
  const UX = CreditekAliadosUX;
  const Accounts = CreditekAliadosCuentas;
  const Review = CreditekKrediyaReview;
  const Commerce = CreditekLiquidacionesComercios;
  let sb;
  let operator;
  let profile;
  let gestionKrediya;
  let tarifarioKrediya;
  let importaciones;
  let comercios;
  let preparacion;
  let batches = [];
  let batchesRequest = 0;
  let selected;
  let activeTab = 'operations';
  let activeTabRequest;
  let activeModel = 'all';
  let listMode = 'pending';
  let preview;
  let fileBuffer;
  let lastImportedBatch=null;
  let initialized = false;
  let krediyaMissingPayees = 0;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = UX.formatoCOP;
  const platformName = (value) => value === 'alo' ? 'ALO Credit' : value === 'krediya' ? 'Krediya' : 'PayJoy';
  const state = (value) => `<span class="badge ${esc(value)}" title="${esc(UX.traducirEstado(value))}">${value === 'con_novedades' ? 'Revisar' : esc(UX.traducirEstado(value))}</span>`;
  const ownStoreUtility = (liquidation) => Number(liquidation.total_utilidad_tiendas || 0);
  const allyUtility = (liquidation) => Number(liquidation.total_utilidad_creditek || 0) - ownStoreUtility(liquidation);
  const businessUtility = (liquidation) => Number(liquidation.total_utilidad_creditek || 0);
  const awaitingKrediyaCalculation = (batch) => batch.plataforma === 'krediya' && ['importada','validada','con_novedades'].includes(batch.estado);
  const awaitingCalculation = (batch) => ['importada','validada','con_novedades'].includes(batch.estado);
  const provisionalBatch = batch => (batch.liquidation_operations || []).some(o=>o.reconocida && o.tipo_establecimiento==='aliado' && !o.ejecutivo_id);
  const KREDIYA_FOLLOWUP_TYPES = new Set(['krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente','novedad_administrativa']);

  const PENDING_STATES = ['importada', 'validada', 'con_novedades', 'calculada', 'revisada'];
  const HISTORY_STATES = ['aprobada', 'programada', 'pagada', 'conciliada', 'cerrada', 'anulada'];
  const isHistoricalBatch = (batch) => Boolean(batch.approved_at) || HISTORY_STATES.includes(batch.estado) ||
    (batch.plataforma !== 'krediya' && String(batch.fecha_corte || '') < '2026-09-01');

  function statesForMode() {
    return listMode === 'pending' ? PENDING_STATES : HISTORY_STATES;
  }

  function updateStateFilter() {
    const current = $('filterState').value;
    const allowed = statesForMode();
    $('filterState').innerHTML = '<option value="">Todos los estados</option>' + allowed.map((s) => `<option value="${s}">${UX.traducirEstado(s)}</option>`).join('');
    $('filterState').value = allowed.includes(current) ? current : '';
  }

  updateStateFilter();

  async function enterFromKora() {
    if (initialized || !window.creditekSidebar?.sb) return;
    initialized = true;
    sb = window.creditekSidebar.sb;
    profile = window.creditekSidebar.perfil;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href='app.html'; return; }
    const [{ data: allowed }, { data: currentOperator, error }] = await Promise.all([
      sb.rpc('tiene_capacidad_aliados', { p_capacidad: 'revisor' }),
      sb.from('aliados_operadores').select('capacidad').eq('perfil_id', session.user.id).eq('activo', true).maybeSingle()
    ]);
    if (!allowed || error || !currentOperator) {
      $('accessDenied').classList.remove('hidden');
      return;
    }
    operator = currentOperator;
    preparacion = CreditekTesoreriaPreparacion.create({sb,dialog:Review.dialog,onRetailSaved:async(id)=>{await loadBatches();await openDetail(id);await loadTab('incidents');},onRecalculate:async(id)=>{
      await loadBatches();await openDetail(id);
      if(selected?.id===id&&!$('calculate').disabled)await $('calculate').onclick();
    }});
    comercios = Commerce.create({sb,dialog:Review.dialog,esc,onSaved:async(id)=>{
      await loadBatches();await openDetail(id);
    }});
    importaciones = CreditekLiquidacionesImportaciones.create({sb,dialog:Review.dialog,esc,platformName,onRemoved:async(id)=>{
      if(selected?.id===id){selected=null;activeTabRequest=null;$('detail').classList.add('hidden');}
      await loadBatches();
      $('lastUpdated').textContent='Importación eliminada con respaldo de auditoría. Puedes cargar el archivo corregido.';
    }});
    tarifarioKrediya = CreditekKrediyaTarifario.create({sb,money});
    $('openKrediyaTariff').onclick = () => tarifarioKrediya.openTariff();
    gestionKrediya = CreditekKrediyaGestiones.create({ sb, userId:session.user.id, capability:operator.capacidad, money, onReport:()=>loadTab('management'), onOperation:openInstructionOperation });
    $('liquidationsContent').classList.remove('hidden');
    await loadBatches();
    const requestedBatch=new URLSearchParams(location.search).get('lote');
    if(new URLSearchParams(location.search).get('vista')==='historial')setListMode('history');
    if(requestedBatch && batches.some(b=>b.id===requestedBatch)) {
      await openDetail(requestedBatch);
      if(new URLSearchParams(location.search).get('tab')==='incidents')await loadTab('incidents');
    }
  }
  document.addEventListener('kora-sidebar-ready', enterFromKora);
  if (window.creditekSidebar?.sb) enterFromKora();

  async function loadBatches() {
    const request = ++batchesRequest;
    let query = sb.from('liquidations').select('*,liquidation_operations(id,reconocida,monto_credito,monto_base,inicial,tipo_establecimiento,origen_codigo,ejecutivo_id,establishment_name,referencia,imei)').order('imported_at', { ascending: false });
    if ($('filterPlatform').value) query = query.eq('plataforma', $('filterPlatform').value);
    const { data, error } = await query;
    if (request !== batchesRequest) return;
    if (error) { $('batches').innerHTML = `<tr><td colspan="10">${esc(error.message)}</td></tr>`; return; }
    batches = data || [];
    $('showPending').textContent = `Pendientes (${batches.filter((batch) => !isHistoricalBatch(batch) && PENDING_STATES.includes(batch.estado)).length})`;
    $('showHistory').textContent = `Consultar historial (${batches.filter(isHistoricalBatch).length})`;
    $('lastUpdated').textContent = `Actualizado ${new Intl.DateTimeFormat('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date())}`;
    renderBatches();
  }

  function renderBatches() {
    $('showPending').textContent = `Pendientes (${batches.filter((batch) => !isHistoricalBatch(batch) && PENDING_STATES.includes(batch.estado)).length})`;
    $('showHistory').textContent = `Consultar historial (${batches.filter(isHistoricalBatch).length})`;
    const search = $('filterSearch').value.trim().toLowerCase();
    const stateFilter = $('filterState').value;
    const rows = batches.filter((b) => listMode === 'history' ? isHistoricalBatch(b) : !isHistoricalBatch(b) && PENDING_STATES.includes(b.estado))
      .filter((b) => !stateFilter || b.estado === stateFilter)
      .filter((b) => !search || b.plataforma.includes(search) || UX.traducirEstado(b.estado).toLowerCase().includes(search));
    const from=$('historyFrom')?.value,until=$('historyUntil')?.value;
    if(listMode==='history')rows.splice(0,rows.length,...rows.filter(b=>(!from||b.fecha_corte>=from)&&(!until||b.fecha_corte<=until)));
    $('batches').innerHTML = rows.map((b) => `<tr>
      <td>${UX.fechaAuditoria(b.imported_at)}</td><td>${platformName(b.plataforma)}</td><td>${UX.fechaCorta(b.fecha_corte)}</td>
      <td>${state(b.approved_at?'aprobada':b.estado)}</td><td>${awaitingCalculation(b) ? (b.liquidation_operations || []).filter(o=>b.plataforma!=='krediya'||o.reconocida).length : Number(b.operaciones_tiendas || 0) + Number(b.operaciones_aliados || 0)}</td>
      ${[b.total_pago_aliados,b.total_bonos,businessUtility(b),b.total_pagar].map((v,i) => `<td>${awaitingCalculation(b) ? 'Por calcular' : money(v)}${!awaitingCalculation(b)&&i>0&&provisionalBatch(b)?'<small>Provisional</small>':''}</td>`).join('')}
      <td><button class="btn secondary" data-open="${b.id}">Ver detalle</button></td></tr>`).join('') || `<tr><td colspan="10">${listMode === 'pending' ? 'No hay liquidaciones pendientes.' : 'No hay liquidaciones en el historial.'}</td></tr>`;
    document.querySelectorAll('[data-open]').forEach((button) => { button.onclick = () => openDetail(button.dataset.open); });
    let recent=$('recentBatches');
    if(!recent){recent=document.createElement('section');recent.id='recentBatches';recent.className='card';$('batches').closest('section').after(recent);}
    recent.hidden=listMode!=='pending';
    recent.innerHTML='<h2>Últimas 4 aprobadas</h2>'+batches.filter(b=>b.approved_at).sort((a,b)=>b.approved_at.localeCompare(a.approved_at)).slice(0,4).map(b=>`<div class="actions" style="justify-content:space-between;padding:6px 0"><span>${platformName(b.plataforma)} · ${esc(b.fecha_corte)} · Aprobada</span><button class="btn secondary" data-recent="${esc(b.id)}">Consultar</button></div>`).join('');
    recent.querySelectorAll('[data-recent]').forEach(button=>button.onclick=()=>openDetail(button.dataset.recent));
  }

  function updateActions() {
    importaciones?.setBatch(selected);
    const frozen = Boolean(selected.frozen_at || selected.approved_at || ['aprobada','programada','pagada','cerrada'].includes(selected.estado));
    const krediya = selected.plataforma === 'krediya';
    $('calculate').textContent = ['calculada','revisada'].includes(selected.estado) ? 'Actualizar cálculo del lote' : 'Liquidar lote';
    $('calculate').classList.toggle('hidden', frozen);
    $('approve').textContent = krediya ? 'Aprobar y pasar a pagos' : 'Aprobar liquidación';
    $('approve').classList.toggle('hidden',frozen);
    $('saveReview').classList.toggle('hidden', frozen || krediya);
    $('validate').classList.add('hidden');
    $('review').classList.toggle('hidden',krediya || frozen);
    document.querySelector('[data-tab="differences"]').classList.toggle('hidden',!krediya);
    $('currentState').textContent = UX.traducirEstado(selected.estado);
    $('validate').disabled = !['importada', 'con_novedades'].includes(selected.estado);
    $('calculate').disabled = frozen || !['importada','validada','con_novedades','calculada','revisada'].includes(selected.estado);
    $('calculate').title = 'Calcula el lote; los datos administrativos pendientes se completan en Tesorería.';
    $('review').disabled = selected.estado !== 'calculada';
    $('approve').disabled = operator.capacidad !== 'aprobador' || selected.estado !== 'revisada';
    $('reject').disabled = operator.capacidad !== 'aprobador' || !['calculada', 'revisada'].includes(selected.estado);
    $('reject').classList.toggle('hidden', frozen || krediya && $('reject').disabled);
    if (!frozen && selected.estado === 'calculada' && operator.capacidad === 'aprobador') {
      $('workflowError').textContent = 'Pendiente de revisión administrativa: Maite debe marcar la liquidación como revisada antes de que Gerencia pueda aprobarla.';
      $('workflowError').classList.remove('hidden');
    } else if (!frozen && selected.estado === 'revisada' && operator.capacidad === 'aprobador') {
      $('workflowError').textContent = 'Lista para aprobación de Gerencia. Después de aprobarla se crearán los destinos de Tesorería.';
      $('workflowError').classList.remove('hidden');
    }
  }

  function renderMetrics() {
    const metrics = (title, values) => `<section class="card"><h2>${title}</h2><div class="grid">${values.map(([label, value, format]) => `<div class="metric"><small>${label}</small><strong>${format === 'text' ? esc(value) : format ? Number(value || 0) : money(value)}</strong></div>`).join('')}</div></section>`;
    if (awaitingCalculation(selected)) {
      const known = (selected.liquidation_operations || []).filter((o) => o.reconocida);
      $('metrics').innerHTML = metrics('Datos importados · pagos y utilidad pendientes de calcular', [
        ['Operaciones reconocidas', known.length, true],
        ['Crédito financiado', known.reduce((n,o) => n + Number(o.monto_credito ?? o.monto_base ?? 0),0)],
        ['Iniciales', known.reduce((n,o) => n + Number(o.inicial || 0),0)],
        ['Tiendas propias / aliados', `${known.filter((o) => o.tipo_establecimiento === 'propia').length} / ${known.filter((o) => o.tipo_establecimiento === 'aliado').length}`, 'text']
      ]);
      return;
    }
    const provisional=provisionalBatch(selected);
    $('metrics').innerHTML = (provisional ? '<section class="card"><strong>Principal calculado · bonos y utilidad provisionales</strong><p>Falta asignar ejecutivo en Tesorería. Los importes mostrados solo incluyen bonos conocidos; no son utilidad final.</p></section>' : '') + metrics('Resumen general', [
      ['Operaciones', Number(selected.operaciones_tiendas || 0) + Number(selected.operaciones_aliados || 0), true],
      ['Valor comercial', selected.total_operaciones], ['Pago total', Number(selected.total_pago_tiendas || 0) + Number(selected.total_pago_aliados || 0)], ['Bonos', selected.total_bonos], ['Utilidad total del negocio', businessUtility(selected)], ['Total a girar', selected.total_pagar]
    ]) + metrics('Operaciones originadas en tiendas propias', [
      ['Operaciones', selected.operaciones_tiendas, true], ['Pago neto a tiendas', selected.total_pago_tiendas], ['Utilidad del negocio', ownStoreUtility(selected)]
    ]) + metrics('Operaciones originadas en aliados', [
      ['Operaciones', selected.operaciones_aliados, true], ['Pago neto a aliados', selected.total_pago_aliados], ['Bonos', selected.total_bonos], ['Utilidad del negocio', allyUtility(selected)]
    ]);
  }

  async function loadReversalSummary(id) {
    const [current,original]=await Promise.all([
      sb.from('aliados_reversiones').select('*').eq('liquidation_id',id),
      sb.from('aliados_reversiones').select('*').contains('snapshot',{original:{liquidation_id:id}}),
    ]);
    if(selected?.id!==id)return;
    let panel=$('reversalSummary');
    if(!panel){panel=document.createElement('section');panel.id='reversalSummary';panel.className='card';$('metrics').after(panel);}
    if(current.error||original.error){panel.hidden=false;panel.textContent='No se pudieron consultar los ajustes por anulaciones. No tomes este resumen como definitivo; actualiza la pantalla.';return;}
    const records=[...new Map([...(current.data||[]),...(original.data||[])].map(r=>[r.id,r])).values()];
    panel.hidden=records.length===0;
    panel.innerHTML=`<h2>Ajustes por anulaciones</h2><p>El resumen original se conserva para auditoría. Los ajustes se contabilizan en su fecha de corte y los cruces se autorizan en Tesorería.</p>${records.map(r=>`<article><strong>Crédito ${esc(r.snapshot.original.external_id)} · ${esc(r.fecha)}</strong>${r.tipo==='sin_desembolso'?'<p>Entrada y salida en cero, sin pagos ni bonos.</p>':`<p>Menos pago al aliado: ${money(r.snapshot.calculo.pago_aliado)} · menos bonos: ${money(r.snapshot.calculo.total_bonos)} · menos utilidad: ${money(r.snapshot.calculo.utilidad_creditek)} · menos provisión: ${money(r.snapshot.calculo.policy_snapshot.provision)}</p>`}</article>`).join('')}<a class="btn secondary" href="aliados-tesoreria.html">Ver cruces y saldos por cobrar en Tesorería</a>`;
  }

  async function openDetail(id) {
    krediyaMissingPayees = 0;
    selected = batches.find((batch) => batch.id === id) || selected;
    $('detail').dataset.platform=selected.plataforma;
    // Abrir el detalle es solo lectura. El cálculo explícito genera el seguimiento.
    $('detail').classList.remove('hidden');
    $('detail').style.scrollMarginTop = '100px';
    $('detail').setAttribute('tabindex', '-1');
    $('detail').scrollIntoView({ behavior: 'instant', block: 'start' });
    $('detail').focus({ preventScroll: true });
    $('workflowError').classList.add('hidden');
    $('workflowError').textContent = '';
    $('detailTitle').textContent = `${platformName(selected.plataforma)} · ${UX.fechaCorta(selected.fecha_corte)}`;
    document.getElementById('aloDuplicateReport')?.remove();
    renderMetrics();
    await loadReversalSummary(id);
    if(selected?.id!==id)return;
    updateActions();
    await loadTab(activeTab);
    if(selected?.id!==id)return;
    if(selected.plataforma==='alo') {
      const result=await sb.from('audit_log').select('detalle').eq('tabla','liquidations').eq('registro_id',id).eq('accion','alo_credito_repetido_omitido');
      if(selected?.id!==id)return;
      if(result.error || result.data?.length) {
        const report=document.createElement('div');report.id='aloDuplicateReport';report.className='operation-notice operation-notice-info';
        report.innerHTML=result.error ? '<p>No se pudo consultar el informe de créditos repetidos. Reintenta abrir el lote.</p>' :
          `<div><strong>${result.data.length} créditos repetidos omitidos</strong><p>No generan otro cálculo ni pago. Los demás créditos continúan.</p><details><summary>Ver contratos y estado anterior</summary>${result.data.map(({detalle:d})=>`<p>Contrato ${esc(d.contrato)} · ${d.mismo_archivo?'Repetido en este archivo':`Estado anterior: ${esc(d.estado_anterior)}`} ${d.datos_diferentes?'· Datos distintos: revisar el archivo original; se conservó el registro anterior.':''}</p>`).join('')}</details></div>`;
        $('detailTitle').parentElement.appendChild(report);
      }
    }
    const { data: issues, error: issueError } = await sb.from('liquidation_incidents').select('operation_id,estado,tipo,descripcion,bloquea_aprobacion').eq('liquidation_id', id).eq('estado', 'abierta');
    if(selected?.id!==id)return;
    const openIssues = Commerce.pending(issues || [], awaitingCalculation(selected) ? selected.liquidation_operations || [] : []);
    if (issueError) {
      $('workflowError').textContent = 'No se pudieron consultar las novedades: ' + issueError.message;
      $('workflowError').classList.remove('hidden');
    } else if (openIssues?.length) {
      const administrative = openIssues.filter((item) => ['comercio_no_reconocido','aliado_sin_ejecutivo','beneficiario_sin_identificacion','cuenta_bancaria_no_validada','bono_beneficiario_sin_cuenta'].includes(item.tipo));
      const blocking = openIssues.filter((item) => item.bloquea_aprobacion && !administrative.includes(item));
      const followup = openIssues.filter((item) => !item.bloquea_aprobacion || KREDIYA_FOLLOWUP_TYPES.has(item.tipo));
      const groups = new Map();
      blocking.forEach((i) => {
        const key = i.tipo === 'krediya_bono_sin_configurar' ? 'Bonos: revisar vigencia para la fecha de venta; los montos ya están definidos'
          : ['krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente'].includes(i.tipo) ? 'Precios: diferencias o referencias sin tarifa vigente. El detalle muestra los valores de cada crédito'
          : i.tipo.replaceAll('_',' ');
        groups.set(key, (groups.get(key) || 0) + 1);
      });
      $('workflowError').innerHTML = (administrative.length ? `<div class="batch-followup"><strong>${administrative.length} pendientes administrativos · no detienen el cálculo</strong><p>Liquida el lote. Completa cliente, ejecutivo y cuenta en Tesorería; el bono del ejecutivo y la utilidad serán provisionales si falta su asignación.</p><a class="btn secondary" href="aliados-tesoreria.html?vista=preparacion&amp;lote=${encodeURIComponent(id)}">Completar en Tesorería</a></div>` : '') + (blocking.length
        ? '<strong>Datos indispensables que sí detienen el lote</strong><ul>' + [...groups].map(([label,count]) => `<li>${count} operaciones: ${esc(label)}</li>`).join('') + '</ul><button type="button" class="btn secondary" id="openBatchIssues">Corregir datos indispensables</button>'
        : '') + (followup.length
        ? `<div class="batch-followup"><strong>${followup.length} anotaciones en seguimiento</strong><p>No requieren aprobación individual ni cambian PAGAMOS.</p><button class="btn secondary" id="openFollowupReport">Ver informe · Gestión y Gerencia</button></div>`
        : '');
      $('workflowError').classList.remove('hidden');
      if ($('openBatchIssues')) $('openBatchIssues').onclick = () => loadTab('incidents');
      if ($('openFollowupReport')) $('openFollowupReport').onclick = () => loadTab(selected.plataforma === 'krediya' ? 'differences' : 'incidents');
    }
    await renderKrediyaFlow(id);
    if(selected?.approved_at){
      $('workflowError').innerHTML=`Liquidación aprobada. <a class="btn secondary" href="aliados-tesoreria.html?vista=preparacion&amp;lote=${encodeURIComponent(id)}">Gestionar en Tesorería</a>`;
      $('workflowError').classList.remove('hidden');
      $('batchSecondaryActions').parentElement.classList.add('hidden');
    }else{
      $('batchSecondaryActions').parentElement.classList.remove('hidden');
      if((selected.liquidation_operations||[]).some(o=>o.tipo_establecimiento==='aliado'&&!o.ejecutivo_id)){
        const button=document.createElement('button');button.className='btn secondary';button.textContent='Asignar ejecutivos';button.onclick=()=>askExecutives(id);$('workflowError').appendChild(button);
      }
    }
  }

  async function openInstructionOperation(operationId, liquidationId) {
    try {
      if (!operationId || !liquidationId) throw new Error('La instrucción no tiene una operación y lote vinculados.');
      if (selected?.id !== liquidationId) {
        if (!batches.some(batch => batch.id === liquidationId)) {
          const {data,error}=await sb.from('liquidations').select('*,liquidation_operations(id,reconocida,monto_credito,monto_base,inicial,tipo_establecimiento)').eq('id',liquidationId).maybeSingle();
          if(error)throw error;
          if(!data || data.plataforma !== 'krediya')throw new Error('El lote de esta instrucción no está disponible.');
          batches.push(data);
        }
        await openDetail(liquidationId);
      }
      await loadTab('operations',operationId);
      $('operationControls').scrollIntoView({block:'start'});
    } catch(error) {
      $('krediyaManagementReport').textContent='No se pudo abrir la operación de la instrucción: '+error.message;
    }
  }

  async function renderKrediyaFlow(id) {
    const flow=$('krediyaFlow');flow.classList.toggle('hidden',selected.plataforma!=='krediya');
    if(selected.plataforma!=='krediya')return;
    if(selected.frozen_at){flow.innerHTML='<strong>Liquidación aprobada</strong><p>Continúa con las órdenes en Pagos. El informe queda disponible para Gestión y Gerencia.</p>';return;}
    if(selected.estado==='revisada'){flow.innerHTML='<strong>Lista para aprobación de Gerencia</strong><p>El lote está liquidado y el informe generado. La aprobación es una sola para todo el lote.</p>';return;}
    flow.textContent='Comprobando destinatarios del lote…';
    try {
      const [{data:ops,error:oe},{data:beneficiaries,error:be},{data:sites,error:se},{data:clients,error:ce}]=await Promise.all([
        sb.from('liquidation_operations').select('id,reconocida,tipo_establecimiento,origen_codigo,establishment_name').eq('liquidation_id',id),
        sb.from('liquidation_beneficiaries').select('id,tipo,origen_codigo,activo').eq('tipo','aliado').eq('activo',true),
        sb.from('aliados_sedes').select('origen_codigo,aliado_id'),
        sb.from('aliados').select('id,payment_beneficiary_id')
      ]);
      if(oe||be||se||ce)throw oe||be||se||ce;
      if(selected?.id!==id)return;
      const missing=Review.missingBeneficiaries(ops||[],beneficiaries||[],sites||[],clients||[]);
      krediyaMissingPayees=missing.length;updateActions();
      flow.innerHTML=missing.length?`<strong>Falta el titular de pago de ${missing.length} comercios</strong><p>Sus ventas y precios sí están registrados. Vincula quién recibe el pago para generar las órdenes; no debes confirmar PVP ni bonos.</p><details><summary>Ver comercios y completar destinatarios</summary>${missing.map(m=>`<div class="missing-payee"><span>${esc(m.name)} · ${m.count} operaciones</span><button class="btn secondary" data-payee="${esc(m.code)}">Vincular titular</button></div>`).join('')}</details>`:'<strong>Siguiente: liquidar el lote completo</strong><p>El cálculo guarda el informe y envía una sola revisión a aprobación. No ejecuta transferencias. Se validan iniciales, crédito y reglas antes de continuar.</p>';
      flow.querySelectorAll('[data-payee]').forEach(button=>button.onclick=()=>{
        location.href='aliados-tesoreria.html?vista=clientes&origen='+encodeURIComponent(button.dataset.payee);
      });
    }catch(error){flow.textContent='No se pudo comprobar a quién pagar: '+error.message;}
  }

  async function loadOperations(focusOperationId, isCurrent = () => true) {
    const operationFields = 'id,liquidation_id,plataforma,external_id,operation_at,establishment_name,origen_codigo,tipo_establecimiento,ejecutivo_id,cliente_documento,cliente_nombre,imei,referencia,modelo,monto_credito,monto_base,accesorios_cantidad,accesorios,inicial,reconocida,inicial_kora,diferencia_inicial,costo_equipo,pagamos,pago_neto_tienda,utilidad_tienda,utilidad_creditek_tienda,diferencia_justificacion,diferencia_revisada_at,valor_comercial,porcentaje_politica,pago_neto_beneficiario,bonos_aplicados,utilidad_creditek,liquidation_calculations(pagamos,pago_aliado,total_bonos,utilidad_creditek,policy_snapshot,explanation)';
    const { data, error } = await sb.from('liquidation_operations').select(operationFields).eq('liquidation_id', selected.id).order('operation_at');
    if (!isCurrent()) return;
    if (error) throw error;
    const rows = (data || []).filter((row) => activeModel === 'all' || row.tipo_establecimiento === activeModel);
    const { data: rowIssues, error: rowIssueError } = await sb.from('liquidation_incidents').select('operation_id,tipo,descripcion').eq('liquidation_id', selected.id).eq('estado','abierta');
    if (!isCurrent()) return;
    if (rowIssueError) throw rowIssueError;
    if (selected.plataforma === 'krediya') {
      const { data: contexts, error: contextError } = await sb.rpc('aliados_contextos_precios_krediya', { p_liquidation_id: selected.id });
      if (!isCurrent()) return;
      if (contextError) throw contextError;
      const {data:instructions,error:instructionsError}=await sb.from('krediya_instrucciones').select('operation_id').eq('liquidation_id',selected.id);
      if (!isCurrent()) return;
      if(instructionsError)throw instructionsError;
      renderKrediyaOperations(rows.map(row=>({...row,instruction_count:(instructions||[]).filter(i=>i.operation_id===row.id).length})), contexts || [], rowIssues || [], focusOperationId);
      return;
    }
    const policies = await sb.from('settlement_policy_versions').select('plataforma,tipo_establecimiento,porcentaje,estado,vigente_desde,vigente_hasta').eq('plataforma',selected.plataforma).eq('estado','aprobada');
    if (!isCurrent()) return;
    renderStandardOperations(rows.map(row=>({...row,
      configured_percentage:policies.error ? null : D.porcentajeConfigurado(row,policies.data || []),
      percentage_lookup_failed:Boolean(policies.error)
    })), rowIssues || []);
  }

  function renderStandardOperations(rows, rowIssues) {
    document.querySelector('#detail > .table-wrap')?.classList.add('operations-cards');
    $('detailHead').innerHTML = '';
    const pending = awaitingCalculation(selected);
    const metric = (label, value) => `<div><dt>${label}</dt><dd>${value == null ? `<span class="value-pending">${pending && !['Crédito financiado','Inicial','Inicial registrada en KORA','Diferencia de inicial'].includes(label) ? 'Pendiente de calcular' : 'No informado'}</span>` : `<strong class="operation-amount">${money(value)}</strong>`}</dd></div>`;
    $('detailBody').innerHTML = rows.map((row) => {
      const isOwn = row.tipo_establecimiento === 'propia';
      const missingCommerce = Commerce.missing(row);
      const future = String(row.operation_at || '').slice(0, 10) >= '2026-08-05';
      const difference = Number(row.diferencia_inicial || 0);
      const calculation = Array.isArray(row.liquidation_calculations) ? row.liquidation_calculations[0] : row.liquidation_calculations;
      const payField = isOwn && !future && operator.capacidad === 'aprobador' && !selected.frozen_at
        ? `<div class="actions"><input class="control" data-pagamos-input="${row.id}" inputmode="numeric" value="${Number(row.pagamos || 0)}" aria-label="Pagamos"><button class="btn secondary" data-save-pagamos="${row.id}">Guardar</button></div>`
        : (row.pagamos ?? calculation?.pagamos) == null ? '<span class="value-pending">Pendiente de calcular</span>' : money(row.pagamos ?? calculation?.pagamos);
      const commercial = row.valor_comercial ?? calculation?.explanation?.valor_comercial ?? calculation?.explanation?.base_liquidable;
      const appliedPercent = row.porcentaje_politica ?? calculation?.policy_snapshot?.porcentaje;
      const percent = appliedPercent ?? row.configured_percentage;
      const percentLabel = appliedPercent == null ? 'Porcentaje configurado' : 'Porcentaje aplicado';
      const percentText = percent == null ? row.percentage_lookup_failed ? 'No se pudo consultar' : missingCommerce ? 'Por definir: propia o aliado' : 'Sin regla vigente' : `${Number((Number(percent) * 100).toFixed(4))} %`;
      const net = row.pago_neto_beneficiario ?? row.pago_neto_tienda ?? calculation?.pago_aliado;
      const bonuses = row.bonos_aplicados ?? calculation?.total_bonos;
      const commissionPending = !isOwn && (!row.ejecutivo_id || rowIssues.some(i=>i.operation_id===row.id && i.tipo==='aliado_sin_ejecutivo'));
      const utility = commissionPending ? null : row.utilidad_creditek ?? (isOwn ? row.utilidad_creditek_tienda : null) ?? calculation?.utilidad_creditek;
      const actualIssues = (rowIssues || []).filter((i) => i.operation_id === row.id);
      const hasIssue = actualIssues.length || !row.reconocida || (isOwn && difference);
      const issueLabel = actualIssues.length ? [...new Set(actualIssues.map((i) => ['krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente'].includes(i.tipo) ? 'Revisar diferencia de precios' : i.tipo === 'krediya_bono_sin_configurar' ? 'Revisar vigencia de bonos' : i.descripcion || i.tipo))].join(' · ') : !row.reconocida ? 'Operación no reconocida' : isOwn && difference ? 'Diferencia por revisar' : 'Sin novedades';
      const inventoryOnly = actualIssues.length > 0 && actualIssues.every((i) => i.tipo === 'imei_no_resuelto') && row.reconocida && !difference;
      const issues = hasIssue ? `<aside class="operation-notice ${inventoryOnly ? 'operation-notice-info' : ''}" aria-label="Novedad de la operación"><div><strong>${inventoryOnly ? 'Equipo pendiente de registro en inventario' : 'Novedad por revisar'}</strong><p class="issue-summary">${inventoryOnly ? 'KORA no encontró este IMEI en el inventario de la tienda. Revisa su registro; este aviso no bloquea el pago.' : esc(issueLabel)}</p></div><button class="btn secondary" data-manage-issue="${row.id}">${inventoryOnly ? 'Revisar inventario' : 'Ver novedad'}</button></aside>` : '<p class="operation-clear">Sin novedades en esta operación</p>';
      return `<tr><td><article class="krediya-operation standard-operation" aria-label="${esc(row.establishment_name || 'Comercio no informado')}">
        <header class="operation-heading"><div><h3>${esc(row.establishment_name || 'Comercio no informado')}</h3><p>${esc(row.referencia || row.modelo || 'Referencia no informada')} · ${missingCommerce ? 'Comercio pendiente de vincular' : isOwn ? 'Tienda propia' : 'Aliado'}</p></div><span class="operation-status">Liquidación: ${state(selected.estado)}</span></header>
        <div class="operation-identity"><span>Cliente: ${esc(row.cliente_nombre || 'No informado')}</span><span class="operation-imei">IMEI: ${esc(row.imei || 'No informado')}</span><span>Venta: ${esc(String(row.operation_at || '').slice(0, 10) || 'No informada')}</span></div>
        <dl class="operation-values">${metric('Crédito financiado', row.monto_credito ?? row.monto_base)}${metric('Inicial', row.inicial)}${metric('Valor comercial', commercial)}<div><dt>${percentLabel}</dt><dd><strong class="${percent == null ? 'value-pending' : 'operation-amount'}">${percentText}</strong></dd></div><div><dt>Pagamos</dt><dd class="operation-amount">${payField}</dd></div>${metric('Pago neto', net)}${metric('Bonos', bonuses)}${metric('Utilidad', utility)}</dl>
        ${commissionPending ? '<p class="value-pending">Bonos conocidos mostrados; falta el bono del ejecutivo. Utilidad final pendiente de esa asignación en Tesorería.</p>' : ''}
        ${isOwn ? `<details class="operation-reconciliation"><summary>Conciliación de la inicial</summary><dl class="operation-values">${metric('Inicial registrada en KORA', row.inicial_kora)}${metric('Diferencia de inicial', row.diferencia_inicial)}</dl></details>` : ''}
        ${missingCommerce && awaitingCalculation(selected) ? `<aside class="operation-notice"><div><strong>Falta vincular el comercio</strong><p>Vincula una tienda existente o registra el nuevo local antes de completar su cuenta.</p></div><button class="btn secondary" data-commerce="${row.id}">Vincular comercio</button></aside>` : issues}
      </article></td></tr>`;
    }).join('') || '<tr><td>Sin operaciones.</td></tr>';
    document.querySelectorAll('[data-save-pagamos]').forEach((button) => { button.onclick = () => savePagamos(button.dataset.savePagamos); });
    document.querySelectorAll('[data-manage-issue]').forEach((button) => { button.onclick = () => loadTab('incidents', button.dataset.manageIssue); });
    document.querySelectorAll('[data-commerce]').forEach(button=>{button.onclick=()=>comercios.open(button.dataset.commerce);});
  }

  function renderKrediyaOperations(rows, contexts, incidents, focusOperationId) {
    const contextById = new Map(contexts.map((c) => [c.operation_id, c]));
    const amount = (value, missing = 'Sin tarifa vinculada') => value == null ? `<span class="value-pending">${missing}</span>` : `<strong class="operation-amount">${money(value)}</strong>`;
    const metric = (label, value, missing) => `<div><dt>${label}</dt><dd>${amount(value, missing)}</dd></div>`;
    document.querySelector('#detail > .table-wrap')?.classList.add('operations-cards');
    $('detailHead').innerHTML = '';
    let page=0,search='',store='',priceFilter='';
    const stores=[...new Map(rows.map(r=>[r.origen_codigo,r.establishment_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'es'));
    $('operationControls').classList.remove('hidden');$('operationPaging').classList.remove('hidden');
    function render() {
    const filtered=Review.filterOperations(rows,{search,store}).filter(r=>!focusOperationId||r.id===focusOperationId).filter(r=>{const c=contextById.get(r.id)||{};return !priceFilter||(priceFilter==='missing'?(c.pvp_guardado==null||c.pagamos_guardado==null):c.diferencia_pvp!=null&&Number(c.diferencia_pvp)!==0);}),pages=Math.max(1,Math.ceil(filtered.length/8));page=Math.min(page,pages-1);
    $('operationControls').innerHTML=`<label>Buscar referencia, cliente o IMEI<input class="control" id="operationSearch" value="${esc(search)}"></label><label>Tienda<select class="control" id="operationStore"><option value="">Todas las tiendas del lote</option>${stores.map(([code,name])=>`<option value="${esc(code)}" ${store===code?'selected':''}>${esc(name)}</option>`).join('')}</select></label><span>${filtered.length} de ${rows.length} operaciones${focusOperationId?' · Operación vinculada a la consulta':''}</span>${focusOperationId?'<button class="btn secondary" id="allOperations">Ver todo el lote</button>':''}`;
    $('operationControls').innerHTML+=`<label>Precios<select class="control" id="operationPriceFilter"><option value="">Todos</option><option value="missing">Falta PVP o PAGAMOS</option><option value="difference">Diferencia con PVP KORA</option></select></label>${!selected.frozen_at?'<button class="btn primary" id="calculateVisibleLot">Calcular utilidades del lote</button>':''}`;
    $('operationPriceFilter').value=priceFilter;$('operationPriceFilter').onchange=e=>{priceFilter=e.target.value;page=0;render();};
    if(!selected.frozen_at){$('calculateVisibleLot').disabled=$('calculate').disabled;$('calculateVisibleLot').onclick=()=>$('calculate').click();}
    if(focusOperationId)$('allOperations').onclick=()=>{focusOperationId=null;page=0;render();};
    $('operationSearch').oninput=e=>{search=e.target.value;page=0;render();$('operationSearch').focus();$('operationSearch').setSelectionRange(search.length,search.length);};
    $('operationStore').onchange=e=>{store=e.target.value;page=0;render();};
    $('detailBody').innerHTML = filtered.slice(page*8,(page+1)*8).map((row) => {
      const calc = Array.isArray(row.liquidation_calculations) ? row.liquidation_calculations[0] : row.liquidation_calculations;
      const c = calc?.policy_snapshot?.motor === 'krediya_v2' ? calc.policy_snapshot : contextById.get(row.id) || {};
      // Persisted calculations remain authoritative; a live tariff is only a preview.
      const calculated = Boolean(calc);
      const pendingExecutive=calculated && !selected.frozen_at && row.tipo_establecimiento==='aliado' && (c.bono_ejecutivo_pendiente || !row.ejecutivo_id);
      const pvp = calculated ? (calc.explanation?.valor_comercial ?? calc.explanation?.base_liquidable ?? row.valor_comercial) : c.pvp_recibido;
      const paid = calculated ? calc.pagamos : c.pagamos_guardado;
      const net = calculated ? calc.pago_aliado : paid == null || !row.reconocida ? null : Number(paid) - Number(row.inicial || 0);
      const openIssues = incidents.filter((i) => i.operation_id === row.id);
      const priceIssue = openIssues.some((i) => ['krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente'].includes(i.tipo));
      const delta = c.diferencia_pvp;
      const note = !row.reconocida ? 'Excluida del cálculo. Consulta su novedad.'
        : paid == null || c.pvp_guardado == null ? 'Falta completar PVP o PAGAMOS de esta referencia.'
        : pvp == null ? 'Falta PVP recibido de Krediya para calcular.'
        : delta != null && Number(delta) !== 0 ? `Diferencia PVP: ${money(delta)} · Seguimiento, no bloquea. Se respeta PAGAMOS.`
        : calculated ? 'Valores calculados de esta operación.' : 'Datos disponibles. Liquidación pendiente de calcular.';
      const priceAction = !selected.frozen_at && row.reconocida
        ? `<button class="btn secondary" data-open-tariff="${row.id}">${c.pvp_guardado==null||c.pagamos_guardado==null?'Crear datos · PVP y PAGAMOS':'Editar PVP y PAGAMOS'}</button>`
        : openIssues.length ? `<button class="btn secondary" data-manage-issue="${row.id}">Ver novedad</button>` : '';
      return `<tr><td><article class="krediya-operation compact-krediya" aria-label="${esc(row.referencia || row.modelo || 'Referencia no informada')}">
        <header class="operation-heading"><div><h3>${esc(row.referencia || row.modelo || 'Referencia no informada')}</h3><p>${esc(row.establishment_name)} · ${row.tipo_establecimiento === 'propia' ? 'Tienda propia' : 'Aliado'}</p></div><span class="operation-status">${!row.reconocida ? 'Excluida' : calculated ? 'Calculada' : 'Sin calcular'}</span></header>
        <dl class="operation-values">${metric(calculated?'PVP liquidado':'PVP Krediya',pvp)}${metric('PVP KORA',c.pvp_guardado)}${metric('PAGAMOS pactado',paid)}${metric(calculated?'Giro al beneficiario':'Giro estimado · PAGAMOS menos inicial',net)}${metric('Utilidad después de bonos, gasto financiero y provisión',calculated&&!pendingExecutive?calc.utilidad_creditek:null,!row.reconocida?'No aplica: excluida':pendingExecutive?'Falta bono del ejecutivo':paid==null?'Falta PAGAMOS':'Pendiente de calcular')}</dl>
        <footer class="operation-footer"><p>${esc(note)}</p><div class="operation-actions">${priceAction}${row.instruction_count?`<button class="btn secondary" data-operation-instructions="${esc(row.id)}">Ver instrucciones (${row.instruction_count})</button>`:''}</div></footer>
        ${pendingExecutive?'<p class="value-pending">Principal calculado; faltan el bono del ejecutivo y la utilidad final. Completar en Tesorería.</p>':''}
        <details class="operation-details"><summary>Ver cliente y desglose</summary>
        <div class="operation-identity"><span>Cliente: ${esc(row.cliente_nombre || 'No informado')}</span><span class="operation-imei">IMEI: ${esc(row.imei || 'No informado')}</span><span>Venta: ${esc(c.fecha || String(row.operation_at || '').slice(0,10))}</span></div>
        <dl class="operation-values">${metric(calculated ? 'PVP liquidado' : 'PVP recibido para liquidar', pvp)}${metric('PVP configurado de referencia', c.pvp_guardado)}${metric('PVP recibido de Krediya', c.pvp_recibido, 'No informado')}${metric('Pagamos antes de inicial', paid)}${metric('Inicial', row.inicial, 'No informada')}${metric(calculated ? 'Pago neto liquidado' : 'Pagamos − inicial · estimado', net, row.reconocida ? 'Pendiente de tarifa' : 'No aplica: operación excluida')}${metric('Crédito financiado', row.monto_credito ?? row.monto_base, 'No informado')}</dl>
        <div class="operation-totals"><span>Bonos ${pendingExecutive ? 'conocidos' : calculated ? 'liquidados' : 'operativos configurados'}: ${amount(calculated ? calc.total_bonos : c.bonos, 'No aplica')}</span>${calculated ? `<span>Gasto financiero: ${amount(calc.policy_snapshot?.gasto_financiero, 'No disponible')}</span><span>Provisión: ${amount(pendingExecutive ? null : calc.policy_snapshot?.provision, pendingExecutive ? 'Pendiente de bono' : 'No disponible')}</span>` : '<span>Los bonos del ejecutivo se suman al calcular.</span>'}<span>Utilidad: ${amount(calculated && !pendingExecutive ? calc.utilidad_creditek : null, pendingExecutive ? 'Pendiente de bono' : 'Pendiente de calcular')}</span></div>
        <p>${priceIssue ? 'La diferencia queda en el informe consolidado de 7 días. ' : ''}${!calculated && paid != null && row.reconocida ? 'El giro es estimado; no es un pago autorizado.' : ''}</p></details>
      </article></td></tr>`;
    }).join('') || '<tr><td>Sin operaciones.</td></tr>';
    document.querySelectorAll('[data-edit-operation-price]').forEach((button) => { button.onclick = () => openPriceEditor(button.dataset.editOperationPrice); });
    document.querySelectorAll('[data-operation-instructions]').forEach(button=>button.onclick=()=>loadTab('management',button.dataset.operationInstructions));
    document.querySelectorAll('[data-open-tariff]').forEach((button) => { button.onclick = () => tarifarioKrediya.openOperationTariff(button.dataset.openTariff,async()=>{await loadTab('operations');}); });
    document.querySelectorAll('[data-manage-issue]').forEach((button) => { button.onclick = () => {
      const row=rows.find(r=>r.id===button.dataset.manageIssue);
      const calc=Array.isArray(row.liquidation_calculations)?row.liquidation_calculations[0]:row.liquidation_calculations;
      const context=calc?.policy_snapshot?.motor==='krediya_v2'?calc.policy_snapshot:contextById.get(row.id)||{};
      const modal=Review.dialog('Novedad de la operación',`<h3>${esc(row.referencia||row.modelo)}</h3><p>${esc(row.establishment_name)} · IMEI ${esc(row.imei)}</p><dl class="compact-price-values">${metric('PVP configurado',context.pvp_guardado)}${metric('PVP Krediya',context.pvp_recibido)}${metric('Diferencia PVP',context.diferencia_pvp)}${metric('PAGAMOS pactado',calc?calc.pagamos:context.pagamos_guardado)}</dl><p>${row.reconocida?'Las diferencias de PVP van al informe de Gestión y Gerencia. No necesitas aceptarlas para liquidar.':'Esta operación está excluida del cálculo y del pago.'}</p>${incidents.filter(i=>i.operation_id===row.id&&!KREDIYA_FOLLOWUP_TYPES.has(i.tipo)).map(i=>`<p>${esc(i.descripcion)}</p>`).join('')}<div class="operation-actions"><button class="btn primary" data-report>Ver en el informe</button>${operator.capacidad==='aprobador'&&row.reconocida?'<button class="btn secondary" data-instruction>Dar instrucción a Gestión</button>':''}</div>`);
      modal.querySelector('[data-report]').onclick=()=>{modal.close();loadTab('differences',row.id);};
      if(operator.capacidad==='aprobador'&&row.reconocida)modal.querySelector('[data-instruction]').onclick=()=>{modal.close();gestionKrediya.open(row.id);};
    }; });
    $('operationPaging').innerHTML=`<button class="btn secondary" id="operationsPrevious" ${page===0?'disabled':''}>Anterior</button><span>Página ${page+1} de ${pages} · ${filtered.length} operaciones</span><button class="btn secondary" id="operationsNext" ${page+1>=pages?'disabled':''}>Siguiente</button>`;
    for(const [id,delta] of [['operationsPrevious',-1],['operationsNext',1]])$(id).onclick=()=>{page+=delta;render();$('operationControls').scrollIntoView({block:'start'});};
    }
    render();
  }

  async function reviewReversal(operationId) {
    const lotId=selected.id;
    const modal=Review.dialog('Revisar anulación', '<p data-status>Buscando la venta original en todos los cortes…</p><div data-preview></div>');
    try {
      const {data:p,error}=await sb.rpc('aliados_previsualizar_reversion',{p_cancelacion:operationId});
      if(error)throw error;
      modal.querySelector('[data-status]').textContent='Comprueba el crédito y los importes originales antes de confirmar.';
      const c=p.calculo;
      modal.querySelector('[data-preview]').innerHTML=`<p><strong>Crédito ${esc(p.credito)}</strong> · ${esc(p.comercio)} · IMEI ${esc(p.imei)}</p><p>Venta original: ${esc(String(p.fecha_original||'').slice(0,10))}</p>${c?`<dl class="compact-price-values">${[['Pago al aliado',c.pago_aliado],['Bonos',c.total_bonos],['Utilidad a reversar',c.utilidad_creditek],['Provisión a reversar',c.policy_snapshot?.provision]].map(([label,value])=>`<div><dt>${label}</dt><dd>${value==null?'No disponible':money(value)}</dd></div>`).join('')}</dl>${(p.pagos||[]).map(x=>`<p>${esc(x.beneficiario)}: ${money(x.importe)} · ${['pagado','conciliado'].includes(x.estado)?'Por recuperar mediante cruce o cobro':'Obligación pendiente por cancelar'}</p>`).join('')}<p>Se conservarán los comprobantes. No se ejecutará ningún pago ni se marcará dinero como recuperado en el banco.</p>`:'<p>Si entrada y anulación pertenecen al mismo lote y todavía no tienen cálculo ni pagos, quedarán en cero conservando ambas filas.</p>'}${!c||operator.capacidad==='aprobador'?'<button class="btn primary" data-confirm>Confirmar anulación y sus ajustes</button>':'<p>Gerencia debe confirmar los ajustes de una liquidación aprobada.</p>'}`;
      const confirm=modal.querySelector('[data-confirm]');
      if(confirm)confirm.onclick=async()=>{
        confirm.disabled=true;
        try{
          const result=await sb.rpc('aliados_confirmar_reversion',{p_cancelacion:operationId});
          if(result.error)throw result.error;
          modal.close();await loadBatches();await openDetail(lotId);await loadTab('incidents');
        }catch(e){modal.querySelector('[data-status]').textContent=e.message;confirm.disabled=false;}
      };
    }catch(e){modal.querySelector('[data-status]').textContent=e.message;}
  }

  async function loadIncidents(focusOperationId, isCurrent = () => true) {
    const { data, error } = await sb.from('liquidation_incidents').select('*,liquidation_operations(establishment_name,imei,referencia,modelo,origen_codigo)').eq('liquidation_id', selected.id).order('created_at');
    if (!isCurrent()) return;
    if (error) throw error;
    const unresolved = awaitingCalculation(selected) ? selected.liquidation_operations || [] : [];
    const pending = Commerce.pending(data || [],unresolved);
    const history = (data || []).filter((item) => item.estado !== 'abierta' && !(Commerce.types.has(item.tipo) && unresolved.some(o=>o.id===item.operation_id&&Commerce.missing(o))));
    let priceContexts=[];
    if(selected.plataforma==='krediya') {
      const result=await sb.rpc('aliados_contextos_precios_krediya',{p_liquidation_id:selected.id});
      if (!isCurrent()) return;
      if(result.error)throw result.error;priceContexts=result.data||[];
    }
    let showHistory = false, page = 0;
    const pageSize = 8;
    const render = () => {
      const source = showHistory ? history : pending;
      const visible = focusOperationId ? source.filter((item) => item.operation_id === focusOperationId) : source;
      const pages = Math.max(1, Math.ceil(visible.length / pageSize));
      page = Math.min(page, pages - 1);
      $('detailHead').innerHTML = '';
      $('detailBody').innerHTML = `<tr><td><div class="incident-toolbar"><button class="btn secondary" id="pendingIssues">Pendientes (${pending.length})</button><button class="btn secondary" id="historyIssues">Consultar historial (${history.length})</button>${focusOperationId ? '<button class="btn secondary" id="allIssues">Ver todo el lote</button>' : ''}<strong>${showHistory ? 'Historial: no requiere gestión' : 'Pendientes de resolver'}</strong></div>${visible.slice(page * pageSize, (page + 1) * pageSize).map((item) => {
        const bonus = item.tipo === 'krediya_bono_sin_configurar';
        const price = ['krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente'].includes(item.tipo);
        const paymentFollowup = ['krediya_pago_pendiente','krediya_estado_por_validar','krediya_credito_ya_registrado','krediya_anulacion_por_conciliar'].includes(item.tipo);
        const title = paymentFollowup ? ({krediya_pago_pendiente:'Pendiente de pago por Krediya',krediya_estado_por_validar:'Estado del crédito por validar',krediya_credito_ya_registrado:'Crédito ya registrado',krediya_anulacion_por_conciliar:'Posible anulación: revisar la operación original'})[item.tipo] : bonus ? 'Validación de bonos Krediya' : price ? 'Diferencia de PVP' : UX.traducirEstado(item.tipo);
        const c=priceContexts.find(c=>c.operation_id===item.operation_id);
        const explanation = bonus ? (item.estado === 'abierta' ? 'No se encontró una regla de bonos aplicable. Configuración esperada: gestión Maythe $5.000 y operación Oscar $15.000. Requiere corregir la configuración, no confirmar el bono de cada venta.' : 'Gestión Maythe $5.000 y operación Oscar $15.000. Configuración corregida; no requiere ninguna acción.') : item.descripcion;
        const administrative = CreditekTesoreriaPreparacion.incidentAction(item);
        const followupOnly = !administrative && selected.plataforma === 'krediya' && (!item.bloquea_aprobacion || KREDIYA_FOLLOWUP_TYPES.has(item.tipo));
        const editable = item.estado === 'abierta' && !selected.frozen_at && PENDING_STATES.includes(selected.estado);
        const action = editable && administrative?.href ? `<a class="btn secondary" href="${esc(administrative.href)}">${esc(administrative.label)}</a>` : editable && !bonus && !followupOnly ? `<button class="btn secondary" data-resolve="${item.id}" data-operation="${item.operation_id || ''}" data-incident-type="${esc(item.tipo)}">${administrative?.label || (Commerce.types.has(item.tipo) ? 'Vincular comercio' : price ? 'Revisar precios' : 'Revisar y justificar')}</button>` : '';
        const priceDetails=price&&c&&item.estado==='abierta'?`<dl class="compact-price-values">${[['PVP configurado',c.pvp_guardado],['PVP Krediya',c.pvp_recibido],['Diferencia PVP',c.diferencia_pvp],['PAGAMOS pactado',c.pagamos_guardado]].map(([label,value])=>`<div><dt>${label}</dt><dd>${value==null?'No disponible':money(value)}</dd></div>`).join('')}</dl><p>Se conserva PAGAMOS. Esta diferencia se gestiona en el informe, sin aceptación individual.</p>`:`<p>${esc(explanation)}</p>`;
        return `<article class="incident-card"><div><strong>${esc(title)}</strong> · ${paymentFollowup ? '<span class="badge">Sin nuevo pago · el resto del lote continúa</span>' : followupOnly ? '<span class="badge">Informe de 7 días · no bloquea pago</span>' : state(item.estado)}<p><strong>${esc(item.liquidation_operations?.referencia || item.liquidation_operations?.modelo || '')}</strong></p><p>${esc(item.liquidation_operations?.establishment_name || 'General')} · IMEI ${esc(item.liquidation_operations?.imei || '—')}</p>${priceDetails}${item.resolution ? `<p>Resolución: ${esc(item.resolution)}</p>` : ''}</div>${item.tipo==='krediya_anulacion_por_conciliar'&&item.estado==='abierta'?`<button class="btn secondary" data-reversal="${esc(item.operation_id)}">Revisar anulación</button>`:paymentFollowup ? '' : action}${price?`<button class="btn secondary" data-issue-report="${esc(item.operation_id||'')}">Ver informe</button>`:''}</article>`;
      }).join('') || '<p>No hay novedades en esta vista.</p>'}<div class="incident-toolbar"><button class="btn secondary" id="previousIssues" ${page === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${page + 1} de ${pages} · ${visible.length} novedades</span><button class="btn secondary" id="nextIssues" ${page + 1 >= pages ? 'disabled' : ''}>Siguiente</button></div></td></tr>`;
      $('pendingIssues').onclick = () => { showHistory = false; page = 0; render(); };
      $('historyIssues').onclick = () => { showHistory = true; page = 0; render(); };
      if ($('allIssues')) $('allIssues').onclick = () => { focusOperationId = null; page = 0; render(); };
      $('previousIssues').onclick = () => { page--; render(); };
      $('nextIssues').onclick = () => { page++; render(); };
      document.querySelectorAll('[data-resolve]').forEach((button) => { button.onclick = () => resolveIncident(button.dataset.resolve, button.dataset.operation, button.dataset.incidentType); });
      document.querySelectorAll('[data-issue-report]').forEach(button=>button.onclick=()=>loadTab('differences',button.dataset.issueReport||null));
      document.querySelectorAll('[data-reversal]').forEach(button=>button.onclick=()=>reviewReversal(button.dataset.reversal));
      document.querySelector('.incident-toolbar')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    render();
  }

  async function loadPayments(isCurrent = () => true) {
    const { data, error } = await sb.from('payment_orders').select('id,valor,estado,fecha_programada,fecha_pagada,soporte_path,liquidation_beneficiaries(nombre,tipo,origen_codigo),beneficiary_bank_accounts(numero_cuenta),payment_items(concepto)').eq('liquidation_id', selected.id);
    if (!isCurrent()) return;
    if (error) throw error;
    $('detailHead').innerHTML = '';
    $('detailBody').innerHTML = (data || []).map((payment) => {
      const beneficiary = payment.liquidation_beneficiaries || {};
      const action = (selected.frozen_at && selected.estado === 'aprobada') || payment.estado === 'programado' || payment.estado === 'pagado'
          ? '<a class="btn secondary" href="aliados-tesoreria.html">Continuar en Tesorería</a>'
          : !selected.frozen_at ? 'Primero: revisión de Maite y aprobación de Gerencia' : '—';
      const concepts = [...new Set((payment.payment_items || []).map((item) => UX.traducirEstado(item.concepto)))];
      return `<tr><td><article class="grouped-summary payment-summary">
        <header class="grouped-heading"><div><h3>${esc(beneficiary.nombre || 'Sin nombre')}</h3><p>${esc(UX.traducirEstado(beneficiary.tipo || 'otro'))}${beneficiary.origen_codigo ? ` · ${esc(beneficiary.origen_codigo)}` : ''}</p></div>${state(payment.estado)}</header>
        <dl class="grouped-values"><div><dt>Valor a pagar</dt><dd>${money(payment.valor)}</dd></div><div><dt>Cuenta destino</dt><dd>${esc(payment.beneficiary_bank_accounts?.numero_cuenta ? UX.cuentaTerminadaEn(payment.beneficiary_bank_accounts.numero_cuenta) : 'Pendiente de registrar')}</dd></div><div><dt>Concepto</dt><dd>${esc(concepts.join(' · ') || 'Liquidación')}</dd></div><div><dt>Fecha programada</dt><dd>${payment.fecha_programada ? UX.fechaCorta(payment.fecha_programada) : 'Sin programar'}</dd></div><div><dt>Fecha de pago</dt><dd>${payment.fecha_pagada ? UX.fechaCorta(payment.fecha_pagada) : 'Sin pago registrado'}</dd></div><div><dt>Soporte</dt><dd>${payment.soporte_path ? 'Adjunto' : 'Pendiente de adjuntar'}</dd></div></dl>
        <footer class="grouped-footer">${action}</footer></article></td></tr>`;
    }).join('') || '<tr><td>Sin pagos.</td></tr>';
    document.querySelectorAll('[data-payment]').forEach((button) => { button.onclick = () => changePayment(button.dataset.payment, button.dataset.next); });
  }

  async function loadAudit(isCurrent = () => true) {
    const { data, error } = await sb.from('audit_log').select('accion,usuario,created_at,detalle').eq('tabla', 'liquidations').eq('registro_id', selected.id).order('created_at', { ascending: false });
    if (!isCurrent()) return;
    if (error) throw new Error('No se pudo consultar el historial de cambios. Intenta nuevamente.');
    const userIds = [...new Set((data || []).map(item => item.usuario).filter(Boolean))];
    const profiles = new Map();
    if (userIds.length) {
      const result = await sb.from('perfiles').select('id,nombre,rol').in('id', userIds);
      if (!isCurrent()) return;
      // La falta de acceso a un perfil no debe ocultar los eventos de auditoría.
      if (!result.error) (result.data || []).forEach(profile => profiles.set(profile.id, profile));
    }
    $('detailHead').innerHTML = '<tr><th>Acción</th><th>Realizada por</th><th>Fecha</th><th>Descripción</th><th>Resultado</th></tr>';
    $('detailBody').innerHTML = (data || []).map((item) => {
      item = { ...item, perfiles: profiles.get(item.usuario) };
      const readable = UX.describirAuditoria(item.accion, item.detalle, item.perfiles?.nombre || 'Usuario KORA');
      return `<tr><td>${esc(readable.accion)}</td><td>${esc(item.perfiles?.nombre || 'Usuario KORA')}${item.perfiles?.rol ? ` — ${esc(UX.traducirEstado(item.perfiles.rol))}` : ''}</td><td>${UX.fechaAuditoria(item.created_at)}</td><td>${esc(readable.descripcion)}</td><td>${esc(readable.resultado)}<details><summary>Ver detalle técnico</summary><pre>${esc(UX.detalleTecnico(item.detalle))}</pre></details></td></tr>`;
    }).join('') || '<tr><td colspan="5">Sin registros de auditoría.</td></tr>';
  }

  async function loadGrouped(kind, isCurrent = () => true) {
    const { data, error } = await sb.from('liquidation_operations').select('*').eq('liquidation_id', selected.id).eq('tipo_establecimiento', 'aliado');
    if (!isCurrent()) return;
    if (error) throw error;
    const executiveNames = new Map();
    if (kind === 'executives') {
      const { data: executives, error: executivesError } = await sb.from('ejecutivos').select('id,nombre');
      if (!isCurrent()) return;
      if (executivesError) throw executivesError;
      (executives || []).forEach((executive) => executiveNames.set(executive.id, executive.nombre));
    }
    const key = kind === 'allies' ? 'establishment_name' : 'ejecutivo_id';
    const groups = Object.values((data || []).reduce((acc, row) => {
      const value = row[key] || 'Sin asignar';
      const label = kind === 'allies' ? value : row.ejecutivo_id ? (executiveNames.get(row.ejecutivo_id) || 'Ejecutivo no disponible') : 'Sin ejecutivo asignado';
      acc[value] ||= { label, establishments: new Set(), operations: 0, sales: 0, initial: 0, issues: 0 };
      acc[value].establishments.add(row.establishment_name); acc[value].operations += 1; acc[value].sales += Number(row.monto_credito ?? row.monto_base); acc[value].initial += Number(row.inicial || 0); acc[value].issues += row.reconocida ? 0 : 1;
      return acc;
    }, Object.create(null)));
    renderGrouped(groups, kind);
  }

  function renderGrouped(groups, kind) {
    const allies = kind === 'allies';
    $('detailHead').innerHTML = '';
    $('detailBody').innerHTML = groups.map((group, index) => {
      const fields = allies
        ? [['Operaciones', esc(group.operations)], ['Crédito financiado', money(group.sales)], ['Iniciales', money(group.initial)]]
        : [['Aliados incluidos', esc(group.establishments.size)], ['Operaciones', esc(group.operations)], ['Crédito financiado', money(group.sales)]];
      return `<tr><td><article class="grouped-summary" aria-labelledby="group-title-${index}">
        <header class="grouped-heading"><h3 id="group-title-${index}">${esc(group.label)}</h3><span>${esc(platformName(selected.plataforma))}</span></header>
        ${allies ? '' : `<p class="grouped-establishments">${esc([...group.establishments].filter(Boolean).join(' · '))}</p>`}
        <dl class="grouped-values">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
        <footer class="grouped-footer"><span>Operaciones sin reconocer: <strong>${esc(group.issues)}</strong></span><button class="btn secondary" type="button" data-group-payments>${allies ? 'Ver pagos' : 'Ver bonos y pagos'}</button></footer>
      </article></td></tr>`;
    }).join('') || '<tr><td><p class="grouped-empty">Sin registros.</p></td></tr>';
    document.querySelectorAll('[data-group-payments]').forEach((button) => { button.onclick = () => loadTab('payments'); });
  }

  async function loadTab(tab, focusOperationId) {
    const request = {}; activeTabRequest = request;
    const isCurrent = () => activeTabRequest === request;
    activeTab = tab;
    $('operationControls').classList.add('hidden');$('operationPaging').classList.add('hidden');
    if (typeof gestionKrediya !== 'undefined') gestionKrediya?.cancelReport();
    document.querySelector('#detail > .table-wrap')?.classList.remove('operations-cards');
    document.querySelector('#detail > .table-wrap')?.classList.toggle('operations-table', tab === 'operations');
    document.querySelector('#detail > .table-wrap')?.classList.toggle('incidents-table', tab === 'incidents');
    document.querySelector('#detail > .table-wrap')?.classList.toggle('grouped-cards', ['allies','executives','management','differences','payments'].includes(tab));
    document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    try {
      if (tab === 'operations') {
        if(focusOperationId){activeModel='all';document.querySelectorAll('[data-model]').forEach(b=>b.classList.toggle('active',b.dataset.model==='all'));}
        await loadOperations(focusOperationId, isCurrent);
      }
      else if (tab === 'incidents') await loadIncidents(focusOperationId, isCurrent);
      else if (tab === 'payments') await loadPayments(isCurrent);
      else if (tab === 'audit') await loadAudit(isCurrent);
      else if (tab === 'differences') {
        $('detailHead').innerHTML = '';
        $('detailBody').innerHTML = '<tr><td><div id="krediyaDifferencesReport"></div></td></tr>';
        await tarifarioKrediya.report($('krediyaDifferencesReport'), selected, focusOperationId);
      }
      else if (tab === 'management') {
        $('detailHead').innerHTML = '';
        $('detailBody').innerHTML = '<tr><td><div id="krediyaManagementReport"></div></td></tr>';
        await gestionKrediya.renderReport($('krediyaManagementReport'), selected.id, focusOperationId);
      }
      else await loadGrouped(tab, isCurrent);
    } catch (error) { if(isCurrent())$('detailBody').innerHTML = `<tr><td>${esc(error.message)}</td></tr>`; }
  }

  async function savePagamos(id) {
    const value = Number(document.querySelector(`[data-pagamos-input="${id}"]`).value.replace(/[^0-9.-]/g, ''));
    const { error } = await sb.rpc('aliados_guardar_pagamos', { p_operation_id: id, p_pagamos: value });
    if (error) return alert(error.message);
    await loadTab('operations');
  }
  async function resolveIncident(id, operationId, incidentType) {
    if(incidentType==='aliado_sin_ejecutivo'){await preparacion.openExecutive({lotId:selected.id,operationId});return;}
    if (Commerce.types.has(incidentType)) { await comercios.open(operationId); return; }
    if (selected.plataforma === 'krediya' && incidentType?.startsWith('krediya_')) {
      if (incidentType === 'krediya_bono_sin_configurar') return;
      await tarifarioKrediya.openTariff();
      return;
    }
    const justification = prompt('Escribe la justificación de la diferencia o novedad:');
    if (!justification?.trim()) return;
    const { error } = await sb.rpc('aliados_resolver_novedad', { p_incident_id: id, p_justificacion: justification.trim() });
    if (error) return alert(error.message);
    await loadTab('incidents');
  }
  async function openPriceEditor(operationId) {
    const modal = $('priceEditor');
    modal.classList.add('show');
    $('priceEditorContent').textContent = 'Cargando comparación…';
    $('closePriceEditor').onclick = () => modal.classList.remove('show');
    const { data: c, error } = await sb.rpc('aliados_contexto_precio_krediya', { p_operation_id: operationId });
    if (error) { $('priceEditorContent').textContent = error.message; return; }
    const amount = (value) => value == null ? 'No registrado' : money(value);
    const delta = (received, saved) => received == null || saved == null ? '—' : money(Number(received) - Number(saved));
    $('priceEditorContent').innerHTML = `<p><strong>${esc(c.referencia)}</strong><br>${esc(c.tienda)} · IMEI ${esc(c.imei)} · ${esc(c.fecha)}</p>
      <div class="price-comparison"><table><thead><tr><th>Concepto</th><th>Guardado en KORA</th><th>Recibido de Krediya</th><th>Diferencia</th></tr></thead><tbody>
      <tr><th>PVP</th><td>${amount(c.pvp_guardado)}</td><td>${amount(c.pvp_recibido)}</td><td>${delta(c.pvp_recibido,c.pvp_guardado)}</td></tr>
      <tr><th>Pagamos</th><td>${amount(c.pagamos_guardado)}</td><td>${c.pagamos_recibido == null ? 'No viene en el archivo' : money(c.pagamos_recibido)}</td><td>${delta(c.pagamos_recibido,c.pagamos_guardado)}</td></tr></tbody></table></div>
      <p class="price-rule">Tarifario: PVP de la columna PVP y Pagamos de la columna PAGAMOS. No se usa Precio sugerido. El valor de Krediya se compara; no reemplaza la tarifa sin una decisión.</p>
      <p>${c.pvp_guardado == null ? 'No se encontró una tarifa para esta referencia. No se sustituye por cero.' : 'Si Krediya reportó un error, puedes conservar el precio guardado y registrar el motivo.'}</p>
      <form id="priceDecisionForm"><label>Decisión<select class="control" id="priceDecision" required><option value="">Selecciona qué hacer</option><option value="aceptar_krediya">Aceptar el PVP recibido de Krediya</option><option value="conservar_guardado" ${c.pvp_guardado == null || c.pagamos_guardado == null ? 'disabled' : ''}>Conservar los valores guardados en KORA</option><option value="editar_operacion">Corregir valores de esta operación</option></select></label>
      <div class="price-fields"><label>PVP a aplicar<input class="control" id="decisionPvp" type="number" min="0.01" step="0.01" required disabled></label><label>Pagamos antes de inicial<input class="control" id="decisionPagamos" type="number" min="0.01" step="0.01" required value="${c.pagamos_guardado ?? ''}"></label></div>
      <p id="pricePayout" class="price-payout">Inicial del crédito: ${amount(c.inicial)}. Pago al aliado = Pagamos − inicial.</p>
      <p id="priceImpact" aria-live="polite">Selecciona una decisión para ver el impacto.</p>
      <label>Motivo de la decisión<textarea class="control" id="priceReason" required rows="2" maxlength="1000" placeholder="Ejemplo: diferencia confirmada o posible error de Krediya"></textarea></label>
      <p class="muted">Aplica únicamente a este crédito. Conserva el archivo original y no modifica el tarifario maestro. No autoriza ni registra pagos.</p>
      <div id="priceSaveError" class="error" role="alert"></div><div class="actions"><button class="btn primary" id="savePriceDecision" type="submit" disabled>Guardar decisión</button></div></form>`;
    const refresh = () => {
      const mode = $('priceDecision').value;
      const p = Number($('decisionPvp').value), paid = Number($('decisionPagamos').value);
      const known = c.bonos != null;
      const initial = Number(c.inicial ?? 0);
      $('pricePayout').textContent = paid>0 ? `Pago al aliado: ${money(paid)} − ${money(initial)} de inicial = ${money(paid-initial)}.` : `Inicial del crédito: ${money(initial)}. Falta Pagamos para calcular el giro.`;
      const bruto = p - paid - Number(c.bonos);
      const previous = c.pvp_guardado == null || c.pagamos_guardado == null || !known ? null : Number(c.pvp_guardado)-Number(c.pagamos_guardado)-Number(c.bonos);
      $('priceImpact').textContent = !(p>0 && paid>0) ? 'Falta PVP o Pagamos para calcular el impacto.' : !known ? 'La utilidad queda pendiente de resolver la vigencia de bonos. Los precios sí pueden guardarse.' : `Utilidad bruta (PVP − Pagamos − bonos): ${money(bruto)}.\nProvisión 28 %: ${money(Math.round(bruto*28)/100)}.\nUtilidad neta estimada: ${money(bruto-Math.round(bruto*28)/100)}.${previous == null ? '' : `\nCambio bruto frente al precio guardado: ${money(bruto-previous)}.`}`;
      $('savePriceDecision').disabled = !mode || !(p>0 && paid>0) || paid<initial || !$('priceReason').value.trim();
    };
    $('priceDecision').onchange = () => {
      const mode = $('priceDecision').value;
      $('decisionPvp').disabled = mode !== 'editar_operacion';
      $('decisionPagamos').disabled = mode === 'conservar_guardado';
      $('decisionPvp').value = mode === 'aceptar_krediya' ? c.pvp_recibido ?? '' : c.pvp_guardado ?? '';
      $('decisionPagamos').value = c.pagamos_guardado ?? c.pagamos_recibido ?? '';
      refresh();
    };
    ['decisionPvp','decisionPagamos','priceReason'].forEach((id) => { $(id).oninput = refresh; });
    $('priceDecisionForm').onsubmit = async (event) => {
      event.preventDefault(); $('savePriceDecision').disabled = true;
      const { error: saveError } = await sb.rpc('aliados_resolver_precio_krediya', { p_operation_id:operationId,p_decision:$('priceDecision').value,p_precio_venta:Number($('decisionPvp').value),p_pagamos:Number($('decisionPagamos').value),p_justificacion:$('priceReason').value.trim() });
      if (saveError) { $('priceSaveError').textContent = saveError.message; refresh(); return; }
      modal.classList.remove('show');
      const batchId = selected.id; await loadBatches(); await openDetail(batchId); await loadTab('incidents',operationId);
    };
    $('priceDecision').focus();
  }
  async function stateRpc(next, comment = null) {
    const batchId = selected.id;
    if (next === 'aprobada') $('approve').disabled = true;
    let data, error;
    try {
      ({ data, error } = await sb.rpc('aliados_cambiar_estado', { p_id: batchId, p_estado: next, p_comentario: comment }));
    } catch (failure) { error = failure; }
    const confirmed = Array.isArray(data) ? data[0] : data;
    if (!error && next === 'aprobada') {
      if (confirmed?.id !== batchId || !confirmed.approved_at) {
        error = {message:'No se recibió confirmación de aprobación. El lote sigue en pendientes; verifica su estado antes de intentarlo otra vez.'};
      } else {
        ++batchesRequest; // Una consulta anterior no puede restaurar la fila pendiente.
        batches = batches.map(batch => batch.id === batchId ? {...batch,...confirmed} : batch);
        if (selected?.id === batchId) { setListMode('pending'); $('detail').classList.add('hidden'); selected = null; }
        else renderBatches();
        $('lastUpdated').textContent = 'Liquidación aprobada. Disponible en historial y en las últimas aprobadas. Los pagos requieren autorización en Tesorería.';
        return;
      }
    }
    if (selected?.id !== batchId) return;
    if (error) {
      const approvalBlocked = next === 'aprobada' && /novedades.*bloquean/i.test(error.message || '');
      await openDetail(selected.id);
      if (selected?.id !== batchId) return;
      const errorMessage = document.createElement('p');
      errorMessage.textContent = approvalBlocked
        ? 'No se puede aprobar: existen novedades bloqueantes. Revisa el detalle de Novedades.'
        : (error.message || 'No fue posible completar la acción.');
      $('workflowError').prepend(errorMessage);
      $('workflowError').classList.remove('hidden');
      if (approvalBlocked) await loadTab('incidents');
      $('workflowError').scrollIntoView?.({behavior:'smooth',block:'center'});
      $('lastUpdated').textContent = 'La aprobación no se completó: ' + errorMessage.textContent;
      return;
    }
    const selectedId = selected.id;
    await loadBatches();
    selected = batches.find((batch) => batch.id === selectedId);
    if (next==='aprobada') {
      setListMode('pending');$('detail').classList.add('hidden');selected=null;return;
    }
    if (!selected || !statesForMode().includes(selected.estado)) {
      $('detail').classList.add('hidden');
      selected = null;
      return;
    }
    await openDetail(selectedId);
  }
  async function changePayment(id, next) {
    const result = next === 'programado'
      ? await sb.rpc('aliados_autorizar_pago', { p_id: id })
      : await sb.rpc('aliados_cambiar_estado_pago', { p_id: id, p_estado: next, p_soporte_path: null });
    const { error } = result;
    if (error) return alert(error.message);
    await loadTab('payments');
  }
  $('saveReview').onclick = async () => { const { error } = await sb.rpc('aliados_resolver_operaciones_propias', { p_liquidation_id: selected.id }); if (error) alert(error.message); else await loadTab('operations'); };
  $('addBankAccount').onclick = () => { location.href='aliados-tesoreria.html?vista=clientes'; };
  $('validate').onclick = async () => {
    if (selected.plataforma === 'krediya') {
      const { error } = await sb.rpc('aliados_sincronizar_precios_krediya', { p_id:selected.id });
      if (error) { $('workflowError').textContent = error.message; return; }
    }
    await stateRpc('validada');
  };
  $('calculate').onclick = async () => {
    const batchId=selected.id,krediya=selected.plataforma==='krediya';
    $('calculate').disabled=true;
    let calculationError;
    try {
      // El servidor prepara catálogo, bonos y cálculo en una sola transacción.
      const {error}=await sb.rpc(krediya?'krediya_calcular_y_enviar_aprobacion':'aliados_calcular_liquidacion',{p_id:batchId});
      if(error)throw error;
      await loadBatches();await openDetail(batchId);
      if(krediya && selected.estado==='revisada'){await loadTab('payments');$('detail').scrollIntoView({block:'start'});}
    } catch(error) {calculationError=error;}
    finally {updateActions();if(calculationError){$('workflowError').textContent=calculationError.message;$('workflowError').classList.remove('hidden');}}
  };
  $('review').onclick = () => stateRpc('revisada', 'Revisión administrativa completada por Maite');
  $('reject').onclick = () => stateRpc('con_novedades', prompt('Motivo para devolver a revisión:') || 'Requiere corrección');
  $('reportIssue').onclick = () => {
    const batchId=selected.id;
    const modal=Review.dialog('Agregar anotación al lote',`<p>${platformName(selected.plataforma)} · Corte ${esc(selected.fecha_corte)}. Para consultar una diferencia existente usa “Ver novedad” en la operación.</p><form><label>Anotación<textarea class="control" name="description" required minlength="5" maxlength="2000" placeholder="Describe únicamente un hecho nuevo que deba revisar Gestión y Gerencia."></textarea></label><p role="alert"></p><button class="btn primary" type="submit">Guardar anotación</button></form>`);
    modal.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;
      try{const {error}=await sb.rpc('aliados_reportar_novedad',{p_id:batchId,p_operation_id:null,p_descripcion:form.elements.description.value.trim()});if(error)throw error;modal.close();await loadBatches();await openDetail(batchId);await loadTab('incidents');}
      catch(error){form.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}
    };
  };
  $('approve').onclick = () => { const message = `Confirma la aprobación de ${platformName(selected.plataforma)}\nFecha de corte: ${UX.fechaCorta(selected.fecha_corte)}\nOperaciones de tiendas propias: ${selected.operaciones_tiendas || 0}\nOperaciones de aliados: ${selected.operaciones_aliados || 0}\nPago tiendas: ${money(selected.total_pago_tiendas)}\nPago aliados: ${money(selected.total_pago_aliados)}\nBonos: ${money(selected.total_bonos)}\nUtilidad total del negocio: ${money(businessUtility(selected))}\nTotal a girar: ${money(selected.total_pagar)}${selected.plataforma === 'krediya' ? '\n\nLas diferencias comerciales quedan en un único informe de 7 días y no modifican PAGAMOS.' : ''}`; if (confirm(message)) stateRpc('aprobada'); };
  document.querySelectorAll('[data-tab]').forEach((button) => { button.onclick = () => loadTab(button.dataset.tab); });
  document.querySelectorAll('[data-model]').forEach((button) => { button.onclick = () => { activeModel = button.dataset.model; document.querySelectorAll('[data-model]').forEach((item) => item.classList.toggle('active', item === button)); loadTab('operations'); }; });
  $('filterPlatform').onchange = loadBatches;
  $('filterState').onchange = renderBatches;
  $('filterSearch').oninput = renderBatches;
  const historyTools=document.createElement('div');historyTools.className='filters hidden';historyTools.id='historyTools';
  historyTools.innerHTML='<label>Desde<input class="control" type="date" id="historyFrom"></label><label>Hasta<input class="control" type="date" id="historyUntil"></label><button class="btn secondary" id="downloadHistory">Descargar rentabilidad</button>';
  $('filterPlatform').parentElement.appendChild(historyTools);
  $('historyFrom').onchange=renderBatches;$('historyUntil').onchange=renderBatches;
  $('downloadHistory').onclick=()=>{
    const from=$('historyFrom').value,to=$('historyUntil').value;
    const rows=batches.filter(b=>b.approved_at&&(!from||b.fecha_corte>=from)&&(!to||b.fecha_corte<=to));
    const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
    const csv=[['Plataforma','Corte','Estado liquidación','Pago aliados','Pago Retail','Bonos','Utilidad','Rentabilidad sobre base %','Estado utilidad'],...rows.map(b=>[platformName(b.plataforma),b.fecha_corte,'Aprobada',b.total_pago_aliados,b.total_pago_tiendas,b.total_bonos,businessUtility(b),Number(b.total_operaciones)>0?(100*businessUtility(b)/Number(b.total_operaciones)).toFixed(2):'',provisionalBatch(b)?'Provisional: falta bono de ejecutivo':'Definitiva'])].map(row=>row.map(cell).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='rentabilidad-liquidaciones.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('refreshBatches').onclick = loadBatches;
  function setListMode(mode) {
    listMode = mode;
    $('showPending').classList.toggle('active', mode === 'pending');
    $('showHistory').classList.toggle('active', mode === 'history');
    historyTools.classList.toggle('hidden',mode!=='history');
    updateStateFilter();
    $('detail').classList.add('hidden');
    selected = null;
    renderBatches();
  }
  $('showPending').onclick = () => setListMode('pending');
  $('showHistory').onclick = () => setListMode('history');

  $('newImport').onclick = () => $('importModal').classList.add('show');
  $('closeImport').onclick = () => { resetImportPreview(true); $('importModal').classList.remove('show'); };
  async function establishments() { const [{ data: origins }, { data: executives }] = await Promise.all([sb.from('origenes').select('codigo,nombre,tipo,ejecutivo_id,aliases').eq('activo', true), sb.from('ejecutivos').select('id,nombre').eq('activo', true)]); return (origins || []).map((origin) => ({ ...origin, aliases: [...(origin.aliases || []), origin.codigo], ejecutivo: (executives || []).find((item) => item.id === origin.ejecutivo_id) || null })); }
  $('validateImport').onclick = async () => { try { const file = $('file').files[0]; if (!file) throw new Error('Selecciona un archivo Excel.'); fileBuffer = await file.arrayBuffer(); const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true }); const platform = $('importPlatform').value; const sheet = platform === 'payjoy' ? (workbook.Sheets.Transacciones || workbook.Sheets[workbook.SheetNames[1]]) : (workbook.Sheets.Worksheet || workbook.Sheets[workbook.SheetNames[0]]); const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }); preview = platform === 'payjoy' ? D.importarPayjoy(rows, await establishments()) : D.importarAlo(rows, await establishments()); $('preview').classList.remove('hidden'); $('previewMetrics').innerHTML = `<div class="metric"><small>Filas fuente</small><strong>${preview.filasOriginales.length}</strong></div><div class="metric"><small>Operaciones</small><strong>${preview.operaciones.length}</strong></div><div class="metric"><small>Novedades</small><strong>${preview.incidencias.length}</strong></div>`; $('previewIssues').innerHTML = preview.incidencias.map((item) => `<tr><td>${esc(UX.traducirEstado(item.tipo))}</td><td>${esc(item.sourceKey)}</td></tr>`).join('') || '<tr><td colspan="2">Sin novedades estructurales.</td></tr>'; $('saveImport').disabled = false; $('importError').textContent = ''; } catch (error) { $('importError').textContent = error.message; $('saveImport').disabled = true; } };
  async function sha256(buffer) { const digest = await crypto.subtle.digest('SHA-256', buffer); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
  $('saveImport').onclick = async () => { const button = $('saveImport'); button.disabled = true; try { const file = $('file').files[0]; const key = crypto.randomUUID(); const extension = file.name.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx'; const path = `aliados/originales/${key}.${extension}`; const hash = await sha256(fileBuffer); const duplicate = await sb.from('liquidation_imported_files').select('id', { head: true, count: 'exact' }).eq('sha256', hash); if (duplicate.count) throw new Error('Este archivo ya fue importado.'); const upload = await sb.storage.from('soportes').upload(path, file, { contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false }); if (upload.error) throw upload.error; const rows = preview.operaciones.flatMap((operation) => operation.movimientos.map((movement) => ({ sheet: preview.sheetName || ($('importPlatform').value === 'payjoy' ? 'Transacciones' : 'Worksheet'), row_number: movement.fila, movement_type: movement.tipo, source_key: operation.sourceKey, original: movement.original }))); const { data: importedId, error } = await sb.rpc('aliados_importar_liquidacion', { p_plataforma: $('importPlatform').value, p_nombre: file.name, p_sha256: hash, p_storage_path: path, p_size: file.size, p_mime: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', p_periodo_desde: $('periodFrom').value || null, p_periodo_hasta: $('periodTo').value || null, p_fecha_corte: $('cutoff').value || null, p_rows: rows, p_operations: preview.operaciones, p_incidents: preview.incidencias, p_idempotency_key: key }); if (error) throw error; lastImportedBatch=importedId; $('importModal').classList.remove('show'); await loadBatches(); } catch (error) { $('importError').textContent = error.message; button.disabled = false; } };
  const validateLegacyImport = $('validateImport').onclick;
  $('validateImport').onclick = async () => {
    if ($('importPlatform').value !== 'krediya') return validateLegacyImport();
    try {
      const file = $('file').files[0];
      if (!file) throw new Error('Selecciona un archivo Excel.');
      fileBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type:'array', cellDates:true });
      const normalizeHeader = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      const candidates = workbook.SheetNames.map((name) => ({ name, sheet:workbook.Sheets[name] }));
      const selectedSheet = candidates.find(({ sheet }) => XLSX.utils.sheet_to_json(sheet, { header:1, defval:null, raw:true }).slice(0,30).some((row) => {
        const headers = row.map(normalizeHeader);
        const hasCredit = headers.some((item) => item === '# credito' || item === 'credito');
        const hasAmount = headers.includes('monto a financiar') || headers.includes('precio');
        return hasCredit && headers.includes('imei') && hasAmount;
      }));
      if (!selectedSheet) throw new Error(`No encontramos la tabla original de ventas de Krediya. Hojas revisadas: ${workbook.SheetNames.join(', ') || 'ninguna'}. Debe incluir Crédito, IMEI y Monto a Financiar o Precio.`);
      const rows = XLSX.utils.sheet_to_json(selectedSheet.sheet, { header:1, defval:null, raw:true });
      preview = D.importarKrediya(rows, await establishments());
      preview.sheetName = selectedSheet.name;
      $('preview').classList.remove('hidden');
      $('previewMetrics').innerHTML = `<div class="metric"><small>Filas fuente</small><strong>${preview.filasOriginales.length}</strong></div><div class="metric"><small>Operaciones</small><strong>${preview.operaciones.length}</strong></div><div class="metric"><small>Novedades</small><strong>${preview.incidencias.length}</strong></div>`;
      $('previewIssues').innerHTML = preview.incidencias.map((item) => `<tr><td>${esc(UX.traducirEstado(item.tipo))}</td><td>${esc(item.sourceKey)}</td></tr>`).join('') || '<tr><td colspan="2">Sin novedades estructurales.</td></tr>';
      $('saveImport').disabled = false;
      $('importError').textContent = '';
    } catch (error) {
      $('importError').textContent = error.message;
      $('saveImport').disabled = true;
    }
  };
  // Una vista previa nunca puede guardarse con otro archivo, plataforma o corte.
  let importRevision=0, validatedRevision=-1, importBusy=false;
  function resetImportPreview(clearFile=false){
    importRevision++;validatedRevision=-1;preview=null;fileBuffer=null;
    $('preview').classList.add('hidden');$('previewMetrics').innerHTML='';$('previewIssues').innerHTML='';
    $('saveImport').disabled=true;$('importError').textContent='';
    if(clearFile)$('file').value='';
  }
  const discard=document.createElement('button');
  discard.type='button';discard.id='discardImportFile';discard.className='btn secondary';discard.textContent='Descartar archivo';
  $('validateImport').before(discard);discard.onclick=()=>{if(!importBusy)resetImportPreview(true);};
  const importInputs=['file','importPlatform','cutoff','periodFrom','periodTo'];
  importInputs.forEach(id=>$(id).addEventListener('change',()=>resetImportPreview()));
  function lockImport(busy){
    importBusy=busy;
    [...importInputs,'validateImport','discardImportFile','closeImport'].forEach(id=>$(id).disabled=busy);
  }
  const validateCurrent=$('validateImport').onclick;
  $('validateImport').onclick=async()=>{
    if(importBusy)return;
    resetImportPreview();const revision=importRevision;lockImport(true);
    try{
      await validateCurrent();
      if(importRevision!==revision){resetImportPreview();return;}
      if(!preview?.operaciones?.length){
        $('saveImport').disabled=true;
        if(!$('importError').textContent)$('importError').textContent='El archivo no contiene operaciones para importar. Descártalo y selecciona el correcto.';
        return;
      }
      validatedRevision=revision;
    }finally{lockImport(false);}
  };
  const saveCurrent=$('saveImport').onclick;
  $('saveImport').onclick=async()=>{
    if(importBusy)return;
    if(validatedRevision!==importRevision || !preview?.operaciones?.length || !fileBuffer){
      $('importError').textContent='Valida el archivo seleccionado antes de guardar.';$('saveImport').disabled=true;return;
    }
    lockImport(true);
    try{
      lastImportedBatch=null;
      await saveCurrent();
      if(!$('importModal').classList.contains('show')){
        resetImportPreview(true);
        if(lastImportedBatch && $('importPlatform').value==='krediya'){
          // The report is already persisted by the import event; viewing it is optional.
          try{await openDetail(lastImportedBatch);await loadTab('differences');}
          catch{$('lastUpdated').textContent='Archivo importado. Consulta el informe desde Ver detalle; no es necesario volver a subirlo.';}
        }else if(selected)await askExecutives(selected.id);
      }
    }
    finally{lockImport(false);}
  };
  async function askExecutives(lotId){
    const [pending,execs]=await Promise.all([sb.rpc('tesoreria_pendientes_liquidacion',{p_lote:lotId}),sb.from('ejecutivos').select('id,nombre').eq('activo',true).order('nombre')]);
    if(pending.error||execs.error)return;
    const stores=[...new Map((pending.data||[]).filter(r=>r.falta_ejecutivo&&r.origen_codigo).map(r=>[r.origen_codigo,r])).values()];
    if(!stores.length)return;
    const modal=Review.dialog('Estas tiendas no tienen ejecutivo',`<form><div style="display:grid;gap:8px">${stores.map((r,i)=>`<label style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:center">${esc(r.comercio)}<select class="control" style="width:100%;min-width:0" name="store${i}"><option value="">Completar después</option>${(execs.data||[]).map(e=>`<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</select></label>`).join('')}</div><p role="alert"></p><div class="actions"><button class="btn primary" type="submit">Guardar y liquidar</button><button class="btn secondary" type="button" data-later>Completar después</button></div></form>`);
    modal.querySelector('[data-later]').onclick=async()=>{modal.close();await loadBatches();await openDetail(lotId);await $('calculate').onclick();};
    modal.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;form.querySelector('button').disabled=true;
      try{for(const [i,r] of stores.entries()){const chosen=form.elements['store'+i].value;if(!chosen)continue;const saved=await sb.rpc('tesoreria_asignar_ejecutivo',{p_origen:r.origen_codigo,p_anterior:r.ejecutivo_actual||null,p_ejecutivo:chosen});if(saved.error)throw saved.error;}
       modal.close();await loadBatches();await openDetail(lotId);await $('calculate').onclick();
      }catch(error){form.querySelector('[role=alert]').textContent=error.message;form.querySelector('button').disabled=false;}
    };
  }
}());
