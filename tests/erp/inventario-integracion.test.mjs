import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/inventario.html', import.meta.url),
  'utf8',
);
const app = await readFile(new URL('../../creditek/erp/app.html', import.meta.url), 'utf8');

test('inventario integra dominio, shell KORA y exportación', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(html, /<script src="inventario-domain\.js"><\/script>/);
  assert.match(html, /<script src="\/config\/kora-environment\.generated\.js"><\/script>/);
  for (const archivo of ['kora-access-control', 'sidebar']) {
    const patron = new RegExp(`<script src="${archivo}\\.js\\?v=([^\"]+)"`);
    const esperado = app.match(patron);
    const actual = html.match(patron);
    assert.ok(esperado && actual, `${archivo} debe estar en el shell y en Inventario`);
    assert.equal(actual[1], esperado[1], `${archivo} debe usar la versión compartida`);
  }
  assert.match(html, /data-kora-shell="1\.0\.0"/);
  assert.match(html, /xlsx@0\.18\.5/);
  assert.match(html, /<script src="inventario-export\.js"><\/script>/);
  assert.match(html, /const inventarioDomain = window\.CreditekInventarioDomain/);
  assert.match(html, /const inventarioExport = window\.CreditekInventarioExport/);
});

test('consultas y resumen usan exclusivamente el contrato aprobado del dominio', () => {
  assert.match(html, /\.select\(inventarioDomain\.columnasUnidades\(esCentral\(\)\)\)/);
  assert.match(html, /\.select\(inventarioDomain\.columnasStock\(esCentral\(\)\)\)/);
  assert.match(html, /const resumen = inventarioDomain\.resumirInventario\(\{/);
  assert.match(html, /tiendaCodigo: tiendaActiva\(\)/);
  assert.doesNotMatch(html, /const totalUnidadesDisponibles/);
  assert.doesNotMatch(html, /const valorTotalRemision/);
});

test('costos faltantes permanecen pendientes y nunca se presentan como cero', () => {
  assert.match(html, /inventarioDomain\.valorVisibleUnidad\(u\) === null \? 'Pendiente'/);
  assert.match(html, /const costoVisible = inventarioDomain\.valorVisibleStock\(r\)/);
  assert.match(html, /costoVisible === null \? 'Pendiente' : fmtCOP\(costoVisible\)/);
  assert.match(html, /costoVisible === null \? 'Pendiente' : fmtCOP\(r\.cantidad \* costoVisible\)/);
});

test('las etiquetas de costo se actualizan de forma coherente por rol', () => {
  assert.match(html, /actualizarEtiquetasCosto\(\)/);
  assert.match(html, /thCostoCel/);
  assert.match(html, /thCostoAcc/);
});
