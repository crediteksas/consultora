import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = new URL('../../creditek/erp/utilidad-creditek.html', import.meta.url);

test('el dashboard B2B presenta costo, facturado, utilidad y margen en ese orden', async () => {
  const html = await readFile(page, 'utf8');
  const cards = html.match(/<section class="kpi-grid">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(cards, 'no se encontró la fila de indicadores');
  const ids = [...cards.matchAll(/<p id="(kpi-[^"]+)" class="kpi-value">/g)].map(match => match[1]);
  assert.deepEqual(ids, ['kpi-costo', 'kpi-facturado', 'kpi-utilidad', 'kpi-margen']);
  assert.match(cards, /Costo real \/ compras/);
  assert.match(cards, /Costo de mercancía despachada/);
});
