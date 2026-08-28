import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publisher = await readFile(new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../creditek/workers/gemini-proxy/index.js', import.meta.url), 'utf8');
const config = await readFile(new URL('../../creditek/workers/gemini-proxy/wrangler.toml', import.meta.url), 'utf8');

test('Piezas comerciales activa dos diseñadores para comparación A/B', () => {
  assert.match(publisher, /id="chk-recraft" checked/);
  assert.match(publisher, /Diseñador A · Recraft V4\.1/);
  assert.match(publisher, /id="chk-dalle" checked/);
  assert.match(publisher, /Diseñador B · GPT Image 2/);
  assert.match(publisher, /Comparación A\/B: 1 imagen Recraft/);
  assert.doesNotMatch(publisher, /id="chk-gemini"/);
  assert.doesNotMatch(publisher, /id="chk-pipeline"/);
  assert.match(publisher, /id="sidebar-recraft-dot"/);
  assert.doesNotMatch(publisher, /Vertex AI/);
});

test('La comparación exige confirmación visible y nunca activa reintentos automáticos', () => {
  assert.match(publisher, /Se generarán 2 conceptos de diseño/);
  assert.match(publisher, /1 imagen pagada por USD 0,035/);
  assert.match(publisher, /No habrá reintentos automáticos/);
  assert.match(publisher, /generarConRecraft\(prompt\)/);
  assert.match(publisher, /id="img-ab-result" hidden aria-hidden="true"/);
  assert.doesNotMatch(publisher, /onclick="generarAB\(\)"/);
  assert.doesNotMatch(publisher, /generarConRecraft[\s\S]{0,500}catch[\s\S]{0,500}generarCon(?:Dalle|Gemini|Recraft)/);
});

test('Ambos diseñadores reciben un contrato comercial y el logo oficial se compone obligatoriamente', () => {
  assert.match(publisher, /COMMERCIAL DESIGN CONTRACT — MANDATORY/);
  assert.match(publisher, /DESIGNER A — RECRAFT/);
  assert.match(publisher, /DESIGNER B — GPT IMAGE/);
  assert.match(publisher, /primary purpose is to stop the scroll and sell/);
  assert.match(publisher, /\/creditek\/shared\/branding\/creditek-logo\.png/);
  assert.match(publisher, /La imagen no se entregará sin marca/);
});

test('Worker fija una imagen Recraft V4.1 estándar y registra costo', () => {
  assert.match(worker, /path !== "\/recraft\/images"/);
  assert.match(worker, /model: "recraftv4_1", size, n: 1/);
  assert.match(worker, /estimated_api_units: 35/);
  assert.match(worker, /estimated_cost_usd: 0\.035/);
  assert.match(worker, /prompt\.length > 1e4/);
  assert.match(worker, /bytes\.length > 8 \* 1024 \* 1024/);
  assert.match(worker, /mimeType = imageResponse\.headers\.get\("content-type"\)/);
  assert.match(publisher, /canvas\.toDataURL\('image\/png'\)/);
});

test('Worker autoriza el dominio productivo separado de AURA', () => {
  assert.match(worker, /"Access-Control-Allow-Origin": "https:\/\/aura\.crediteksas\.com"/);
  assert.doesNotMatch(worker, /"Access-Control-Allow-Origin": "https:\/\/registro\.crediteksas\.com"/);
});

test('Token Recraft queda documentado únicamente como secreto', () => {
  assert.match(config, /RECRAFT_API_TOKEN/);
  assert.doesNotMatch(config, /RECRAFT_API_TOKEN\s*=/);
  assert.doesNotMatch(worker, /Bearer\s+(?:recraft|sk-)[A-Za-z0-9_-]{8,}/i);
});
