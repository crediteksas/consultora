import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../creditek/workers/aura-meta-ads-api/src/index.ts', import.meta.url), 'utf8');

test('trazabilidad captura publicación simple y A/B con atomicidad de IDs', () => {
  for (const marker of ['publication_id', 'published_at', 'published_by', 'campaign_name', 'assertCompleteMetaIds', 'META_PUBLICATION_INCOMPLETE']) {
    assert.match(worker, new RegExp(marker));
  }
  for (const key of ['campaign_id', 'adset_id', 'creative_a_id', 'creative_b_id', 'ad_a_id', 'ad_b_id']) assert.match(worker, new RegExp(key));
  assert.match(html, /traceHasCompleteIds/);
  assert.match(html, /PUBLICACIÓN ENVIADA A META/);
});

test('persistencia e historial sobreviven recarga y diferencian nombres repetidos', () => {
  assert.match(html, /PUBLICATION_HISTORY_KEY/);
  assert.match(html, /localStorage\.getItem\(PUBLICATION_HISTORY_KEY/);
  assert.match(html, /localStorage\.setItem\(PUBLICATION_HISTORY_KEY/);
  assert.match(html, /publication-history-list/);
  assert.match(html, /publication_id/);
});

test('parser de errores es null-safe y conserva orden de Meta', () => {
  assert.match(html, /meta\.error_user_msg,meta\.error_user_title,meta\.message,meta\.error_data/);
  assert.match(html, /text==='null'\|\|text==='undefined'/);
  assert.doesNotMatch(html, /detail=meta\.error_user_msg\|\|meta\.error_user_title\|\|meta\.message/);
});

test('preflight, activación, rollback, Intelligence y tabs permanecen presentes', () => {
  for (const marker of ['META_PREFLIGHT_CREATIVE_FAILED', 'META_ADSET_ACTIVATION_FAILED', 'META_AD_ACTIVATION_FAILED', 'META_CAMPAIGN_ACTIVATION_FAILED', 'portfolioReading', 'class="agent3-tabs"']) {
    assert.ok(worker.includes(marker) || html.includes(marker), `missing marker ${marker}`);
  }
});

test('el publicador usa A ancho completo y A/B en dos columnas', () => {
  assert.match(html, /\.publisher-grid\{grid-template-columns:minmax\(0,1fr\);align-items:start\}/);
  assert.match(html, /#publisher\{width:100%;max-width:none;min-width:0\}/);
  assert.match(html, /\.publisher-form,\.publisher-form \.creative-grid\{width:100%;max-width:none;min-width:0\}/);
  assert.match(html, /\.creative-grid\.ab-enabled\{width:100%;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)\}/);
  assert.match(html, /\.creative-card\{width:100%;max-width:none\}/);
  assert.match(html, /\.publisher-preview\{position:static;display:grid/);
  assert.match(html, /\.creative-grid\{grid-template-columns:1fr\}/);
  assert.match(html, /\.creative-grid\.ab-enabled\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(html, /classList\.toggle\('ab-enabled',enabled\)/);
  assert.match(html, /@media\(max-width:47\.999rem\)\{\.creative-grid/);
  assert.match(html, /\.creative-grid\.ab-enabled\{grid-template-columns:1fr\}/);
  const publisherGridStart = html.indexOf('<div class="publisher-grid">');
  assert.ok(publisherGridStart >= 0);
  assert.ok(html.indexOf('<form id="publisher-form" class="publisher-form">', publisherGridStart) > publisherGridStart);
  assert.match(html, /<aside id="publisher-preview" class="publisher-preview"/);
});

test('un fallo de trazabilidad no bloquea la sesión ni redirige a login', () => {
  const start = html.indexOf('async function load(){');
  const end = html.indexOf('document.querySelector(\'#refresh\')', start);
  assert.ok(start >= 0 && end > start, 'bootstrap de Agente 3 no encontrado');
  const bootstrap = html.slice(start, end);
  const sessionGuard = bootstrap.indexOf('const token=auraSessionToken();');
  const historyRender = bootstrap.indexOf('safeRenderPublicationHistory();');
  assert.ok(sessionGuard >= 0, 'la sesión debe leerse durante el bootstrap');
  assert.ok(historyRender > sessionGuard, 'el historial debe ejecutarse después de validar la sesión');
  assert.match(html, /function safeRenderPublicationHistory\(\)\{try\{renderPublicationHistory\(\)\}catch/);
  assert.match(bootstrap, /if\(!token\)\{location\.href=.*return\}/);
});

test('el publicador compacta configuración, cobertura y plataformas sin perder selección', () => {
  assert.match(html, /class="publisher-campaign-config"/);
  assert.match(html, /id="publisher-city-toggle"[^>]*aria-expanded="false"/);
  assert.match(html, /id="publisher-city-summary"/);
  assert.match(html, /id="publisher-cities" hidden/);
  assert.match(html, /Retail: 0 seleccionadas · Aliados: 0 seleccionadas/);
  assert.match(html, /function updatePublisherCitySummary\(\)/);
  assert.match(html, /const open=cities\.hidden;cities\.hidden=!open/);
  assert.match(html, /class="[^"]*publisher-platforms[^"]*"/);
  assert.match(html, /\.publisher-campaign-config\{grid-column:1\/\-1;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html, /\.publisher-form\{gap:8px\}/);
});
