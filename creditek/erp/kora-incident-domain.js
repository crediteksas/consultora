(function initKoraIncidentDomain(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KoraIncidentDomain = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, function createKoraIncidentDomain() {
  'use strict';

  const PRIORITIES = new Set(['baja', 'media', 'alta', 'critica']);
  const EVIDENCE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
  ]);
  const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
  const CLOSED_STATUSES = new Set(['cerrado', 'rechazado', 'no_reproducible', 'duplicado']);
  const STATUS_TRANSITIONS = Object.freeze({
    nuevo: new Set(['en_revision', 'rechazado', 'duplicado']),
    en_revision: new Set(['confirmado', 'no_reproducible', 'rechazado', 'duplicado']),
    confirmado: new Set(['en_desarrollo', 'rechazado', 'duplicado']),
    en_desarrollo: new Set(['corregido', 'no_reproducible']),
    corregido: new Set(['pendiente_validacion', 'cerrado', 'en_desarrollo']),
    pendiente_validacion: new Set(['cerrado', 'en_desarrollo']),
    cerrado: new Set(),
    reabierto: new Set(['en_revision', 'en_desarrollo', 'corregido', 'cerrado']),
    rechazado: new Set(),
    no_reproducible: new Set(['en_revision']),
    duplicado: new Set(['en_revision']),
  });
  const ROLE_PERMISSIONS = Object.freeze({
    asesor: new Set([
      'incident_create',
      'incident_view_own',
      'incident_view_store',
      'incident_comment',
    ]),
    admin_tienda: new Set([
      'incident_create',
      'incident_view_own',
      'incident_view_store',
      'incident_comment',
    ]),
    gerencia: new Set([
      'incident_create',
      'incident_view_own',
      'incident_view_store',
      'incident_view_all',
      'incident_comment',
      'incident_assign',
      'incident_change_priority',
      'incident_change_status',
      'incident_close',
      'incident_admin',
      'incident_generate_task',
    ]),
    auditoria: new Set([
      'incident_create',
      'incident_view_all',
      'incident_comment',
    ]),
    soporte: new Set([
      'incident_create',
      'incident_view_all',
      'incident_comment',
    ]),
  });

  function normalizedText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  function validateIncidentInput(input) {
    const value = {
      title: normalizedText(input?.title),
      description: normalizedText(input?.description),
      attemptedAction: normalizedText(input?.attemptedAction),
      additionalInformation: normalizedText(input?.additionalInformation),
      priority: normalizedText(input?.priority).toLocaleLowerCase('es'),
    };
    const errors = {};
    if (value.title.length < 5 || value.title.length > 160) {
      errors.title = 'Escribe un título de 5 a 160 caracteres.';
    }
    if (value.description.length < 10 || value.description.length > 5000) {
      errors.description = 'Describe el problema en 10 a 5.000 caracteres.';
    }
    if (value.attemptedAction.length < 5 || value.attemptedAction.length > 2000) {
      errors.attemptedAction = 'Explica qué intentabas hacer.';
    }
    if (value.additionalInformation.length > 3000) {
      errors.additionalInformation = 'La información adicional supera 3.000 caracteres.';
    }
    if (!PRIORITIES.has(value.priority)) {
      errors.priority = 'Selecciona una prioridad válida.';
    }
    if (Object.keys(errors).length) return { ok: false, errors };
    return { ok: true, value };
  }

  function validateEvidence(file) {
    if (!file) return { ok: true, value: null };
    const name = String(file.name || '');
    const extension = name.includes('.') ? name.split('.').pop().toLocaleLowerCase('en') : '';
    const allowedExtension = new Set(['png', 'jpg', 'jpeg', 'webp', 'pdf']);
    if (!EVIDENCE_TYPES.has(file.type) || !allowedExtension.has(extension)) {
      return { ok: false, error: 'Adjunta PNG, JPG, WebP o PDF.' };
    }
    if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) {
      return { ok: false, error: 'El archivo está vacío.' };
    }
    if (Number(file.size) > MAX_EVIDENCE_BYTES) {
      return { ok: false, error: 'El archivo no puede superar 10 MB.' };
    }
    return { ok: true, value: file };
  }

  function redactSensitive(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    return text
      .replace(/\b(authorization\s*:\s*bearer)\s+[^\s,;]+/gi, '$1 [REDACTADO]')
      .replace(/\b(access[_-]?token|refresh[_-]?token|password|contrase(?:ña|na)|cookie|service[_-]?role)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTADO]')
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTADO]')
      .replace(/([?&](?:token|signature|sig|key)=)[^&\s]+/gi, '$1[REDACTADO]');
  }

  function normalizedTokens(value) {
    return normalizedText(value)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('es')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2 && !new Set(['para', 'con', 'una', 'del', 'los', 'las']).has(token));
  }

  function titleSimilarity(left, right) {
    const a = new Set(normalizedTokens(left));
    const b = new Set(normalizedTokens(right));
    if (!a.size || !b.size) return 0;
    let shared = 0;
    a.forEach(token => {
      if (b.has(token)) shared += 1;
    });
    return shared / Math.max(a.size, b.size);
  }

  function findSimilarIncidents(candidate, incidents) {
    return (incidents || [])
      .filter(incident => !CLOSED_STATUSES.has(incident.status))
      .filter(incident => incident.module === candidate.module)
      .filter(incident => !candidate.pageName || incident.page_name === candidate.pageName)
      .filter(incident => !candidate.storeCode || incident.store_code === candidate.storeCode)
      .filter(incident => !candidate.koraVersion || incident.kora_version === candidate.koraVersion)
      .map(incident => ({ ...incident, similarity: titleSimilarity(candidate.title, incident.title) }))
      .filter(incident => incident.similarity >= 0.45)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  function safeTaskValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    return redactSensitive(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }

  function generateTechnicalTask(incident) {
    const hasEvidence = Boolean(incident.evidence_path);
    return [
      `INCIDENCIA ${safeTaskValue(incident.incident_code)}`,
      '',
      `Versión: ${safeTaskValue(incident.kora_version)}`,
      `Módulo: ${safeTaskValue(incident.module)}`,
      `Pantalla: ${safeTaskValue(incident.page_name)}`,
      `Prioridad: ${safeTaskValue(incident.priority)}`,
      `Tienda: ${safeTaskValue(incident.store_name_snapshot || incident.store_code)}`,
      `Rol: ${safeTaskValue(incident.role_snapshot)}`,
      `Descripción: ${safeTaskValue(incident.description)}`,
      `Acción intentada: ${safeTaskValue(incident.attempted_action)}`,
      'Pasos conocidos:',
      'Resultado actual:',
      'Resultado esperado:',
      `Evidencia: ${hasEvidence ? 'Disponible de forma privada en KORA' : 'Sin evidencia adjunta'}`,
      `Datos técnicos: ${safeTaskValue(incident.technical_context || {
        browser: incident.browser,
        operatingSystem: incident.operating_system,
        viewport: incident.viewport,
        connection: incident.connection_status,
      })}`,
      `Historial: ${safeTaskValue(incident.history)}`,
      'Restricciones:',
      'No modificar:',
      'Pruebas requeridas:',
    ].join('\n');
  }

  class IncidentOfflineQueue {
    constructor(adapter) {
      if (!adapter?.put || !adapter?.list || !adapter?.remove) {
        throw new TypeError('La cola requiere un adaptador persistente.');
      }
      this.adapter = adapter;
      this.syncing = false;
    }

    async enqueue(record) {
      if (!record?.localId) throw new TypeError('localId es obligatorio.');
      await this.adapter.put({ ...record, status: 'pending', queuedAt: record.queuedAt || new Date().toISOString() });
      return record.localId;
    }

    async pending() {
      return this.adapter.list();
    }

    async sync(sender) {
      if (this.syncing) return [];
      this.syncing = true;
      const results = [];
      try {
        for (const record of await this.pending()) {
          try {
            const response = await sender(record);
            if (!response?.ok) throw new Error(response?.error || 'No se pudo sincronizar');
            await this.adapter.remove(record.localId);
            results.push({
              localId: record.localId,
              ok: true,
              incidentCode: response.incidentCode,
            });
          } catch (error) {
            results.push({
              localId: record.localId,
              ok: false,
              error: redactSensitive(error?.message || 'Error de sincronización'),
            });
          }
        }
      } finally {
        this.syncing = false;
      }
      return results;
    }
  }

  function canTransition(from, to) {
    return STATUS_TRANSITIONS[from]?.has(to) === true;
  }

  function hasIncidentPermission(role, permission) {
    return ROLE_PERMISSIONS[role]?.has(permission) === true;
  }

  return {
    IncidentOfflineQueue,
    MAX_EVIDENCE_BYTES,
    PRIORITIES,
    ROLE_PERMISSIONS,
    STATUS_TRANSITIONS,
    canTransition,
    findSimilarIncidents,
    generateTechnicalTask,
    hasIncidentPermission,
    redactSensitive,
    titleSimilarity,
    validateEvidence,
    validateIncidentInput,
  };
});
