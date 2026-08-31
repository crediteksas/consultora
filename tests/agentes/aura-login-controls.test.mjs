import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../../creditek/agentes/index.html', import.meta.url), 'utf8');

test('el artefacto AURA conserva las funciones de ingreso y visibilidad de contraseña', () => {
  assert.match(html, /onsubmit="doLogin\(\); return false;"/);
  assert.match(html, /onclick="togglePassword\('login-password',this\)"/);
  assert.match(html, /function\s+togglePassword\s*\(/);
  assert.match(html, /async\s+function\s+doLogin\s*\(/);

  let inlineScripts = 0;
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    if (/type=["']module["']/.test(match[0])) continue;
    inlineScripts += 1;
    assert.doesNotThrow(
      () => new vm.Script(match[1], { filename: `aura-inline-${inlineScripts}.js` }),
      `el script inline ${inlineScripts} debe compilar completo`,
    );
  }
  assert.ok(inlineScripts > 0);
});
