import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/caja.html', import.meta.url),
  'utf8',
);

test('caja usa el cálculo autoritativo del piloto y valida contra el servidor', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(html, /caja-piloto-domain\.js/);
  assert.match(html, /rpc\('calcular_efectivo_esperado_tienda'/);
  assert.match(html, /from\('movimientos_caja_tienda'\)/);
  assert.match(html, /cajaPiloto\.calcularEfectivoEsperado\(\{/);
  assert.match(html, /esperado !== Number\(cuadre\.esperado \|\| 0\)/);
});

test('utilidad informativa exige un valor calculado en cada línea', () => {
  assert.match(html, /it\.utilidad === null \|\| it\.utilidad === undefined \|\| it\.utilidad === ''/);
  assert.match(html, /!Number\.isFinite\(Number\(it\.utilidad\)\)/);
  assert.match(html, /throw new Error\(`La venta \$\{v\.id\} tiene una línea sin utilidad calculada\.`\)/);
  assert.match(html, /totalUtilidad \+= Number\(it\.utilidad\)/);
  assert.doesNotMatch(html, /Number\(it\.utilidad \|\| 0\)/);
});

test('utilidad y salidas explícitas permanecen separadas en las tres vistas', () => {
  assert.match(html, /Utilidad del día[\s\S]*fmtCOP\(c\.totalUtilidad\)/);
  assert.match(html, /Salidas explícitas[\s\S]*fmtCOP\(c\.salidasExplicitas\)/);
  assert.match(html, /Utilidad del día: \$\{fmtCOP\(c\.totalUtilidad\)\}/);
  assert.match(html, /Salidas explícitas: -\$\{fmtCOP\(c\.salidasExplicitas\)\}/);
  assert.match(html, /utilidad: c\.totalUtilidad/);
  assert.match(html, /salidasExplicitas: c\.salidasExplicitas/);
  assert.match(html, /fmtCOP\(f\.utilidad\)/);
  assert.match(html, /fmtCOP\(f\.salidasExplicitas\)/);
});
