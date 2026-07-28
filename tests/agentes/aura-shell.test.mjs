import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

async function readAuraHtml() {
  return readFile(path.join(root, 'creditek/agentes/index.html'), 'utf8');
}

test('el acceso AURA expone controles etiquetados de correo y contraseña', async () => {
  const html = await readAuraHtml();

  assert.match(html, /<label[^>]*for="login-email"[^>]*>\s*Correo\s*<\/label>/);
  assert.match(html, /<input[^>]*type="email"[^>]*id="login-email"[^>]*autocomplete="username"/);
  assert.match(html, /<label[^>]*for="login-password"[^>]*>\s*Contraseña\s*<\/label>/);
  assert.match(html, /<input[^>]*type="password"[^>]*id="login-password"[^>]*autocomplete="current-password"/);
  assert.match(html, /id="login-error"[^>]*role="alert"[^>]*aria-live="polite"/);
});

test('el acceso AURA usa el cliente individual y elimina la compuerta compartida', async () => {
  const html = await readAuraHtml();

  assert.match(html, /<script src="aura-auth\.js"><\/script>/);
  assert.match(html, /CreditekAuraAuth\.createAuraAuth/);
  assert.doesNotMatch(html, /id="login-pwd"/);
  assert.doesNotMatch(html, /\bPWD\b/);
  assert.doesNotMatch(html, /ck_auth/);
  assert.doesNotMatch(html, /hub-login/);
});

test('el formulario AURA controla envío, estado ocupado y restauración de sesión', async () => {
  const html = await readAuraHtml();

  assert.match(html, /id="login-form"/);
  assert.match(html, /addEventListener\('submit'/);
  assert.match(html, /login-submit/);
  assert.match(html, /aria-busy/);
  assert.match(html, /restoreSession\(\)/);
});

test('los módulos internos comparten la sesión individual de AURA', async () => {
  const responses = await readFile(
    path.join(root, 'creditek/agentes/creditek-agente-respuestas.html'),
    'utf8'
  );

  assert.match(responses, /aura_supa_session/);
  assert.doesNotMatch(responses, /ck_supa_session/);
});
