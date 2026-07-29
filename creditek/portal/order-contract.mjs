const assertText = (value, message) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(message);
  return normalized;
};

export function buildOrderRequest({ orderId, storeCode, storeName, city, items }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('El pedido está vacío');

  return {
    order_id: assertText(orderId, 'Falta el identificador del pedido'),
    store_code: assertText(storeCode, 'Falta el código de tienda'),
    store_name: assertText(storeName, 'Falta la tienda'),
    city: assertText(city, 'Falta la ciudad'),
    items: items.map(item => {
      const quantity = Number(item.quantity ?? item.cantidad);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
        throw new Error('Cantidad inválida');
      }
      return {
        catalog_item_id: assertText(item.catalog_item_id, 'Producto sin identificador público'),
        quantity,
      };
    }),
  };
}

export function sanitizeOrderResponse(response) {
  return {
    ok: response?.ok === true,
    order_number: String(response?.order_number ?? ''),
    total_units: Number(response?.total_units ?? 0),
    total_sale: Number(response?.total_sale ?? 0),
  };
}
