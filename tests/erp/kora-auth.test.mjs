import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import KoraAuth from '../../creditek/erp/kora-auth.js';

const {
  createKoraRecoveryClient,
  validateNewPassword,
  validateRecoveryCode,
  validateRecoveryEmail,
} = KoraAuth;

const root = path.resolve(import.meta.dirname, '../..');

function fakeAuth(overrides = {}) {
  const calls = [];
  return {
    calls,
    async resetPasswordForEmail(email, options) {
      calls.push(['resetPasswordForEmail', email, options]);
      return { data: {}, error: null };
    },
    async verifyOtp(payload) {
      calls.push(['verifyOtp', payload]);
      return { data: { session: { access_token: 'recovery-session' } }, error: null };
    },
    async updateUser(payload) {
      calls.push(['updateUser', payload]);
      return { data: { user: { id: 'same-user-id' } }, error: null };
    },
    async signOut() {
      calls.push(['signOut']);
      return { error: null };
    },
    ...overrides,
  };
}

test('valida correo, OTP y contraseña sin transmitir entradas inválidas', () => {
  assert.throws(() => validateRecoveryEmail('correo-invalido'), /correo electrónico válido/);
  assert.equal(validateRecoveryEmail('  USUARIO@EJEMPLO.COM  '), 'usuario@ejemplo.com');
  assert.throws(() => validateRecoveryCode('12345'), /seis dígitos/);
  assert.equal(validateRecoveryCode(' 123456 '), '123456');
  assert.throws(() => validateNewPassword('123456789', '123456789'), /10 caracteres/);
  assert.throws(() => validateNewPassword('clave-segura-10', 'distinta-segura'), /no coinciden/);
  assert.equal(validateNewPassword('clave-segura-10', 'clave-segura-10'), 'clave-segura-10');
});

test('solicita OTP sin redirect ni enlace y siempre responde de forma neutral', async () => {
  const auth = fakeAuth();
  const recovery = createKoraRecoveryClient(auth);

  const result = await recovery.requestPasswordRecovery('  USUARIO@EJEMPLO.COM ');

  assert.deepEqual(auth.calls, [
    ['resetPasswordForEmail', 'usuario@ejemplo.com', undefined],
  ]);
  assert.equal(result.message, 'Si el correo está registrado, recibirás un código de seis dígitos.');
});

test('no revela si el correo existe cuando Supabase rechaza la solicitud', async () => {
  const auth = fakeAuth({
    async resetPasswordForEmail() {
      return { data: null, error: { status: 400, message: 'User not found' } };
    },
  });

  const result = await createKoraRecoveryClient(auth).requestPasswordRecovery('nadie@ejemplo.com');

  assert.equal(result.message, 'Si el correo está registrado, recibirás un código de seis dígitos.');
});

test('informa límite temporal sin mostrar el error técnico de Supabase', async () => {
  const auth = fakeAuth({
    async resetPasswordForEmail() {
      return { data: null, error: { status: 429, message: 'rate limit exceeded' } };
    },
  });

  await assert.rejects(
    createKoraRecoveryClient(auth).requestPasswordRecovery('usuario@ejemplo.com'),
    { message: 'Hay demasiadas solicitudes. Espera unos minutos e inténtalo nuevamente.' },
  );
});

test('verifica el OTP como recovery para el mismo correo', async () => {
  const auth = fakeAuth();
  const recovery = createKoraRecoveryClient(auth);

  const result = await recovery.verifyRecoveryCode('usuario@ejemplo.com', '123456');

  assert.deepEqual(auth.calls, [[
    'verifyOtp',
    { email: 'usuario@ejemplo.com', token: '123456', type: 'recovery' },
  ]]);
  assert.equal(result.verified, true);
});

test('distingue OTP expirado de OTP inválido con mensajes seguros', async () => {
  const expired = fakeAuth({
    async verifyOtp() {
      return { data: { session: null }, error: { code: 'otp_expired', message: 'Token has expired' } };
    },
  });
  const invalid = fakeAuth({
    async verifyOtp() {
      return { data: { session: null }, error: { code: 'otp_invalid', message: 'Token is invalid' } };
    },
  });

  await assert.rejects(
    createKoraRecoveryClient(expired).verifyRecoveryCode('usuario@ejemplo.com', '123456'),
    { message: 'El código venció o ya fue utilizado. Solicita uno nuevo.' },
  );
  await assert.rejects(
    createKoraRecoveryClient(invalid).verifyRecoveryCode('usuario@ejemplo.com', '123456'),
    { message: 'El código es inválido. Verifícalo e inténtalo nuevamente.' },
  );
});

test('actualiza la contraseña del usuario verificado y cierra la sesión temporal', async () => {
  const auth = fakeAuth();
  const recovery = createKoraRecoveryClient(auth);

  const result = await recovery.updatePassword('clave-segura-10', 'clave-segura-10');

  assert.deepEqual(auth.calls, [
    ['updateUser', { password: 'clave-segura-10' }],
    ['signOut'],
  ]);
  assert.equal(result.updated, true);
});

test('no cierra la sesión si Supabase no actualiza la contraseña', async () => {
  const auth = fakeAuth({
    async updateUser(payload) {
      this.calls.push(['updateUser', payload]);
      return { data: null, error: { message: 'Password should be different' } };
    },
  });

  await assert.rejects(
    createKoraRecoveryClient(auth).updatePassword('clave-segura-10', 'clave-segura-10'),
    { message: 'No pudimos actualizar la contraseña. Solicita un código nuevo.' },
  );
  assert.deepEqual(auth.calls, [['updateUser', { password: 'clave-segura-10' }]]);
});

test('el login KORA contiene las cuatro vistas accesibles y conserva su entorno aislado', async () => {
  const app = await readFile(path.join(root, 'creditek/erp/app.html'), 'utf8');

  assert.match(app, /id="auth-view-login"/);
  assert.match(app, /id="auth-view-forgot"/);
  assert.match(app, /id="auth-view-verify-code"/);
  assert.match(app, /id="auth-view-password-updated"/);
  assert.match(app, /¿Olvidaste tu contraseña\?/);
  assert.match(app, /id="rememberSession"/);
  assert.match(app, /aria-label="Mostrar contraseña"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /KORA_ERP_SUPABASE_URL/);
  assert.match(app, /KORA_ERP_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(app, /AURA_AUTH|aura_supabase_session|ditiwpndvmyuqcagupea/);
});
