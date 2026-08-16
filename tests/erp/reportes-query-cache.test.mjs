import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const modulePath = path.join(root, 'creditek/erp/reportes-query-cache.js');

async function cargarModulo() {
  const context = { window: {} };
  vm.runInNewContext(await readFile(modulePath, 'utf8'), context);
  return context.window.CreditekReportesQueryCache;
}

test('comparte una consulta entre consumidores del mismo refresco', async () => {
  const cacheFactory = await cargarModulo();
  let ejecuciones = 0;
  const cache = cacheFactory.crear({
    ventas: async () => {
      ejecuciones += 1;
      return { data: [{ total: 100 }] };
    },
  });

  const [primera, segunda] = await Promise.all([
    cache.obtener('ventas'),
    cache.obtener('ventas'),
  ]);

  assert.equal(ejecuciones, 1);
  assert.equal(primera, segunda);
});

test('un nuevo ciclo ejecuta nuevamente la consulta', async () => {
  const cacheFactory = await cargarModulo();
  let ejecuciones = 0;
  const loaders = {
    ventas: async () => {
      ejecuciones += 1;
      return { data: [] };
    },
  };

  await cacheFactory.crear(loaders).obtener('ventas');
  await cacheFactory.crear(loaders).obtener('ventas');

  assert.equal(ejecuciones, 2);
});

test('rechaza claves no registradas con un mensaje claro', async () => {
  const cacheFactory = await cargarModulo();
  const cache = cacheFactory.crear({});

  await assert.rejects(
    cache.obtener('inventario'),
    /consulta no registrada/i,
  );
});

test('reportes comparte ventas, cartera e inventario durante cada refresco', async () => {
  const html = await readFile(
    path.join(root, 'creditek/erp/reportes.html'),
    'utf8',
  );

  assert.match(html, /<script src="reportes-query-cache\.js"><\/script>/);
  assert.match(html, /const cache = crearCacheRefresco\(\)/);
  assert.match(html, /cargarKPIs\(cache\)/);
  assert.match(html, /cargarVentas\(cache\)/);
  assert.match(html, /cargarCartera\(cache\)/);
  assert.match(html, /cargarInventario\(cache\)/);
  assert.match(html, /function exigirRespuestas\(\.\.\.respuestas\)/);
  assert.match(html, /exigirRespuestas\(pRes, vRes, h2025Res\)/);
  assert.match(html, /exigirRespuestas\(vRes, viRes, gRes\)/);
  assert.match(html, /exigirRespuestas\(unidadesRes\)/);
});
