import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('el panel de Sofía no publica ni envía un secreto compartido', async () => {
  const html = await read('creditek/agentes/creditek-agente-respuestas.html');
  assert.doesNotMatch(html, /const\s+WORKER_SHARED_SECRET\s*=/);
  assert.doesNotMatch(html, /X-Worker-Secret/);
  assert.match(html, /Authorization:'Bearer '\+session\.access_token/);
  assert.match(html, /workerFetch\('\/api\/enviar-mensaje'/);
  assert.match(html, /workerFetch\('\/api\/reintentar-handoff'/);
  assert.match(html, /estado_funnel==='lead_caliente'&&cl\?\.tienda_id/);
  assert.match(html, />Enviar a asesor</);
});

test('el panel de Meta tampoco publica el secreto administrativo del bot', async () => {
  const html = await read('creditek/agentes/agente3-meta-ads.html');
  assert.doesNotMatch(html, /const\s+WORKER_SHARED_SECRET\s*=/);
  assert.doesNotMatch(html, /X-Worker-Secret/);
  assert.match(html, /Authorization: `Bearer \$\{auraToken\}`/);
});

test('creditek-bot exige una sesión AURA owner para el panel', async () => {
  const worker = await read('creditek/workers/creditek-bot/index.js');
  assert.match(worker, /async function autenticarAuraOwner/);
  assert.match(worker, /grant\?\.role_id === "aura\.owner"/);
  assert.match(worker, /"Authorization, Content-Type, X-Worker-Secret"/);
});

test('el handoff recupera los datos persistidos de la tienda antes de enviar', async () => {
  const worker = await read('creditek/workers/creditek-bot/index.js');
  assert.match(worker, /\(!conv\.tienda_telefono \|\| !conv\.tienda_contacto\) && conv\.tienda_id/);
  assert.match(worker, /await buscarTiendaPorId\(conv\.tienda_id, sk\)/);
  assert.match(worker, /url\.pathname === "\/api\/reintentar-handoff"/);
});

test('la recuperación owner conserva el canal real en la auditoría del handoff', async () => {
  const worker = await read('creditek/workers/creditek-bot/index.js');
  assert.match(
    worker,
    /hacerHandoff\(conv, telefono, sendFn, env2, sk, conv\.canal \|\| "whatsapp"\)/,
  );
  assert.doesNotMatch(
    worker,
    /hacerHandoff\(conv, telefono, sendFn, env2, sk, "manual_recovery"\)/,
  );
});

test('wrangler despliega el artefacto real del bot', async () => {
  const config = await read('creditek/workers/creditek-bot/wrangler.toml');
  assert.match(config, /^main = "index\.js"$/m);
});
