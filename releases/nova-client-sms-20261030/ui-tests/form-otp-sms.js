// BEGIN NOVA SMS UI 20261030.1 — managed only when opciones.smsEnabled === true.
const btnEnviarOtpSms = document.getElementById('btnEnviarOtpSms');
const btnConsultarOtp = document.getElementById('btnConsultarOtp');
let smsOtpEnabled = false;
let smsOtpAllowed = false;
let otpOptionsGeneration = 0;
let otpOptionsDebounce = null;
let otpLegacyStarted = false;
let otpManagedAttempt = null;
let otpManagedSending = false;
let otpManagedChecking = false;
let otpManagedVerifying = false;
let otpManagedTimer = null;
const OTP_MANAGED_TTL = 300000;
const OTP_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nuevoOtpRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
function otpMismaIdentidad() {
  return !!otpManagedAttempt && otpManagedAttempt.celular === celularInput.value &&
    otpManagedAttempt.cedula === document.getElementById('cedula').value;
}
function otpGestionadoBloqueado() {
  if (otpManagedSending || otpManagedChecking || otpManagedVerifying || otpVerificado) return true;
  const a = otpManagedAttempt;
  if (!a) return false;
  if (['sending', 'reserved', 'uncertain', 'failed', 'verified'].includes(a.state)) return true;
  return ['accepted', 'active_challenge'].includes(a.state) && a.lockUntil > Date.now();
}
function otpGestionadoConsultable() {
  return !!otpManagedAttempt && ['reserved', 'uncertain', 'failed'].includes(otpManagedAttempt.state);
}
function puedeVerificarOtpGestionado() {
  return !otpManagedSending && !otpManagedChecking && !otpManagedVerifying && !otpVerificado &&
    otpManagedAttempt?.state === 'accepted' && otpManagedAttempt.lockUntil > Date.now() && otpMismaIdentidad();
}
function renderOtpGestionado() {
  document.getElementById('otpChannelHelp').hidden = !smsOtpAllowed;
  if (!smsOtpEnabled) { btnEnviarOtpSms.hidden = true; btnConsultarOtp.hidden = true; return; }
  const invalid = !contextoValido || !celularValido(celularInput.value) ||
    !cedulaValida(document.getElementById('cedula').value) || !turnstileToken;
  const busy = otpGestionadoBloqueado();
  btnEnviarOtp.disabled = invalid || busy;
  btnEnviarOtpSms.hidden = !smsOtpAllowed || otpVerificado || otpManagedAttempt?.state === 'verified';
  btnEnviarOtpSms.disabled = invalid || busy;
  btnConsultarOtp.hidden = !otpGestionadoConsultable() || otpVerificado;
  btnConsultarOtp.disabled = otpManagedSending || otpManagedChecking || otpManagedVerifying;
  btnVerificarOtp.disabled = !puedeVerificarOtpGestionado();
  if (otpManagedAttempt) {
    if (otpManagedAttempt.state === 'accepted' && otpMismaIdentidad() && !otpVerificado) codeRow.classList.add('show');
    else codeRow.classList.remove('show');
  }
}
function mensajeOtpGestionado(message, error = false) {
  otpStatus.className = error ? 'otp-status err' : 'otp-status pending';
  otpStatus.textContent = message;
}
function programarVencimientoOtpGestionado() {
  if (otpManagedTimer !== null) clearTimeout(otpManagedTimer);
  otpManagedTimer = null;
  const a = otpManagedAttempt;
  if (!a || !['accepted', 'active_challenge'].includes(a.state) || a.lockUntil <= Date.now()) return;
  const requestId = a.requestId;
  otpManagedTimer = setTimeout(() => {
    otpManagedTimer = null;
    if (otpManagedAttempt?.requestId !== requestId || otpVerificado) return;
    mensajeOtpGestionado('Terminó la espera del código. Puedes solicitar otro por el canal que elijas; no se enviará automáticamente.');
    renderOtpGestionado();
  }, Math.max(1, a.lockUntil - Date.now() + 1));
}
function bloquearIdentidadOtpGestionado() {
  const fields = [celularInput, document.getElementById('cedula')];
  const previous = fields.map(field => field.disabled);
  fields.forEach(field => { field.disabled = true; });
  return () => fields.forEach((field, i) => { field.disabled = previous[i]; });
}
function otpRetryAfter(data, fallback = 300) {
  return Number.isFinite(data?.retry_after) && data.retry_after >= 0 && data.retry_after <= 300
    ? data.retry_after : fallback;
}
function dejarOtpIncierto() {
  if (!otpManagedAttempt) return;
  otpManagedAttempt.state = 'uncertain';
  mensajeOtpGestionado('No pudimos confirmar el envío. Pulsa «Consultar envío» antes de pedir otro código o cambiar de canal. Tus datos y fotos se conservan.');
}
function aplicarEstadoOtpGestionado(res, data) {
  const a = otpManagedAttempt;
  if (!a) return;
  if (data?.request_id !== a.requestId || data?.channel !== a.channel) { dejarOtpIncierto(); return; }
  if ([200, 409].includes(res.status) && data.state === 'verified') {
    a.state = 'verified'; a.lockUntil = 0;
    if (otpManagedTimer !== null) clearTimeout(otpManagedTimer);
    otpManagedTimer = null;
    mensajeOtpGestionado('Este código ya se verificó en otra pestaña. Continúa en el formulario original para terminar. Tus datos y fotos siguen aquí; no solicites otro código.');
  } else if (res.ok && data.ok === true && data.state === 'accepted' && OTP_UUID.test(data.otp_id || '')) {
    a.state = 'accepted'; a.otpId = data.otp_id;
    a.lockUntil = Date.now() + Math.max(1, otpRetryAfter(data)) * 1000;
    mensajeOtpGestionado('Código solicitado por ' + (a.channel === 'sms' ? 'SMS' : 'WhatsApp') + '. Aún no confirmamos su entrega. Ingresa el código si lo recibes.');
    programarVencimientoOtpGestionado();
  } else if (data.pending === true && ['reserved', 'uncertain'].includes(data.state)) {
    a.state = data.state;
    a.lockUntil = Date.now() + otpRetryAfter(data) * 1000;
    mensajeOtpGestionado('Estamos confirmando el envío por ' + (a.channel === 'sms' ? 'SMS' : 'WhatsApp') + '. Pulsa «Consultar envío»; no pidas otro código ni cambies de canal.');
  } else if (data.ok === false && ['expired', 'failed', 'not_sent'].includes(data.state)) {
    const retryAfter = otpRetryAfter(data, -1);
    if (retryAfter === 0) {
      a.state = data.state === 'failed' ? 'not_sent' : data.state;
      a.lockUntil = 0;
      mensajeOtpGestionado(data.state === 'expired' ? 'El código venció. Puedes solicitar otro por WhatsApp o, si no tienes WhatsApp, por SMS.' : 'Se confirmó que no hay un código activo de este intento. Puedes solicitar otro; tus datos y fotos se conservan.');
    } else if (data.state === 'failed' && retryAfter > 0) {
      a.state = 'failed'; a.lockUntil = Date.now() + retryAfter * 1000;
      mensajeOtpGestionado('El envío falló, pero debemos esperar a que venza el intento anterior. Usa «Consultar envío» antes de pedir otro código.', true);
    } else { dejarOtpIncierto(); }
  } else { dejarOtpIncierto(); }
}
function aplicarPermisoSmsOtp(allowed) {
  smsOtpAllowed = allowed;
  // Capability is dynamic; the protocol of an existing attempt is not.
  if (!otpManagedAttempt && !otpManagedSending && !otpManagedChecking && !otpManagedVerifying) {
    smsOtpEnabled = allowed && !otpLegacyStarted && !otpVerificado && !registroSession;
  }
  if (smsOtpEnabled) renderOtpGestionado();
  else {
    btnEnviarOtpSms.hidden = true; btnConsultarOtp.hidden = true;
    document.getElementById('otpChannelHelp').hidden = true;
    evaluarEnvioOtp();
  }
}
function programarOpcionesOtp() {
  if (otpOptionsDebounce !== null) clearTimeout(otpOptionsDebounce);
  otpOptionsDebounce = null;
  ++otpOptionsGeneration;
  // Hide stale permission immediately; do not touch the ordinary WhatsApp flow.
  aplicarPermisoSmsOtp(false);
  if (!contextoValido || !celularValido(celularInput.value)) {
    return;
  }
  otpOptionsDebounce = setTimeout(() => {
    otpOptionsDebounce = null; void cargarOpcionesOtp();
  }, 350);
}
async function cargarOpcionesOtp() {
  const generation = ++otpOptionsGeneration;
  const celular = celularInput.value;
  const current = () => generation === otpOptionsGeneration && celular === celularInput.value && contextoValido;
  if (!contextoValido || !celularValido(celular)) { aplicarPermisoSmsOtp(false); return; }
  try {
    const res = await fetch(`${API}/api/otp/opciones`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000), body: JSON.stringify({ enlace_token: enlaceToken, celular }),
    });
    const data = await res.json().catch(() => ({}));
    if (current()) aplicarPermisoSmsOtp(res.ok && data.smsEnabled === true);
  } catch { if (current()) aplicarPermisoSmsOtp(false); }
}
async function solicitarOtpGestionado(channel) {
  if (!smsOtpEnabled || !['whatsapp', 'sms'].includes(channel) || otpGestionadoBloqueado()) return;
  if (channel === 'sms' && !smsOtpAllowed) return;
  const celular = celularInput.value, cedula = document.getElementById('cedula').value;
  if (!contextoValido || !celularValido(celular) || !cedulaValida(cedula) || !turnstileToken) return;
  const now = Date.now();
  if (now - ultimoEnvioOtp < 15000) return;
  const requestId = nuevoOtpRequestId();
  if (!OTP_UUID.test(requestId)) { mostrarErrorOtp('No se pudo preparar el envío de forma segura.'); return; }
  ultimoEnvioOtp = now;
  const previousAttempt = otpManagedAttempt;
  otpManagedAttempt = { requestId, channel, celular, cedula, state: 'sending', otpId: null, lockUntil: now + OTP_MANAGED_TTL };
  otpManagedSending = true;
  const releaseIdentity = bloquearIdentidadOtpGestionado();
  mensajeOtpGestionado('Solicitando código por ' + (channel === 'sms' ? 'SMS' : 'WhatsApp') + '…');
  renderOtpGestionado();
  try {
    const res = await fetch(`${API}/api/otp/enviar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ enlace_token: enlaceToken, cedula, celular, turnstile_token: turnstileToken,
        channel, request_id: requestId, ...(channel === 'sms' ? { sms_reason: 'no_whatsapp' } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.reason === 'active_challenge') {
      const lockUntil = Date.now() + otpRetryAfter(data) * 1000;
      if (previousAttempt?.state === 'accepted' && previousAttempt.celular === celular && previousAttempt.cedula === cedula) {
        otpManagedAttempt = { ...previousAttempt, lockUntil };
      } else { otpManagedAttempt.state = 'active_challenge'; otpManagedAttempt.lockUntil = lockUntil; }
      mensajeOtpGestionado('Ya existe un código vigente. No se envió otro; espera a que venza antes de solicitar uno por otro canal.');
      programarVencimientoOtpGestionado();
    } else if (res.status === 404) {
      otpManagedAttempt.state = 'not_sent'; otpManagedAttempt.lockUntil = 0; mostrarBloqueoEnlace();
    } else { aplicarEstadoOtpGestionado(res, data); }
  } catch { dejarOtpIncierto(); }
  finally {
    otpManagedSending = false; releaseIdentity(); reiniciarTurnstile(); renderOtpGestionado();
  }
}
async function consultarOtpGestionado() {
  if (!smsOtpEnabled || !otpGestionadoConsultable() || otpManagedSending || otpManagedChecking || otpManagedVerifying) return;
  otpManagedChecking = true;
  const a = otpManagedAttempt;
  mensajeOtpGestionado('Consultando el envío anterior…'); renderOtpGestionado();
  try {
    const res = await fetch(`${API}/api/otp/estado`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ enlace_token: enlaceToken, cedula: a.cedula, celular: a.celular, request_id: a.requestId }),
    });
    const data = await res.json().catch(() => ({}));
    aplicarEstadoOtpGestionado(res, data);
  } catch { dejarOtpIncierto(); }
  finally { otpManagedChecking = false; renderOtpGestionado(); }
}
btnEnviarOtpSms.addEventListener('click', () => solicitarOtpGestionado('sms'));
btnConsultarOtp.addEventListener('click', consultarOtpGestionado);
// END NOVA SMS UI 20261030.1
