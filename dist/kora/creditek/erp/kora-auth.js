const RECOVERY_SENT_MESSAGE = 'Si el correo está registrado, recibirás un código de seis dígitos.';

function validateRecoveryEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Escribe un correo electrónico válido.');
  }
  return normalized;
}

function validateRecoveryCode(code) {
  const normalized = String(code || '').trim();
  if (!/^\d{6}$/.test(normalized)) {
    throw new Error('El código debe tener seis dígitos.');
  }
  return normalized;
}

function validateNewPassword(password, confirmation) {
  const value = String(password || '');
  if (value.length < 10) {
    throw new Error('La contraseña debe tener al menos 10 caracteres.');
  }
  if (value !== String(confirmation || '')) {
    throw new Error('Las contraseñas no coinciden.');
  }
  return value;
}

function isExpiredOtp(error) {
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'otp_expired' || /expired|vencid|already used|ya fue utilizado/.test(message);
}

function createKoraRecoveryClient(auth) {
  if (!auth) throw new Error('Autenticación de KORA no disponible.');

  return Object.freeze({
    async requestPasswordRecovery(email) {
      const normalized = validateRecoveryEmail(email);
      let error = null;
      try {
        ({ error } = await auth.resetPasswordForEmail(normalized));
      } catch {
        throw new Error('No fue posible enviar el código. Inténtalo nuevamente.');
      }
      if (Number(error?.status) === 429) {
        throw new Error('Hay demasiadas solicitudes. Espera unos minutos e inténtalo nuevamente.');
      }
      if (error && Number(error.status) >= 500) {
        throw new Error('No fue posible enviar el código. Inténtalo nuevamente.');
      }
      return { message: RECOVERY_SENT_MESSAGE };
    },

    async verifyRecoveryCode(email, code) {
      const normalizedEmail = validateRecoveryEmail(email);
      const normalizedCode = validateRecoveryCode(code);
      let data;
      let error;
      try {
        ({ data, error } = await auth.verifyOtp({
          email: normalizedEmail,
          token: normalizedCode,
          type: 'recovery',
        }));
      } catch {
        throw new Error('No pudimos verificar el código. Inténtalo nuevamente.');
      }
      if (error || !data?.session) {
        if (isExpiredOtp(error)) {
          throw new Error('El código venció o ya fue utilizado. Solicita uno nuevo.');
        }
        throw new Error('El código es inválido. Verifícalo e inténtalo nuevamente.');
      }
      return { verified: true };
    },

    async updatePassword(password, confirmation) {
      const value = validateNewPassword(password, confirmation);
      let error;
      try {
        ({ error } = await auth.updateUser({ password: value }));
      } catch {
        throw new Error('No pudimos actualizar la contraseña. Solicita un código nuevo.');
      }
      if (error) {
        throw new Error('No pudimos actualizar la contraseña. Solicita un código nuevo.');
      }
      try {
        const { error: signOutError } = await auth.signOut();
        if (signOutError) throw signOutError;
      } catch {
        throw new Error('La contraseña se actualizó. Por seguridad, vuelve a abrir el login de KORA.');
      }
      return { updated: true };
    },
  });
}

const KoraAuth = Object.freeze({
  createKoraRecoveryClient,
  validateNewPassword,
  validateRecoveryCode,
  validateRecoveryEmail,
});

if (typeof window !== 'undefined') window.KoraAuth = KoraAuth;
if (typeof module !== 'undefined' && module.exports) module.exports = KoraAuth;
