import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { File } from 'node:buffer';
import { setImmediate as tick } from 'node:timers/promises';

const html = fs.readFileSync(new URL('../form.html', import.meta.url), 'utf8');
const originalHtml = fs.readFileSync(new URL('../form-base.html', import.meta.url), 'utf8');
const mainScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
assert.equal(mainScript.split('\ninitRegistroSeguro();').length, 2);
const withoutInitialNetwork = mainScript.replace('\ninitRegistroSeguro();', '\n// Initialization is tested separately by the primary agent/browser.');
const OTP = '11111111-1111-4111-8111-111111111111';

class Element {
  constructor(id = '') { this.id = id; this.value = ''; this.disabled = false; this.hidden = false; this.checked = false; this.files = []; this.style = {}; this.listeners = new Map(); this.children = []; this.classes = new Set(); this.textContent = ''; this.className = ''; this.classList = { add: (...xs) => xs.forEach(x => this.classes.add(x)), remove: (...xs) => xs.forEach(x => this.classes.delete(x)), contains: x => this.classes.has(x) }; }
  addEventListener(type, handler) { const list = this.listeners.get(type) || []; list.push(handler); this.listeners.set(type, list); }
  async fire(type) { for (const handler of this.listeners.get(type) || []) await handler({ target: this, preventDefault() {} }); }
  append(...children) { for (const child of children) { if (child.parent) child.parent.children = child.parent.children.filter(x => x !== child); this.children.push(child); child.parent = this; } }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  before() {}
  after(...children) { this.afterNodes = children; }
  closest() { return this.field || (this.field = new Element('field:' + this.id)); }
  querySelectorAll() { return []; }
  reset() { throw new Error('Unexpected data-losing form.reset()'); }
  set innerHTML(_) { throw new Error('Unexpected data-losing DOM replacement'); }
}
function fixture(handle) {
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element(id)]));
  for (const id of ['btnEnviarOtpSms', 'btnConsultarOtp', 'otpChannelHelp']) nodes.get(id).hidden = true;
  let now = 1000000, sequence = 0, timerId = 0;
  const timers = new Map(), calls = [], fileSnapshots = [];
  const document = {
    getElementById(id) { assert.ok(nodes.has(id), 'Queried element exists: ' + id); return nodes.get(id); },
    createElement: tag => new Element(tag), querySelectorAll: () => [], head: new Element('head'),
  };
  const window = { addEventListener() {}, turnstile: { reset() {} } };
  const context = vm.createContext({ document, window, location: { search: '?t=synthetic-link' }, URLSearchParams,
    Date: class extends Date { static now() { return now; } }, Set, Map, WeakMap, Promise, Uint8Array,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` },
    AbortSignal: { timeout: () => ({ syntheticSignal: true }) },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path: new URL(url).pathname, body, method: options.method || 'GET' });
      const response = await handle(new URL(url).pathname, body, calls);
      return { status: response.status || 200, ok: (response.status || 200) >= 200 && (response.status || 200) < 300, json: async () => response.data };
    },
  });
  vm.runInContext(withoutInitialNetwork, context);
  const run = source => vm.runInContext(source, context);
  run("contextoValido = true; turnstileToken = 'synthetic-turnstile'; captadorSelect.value = 'synthetic-seller';");
  nodes.get('celular').value = '3000000000'; nodes.get('cedula').value = '12345678'; nodes.get('nombreCompleto').value = 'Persona de prueba';
  for (const id of ['fotoFrente', 'fotoReverso', 'fotoSelfie']) {
    const file = new File(['synthetic-' + id], id + '.jpg', { type: 'image/jpeg' });
    nodes.get(id).files = [file]; fileSnapshots.push(file);
  }
  return { nodes, calls, run, context, fileSnapshots,
    enable: () => run('cargarOpcionesOtp()'),
    captcha: () => run("turnstileToken = 'synthetic-turnstile'; evaluarEnvioOtp();"),
    async click(id) { const node = nodes.get(id); if (!node.disabled && !node.hidden) await node.fire('click'); },
    assertFiles() { for (const [i, id] of ['fotoFrente', 'fotoReverso', 'fotoSelfie'].entries()) assert.equal(nodes.get(id).files[0], fileSnapshots[i]); },
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
  };
}
const options = enabled => ({ data: { smsEnabled: enabled } });
const accepted = (body, retryAfter) => ({ data: { ok: true, channel: body.channel, request_id: body.request_id, otp_id: OTP, state: 'accepted', ...(retryAfter === undefined ? {} : { retry_after: retryAfter }) } });

test('the legacy WhatsApp handler is byte-identical after removing the managed dispatch prefix', () => {
  const extract = source => source.slice(source.indexOf("btnEnviarOtp.addEventListener('click', async () => {"), source.indexOf("codigoOtpInput.addEventListener('input'"));
  const candidateLegacy = extract(html).replace("  if (smsOtpEnabled) return solicitarOtpGestionado('whatsapp');\n  otpLegacyStarted = true;\n", '');
  assert.equal(candidateLegacy, extract(originalHtml));
});

test('options false keeps the exact legacy WhatsApp request and response path', async () => {
  const f = fixture(async path => path.endsWith('/opciones') ? options(false) : ({ data: { ok: true } }));
  await f.enable(); f.captcha(); await f.click('btnEnviarOtp');
  assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true);
  const send = f.calls.find(x => x.path.endsWith('/enviar'));
  assert.deepEqual(Object.keys(send.body).sort(), ['cedula', 'celular', 'enlace_token', 'turnstile_token']);
  assert.equal(f.nodes.get('codeRow').classList.contains('show'), true);
  assert.equal(f.run('otpManagedAttempt'), null);
  f.assertFiles();
});

test('options failure hides SMS and permits the original WhatsApp handler', async () => {
  const f = fixture(async path => { if (path.endsWith('/opciones')) throw Error('offline'); return { data: { ok: true } }; });
  await f.enable(); f.captcha(); await f.click('btnEnviarOtp');
  assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true);
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1);
  assert.equal(f.calls.find(x => x.path.endsWith('/enviar')).body.channel, undefined);
});

test('late options true cannot switch an already-started legacy challenge into managed mode', async () => {
  let resolveOptions;
  const f = fixture(async path => path.endsWith('/opciones') ? new Promise(done => { resolveOptions = done; }) : ({ data: { ok: true } }));
  const loading = f.enable(); f.captcha(); await f.click('btnEnviarOtp');
  resolveOptions(options(true)); await loading;
  assert.equal(f.run('smsOtpEnabled'), false);
  assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true);
  assert.equal(f.calls.find(x => x.path.endsWith('/enviar')).body.request_id, undefined);
});

test('explicit SMS sends one normalized request and preserves File identity, cached photos and receipt', async () => {
  const f = fixture(async (path, body) => path.endsWith('/opciones') ? options(true) : accepted(body));
  await f.enable();
  f.run("photoQualityReceipt='synthetic-receipt'; qualityPhotos={frente:'encoded-front'}; qualityStates.frente={status:'auto_approved'}; qualityBlobCache.set(document.getElementById('fotoFrente').files[0], 'cached-front');");
  const receipt = f.run('photoQualityReceipt'), photos = f.run('qualityPhotos'), states = f.run('qualityStates');
  await f.click('btnEnviarOtpSms');
  const sends = f.calls.filter(x => x.path.endsWith('/enviar'));
  assert.equal(sends.length, 1); assert.equal(sends[0].body.channel, 'sms'); assert.equal(sends[0].body.sms_reason, 'no_whatsapp'); assert.match(sends[0].body.request_id, /^[0-9a-f-]{36}$/);
  assert.equal(f.run('photoQualityReceipt'), receipt); assert.equal(f.run('qualityPhotos'), photos); assert.equal(f.run('qualityStates'), states);
  assert.equal(f.run("qualityBlobCache.get(document.getElementById('fotoFrente').files[0])"), 'cached-front');
  assert.equal(f.nodes.get('nombreCompleto').value, 'Persona de prueba'); assert.equal(f.run('registroSession'), null); assert.equal(f.run('documentosSession'), null);
  assert.match(f.nodes.get('otpStatus').textContent, /no confirmamos su entrega/); f.assertFiles();
});

test('managed default WhatsApp contains its channel and UUID without the SMS reason', async () => {
  const f = fixture(async (path, body) => path.endsWith('/opciones') ? options(true) : accepted(body));
  await f.enable(); await f.click('btnEnviarOtp');
  const send = f.calls.find(x => x.path.endsWith('/enviar'));
  assert.equal(send.body.channel, 'whatsapp'); assert.equal(send.body.sms_reason, undefined);
  assert.equal(f.nodes.get('btnEnviarOtpSms').disabled, true);
});

test('concurrent channel clicks and unrelated form input cannot unlock an in-flight send', async () => {
  let resolveSend;
  const f = fixture(async (path, body) => path.endsWith('/opciones') ? options(true) : new Promise(done => { resolveSend = () => done(accepted(body)); }));
  await f.enable(); const sending = f.click('btnEnviarOtpSms');
  f.run('evaluarEnvioOtp()'); await f.nodes.get('btnEnviarOtp').fire('click');
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1);
  assert.equal(f.nodes.get('celular').disabled, true);
  resolveSend(); await sending; assert.equal(f.nodes.get('celular').disabled, false); f.assertFiles();
});

test('202 pending exposes only explicit status lookup with the original UUID; no automatic resend', async () => {
  let original;
  const f = fixture(async (path, body) => {
    if (path.endsWith('/opciones')) return options(true);
    if (path.endsWith('/enviar')) { original = body; return { status: 202, data: { ok: false, pending: true, channel: body.channel, request_id: body.request_id, state: 'reserved', retry_after: 300 } }; }
    return accepted({ ...original, request_id: body.request_id }, 200);
  });
  await f.enable(); await f.click('btnEnviarOtpSms'); f.captcha(); await f.click('btnEnviarOtp');
  assert.equal(f.nodes.get('btnConsultarOtp').hidden, false); assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1);
  await f.click('btnConsultarOtp');
  const check = f.calls.find(x => x.path.endsWith('/estado'));
  assert.equal(check.method, 'POST'); assert.equal(check.body.request_id, original.request_id);
  assert.deepEqual(Object.keys(check.body).sort(), ['cedula', 'celular', 'enlace_token', 'request_id']);
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1); assert.equal(f.run('otpManagedAttempt.state'), 'accepted'); f.assertFiles();
});

test('uncertainty stays blocked beyond TTL until server declares expiry; a new UUID needs a user click', async () => {
  let state = 'unknown', count = 0;
  const f = fixture(async (path, body) => {
    if (path.endsWith('/opciones')) return options(true);
    if (path.endsWith('/enviar')) { if (++count === 1) throw Error('response lost'); return accepted(body); }
    if (state === 'unknown') throw Error('status unavailable');
    return { data: { ok: false, state: 'expired', request_id: body.request_id, channel: 'sms', retry_after: 0 } };
  });
  await f.enable(); await f.click('btnEnviarOtpSms'); const firstId = f.run('otpManagedAttempt.requestId');
  f.advance(400000); f.captcha(); await f.click('btnEnviarOtp'); await f.click('btnConsultarOtp');
  assert.equal(f.nodes.get('btnEnviarOtp').disabled, true); assert.equal(count, 1);
  state = 'expired'; await f.click('btnConsultarOtp'); f.captcha(); assert.equal(count, 1);
  await f.click('btnEnviarOtp'); assert.equal(count, 2); assert.notEqual(f.run('otpManagedAttempt.requestId'), firstId);
});

test('failed with retry_after stays blocked until terminal state with zero retry_after', async () => {
  let retryAfter = 100;
  const f = fixture(async (path, body) => path.endsWith('/opciones') ? options(true) : ({ data: { ok: false, state: 'failed', channel: 'sms', request_id: body.request_id, retry_after: retryAfter } }));
  await f.enable(); await f.click('btnEnviarOtpSms'); f.advance(400000); f.captcha();
  assert.equal(f.nodes.get('btnEnviarOtp').disabled, true);
  retryAfter = 0; await f.click('btnConsultarOtp'); f.captcha(); assert.equal(f.nodes.get('btnEnviarOtp').disabled, false);
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1);
});

test('active challenge 409 does not invent a foreign OTP ID or permit immediate alternate-channel send', async () => {
  const f = fixture(async path => path.endsWith('/opciones') ? options(true) : ({ status: 409, data: { ok: false, reason: 'active_challenge', retry_after: 100 } }));
  await f.enable(); await f.click('btnEnviarOtpSms'); f.captcha(); await f.click('btnEnviarOtp');
  assert.equal(f.run('otpManagedAttempt.otpId'), null); assert.equal(f.nodes.get('codeRow').classList.contains('show'), false);
  assert.equal(f.nodes.get('btnEnviarOtp').disabled, true); assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1);
});

test('accepted challenge blocks both channels for five minutes; expiry itself sends nothing', async () => {
  const f = fixture(async (path, body) => path.endsWith('/opciones') ? options(true) : accepted(body));
  await f.enable(); await f.click('btnEnviarOtp'); f.captcha(); await f.click('btnEnviarOtpSms');
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1);
  f.advance(300001); f.captcha(); assert.equal(f.nodes.get('btnEnviarOtpSms').disabled, false);
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1);
});

test('SMS verification keeps original verify schema and resumes existing photo nodes without re-registration', async () => {
  const f = fixture(async (path, body) => {
    if (path.endsWith('/opciones')) return options(true);
    if (path.endsWith('/enviar')) return accepted(body);
    if (path.endsWith('/verificar')) return { data: { ok: true, registro_session: 'verified-session' } };
    if (path.endsWith('/nova-retomar')) return { data: { found: true, incomplete: true, quality_session: 'resumed-quality-session', name: 'Persona de prueba', savedTypes: ['frente'] } };
    throw Error('Unexpected route ' + path);
  });
  await f.enable(); await f.click('btnEnviarOtpSms');
  f.run('globalThis.photoReviewCalls=0; queuePhotoReview=()=>{photoReviewCalls++; return Promise.resolve();};');
  f.nodes.get('codigoOtp').value = '123456'; await f.click('btnVerificarOtp');
  const verify = f.calls.find(x => x.path.endsWith('/verificar'));
  assert.deepEqual(Object.keys(verify.body).sort(), ['cedula', 'celular', 'codigo', 'enlace_token']);
  assert.equal(f.run('registroSession'), 'resumed-quality-session'); assert.equal(f.run('recoveryMode'), true);
  assert.equal(f.run("uploadedTypes.has('frente')"), true); assert.equal(f.run('photoReviewCalls'), 1);
  assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true); assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1);
  assert.equal(f.calls.filter(x => x.path === '/api/registro').length, 0); f.assertFiles();
});

test('a mismatching status UUID cannot activate verification of another attempt', async () => {
  const f = fixture(async path => path.endsWith('/opciones') ? options(true) : ({ data: { ok: true, request_id: '22222222-2222-4222-8222-222222222222', channel: 'sms', state: 'accepted', otp_id: OTP } }));
  await f.enable(); await f.click('btnEnviarOtpSms');
  assert.equal(f.run('otpManagedAttempt.state'), 'uncertain'); assert.equal(f.nodes.get('btnVerificarOtp').disabled, true);
});

test('verified in another tab is terminal without inventing a local session or endless status polling', async () => {
  const f = fixture(async (path, body) => {
    if (path.endsWith('/opciones')) return options(true);
    if (path.endsWith('/enviar')) return { status: 202, data: { ok: false, pending: true, request_id: body.request_id, channel: body.channel, state: 'uncertain', retry_after: 300 } };
    return { status: 409, data: { ok: false, request_id: body.request_id, channel: 'sms', state: 'verified', retry_after: 0 } };
  });
  await f.enable(); await f.click('btnEnviarOtpSms'); await f.click('btnConsultarOtp');
  assert.equal(f.run('otpManagedAttempt.state'), 'verified');
  assert.equal(f.run('otpVerificado'), false); assert.equal(f.run('registroSession'), null);
  assert.equal(f.nodes.get('btnConsultarOtp').hidden, true); assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true);
  assert.equal(f.nodes.get('btnEnviarOtp').disabled, true); assert.equal(f.nodes.get('btnVerificarOtp').disabled, true);
  assert.match(f.nodes.get('otpStatus').textContent, /otra pestaña/);
  f.advance(400000); f.captcha(); await f.click('btnEnviarOtp');
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1);
  assert.equal(f.calls.filter(x => x.path.endsWith('/estado')).length, 1);
  f.assertFiles();
});

test('options bind the current valid phone; invalid phone does not request pilot capability', async () => {
  const f = fixture(async () => options(true));
  await f.enable();
  assert.deepEqual(f.calls[0].body, { enlace_token: 'synthetic-link', celular: '3000000000' });
  f.nodes.get('celular').value = '3'; await f.nodes.get('celular').fire('input'); f.advance(1000); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true); f.assertFiles();
});

test('phone input debounces 350ms, hides stale SMS immediately and never requests an OTP automatically', async () => {
  const f = fixture(async () => options(true));
  await f.enable();
  f.nodes.get('celular').value = '3111111111'; await f.nodes.get('celular').fire('input');
  assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true);
  assert.equal(f.run('smsOtpEnabled'), false);
  f.nodes.get('celular').value = '3222222222'; await f.nodes.get('celular').fire('input');
  f.advance(349); await tick(); assert.equal(f.calls.length, 1);
  f.advance(1); await tick();
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].body.celular, '3222222222');
  assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, false);
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 0); f.assertFiles();
});

test('older capability response cannot re-enable SMS after a newer denied phone result', async () => {
  let finishFirst;
  const f = fixture(async (path, body) => body.celular === '3000000000' ? new Promise(done => { finishFirst = done; }) : options(false));
  const old = f.enable();
  f.nodes.get('celular').value = '3111111111'; const latest = f.enable(); await latest;
  finishFirst(options(true)); await old;
  assert.equal(f.run('smsOtpAllowed'), false); assert.equal(f.run('smsOtpEnabled'), false);
  assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true); f.assertFiles();
});

test('denied capability after uncertain SMS keeps managed status and its same UUID without resending', async () => {
  let allowed = true;
  const f = fixture(async (path, body) => {
    if (path.endsWith('/opciones')) return options(allowed);
    if (path.endsWith('/enviar')) return { status: 202, data: { ok: false, pending: true, request_id: body.request_id, channel: body.channel, state: 'uncertain', retry_after: 300 } };
    return accepted({ ...body, channel: 'sms' }, 100);
  });
  await f.enable();
  f.run("photoQualityReceipt='kept-after-capability'; qualityBlobCache.set(document.getElementById('fotoFrente').files[0], 'kept-cache');");
  await f.click('btnEnviarOtpSms'); const originalId = f.run('otpManagedAttempt.requestId');
  allowed = false; await f.enable();
  assert.equal(f.run('smsOtpEnabled'), true); assert.equal(f.run('smsOtpAllowed'), false);
  assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true); assert.equal(f.nodes.get('btnConsultarOtp').hidden, false);
  assert.equal(f.run('otpManagedAttempt.requestId'), originalId);
  assert.equal(f.run('photoQualityReceipt'), 'kept-after-capability');
  assert.equal(f.run("qualityBlobCache.get(document.getElementById('fotoFrente').files[0])"), 'kept-cache');
  await f.click('btnConsultarOtp');
  assert.equal(f.calls.find(x => x.path.endsWith('/estado')).body.request_id, originalId);
  assert.equal(f.nodes.get('btnVerificarOtp').disabled, false);
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1); f.assertFiles();
});

test('phone change to denied pilot number keeps querying the original bound attempt and never falls to legacy', async () => {
  const f = fixture(async (path, body) => {
    if (path.endsWith('/opciones')) return options(body.celular === '3000000000');
    if (path.endsWith('/enviar')) return { status: 202, data: { ok: false, pending: true, request_id: body.request_id, channel: body.channel, state: 'reserved', retry_after: 300 } };
    return accepted({ ...body, channel: 'sms' }, 100);
  });
  await f.enable(); await f.click('btnEnviarOtpSms');
  const originalId = f.run('otpManagedAttempt.requestId');
  f.nodes.get('celular').value = '3111111111'; await f.nodes.get('celular').fire('input'); f.advance(350); await tick();
  assert.equal(f.run('smsOtpEnabled'), true); assert.equal(f.nodes.get('btnConsultarOtp').hidden, false);
  assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true);
  await f.click('btnConsultarOtp');
  const status = f.calls.find(x => x.path.endsWith('/estado'));
  assert.equal(status.body.request_id, originalId); assert.equal(status.body.celular, '3000000000');
  assert.equal(f.nodes.get('btnVerificarOtp').disabled, true);
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1); f.assertFiles();
});

test('capability failure after accepted managed SMS hides SMS without losing verify or changing UUID', async () => {
  let failOptions = false;
  const f = fixture(async (path, body) => {
    if (path.endsWith('/opciones')) { if (failOptions) throw Error('options unavailable'); return options(true); }
    return accepted(body);
  });
  await f.enable(); await f.click('btnEnviarOtpSms'); const id = f.run('otpManagedAttempt.requestId');
  failOptions = true; await f.enable();
  assert.equal(f.run('smsOtpEnabled'), true); assert.equal(f.nodes.get('btnEnviarOtpSms').hidden, true);
  assert.equal(f.nodes.get('btnVerificarOtp').disabled, false); assert.equal(f.run('otpManagedAttempt.requestId'), id);
  assert.equal(f.calls.filter(x => x.path.endsWith('/enviar')).length, 1); f.assertFiles();
});
