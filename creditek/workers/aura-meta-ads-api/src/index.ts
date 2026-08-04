export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  META_ACCESS_TOKEN: string;
  META_AD_ACCOUNT_ID: string;
  META_GRAPH_VERSION: string;
  META_PAGE_ID: string;
  META_INSTAGRAM_ACTOR_ID: string;
  META_DESTINATION_URL?: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT_PER_MINUTE: string;
  RATE_LIMITER: DurableObjectNamespace;
  PUBLISH_COORDINATOR: DurableObjectNamespace;
}

type Grant = { app_id: string; role_id: string; permissions: string[] };
type Access = { user_id: string; email: string; active?: boolean; apps: Grant[] };
type MetaRow = Record<string, unknown>;
const APP_ID = 'meta_ads';
const ALL_PERMISSIONS = ['meta_ads.access','meta_ads.read','meta_ads.analyze','meta_ads.publish','meta_ads.manage','meta_ads.campaign.create','meta_ads.campaign.pause','meta_ads.budget.manage','meta_ads.audit.read'];
const PUBLISH_PERMISSIONS = ['meta_ads.publish','meta_ads.manage','meta_ads.budget.manage'];
const OBJECTIVES = ['OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_SALES'];
const CTAS = ['LEARN_MORE','APPLY_NOW','CONTACT_US','SEND_MESSAGE','SHOP_NOW'];

function reply(body: unknown, status = 200, origin?: string) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  if (origin) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
  return new Response(JSON.stringify(body), { status, headers });
}

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const actionValue = (row: MetaRow, names: string[]) => {
  const actions = Array.isArray(row.actions) ? row.actions as MetaRow[] : [];
  return actions.filter(item => names.includes(String(item.action_type))).reduce((sum, item) => sum + number(item.value), 0);
};

function normalizeMetrics(row: MetaRow = {}) {
  const spend = number(row.spend);
  const clicks = number(row.clicks);
  const impressions = number(row.impressions);
  const reach = number(row.reach);
  const conversions = actionValue(row, ['onsite_conversion.messaging_conversation_started_7d','lead','offsite_conversion.fb_pixel_lead']);
  return {
    spend, impressions, clicks, reach, conversions,
    frequency: number(row.frequency), ctr: number(row.ctr),
    cpc: number(row.cpc) || (clicks ? spend / clicks : 0),
    cpm: number(row.cpm) || (impressions ? spend * 1000 / impressions : 0),
    cost_per_result: conversions ? spend / conversions : null,
    roas_estimated: null,
  };
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
  if (!token) return null;
  const [userResponse, accessResponse, metaAccessResponse] = await Promise.all([
    supabase(env, '/auth/v1/user', token),
    supabase(env, '/rest/v1/rpc/aura_my_access', token, {}),
    supabase(env, '/rest/v1/rpc/aura_meta_ads_my_access', token, {}),
  ]);
  if (!userResponse.ok || !accessResponse.ok) return null;
  const user = await userResponse.json() as { id?: string; email?: string; banned_until?: string | null };
  const access = await accessResponse.json() as Access;
  if (!user.id || !user.email || access.user_id !== user.id || access.email?.toLowerCase() !== user.email.toLowerCase()) return null;
  if (access.active === false || (user.banned_until && Date.parse(user.banned_until) > Date.now())) return null;
  const metaGrant = metaAccessResponse.ok
    ? await metaAccessResponse.json() as { active?: boolean; role_id?: string; permissions?: string[] }
    : null;
  if (metaGrant?.active === false) return null;
  let grant = metaGrant?.active && Array.isArray(metaGrant.permissions)
    ? { app_id: APP_ID, role_id: metaGrant.role_id || 'meta_ads.reader', permissions: metaGrant.permissions }
    : access.apps?.find(candidate => candidate.app_id === APP_ID) || null;
  const owner = access.apps?.some(candidate => candidate.role_id === 'aura.owner');
  if (!grant && owner) grant = { app_id: APP_ID, role_id: 'aura.owner', permissions: ALL_PERMISSIONS };
  return grant ? { token, access, grant } : null;
}

async function audit(env: Env, token: string, action: string, metadata: Record<string, unknown>) {
  const result = await supabase(env, '/rest/v1/rpc/aura_meta_ads_record_action', token, {
    p_action: action, p_period: number(metadata.period),
  });
  return result.ok;
}

async function allowed(env: Env, userId: string) {
  const id = env.RATE_LIMITER.idFromName(userId);
  const response = await env.RATE_LIMITER.get(id).fetch('https://rate-limit/check', {
    method: 'POST', body: String(Math.max(1, number(env.RATE_LIMIT_PER_MINUTE) || 30)),
  });
  return response;
}

