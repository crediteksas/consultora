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
  assert.match(publisher, /Control de uso de hoy/);
  assert.doesNotMatch(publisher, /id="chk-gemini"/);
  assert.doesNotMatch(publisher, /id="chk-pipeline"/);
  assert.match(publisher, /id="sidebar-recraft-dot"/);
  assert.doesNotMatch(publisher, /Vertex AI/);
});

test('La comparación registra consumo sin alertas y nunca activa reintentos automáticos', () => {
  assert.doesNotMatch(publisher, /Se generarán 2 conceptos de diseño/);
  assert.match(publisher, /Control de hoy/);
  assert.match(publisher, /IMAGE_USAGE_KEY = 'ck_image_usage_v1'/);
  assert.match(publisher, /recordImageUsage\(id === 'recraft'/);
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

test('Las escenas de tienda se adaptan a locales reales de municipios del Caribe', () => {
  assert.match(publisher, /RETAIL STORE SCENE CONTRACT — MANDATORY/);
  assert.match(publisher, /SMALL-TOWN LOCATION REALISM/);
  assert.match(publisher, /35–80 m²/);
  assert.match(publisher, /Use 5–9 customers/);
  assert.match(publisher, /Corozal, Chinú, Tolú and Ciénaga de Oro/);
  assert.match(publisher, /luxury flagship or capital-city megastore/);
  assert.match(publisher, /glass display counters/);
  assert.match(publisher, /No close-up, tight crop/);
  assert.match(publisher, /buildRetailStoreSceneContract\(prompt\)/);
  assert.match(publisher, /buildRecraftRequestPrompt\(prompt\)/);
  assert.match(publisher, /GPT_ART_DIRECTION}\\n\$\{qualityContract}/);
});

test('El prompt adapta reglas al contexto y no impone recursos de urgencia', () => {
  assert.match(publisher, /CONTEXT ADAPTATION CONTRACT — MANDATORY/);
  assert.match(publisher, /buildAdaptiveContextContract\(\)/);
  assert.match(publisher, /countdown clock is optional, never mandatory/);
  assert.match(publisher, /ADAPTIVE TEXT HIERARCHY — INFORMATION-DENSE PIECE/);
  assert.match(publisher, /\['captacion','institucional','jornada'\]\.includes\(modo\) \? '' : getRefBlock\(\)/);
  assert.doesNotMatch(publisher, /countdown clock in turquoise\. Maximum urgency/);
  assert.doesNotMatch(publisher, /Badge "SOLO HOY" o elemento de cuenta regresiva/);
  assert.doesNotMatch(publisher, /EVENT DATE \(VERY LARGE\)/);
});

test('La jornada valida que el día de la semana coincida con la fecha', () => {
  assert.match(publisher, /function validateEventDateConsistency/);
  assert.match(publisher, /La fecha no coincide: ese día es/);
  assert.match(publisher, /if \(!validateEventDateConsistency\(\)\) return;/);
  assert.match(publisher, /EVENT_WEEKDAYS_ES/);
  assert.match(publisher, /Escribe el número de fecha después de cada día/);
});

test('Recraft recibe un prompt compacto por debajo del límite interno', () => {
  assert.match(publisher, /function buildRecraftRequestPrompt/);
  assert.match(publisher, /compactContract\.length > 9800/);
  assert.match(publisher, /prompt: recraftPrompt/);
});

test('La dirección publicitaria evita productos pegados y textos inventados', () => {
  assert.match(publisher, /9\.5\/10 AD CREATIVE QUALITY GATE/);
  assert.match(publisher, /Do not add any floating, oversized, cut-out or hero smartphone/);
  assert.match(publisher, /at most 20% of the full canvas/);
  assert.match(publisher, /EXACT TEXT ALLOWLIST — ZERO EXCEPTIONS/);
  assert.match(publisher, /Do not add SOLO HOY/);
  assert.match(publisher, /varied believable actions/);
  assert.match(publisher, /buildAdCreativeQualityPrompt\(prompt\)/);
});

test('Los titulares priorizan claridad comercial y bloquean frases artificiales', () => {
  assert.match(publisher, /CONTRATO DE TITULARES — CLARIDAD ANTES QUE INGENIO/);
  assert.match(publisher, /function isHeadlineAcceptable/);
  assert.match(publisher, /function curateHeadlines/);
  assert.match(publisher, /PROHIBIDO garantizar resultados universales o aprobación/);
  assert.match(publisher, /No fuerces humor, rimas, aspiración ni regionalismos/);
  assert.match(publisher, /Uno invita al evento, uno expresa el beneficio verificable/);
  assert.doesNotMatch(publisher, /exprésalo de forma nueva e inesperada/);
  assert.doesNotMatch(publisher, /Nivel: Nike, Coca-Cola, Claro Colombia/);
  assert.equal((publisher.match(/setTimeout\(\(\) => generarMasTitulares\(\), 500\);/g) || []).length, 1);
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

test('GPT Image permite composiciones largas sin reintentos automáticos', () => {
  assert.match(worker, /AbortSignal\.timeout\(24e4\)/);
  assert.match(worker, /GPT Image excedi\\xF3 el tiempo de generaci\\xF3n/);
  assert.match(worker, /No se realiz\\xF3 un segundo intento/);
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
