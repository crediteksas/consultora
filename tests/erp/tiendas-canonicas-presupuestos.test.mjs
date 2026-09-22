import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const catalogo = require('../../creditek/erp/tiendas-canonicas.js');
const tablero = await readFile(new URL('../../creditek/erp/tablero.html', import.meta.url), 'utf8');
const presupuestos = await readFile(new URL('../../creditek/erp/presupuestos.html', import.meta.url), 'utf8');

const tiendasActivas = [
  ['CK-01', 'Celfiao Tolú'],
  ['CK-02', 'Móvil Shopping'],
  ['CK-03', 'Celfiao'],
  ['CK-04', 'Creditel Store'],
  ['CK-05', 'Chinucell'],
  ['CK-06', 'Creditel Chinú'],
  ['CK-07', 'Sonivox'],
  ['CK-08', 'Orocel'],
  ['CK-09', 'Kredisinu'],
  ['CK-11', 'Creditel Coveñas'],
].map(([codigo, nombre]) => ({ codigo, nombre, ciudad: 'fixture' }));

test('Dashboard y Presupuestos consumen el mismo catálogo Retail canónico', () => {
  for (const html of [tablero, presupuestos]) {
    assert.match(html, /src="tiendas-canonicas\.js\?v=1\.0\.0"/);
    assert.match(html, /CreditekTiendasCanonicas\.cargar\(sb\)/);
  }
  assert.deepEqual(catalogo.validar(tiendasActivas), tiendasActivas);
});

test('el catálogo incluye todas las tiendas activas y admite nuevas sin alias', () => {
  const adicional = { codigo: 'CK-12', nombre: 'Nueva tienda', ciudad: 'Sincelejo' };
  const resultado = catalogo.validar([...tiendasActivas, adicional]);
  assert.equal(resultado.length, 11);
  for (const [codigo, nombre] of tiendasActivas.map(t => [t.codigo, t.nombre])) {
    assert.equal(resultado.find(t => t.codigo === codigo)?.nombre, nombre);
  }
});

test('el catálogo falla ante códigos o nombres duplicados', () => {
  assert.throws(() => catalogo.validar([...tiendasActivas, { codigo: 'CK-05', nombre: 'Otra' }]), /Código de tienda duplicado/);
  assert.throws(() => catalogo.validar([...tiendasActivas, { codigo: 'CK-99', nombre: 'CHINUCELL' }]), /Nombre de tienda duplicado/);
});

