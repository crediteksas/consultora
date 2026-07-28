import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(
  new URL('../../creditek/erp/reportes.html', import.meta.url),
  'utf8',
);

test('los filtros de reportes usan un selector segmentado aislado del botón primario global', () => {
  assert.match(html, /class="[^"]*kora-report-filters[^"]*"/);
  assert.match(html, /class="kora-period-viewport"/);
  assert.match(html, /class="kora-period-segments"/);
  assert.match(html, /body\.kora-product-page \.kora-report-filters \.kora-period-segments \.btn-nav\s*\{/);
  assert.match(html, /background:\s*transparent/);
  assert.match(html, /body\.kora-product-page \.kora-report-filters \.kora-period-segments \.btn-nav\.active\s*\{/);
  assert.match(html, /var\(--ctk-color-primary-900\)/);
});

test('la selección de tienda conserva sus identificadores y recibe tratamiento secundario', () => {
  assert.match(html, /id="btnTiendas"/);
  assert.match(html, /id="panelTiendas"/);
  assert.match(html, /id="rango-visible"/);
  assert.match(html, /class="[^"]*kora-store-filter-row[^"]*"/);
  assert.match(html, /body\.kora-product-page \.kora-report-filters \.multi-select \.multi-select-btn\s*\{/);
  assert.match(html, /var\(--ctk-color-surface\)/);
});

test('la barra se adapta sin alterar los periodos disponibles', () => {
  for (const period of [
    'hoy',
    'ayer',
    'semana',
    'semana_pasada',
    'mes',
    'mes_pasado',
    'ult3m',
    'anio',
    'anio_pasado',
    'personalizado',
  ]) {
    assert.match(html, new RegExp(`data-periodo="${period}"`));
  }

  assert.match(html, /@media \(max-width:\s*63\.999rem\)/);
  assert.match(html, /@media \(max-width:\s*47\.999rem\)/);
  assert.match(html, /overflow-x:\s*auto/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
});
