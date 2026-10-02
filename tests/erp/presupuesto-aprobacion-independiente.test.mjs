import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('solo ventas y unidades admiten porcentajes de presupuesto', () => {
  const html = readFileSync(join(root, 'creditek/erp/presupuestos.html'), 'utf8');
  const sql = readFileSync(join(root, 'supabase/migrations/20260904032500_presupuesto_aprobacion_independiente.sql'), 'utf8');
  for (const metrica of ['meta_venta_total','meta_creditos','meta_uds_cel','meta_uds_acc']) {
    assert.match(html, new RegExp(`data-metrica="${metrica}"`));
  }
  assert.doesNotMatch(html, /data-metrica="meta_utilidad"/);
  assert.match(html, /Aprobar los 4 indicadores/);
  assert.match(html, /guardar_presupuesto_operativo_general/);
  assert.match(sql, /for i in 1\.\.array_length/);
  assert.match(sql, /Solo Gerencia puede aprobar presupuestos/);
});
