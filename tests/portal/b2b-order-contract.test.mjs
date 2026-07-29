import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOrderRequest,
  sanitizeOrderResponse,
} from '../../creditek/portal/order-contract.mjs';

test('el navegador envía únicamente producto, cantidades y datos de tienda', () => {
  const request = buildOrderRequest({
    orderId: 'order-123',
    storeCode: 'CRD-COR-01',
    storeName: 'Móvil Shoping',
    city: 'Corozal',
    items: [{
      catalog_item_id: 'item-1',
      nombre: 'SAMSUNG A16 128GB',
      cantidad: 2,
      proveedor: 'Inity Colombia',
      precioCompra: 410000,
      precioVenta: 430000,
    }],
  });

  assert.deepEqual(request, {
    order_id: 'order-123',
    store_code: 'CRD-COR-01',
    store_name: 'Móvil Shoping',
    city: 'Corozal',
    items: [{ product: 'SAMSUNG A16 128GB', quantity: 2 }],
  });
});

test('la respuesta pública elimina cualquier dato interno del despacho', () => {
  const response = sanitizeOrderResponse({
    ok: true,
    order_number: 'CRD-20260729-001',
    total_units: 2,
    total_sale: 860000,
    provider: 'Inity Colombia',
    cost: 820000,
    margin: 40000,
  });

  assert.deepEqual(response, {
    ok: true,
    order_number: 'CRD-20260729-001',
    total_units: 2,
    total_sale: 860000,
  });
});
