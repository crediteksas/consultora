export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  APPS_SCRIPT_URL: string;
  APPS_SCRIPT_SECRET: string;
  ALLOWED_ORIGIN: string;
}

type Grant = { app_id: string; role_id: string; scope?: { stores?: string[] }; permissions: string[] };
type Access = { user_id: string; email: string; display_name: string; apps: Grant[] };

const APP_ID = 'portal_b2b';
const STORE_CITIES: Record<string, string> = {
  'Cellfiao Tolú': 'Tolú',
  'Móvil Shoping': 'Corozal',
  'Celfiao Tecnología': 'Corozal',
  'Creditel Store': 'Corozal',
  'Chinú Cell': 'Chinú',
  'Creditel Chinú': 'Chinú',
  'Sonivox Chinú': 'Chinú',
  OroCell: 'Ciénaga de Oro',
  KrediSinu: 'Ciénaga de Oro',
  'Creditel Coveñas': 'Coveñas',
};
const ADMIN_ROUTES: Record<string, { permission: string; action: string }> = {
  '/api/admin/providers/list': { permission: 'portal.admin', action: 'listar_proveedores_admin' },
  '/api/admin/providers/save': { permission: 'portal.admin', action: 'guardar_proveedor_admin' },
  '/api/admin/catalog/private': { permission: 'portal.catalog.manage', action: 'catalogo_privado_admin' },
  '/api/admin/catalog/exceptions': { permission: 'portal.catalog.manage', action: 'listar_excepciones_catalogo_admin' },
  '/api/admin/catalog/rule': { permission: 'portal.catalog.manage', action: 'guardar_regla_catalogo_admin' },
  '/api/admin/catalog/history': { permission: 'portal.catalog.manage', action: 'historico_catalogo_admin' },
  '/api/admin/catalog/stats': { permission: 'portal.catalog.manage', action: 'estadisticas_catalogo_admin' },
  '/api/admin/catalog/analyze': { permission: 'portal.catalog.manage', action: 'analizar_catalogo_admin' },
  '/api/admin/catalog/publish': { permission: 'portal.catalog.manage', action: 'publicar_catalogo_admin' },
  '/api/admin/catalog/rollback': { permission: 'portal.catalog.manage', action: 'rollback_catalogo_admin' },
};

function response(body: unknown, status = 200, origin?: string) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  if (origin) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
  return new Response(JSON.stringify(body), { status, headers });
}

async function supabase(env: Env, path: string, token: string, body?: unknown) {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function authenticate(request: Request, env: Env) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  const userResponse = await supabase(env, '/auth/v1/user', token);
  if (!userResponse.ok) return null;
  const user = await userResponse.json() as { id?: string; email?: string };
  const accessResponse = await supabase(env, '/rest/v1/rpc/aura_my_access', token, {});
  if (!accessResponse.ok) return null;
  const access = await accessResponse.json() as Access;
  if (!user.id || !user.email || access.user_id !== user.id || access.email.toLowerCase() !== user.email.toLowerCase()) return null;
  const grant = access.apps.find(candidate => candidate.app_id === APP_ID);
  return grant ? { token, access, grant } : null;
}