function dateRange(url: URL) {
  const period = Math.min(90, Math.max(1, number(url.searchParams.get('period')) || 7));
  const until = new Date();
  const since = new Date(until); since.setUTCDate(until.getUTCDate() - period + 1);
  return { period, since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}

async function meta(env: Env, path: string, params: Record<string, string>) {
  if (!env.META_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) throw new Error('META_NOT_CONFIGURED');
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('access_token', env.META_ACCESS_TOKEN);
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(response.status === 404 ? 'META_NOT_FOUND' : 'META_UPSTREAM');
  const body = await response.json() as { data?: MetaRow[] };
  return Array.isArray(body.data) ? body.data : [];
}

async function metaObject(env: Env, path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET') {
  if (!env.META_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) throw new Error('META_NOT_CONFIGURED');
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/${path}`);
  url.searchParams.set('access_token', env.META_ACCESS_TOKEN);
  const init: RequestInit = { method, headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) };
  if (method === 'GET') Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  else { init.headers = { ...init.headers, 'content-type': 'application/x-www-form-urlencoded' }; init.body = new URLSearchParams(params); }
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || body.error) {
    const metaError = body.error && typeof body.error === 'object' ? body.error as { code?: unknown; type?: unknown } : {};
    console.warn('meta_write_failed', `path=${path}`, `status=${response.status}`, `code=${String(metaError.code || 'UNKNOWN')}`, `type=${String(metaError.type || 'UNKNOWN')}`);
    throw new Error('META_UPSTREAM');
  }
  return body;
}

async function supabaseRows(env: Env, path: string, token: string) {
  const response = await supabase(env, path, token);
  if (!response.ok) throw new Error('CATALOG_UNAVAILABLE');
  return await response.json() as MetaRow[];
}

async function publisherOptions(env: Env, token: string) {
  await verifyMetaApp(env);
  const [piecesResponse, citiesResponse] = await Promise.all([
    supabase(env, '/rest/v1/rpc/aura_meta_ads_ready_pieces', token, {}),
    supabase(env, '/rest/v1/rpc/aura_meta_ads_ready_cities', token, {}),
  ]);
  if (!piecesResponse.ok || !citiesResponse.ok) {
    const citiesError = citiesResponse.ok ? null : await citiesResponse.clone().json().catch(() => ({})) as { code?: string };
    console.warn('publisher_catalog_http', `pieces=${piecesResponse.status}`, `cities=${citiesResponse.status}`, `code=${citiesError?.code || 'UNKNOWN'}`);
    throw new Error('CATALOG_UNAVAILABLE');
  }
  const pieces = await piecesResponse.json() as MetaRow[];
  const cities = await citiesResponse.json() as MetaRow[];
  return { ok: true, pieces, cities, objectives: OBJECTIVES, ctas: CTAS };
}

type PublishPayload = {
  piece_id?: string; cities?: string[]; platforms?: string[]; objective?: string; budget_cop?: number;
  start_date?: string; end_date?: string; copy?: string; headline?: string; cta?: string; image_url?: string;
  campaign_name?: string; final_confirmation?: boolean;
};

function validatePublishPayload(value: unknown): PublishPayload {
  const input = (value && typeof value === 'object' ? value : {}) as PublishPayload;
  if (!input.final_confirmation) throw new Error('CONFIRMATION_REQUIRED');
  if (!input.piece_id || !Array.isArray(input.cities) || !input.cities.length) throw new Error('INVALID_REQUEST');
  if (!Array.isArray(input.platforms) || !input.platforms.length || input.platforms.some(item => !['facebook','instagram'].includes(item))) throw new Error('INVALID_REQUEST');
  if (!OBJECTIVES.includes(String(input.objective)) || !CTAS.includes(String(input.cta))) throw new Error('INVALID_REQUEST');
  if (!Number.isInteger(Number(input.budget_cop)) || Number(input.budget_cop) < 6000 || Number(input.budget_cop) > 10000000) throw new Error('INVALID_BUDGET');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.start_date)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.end_date)) || String(input.end_date) < String(input.start_date)) throw new Error('INVALID_DATES');
  if (!String(input.copy || '').trim() || !String(input.headline || '').trim() || !/^https:\/\//.test(String(input.image_url || ''))) throw new Error('INVALID_CREATIVE');
  return input;
}

async function verifyMetaApp(env: Env) {
  const result = await metaObject(env, 'debug_token', { input_token: env.META_ACCESS_TOKEN });
  const data = (result.data || {}) as MetaRow;
  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : [];
  if (!/^\d+$/.test(String(data.app_id || '')) || data.is_valid !== true || !scopes.includes('ads_management')) throw new Error('META_PERMISSION_DENIED');
}

async function resolveCities(env: Env, token: string, ids: string[]) {
  const response = await supabase(env, '/rest/v1/rpc/aura_meta_ads_ready_cities', token, {});
  if (!response.ok) throw new Error('CATALOG_UNAVAILABLE');
  const available = await response.json() as MetaRow[];
  const requested = new Set(ids);
  const catalog = available.filter(city => requested.has(String(city.id)));
  if (catalog.length !== new Set(ids).size) throw new Error('INVALID_CITY');
  return Promise.all(catalog.map(async city => {
    const result = await metaObject(env, 'search', { type: 'adgeolocation', location_types: '["city"]', q: String(city.name), country_code: String(city.country_code || 'CO') });
    const choices = Array.isArray(result.data) ? result.data as MetaRow[] : [];
    const match = choices.find(item => String(item.name).toLowerCase() === String(city.name).toLowerCase()) || choices[0];
    if (!match?.key) throw new Error('INVALID_CITY');
    return { key: String(match.key), radius: 25, distance_unit: 'kilometer' };
  }));
}

async function recordPublish(env: Env, token: string, payload: PublishPayload, idempotencyKey: string, status: string, metaIds: Record<string, string>) {
  const response = await supabase(env, '/rest/v1/rpc/aura_meta_ads_record_publish', token, {
    p_piece_id: payload.piece_id, p_cities: payload.cities, p_platforms: payload.platforms,
    p_objective: payload.objective, p_budget_cop: payload.budget_cop, p_start_date: payload.start_date,
    p_end_date: payload.end_date, p_idempotency_key: idempotencyKey, p_status: status, p_meta_ids: metaIds,
  });
  if (!response.ok) throw new Error('AUDIT_UNAVAILABLE');
}

async function publishCampaign(env: Env, auth: { token: string }, payload: PublishPayload, idempotencyKey: string) {
  await verifyMetaApp(env);
  const cities = await resolveCities(env, auth.token, payload.cities || []);
  const name = String(payload.campaign_name || `AURA ${payload.piece_id}`).slice(0, 120);
  const destination = env.META_DESTINATION_URL || 'https://registro.crediteksas.com/creditek/agentes/';
  const campaign = await metaObject(env, `${env.META_AD_ACCOUNT_ID}/campaigns`, { name, objective: String(payload.objective), status: 'PAUSED', special_ad_categories: '[]' }, 'POST');
  const targeting: Record<string, unknown> = { geo_locations: { cities }, publisher_platforms: payload.platforms };
  if (payload.platforms?.includes('facebook')) targeting.facebook_positions = ['feed'];
  if (payload.platforms?.includes('instagram')) targeting.instagram_positions = ['stream'];
  const adset = await metaObject(env, `${env.META_AD_ACCOUNT_ID}/adsets`, {
    name: `${name} · conjunto`, campaign_id: String(campaign.id), daily_budget: String(payload.budget_cop),
    billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    start_time: `${payload.start_date}T12:00:00-05:00`, end_time: `${payload.end_date}T23:59:00-05:00`,
    targeting: JSON.stringify(targeting), status: 'PAUSED',
  }, 'POST');
  const linkData = { message: payload.copy, link: destination, name: payload.headline, picture: payload.image_url, call_to_action: { type: payload.cta, value: { link: destination } } };
  const story: Record<string, unknown> = { page_id: env.META_PAGE_ID, link_data: linkData };
  if (payload.platforms?.includes('instagram')) story.instagram_actor_id = env.META_INSTAGRAM_ACTOR_ID;
  const creative = await metaObject(env, `${env.META_AD_ACCOUNT_ID}/adcreatives`, { name: `${name} · creativo`, object_story_spec: JSON.stringify(story) }, 'POST');
  const ad = await metaObject(env, `${env.META_AD_ACCOUNT_ID}/ads`, { name: `${name} · anuncio`, adset_id: String(adset.id), creative: JSON.stringify({ creative_id: creative.id }), status: 'PAUSED' }, 'POST');
  const metaIds = { campaign_id: String(campaign.id), adset_id: String(adset.id), creative_id: String(creative.id), ad_id: String(ad.id) };
  await recordPublish(env, auth.token, payload, idempotencyKey, 'PAUSED', metaIds);
  return { ok: true, status: 'PAUSED', meta_ids: metaIds };
}

async function coordinate(env: Env, key: string, action: string, result?: unknown) {
  const stub = env.PUBLISH_COORDINATOR.get(env.PUBLISH_COORDINATOR.idFromName(key));
  const response = await stub.fetch('https://publish-lock/state', { method: 'POST', body: JSON.stringify({ action, result }) });
  return await response.json() as { state: string; result?: unknown };
}

async function dashboard(env: Env, url: URL) {
  const range = dateRange(url);
  const timeRange = JSON.stringify({ since: range.since, until: range.until });
  const today = new Date();
  const weekSince = new Date(today); weekSince.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const monthSince = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const fields = 'spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,actions';
  const [insights, campaigns, campaignInsights, trends, weekly, monthly] = await Promise.all([
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields, time_range: timeRange,
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/campaigns`, {
      fields: 'id,name,effective_status,daily_budget,lifetime_budget,start_time,stop_time', limit: '100',
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields: `campaign_id,campaign_name,${fields}`, level: 'campaign', time_range: timeRange, limit: '100',
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields: `date_start,date_stop,${fields}`, time_range: timeRange, time_increment: '1', limit: '100',
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields, time_range: JSON.stringify({ since: weekSince.toISOString().slice(0, 10), until: today.toISOString().slice(0, 10) }),
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields, time_range: JSON.stringify({ since: monthSince.toISOString().slice(0, 10), until: today.toISOString().slice(0, 10) }),
    }),
  ]);
  const insightByCampaign = new Map(campaignInsights.map(item => [String(item.campaign_id || ''), normalizeMetrics(item)]));
  const normalized = campaigns.map(item => {
    const id = String(item.id || '');
    return {
    id, name: String(item.name || 'Sin nombre'),
    status: String(item.effective_status || 'UNKNOWN'),
    daily_budget: number(item.daily_budget), lifetime_budget: number(item.lifetime_budget),
    start_time: item.start_time || null, stop_time: item.stop_time || null,
    metrics: insightByCampaign.get(id) || normalizeMetrics(),
  }}).sort((a, b) => b.metrics.conversions - a.metrics.conversions || b.metrics.clicks - a.metrics.clicks);
  const metrics = normalizeMetrics(insights[0] || {});
  const weeklyMetrics = normalizeMetrics(weekly[0] || {});
  const monthlyMetrics = normalizeMetrics(monthly[0] || {});
  const weeklyBudget = normalized.filter(item => item.status === 'ACTIVE').reduce((sum, item) => sum + item.daily_budget * 7, 0);
  const alerts = [] as { type: string; message: string }[];
  if (metrics.frequency > 3.5) alerts.push({ type: 'fatigue', message: 'Frecuencia alta: posible fatiga publicitaria.' });
  if (weeklyBudget && weeklyMetrics.spend > weeklyBudget) alerts.push({ type: 'overdelivery', message: 'El gasto semanal supera el presupuesto activo calculado.' });
  return {
    ok: true, mode: 'read', source: 'meta', generated_at: new Date().toISOString(), range,
    metrics: { ...metrics, spend_weekly: weeklyMetrics.spend, spend_monthly: monthlyMetrics.spend, budget_weekly: weeklyBudget },
    campaigns: normalized,
    trends: trends.map(item => ({ date: item.date_start || item.date_stop || null, ...normalizeMetrics(item) })),
    comparisons: [],
    attribution: { status: 'unavailable', sales: null, campaigns_without_attribution: normalized.length },
    filters: { municipality: 'metadata_pending', platform: 'metadata_pending', origin: 'metadata_pending', period: range.period },
    alerts,
  };
}

