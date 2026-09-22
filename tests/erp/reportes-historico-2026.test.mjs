import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { serie2026 } = require('../../creditek/erp/reportes-historico.js');
const migration = await readFile(new URL('../../supabase/migrations/20260922051532_consolidar_historico_retail_2026.sql', import.meta.url), 'utf8');

test('el comparativo usa histórico en meses cerrados y ventas en el mes operativo sin duplicar', () => {
  const historico = Array.from({ length: 8 }, (_, i) => ({ anio: 2026, mes: i + 1, venta_total: (i + 1) * 100 }));
  historico.push({ anio: 2026, mes: 9, venta_total: 999999 });
  const serie = serie2026([{ fecha: '2026-09-03', total: 400 }, { fecha: '2026-09-04', total: 600 }], historico, 9);
  assert.deepEqual(serie.slice(0, 8).map(x => x.total), [100, 200, 300, 400, 500, 600, 700, 800]);
  assert.deepEqual(serie[8], { mes: 9, total: 1000, fuente: 'ventas operativas' });
  assert.equal(serie[9].total, null);
});

test('un mes pasado sin fuente queda explícitamente faltante', () => {
  const serie = serie2026([], [{ anio: 2026, mes: 1, venta_total: 100 }], 9);
  assert.deepEqual(serie[7], { mes: 8, total: null, fuente: 'sin fuente cargada' });
});

test('la migración consolida por tienda_codigo y prorratea el mensual por días calendario', () => {
  assert.match(migration, /join public\.origenes o\s+on o\.codigo = h\.tienda_codigo/s);
  assert.match(migration, /group by h\.tienda_codigo/);
  assert.match(migration, /on conflict \(tienda_codigo, anio, mes\) do update/);
  assert.match(migration, /where o\.codigo = p_tienda and o\.tipo = 'propia' and o\.activo/);
  assert.match(migration, /v_total \/ nullif\(v_dias, 0\)/);
  assert.match(migration, /histórico mensual uniforme por tienda_codigo/);
});
