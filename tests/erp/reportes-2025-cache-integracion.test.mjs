import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/reportes.html', import.meta.url),
  'utf8',
);

test('reportes conserva las tres comparaciones 2025 junto al caché KORA', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);

  assert.match(html, /<script src="reportes-query-cache\.js"><\/script>/);
  assert.match(html, /function crearCacheRefresco\(/);
  assert.match(html, /function exigirRespuestas\(\.\.\.respuestas\)/);
  assert.match(html, /const cache = crearCacheRefresco\(\)/);
  assert.match(html, /cargarKPIs\(cache\)/);
  assert.match(html, /cargarVentas\(cache\)/);
  assert.match(html, /cargarCartera\(cache\)/);
  assert.match(html, /cargarInventario\(cache\)/);

  assert.match(html, /id="kpi-ventas-delta"/);
  assert.match(html, /% vs 2025/);
  assert.match(html, />2025 real<\/th>/);
  assert.match(html, />vs 2025<\/th>/);
  assert.match(html, />2025<\/th>[\s\S]*>2026<\/th>[\s\S]*2026 vs 2025/);
  assert.match(html, /label:\s*'2025'/);
  assert.match(html, /label:\s*'2026'/);
  assert.match(html, /cargarCrecimiento\(\)/);
});

test('el KPI histórico reutiliza cartera del caché sin redeclararla', () => {
  const inicio = html.indexOf('async function cargarKPIs(cache)');
  const fin = html.indexOf('async function cargarVentas(cache)', inicio);
  const cargarKpis = html.slice(inicio, fin);

  assert.match(cargarKpis, /const \{ desde, hasta \} = getPeriodo\(\)/);
  assert.doesNotMatch(cargarKpis, /(?:let|const)\s+qCC\s*=/);
  assert.equal((cargarKpis.match(/\bccRes\b/g) || []).length >= 2, true);
});

test('las consultas históricas también participan en el manejo de errores', () => {
  assert.match(html, /exigirRespuestas\(histRes\)/);
  assert.match(html, /exigirRespuestas\(pRes, vRes, h2025Res\)/);
  assert.match(html, /exigirRespuestas\(ventasRes, histRes\)/);
});
