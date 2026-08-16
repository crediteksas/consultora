import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/proveedores.html', import.meta.url),
  'utf8',
);

test('proveedores resuelve el conflicto con configuración y shell KORA', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(html, /<script src="\/config\/kora-environment\.generated\.js"><\/script>/);
  assert.match(html, /<script src="proveedores-domain\.js"><\/script>/);
  assert.match(html, /<script src="kora-access-control\.js\?v=2\.0\.14"><\/script>/);
  assert.match(html, /<script src="sidebar\.js\?v=2\.0\.14" data-kora-shell="1\.0\.0"><\/script>/);
  assert.match(html, /Consulta las compras, saldos y pagos desde <b>Ver compras<\/b>\./);
});

test('detalle, FIFO y pago idempotente permanecen conectados', () => {
  assert.match(html, /SB\.rpc\('obtener_detalle_factura_proveedor'/);
  assert.match(html, /from\('aplicaciones_consignacion_proveedor'\)/);
  assert.match(html, /SB\.rpc\('registrar_pago_proveedor'/);
  assert.match(html, /p_factura_id: detalleFacturaActual\.factura\.id/);
  assert.match(html, /p_monto: pago\.monto/);
  assert.match(html, /p_idempotency_key: pagoIdempotencyKey/);
  assert.match(html, /if \(!data\?\.ok\) throw new Error\('El servidor no confirmó el pago'\)/);
});

test('las tarjetas usan el resumen financiero del dominio', () => {
  for (const id of ['card-total-por-pagar', 'card-por-vencer', 'card-vencidas', 'card-pagadas']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /proveedoresDomain\.resumirCartera\(\{/);
});
