import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('creditek/erp/reportes.html', 'utf8');

test('los KPI se adaptan a cuatro, dos y una columna sin cortar cifras', () => {
  assert.match(html, /class="kpi-grid grid gap-3"/);
  assert.match(html, /\.kpi-grid\s*\{[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(html, /max-width: 1200px[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(html, /max-width: 520px[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(html, /\.kpi-card \.valor[\s\S]*white-space: nowrap/);
});

test('los filtros de período conservan desplazamiento horizontal en tamaños intermedios', () => {
  assert.match(html, /\.kora-period-viewport\s*\{[\s\S]*overflow-x: auto/);
  assert.match(html, /-webkit-overflow-scrolling: touch/);
});
