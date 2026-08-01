(function (global) {
  'use strict';

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const STATUS_LABELS = Object.freeze({
    nuevo: 'Nuevo',
    en_revision: 'En revisión',
    confirmado: 'Confirmado',
    en_desarrollo: 'En desarrollo',
    corregido: 'Resuelto',
    pendiente_validacion: 'Pendiente de validación',
    cerrado: 'Cerrado',
    rechazado: 'Rechazado',
    no_reproducible: 'No reproducible',
    duplicado: 'Duplicado',
  });
  const STATUS_ORDER = Object.freeze({
    nuevo: 0,
    pendiente_validacion: 1,
    en_revision: 2,
    confirmado: 2,
    en_desarrollo: 2,
    corregido: 3,
    cerrado: 4,
    rechazado: 4,
    no_reproducible: 4,
    duplicado: 4,
  });

  function statusLabel(value) {
    return STATUS_LABELS[value] || String(value || '').replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase());
  }

  function statusTone(value) {
    return ['corregido', 'cerrado', 'rechazado', 'no_reproducible', 'duplicado'].includes(value)
      ? 'managed'
      : 'pending';
  }

  function displayName(person) {
    if (person && typeof person === 'object') {
      const name = String(person.nombre || person.name || '').trim();
      if (name && !UUID.test(name)) return name;
      const email = String(person.email || '').trim();
      if (email && !UUID.test(email)) return email;
    }
    const raw = typeof person === 'string' ? person.trim() : '';
    return raw && !UUID.test(raw) ? raw : 'Usuario sin nombre';
  }

  function validateManagement(input = {}) {
    const status = String(input.status || '').trim();
    const errors = {};
    if (status === 'corregido') {
      if (!String(input.resolution || '').trim()) errors.resolution = 'Escribe la resolución aplicada.';
      if (!String(input.fixedVersion || '').trim()) errors.fixedVersion = 'Indica la versión corregida.';
    }
    return { ok: Object.keys(errors).length === 0, errors };
  }

  function sortIncidents(records = []) {
    return [...records].sort((left, right) => {
      const statusDifference = (STATUS_ORDER[left.status] ?? 4) - (STATUS_ORDER[right.status] ?? 4);
      if (statusDifference) return statusDifference;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  }

  function paginateIncidents(records = [], page = 1, pageSize = 20) {
    const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * pageSize;
    return {
      currentPage,
      totalPages,
      items: records.slice(start, start + pageSize),
    };
  }

  function personFor(id, people) {
    if (!id) return 'Usuario sin nombre';
    return displayName(people?.get?.(id) || { id });
  }

  function historyText(event = {}, people = new Map()) {
    const next = event.new_value || {};
    const responsible = personFor(event.responsible_user_id, people);
    switch (event.event_type) {
      case 'created':
        return `Incidencia creada por ${responsible}.`;
      case 'evidence_added':
        return 'Evidencia adjuntada.';
      case 'assignment_changed':
        return `Asignada a ${personFor(next.assigned_to, people)}.`;
      case 'status_changed':
        if (next.status === 'en_revision') return 'Estado cambiado a En revisión.';
        if (next.status === 'corregido') {
          const version = next.fixed_version ? ` en la versión ${next.fixed_version}` : '';
          return `Incidencia resuelta${version}.`;
        }
        return `Estado cambiado a ${statusLabel(next.status)}.`;
      case 'priority_changed':
        return `Prioridad cambiada a ${statusLabel(next.priority)}.`;
      case 'comment_added':
        return `Comentario agregado por ${responsible}.`;
      case 'information_requested':
        return `Información adicional solicitada por ${responsible}.`;
      default:
        return event.comment || 'Actividad registrada.';
    }
  }

  global.KoraIncidentManagement = Object.freeze({
    displayName,
    historyText,
    paginateIncidents,
    sortIncidents,
    statusLabel,
    statusTone,
    validateManagement,
  });
})(typeof window !== 'undefined' ? window : globalThis);
