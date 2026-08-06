import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const agent1Url = new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url);
const agent3Url = new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url);
const agent4Url = new URL('../../creditek/agentes/creditek-agente-calendario.html', import.meta.url);
const sofiaUrl = new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url);
const contextUrl = new URL('../../creditek/agentes/kora-agent-context.js', import.meta.url);

const REQUIRED_KORA_ASSETS = [
  '/design-system/components/kora-dashboard.css',
  '/design-system/components/kora-shell.css?v=2.0.4',
  '/design-system/components/kora-product.css',
  'lucide@1.27.0',
];

test('los cuatro módulos conservan el sistema visual sin montar el menú de KORA', async () => {
  const [agent1, agent3, agent4, sofia, context] = await Promise.all([
    readFile(agent1Url, 'utf8'),
    readFile(agent3Url, 'utf8'),
    readFile(agent4Url, 'utf8'),
    readFile(sofiaUrl, 'utf8'),
    readFile(contextUrl, 'utf8'),
  ]);

  for (const html of [agent1, agent3, agent4, sofia]) {
    for (const asset of REQUIRED_KORA_ASSETS) assert.ok(html.includes(asset), `falta ${asset}`);
    assert.doesNotMatch(html, /\/creditek\/erp\/sidebar\.js/);
    assert.match(html, /kora-agent-context\.js/);
    assert.match(html, /data-kora-shell-root/);
    assert.match(html, /class="kora-product-page"/);
    assert.doesNotMatch(html, /aura-shell\.(?:css|js)/);
    assert.doesNotMatch(html, /class="(?:sidebar|topbar|main)"/);
  }

  assert.match(context, /window\.KoraNavigation\.mount/);
  assert.match(context, /productName:\s*'AURA'/);
  assert.doesNotMatch(context, /innerHTML|insertAdjacentHTML|createElement/);
});

test('la migración conserva los puntos funcionales de ambos agentes', async () => {
  const [agent1, agent3, agent4, sofia] = await Promise.all([
    readFile(agent1Url, 'utf8'),
    readFile(agent3Url, 'utf8'),
    readFile(agent4Url, 'utf8'),
    readFile(sofiaUrl, 'utf8'),
  ]);

  for (const marker of ['generarContenido', 'generarImagen', 'buildImgPrompt', 'aura-image-client.mjs', "llamarBackendImagen('/generate'", "llamarBackendImagen('/openai/responses'"]) {
    assert.ok(agent1.includes(marker), `Agente 1 perdió ${marker}`);
  }
  assert.doesNotMatch(agent1, /ck_gemini_key|ck_openai_key|api\.openai\.com|WORKER_SHARED_SECRET/);
  for (const marker of ['generar()', 'renderCalendario', 'guardarCalendario', 'aprobarYGenerarImagen', 'generarImagenPipelineAgente4']) {
    assert.ok(agent4.includes(marker), `Agente 4 perdió ${marker}`);
  }
  for (const marker of ['auraSessionToken', '/v1/dashboard', 'period', 'campaigns', 'trends']) {
    assert.ok(agent3.includes(marker), `Agente 3 perdió ${marker}`);
  }
  for (const marker of ['loadAll', 'loadConvs', 'loadClients', 'supaFetch', 'switchView', 'guardarCorreccion']) {
    assert.ok(sofia.includes(marker), `Sofía perdió ${marker}`);
  }
});

test('el contexto compartido conserva únicamente la navegación autorizada de AURA', async () => {
  const context = await readFile(contextUrl, 'utf8');
  for (const destination of [
    'index.html',
    'creditek-agente-respuestas.html',
    'creditek-agente-redes.html',
    'agente3-meta-ads.html',
    'creditek-agente-calendario.html',
    '../portal/index.html',
    'index.html#configuracion',
  ]) assert.ok(context.includes(destination), `falta ${destination}`);
  assert.match(context, /agent-1/);
  assert.match(context, /agent-3/);
  assert.match(context, /agent-4/);
  assert.match(context, /sofia/);
  assert.match(context, /window\.self !== window\.top[\s\S]*root\.classList\.add\('show'\)[\s\S]*return/);
  assert.match(context, /agentId === 'home'/);
  assert.doesNotMatch(context, /\.\.\/erp\/reportes\.html|label:\s*'Reportes'|Agente [1-4]/);
});
