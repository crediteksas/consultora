import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url), 'utf8');

test('Publicación y métricas conserva Retail y Aliados sin exponer datos privados', () => {
  assert.match(html, /\['retail','Retail'\]/);
  assert.match(html, /\['aliado','Aliados'\]/);
  assert.match(html, /publisher-city-search/);
  assert.match(html, /publisher-select-all/);
  assert.doesNotMatch(html, /nombre(?:s)? de aliados|vendedores|direcciones|redes sociales/i);
});

test('el presupuesto distingue diario y total y envía el contrato explícito', () => {
  assert.match(html, /id="publisher-budget-type"/);
  assert.match(html, /value="daily"/);
  assert.match(html, /value="lifetime"/);
  assert.match(html, /budget_type:publisherValue\('#publisher-budget-type'\)/);
});

test('el publicador admite archivo manual, previsualiza, reemplaza y elimina', () => {
  assert.match(html, /id="publisher-image-file"[^>]+type="file"[^>]+accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(html, /publisher-image-remove/);
  assert.match(html, /FileReader/);
  assert.match(html, /image_data/);
});

test('los KPI tienen ayuda contextual y la tendencia diaria inicia contraída', () => {
  assert.match(html, /class="kpi-help"/);
  assert.match(html, /aria-label="Qué mide/);
  assert.match(html, /id="trend-details"/);
  assert.match(html, /Ver tendencia diaria/);
  assert.doesNotMatch(html, /<section class="panel"><h2>Tendencia diaria<\/h2>/);
});
