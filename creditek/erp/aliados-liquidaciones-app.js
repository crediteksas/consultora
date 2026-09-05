(function () {
  'use strict';

  const D = CreditekAliadosLiquidaciones;
  const UX = CreditekAliadosUX;
  const Accounts = CreditekAliadosCuentas;
  let sb;
  let operator;
  let profile;
  let gestionKrediya;
  let batches = [];
  let selected;
  let activeTab = 'operations';
  let activeModel = 'all';
  let listMode = 'pending';
  let preview;
  let fileBuffer;
  let initialized = false;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = UX.formatoCOP;
  const platformName = (value) => value === 'alo' ? 'ALO Credit' : value === 'krediya' ? 'Krediya' : 'PayJoy';
  const state = (value) => `<span class="badge ${esc(value)}" title="${esc(UX.traducirEstado(value))}">${value === 'con_novedades' ? 'Revisar' : esc(UX.traducirEstado(value))}</span>`;
  const ownStoreUtility = (liquidation) => Number(liquidation.total_utilidad_tiendas || 0);
  const allyUtility = (liquidation) => Number(liquidation.total_utilidad_creditek || 0) - ownStoreUtility(liquidation);
  const businessUtility = (liquidation) => Number(liquidation.total_utilidad_creditek || 0);
  const awaitingKrediyaCalculation = (batch) => batch.plataforma === 'krediya' && ['importada','validada','con_novedades'].includes(batch.estado);

  const PENDING_STATES = ['importada', 'validada', 'con_novedades', 'calculada', 'revisada'];
  const HISTORY_STATES = ['aprobada', 'programada', 'pagada', 'conciliada', 'cerrada', 'anulada'];
  const isHistoricalBatch = (batch) => String(batch.fecha_corte || '') < '2026-09-01' || HISTORY_STATES.includes(batch.estado);

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
    gestionKrediya = CreditekKrediyaGestiones.create({ sb, userId:session.user.id, capability:operator.capacidad, money, onReport:()=>loadTab('management') });
    $('liquidationsContent').classList.remove('hidden');
    await loadBatches();
  }
  document.addEventListener('kora-sidebar-ready', enterFromKora);
  if (window.creditekSidebar?.sb) enterFromKora();

  async function loadBatches() {
    let query = sb.from('liquidations').select('*,liquidation_operations(id,reconocida,monto_credito,monto_base,inicial,tipo_establecimiento)').order('imported_at', { ascending: false });
    if ($('filterPlatform').value) query = query.eq('plataforma', $('filterPlatform').value);
    const { data, error } = await query;
    if (error) { $('batches').innerHTML = `<tr><td colspan="10">${esc(error.message)}</td></tr>`; return; }
    batches = data || [];
    $('showPending').textContent = `Pendientes (${batches.filter((batch) => !isHistoricalBatch(batch) && PENDING_STATES.includes(batch.estado)).length})`;
    $('showHistory').textContent = `Consultar historial (${batches.filter(isHistoricalBatch).length})`;
    $('lastUpdated').textContent = `Actualizado ${new Intl.DateTimeFormat('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date())}`;
    renderBatches();
  }

  function renderBatches() {
    const search = $('filterSearch').value.trim().toLowerCase();
    const stateFilter = $('filterState').value;
    const rows = batches.filter((b) => listMode === 'history' ? isHistoricalBatch(b) : !isHistoricalBatch(b) && PENDING_STATES.includes(b.estado))
      .filter((b) => !stateFilter || b.estado === stateFilter)
      .filter((b) => !search || b.plataforma.includes(search) || UX.traducirEstado(b.estado).toLowerCase().includes(search));
    $('batches').innerHTML = rows.map((b) => `<tr>
      <td>${UX.fechaAuditoria(b.imported_at)}</td><td>${platformName(b.plataforma)}</td><td>${UX.fechaCorta(b.fecha_corte)}</td>
      <td>${state(b.estado)}</td><td>${awaitingKrediyaCalculation(b) ? (b.liquidation_operations || []).filter((o) => o.reconocida).length : Number(b.operaciones_tiendas || 0) + Number(b.operaciones_aliados || 0)}</td>
      ${[b.total_pago_aliados,b.total_bonos,businessUtility(b),b.total_pagar].map((v) => `<td>${awaitingKrediyaCalculation(b) ? 'Por calcular' : money(v)}</td>`).join('')}
      <td><button class="btn secondary" data-open="${b.id}">Ver detalle</button></td></tr>`).join('') || `<tr><td colspan="10">${listMode === 'pending' ? 'No hay liquidaciones pendientes.' : 'No hay liquidaciones en el historial.'}</td></tr>`;
    document.querySelectorAll('[data-open]').forEach((button) => { button.onclick = () => openDetail(button.dataset.open); });
  }

  function updateActions() {
    const frozen = Boolean(selected.frozen_at);
    $('currentState').textContent = UX.traducirEstado(selected.estado);
    $('saveReview').classList.toggle('hidden', frozen);
    $('validate').disabled = !['importada', 'con_novedades'].includes(selected.estado);
    $('calculate').disabled = !['validada', 'calculada'].includes(selected.estado);
    $('review').disabled = selected.estado !== 'calculada';
    $('approve').disabled = operator.capacidad !== 'aprobador' || selected.estado !== 'revisada';
    $('reject').disabled = operator.capacidad !== 'aprobador' || !['calculada', 'revisada'].includes(selected.estado);
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
    if (awaitingKrediyaCalculation(selected)) {
      const known = (selected.liquidation_operations || []).filter((o) => o.reconocida);
      $('metrics').innerHTML = metrics('Datos importados · pagos y utilidad pendientes de calcular', [
        ['Operaciones reconocidas', known.length, true],
        ['Crédito financiado', known.reduce((n,o) => n + Number(o.monto_credito ?? o.monto_base ?? 0),0)],
        ['Iniciales', known.reduce((n,o) => n + Number(o.inicial || 0),0)],
        ['Tiendas propias / aliados', `${known.filter((o) => o.tipo_establecimiento === 'propia').length} / ${known.filter((o) => o.tipo_establecimiento === 'aliado').length}`, 'text']
      ]);
      return;
    }
    $('metrics').innerHTML = metrics('Resumen general', [
      ['Operaciones', Number(selected.operaciones_tiendas || 0) + Number(selected.operaciones_aliados || 0), true],
      ['Valor comercial', selected.total_operaciones], ['Pago total', Number(selected.total_pago_tiendas || 0) + Number(selected.total_pago_aliados || 0)], ['Bonos', selected.total_bonos], ['Utilidad total del negocio', businessUtility(selected)], ['Total a girar', selected.total_pagar]
    ]) + metrics('Operaciones originadas en tiendas propias', [
      ['Operaciones', selected.operaciones_tiendas, true], ['Pago neto a tiendas', selected.total_pago_tiendas], ['Utilidad del negocio', ownStoreUtility(selected)]
    ]) + metrics('Operaciones originadas en aliados', [
      ['Operaciones', selected.operaciones_aliados, true], ['Pago neto a aliados', selected.total_pago_aliados], ['Bonos', selected.total_bonos], ['Utilidad del negocio', allyUtility(selected)]
    ]);
  }

  async function openDetail(id) {
    selected = batches.find((batch) => batch.id === id) || selected;
    if (selected.plataforma === 'krediya' && !selected.frozen_at && ['importada','con_novedades','validada','calculada'].includes(selected.estado)) {
      const { error } = await sb.rpc('aliados_sincronizar_precios_krediya', { p_id:id });
      if (error) { alert('No se pudieron actualizar las diferencias de precios: ' + error.message); return; }
    }
    $('detail').classList.remove('hidden');
    $('detail').style.scrollMarginTop = '100px';
    $('detail').setAttribute('tabindex', '-1');
    $('detail').scrollIntoView({ behavior: 'instant', block: 'start' });
    $('detail').focus({ preventScroll: true });
    $('workflowError').classList.add('hidden');
    $('workflowError').textContent = '';
    $('detailTitle').textContent = `${platformName(selected.plataforma)} · ${UX.fechaCorta(selected.fecha_corte)}`;
    renderMetrics();
    updateActions();
    await loadTab(activeTab);
    const { data: openIssues, error: issueError } = await sb.from('liquidation_incidents').select('tipo,descripcion').eq('liquidation_id', id).eq('estado', 'abierta');
    if (issueError) {
      $('workflowError').textContent = 'No se pudieron consultar las novedades: ' + issueError.message;
      $('workflowError').classList.remove('hidden');
    } else if (openIssues?.length) {
      const groups = new Map();
      openIssues.forEach((i) => {
        const key = i.tipo === 'krediya_bono_sin_configurar' ? 'Bonos: revisar vigencia para la fecha de venta; los montos ya están definidos'
          : ['krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente'].includes(i.tipo) ? 'Precios: diferencias o referencias sin tarifa vigente. El detalle muestra los valores de cada crédito'
          : i.tipo.replaceAll('_',' ');
        groups.set(key, (groups.get(key) || 0) + 1);
      });
      $('workflowError').innerHTML = '<strong>Pendientes de este lote</strong><ul>' + [...groups].map(([label,count]) => `<li>${count} operaciones: ${esc(label)}</li>`).join('') + '</ul><button type="button" class="btn secondary" id="openBatchIssues">Ver y gestionar novedades</button>';
      $('workflowError').classList.remove('hidden');
      $('openBatchIssues').onclick = () => loadTab('incidents');
    }
  }

  async function loadOperations() {
    const operationFields = 'id,liquidation_id,plataforma,external_id,operation_at,establishment_name,origen_codigo,tipo_establecimiento,ejecutivo_id,cliente_documento,cliente_nombre,imei,referencia,modelo,monto_credito,monto_base,accesorios_cantidad,accesorios,inicial,reconocida,inicial_kora,diferencia_inicial,costo_equipo,pagamos,pago_neto_tienda,utilidad_tienda,utilidad_creditek_tienda,diferencia_justificacion,diferencia_revisada_at,valor_comercial,porcentaje_politica,pago_neto_beneficiario,bonos_aplicados,utilidad_creditek,liquidation_calculations(pagamos,pago_aliado,total_bonos,utilidad_creditek,policy_snapshot,explanation)';
    const { data, error } = await sb.from('liquidation_operations').select(operationFields).eq('liquidation_id', selected.id).order('operation_at');
    if (error) throw error;
    const rows = (data || []).filter((row) => activeModel === 'all' || row.tipo_establecimiento === activeModel);
    const { data: rowIssues, error: rowIssueError } = await sb.from('liquidation_incidents').select('operation_id,tipo,descripcion').eq('liquidation_id', selected.id).eq('estado','abierta');
    if (rowIssueError) throw rowIssueError;
    if (selected.plataforma === 'krediya') {
      const { data: contexts, error: contextError } = await sb.rpc('aliados_contextos_precios_krediya', { p_liquidation_id: selected.id });
      if (contextError) throw contextError;
      renderKrediyaOperations(rows, contexts || [], rowIssues || []);
      return;
    }
    renderStandardOperations(rows, rowIssues || []);
  }

  function renderStandardOperations(rows, rowIssues) {
    document.querySelector('#detail > .table-wrap')?.classList.add('operations-cards');
    $('detailHead').innerHTML = '';
    const metric = (label, value) => `<div><dt>${label}</dt><dd>${value == null ? '<span class="value-pending">No informado</span>' : `<strong class="operation-amount">${money(value)}</strong>`}</dd></div>`;
    $('detailBody').innerHTML = rows.map((row) => {
      const isOwn = row.tipo_establecimiento === 'propia';
      const future = String(row.operation_at || '').slice(0, 10) >= '2026-08-05';
      const difference = Number(row.diferencia_inicial || 0);
      const calculation = Array.isArray(row.liquidation_calculations) ? row.liquidation_calculations[0] : row.liquidation_calculations;
      const payField = isOwn && !future && operator.capacidad === 'aprobador' && !selected.frozen_at
        ? `<div class="actions"><input class="control" data-pagamos-input="${row.id}" inputmode="numeric" value="${Number(row.pagamos || 0)}" aria-label="Pagamos"><button class="btn secondary" data-save-pagamos="${row.id}">Guardar</button></div>`
        : money(row.pagamos ?? calculation?.pagamos);
      const commercial = row.valor_comercial ?? calculation?.explanation?.valor_comercial ?? calculation?.explanation?.base_liquidable;
      const percent = row.porcentaje_politica ?? calculation?.policy_snapshot?.porcentaje;
      const net = row.pago_neto_beneficiario ?? row.pago_neto_tienda ?? calculation?.pago_aliado;
      const bonuses = row.bonos_aplicados ?? calculation?.total_bonos;
      const utility = row.utilidad_creditek ?? (isOwn ? row.utilidad_creditek_tienda : null) ?? calculation?.utilidad_creditek;
      const actualIssues = (rowIssues || []).filter((i) => i.operation_id === row.id);
      const hasIssue = actualIssues.length || !row.reconocida || (isOwn && difference);
      const issueLabel = actualIssues.length ? [...new Set(actualIssues.map((i) => ['krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente'].includes(i.tipo) ? 'Revisar diferencia de precios' : i.tipo === 'krediya_bono_sin_configurar' ? 'Revisar vigencia de bonos' : i.descripcion || i.tipo))].join(' · ') : !row.reconocida ? 'Operación no reconocida' : isOwn && difference ? 'Diferencia por revisar' : 'Sin novedades';
      const inventoryOnly = actualIssues.length > 0 && actualIssues.every((i) => i.tipo === 'imei_no_resuelto') && row.reconocida && !difference;
      const issues = hasIssue ? `<aside class="operation-notice ${inventoryOnly ? 'operation-notice-info' : ''}" aria-label="Novedad de la operación"><div><strong>${inventoryOnly ? 'Equipo pendiente de registro en inventario' : 'Novedad por revisar'}</strong><p class="issue-summary">${inventoryOnly ? 'KORA no encontró este IMEI en el inventario de la tienda. Revisa su registro; este aviso no bloquea el pago.' : esc(issueLabel)}</p></div><button class="btn secondary" data-manage-issue="${row.id}">${inventoryOnly ? 'Revisar inventario' : 'Ver novedad'}</button></aside>` : '<p class="operation-clear">Sin novedades en esta operación</p>';
      return `<tr><td><article class="krediya-operation standard-operation" aria-label="${esc(row.establishment_name || 'Comercio no informado')}">
        <header class="operation-heading"><div><h3>${esc(row.establishment_name || 'Comercio no informado')}</h3><p>${esc(row.referencia || row.modelo || 'Referencia no informada')} · ${isOwn ? 'Tienda propia' : 'Aliado'}</p></div><span class="operation-status">Liquidación: ${state(selected.estado)}</span></header>
        <div class="operation-identity"><span>Cliente: ${esc(row.cliente_nombre || 'No informado')}</span><span class="operation-imei">IMEI: ${esc(row.imei || 'No informado')}</span><span>Venta: ${esc(String(row.operation_at || '').slice(0, 10) || 'No informada')}</span></div>
        <dl class="operation-values">${metric('Crédito financiado', row.monto_credito ?? row.monto_base)}${metric('Inicial', row.inicial)}${metric('Valor comercial', commercial)}<div><dt>Porcentaje aplicado</dt><dd><strong class="operation-amount">${percent == null ? 'No informado' : `${(Number(percent) * 100).toFixed(0)} %`}</strong></dd></div><div><dt>Pagamos</dt><dd class="operation-amount">${payField}</dd></div>${metric('Pago neto', net)}${metric('Bonos', bonuses)}${metric('Utilidad', utility)}</dl>
        ${isOwn ? `<details class="operation-reconciliation"><summary>Conciliación de la inicial</summary><dl class="operation-values">${metric('Inicial registrada en KORA', row.inicial_kora)}${metric('Diferencia de inicial', row.diferencia_inicial)}</dl></details>` : ''}
        ${issues}
      </article></td></tr>`;
    }).join('') || '<tr><td>Sin operaciones.</td></tr>';
    document.querySelectorAll('[data-save-pagamos]').forEach((button) => { button.onclick = () => savePagamos(button.dataset.savePagamos); });
    document.querySelectorAll('[data-manage-issue]').forEach((button) => { button.onclick = () => loadTab('incidents', button.dataset.manageIssue); });
  }

  function renderKrediyaOperations(rows, contexts, incidents) {
    const contextById = new Map(contexts.map((c) => [c.operation_id, c]));
    const amount = (value, missing = 'Sin tarifa vinculada') => value == null ? `<span class="value-pending">${missing}</span>` : `<strong class="operation-amount">${money(value)}</strong>`;
    const metric = (label, value, missing) => `<div><dt>${label}</dt><dd>${amount(value, missing)}</dd></div>`;
    document.querySelector('#detail > .table-wrap')?.classList.add('operations-cards');
    $('detailHead').innerHTML = '';
    $('detailBody').innerHTML = rows.map((row) => {
      const c = contextById.get(row.id) || {};
      const calc = Array.isArray(row.liquidation_calculations) ? row.liquidation_calculations[0] : row.liquidation_calculations;
      // Persisted calculations remain authoritative; a live tariff is only a preview.
      const calculated = Boolean(calc);
      const pvp = calculated ? (calc.explanation?.valor_comercial ?? calc.explanation?.base_liquidable ?? row.valor_comercial) : (c.decision?.precio_venta ?? c.pvp_guardado);
      const paid = calculated ? calc.pagamos : (c.decision?.pagamos ?? c.pagamos_guardado);
      const net = calculated ? calc.pago_aliado : paid == null || !row.reconocida ? null : Number(paid) - Number(row.inicial || 0);
      const openIssues = incidents.filter((i) => i.operation_id === row.id);
      const priceIssue = openIssues.some((i) => ['krediya_regla_precio_ausente','krediya_precio_venta_diferente','krediya_pagamos_diferente'].includes(i.tipo));
      const delta = c.diferencia_pvp;
      const note = !row.reconocida ? 'Excluida del cálculo. Consulta su novedad.'
        : priceIssue && paid == null ? 'La referencia no está vinculada a una tarifa. No significa que Pagamos sea $0.'
        : priceIssue && pvp == null ? 'Pagamos está respaldado en el manual, pero su PVP está vacío o en cero. Falta resolver únicamente el PVP.'
        : priceIssue ? `Pagamos sí está registrado. ${delta != null && Number(delta) !== 0 ? `El PVP recibido difiere ${money(delta)} del guardado.` : 'Existe una diferencia pendiente de revisión.'}`
        : calculated ? 'Valores calculados de esta operación.' : 'Datos disponibles. Liquidación pendiente de calcular.';
      const priceAction = priceIssue && !selected.frozen_at && row.reconocida
        ? `<button class="btn secondary" data-edit-operation-price="${row.id}">Comparar y editar precios</button>`
        : openIssues.length ? `<button class="btn secondary" data-manage-issue="${row.id}">Ver novedad</button>` : '';
      const instructionAction = typeof operator !== 'undefined' && operator?.capacidad === 'aprobador' && !selected.frozen_at && row.reconocida
        ? `<button class="btn primary" data-instruct-krediya="${row.id}">Dar instrucción a Maythe</button>` : '';
      return `<tr><td><article class="krediya-operation" aria-label="${esc(row.referencia || row.modelo || 'Referencia no informada')}">
        <header class="operation-heading"><div><h3>${esc(row.referencia || row.modelo || 'Referencia no informada')}</h3><p>${esc(row.establishment_name)} · ${row.tipo_establecimiento === 'propia' ? 'Tienda propia' : 'Aliado'}</p></div><span class="operation-status">${!row.reconocida ? 'Excluida' : calculated ? 'Calculada' : 'Sin calcular'}</span></header>
        <div class="operation-identity"><span>Cliente: ${esc(row.cliente_nombre || 'No informado')}</span><span class="operation-imei">IMEI: ${esc(row.imei || 'No informado')}</span><span>Venta: ${esc(c.fecha || String(row.operation_at || '').slice(0,10))}</span></div>
        <dl class="operation-values">${metric(calculated ? 'PVP liquidado' : c.decision ? 'PVP decidido' : 'PVP guardado', pvp)}${metric('PVP recibido de Krediya', c.pvp_recibido, 'No informado')}${metric('Pagamos antes de inicial', paid)}${metric('Inicial', row.inicial, 'No informada')}${metric(calculated ? 'Pago neto liquidado' : 'Pagamos − inicial · estimado', net, row.reconocida ? 'Pendiente de tarifa' : 'No aplica: operación excluida')}${metric('Crédito financiado', row.monto_credito ?? row.monto_base, 'No informado')}</dl>
        <div class="operation-totals"><span>Bonos ${calculated ? 'liquidados' : 'configurados'}: ${amount(calculated ? calc.total_bonos : c.bonos, 'No aplica')}</span><span>Utilidad: ${amount(calculated ? calc.utilidad_creditek : null, 'Pendiente de calcular')}</span></div>
        <footer class="operation-footer"><p>${esc(note)}${!calculated && paid != null && row.reconocida ? ' El giro es estimado; no es un pago autorizado.' : ''}</p><div class="operation-actions">${instructionAction}${priceAction}</div></footer>
      </article></td></tr>`;
    }).join('') || '<tr><td>Sin operaciones.</td></tr>';
    document.querySelectorAll('[data-edit-operation-price]').forEach((button) => { button.onclick = () => openPriceEditor(button.dataset.editOperationPrice); });
    document.querySelectorAll('[data-instruct-krediya]').forEach((button) => { button.onclick = () => gestionKrediya.open(button.dataset.instructKrediya); });
    document.querySelectorAll('[data-manage-issue]').forEach((button) => { button.onclick = () => loadTab('incidents', button.dataset.manageIssue); });
  }

  async function loadIncidents(focusOperationId) {
    const { data, error } = await sb.from('liquidation_incidents').select('*,liquidation_operations(establishment_name,imei,referencia,modelo)').eq('liquidation_id', selected.id).order('created_at');
    if (error) throw error;
    const pending = (data || []).filter((item) => item.estado === 'abierta');
    const history = (data || []).filter((item) => item.estado !== 'abierta');
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
        const title = bonus ? 'Validación de bonos Krediya' : price ? 'Precio de venta y Pagamos' : UX.traducirEstado(item.tipo);
        const explanation = bonus ? (item.estado === 'abierta' ? 'No se encontró una regla de bonos aplicable. Configuración esperada: gestión Maythe $5.000 y operación Oscar $15.000. Requiere corregir la configuración, no confirmar el bono de cada venta.' : 'Gestión Maythe $5.000 y operación Oscar $15.000. Configuración corregida; no requiere ninguna acción.') : item.descripcion;
        const action = item.estado === 'abierta' && !selected.frozen_at && !bonus ? `<button class="btn secondary" data-resolve="${item.id}" data-operation="${item.operation_id || ''}" data-incident-type="${esc(item.tipo)}">${price ? 'Revisar precios' : 'Revisar y justificar'}</button>` : '';
        return `<article class="incident-card"><div><strong>${esc(title)}</strong> · ${state(item.estado)}<p><strong>${esc(item.liquidation_operations?.referencia || item.liquidation_operations?.modelo || '')}</strong></p><p>${esc(item.liquidation_operations?.establishment_name || 'General')} · IMEI ${esc(item.liquidation_operations?.imei || '—')}</p><p>${esc(explanation)}</p>${item.resolution ? `<p>Resolución: ${esc(item.resolution)}</p>` : ''}</div>${action}</article>`;
      }).join('') || '<p>No hay novedades en esta vista.</p>'}<div class="incident-toolbar"><button class="btn secondary" id="previousIssues" ${page === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${page + 1} de ${pages} · ${visible.length} novedades</span><button class="btn secondary" id="nextIssues" ${page + 1 >= pages ? 'disabled' : ''}>Siguiente</button></div></td></tr>`;
      $('pendingIssues').onclick = () => { showHistory = false; page = 0; render(); };
      $('historyIssues').onclick = () => { showHistory = true; page = 0; render(); };
      if ($('allIssues')) $('allIssues').onclick = () => { focusOperationId = null; page = 0; render(); };
      $('previousIssues').onclick = () => { page--; render(); };
      $('nextIssues').onclick = () => { page++; render(); };
      document.querySelectorAll('[data-resolve]').forEach((button) => { button.onclick = () => resolveIncident(button.dataset.resolve, button.dataset.operation, button.dataset.incidentType); });
      document.querySelector('.incident-toolbar')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    render();
  }

  async function loadPayments() {
    const { data, error } = await sb.from('payment_orders').select('id,valor,estado,fecha_programada,fecha_pagada,soporte_path,liquidation_beneficiaries(nombre,tipo,origen_codigo),beneficiary_bank_accounts(numero_cuenta),payment_items(concepto)').eq('liquidation_id', selected.id);
    if (error) throw error;
    $('detailHead').innerHTML = '<tr><th>Beneficiario</th><th>Tipo</th><th>Aliado o sede</th><th>Concepto</th><th>Cuenta bancaria</th><th>Valor</th><th>Estado</th><th>Fecha programada</th><th>Fecha de pago</th><th>Soporte</th><th>Acción</th></tr>';
    $('detailBody').innerHTML = (data || []).map((payment) => {
      const beneficiary = payment.liquidation_beneficiaries || {};
      const canApprove = payment.estado === 'pendiente' && operator.capacidad === 'aprobador' && Boolean(selected.frozen_at) && selected.estado === 'aprobada';
      const action = canApprove
        ? `<button class="btn secondary" data-payment="${payment.id}" data-next="programado">Autorizar pago</button>`
        : payment.estado === 'programado' || payment.estado === 'pagado'
          ? '<a class="btn secondary" href="aliados-tesoreria.html">Continuar en Tesorería</a>'
          : !selected.frozen_at ? 'Primero: revisión de Maite y aprobación de Gerencia' : '—';
      return `<tr><td>${esc(beneficiary.nombre || 'Sin nombre')}</td><td>${esc(UX.traducirEstado(beneficiary.tipo || 'otro'))}</td><td>${esc(beneficiary.origen_codigo || '—')}</td><td>${esc((payment.payment_items || []).map((item) => UX.traducirEstado(item.concepto)).join(', ') || 'Liquidación')}</td><td>${esc(UX.cuentaTerminadaEn(payment.beneficiary_bank_accounts?.numero_cuenta))}</td><td>${money(payment.valor)}</td><td>${state(payment.estado)}</td><td>${payment.fecha_programada ? UX.fechaCorta(payment.fecha_programada) : 'Pendiente de aprobación'}</td><td>${payment.fecha_pagada ? UX.fechaCorta(payment.fecha_pagada) : 'Pendiente de soporte'}</td><td>${payment.soporte_path ? 'Adjunto' : 'Sin soporte'}</td><td>${action}</td></tr>`;
    }).join('') || '<tr><td colspan="11">Sin pagos.</td></tr>';
    document.querySelectorAll('[data-payment]').forEach((button) => { button.onclick = () => changePayment(button.dataset.payment, button.dataset.next); });
  }

  async function loadAudit() {
    const { data, error } = await sb.from('audit_log').select('accion,usuario,created_at,detalle,perfiles:usuario(nombre,rol)').eq('tabla', 'liquidations').eq('registro_id', selected.id).order('created_at', { ascending: false });
    if (error) throw error;
    $('detailHead').innerHTML = '<tr><th>Acción</th><th>Realizada por</th><th>Fecha</th><th>Descripción</th><th>Resultado</th></tr>';
    $('detailBody').innerHTML = (data || []).map((item) => {
      const readable = UX.describirAuditoria(item.accion, item.detalle, item.perfiles?.nombre || 'Usuario KORA');
      return `<tr><td>${esc(readable.accion)}</td><td>${esc(item.perfiles?.nombre || 'Usuario KORA')}${item.perfiles?.rol ? ` — ${esc(UX.traducirEstado(item.perfiles.rol))}` : ''}</td><td>${UX.fechaAuditoria(item.created_at)}</td><td>${esc(readable.descripcion)}</td><td>${esc(readable.resultado)}<details><summary>Ver detalle técnico</summary><pre>${esc(UX.detalleTecnico(item.detalle))}</pre></details></td></tr>`;
    }).join('') || '<tr><td colspan="5">Sin registros de auditoría.</td></tr>';
  }

  async function loadGrouped(kind) {
    const { data, error } = await sb.from('liquidation_operations').select('*').eq('liquidation_id', selected.id).eq('tipo_establecimiento', 'aliado');
    if (error) throw error;
    const executiveNames = new Map();
    if (kind === 'executives') {
      const { data: executives, error: executivesError } = await sb.from('ejecutivos').select('id,nombre');
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
    activeTab = tab;
    if (typeof gestionKrediya !== 'undefined') gestionKrediya?.cancelReport();
    document.querySelector('#detail > .table-wrap')?.classList.remove('operations-cards');
    document.querySelector('#detail > .table-wrap')?.classList.toggle('operations-table', tab === 'operations');
    document.querySelector('#detail > .table-wrap')?.classList.toggle('incidents-table', tab === 'incidents');
    document.querySelector('#detail > .table-wrap')?.classList.toggle('grouped-cards', tab === 'allies' || tab === 'executives' || tab === 'management');
    document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    try {
      if (tab === 'operations') await loadOperations();
      else if (tab === 'incidents') await loadIncidents(focusOperationId);
      else if (tab === 'payments') await loadPayments();
      else if (tab === 'audit') await loadAudit();
      else if (tab === 'management') {
        $('detailHead').innerHTML = '';
        $('detailBody').innerHTML = '<tr><td><div id="krediyaManagementReport"></div></td></tr>';
        await gestionKrediya.renderReport($('krediyaManagementReport'), selected.id);
      }
      else await loadGrouped(tab);
    } catch (error) { $('detailBody').innerHTML = `<tr><td>${esc(error.message)}</td></tr>`; }
  }

  async function savePagamos(id) {
    const value = Number(document.querySelector(`[data-pagamos-input="${id}"]`).value.replace(/[^0-9.-]/g, ''));
    const { error } = await sb.rpc('aliados_guardar_pagamos', { p_operation_id: id, p_pagamos: value });
    if (error) return alert(error.message);
    await loadTab('operations');
  }
  async function resolveIncident(id, operationId, incidentType) {
    if (selected.plataforma === 'krediya' && incidentType?.startsWith('krediya_')) {
      if (incidentType === 'krediya_bono_sin_configurar') return;
      await openPriceEditor(operationId);
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
    const { error } = await sb.rpc('aliados_cambiar_estado', { p_id: selected.id, p_estado: next, p_comentario: comment });
    if (error) {
      const approvalBlocked = next === 'aprobada' && /novedades.*bloquean/i.test(error.message || '');
      $('workflowError').textContent = approvalBlocked
        ? 'No se puede aprobar: existen novedades bloqueantes. Revisa la pestaña Novedades y corrige o justifica cada operación antes de volver a aprobar.'
        : (error.message || 'No fue posible completar la acción.');
      $('workflowError').classList.remove('hidden');
      if (approvalBlocked) await loadTab('incidents');
      return;
    }
    const selectedId = selected.id;
    await loadBatches();
    selected = batches.find((batch) => batch.id === selectedId);
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
  async function loadBankBeneficiaries() {
    const [{ data: beneficiaries, error: beneficiariesError }, { data: allies, error: alliesError }] = await Promise.all([
      sb.from('liquidation_beneficiaries').select('id,nombre,tipo,origen_codigo').eq('activo', true).order('nombre'),
      sb.from('origenes').select('codigo,nombre').eq('activo', true).eq('tipo', 'aliado').order('nombre')
    ]);
    if (beneficiariesError || alliesError) throw beneficiariesError || alliesError;
    $('bankBeneficiary').innerHTML = '<option value="">Selecciona un beneficiario</option>' + (beneficiaries || []).map(b => `<option value="${b.id}">${esc(b.nombre)} (${esc(b.tipo)})</option>`).join('');
    $('bankAllyOrigin').innerHTML = '<option value="">Selecciona un aliado</option>' + (allies || []).map(a => `<option value="${esc(a.codigo)}">${esc(a.nombre)} · ${esc(a.codigo)}</option>`).join('');
  }
  function updateBankBeneficiaryMode() {
    const isNew = $('bankBeneficiaryMode').value === 'new';
    $('bankExistingField').classList.toggle('hidden', isNew);
    $('bankNewBeneficiaryFields').classList.toggle('hidden', !isNew);
  }
  $('bankBeneficiaryMode').onchange = updateBankBeneficiaryMode;
  $('addBankAccount').onclick = async () => {
    $('bankError').textContent = '';
    $('bankBeneficiaryMode').value = 'existing';
    updateBankBeneficiaryMode();
    try { await loadBankBeneficiaries(); $('bankAccountModal').classList.add('show'); }
    catch (error) { alert(`No fue posible cargar los beneficiarios: ${error.message}`); }
  };
  $('closeBankAccount').onclick = () => $('bankAccountModal').classList.remove('show');
  $('saveBankAccount').onclick = async () => {
    const isNew = $('bankBeneficiaryMode').value === 'new';
    let beneficiary_id = $('bankBeneficiary').value;
    let error;
    $('bankError').textContent = '';
    $('saveBankAccount').disabled = true;
    if (isNew) {
      const validation = Accounts.validateNewBeneficiary({ originCode: $('bankAllyOrigin').value, name: $('bankHolderName').value, identification: $('bankHolderIdentification').value, bank: $('bankBanco').value, accountType: $('bankTipo').value, accountNumber: $('bankNumero').value });
      if (!validation.ok) { $('bankError').textContent = validation.errors[0]; $('saveBankAccount').disabled = false; return; }
      const result = await sb.rpc('aliados_crear_tercero_con_cuenta', {
        p_origen_codigo: validation.value.originCode, p_identificacion: validation.value.identification,
        p_nombre: validation.value.name, p_banco: validation.value.bank,
        p_tipo_cuenta: validation.value.accountType, p_numero_cuenta: validation.value.accountNumber
      });
      error = result.error;
      beneficiary_id = result.data?.beneficiary_id;
    } else {
      const banco = Accounts.clean($('bankBanco').value), tipo_cuenta = $('bankTipo').value, numero_cuenta = Accounts.digits($('bankNumero').value);
      if (!beneficiary_id || !banco || numero_cuenta.length < 5) { $('bankError').textContent = 'Selecciona el beneficiario y completa los datos de la cuenta.'; $('saveBankAccount').disabled = false; return; }
      ({ error } = await sb.rpc('aliados_guardar_cuenta_bancaria', { p_beneficiary_id: beneficiary_id, p_banco: banco, p_tipo_cuenta: tipo_cuenta, p_numero_cuenta: numero_cuenta, p_validar: true }));
    }
    $('saveBankAccount').disabled = false;
    if (error) { $('bankError').textContent = error.message; return; }
    const { data: completados } = await sb.rpc('aliados_completar_pagos_beneficiario', { p_beneficiary_id: beneficiary_id });
    $('bankAccountModal').classList.remove('show');
    alert(`Cuenta guardada y validada.${completados ? ` ${completados} pago(s) pendiente(s) completado(s) automáticamente.` : ''}`);
    if (selected) await openDetail(selected.id);
  };
  $('validate').onclick = async () => {
    if (selected.plataforma === 'krediya') {
      const { error } = await sb.rpc('aliados_sincronizar_precios_krediya', { p_id:selected.id });
      if (error) { $('workflowError').textContent = error.message; return; }
    }
    await stateRpc('validada');
  };
  $('calculate').onclick = async () => { if (selected.plataforma !== 'krediya') { const bonuses = await sb.rpc('aliados_calcular_bonos_ejecutivos', { p_liquidation_id: selected.id }); if (bonuses.error) return alert(bonuses.error.message); } const rpc = selected.plataforma === 'krediya' ? 'aliados_calcular_liquidacion_krediya' : 'aliados_calcular_liquidacion'; const { error } = await sb.rpc(rpc, { p_id: selected.id }); if (error) alert(error.message); else { await loadBatches(); await openDetail(selected.id); } };
  $('review').onclick = () => stateRpc('revisada', 'Revisión administrativa completada por Maite');
  $('reject').onclick = () => stateRpc('con_novedades', prompt('Motivo para devolver a revisión:') || 'Requiere corrección');
  $('reportIssue').onclick = async () => { const description = prompt('Describe la novedad:'); if (!description?.trim()) return; const { error } = await sb.rpc('aliados_reportar_novedad', { p_id: selected.id, p_operation_id: null, p_descripcion: description.trim() }); if (error) alert(error.message); else loadTab('incidents'); };
  $('approve').onclick = () => { const message = `Confirma la aprobación de ${selected.plataforma === 'alo' ? 'ALO Credit' : 'PayJoy'}\nFecha de corte: ${UX.fechaCorta(selected.fecha_corte)}\nOperaciones de tiendas propias: ${selected.operaciones_tiendas || 0}\nOperaciones de aliados: ${selected.operaciones_aliados || 0}\nPago tiendas: ${money(selected.total_pago_tiendas)}\nPago aliados: ${money(selected.total_pago_aliados)}\nBonos: ${money(selected.total_bonos)}\nUtilidad total del negocio: ${money(businessUtility(selected))}\nTotal a girar: ${money(selected.total_pagar)}`; if (confirm(message)) stateRpc('aprobada'); };
  document.querySelectorAll('[data-tab]').forEach((button) => { button.onclick = () => loadTab(button.dataset.tab); });
  document.querySelectorAll('[data-model]').forEach((button) => { button.onclick = () => { activeModel = button.dataset.model; document.querySelectorAll('[data-model]').forEach((item) => item.classList.toggle('active', item === button)); loadTab('operations'); }; });
  $('filterPlatform').onchange = loadBatches;
  $('filterState').onchange = renderBatches;
  $('filterSearch').oninput = renderBatches;
  $('refreshBatches').onclick = loadBatches;
  function setListMode(mode) {
    listMode = mode;
    $('showPending').classList.toggle('active', mode === 'pending');
    $('showHistory').classList.toggle('active', mode === 'history');
    updateStateFilter();
    $('detail').classList.add('hidden');
    selected = null;
    renderBatches();
  }
  $('showPending').onclick = () => setListMode('pending');
  $('showHistory').onclick = () => setListMode('history');

  $('newImport').onclick = () => $('importModal').classList.add('show');
  $('closeImport').onclick = () => $('importModal').classList.remove('show');
  async function establishments() { const [{ data: origins }, { data: executives }] = await Promise.all([sb.from('origenes').select('codigo,nombre,tipo,ejecutivo_id,aliases').eq('activo', true), sb.from('ejecutivos').select('id,nombre').eq('activo', true)]); return (origins || []).map((origin) => ({ ...origin, aliases: [...(origin.aliases || []), origin.codigo], ejecutivo: (executives || []).find((item) => item.id === origin.ejecutivo_id) || null })); }
  $('validateImport').onclick = async () => { try { const file = $('file').files[0]; if (!file) throw new Error('Selecciona un archivo Excel.'); fileBuffer = await file.arrayBuffer(); const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true }); const platform = $('importPlatform').value; const sheet = platform === 'payjoy' ? (workbook.Sheets.Transacciones || workbook.Sheets[workbook.SheetNames[1]]) : (workbook.Sheets.Worksheet || workbook.Sheets[workbook.SheetNames[0]]); const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }); preview = platform === 'payjoy' ? D.importarPayjoy(rows, await establishments()) : D.importarAlo(rows, await establishments()); $('preview').classList.remove('hidden'); $('previewMetrics').innerHTML = `<div class="metric"><small>Filas fuente</small><strong>${preview.filasOriginales.length}</strong></div><div class="metric"><small>Operaciones</small><strong>${preview.operaciones.length}</strong></div><div class="metric"><small>Novedades</small><strong>${preview.incidencias.length}</strong></div>`; $('previewIssues').innerHTML = preview.incidencias.map((item) => `<tr><td>${esc(UX.traducirEstado(item.tipo))}</td><td>${esc(item.sourceKey)}</td></tr>`).join('') || '<tr><td colspan="2">Sin novedades estructurales.</td></tr>'; $('saveImport').disabled = false; $('importError').textContent = ''; } catch (error) { $('importError').textContent = error.message; $('saveImport').disabled = true; } };
  async function sha256(buffer) { const digest = await crypto.subtle.digest('SHA-256', buffer); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
  $('saveImport').onclick = async () => { const button = $('saveImport'); button.disabled = true; try { const file = $('file').files[0]; const key = crypto.randomUUID(); const extension = file.name.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx'; const path = `aliados/originales/${key}.${extension}`; const hash = await sha256(fileBuffer); const duplicate = await sb.from('liquidation_imported_files').select('id', { head: true, count: 'exact' }).eq('sha256', hash); if (duplicate.count) throw new Error('Este archivo ya fue importado.'); const upload = await sb.storage.from('soportes').upload(path, file, { contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false }); if (upload.error) throw upload.error; const rows = preview.operaciones.flatMap((operation) => operation.movimientos.map((movement) => ({ sheet: preview.sheetName || ($('importPlatform').value === 'payjoy' ? 'Transacciones' : 'Worksheet'), row_number: movement.fila, movement_type: movement.tipo, source_key: operation.sourceKey, original: movement.original }))); const { error } = await sb.rpc('aliados_importar_liquidacion', { p_plataforma: $('importPlatform').value, p_nombre: file.name, p_sha256: hash, p_storage_path: path, p_size: file.size, p_mime: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', p_periodo_desde: $('periodFrom').value || null, p_periodo_hasta: $('periodTo').value || null, p_fecha_corte: $('cutoff').value || null, p_rows: rows, p_operations: preview.operaciones, p_incidents: preview.incidencias, p_idempotency_key: key }); if (error) throw error; $('importModal').classList.remove('show'); await loadBatches(); } catch (error) { $('importError').textContent = error.message; button.disabled = false; } };
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
}());
