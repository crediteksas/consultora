from pathlib import Path
import difflib
import hashlib
import json

here = Path(__file__).resolve().parent
source = here.parent / 'form-base.html'
expected = '72bdd44f7982ca86a8d459403541142a2fd92119a1501d48da03e8489e2c1fc2'
original = source.read_text()
assert hashlib.sha256(original.encode()).hexdigest() == expected, 'Source drift: inspect the new form first'
candidate = original
anchors = []

def replace_once(old, new, label):
    global candidate
    count = candidate.count(old)
    assert count == 1, f'{label}: expected one anchor, got {count}'
    candidate = candidate.replace(old, new)
    anchors.append({'name': label, 'occurrences': count, 'anchorSha256': hashlib.sha256(old.encode()).hexdigest()})

replace_once(
    '.otp-status.err { display: block; color: var(--rojo); }',
    '.otp-status.err { display: block; color: var(--rojo); }\n'
    '.btn-otp-alternative { display:block; border:0; background:transparent; color:var(--azul); text-align:left; padding:10px 0; min-height:44px; font:inherit; text-decoration:underline; }\n'
    '.btn-otp-alternative[hidden] { display:none; }\n'
    '.btn-otp-alternative:disabled { color:var(--text2); text-decoration:none; }',
    'otp-exception-styles')
replace_once(
    '      <div class="otp-status" id="otpStatus"></div>',
    '      <div class="otp-status" id="otpStatus" role="status" aria-live="polite"></div>\n'
    '      <button type="button" class="btn-otp-alternative" id="btnEnviarOtpSms" hidden disabled>No tengo WhatsApp: recibir por SMS</button>\n'
    '      <button type="button" class="btn-otp-alternative" id="btnConsultarOtp" hidden disabled>Consultar envío</button>\n'
    '      <p class="help" id="otpChannelHelp" hidden>WhatsApp es la opción habitual. Usa SMS solo si este celular no tiene WhatsApp.</p>',
    'otp-exception-controls')
replace_once(
    'const codigoOtpInput = document.getElementById(\'codigoOtp\');',
    'const codigoOtpInput = document.getElementById(\'codigoOtp\');\n\n' + (here / 'form-otp-sms.js').read_text(),
    'managed-otp-helpers')
replace_once(
    'function evaluarEnvioOtp() {\n  btnEnviarOtp.disabled =',
    'function evaluarEnvioOtp() {\n  if (smsOtpEnabled) { renderOtpGestionado(); return; }\n  btnEnviarOtp.disabled =',
    'managed-button-lock-guard')
replace_once(
    "btnEnviarOtp.addEventListener('click', async () => {\n  const celular = celularInput.value;",
    "btnEnviarOtp.addEventListener('click', async () => {\n  if (smsOtpEnabled) return solicitarOtpGestionado('whatsapp');\n  otpLegacyStarted = true;\n  const celular = celularInput.value;",
    'legacy-send-preserved-managed-dispatch')
replace_once(
    '      await initTurnstile();',
    '      await initTurnstile();\n      void cargarOpcionesOtp();',
    'optional-capabilities-after-secure-init')
replace_once(
    '  if (codigo.length !== 6) return;\n  btnVerificarOtp.disabled = true;',
    '  if (codigo.length !== 6) return;\n'
    '  const otpVerifyManaged = smsOtpEnabled;\n'
    '  if (otpVerifyManaged && !puedeVerificarOtpGestionado()) return;\n'
    '  const releaseOtpIdentity = otpVerifyManaged ? bloquearIdentidadOtpGestionado() : () => {};\n'
    '  if (otpVerifyManaged) { otpManagedVerifying = true; renderOtpGestionado(); }\n'
    '  btnVerificarOtp.disabled = true;',
    'managed-verify-lock-only')
replace_once(
    '      registroSession = data.registro_session;\n      otpVerificado = true;',
    "      registroSession = data.registro_session;\n      if (otpVerifyManaged && otpManagedAttempt) otpManagedAttempt.state = 'verified';\n      otpVerificado = true;",
    'managed-verify-success-no-photo-reset')
replace_once(
    '    btnVerificarOtp.disabled = false;\n    evaluarSubmit();',
    '    btnVerificarOtp.disabled = false;\n'
    '    if (otpVerifyManaged) { otpManagedVerifying = false; releaseOtpIdentity(); renderOtpGestionado(); }\n'
    '    evaluarSubmit();',
    'managed-verify-finally-preserve-legacy')
replace_once(
    "  celularInput.value = celularInput.value.replace(/\\D/g, '').slice(0, 10);",
    "  celularInput.value = celularInput.value.replace(/\\D/g, '').slice(0, 10);\n  programarOpcionesOtp();",
    'phone-capability-debounce-after-sanitize')
replace_once(
    'WhatsApp es la opción habitual. Usa SMS solo si este celular no tiene WhatsApp.',
    'WhatsApp es la opción habitual. Usa SMS solo si este celular no tiene WhatsApp. Durante el piloto, SMS aparece únicamente para celulares habilitados.',
    'pilot-capability-copy')

frozen = here.parent / 'form.html'
assert candidate == frozen.read_text(), 'Candidate regeneration differs from the frozen release form'
generated = here / 'generated'
generated.mkdir(exist_ok=True)
(generated / 'form.html').write_text(candidate)
(generated / 'form-candidate.patch').write_text(''.join(difflib.unified_diff(original.splitlines(keepends=True), candidate.splitlines(keepends=True), fromfile='a/form.html', tofile='b/form.html')))
(generated / 'form-candidate-anchors.json').write_text(json.dumps({'source': '../form-base.html', 'sourceSha256': expected, 'sourceBytes': len(original.encode()), 'candidateSha256': hashlib.sha256(candidate.encode()).hexdigest(), 'candidateBytes': len(candidate.encode()), 'anchors': anchors, 'frozenForm': '../form.html', 'productionVerified': False, 'networkCalls': 0}, indent=2) + '\n')
print(json.dumps({'anchors': len(anchors), 'candidateBytes': len(candidate.encode()), 'sourceUnchanged': hashlib.sha256(source.read_bytes()).hexdigest() == expected}))
