import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../creditek/erp/tablero.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../design-system/components/kora-dashboard.css', import.meta.url), 'utf8');

test('rendimiento por tienda prioriza el nombre y agrupa indicadores relacionados', () => {
  assert.match(html, /dashboard-table dashboard-store-table/);
  assert.match(html, /<th>Tienda<\/th><th class="centro">Créditos \/ meta<\/th><th>Avance y proyección<\/th>/);
  assert.match(html, /class="store-name">\$\{escapeHtml\(f\.tienda\.nombre\)\}/);
  assert.match(html, /class="centro store-goal"/);
  assert.match(html, /class="store-progress__detail"/);
  assert.match(html, /Proy\. \$\{Math\.round\(f\.runRate\)\}/);
  assert.match(html, /\+ '% ritmo'/);
  assert.doesNotMatch(html, /<th class="num">Meta<\/th>/);
  assert.doesNotMatch(html, /<th class="centro">Sem\.<\/th>/);
});

test('la tabla de tiendas cabe en tablet sin desplazamiento horizontal', () => {
  assert.match(css, /\.dashboard-store-table\s*\{\s*table-layout:\s*fixed;/);
  assert.match(css, /\.dashboard-store-table \.store-name[\s\S]*white-space:\s*normal;/);
  assert.match(css, /@media \(max-width: 63\.999rem\)[\s\S]*\.tabla-wrap--tiendas\s*\{\s*overflow-x:\s*hidden;/);
  assert.match(css, /\.dashboard-store-table \.barra-pct\s*\{\s*width:\s*clamp\(/);
});