const has = (grant: Grant, permission: string) => grant.permissions.includes(permission);
const withinScope = (grant: Grant, store: unknown) => !grant.scope?.stores?.length || (typeof store === 'string' && grant.scope.stores.includes(store));

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[<>\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

const productKey = (name: string, provider: string) => `${name.toLocaleLowerCase('es')}\u0000${provider.toLocaleLowerCase('es')}`;

async function normalizeOrder(env: Env, access: Access, grant: Grant, payload: Record<string, unknown>) {
  const store = boundedText(payload.store, 80);
  if (!store || !STORE_CITIES[store]) return { error: response({ ok: false, error: 'Invalid store' }, 400) };
  if (!withinScope(grant, store)) return { error: response({ ok: false, error: 'Store scope denied' }, 403) };
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 100) {
    return { error: response({ ok: false, error: 'Invalid order' }, 400) };
  }
  const catalog = await callBackend(env, access, grant, 'catalogo', {});
  if (!Array.isArray(catalog.productos)) return { error: response({ ok: false, error: 'Catalog unavailable' }, 503) };
  const official = new Map<string, Record<string, unknown>>();
  for (const candidate of catalog.productos) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const item = candidate as Record<string, unknown>;
    const name = boundedText(item.nombre, 120);
    const provider = boundedText(item.proveedor, 120);
    if (name && provider) official.set(productKey(name, provider), item);
  }
  const orderNumber = `B2B-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const items: Record<string, unknown>[] = [];
  for (const candidate of payload.items) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { error: response({ ok: false, error: 'Invalid item' }, 400) };
    const raw = candidate as Record<string, unknown>;
    const name = boundedText(raw.producto, 120);
    const provider = boundedText(raw.proveedor, 120);
    const quantity = Number(raw.cantidad);
    const product = name && provider ? official.get(productKey(name, provider)) : undefined;
    const purchasePrice = Number(product?.precioCompra);
    const salePrice = Number(product?.precioVenta);
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100 || !Number.isFinite(purchasePrice) || purchasePrice < 0 || !Number.isFinite(salePrice) || salePrice <= 0) {
      return { error: response({ ok: false, error: 'Invalid or unavailable product' }, 400) };
    }
    items.push({
      tienda: store,
      ciudad: STORE_CITIES[store],
      producto: product.nombre,
      proveedor: product.proveedor,
      cantidad: quantity,
      precioProveedor: purchasePrice,
      precioCredilek: salePrice,
      numeroPedido: orderNumber,
    });
  }
  return { payload: { store, city: STORE_CITIES[store], order_id: orderNumber, items } };
}

async function jsonBody(request: Request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new Error('JSON required');
  const value = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object required');
  return value as Record<string, unknown>;
}

async function callBackend(
  env: Env,
  actor: Access,
  grant: Grant,
  action: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> & { status: number }> {
  const backend = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      backend_secret: env.APPS_SCRIPT_SECRET,
      action,
      actor: { user_id: actor.user_id, email: actor.email, app_id: APP_ID, role_id: grant.role_id },
      payload,
    }),
  });
  if (!backend.ok) return { ok: false, error: 'Backend unavailable', status: 502 };
  const result = await backend.json().catch(() => null) as Record<string, unknown> | null;
  return result ? { ...result, status: result.ok === false ? 400 : 200 } : { ok: false, error: 'Backend unavailable', status: 502 };
}

async function audit(env: Env, token: string, action: string) {
  const result = await supabase(env, '/rest/v1/rpc/aura_record_action', token, { p_action: action, p_app_id: APP_ID, p_metadata: {} });
  return result.ok;
}

async function handle(request: Request, env: Env, path: string) {
  const auth = await authenticate(request, env);
  if (!auth) return response({ ok: false, error: 'Unauthorized' }, 401);
  const { token, access, grant } = auth;
  let permission = '';
  let action = '';
  let payload: Record<string, unknown> = {};
  const url = new URL(request.url);

  if (path === '/api/session' && request.method === 'GET') {
    return response({ ok: true, user_id: access.user_id, email: access.email, display_name: access.display_name, app_id: APP_ID, role_id: grant.role_id, scope: grant.scope || {}, permissions: grant.permissions });
  }
  if (path === '/api/catalog' && request.method === 'GET') { permission = 'portal.read'; action = 'catalogo'; }
  else if (path === '/api/history' && request.method === 'GET') { permission = 'portal.order.history'; action = 'historial'; payload = { store: url.searchParams.get('store') || '' }; }
  else if (path === '/api/orders' && request.method === 'GET') { permission = 'portal.admin'; action = 'leer'; }
  else if (path === '/api/orders' && request.method === 'POST') { permission = 'portal.order.create'; action = 'guardar_pedido'; payload = await jsonBody(request); }
  else if (path === '/api/period-close' && request.method === 'POST') { permission = 'portal.period.close'; action = 'cierre_periodo'; payload = await jsonBody(request); }
  else if (ADMIN_ROUTES[path] && request.method === 'POST') {
    ({ permission, action } = ADMIN_ROUTES[path]);
    payload = await jsonBody(request);
  } else return response({ ok: false, error: 'Not found' }, 404);

  if (!has(grant, permission)) return response({ ok: false, error: 'Forbidden' }, 403);
  if (action === 'historial' && !withinScope(grant, payload.store)) return response({ ok: false, error: 'Store scope denied' }, 403);
  if (action === 'guardar_pedido') {
    const normalized = await normalizeOrder(env, access, grant, payload);
    if (normalized.error) return normalized.error;
    payload = normalized.payload || {};
  }
  if (action === 'cierre_periodo') {
    const current = await callBackend(env, access, grant, 'leer', {});
    if (!Array.isArray(current.pedidos)) return response({ ok: false, error: 'Orders unavailable' }, 503);
    payload = { orders: current.pedidos };
  }
  if (!await audit(env, token, `portal.${action}`)) return response({ ok: false, error: 'Audit unavailable' }, 503);
  const result = await callBackend(env, access, grant, action, payload);
  if (action === 'catalogo' && !has(grant, 'portal.catalog.manage') && Array.isArray(result.productos)) {
    result.productos = result.productos.map(item => {
      const { precioCompra: _hidden, ...safe } = item as Record<string, unknown>;
      return safe;
    });
  }
  const { status: rawStatus, ...body } = result;
  return response(body, Number(rawStatus) || 200);
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return response({ ok: true, system: 'aura', app_id: APP_ID });
    const origin = request.headers.get('origin');
    if (origin && origin !== env.ALLOWED_ORIGIN) return response({ ok: false, error: 'Origin denied' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': env.ALLOWED_ORIGIN,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      vary: 'Origin',
    } });
    try {
      const result = await handle(request, env, url.pathname);
      if (origin) { result.headers.set('access-control-allow-origin', origin); result.headers.set('vary', 'Origin'); }
      return result;
    } catch {
      return response({ ok: false, error: 'Invalid request' }, 400, origin || undefined);
    }
  },
};
