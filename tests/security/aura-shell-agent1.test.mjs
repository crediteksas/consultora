import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const agentPath = new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url);
const shellCssPath = new URL('../../creditek/agentes/aura-shell.css', import.meta.url);
const shellJsPath = new URL('../../creditek/agentes/aura-shell.js', import.meta.url);

test('el Agente 1 monta el shell compartido sin reemplazar su workspace funcional', async () => {
  const [agentHtml, shellCss, shellJs] = await Promise.all([
    readFile(agentPath, 'utf8'),
    readFile(shellCssPath, 'utf8'),
    readFile(shellJsPath, 'utf8'),
  ]);

  assert.match(agentHtml, /<link rel="stylesheet" href="aura-shell\.css">/);
  assert.match(agentHtml, /<script src="aura-shell\.js" defer><\/script>/);
  assert.match(agentHtml, /data-aura-shell-page="agent-design"/);
  assert.match(agentHtml, /<div class="shell">/);
  assert.match(agentHtml, /id="ciudad"/);
  assert.match(agentHtml, /id="modo"/);
  assert.match(agentHtml, /id="tipo"/);
  assert.match(shellCss, /\.aura-shell-content > \.shell/);
  assert.match(shellJs, /querySelector\('\.shell'\)/);
  assert.match(shellJs, /appendChild\(content\)/);
});

test('la navegación compartida conserva los destinos oficiales de AURA', async () => {
  const shellJs = await readFile(shellJsPath, 'utf8');
  const expectedDestinations = [
    'index.html',
    'sofia-aura-20260803b.html',
    'creditek-agente-redes.html',
    'agente3-meta-ads.html',
    'creditek-agente-calendario.html',
    '/creditek/portal/',
    '../erp/reportes.html',
    'index.html#configuracion',
  ];

  for (const destination of expectedDestinations) {
    assert.ok(shellJs.includes(`href: '${destination}'`), `falta ${destination}`);
  }
  assert.match(shellJs, /aria-current="page"/);
  assert.match(shellJs, /aura-shell-topbar/);
  assert.match(shellJs, /Agente 1 · Piezas comerciales/);
});

test('el shell usa selectores aislados y no contiene lógica de IA', async () => {
  const [shellCss, shellJs] = await Promise.all([
    readFile(shellCssPath, 'utf8'),
    readFile(shellJsPath, 'utf8'),
  ]);
  const shellSource = `${shellCss}\n${shellJs}`;

  assert.doesNotMatch(shellSource, /WORKER_SHARED_SECRET|sk-ant-|ck_api_key|ck_gemini_key|ck_openai_key/);
  assert.doesNotMatch(shellSource, /fetch\s*\(/);
  assert.doesNotMatch(shellSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(shellCss, /^\.sidebar\b/m);
  assert.doesNotMatch(shellCss, /^\.shell\b/m);
});
