const getConfig = () => {
  const config = window.__AURA_B2B_CONFIG__ || {};
  if (!config.enabled || !config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('El catálogo seguro no está configurado en este entorno');
  }
  return config;
};

export const getAuraSession = () => {
  try {
    const session = JSON.parse(sessionStorage.getItem('ck_supa_session') || 'null');
    return session?.access_token ? session : null;
  } catch {
    return null;
  }
};

const request = async (path, options = {}) => {
  const config = getConfig();
  const session = getAuraSession();
  if (!session) throw new Error('Inicia sesión en AURA para continuar');
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseAnonKey,
      authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'La operación no pudo completarse');
  return data;
};

export const catalogApi = {
  publicCatalog() {
    return request('/rest/v1/b2b_catalog_public?select=*&order=nombre.asc');
  },
  access() {
    return request('/rest/v1/b2b_user_access?select=role,store_code,store_name,city&limit=1');
  },
  isAdmin() {
    return request('/rest/v1/rpc/b2b_is_catalog_admin', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  providers() {
    return request('/rest/v1/b2b_catalog_providers?select=id,name&active=eq.true&order=name.asc');
  },
  settings() {
    return request('/rest/v1/b2b_catalog_settings?select=utility_type,utility_value&limit=1');
  },
  setUtility(utilityType, utilityValue) {
    return request('/rest/v1/rpc/set_b2b_catalog_utility', {
      method: 'POST',
      body: JSON.stringify({
        p_utility_type: utilityType,
        p_utility_value: Number(utilityValue),
      }),
    });
  },
  products() {
    return request('/rest/v1/b2b_catalog_products?select=id,canonical_name&active=eq.true&order=canonical_name.asc');
  },
  correctOffer(offerId, productId) {
    return request('/rest/v1/rpc/correct_b2b_catalog_offer', {
      method: 'POST',
      body: JSON.stringify({ p_offer_id: offerId, p_product_id: productId }),
    });
  },
  history(search = '') {
    const filter = search ? `&canonical_name=ilike.*${encodeURIComponent(search)}*` : '';
    return request(`/rest/v1/b2b_catalog_price_history?select=*&order=created_at.desc${filter}`);
  },
  providerStats() {
    return request('/rest/v1/b2b_catalog_provider_stats?select=*&order=month.desc');
  },
  analyze(payload) {
    return request('/functions/v1/analyze-b2b-catalog', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  publish(versionId) {
    return request('/rest/v1/rpc/publish_b2b_catalog', {
      method: 'POST',
      body: JSON.stringify({ p_version_id: versionId }),
    });
  },
  rollback(versionId) {
    return request('/rest/v1/rpc/rollback_b2b_catalog', {
      method: 'POST',
      body: JSON.stringify({ p_target_version_id: versionId }),
    });
  },
  submitOrder(payload) {
    return request('/functions/v1/submit-b2b-order', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