async function handle(request: Request, env: Env, origin?: string) {
  const auth = await authenticate(request, env);
  if (!auth) return reply({ ok: false, error: 'Unauthorized' }, 401, origin);
  if (!auth.grant.permissions.includes('meta_ads.read')) return reply({ ok: false, error: 'Forbidden' }, 403, origin);
  const rate = await allowed(env, auth.access.user_id);
  if (!rate.ok) return reply({ ok: false, error: 'Rate limit', retry_after: 60 }, 429, origin);
  const url = new URL(request.url);
  if (url.pathname === '/v1/publisher/options' && request.method === 'GET') {
    if (!PUBLISH_PERMISSIONS.every(permission => auth.grant.permissions.includes(permission))) return reply({ ok: false, error: 'Forbidden' }, 403, origin);
    try { return reply(await publisherOptions(env, auth.token), 200, origin); }
    catch (error) {
      console.warn('publisher_options_unavailable', error instanceof Error ? error.message : 'UNKNOWN');
      return reply({ ok: false, error: 'Publisher catalog unavailable' }, 503, origin);
    }
  }
  if (url.pathname === '/v1/publisher/publish' && request.method === 'POST') {
    if (!PUBLISH_PERMISSIONS.every(permission => auth.grant.permissions.includes(permission))) return reply({ ok: false, error: 'Forbidden' }, 403, origin);
    const key = request.headers.get('idempotency-key')?.trim() || '';
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) return reply({ ok: false, error: 'Invalid idempotency key' }, 400, origin);
    let payload: PublishPayload;
    try { payload = validatePublishPayload(await request.json()); }
    catch (error) { return reply({ ok: false, error: error instanceof Error ? error.message : 'INVALID_REQUEST' }, error instanceof Error && error.message === 'CONFIRMATION_REQUIRED' ? 409 : 400, origin); }
    const existing = await coordinate(env, key, 'reserve');
    if (existing.state === 'completed') return reply(existing.result, 200, origin);
    if (existing.state !== 'reserved') return reply({ ok: false, error: 'Publication already in progress' }, 409, origin);
    try {
      const result = await publishCampaign(env, auth, payload, key);
      await coordinate(env, key, 'complete', result);
      return reply(result, 201, origin);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'META_UPSTREAM';
      const status = code === 'META_PERMISSION_DENIED' ? 403 : code === 'AUDIT_UNAVAILABLE' ? 503 : 502;
      const failure = { ok: false, error: code === 'META_PERMISSION_DENIED' ? 'Meta permissions unavailable' : 'Publication failed safely' };
      console.warn('publication_failed', code);
      await coordinate(env, key, 'complete', failure);
      return reply(failure, status, origin);
    }
  }
  if (request.method !== 'GET') return reply({ ok: false, error: 'Method not allowed' }, 405, origin);
  if (url.pathname === '/v1/session') return reply({ ok: true, app_id: APP_ID, role_id: auth.grant.role_id, permissions: auth.grant.permissions, mode: 'read' }, 200, origin);
  if (url.pathname !== '/v1/dashboard') return reply({ ok: false, error: 'Not found' }, 404, origin);
  const range = dateRange(url);
  if (!await audit(env, auth.token, 'meta_ads.dashboard.read', { period: range.period })) return reply({ ok: false, error: 'Audit unavailable' }, 503, origin);
  try {
    return reply(await dashboard(env, url), 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'META_UPSTREAM';
    if (code === 'META_NOT_CONFIGURED') return reply({ ok: false, error: 'Meta integration unavailable' }, 503, origin);
    if (code === 'META_NOT_FOUND') return reply({ ok: false, error: 'Campaign not found' }, 404, origin);
    return reply({ ok: false, error: 'Meta service unavailable' }, 502, origin);
  }
}

