import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publisher = await readFile(new URL('../../creditek/agentes/creditek-agente-redes.html', import.meta.url), 'utf8');
const imageClient = await readFile(new URL('../../creditek/agentes/aura-image-client.mjs', import.meta.url), 'utf8');
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

test('Las escenas de tienda exigen plano abierto y señales inequívocas del local', () => {
  assert.match(publisher, /RETAIL STORE SCENE CONTRACT — MANDATORY/);
  assert.match(publisher, /24–28 mm wide-angle lens/);
  assert.match(publisher, /At least 45% of the frame/);
  assert.match(publisher, /glass cellphone display counters/);
  assert.match(publisher, /No close-up, tight crop/);
  assert.match(publisher, /buildRetailStoreSceneContract\(prompt\)/);
  assert.match(publisher, /RECRAFT_ART_DIRECTION,[\s\S]{0,180}buildRetailStoreSceneContract\(prompt\)/);
  assert.match(publisher, /GPT_ART_DIRECTION}\\n\$\{selectedStyleContract}\\n\$\{qualityContract}/);
});

test('Alegre costeño exige calidez regional sin convertirla en carnaval', () => {
  assert.match(publisher, /COSTENO_VISUAL_CONTRACT/);
  assert.match(publisher, /subtle contemporary Macondian warmth/);
  assert.match(publisher, /Do not interpret "costeño" as carnival/);
  assert.match(publisher, /Reject dark, gloomy, beige, gray, overly sober or institutional/);
  assert.match(publisher, /currentEstilo === 'costeno'/);
  assert.match(publisher, /buildSelectedVisualStyleContract\(\)/);
  assert.match(publisher, /PALETTE: \$\{paletaEstilo\.paleta\}/);
  assert.match(publisher, /COLOR BALANCE: \$\{paletaEstilo\.dominio\}/);
  assert.doesNotMatch(publisher, /- Deep navy #0B1E3D \| Turquoise #00C4CC \| White #FFFFFF/);
});

test('El cliente permite llamar Recraft y el Worker conserva también las rutas de video', () => {
  assert.match(imageClient, /'\/recraft\/images'/);
  assert.match(worker, /path !== "\/recraft\/images"/);
  assert.match(worker, /path !== "\/veo\/generate"/);
  assert.match(worker, /path !== "\/veo\/status"/);
  assert.match(worker, /if \(path === "\/recraft\/images"\) return llamarRecraft_/);
  assert.match(worker, /if \(path === "\/veo\/generate"\) return iniciarVeo_/);
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

test('Cada diseñador recibe correcciones de arte específicas sin homogeneizar conceptos', () => {
  assert.match(publisher, /one full-bleed editorial retail photograph/);
  assert.match(publisher, /no solid header, footer, card, beige or white panel/);
  assert.match(publisher, /CTA may occupy at most 35% of the canvas width/);
  assert.match(publisher, /visual triangle connecting the main customer interaction, headline and CTA/);
  assert.match(publisher, /supporting copy on a calm high-contrast area or a subtle dark translucent scrim/);
  assert.match(publisher, /at least 6% safe margin around the natural logo zone/);
  assert.match(publisher, /Avoid decorative bands that cut through the photograph/);
});

test('Recraft compacta el prompt antes del límite seguro del Worker', () => {
  assert.match(publisher, /function buildRecraftProviderPrompt\(prompt = ''\)/);
  assert.match(publisher, /sourceWithoutBrandInstructions/);
  assert.match(publisher, /logo\|wordmark\|brand identity\|branding lock\|official asset\|creditek/);
  assert.doesNotMatch(publisher, /const priorityPrefix = `\$\{COMMERCIAL_DESIGN_CONTRACT\}/);
  assert.match(publisher, /const maxLength = 9500/);
  assert.match(publisher, /Math\.max\(0, maxLength - priorityPrefix\.length - separator\.length\)/);
  assert.match(publisher, /prompt: buildRecraftProviderPrompt\(prompt\)/);
  assert.doesNotMatch(publisher, /prompt: `\$\{COMMERCIAL_DESIGN_CONTRACT\}[\s\S]{0,180}\$\{prompt\}`/);
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
