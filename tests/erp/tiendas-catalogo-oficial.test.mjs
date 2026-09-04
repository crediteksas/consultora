import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../../supabase/migrations/20260904014257_normalizar_nombres_ciudades_tiendas.sql', import.meta.url),
  'utf8',
);

test('el catálogo oficial conserva diez tiendas activas con nombre y ciudad', () => {
  const esperadas = [
    ['CK-01', 'Celfiao Tolú', 'Tolú'],
    ['CK-02', 'Móvil Shopping', 'Corozal'],
    ['CK-03', 'Celfiao', 'Corozal'],
    ['CK-04', 'Creditel Store', 'Corozal'],
    ['CK-05', 'Chinucell', 'Chinú'],
    ['CK-06', 'Creditel Chinú', 'Chinú'],
    ['CK-07', 'Sonivox', 'Chinú'],
    ['CK-08', 'Orocel', 'Ciénaga de Oro'],
    ['CK-09', 'Kredisinu', 'Ciénaga de Oro'],
    ['CK-11', 'Creditel Coveñas', 'Coveñas'],
  ];
  for (const fila of esperadas) {
    assert.match(sql, new RegExp(fila.map(valor => valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("',\\s*'")));
  }
  assert.match(sql, /v_correctas <> 10/);
  assert.doesNotMatch(sql, /update\s+public\.origenes[\s\S]*set\s+codigo/i);
});

test('los nombres anteriores quedan como alias para no romper importaciones', () => {
  assert.match(sql, /aliases = case/);
  assert.match(sql, /jsonb_build_array\(o\.nombre\)/);
});
