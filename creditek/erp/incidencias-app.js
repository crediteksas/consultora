(function () {
  'use strict';

  const STATES = ['nuevo', 'en_revision', 'confirmado', 'en_desarrollo', 'pendiente_validacion', 'corregido', 'cerrado', 'reabierto', 'rechazado', 'no_reproducible', 'duplicado'];
  const MANAGER_STATES = ['nuevo', 'en_revision', 'en_desarrollo', 'pendiente_validacion', 'corregido', 'cerrado', 'reabierto', 'rechazado', 'duplicado'];
  const OPEN_INCIDENT_STATES = new Set(['nuevo', 'en_revision', 'confirmado', 'en_desarrollo', 'corregido', 'pendiente_validacion', 'reabierto']);
  const PAGE_SIZE = 20;
  const management = window.KoraIncidentManagement;
  const label = value => management?.statusLabel(value)
    || String(value || '').replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase());
  const formatDate = value => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  const age = value => {
    const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
    return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
  };
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  let state = {
    sb: null,
    profile: null,
    mode: document.body.dataset.incidentMode,
    incidents: [],
    selected: null,
    assignees: [],
    people: new Map(),
    saving: false,
    selectedHistory: [],
    taskText: '',
    taskActivator: null,
    copyingTask: false,
    canAdmin: false,
    canComment: false,
    currentPage: 1,
    listScrollY: 0,
    detailActivator: null,
  };

  function status(message, error = false) {
    const node = document.querySelector('[data-incident-page-status]');
    if (!node) return;
    node.textContent = message || '';
    node.dataset.kind = error ? 'error' : 'success';
  }
  async function waitForContext() {
    if (window.creditekSidebar?.sb) return window.creditekSidebar;
    return new Promise(resolve => document.addEventListener('kora-sidebar-ready', () => resolve(window.creditekSidebar), { once: true }));
  }
  function fillStateOptions() {
    document.querySelectorAll('[data-incident-filter="status"],[data-detail-status]').forEach(select => {
      const first = select.matches('[data-incident-filter]') ? select.firstElementChild : null;
      select.replaceChildren();
      if (first) select.append(first);
      STATES.forEach(value => {
        const option = el('option', label(value));
        option.value = value;
        select.append(option);
      });
    });
  }
  async function loadMetrics() {
    if (state.mode !== 'admin') return;
    const { data, error } = await state.sb.rpc('kora_incident_metrics', {});
    if (error) throw error;
    const metrics = Array.isArray(data) ? data[0] : data;
    const values = {
      new: metrics?.nuevas ?? 0,
      critical: metrics?.criticas ?? 0,
      development: metrics?.en_desarrollo ?? 0,
      validation: metrics?.pendientes_validacion ?? 0,
      closed: metrics?.cerradas_mes ?? 0,
      average: metrics?.promedio_resolucion_horas == null ? 'Sin datos' : `${Number(metrics.promedio_resolucion_horas).toFixed(1)} h`,
    };
    Object.entries(values).forEach(([key, value]) => {
      const node = document.querySelector(`[data-kpi="${key}"]`);
      if (node) node.textContent = value;
    });
  }
  function filteredIncidents() {
    if (state.mode !== 'admin') return management.sortIncidents(state.incidents);
    const read = name => document.querySelector(`[data-incident-filter="${name}"]`)?.value?.trim().toLowerCase() || '';
    const code = read('code');
    const dateFrom = read('dateFrom');
    const dateTo = read('dateTo');
    return management.sortIncidents(state.incidents.filter(item =>
      (!code || item.incident_code.toLowerCase().includes(code) || item.title.toLowerCase().includes(code))
      && (!read('status') || item.status === read('status'))
      && (!read('priority') || item.priority === read('priority'))
      && (!read('store') || String(item.store_name_snapshot || item.store_code || '').toLowerCase().includes(read('store')))
      && (!read('module') || item.module.toLowerCase().includes(read('module')))
      && (!read('user') || item.user_name_snapshot.toLowerCase().includes(read('user')))
      && (!read('assignee') || assigneeName(item.assigned_to).toLowerCase().includes(read('assignee')))
      && (!read('version') || item.kora_version.toLowerCase().includes(read('version')))
      && (!dateFrom || item.created_at.slice(0, 10) >= dateFrom)
      && (!dateTo || item.created_at.slice(0, 10) <= dateTo)));
  }
  function assigneeName(id) {
    if (!id) return 'Sin asignar';
    return management?.displayName(state.people.get(id) || { id }) || 'Usuario sin nombre';
  }
  function renderList() {
    const body = document.querySelector('[data-incident-list]');
    body.replaceChildren();
    const filtered = filteredIncidents();
    const pagination = management.paginateIncidents(filtered, state.currentPage, PAGE_SIZE);
    state.currentPage = pagination.currentPage;
    const records = pagination.items;
    const pageNode = document.querySelector('[data-incident-page]');
    if (pageNode) pageNode.textContent = `Página ${pagination.currentPage} de ${pagination.totalPages}`;
    const previous = document.querySelector('[data-incident-previous]');
    const next = document.querySelector('[data-incident-next]');
    if (previous) previous.disabled = pagination.currentPage <= 1;
    if (next) next.disabled = pagination.currentPage >= pagination.totalPages;
    if (!records.length) {
      const row = el('tr');
      const cell = el('td', 'No hay incidencias para mostrar.');
      cell.colSpan = state.mode === 'admin' ? 11 : 7;
      row.append(cell); body.append(row); return;
    }
    records.forEach(item => {
      const row = el('tr');
      const tone = management?.statusTone(item.status) || 'pending';
      row.dataset.managementState = tone;
      const codeButton = el('button', item.incident_code);
      codeButton.type = 'button';
      codeButton.addEventListener('click', () => openDetail(item, codeButton));
      const cells = state.mode === 'admin'
        ? [codeButton, formatDate(item.created_at), item.title, item.store_name_snapshot || '—', item.module, label(item.priority), label(item.status), item.user_name_snapshot, assigneeName(item.assigned_to), item.kora_version, age(item.created_at)]
        : [codeButton, formatDate(item.created_at), item.title, item.module, label(item.priority), label(item.status), formatDate(item.updated_at)];
      const statusIndex = state.mode === 'admin' ? 6 : 5;
      cells.forEach((value, index) => {
        const cell = el('td');
        if (value instanceof Node) {
          cell.append(value);
        } else if (index === statusIndex) {
          cell.append(el('span', value, `kora-incident-status kora-incident-status--${tone}`));
        } else {
          cell.textContent = value;
        }
        row.append(cell);
      });
      body.append(row);
    });
  }
  async function loadIncidents() {
    let query = state.sb.from('kora_incidents').select('*').order('updated_at', { ascending: false }).limit(500);
    if (state.mode === 'own') query = query.eq('user_id', state.profile.id);
    const { data, error } = await query;
    if (error) throw error;
    state.incidents = data || [];
    state.incidents.forEach(item => {
      if (item.user_id && item.user_name_snapshot) {
        state.people.set(item.user_id, { id: item.user_id, nombre: item.user_name_snapshot });
      }
    });
    renderList();
  }
  async function evidenceLink(item, target) {
    if (!item.evidence_path) return;
    const { data, error } = await window.KoraIncidentCenter.createSignedEvidenceUrl(state.sb, item.evidence_path);
    if (error || !data?.signedUrl) return;
    const link = el('a', 'Abrir evidencia privada');
    link.href = data.signedUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    target.append(link);
  }
  async function openDetail(item, activator = null) {
    state.selected = item;
    const detail = document.querySelector('[data-incident-detail]');
    if (detail.hidden) state.listScrollY = scrollY;
    if (activator) state.detailActivator = activator;
    detail.hidden = false;
    detail.querySelector('[data-detail-title]').textContent = `${item.incident_code} · ${item.title}`;
    const content = detail.querySelector('[data-detail-content]');
    content.replaceChildren(
      el('p', item.description),
      el('h3', 'Acción intentada'),
      el('p', item.attempted_action),
      el('h3', 'Datos técnicos'),
      el('p', `${item.module} · ${item.page_name} · ${item.browser || 'Navegador no disponible'} · ${item.viewport || 'Viewport no disponible'}`),
    );
    await evidenceLink(item, content);
    const [{ data: history, error: historyError }, { data: comments, error: commentsError }] = await Promise.all([
      state.sb.from('kora_incident_history').select('*').eq('incident_id', item.id).order('created_at'),
      state.sb.from('kora_incident_comments').select('*').eq('incident_id', item.id).order('created_at'),
    ]);
    if (historyError || commentsError) throw historyError || commentsError;
    state.selectedHistory = history || [];
    (comments || []).forEach(comment => {
      if (comment.author_user_id && comment.author_name_snapshot) {
        state.people.set(comment.author_user_id, { id: comment.author_user_id, nombre: comment.author_name_snapshot });
      }
    });
    const historyNode = detail.querySelector('[data-incident-history]');
    historyNode.replaceChildren(...(history || []).map(event => {
      const text = management?.historyText(event, state.people) || event.comment || 'Actividad registrada.';
      return el('li', `${formatDate(event.created_at)} · ${text}`);
    }));
    const commentsNode = detail.querySelector('[data-incident-comments]');
    commentsNode.replaceChildren();
    for (const comment of comments || []) {
      const paragraph = el('p', `${comment.author_name_snapshot}: ${comment.body}`);
      if (comment.evidence_path) {
        const { data: signed } = await window.KoraIncidentCenter.createSignedEvidenceUrl(state.sb, comment.evidence_path);
        if (signed?.signedUrl) {
          paragraph.append(' · ');
          const link = el('a', 'Abrir evidencia');
          link.href = signed.signedUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          paragraph.append(link);
        }
      }
      commentsNode.append(paragraph);
    }
    const commentForm = detail.querySelector('[data-incident-comment-form]');
    if (commentForm) commentForm.hidden = !(state.canComment && OPEN_INCIDENT_STATES.has(item.status));
    if (state.mode === 'admin' && state.canAdmin) {
      const statusSelect = detail.querySelector('[data-detail-status]');
      statusSelect.replaceChildren();
      MANAGER_STATES.forEach(value => {
        const option = el('option', label(value));
        option.value = value;
        statusSelect.append(option);
      });
      detail.querySelector('[data-detail-status]').value = item.status;
      detail.querySelector('[data-detail-priority]').value = item.priority;
      detail.querySelector('[data-detail-assignee]').value = item.assigned_to || '';
      detail.querySelector('[data-detail-resolution]').value = item.resolution_summary || '';
      detail.querySelector('[data-detail-version]').value = item.fixed_version || '';
      clearManagementErrors();
    }
    detail.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function closeDetail() {
    const detail = document.querySelector('[data-incident-detail]');
    detail.hidden = true;
    state.selected = null;
    state.selectedHistory = [];
    const url = new URL(location.href);
    url.searchParams.delete('id');
    history.replaceState(history.state, '', url);
    scrollTo({ top: state.listScrollY, behavior: 'auto' });
    state.detailActivator?.focus({ preventScroll: true });
  }
  async function loadAssignees() {
    if (state.mode !== 'admin' || !state.canAdmin) return;
    const { data, error } = await state.sb.from('perfiles')
      .select('id,nombre,rol')
      .eq('activo', true)
      .in('rol', ['gerencia', 'auditoria', 'soporte'])
      .order('nombre');
    if (error) return;
    state.assignees = data || [];
    state.assignees.forEach(person => state.people.set(person.id, person));
    const select = document.querySelector('[data-detail-assignee]');
    state.assignees.forEach(person => {
      const option = el('option', `${person.nombre} · ${label(person.rol)}`);
      option.value = person.id;
      select.append(option);
    });
  }
  function clearManagementErrors() {
    document.querySelectorAll('[data-detail-field-error]').forEach(node => { node.textContent = ''; });
    document.querySelectorAll('[data-detail-resolution],[data-detail-version],[data-detail-assignee]').forEach(node => node.removeAttribute('aria-invalid'));
  }
  function showManagementErrors(errors) {
    clearManagementErrors();
    Object.entries(errors).forEach(([key, message]) => {
      const node = document.querySelector(`[data-detail-field-error="${key}"]`);
      if (node) node.textContent = message;
      const field = key === 'resolution'
        ? document.querySelector('[data-detail-resolution]')
        : key === 'fixedVersion'
          ? document.querySelector('[data-detail-version]')
          : document.querySelector('[data-detail-assignee]');
      field?.setAttribute('aria-invalid', 'true');
    });
    const first = errors.resolution
      ? document.querySelector('[data-detail-resolution]')
      : errors.fixedVersion
        ? document.querySelector('[data-detail-version]')
        : document.querySelector('[data-detail-assignee]');
    first?.focus();
  }
  async function saveAdmin() {
    if (state.saving || !state.selected) return;
    const detail = document.querySelector('[data-incident-detail]');
    const assignee = detail.querySelector('[data-detail-assignee]').value.trim();
    const values = {
      status: detail.querySelector('[data-detail-status]').value,
      priority: detail.querySelector('[data-detail-priority]').value,
      assignee,
      resolution: detail.querySelector('[data-detail-resolution]').value,
      fixedVersion: detail.querySelector('[data-detail-version]').value,
    };
    const validation = management.validateManagement(values);
    if (!validation.ok) {
      showManagementErrors(validation.errors);
      status('Completa los campos marcados para resolver la incidencia.', true);
      return;
    }
    clearManagementErrors();
    const button = detail.querySelector('[data-detail-save]');
    state.saving = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const requestId = crypto.randomUUID();
    try {
      const { error } = await state.sb.rpc('kora_manage_incident_v1_1', {
        p_incident_id: state.selected.id,
        p_status: values.status,
        p_priority: values.priority,
        p_assigned_to: assignee || null,
        p_resolution_summary: values.resolution || null,
        p_fixed_version: values.fixedVersion || null,
        p_request_id: requestId,
      });
      if (error) throw error;
      const confirmation = {
        corregido: 'Incidencia resuelta correctamente.',
        cerrado: 'Incidencia cerrada correctamente.',
        reabierto: 'Incidencia reabierta correctamente.',
      }[values.status] || 'Incidencia actualizada correctamente.';
      status(confirmation);
      document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));
      await Promise.all([loadMetrics(), loadIncidents()]);
      const refreshed = state.incidents.find(item => item.id === state.selected.id);
      if (refreshed) await openDetail(refreshed);
    } finally {
      state.saving = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
  function displayValue(value) {
    if (value === null || value === undefined || value === '') return 'Sin información';
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
  function setTaskText(name, value) {
    const node = document.querySelector(`[data-task-field="${name}"]`);
    if (node) node.textContent = displayValue(value);
  }
  function fillFacts(node, facts) {
    node.replaceChildren();
    facts.forEach(([term, value]) => {
      const fact = el('div');
      fact.append(el('dt', term), el('dd', displayValue(value)));
      node.append(fact);
    });
  }
  function technicalContext(incident) {
    const source = incident.technical_context && typeof incident.technical_context === 'object'
      ? incident.technical_context : {};
    return [
      ['Navegador', source.browser || incident.browser],
      ['Viewport', source.viewport || incident.viewport],
      ['Sistema operativo', source.operating_system || source.operatingSystem || incident.operating_system],
      ['Estado de conexión', source.connection_status || source.connection || incident.connection_status],
      ['Resolución de pantalla', source.screen_resolution || incident.screen_resolution],
      ['Identificador de sesión', source.session_identifier || incident.session_identifier],
    ];
  }
  function renderTaskDialog(incident) {
    fillFacts(document.querySelector('[data-task-field="information"]'), [
      ['ID', incident.incident_code],
      ['Título', incident.title],
      ['Módulo', incident.module],
      ['Pantalla', incident.page_name],
      ['Prioridad', label(incident.priority)],
      ['Estado', label(incident.status)],
      ['Reportado por', incident.user_name_snapshot],
      ['Responsable', assigneeName(incident.assigned_to)],
      ['Versión', incident.kora_version],
    ]);
    setTaskText('description', incident.description);
    setTaskText('attemptedAction', incident.attempted_action);
    setTaskText('steps', incident.reproduction_steps);
    setTaskText('actualResult', incident.actual_result);
    setTaskText('expectedResult', incident.expected_result);
    setTaskText('evidence', incident.evidence_path ? 'Disponible de forma privada en KORA' : 'Sin evidencia adjunta');
    fillFacts(document.querySelector('[data-task-field="technical"]'), technicalContext(incident));
    setTaskText('history', incident.history || state.selectedHistory.map(event =>
      management?.historyText(event, state.people) || event.comment || 'Actividad registrada.'
    ).join('\n'));
    setTaskText('restrictions', incident.restrictions);
    setTaskText('doNotModify', incident.do_not_modify);
    setTaskText('requiredTests', incident.required_tests);
  }
  function closeTaskDialog() {
    const dialog = document.querySelector('[data-task-dialog]');
    if (dialog?.open) dialog.close();
    state.taskActivator?.focus();
  }
  function trapTaskFocus(event) {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  function taskDialog(event) {
    const dialog = document.querySelector('[data-task-dialog]');
    state.taskActivator = event?.currentTarget || document.querySelector('[data-generate-task]');
    state.taskText = window.KoraIncidentDomain.generateTechnicalTask({
      ...state.selected,
      assigned_to: assigneeName(state.selected?.assigned_to),
    });
    renderTaskDialog(state.selected);
    document.querySelector('[data-task-copy-status]').textContent = '';
    dialog.showModal();
    dialog.querySelector('[data-copy-task]').focus();
  }
  async function requestInformation() {
    const input = document.querySelector('[data-information-request]');
    const body = input?.value.trim();
    if (!body) {
      input?.focus();
      throw new Error('Escribe la información que necesitas solicitar.');
    }
    const button = document.querySelector('[data-request-information]');
    button.disabled = true;
    try {
      const { error } = await state.sb.rpc('kora_request_incident_information', {
        p_incident_id: state.selected.id,
        p_body: body,
        p_request_id: crypto.randomUUID(),
      });
      if (error) throw error;
      input.value = '';
      status('Solicitud de información enviada.');
      await openDetail(state.selected);
    } finally {
      button.disabled = false;
    }
  }
  async function addComment() {
    const input = document.querySelector('[data-comment-text]');
    const fileInput = document.querySelector('[data-comment-evidence]');
    const file = fileInput?.files?.[0];
    const validation = window.KoraIncidentDomain.validateEvidence(file);
    if (!validation.ok) throw new Error(validation.error);
    const { data, error } = await state.sb.rpc('kora_add_incident_comment', {
      p_incident_id: state.selected.id, p_body: input.value, p_is_internal: false,
    });
    if (error) throw error;
    if (file) {
      const comment = Array.isArray(data) ? data[0] : data;
      const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${state.selected.id}/${crypto.randomUUID()}.${extension === 'jpeg' ? 'jpg' : extension}`;
      const { error: uploadError } = await state.sb.storage.from('kora-incident-evidence').upload(path, file, {
        contentType: file.type, cacheControl: '3600', upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: attachError } = await state.sb.rpc('kora_attach_incident_comment_evidence', {
        p_comment_id: comment.id, p_path: path, p_name: file.name, p_mime: file.type, p_size: file.size,
      });
      if (attachError) throw attachError;
    }
    input.value = '';
    if (fileInput) fileInput.value = '';
    status('Información agregada.');
    await openDetail(state.selected);
  }
  async function confirmFixed() {
    const { error } = await state.sb.rpc('kora_confirm_incident_resolved', { p_incident_id: state.selected.id });
    if (error) throw error;
    status('Confirmación registrada.');
    await loadIncidents();
  }
  function bind() {
    document.querySelector('[data-incident-filters]')?.addEventListener('input', () => {
      state.currentPage = 1;
      renderList();
    });
    document.querySelector('[data-incident-previous]')?.addEventListener('click', () => {
      state.currentPage -= 1;
      renderList();
    });
    document.querySelector('[data-incident-next]')?.addEventListener('click', () => {
      state.currentPage += 1;
      renderList();
    });
    document.querySelector('[data-detail-save]')?.addEventListener('click', () => saveAdmin().catch(error => status(error.message, true)));
    document.querySelector('[data-request-information]')?.addEventListener('click', () => requestInformation().catch(error => status(error.message, true)));
    document.querySelector('[data-generate-task]')?.addEventListener('click', taskDialog);
    document.querySelectorAll('[data-close-task]').forEach(button => button.addEventListener('click', closeTaskDialog));
    document.querySelector('[data-copy-task]')?.addEventListener('click', async () => {
      if (state.copyingTask) return;
      const button = document.querySelector('[data-copy-task]');
      state.copyingTask = true;
      button.disabled = true;
      try {
        await navigator.clipboard.writeText(state.taskText);
        document.querySelector('[data-task-copy-status]').textContent = 'Tarea técnica copiada';
      } finally {
        state.copyingTask = false;
        button.disabled = false;
      }
    });
    const taskModal = document.querySelector('[data-task-dialog]');
    taskModal?.addEventListener('keydown', trapTaskFocus);
    taskModal?.addEventListener('cancel', event => {
      event.preventDefault();
      closeTaskDialog();
    });
    taskModal?.addEventListener('click', event => {
      if (event.target === taskModal) closeTaskDialog();
    });
    document.querySelector('[data-incident-add-comment]')?.addEventListener('click', () => addComment().catch(error => status(error.message, true)));
    document.querySelector('[data-incident-confirm-fixed]')?.addEventListener('click', () => confirmFixed().catch(error => status(error.message, true)));
    document.querySelector('[data-incident-back]')?.addEventListener('click', closeDetail);
  }
  async function init() {
    try {
      const context = await waitForContext();
      state = { ...state, sb: context.sb, profile: context.perfil };
      const isManager = state.profile.rol === 'gerencia';
      document.title = isManager ? 'KORA · Centro de Incidencias' : 'KORA · Ver incidencias';
      const title = document.querySelector('[data-incident-title]');
      const breadcrumb = document.querySelector('[data-incident-breadcrumb]');
      const subtitle = document.querySelector('[data-incident-subtitle]');
      if (title) title.textContent = isManager ? 'Centro de Incidencias' : 'Ver incidencias';
      if (breadcrumb) breadcrumb.textContent = isManager ? 'KORA / Administración' : 'KORA / Incidencias';
      if (subtitle) subtitle.textContent = isManager
        ? 'Asigna, prioriza, responde, resuelve y cierra incidencias.'
        : 'Consulta estados, respuestas, responsables, historial y soluciones aplicadas.';
      if (state.mode === 'admin') {
        const [adminPermission, commentPermission] = await Promise.all([
          state.sb.rpc('kora_incident_has_permission', { p_permission: 'incident_admin' }),
          state.sb.rpc('kora_incident_has_permission', { p_permission: 'incident_comment' }),
        ]);
        if (adminPermission.error || commentPermission.error) throw adminPermission.error || commentPermission.error;
        state.canAdmin = Boolean(adminPermission.data);
        state.canComment = Boolean(commentPermission.data);
        const managementPanel = document.querySelector('[data-detail-management]');
        if (managementPanel) managementPanel.hidden = !state.canAdmin;
      }
      fillStateOptions();
      bind();
      if (state.canAdmin) await loadAssignees();
      await Promise.all([
        state.canAdmin ? loadMetrics() : Promise.resolve(),
        loadIncidents(),
      ]);
      const requestedId = new URLSearchParams(location.search).get('id');
      if (requestedId) {
        const requested = state.incidents.find(item => item.id === requestedId);
        if (requested) await openDetail(requested);
      }
    } catch (error) {
      status(error.message || 'No fue posible cargar las incidencias.', true);
    }
  }
  init();
})();
