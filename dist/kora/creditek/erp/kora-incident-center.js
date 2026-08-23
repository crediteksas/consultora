(function (global) {
  'use strict';

  const BUCKET = 'kora-incident-evidence';
  const DB_NAME = 'kora-incident-queue';
  const STORE = 'reports';
  let mounted = false;
  const consoleErrors = [];

  function domain() { return global.KoraIncidentDomain; }
  function safe(value) { return domain()?.redactSensitive?.(String(value || '')) || ''; }
  function validationMessages(result) {
    if (!result || result.ok) return [];
    if (Array.isArray(result.errors)) return result.errors;
    if (result.errors && typeof result.errors === 'object') return Object.values(result.errors);
    return [result.error || 'Revisa la información ingresada.'];
  }
  function extension(file) {
    const ext = String(file?.name || '').split('.').pop().toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext.replace(/[^a-z0-9]/g, '');
  }
  function pageContext(profile, version) {
    const pageName = document.querySelector('h1')?.textContent?.trim()
      || document.title.split(/[·|-]/).pop()?.trim() || 'KORA';
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    return {
      module: document.querySelector('.kora-nav-link[aria-current="page"]')?.closest('.kora-nav-group')
        ?.querySelector('.kora-nav-group__label span')?.textContent?.trim() || 'KORA',
      page_name: pageName,
      page_url: url.toString(),
      user_name_snapshot: safe(profile.nombre),
      role_snapshot: safe(profile.rol),
      store_code: safe(document.querySelector('#koraStoreSelector')?.value || profile.tienda_codigo),
      kora_version: safe(version),
      deployment_version: safe(document.documentElement.dataset.deployment || ''),
      browser: safe(navigator.userAgentData?.brands?.map(item => `${item.brand} ${item.version}`).join(', ') || navigator.userAgent),
      operating_system: safe(navigator.userAgentData?.platform || navigator.platform),
      screen_resolution: `${screen.width}x${screen.height}`,
      viewport: `${innerWidth}x${innerHeight}`,
      connection_status: navigator.onLine ? 'online' : 'offline',
      session_identifier: sessionIdentifier(),
      console_errors: consoleErrors.slice(-5).map(safe),
    };
  }
  function sessionIdentifier() {
    const key = 'kora_incident_session';
    let value = sessionStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      sessionStorage.setItem(key, value);
    }
    return value;
  }
  function captureErrors() {
    global.addEventListener('error', event => {
      if (event.message) consoleErrors.push(event.message);
      if (consoleErrors.length > 10) consoleErrors.shift();
    });
    global.addEventListener('unhandledrejection', event => {
      consoleErrors.push(event.reason?.message || String(event.reason || 'Promesa rechazada'));
      if (consoleErrors.length > 10) consoleErrors.shift();
    });
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'localId' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function transaction(mode, action) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }
  const adapter = {
    put: record => transaction('readwrite', store => store.put(record)),
    list: () => transaction('readonly', store => store.getAll()),
    remove: localId => transaction('readwrite', store => store.delete(localId)),
  };
  async function uploadEvidence(sb, incident, file) {
    if (!file) return null;
    const path = `${incident.id}/${crypto.randomUUID()}.${extension(file)}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;
    const { error: attachError } = await sb.rpc('kora_attach_incident_evidence', {
      p_incident_id: incident.id,
      p_path: path,
      p_name: file.name,
      p_mime: file.type,
      p_size: file.size,
    });
    if (attachError) throw attachError;
    return path;
  }
  async function submitRecord(sb, record) {
    const { data, error } = await sb.rpc('kora_create_incident', {
      p_payload: record.payload,
      p_local_incident_id: record.localId,
    });
    if (error) throw error;
    const incident = Array.isArray(data) ? data[0] : data;
    await uploadEvidence(sb, incident, record.file);
    return { ok: true, incidentCode: incident.incident_code };
  }
  function dialogHtml() {
    return `<div class="kora-incident-backdrop" data-kora-incident-backdrop hidden>
      <section class="kora-incident-dialog" role="dialog" aria-modal="true" aria-labelledby="koraIncidentTitle">
        <header class="kora-incident-head"><div><h2 id="koraIncidentTitle">Reportar incidencia</h2><p>Ayúdanos a identificar y corregir el problema.</p></div>
          <button class="kora-incident-close" type="button" aria-label="Cerrar incidencia"><i data-lucide="x"></i></button></header>
        <form class="kora-incident-form" novalidate>
          <div class="kora-incident-field kora-incident-field--full"><label for="koraIncidentShortTitle">Título breve</label><input id="koraIncidentShortTitle" name="title" maxlength="160" required></div>
          <div class="kora-incident-field kora-incident-field--full"><label for="koraIncidentDescription">Descripción del problema</label><textarea id="koraIncidentDescription" name="description" maxlength="5000" required></textarea></div>
          <div class="kora-incident-field kora-incident-field--full"><label for="koraIncidentAction">¿Qué estabas intentando hacer?</label><textarea id="koraIncidentAction" name="attemptedAction" maxlength="2000" required></textarea></div>
          <div class="kora-incident-field"><label for="koraIncidentPriority">Prioridad</label><select id="koraIncidentPriority" name="priority"><option value="baja">Baja</option><option value="media" selected>Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div>
          <div class="kora-incident-field"><label for="koraIncidentEvidence">Captura o evidencia</label><div class="kora-incident-evidence"><input id="koraIncidentEvidence" name="evidence" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"><button type="button" data-kora-remove-evidence hidden>Eliminar archivo</button><div class="kora-incident-preview"></div></div></div>
          <div class="kora-incident-field kora-incident-field--full"><label for="koraIncidentAdditional">Información adicional (opcional)</label><textarea id="koraIncidentAdditional" name="additionalInformation" maxlength="3000"></textarea></div>
          <p class="kora-incident-note">No incluyas contraseñas, documentos personales ni información bancaria en la captura.</p>
          <div class="kora-incident-similar" data-kora-incident-similar hidden></div>
          <p class="kora-incident-status" role="status" aria-live="polite"></p>
          <footer class="kora-incident-actions"><button type="button" data-kora-open-incidents>Consultar incidencias</button><button type="button" data-kora-incident-cancel>Cancelar</button><button type="submit">Enviar incidencia</button></footer>
        </form>
      </section></div>`;
  }
  function focusable(root) {
    return [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]')];
  }
  function mount({ sb, profile, koraVersion = '2.0.1' } = {}) {
    if (mounted || !sb || !profile || !domain()) return;
    const footer = document.querySelector('.kora-sidebar__footer');
    if (!footer) return;
    mounted = true;
    captureErrors();
    const triggerTemplate = document.createElement('template');
    triggerTemplate.innerHTML = '<button type="button" class="kora-incident-trigger" data-kora-report-incident aria-label="Reportar incidencia" title="Reportar incidencia"><i data-lucide="bug"></i><span>Reportar incidencia</span></button>';
    const trigger = triggerTemplate.content.firstElementChild;
    const showNormalReportFlow = profile.rol !== 'gerencia';
    if (showNormalReportFlow) footer.prepend(trigger);
    document.body.insertAdjacentHTML('beforeend', dialogHtml());
    const backdrop = document.querySelector('[data-kora-incident-backdrop]');
    const dialog = backdrop.querySelector('.kora-incident-dialog');
    const form = backdrop.querySelector('form');
    const status = backdrop.querySelector('.kora-incident-status');
    const preview = backdrop.querySelector('.kora-incident-preview');
    const fileInput = form.elements.evidence;
    const removeFile = backdrop.querySelector('[data-kora-remove-evidence]');
    let previousFocus;
    let previewUrl;
    const close = () => {
      backdrop.hidden = true;
      document.body.style.overflow = '';
      previousFocus?.focus();
    };
    const open = () => {
      previousFocus = document.activeElement;
      backdrop.hidden = false;
      document.body.style.overflow = 'hidden';
      form.elements.title.focus();
      global.KoraAudio?.play?.('interaction');
    };
    trigger.addEventListener('click', open);
    if (showNormalReportFlow && location.hash === '#reportar') queueMicrotask(open);
    backdrop.querySelector('.kora-incident-close').addEventListener('click', close);
    backdrop.querySelector('[data-kora-incident-cancel]').addEventListener('click', close);
    backdrop.querySelector('[data-kora-open-incidents]').addEventListener('click', () => {
      location.assign('/creditek/erp/incidencias.html');
    });
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const items = focusable(dialog);
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    });
    function clearFile() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = '';
      fileInput.value = '';
      preview.replaceChildren();
      removeFile.hidden = true;
    }
    removeFile.addEventListener('click', clearFile);
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = '';
      preview.replaceChildren();
      removeFile.hidden = true;
      const validation = domain().validateEvidence(file);
      if (!validation.ok) {
        status.textContent = validationMessages(validation).join(' ');
        status.dataset.kind = 'error';
        return;
      }
      removeFile.hidden = false;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
        const image = document.createElement('img');
        image.src = previewUrl;
        image.alt = 'Vista previa de la evidencia';
        preview.append(image);
      } else preview.textContent = file.name;
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      status.textContent = '';
      const input = Object.fromEntries(new FormData(form));
      delete input.evidence;
      const validation = domain().validateIncidentInput(input);
      const file = fileInput.files?.[0];
      const evidenceValidation = domain().validateEvidence(file);
      if (!validation.ok || !evidenceValidation.ok) {
        status.textContent = [...validationMessages(validation), ...validationMessages(evidenceValidation)].join(' ');
        status.dataset.kind = 'error';
        global.KoraAudio?.play?.('error');
        return;
      }
      const technicalContext = pageContext(profile, koraVersion);
      const payload = {
        title: validation.value.title,
        description: validation.value.description,
        attempted_action: validation.value.attemptedAction,
        additional_information: validation.value.additionalInformation,
        priority: validation.value.priority,
        ...technicalContext,
        technical_context: technicalContext,
      };
      const similarBox = backdrop.querySelector('[data-kora-incident-similar]');
      try {
        const { data: similar } = await sb.rpc('kora_find_similar_incidents', {
          p_title: payload.title, p_module: payload.module, p_page_name: payload.page_name,
          p_store_code: payload.store_code || null, p_kora_version: payload.kora_version,
        });
        if (similar?.length) {
          similarBox.hidden = false;
          similarBox.textContent = `Podría existir un reporte similar: ${similar.map(item => item.incident_code).join(', ')}. Puedes continuar con uno nuevo.`;
        }
      } catch (_) { /* La sugerencia nunca bloquea el reporte. */ }
      const submit = form.querySelector('[type=submit]');
      submit.disabled = true;
      const record = { localId: crypto.randomUUID(), payload, file, createdAt: new Date().toISOString() };
      try {
        if (!navigator.onLine) {
          await new (domain().IncidentOfflineQueue)(adapter).enqueue(record);
          status.textContent = 'Sin conexión. Reporte guardado como pendiente de envío.';
        } else {
          const result = await submitRecord(sb, record);
          status.textContent = `Reporte enviado correctamente. Código: ${result.incidentCode}`;
        }
        status.dataset.kind = 'success';
        global.KoraAudio?.play?.('success');
        form.reset();
        clearFile();
      } catch (error) {
        status.textContent = safe(error.message || 'No fue posible enviar el reporte.');
        status.dataset.kind = 'error';
        global.KoraAudio?.play?.('error');
      } finally { submit.disabled = false; }
    });
    const queue = new (domain().IncidentOfflineQueue)(adapter);
    global.addEventListener('online', async () => {
      try {
        const results = await queue.sync(record => submitRecord(sb, record));
        if (results.some(result => result.ok)) global.KoraAudio?.play?.('success');
      } catch (_) { /* Se conserva para el próximo intento. */ }
    });
    global.lucide?.createIcons();
  }

  global.KoraIncidentCenter = { mount, submitRecord, createSignedEvidenceUrl: (sb, path) => sb.storage.from(BUCKET).createSignedUrl(path, 60) };
  document.dispatchEvent(new CustomEvent('kora-incident-ready'));
})(window);
