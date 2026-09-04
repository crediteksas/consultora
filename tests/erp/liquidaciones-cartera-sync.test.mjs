import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  'supabase/migrations/20260903234500_sincronizar_liquidaciones_con_cartera.sql',
  'utf8',
);

test('sincroniza cada crédito nuevo por código único sin crear ventas', () => {
  assert.match(migration, /on conflict \(plataforma, codigo_credito\) do update/i);
  assert.match(migration, /after insert or update[\s\S]*on public\.liquidation_operations/i);
  assert.match(migration, /'clasificacion_kora', 'operacion_nueva'/i);
  assert.doesNotMatch(migration, /insert into public\.(ventas|venta_items|unidades|creditos(?!_)|movimientos_caja|payment_orders)/i);
});

test('el backfill inicia el 2 de septiembre y conserva incidencias de inventario', () => {
  assert.match(migration, /operation_at >= timestamptz '2026-09-02 00:00:00-05'/i);
  assert.match(migration, /historico_inicial[\s\S]*false/i);
  assert.match(migration, /requiere_soporte[\s\S]*true/i);
  assert.doesNotMatch(migration, /delete from public\.liquidation_incidents/i);
});
