import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(
  new URL('../../creditek/erp/ventas.html', import.meta.url),
  'utf8',
);

test('el precio configurado es sugerido y permite promociones', () => {
  assert.match(html, /precio_tienda es el precio sugerido/);
  assert.match(html, /precio_venta:\s*it\.precio_venta/);
  assert.doesNotMatch(html, /no puede ser menor al precio de remisión/);
  assert.doesNotMatch(html, /v\s*<\s*min/);
});

test('la venta sigue exigiendo un precio positivo', () => {
  assert.match(html, /!it\.precio_venta \|\| it\.precio_venta <= 0/);
});
