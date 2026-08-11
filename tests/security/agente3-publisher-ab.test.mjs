import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/agentes/agente3-meta-ads.html', import.meta.url), 'utf8');

test('el publicador identifica las variantes A y B sin activar campañas', () => {
  assert.match(html, /VARIANTE A/);
  assert.match(html, /publisher-ab-enabled/);
  assert.match(html, /publisher-piece-b/);
  assert.match(html, /Ambas se crearán en PAUSED/);
  assert.match(html, /variants:\[\{/);
  assert.match(html, /comparison==='A\/B'/);
});

test('la interfaz muestra el detalle Meta sanitizado en vez de ocultarlo', () => {
  assert.match(html, /data\.meta\?\.message/);
  assert.match(html, /data\.reason/);
  assert.doesNotMatch(html, /Meta no está disponible temporalmente/);
});

test('las proporciones reservan espacio a la creatividad y compactan controles auxiliares', () => {
  assert.match(html, /\.publisher-platforms\{[^}]*height:64px/);
  assert.match(html, /\.publisher-submit\{[^}]*width:min\(340px,100%\)/);
  assert.match(html, /\.publisher-coverage\{[^}]*min-height:0/);
  assert.match(html, /\.publisher-coverage \.publisher-checks label\{[^}]*min-height:26px/);
  assert.match(html, /publisher-platforms \+ \.publisher-section-title\{[^}]*margin-top:2px/);
  assert.doesNotMatch(html, /publisher-city-toggle|Ver ciudades/);
});

test('la consolidación visual mantiene franja e iconos KPI discretos', () => {
  assert.match(html, /id="banner" class="banner">● Meta Ads conectado/);
  assert.doesNotMatch(html, /Meta Ads conectado\. Métricas y publicador seguro disponibles\./);
  assert.match(html, /\.banner:not\(\.blocked\)\{[^}]*padding:4px 0[^}]*border:0/);
  assert.match(html, /\.kpi-help\{[^}]*width:16px;height:16px[^}]*border:1px solid/);
  assert.match(html, /\.publisher-submit\{[^}]*width:min\(340px,100%\)/);
  assert.match(html, /\.publisher-preview-single img\{[^}]*height:220px/);
  assert.doesNotMatch(html, /Ver ciudades/);
});

test('el layout final mantiene ciudades visibles y creatividades compactas', () => {
  assert.doesNotMatch(html, /Ver ciudades|publisher-city-toggle|id="publisher-cities" hidden/);
  assert.match(html, /#publisher-cities\{[^}]*display:block/);
  assert.match(html, /\.city-toolbar\{[^}]*flex-wrap:nowrap/);
  assert.match(html, /\.creative-grid\{grid-template-columns:1fr\}/);
  assert.match(html, /\.creative-grid\.ab-enabled\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html, /\.creative-card \.creative-preview\{[^}]*height:220px[^}]*max-height:220px/);
  assert.match(html, /\.publisher-preview-variant img\{[^}]*height:220px[^}]*max-height:220px/);
  assert.match(html, /\.publisher-preview-single img\{[^}]*max-height:220px/);
  assert.match(html, /\.creative-card textarea\{[^}]*min-height:52px[^}]*max-height:72px/);
});
