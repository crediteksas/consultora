import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../../supabase/migrations/20260903035348_asociar_historicos_a_ejecutivos_existentes.sql', import.meta.url), 'utf8');
const app = await readFile(new URL('../../creditek/erp/aliados-v1-1-app.js', import.meta.url), 'utf8');

test('asocia únicamente históricos con un origen y ejecutivo ya registrados', () => {
  assert.match(migration, /join public\.origenes/);
  assert.match(migration, /o\.ejecutivo_id is not null/);
  assert.match(migration, /v_asociados <> 118/);
  assert.doesNotMatch(migration, /EDITH SILVA|WENDY PADILLA|MARIA COGOLLO/);
});

test('la interfaz distingue al vendedor del comercio del ejecutivo Creditek', () => {
  assert.match(app, /Ejecutivo Creditek no registrado/);
  assert.match(app, /Vendedor del comercio/);
  assert.match(app, /Históricos sin ejecutivo Creditek/);
  assert.doesNotMatch(app, /Pendiente de asociación/);
});
