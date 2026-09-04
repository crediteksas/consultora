import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const agentFile = new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url);
const workerFile = new URL('../../creditek/workers/gemini-proxy/index.js', import.meta.url);
const agent = readFileSync(agentFile, 'utf8');
const worker = readFileSync(workerFile, 'utf8');

test('el publicador inicia y consulta Reels hasta recibir el MP4', () => {
  assert.match(agent, /\/veo\/generate/);
  assert.match(agent, /\/veo\/status/);
  assert.match(agent, /consultarReelHastaCompletar\(data\.operation\)/);
  assert.doesNotMatch(agent, /El endpoint de consulta se conectará en el siguiente paso/);
  assert.match(agent, /displayReelResult\(completed\.video/);
});

test('el Worker expone las dos rutas Veo detrás de la sesión AURA', () => {
  assert.match(worker, /path !== "\/veo\/generate"/);
  assert.match(worker, /path !== "\/veo\/status"/);
  const authentication = worker.indexOf('authenticateAura(request, env)');
  const generation = worker.indexOf('if (path === "/veo/generate")');
  assert.ok(authentication >= 0 && generation > authentication);
});

test('Veo usa el contrato oficial de operación larga y limita su entrada', () => {
  assert.match(worker, /veo-3\.1-generate-001/);
  assert.match(worker, /:predictLongRunning/);
  assert.match(worker, /:fetchPredictOperation/);
  assert.match(worker, /durationSeconds: duration/);
  assert.match(worker, /new Set\(\[4, 6, 8\]\)/);
  assert.match(worker, /image\.length > 28e6/);
  assert.match(worker, /operation\.startsWith\(`\$\{config\.resource\}\/operations\/`\)/);
});
