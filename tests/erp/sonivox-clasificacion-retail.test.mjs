import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20260905031622_reclasificar_sonivox_retail.sql', import.meta.url),
  'utf8',
);
const app = await readFile(
  new URL('../../creditek/erp/aliados-v1-1-app.js', import.meta.url),
  'utf8',
);
const quality = await readFile(
  new URL('../../creditek/erp/aliados-calidad.html', import.meta.url),
  'utf8',
);

test('reclasifica exclusivamente el crédito histórico de Sonivox como Retail', () => {
  assert.match(migration, /codigo\s*=\s*'CK-07'/);
  assert.match(migration, /codigo_credito\s*=\s*'DKJZFJC'/);
  assert.match(migration, /tipo_establecimiento\s*=\s*'propia'/);
  assert.match(migration, /ejecutivo_historico_id\s*=\s*null/);
  assert.match(migration, /pagamos_historico\s*=\s*round\(valor_comercial_historico\s*\*\s*0\.76/);
  assert.match(migration, /bonos_historicos\s*=\s*0/);
  assert.match(migration, /v_afectados\s*<>\s*1/);
});

test('servidor e interfaz impiden vincular una tienda propia con Aliados', () => {
  assert.match(migration, /pertenece a Creditek Retail y no admite ejecutivo de Aliados/);
  assert.match(migration, /o\.tipo\s*=\s*'propia'/);
  assert.match(app, /function historicalMatchesOwnStore/);
  assert.match(app, /!historicalMatchesOwnStore\(x\)/);
  assert.match(app, /Este establecimiento pertenece a Creditek Retail/);
  assert.match(quality, /aliados-v1-1-app\.js\?v=1\.1\.27/);
});
