import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../../creditek/agentes/', import.meta.url);
const html = await readFile(new URL('creditek-agente-redes.html', root), 'utf8');
const source = await readFile(new URL('redes-publicador.js', root), 'utf8');
const originsWorker = await readFile(new URL('../../creditek/workers/creditek-clientes/src/index.ts', import.meta.url), 'utf8');
const auraWorker = await readFile(new URL('../../creditek/workers/aura-hub/src/index.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const domain = context.window.CreditekRedesPublicador;

test('Redes Sociales integra el panel persistente del Agente Publicador', () => {
  assert.match(html, /redes-publicador\.js/);
  assert.match(html, /id="publisher-pending"/);
  assert.match(html, /id="publisher-city-filter"[^>]*multiple/);
  assert.match(html, /id="publisher-ally-filter"[^>]*multiple/);
});

test('la API real de orígenes entrega ciudad junto a tipo sin mezclar fuentes', () => {
  assert.match(originsWorker, /select=codigo,nombre,tipo,ciudad/);
});

test('el Publicador usa una lectura autenticada de AURA y no consulta servicios externos desde el navegador', () => {
  assert.match(source, /\/creditek\/agentes\/api\/publicador/);
  assert.match(source, /auraAuth\.token\(\)/);
  assert.doesNotMatch(source, /supabase\.co|workers\.dev|apikey/);
  assert.match(auraWorker, /aura_my_access/);
  assert.match(auraWorker, /sofia\.permissions[\s\S]*sofia\.use/);
  assert.match(auraWorker, /SESION_REQUERIDA/);
  assert.match(auraWorker, /ACCESO_DENEGADO/);
});

test('separa aliados de tiendas propias y deduplica ciudades', () => {
  const result = domain.normalizeOrigins([
    { codigo: 'CK-01', nombre: 'Propia', tipo: 'propia', ciudad: 'Corozal' },
    { codigo: 'a1', nombre: 'Aliado 1', tipo: 'aliado', ciudad: 'Barranquilla' },
    { codigo: 'a2', nombre: 'Aliado 2', tipo: 'ALIADO', ciudad: ' barranquilla ' },
    { codigo: 'a3', nombre: 'Aliado 3', tipo: 'aliado', ciudad: 'Galapa' },
  ]);
  assert.equal(result.allies.length, 3);
  assert.deepEqual([...result.cities], ['Barranquilla', 'Galapa']);
  assert.equal(result.owned.length, 1);
});

test('clasifica estados reales sin inventar pendientes', () => {
  const rows = [
    { id: '1', estado: 'sin_imagen' },
    { id: '2', estado: 'lista_para_publicar' },
    { id: '3', estado: 'programado' },
    { id: '4', estado: 'error' },
    { id: '5', estado: 'publicado' },
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(domain.summarizePieces(rows))),
    { total: 5, pending: 1, drafts: 0, scheduled: 1, errors: 1, approval: 1, published: 1 },
  );
});

test('el filtro admite todas, una o varias ciudades y aliados', () => {
  const selected = domain.resolveSelection(
    ['Barranquilla', 'Galapa'],
    ['a1', 'a2'],
    [
      { codigo: 'a1', ciudad: 'Barranquilla' },
      { codigo: 'a2', ciudad: 'Galapa' },
      { codigo: 'a3', ciudad: 'Turbo' },
    ],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(selected)), {
    cities: ['Barranquilla', 'Galapa'],
    allies: ['a1', 'a2'],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(domain.resolveSelection([], [], []))), { cities: [], allies: [] });
});
