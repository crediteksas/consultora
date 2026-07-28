import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

async function read(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

test('el acceso AURA expone controles etiquetados de correo y contraseña', async () => {
  const html = await read('creditek/agentes/index.html');

  assert.match(html, /<label[^>]*for="login-email"[^>]*>\s*Correo\s*<\/label>/);
  assert.match(html, /<form[^>]*id="login-form"[^>]*autocomplete="off"/);
  assert.match(html, /<input[^>]*type="email"[^>]*id="login-email"[^>]*name="email"[^>]*autocomplete="off"[^>]*data-1p-ignore/);
  assert.match(html, /<label[^>]*for="login-password"[^>]*>\s*Contraseña\s*<\/label>/);
  assert.match(html, /<input[^>]*type="password"[^>]*id="login-password"[^>]*name="password"[^>]*autocomplete="new-password"[^>]*data-1p-ignore/);
  assert.match(html, /id="login-error"[^>]*role="alert"[^>]*aria-live="polite"/);
  assert.match(html, /#login-form\s*\{[^}]*pointer-events:\s*auto\s*!important/s);
  assert.match(html, /#login-form\s*\{[^}]*z-index:\s*2/s);
  assert.match(html, /\.kora-product-page #login-screen \.login-field label\s*\{[^}]*color:\s*var\(--ctk-color-text-secondary\)\s*!important/s);
});

test('el acceso AURA usa el cliente individual y elimina la compuerta compartida', async () => {
  const html = await read('creditek/agentes/index.html');

  assert.match(html, /<script src="aura-auth\.js"><\/script>/);
  assert.match(html, /CreditekAuraAuth\.createAuraAuth/);
  assert.doesNotMatch(html, /id="login-pwd"/);
  assert.doesNotMatch(html, /\bPWD\b/);
  assert.doesNotMatch(html, /ck_auth/);
  assert.doesNotMatch(html, /hub-login/);
});

test('el formulario AURA controla envío, estado ocupado y restauración de sesión', async () => {
  const html = await read('creditek/agentes/index.html');

  assert.match(html, /id="login-form"/);
  assert.match(html, /addEventListener\('submit'/);
  assert.match(html, /login-submit/);
  assert.match(html, /aria-busy/);
  assert.match(html, /restoreSession\(\)/);
});

test('los módulos internos comparten la sesión individual de AURA', async () => {
  const responses = await read('creditek/agentes/creditek-agente-respuestas.html');

  assert.match(responses, /aura_supa_session/);
  assert.doesNotMatch(responses, /ck_supa_session/);
});

test('el shell compartido recibe identidad AURA sin cambiar el shell ERP', async () => {
  const html = await read('creditek/agentes/index.html');
  const shell = await read('creditek/erp/sidebar.js');

  assert.match(html, /<title>AURA · Agentes — Creditek<\/title>/);
  assert.match(html, /data-kora-brand data-variant="login" data-product-name="AURA"/);
  assert.match(shell, /mountKoraShell\(\{[\s\S]*productName: 'AURA'/);
  assert.match(shell, /data-product-name="\$\{escapeHtml\(productName\)\}"/);
  assert.match(shell, /const shellProductName = productName \|\| 'KORA'/);
});

test('cada agente principal tiene un icono semántico diferente', async () => {
  const html = await read('creditek/agentes/index.html');
  const icons = [...html.matchAll(/class="module-icon"[^>]*>\s*<i data-lucide="([^"]+)"/g)]
    .map(match => match[1]);

  assert.deepEqual(icons, [
    'megaphone',
    'message-circle',
    'chart-no-axes-combined',
    'calendar-days',
  ]);
});
