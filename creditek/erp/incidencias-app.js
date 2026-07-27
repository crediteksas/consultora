(function () {
  'use strict';

  const STATES = ['nuevo', 'en_revision', 'confirmado', 'en_desarrollo', 'corregido', 'pendiente_validacion', 'cerrado', 'rechazado', 'no_reproducible', 'duplicado'];
  const label = value => String(value || '').replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase());
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
  let state = { sb: null, profile: null, mode: document.body.dataset.incidentMode, incidents: [], selected: null };

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
    if (state.mode !== 'admin') return state.incidents;
    const read = name => document.querySelector(`[data-incident-filter="${name}"]`)?.value?.trim().toLowerCase() || '';
    const code = read('code');
    const selectedDate = read('date');
    return state.incidents.filter(item =>
      (!code || item.incident_code.toLowerCase().includes(code) || item.title.toLowerCase().includes(code))
      && (!read('status') || item.status === read('status'))
      && (!read('priority') || item.priority === read('priority'))
      && (!read('module') || item.module.toLowerCase().includes(read('module')))
      && (!selectedDate || item.created_at.slice(0, 10) >= selectedDate));
  }
  function renderList() {
    const body = document.querySelector('[data-incident-list]');
    body.replaceChildren();
    const records = filteredIncidents();
    if (!records.length) {
      const row = el('tr');
      const cell = el('td', 'No hay incidencias para mostrar.');
      cell.colSpan = state.mode === 'admin' ? 11 : 7;
      row.append(cell); body.append(row); return;
    }
    records.forEach(item => {
      const row = el('tr');
      const codeButton = el('button', item.incident_code);
      codeButton.type = 'button';
      codeButton.addEventListener('click', () => openDetail(item));
      const cells = state.mode === 'admin'
        ? [codeButton, formatDate(item.created_at), item.title, item.store_name_snapshot || '—', item.module, label(item.priority), label(item.status), item.user_name_snapshot, item.assigned_to || 'Sin asignar', item.kora_version, age(item.created_at)]
        : [codeButton, formatDate(item.created_at), item.title, item.module, label(item.priority), label(item.status), formatDate(item.updated_at)];
      cells.forEach(value => {
        const cell = el('td');
        if (value instanceof Node) cell.append(value); else cell.textContent = value;
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
  async function openDetail(item) {
    state.selected = item;
    const detail = document.querySelector('[data-incident-detail]');
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
    const historyNode = detail.querySelector('[data-incident-history]');
    historyNode.replaceChildren(...(history || []).map(event => el('li', `${formatDate(event.created_at)} · ${label(event.event_type)}${event.comment ? ` · ${event.comment}` : ''}`)));
    const commentsNode = detail.querySelector('[data-incident-comments]');
    commentsNode.replaceChildren(...(comments || []).map(comment => el('p', `${comment.author_name_snapshot}: ${comment.body}`)));
    if (state.mode === 'admin') {
      detail.querySelector('[data-detail-status]').value = item.status;
      detail.querySelector('[data-detail-priority]').value = item.priority;
      detail.querySelector('[data-detail-assignee]').value = item.assigned_to || '';
      detail.querySelector('[data-detail-resolution]').value = item.resolution_summary || '';
      detail.querySelector('[data-detail-version]').value = item.fixed_version || '';
    }
    detail.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  async function saveAdmin() {
    const detail = document.querySelector('[data-incident-detail]');
    const assignee = detail.querySelector('[data-detail-assignee]').value.trim();
    const { error } = await state.sb.rpc('kora_update_incident', {
      p_incident_id: state.selected.id,
      p_status: detail.querySelector('[data-detail-status]').value,
      p_priority: detail.querySelector('[data-detail-priority]').value,
      p_assigned_to: assignee || null,
      p_resolution_summary: detail.querySelector('[data-detail-resolution]').value || null,
      p_fixed_version: detail.querySelector('[data-detail-version]').value || null,
    });
    if (error) throw error;
    status('Incidencia actualizada correctamente.');
    await Promise.all([loadMetrics(), loadIncidents()]);
  }
  function taskDialog() {
    const dialog = document.querySelector('[data-task-dialog]');
    dialog.querySelector('textarea').value = window.KoraIncidentDomain.generateTechnicalTask(state.selected);
    dialog.showModal();
  }
  async function addComment() {
    const input = document.querySelector('[data-comment-text]');
    const { error } = await state.sb.rpc('kora_add_incident_comment', {
      p_incident_id: state.selected.id, p_body: input.value, p_is_internal: false,
    });
    if (error) throw error;
    input.value = '';
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
    document.querySelector('[data-incident-filters]')?.addEventListener('input', renderList);
    document.querySelector('[data-detail-save]')?.addEventListener('click', () => saveAdmin().catch(error => status(error.message, true)));
    document.querySelector('[data-generate-task]')?.addEventListener('click', taskDialog);
    document.querySelector('[data-close-task]')?.addEventListener('click', () => document.querySelector('[data-task-dialog]').close());
    document.querySelector('[data-copy-task]')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(document.querySelector('[data-task-dialog] textarea').value);
      status('Tarea técnica copiada.');
    });
    document.querySelector('[data-incident-add-comment]')?.addEventListener('click', () => addComment().catch(error => status(error.message, true)));
    document.querySelector('[data-incident-confirm-fixed]')?.addEventListener('click', () => confirmFixed().catch(error => status(error.message, true)));
  }
  async function init() {
    try {
      const context = await waitForContext();
      state = { ...state, sb: context.sb, profile: context.perfil };
      if (state.mode === 'admin') {
        const { data, error } = await state.sb.rpc('kora_incident_has_permission', { p_permission: 'incident_admin' });
        if (error || !data) throw new Error('No tienes permiso para administrar incidencias.');
      }
      fillStateOptions();
      bind();
      await Promise.all([loadMetrics(), loadIncidents()]);
    } catch (error) {
      status(error.message || 'No fue posible cargar las incidencias.', true);
    }
  }
  init();
})();
