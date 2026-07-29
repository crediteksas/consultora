const appsScriptUrl = () => {
  const url = window.__AURA_B2B_APPS_SCRIPT_URL__;
  if (!url) throw new Error('El servicio B2B no está configurado');
  return url;
};

const adminPin = () => sessionStorage.getItem('aura_b2b_admin_pin') || '';

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
    const data = await post({ action: 'validar_admin_catalogo', admin_pin: pin });
    sessionStorage.setItem('aura_b2b_admin_pin', pin);
    return data.admin === true;
  },
  async isAdmin() {
    if (!adminPin()) return false;
    try {
      return (await post({ action: 'validar_admin_catalogo', admin_pin: adminPin() })).admin === true;
    } catch {
      sessionStorage.removeItem('aura_b2b_admin_pin');
      return false;
    }
  },
  async providers({ activeOnly = true } = {}) {
    const data = await post({
      action: 'listar_proveedores_admin',
      admin_pin: adminPin(),
      solo_activos: activeOnly,
    });
    return data.proveedores || [];
  },
  async saveProvider(provider) {
    const data = await post({
      action: 'guardar_proveedor_admin',
      admin_pin: adminPin(),
      proveedor: provider,
    });
    return data.proveedor;
  },
  async products() {
    const data = await post({ action: 'catalogo_privado_admin', admin_pin: adminPin() });
    return (data.productos || []).map(item => ({ id: item.nombre, canonical_name: item.nombre }));
  },
  async settings() {
    return [];
  },
  setUtility() {
    return Promise.resolve({ ok: true });
  },
  async correctOffer(offerId, productId) {
    const item = latestDraft.find(row => row.offer_id === offerId);
    if (!item) throw new Error('Excepción inexistente');
    const products = await this.products();
    const product = products.find(row => row.id === productId);
    if (!product) throw new Error('Referencia inexistente');
    item.nombre = product.canonical_name;
    item.publishable = true;
    return item;
  },
  async history(search = '') {
    const data = await post({
      action: 'historico_catalogo_admin',
      admin_pin: adminPin(),
      search,
    });
    return data.productos || [];
  },
  async providerStats() {
    const data = await post({ action: 'estadisticas_catalogo_admin', admin_pin: adminPin() });
    return data.proveedores || [];
  },
  async analyze(payload) {
    const data = await post({
      action: 'analizar_catalogo_admin',
      admin_pin: adminPin(),
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
      admin_pin: adminPin(),
      productos,
    });
  },
  rollback() {
    return post({ action: 'rollback_catalogo_admin', admin_pin: adminPin() });
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
    const data = await post({ action: 'leer_pedidos_admin', admin_pin: adminPin() });
    return data.pedidos || [];
  },
  closePeriod(pedidos) {
    return post({
      action: 'cierre_periodo_admin',
      admin_pin: adminPin(),
      pedidos,
    });
  },
};
