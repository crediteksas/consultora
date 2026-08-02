const apiFetch = async (path, options = {}) => {
  await window.AuraPortalReady;
  return window.AuraPortal.fetch(path, options);
};

const post = async (path, payload) => {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) {
    throw new Error(data.error || 'La operación no pudo completarse');
  }
  return data;
};

let latestDraft = [];
let officialCatalog = [];

export const catalogApi = {
  async publicCatalog() {
    const response = await apiFetch('/api/catalog');
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'No fue posible cargar el catálogo');
    officialCatalog = data.productos || [];
    return officialCatalog;
  },
  async isAdmin() {
    const result = await window.AuraPortalReady;
    return result?.canAdmin === true;
  },
  async providers({ activeOnly = true } = {}) {
    const data = await post('/api/admin/providers/list', {
      solo_activos: activeOnly,
    });
    return data.proveedores || [];
  },
  async saveProvider(provider) {
    const data = await post('/api/admin/providers/save', {
      proveedor: provider,
    });
    return data.proveedor;
  },
  async products() {
    const data = await post('/api/admin/catalog/private', {});
    return (data.productos || []).map(item => ({
      id: item.nombre,
      canonical_name: item.nombre,
      brand: item.marca,
      category: item.categoria,
    }));
  },
  async exceptions() {
    const data = await post('/api/admin/catalog/exceptions', {});
    return data.excepciones || [];
  },
  async saveOfferRule(payload) {
    const data = await post('/api/admin/catalog/rule', {
      exception_id: payload.exception_id,
      canonical_product_id: payload.canonical_product_id || '',
      create_new: payload.create_new === true,
      canonical: payload.canonical || null,
      force_create: payload.force_create === true,
    });
    const draftItem = latestDraft.find(item => item.offer_id === data.offer_id);
    if (draftItem) {
      draftItem.nombre = data.canonical_name;
      draftItem.publishable = true;
    }
    return data;
  },
  async settings() {
    return [];
  },
  setUtility() {
    return Promise.resolve({ ok: true });
  },
  async correctOffer(offerId, productId) {
    return this.saveOfferRule({
      exception_id: offerId,
      canonical_product_id: productId,
      create_new: false,
    });
  },
  async history(search = '') {
    const data = await post('/api/admin/catalog/history', {
      search,
    });
    return data.productos || [];
  },
  async providerStats() {
    const data = await post('/api/admin/catalog/stats', {});
    return data.proveedores || [];
  },
  async analyze(payload) {
    const data = await post('/api/admin/catalog/analyze', {
      provider: payload.provider_id,
      raw_text: payload.raw_text,
      utility_type: payload.utility_type,
      utility_value: payload.utility_value,
    });
    latestDraft = data.draft || [];
    return data;
  },
  async publish() {
    const productos = latestDraft.filter(item => item.publishable);
    return post('/api/admin/catalog/publish', {
      productos,
    });
  },
  rollback() {
    return post('/api/admin/catalog/rollback', {});
  },
  async submitOrder(payload) {
    const items = payload.items.map(item => {
      const official = officialCatalog.find(product => product.nombre === item.nombre);
      if (!official) throw new Error(`Producto no disponible: ${item.nombre}`);
      return { producto: official.nombre, proveedor: official.proveedor, cantidad: item.quantity };
    });
    const response = await apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ store: payload.storeName, items }),
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'No fue posible crear el pedido');
    return {
      ok: true,
      order_number: data.numeroPedido,
      total_units: Number(data.totalUnidades)
        || payload.items.reduce((sum, item) => sum + item.quantity, 0),
      total_sale: Number(data.totalValor) || 0,
    };
  },
  async adminOrders() {
    const response = await apiFetch('/api/orders');
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'No fue posible cargar pedidos');
    return data.pedidos || [];
  },
  closePeriod(pedidos) {
    return apiFetch('/api/period-close', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orders: pedidos }) })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || data.ok !== true) throw new Error(data.error || 'No fue posible cerrar el periodo');
        return data;
      });
  },
};
