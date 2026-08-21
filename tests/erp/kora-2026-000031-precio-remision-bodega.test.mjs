import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import bodega from '../../creditek/erp/bodega-domain.js';

const html = await readFile(
  new URL('../../creditek/erp/bodega-central.html', import.meta.url),
  'utf8',
);

test('precio de remisión tiene ancho suficiente y renderiza el valor completo', () => {
  assert.match(html, /\.despacho-precio-input\s*\{[^}]*min-width:\s*8rem;[^}]*width:\s*8rem;/s);
  assert.match(html, /value="\$\{i\.precio_remision \?\? ''\}"[\s\S]*?class="despacho-precio-input/);
  assert.doesNotMatch(html, /data-desp-precio[^>]*(?:maxlength|substr|substring|slice)/);
});

test('precios de uno a siete dígitos se conservan completos en el payload', () => {
  for (const precio of [1, 12, 123, 1234, 12345, 123456, 1234567]) {
    const payload = bodega.crearItemPayload({
      producto_id: 'producto-1',
      cantidad: 1,
      precio_remision: precio,
      precio_override_active: true,
    });
    assert.equal(payload.precio_override, precio);
  }
});

test('gerencia y auditoria conservan permiso para modificar el precio', () => {
  assert.match(html, /rolActual !== 'gerencia' && rolActual !== 'auditoria'/);
});
