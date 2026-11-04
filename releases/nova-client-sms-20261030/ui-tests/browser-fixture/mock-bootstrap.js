(() => {
  const expectedOrigin = 'https://creditek-clientes.comercial-853.workers.dev';
  const requests = [], blocked = [], attempts = new Map(), reports = [];
  let savedFile = null, savedInput = null, savedFields = null, shift = 0;
  const realNow = Date.now.bind(Date), realTimeout = window.setTimeout.bind(window), realClear = window.clearTimeout.bind(window);
  const timers = new Map();
  Date.now = () => realNow() + shift;
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = realTimeout(() => { timers.delete(id); fn(...args); }, ms);
    timers.set(id, { due: Date.now() + Number(ms), fn: () => fn(...args) });
    return id;
  };
  window.clearTimeout = id => { timers.delete(id); realClear(id); };
  window.addEventListener('securitypolicyviolation', event => blocked.push(event.blockedURI));
  const reply = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
  const own = id => document.getElementById(id);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.origin !== expectedOrigin) { blocked.push(url.origin); throw new TypeError('Only fixed in-memory mocks are allowed'); }
    requests.push({ path: url.pathname, method: options.method || 'GET', channel: body.channel || null, request_id: body.request_id || null });
    if (url.pathname === '/api/registro/contexto') return reply({ contexto: { origen: { codigo: 'CK-01', nombre: 'PRUEBA LOCAL SIN ENVIAR' }, tipo: 'personal', captadores: [{ id: 'synthetic-seller', nombre: 'Vendedor de prueba' }] } });
    if (url.pathname === '/api/registro/config') return reply({ nova_registration: { enabled: true, policy_hash: 'e482ba5840a84938043c159e6787f07fb8748bf2e784b4e56946991d5de4af11', text_version: 'nova-pilot-20260915-v1', retail_enabled: true }, turnstile_site_key: 'mock-only' });
    if (url.pathname === '/api/otp/opciones') { const enabled = own('mockPilotEnabled').checked && body.celular === '3000000000'; own('mockCapabilityStatus').textContent = enabled ? 'Capacidad simulada: SMS habilitado para este celular' : 'Capacidad simulada: SMS no habilitado para este celular'; return reply({ smsEnabled: enabled }); }
    if (url.pathname === '/api/otp/enviar') {
      const mode = own('mockSendMode').value;
      const attempt = { request_id: body.request_id, channel: body.channel, otp_id: crypto.randomUUID() };
      attempts.set(body.request_id, attempt);
      if (mode === 'network') throw new TypeError('Synthetic response lost after reservation');
      if (['reserved', 'uncertain'].includes(mode)) return reply({ ok: false, pending: true, ...attempt, state: mode, retry_after: 300 }, 202);
      if (mode === 'failed') return reply({ ok: false, ...attempt, state: 'failed', retry_after: 60, error: 'Synthetic provider failure' });
      if (mode === 'not_sent') return reply({ ok: false, ...attempt, state: 'not_sent', retry_after: 0 });
      return reply({ ok: true, ...attempt, state: 'accepted' });
    }
    if (url.pathname === '/api/otp/estado') {
      const attempt = attempts.get(body.request_id);
      if (!attempt) return reply({ ok: false, state: 'unknown' }, 404);
      const mode = own('mockStatusMode').value;
      if (mode === 'network') throw new TypeError('Synthetic status unavailable');
      if (mode === 'verified') return reply({ ok: false, ...attempt, state: 'verified', retry_after: 0 }, 409);
      if (mode === 'accepted') return reply({ ok: true, ...attempt, state: 'accepted', retry_after: 200 });
      if (mode === 'failed_wait') return reply({ ok: false, ...attempt, state: 'failed', retry_after: 60 });
      if (mode === 'failed_terminal') return reply({ ok: false, ...attempt, state: 'failed', retry_after: 0 });
      if (['reserved', 'uncertain'].includes(mode)) return reply({ ok: false, pending: true, ...attempt, state: mode, retry_after: 100 }, 202);
      return reply({ ok: false, ...attempt, state: 'expired', retry_after: 0 });
    }
    blocked.push(url.pathname); throw new TypeError('No live endpoint is reachable from this fixture');
  };
  let securityCallback;
  window.turnstile = {
    render(selector, options) { securityCallback = options.callback; own('turnstileContainer').textContent = 'Turnstile simulado · no se contacta Cloudflare'; queueMicrotask(() => securityCallback('mock-turnstile')); return 1; },
    reset() { queueMicrotask(() => securityCallback?.('mock-turnstile')); },
  };
  window.addEventListener('DOMContentLoaded', () => {
    own('mockPilotEnabled').addEventListener('change', () => own('celular').dispatchEvent(new Event('input', { bubbles: true })));
    own('mockLoadFile').addEventListener('click', () => {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZbkAAAAASUVORK5CYII='), c => c.charCodeAt(0));
      const file = new File([bytes], 'nova-local-front.png', { type: 'image/png', lastModified: 1 });
      const input = own('fotoFrente'), dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
      savedFile = input.files[0]; savedInput = input;
      savedFields = Object.fromEntries(['nombreCompleto', 'cedula', 'celular'].map(id => [id, own(id).value]));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      own('mockFixtureState').textContent = 'Foto sintética cargada con DataTransfer. Se fijó su objeto File y los tres datos como control.';
    });
    for (const [id, ms] of [['mockAdvance16', 16000], ['mockAdvance6m', 360000]]) own(id).addEventListener('click', () => {
      shift += ms;
      for (const [key, timer] of [...timers]) if (timer.due <= Date.now()) { timers.delete(key); realClear(key); timer.fn(); }
      own('nombreCompleto').dispatchEvent(new Event('input', { bubbles: true }));
      own('mockClock').textContent = 'Reloj local simulado: +' + shift / 1000 + ' segundos. No se enviaron mensajes por este avance.';
    });
    own('mockReport').addEventListener('click', () => {
      const current = Object.fromEntries(['nombreCompleto', 'cedula', 'celular'].map(id => [id, own(id).value]));
      const report = {
        step: own('mockStep').value,
        candidateSha256: document.querySelector('meta[name="nova-candidate-sha256"]').content,
        browser: navigator.userAgent,
        fileName: own('fotoFrente').files[0]?.name,
        fileBytes: own('fotoFrente').files[0]?.size,
        sameFileObject: !!savedFile && own('fotoFrente').files[0] === savedFile,
        sameFileInputNode: !!savedInput && own('fotoFrente') === savedInput,
        fieldsPreserved: !!savedFields && JSON.stringify(current) === JSON.stringify(savedFields),
        currentName: current.nombreCompleto,
        otpText: own('otpStatus').textContent,
        whatsappDisabled: own('btnEnviarOtp').disabled,
        smsDisabled: own('btnEnviarOtpSms').disabled,
        smsHidden: own('btnEnviarOtpSms').hidden,
        statusVisible: !own('btnConsultarOtp').hidden,
        verifyEnabled: !own('btnVerificarOtp').disabled,
        codeVisible: own('codeRow').classList.contains('show'),
        simulatedRequests: [...requests],
        unexpectedOrBlockedRequests: [...blocked],
        actualNetworkApiRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('workers.dev')).length,
        allPreserved: !!savedFile && own('fotoFrente').files[0] === savedFile && own('fotoFrente') === savedInput && !!savedFields && JSON.stringify(current) === JSON.stringify(savedFields),
      };
      reports.push(report); own('mockResults').textContent = JSON.stringify({ source: 'local form candidate, only in-memory mocks', reports }, null, 2);
    });
  });
})();
