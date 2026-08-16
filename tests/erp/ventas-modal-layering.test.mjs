import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/ventas.html', import.meta.url),
  'utf8',
);

function zIndexFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = html.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 's'))?.[1] || '';
  return Number(rule.match(/z-index:\s*(\d+)/)?.[1] || 0);
}

test('el asistente de venta queda por encima del encabezado fijo de la tabla', () => {
  const modalZIndex = zIndexFor('.modal-bg');
  assert.ok(
    modalZIndex > 100,
    `el asistente debe superar el z-index 100 del encabezado; recibió ${modalZIndex}`,
  );
});

test('el escáner permanece por encima del asistente de venta', () => {
  const modalZIndex = zIndexFor('.modal-bg');
  const scannerZIndex = zIndexFor('.scanner-overlay');
  assert.ok(
    scannerZIndex > modalZIndex,
    `el escáner (${scannerZIndex}) debe superar al asistente (${modalZIndex})`,
  );
});
