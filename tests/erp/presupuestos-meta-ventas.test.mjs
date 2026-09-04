import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../creditek/erp/presupuestos.html', import.meta.url), 'utf8');

test('Presupuestos permite consultar y editar la meta diaria de ventas', () => {
  assert.match(html, /id="tabVentas" data-metrica="meta_venta_total">Ventas<\/button>/);
  assert.match(html, /meta_venta_total: 'Meta de ventas'/);
  assert.match(html, /meta_venta_total: reg \? reg\.meta_venta_total : 0/);
  assert.match(html, /metricaActual === 'meta_venta_total'/);
});
