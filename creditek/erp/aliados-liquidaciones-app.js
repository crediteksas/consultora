(function () {
  'use strict';

  const D = CreditekAliadosLiquidaciones;
  const UX = CreditekAliadosUX;
  let sb;
  let operator;
  let profile;
  let batches = [];
  let selected;
  let activeTab = 'operations';
  let activeModel = 'all';
  let preview;
  let fileBuffer;
  let initialized = false;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = UX.formatoCOP;
  const state = (value) => `<span class="badge ${esc(value)}">${esc(UX.traducirEstado(value))}</span>`;

  $('filterState').innerHTML = '<option value="">Todos los estados</option>' + D.ESTADOS.map((s) => `<option value="${s}">${UX.traducirEstado(s)}</option>`).join('');

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
    if ($('filterState').value) query = query.eq('estado', $('filterState').value);
    const { data, error } = await query;
    if (error) { $('batches').innerHTML = `<tr><td colspan="10">${esc(error.message)}</td></tr>`; return; }
    batches = data || [];
    renderBatches();
  }

  function renderBatches() {
    const search = $('filterSearch').value.trim().toLowerCase();
    const rows = batches.filter((b) => !search || b.plataforma.includes(search) || UX.traducirEstado(b.estado).toLowerCase().includes(search));
    $('batches').innerHTML = rows.map((b) => `<tr>
      <td>${UX.fechaAuditoria(b.imported_at)}</td><td>${b.plataforma === 'alo' ? 'ALO Credit' : 'PayJoy'}</td><td>${UX.fechaCorta(b.fecha_corte)}</td>
      <td>${state(b.estado)}</td><td>${Number(b.operaciones_tiendas || 0) + Number(b.operaciones_aliados || 0)}</td>
      <td>${money(b.total_pago_aliados)}</td><td>${money(b.total_bonos)}</td><td>${money(b.total_utilidad_creditek)}</td><td>${money(b.total_pagar)}</td>
      <td><button class="btn secondary" data-open="${b.id}">Ver detalle</button></td></tr>`).join('') || '<tr><td colspan="10">No hay liquidaciones.</td></tr>';
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
  }

  function renderMetrics() {
    const metrics = (title, values) => `<section class="card"><h2>${title}</h2><div class="grid">${values.map(([label, value, count]) => `<div class="metric"><small>${label}</small><strong>${count ? Number(value || 0) : money(value)}</strong></div>`).join('')}</div></section>`;
    $('metrics').innerHTML = metrics('Resumen general', [
      ['Operaciones', Number(selected.operaciones_tiendas || 0) + Number(selected.operaciones_aliados || 0), true],
      ['Base liquidada', selected.total_operaciones], ['Total a pagar', selected.total_pagar], ['Bonos', selected.total_bonos], ['Utilidad Creditek', selected.total_utilidad_creditek]
    ]) + metrics('Resumen Operaciones Retail', [
      ['Operaciones', selected.operaciones_tiendas, true], ['Pago neto a tiendas', selected.total_pago_tiendas], ['Utilidad de tiendas', selected.total_utilidad_tiendas]
    ]) + metrics('Resumen Operaciones Aliados', [
      ['Operaciones', selected.operaciones_aliados, true], ['Pago neto a aliados', selected.total_pago_aliados], ['Bonos', selected.total_bonos]
    ]);
  }

  async function openDetail(id) {
    selected = batches.find((batch) => batch.id === id) || selected;
    $('detail').classList.remove('hidden');
    $('detailTitle').textContent = `${selected.plataforma === 'alo' ? 'ALO Credit' : 'PayJoy'} · ${UX.fechaCorta(selected.fecha_corte)}`;
    renderMetrics();
    updateActions();
    await loadTab(activeTab);
  }

  async function loadOperations() {
    const operationFields = 'id,liquidation_id,plataforma,external_id,operation_at,establishment_name,origen_codigo,tipo_establecimiento,ejecutivo_id,cliente_documento,cliente_nombre,imei,referencia,modelo,monto_credito,monto_base,accesorios_cantidad,accesorios,inicial,reconocida,inicial_kora,diferencia_inicial,costo_equipo,pagamos,pago_neto_tienda,utilidad_tienda,utilidad_creditek_tienda,diferencia_justificacion,diferencia_revisada_at';
    const { data, error } = await sb.from('liquidation_operations').select(operationFields).eq('liquidation_id', selected.id).order('operation_at');
    if (error) throw error;
    const rows = (data || []).filter((row) => activeModel === 'all' || row.tipo_establecimiento === activeModel);
    const own = activeModel === 'propia' || (activeModel === 'all' && rows.some((row) => row.tipo_establecimiento === 'propia'));
    const headers = own
      ? ['Modelo', 'Tienda', 'Cliente', 'Documento', 'Equipo', 'IMEI', 'Monto plataforma', 'Inicial plataforma', 'Inicial recibida en KORA', 'Diferencia de inicial', 'Costo', 'Pagamos', 'Pago neto', 'Utilidad Creditek', 'Utilidad tienda', 'Estado', 'Novedades']
      : ['Modelo', 'Establecimiento', 'Cliente', 'Documento', 'Equipo', 'IMEI', 'Base liquidable', 'Inicial', 'Pago al aliado', 'Estado'];
    $('detailHead').innerHTML = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    $('detailBody').innerHTML = rows.map((row) => {
      const isOwn = row.tipo_establecimiento === 'propia';
      const difference = Number(row.diferencia_inicial || 0);
      const payField = isOwn && operator.capacidad === 'aprobador' && !selected.frozen_at
        ? `<div class="actions"><input class="control" data-pagamos-input="${row.id}" inputmode="numeric" value="${Number(row.pagamos || 0)}" aria-label="Pagamos"><button class="btn secondary" data-save-pagamos="${row.id}">Guardar</button></div>`
        : money(row.pagamos);
      if (isOwn) return `<tr><td>Operación Retail</td><td>${esc(row.establishment_name)}</td><td>${esc(row.cliente_nombre || '—')}</td><td>${esc(row.cliente_documento || '—')}</td><td>${esc(row.modelo || row.referencia || '—')}</td><td>${esc(row.imei || '—')}</td><td>${money(row.monto_base)}</td><td>${money(row.inicial)}</td><td>${money(row.inicial_kora)}</td><td>${money(difference)}</td><td>${money(row.costo_equipo)}</td><td>${payField}</td><td>${money(row.pago_neto_tienda)}</td><td>${money(row.utilidad_creditek_tienda)}</td><td>${money(row.utilidad_tienda)}</td><td>${state(selected.estado)}</td><td>${difference ? '<span class="badge con_novedades">Requiere revisión</span>' : 'Sin diferencia'}</td></tr>`;
      return `<tr><td>Operación Aliados</td><td>${esc(row.establishment_name)}</td><td>${esc(row.cliente_nombre || '—')}</td><td>${esc(row.cliente_documento || '—')}</td><td>${esc(row.modelo || row.referencia || '—')}</td><td>${esc(row.imei || '—')}</td><td>${money(row.monto_credito ?? row.monto_base)}</td><td>${money(row.inicial)}</td><td>Según política vigente</td><td>${row.reconocida ? 'Reconocida' : 'Con novedad'}</td></tr>`;
    }).join('') || `<tr><td colspan="${headers.length}">Sin operaciones.</td></tr>`;
    document.querySelectorAll('[data-save-pagamos]').forEach((button) => { button.onclick = () => savePagamos(button.dataset.savePagamos); });
  }

  async function loadIncidents() {
    const { data, error } = await sb.from('liquidation_incidents').select('*').eq('liquidation_id', selected.id).order('created_at');
    if (error) throw error;
    $('detailHead').innerHTML = '<tr><th>Novedad</th><th>Descripción</th><th>Estado</th><th>Decisión</th><th>Acción</th></tr>';
    $('detailBody').innerHTML = (data || []).map((item) => `<tr><td>${esc(UX.traducirEstado(item.tipo))}</td><td>${esc(item.descripcion)}</td><td>${state(item.estado)}</td><td>${esc(item.resolution || 'Pendiente de revisión')}</td><td>${item.estado === 'abierta' && !selected.frozen_at ? `<button class="btn secondary" data-resolve="${item.id}">Revisar y justificar</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5">Sin novedades.</td></tr>';
    document.querySelectorAll('[data-resolve]').forEach((button) => { button.onclick = () => resolveIncident(button.dataset.resolve); });
  }

  async function loadPayments() {
    const { data, error } = await sb.from('payment_orders').select('id,valor,estado,fecha_programada,fecha_pagada,soporte_path,liquidation_beneficiaries(nombre,tipo,origen_codigo),beneficiary_bank_accounts(numero_cuenta),payment_items(concepto)').eq('liquidation_id', selected.id);
    if (error) throw error;
    $('detailHead').innerHTML = '<tr><th>Beneficiario</th><th>Tipo</th><th>Aliado o sede</th><th>Concepto</th><th>Cuenta bancaria</th><th>Valor</th><th>Estado</th><th>Fecha programada</th><th>Fecha de pago</th><th>Soporte</th><th>Acción</th></tr>';
    $('detailBody').innerHTML = (data || []).map((payment) => {
      const beneficiary = payment.liquidation_beneficiaries || {};
      const next = payment.estado === 'pendiente' ? 'programado' : payment.estado === 'programado' ? 'pagado' : payment.estado === 'pagado' ? 'conciliado' : null;
      return `<tr><td>${esc(beneficiary.nombre || 'Sin nombre')}</td><td>${esc(UX.traducirEstado(beneficiary.tipo || 'otro'))}</td><td>${esc(beneficiary.origen_codigo || '—')}</td><td>${esc((payment.payment_items || []).map((item) => UX.traducirEstado(item.concepto)).join(', ') || 'Liquidación')}</td><td>${esc(UX.cuentaTerminadaEn(payment.beneficiary_bank_accounts?.numero_cuenta))}</td><td>${money(payment.valor)}</td><td>${state(payment.estado)}</td><td>${UX.fechaCorta(payment.fecha_programada)}</td><td>${UX.fechaCorta(payment.fecha_pagada)}</td><td>${payment.soporte_path ? 'Adjunto' : 'Sin soporte'}</td><td>${next ? `<button class="btn secondary" data-payment="${payment.id}" data-next="${next}">${UX.traducirEstado(next)}</button>` : '—'}</td></tr>`;
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
      ? `<tr><td>${esc(group.label)}</td><td>${esc([...group.establishments].join(', '))}</td><td>${selected.plataforma === 'alo' ? 'ALO Credit' : 'PayJoy'}</td><td>${group.operations}</td><td>${money(group.sales)}</td><td>${money(group.initial)}</td><td>${group.issues}</td><td>Pendiente</td></tr>`
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
  async function resolveIncident(id) {
    const justification = prompt('Escribe la justificación de la diferencia o novedad:');
    if (!justification?.trim()) return;
    const { error } = await sb.rpc('aliados_resolver_novedad', { p_incident_id: id, p_justificacion: justification.trim() });
    if (error) return alert(error.message);
    await loadTab('incidents');
  }
  async function stateRpc(next, comment = null) {
    const { error } = await sb.rpc('aliados_cambiar_estado', { p_id: selected.id, p_estado: next, p_comentario: comment });
    if (error) return alert(error.message);
    await loadBatches(); await openDetail(selected.id);
  }
  async function changePayment(id, next) {
    const { error } = await sb.rpc('aliados_cambiar_estado_pago', { p_id: id, p_estado: next, p_soporte_path: null });
    if (error) return alert(error.message);
    await loadTab('payments');
  }
  $('saveReview').onclick = async () => { const { error } = await sb.rpc('aliados_resolver_operaciones_propias', { p_liquidation_id: selected.id }); if (error) alert(error.message); else await loadTab('operations'); };
  $('validate').onclick = () => stateRpc('validada');
  $('calculate').onclick = async () => { const { error } = await sb.rpc('aliados_calcular_liquidacion', { p_id: selected.id }); if (error) alert(error.message); else { await loadBatches(); await openDetail(selected.id); } };
  $('review').onclick = () => stateRpc('revisada', 'Revisión administrativa completada por Maite');
  $('reject').onclick = () => stateRpc('con_novedades', prompt('Motivo para devolver a revisión:') || 'Requiere corrección');
  $('reportIssue').onclick = async () => { const description = prompt('Describe la novedad:'); if (!description?.trim()) return; const { error } = await sb.rpc('aliados_reportar_novedad', { p_id: selected.id, p_operation_id: null, p_descripcion: description.trim() }); if (error) alert(error.message); else loadTab('incidents'); };
  $('approve').onclick = () => { const message = `Confirma la aprobación de ${selected.plataforma === 'alo' ? 'ALO Credit' : 'PayJoy'}\nFecha de corte: ${UX.fechaCorta(selected.fecha_corte)}\nTiendas: ${selected.operaciones_tiendas || 0}\nAliados: ${selected.operaciones_aliados || 0}\nPago tiendas: ${money(selected.total_pago_tiendas)}\nPago aliados: ${money(selected.total_pago_aliados)}\nBonos: ${money(selected.total_bonos)}\nUtilidad Creditek: ${money(selected.total_utilidad_creditek)}\nTotal: ${money(selected.total_pagar)}`; if (confirm(message)) stateRpc('aprobada'); };
  document.querySelectorAll('[data-tab]').forEach((button) => { button.onclick = () => loadTab(button.dataset.tab); });
  document.querySelectorAll('[data-model]').forEach((button) => { button.onclick = () => { activeModel = button.dataset.model; document.querySelectorAll('[data-model]').forEach((item) => item.classList.toggle('active', item === button)); loadTab('operations'); }; });
  $('filterPlatform').onchange = loadBatches; $('filterState').onchange = loadBatches; $('filterSearch').oninput = renderBatches;

  $('newImport').onclick = () => $('importModal').classList.add('show');
  $('closeImport').onclick = () => $('importModal').classList.remove('show');
  async function establishments() { const [{ data: origins }, { data: executives }] = await Promise.all([sb.from('origenes').select('codigo,nombre,tipo,ejecutivo_id').eq('activo', true), sb.from('ejecutivos').select('id,nombre').eq('activo', true)]); return (origins || []).map((origin) => ({ ...origin, aliases: [origin.codigo], ejecutivo: (executives || []).find((item) => item.id === origin.ejecutivo_id) || null })); }
  $('validateImport').onclick = async () => { try { const file = $('file').files[0]; if (!file) throw new Error('Selecciona un archivo Excel.'); fileBuffer = await file.arrayBuffer(); const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true }); const platform = $('importPlatform').value; const sheet = platform === 'payjoy' ? (workbook.Sheets.Transacciones || workbook.Sheets[workbook.SheetNames[1]]) : (workbook.Sheets.Worksheet || workbook.Sheets[workbook.SheetNames[0]]); const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }); preview = platform === 'payjoy' ? D.importarPayjoy(rows, await establishments()) : D.importarAlo(rows, await establishments()); $('preview').classList.remove('hidden'); $('previewMetrics').innerHTML = `<div class="metric"><small>Filas fuente</small><strong>${preview.filasOriginales.length}</strong></div><div class="metric"><small>Operaciones</small><strong>${preview.operaciones.length}</strong></div><div class="metric"><small>Novedades</small><strong>${preview.incidencias.length}</strong></div>`; $('previewIssues').innerHTML = preview.incidencias.map((item) => `<tr><td>${esc(UX.traducirEstado(item.tipo))}</td><td>${esc(item.sourceKey)}</td></tr>`).join('') || '<tr><td colspan="2">Sin novedades estructurales.</td></tr>'; $('saveImport').disabled = false; $('importError').textContent = ''; } catch (error) { $('importError').textContent = error.message; $('saveImport').disabled = true; } };
  async function sha256(buffer) { const digest = await crypto.subtle.digest('SHA-256', buffer); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
  $('saveImport').onclick = async () => { const button = $('saveImport'); button.disabled = true; try { const file = $('file').files[0]; const key = crypto.randomUUID(); const extension = file.name.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx'; const path = `aliados/originales/${key}.${extension}`; const hash = await sha256(fileBuffer); const duplicate = await sb.from('liquidation_imported_files').select('id', { head: true, count: 'exact' }).eq('sha256', hash); if (duplicate.count) throw new Error('Este archivo ya fue importado.'); const upload = await sb.storage.from('soportes').upload(path, file, { contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false }); if (upload.error) throw upload.error; const rows = preview.operaciones.flatMap((operation) => operation.movimientos.map((movement) => ({ sheet: $('importPlatform').value === 'payjoy' ? 'Transacciones' : 'Worksheet', row_number: movement.fila, movement_type: movement.tipo, source_key: operation.sourceKey, original: movement.original }))); const { error } = await sb.rpc('aliados_importar_liquidacion', { p_plataforma: $('importPlatform').value, p_nombre: file.name, p_sha256: hash, p_storage_path: path, p_size: file.size, p_mime: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', p_periodo_desde: $('periodFrom').value || null, p_periodo_hasta: $('periodTo').value || null, p_fecha_corte: $('cutoff').value || null, p_rows: rows, p_operations: preview.operaciones, p_incidents: preview.incidencias, p_idempotency_key: key }); if (error) throw error; $('importModal').classList.remove('show'); await loadBatches(); } catch (error) { $('importError').textContent = error.message; button.disabled = false; } };
}());
