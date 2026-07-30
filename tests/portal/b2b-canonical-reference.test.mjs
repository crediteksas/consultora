import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildCanonicalName,
  findSimilarCanonical,
  parseReferenceProposal,
} from '../../creditek/portal/canonical-reference.mjs';

const apiPath = new URL('../../creditek/portal/catalog-api.mjs', import.meta.url);
const adminPath = new URL('../../creditek/portal/catalog-admin.mjs', import.meta.url);
const appsScriptPath = new URL('../../creditek/portal/Code.gs', import.meta.url);
const buildPath = new URL('../../scripts/build-public.mjs', import.meta.url);

test('propone los campos de una referencia Oppo recibida', () => {
  assert.deepEqual(
    parseReferenceProposal('Oppo A6 Pro 5G 8/256 GB (Azul y Rosado)'),
    {
      brand: 'Oppo',
      model: 'A6 Pro',
      ramGb: 8,
      storageGb: 256,
      connectivity: '5G',
      colors: ['Azul', 'Rosado'],
      category: 'Celulares',
    },
  );
});

test('construye un nombre canónico estable', () => {
  assert.equal(buildCanonicalName({
    brand: 'Oppo',
    model: 'A6 Pro',
    ramGb: 8,
    storageGb: 256,
    connectivity: '5G',
  }), 'Oppo A6 Pro 5G 8GB/256GB');
});

test('detecta una referencia probable ignorando tildes, signos y espacios', () => {
  const existing = [{
    id: 'oppo-a6-pro',
    canonical_name: 'OPPO A6 PRO 5G 8GB / 256GB',
    brand: 'OPPO',
  }];

  assert.equal(
    findSimilarCanonical({
      brand: 'Oppo',
      model: 'A6 Pró',
      ramGb: 8,
      storageGb: 256,
      connectivity: '5G',
    }, existing)?.id,
    'oppo-a6-pro',
  );
});

test('la interfaz permite crear en la fila y conserva Guardar regla individual', async () => {
  const source = await readFile(adminPath, 'utf8');

  assert.match(source, /Crear como nueva referencia/);
  assert.match(source, /data-save-offer/);
  assert.match(source, /catalogApi\.saveOfferRule/);
  assert.match(source, /Referencia creada y regla guardada correctamente/);
  assert.match(source, /Completa o selecciona una referencia canónica antes de guardar/);
  assert.match(source, /Ya existe una referencia similar\. Revísala antes de crear una nueva/);
});

test('la API carga pendientes persistidos y guarda una regla por fila', async () => {
  const source = await readFile(apiPath, 'utf8');

  assert.match(source, /listar_excepciones_catalogo_admin/);
  assert.match(source, /guardar_regla_catalogo_admin/);
  assert.match(source, /create_new/);
});

test('Apps Script persiste pendientes y reglas de forma aditiva e idempotente', async () => {
  const source = await readFile(appsScriptPath, 'utf8');

  assert.match(source, /CATALOGO_EXCEPCIONES/);
  assert.match(source, /CATALOGO_REGLAS/);
  assert.match(source, /listarExcepcionesCatalogoAdmin_/);
  assert.match(source, /guardarReglaCatalogoAdmin_/);
  assert.match(source, /LockService\.getScriptLock/);
  assert.match(source, /Ya existe una referencia similar/);
  assert.doesNotMatch(source, /deleteSheet\([^)]*CATALOGO_EXCEPCIONES/);
  assert.doesNotMatch(source, /clearContents\(\)[\s\S]{0,120}CATALOGO_EXCEPCIONES/);
});

test('el build publica el analizador compartido de referencias', async () => {
  const source = await readFile(buildPath, 'utf8');
  assert.match(source, /creditek\/portal\/canonical-reference\.mjs/);
});
