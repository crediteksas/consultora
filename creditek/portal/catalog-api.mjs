const appsScriptUrl = () => {
  const url = window.__AURA_B2B_APPS_SCRIPT_URL__;
  if (!url) throw new Error('El servicio B2B no está configurado');
  return url;
};

const adminSessionToken = () => window.B2BAccessSession?.token({ requireAdmin: true }) || '';

const post = async payload => {
  const response = await fetch(appsScriptUrl(), {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) {
    throw new Error(data.error || 'La operación no pudo completarse');
  }
  return data;
};

let latestDraft = [];

export const catalogApi = {
  async publicCatalog() {
    const response = await fetch(`${appsScriptUrl()}?action=catalogo`);
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'No fue posible cargar el catálogo');
    return data.productos || [];
  },
  async authenticate(pin) {
    return window.B2BAccessSession.login(pin, { requireAdmin: true });
  },
  async isAdmin() {
    return window.B2BAccessSession.restoreSession({ requireAdmin: true });
  },
  async providers({ activeOnly = true } = {}) {
    const data = await post({
      action: 'listar_proveedores_admin',
      session_token: adminSessionToken(),
      solo_activos: activeOnly,
    });
    return data.proveedores || [];
  },
  async saveProvider(provider) {
    const data = await post({
      action: 'guardar_proveedor_admin',
      session_token: adminSessionToken(),
      proveedor: provider,
    });
    return data.proveedor;
  },
  async products() {
    const data = await post({ action: 'catalogo_privado_admin', session_token: adminSessionToken() });
    return (data.productos || []).map(item => ({
      id: item.nombre,
      canonical_name: item.nombre,
      brand: item.marca,
      category: item.categoria,
    }));
  },
  async exceptions() {
    const data = await post({
      action: 'listar_excepciones_catalogo_admin',
      session_token: adminSessionToken(),
    });
    return data.excepciones || [];
  },
  async saveOfferRule(payload) {
    const data = await post({
      action: 'guardar_regla_catalogo_admin',
      session_token: adminSessionToken(),
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
    const data = await post({
      action: 'historico_catalogo_admin',
      session_token: adminSessionToken(),
      search,
    });
    return data.productos || [];
  },
  async providerStats() {
    const data = await post({ action: 'estadisticas_catalogo_admin', session_token: adminSessionToken() });
    return data.proveedores || [];
  },
  async analyze(payload) {
    const data = await post({
      action: 'analizar_catalogo_admin',
      session_token: adminSessionToken(),
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
    return post({
      action: 'publicar_catalogo_admin',
      session_token: adminSessionToken(),
      productos,
    });
  },
  rollback() {
    return post({ action: 'rollback_catalogo_admin', session_token: adminSessionToken() });
  },
  async submitOrder(payload) {
    const data = await post({ action: 'guardar_pedido_publico', ...payload });
    return {
      ok: true,
      order_number: data.numeroPedido,
      total_units: Number(data.totalUnidades)
        || payload.items.reduce((sum, item) => sum + item.quantity, 0),
      total_sale: Number(data.totalValor) || 0,
    };
  },
  async adminOrders() {
    const data = await post({ action: 'leer_pedidos_admin', session_token: adminSessionToken() });
    return data.pedidos || [];
  },
  closePeriod(pedidos) {
    return post({
      action: 'cierre_periodo_admin',
      session_token: adminSessionToken(),
      pedidos,
    });
  },
};