export class RateLimiter {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request) {
    const limit = Math.max(1, number(await request.text()) || 30);
    const bucket = Math.floor(Date.now() / 60000);
    const stored = await this.state.storage.get<{ bucket: number; count: number }>('rate');
    const next = stored?.bucket === bucket ? { bucket, count: stored.count + 1 } : { bucket, count: 1 };
    await this.state.storage.put('rate', next);
    return reply({ allowed: next.count <= limit }, next.count <= limit ? 200 : 429);
  }
}

export class PublicationCoordinator {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request) {
    const input = await request.json() as { action?: string; result?: unknown };
    const stored = await this.state.storage.get<{ state: string; result?: unknown }>('publication');
    if (input.action === 'get') return reply(stored || { state: 'new' });
    if (input.action === 'reserve') {
      if (stored) return reply(stored);
      const reserved = { state: 'reserved' };
      await this.state.storage.put('publication', reserved);
      return reply(reserved);
    }
    if (input.action === 'complete') {
      const completed = { state: 'completed', result: input.result };
      await this.state.storage.put('publication', completed);
      return reply(completed);
    }
    return reply({ state: 'invalid' }, 400);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('origin') || undefined;
    if (origin && origin !== env.ALLOWED_ORIGIN) return reply({ ok: false, error: 'Origin denied' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': env.ALLOWED_ORIGIN,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, idempotency-key', vary: 'Origin',
    } });
    if (new URL(request.url).pathname === '/health') return reply({ ok: true, app_id: APP_ID, mode: 'read' }, 200, origin);
    return handle(request, env, origin);
  },
};
