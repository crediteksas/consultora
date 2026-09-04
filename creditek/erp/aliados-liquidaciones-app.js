(function () {
  'use strict';

  const D = CreditekAliadosLiquidaciones;
  const UX = CreditekAliadosUX;
  const Accounts = CreditekAliadosCuentas;
  let sb;
  let operator;
  let profile;
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
  const state = (value) => `<span class="badge ${esc(value)}">${esc(UX.traducirEstado(value))}</span>`;
  const ownStoreUtility = (liquidation) => Number(liquidation.total_utilidad_tiendas || 0);
  const allyUtility = (liquidation) => Number(liquidation.total_utilidad_creditek || 0) - ownStoreUtility(liquidation);
  const businessUtility = (liquidation) => Number(liquidation.total_utilidad_creditek || 0);

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
    $('liquidationsContent').classList.remove('hidden');
    await loadBatches();
  }
  document.addEventListener('kora-sidebar-ready', enterFromKora);
  if (window.creditekSidebar?.sb) enterFromKora();

  async function loadBatches() {
    let query = sb.from('liquidations').select('*').order('imported_at', { ascending: false });
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
      <td>${state(b.estado)}</td><td>${Number(b.operaciones_tiendas || 0) + Number(b.operaciones_aliados || 0)}</td>
      <td>${money(b.total_pago_aliados)}</td><td>${money(b.total_bonos)}</td><td>${money(businessUtility(b))}</td><td>${money(b.total_pagar)}</td>
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
    $('detail').classList.remove('hidden');
    $('workflowError').classList.add('hidden');
    $('workflowError').textContent = '';
    $('detailTitle').textContent = `${platformName(selected.plataforma)} · ${UX.fechaCorta(selected.fecha_corte)}`;
    renderMetrics();
    updateActions();
    await loadTab(activeTab);
  }

  async function loadOperations() {
    const operationFields = 'id,liquidation_id,plataforma,external_id,operation_at,establishment_name,origen_codigo,tipo_establecimiento,ejecutivo_id,cliente_documento,cliente_nombre,imei,referencia,modelo,monto_credito,monto_base,accesorios_cantidad,accesorios,inicial,reconocida,inicial_kora,diferencia_inicial,costo_equipo,pagamos,pago_neto_tienda,utilidad_tienda,utilidad_creditek_tienda,diferencia_justificacion,diferencia_revisada_at,valor_comercial,porcentaje_politica,pago_neto_beneficiario,bonos_aplicados,utilidad_creditek,liquidation_calculations(pagamos,pago_aliado,total_bonos,utilidad_creditek,policy_snapshot,explanation)';
    const { data, error } = await sb.from('liquidation_operations').select(operationFields).eq('liquidation_id', selected.id).order('operation_at');
    if (error) throw error;
    const rows = (data || []).filter((row) => activeModel === 'all' || row.tipo_establecimiento === activeModel);
    const headers = ['Tipo de operación', 'Beneficiario', 'Cliente', 'IMEI', 'Valor crédito', 'Inicial plataforma', 'Inicial KORA', 'Diferencia de inicial', 'Valor comercial', 'Porcentaje aplicado', 'Pagamos', 'Pago neto', 'Bonos', 'Utilidad Creditek', 'Estado', 'Novedades'];
    $('detailHead').innerHTML = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
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
      const issues = !row.reconocida ? '<span class="badge con_novedades">Operación no reconocida</span>' : isOwn && difference ? '<span class="badge con_novedades">Diferencia por revisar</span>' : 'Sin novedades';
      return `<tr><td>${isOwn ? 'Tienda propia' : 'Aliado'}</td><td>${esc(row.establishment_name)}</td><td>${esc(row.cliente_nombre || '—')}</td><td>${esc(row.imei || '—')}</td><td>${money(row.monto_credito ?? row.monto_base)}</td><td>${money(row.inicial)}</td><td>${isOwn ? money(row.inicial_kora) : 'No aplica'}</td><td>${isOwn ? money(difference) : 'No aplica'}</td><td>${money(commercial)}</td><td>${percent == null ? '—' : `${(Number(percent) * 100).toFixed(0)} %`}</td><td>${payField}</td><td>${money(net)}</td><td>${money(bonuses)}</td><td>${money(utility)}</td><td>${state(selected.estado)}</td><td>${issues}</td></tr>`;
    }).join('') || `<tr><td colspan="${headers.length}">Sin operaciones.</td></tr>`;
    document.querySelectorAll('[data-save-pagamos]').forEach((button) => { button.onclick = () => savePagamos(button.dataset.savePagamos); });
  }

  async function loadIncidents() {
    const { data, error } = await sb.from('liquidation_incidents').select('*,liquidation_operations(establishment_name,imei)').eq('liquidation_id', selected.id).order('created_at');
    if (error) throw error;
    $('detailHead').innerHTML = '<tr><th>Novedad</th><th>Tienda</th><th>IMEI</th><th>Descripción</th><th>Estado</th><th>Decisión</th><th>Acción</th></tr>';
    $('detailBody').innerHTML = (data || []).map((item) => `<tr><td>${esc(UX.traducirEstado(item.tipo))}</td><td>${esc(item.liquidation_operations?.establishment_name || 'General')}</td><td>${esc(item.liquidation_operations?.imei || '—')}</td><td>${esc(item.descripcion)}</td><td>${state(item.estado)}</td><td>${esc(item.resolution || 'Pendiente de revisión')}</td><td>${item.estado === 'abierta' && !selected.frozen_at ? `<button class="btn secondary" data-resolve="${item.id}" data-operation="${item.operation_id || ''}" data-incident-type="${esc(item.tipo)}">Revisar y justificar</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="7">Sin novedades.</td></tr>';
    document.querySelectorAll('[data-resolve]').forEach((button) => { button.onclick = () => resolveIncident(button.dataset.resolve, button.dataset.operation, button.dataset.incidentType); });
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
    const key = kind === 'allies' ? 'establishment_name' : 'ejecutivo_id';
    const groups = Object.values((data || []).reduce((acc, row) => {
      const value = row[key] || 'Sin asignar';
      acc[value] ||= { label: value, establishments: new Set(), operations: 0, sales: 0, initial: 0, issues: 0 };
      acc[value].establishments.add(row.establishment_name); acc[value].operations += 1; acc[value].sales += Number(row.monto_credito ?? row.monto_base); acc[value].initial += Number(row.inicial || 0); acc[value].issues += row.reconocida ? 0 : 1;
      return acc;
    }, {}));
    const normalized = kind === 'allies' ? D.agruparPorAliado([]) : D.agruparPorEjecutivo([]);
    void normalized;
    const heads = kind === 'allies' ? ['Aliado', 'Sede', 'Plataforma', 'Operaciones', 'Monto liquidado', 'Inicial', 'Pago al aliado', 'Novedades', 'Estado del pago'] : ['Ejecutivo', 'Aliados incluidos', 'Operaciones', 'Ventas', 'Bonos', 'Total a recibir', 'Estado del pago', 'Novedades'];
    $('detailHead').innerHTML = `<tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    $('detailBody').innerHTML = groups.map((group) => kind === 'allies'
      ? `<tr><td>${esc(group.label)}</td><td>${esc([...group.establishments].join(', '))}</td><td>${platformName(selected.plataforma)}</td><td>${group.operations}</td><td>${money(group.sales)}</td><td>${money(group.initial)}</td><td>${group.issues}</td><td>Pendiente</td></tr>`
      : `<tr><td>Ejecutivo asignado</td><td>${group.establishments.size}</td><td>${group.operations}</td><td>${money(group.sales)}</td><td>${money(0)}</td><td>${money(0)}</td><td>Pendiente</td><td>${group.issues}</td></tr>`).join('') || `<tr><td colspan="${heads.length}">Sin registros.</td></tr>`;
  }

  async function loadTab(tab) {
    activeTab = tab;
    document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    try {
      if (tab === 'operations') await loadOperations();
      else if (tab === 'incidents') await loadIncidents();
      else if (tab === 'payments') await loadPayments();
      else if (tab === 'audit') await loadAudit();
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
      const decision = prompt('Decisión de Mayte: escribe USAR para tomar Precio/Pagamos del archivo, CORREGIR para guardar valores corregidos o ERROR si el archivo está equivocado.');
      if (!decision) return;
      const normalized = decision.trim().toLowerCase();
      const map = { usar:'usar_archivo', corregir:'corregir_configuracion', error:'error_archivo' };
      if (!map[normalized]) return alert('Decisión inválida. Usa USAR, CORREGIR o ERROR.');
      let precio = null, pagamos = null;
      if (normalized === 'corregir') {
        precio = Number((prompt('Precio de venta correcto:') || '').replace(/[^0-9.-]/g,''));
        pagamos = Number((prompt('Pagamos correcto:') || '').replace(/[^0-9.-]/g,''));
        if (!(precio > 0 && pagamos > 0)) return alert('Precio de venta y Pagamos deben ser mayores que cero.');
      }
      const justification = prompt('Justificación de la decisión:');
      if (!justification?.trim()) return;
      const { error } = await sb.rpc('aliados_resolver_precio_krediya', { p_operation_id:operationId, p_decision:map[normalized], p_precio_venta:precio, p_pagamos:pagamos, p_justificacion:justification.trim() });
      if (error) return alert(error.message);
      await loadTab('incidents');
      return;
    }
    const justification = prompt('Escribe la justificación de la diferencia o novedad:');
    if (!justification?.trim()) return;
    const { error } = await sb.rpc('aliados_resolver_novedad', { p_incident_id: id, p_justificacion: justification.trim() });
    if (error) return alert(error.message);
    await loadTab('incidents');
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
  $('validate').onclick = () => stateRpc('validada');
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
  $('saveImport').onclick = async () => { const button = $('saveImport'); button.disabled = true; try { const file = $('file').files[0]; const key = crypto.randomUUID(); const extension = file.name.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx'; const path = `aliados/originales/${key}.${extension}`; const hash = await sha256(fileBuffer); const duplicate = await sb.from('liquidation_imported_files').select('id', { head: true, count: 'exact' }).eq('sha256', hash); if (duplicate.count) throw new Error('Este archivo ya fue importado.'); const upload = await sb.storage.from('soportes').upload(path, file, { contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false }); if (upload.error) throw upload.error; const rows = preview.operaciones.flatMap((operation) => operation.movimientos.map((movement) => ({ sheet: $('importPlatform').value === 'payjoy' ? 'Transacciones' : 'Worksheet', row_number: movement.fila, movement_type: movement.tipo, source_key: operation.sourceKey, original: movement.original }))); const { error } = await sb.rpc('aliados_importar_liquidacion', { p_plataforma: $('importPlatform').value, p_nombre: file.name, p_sha256: hash, p_storage_path: path, p_size: file.size, p_mime: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', p_periodo_desde: $('periodFrom').value || null, p_periodo_hasta: $('periodTo').value || null, p_fecha_corte: $('cutoff').value || null, p_rows: rows, p_operations: preview.operaciones, p_incidents: preview.incidencias, p_idempotency_key: key }); if (error) throw error; $('importModal').classList.remove('show'); await loadBatches(); } catch (error) { $('importError').textContent = error.message; button.disabled = false; } };
  const validateLegacyImport = $('validateImport').onclick;
  $('validateImport').onclick = async () => {
    if ($('importPlatform').value !== 'krediya') return validateLegacyImport();
    try {
      const file = $('file').files[0];
      if (!file) throw new Error('Selecciona un archivo Excel.');
      fileBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type:'array', cellDates:true });
      const sheet = workbook.Sheets.LIQUIDACION || workbook.Sheets[workbook.SheetNames[1]];
      if (!sheet) throw new Error('El archivo de Krediya no contiene la hoja LIQUIDACION.');
      const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval:null, raw:true });
      preview = D.importarKrediya(rows, await establishments());
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
