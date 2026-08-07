import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const agent1Url = new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url);
const agent3Url = new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url);
const agent4Url = new URL('../../creditek/agentes/creditek-agente-calendario.html', import.meta.url);
const sofiaUrl = new URL('../../creditek/agentes/creditek-agente-respuestas.html', import.meta.url);
const bootstrapUrl = new URL('../../creditek/agentes/aura-agent-bootstrap.js', import.meta.url);
const configUrl = new URL('../../creditek/agentes/aura-module-config.js', import.meta.url);

const REQUIRED_KORA_ASSETS = [
  '/design-system/components/kora-dashboard.css',
  '/design-system/components/kora-shell.css?v=2.0.4',
  '/design-system/components/kora-product.css',
  'lucide@1.27.0',
];

test('los cuatro módulos conservan el sistema visual sin montar el menú de KORA', async () => {
  const [agent1, agent3, agent4, sofia, bootstrap] = await Promise.all([
    readFile(agent1Url, 'utf8'),
    readFile(agent3Url, 'utf8'),
    readFile(agent4Url, 'utf8'),
    readFile(sofiaUrl, 'utf8'),
    readFile(bootstrapUrl, 'utf8'),
  ]);

  for (const html of [agent1, agent3, agent4, sofia]) {
    for (const asset of REQUIRED_KORA_ASSETS) assert.ok(html.includes(asset), `falta ${asset}`);
    assert.doesNotMatch(html, /\/creditek\/erp\/sidebar\.js/);
    assert.match(html, /aura-agent-bootstrap\.js/);
    assert.doesNotMatch(html, /kora-agent-context\.js/);
    assert.match(html, /data-aura-agent-root/);
    assert.match(html, /class="kora-product-page"/);
    assert.doesNotMatch(html, /aura-shell\.(?:css|js)/);
    assert.doesNotMatch(html, /class="(?:sidebar|topbar|main)"/);
  }

  assert.match(bootstrap, /global\.self !== global\.top/);
  assert.match(bootstrap, /\/creditek\/agentes\/\?return_to=/);
  assert.doesNotMatch(bootstrap, /KoraNavigation|innerHTML|insertAdjacentHTML|createElement/);
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

test('la configuración compartida conserva únicamente los cuatro agentes autorizados de AURA', async () => {
  const config = await readFile(configUrl, 'utf8');
  for (const destination of [
    '/creditek/agentes/creditek-agente-respuestas.html',
    '/creditek/agentes/creditek-agente-redes.html',
    '/creditek/agentes/agente3-meta-ads.html',
    '/creditek/agentes/creditek-agente-calendario.html',
  ]) assert.ok(config.includes(destination), `falta ${destination}`);
  for (const name of ['Piezas comerciales', 'Sofía', 'Publicación y métricas', 'Calendario de contenido']) {
    assert.ok(config.includes(name), `falta ${name}`);
  }
  assert.doesNotMatch(config, /Agente [13] ·/);
  assert.doesNotMatch(config, /KORA|\/creditek\/erp\/|Reportes/);
});
