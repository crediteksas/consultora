export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  META_ACCESS_TOKEN: string;
  META_AD_ACCOUNT_ID: string;
  META_GRAPH_VERSION: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT_PER_MINUTE: string;
  RATE_LIMITER: DurableObjectNamespace;
}

type Grant = { app_id: string; role_id: string; permissions: string[] };
type Access = { user_id: string; email: string; active?: boolean; apps: Grant[] };
type MetaRow = Record<string, unknown>;
const APP_ID = 'meta_ads';
const ALL_PERMISSIONS = ['meta_ads.access','meta_ads.read','meta_ads.analyze','meta_ads.manage','meta_ads.campaign.create','meta_ads.campaign.pause','meta_ads.budget.manage','meta_ads.audit.read'];

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
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 404 ? 'META_NOT_FOUND' : 'META_UPSTREAM');
  const body = await response.json() as { data?: MetaRow[] };
  return Array.isArray(body.data) ? body.data : [];
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
  if (request.method !== 'GET') return reply({ ok: false, error: 'Read-only mode' }, 405, origin);
  const auth = await authenticate(request, env);
  if (!auth) return reply({ ok: false, error: 'Unauthorized' }, 401, origin);
  if (!auth.grant.permissions.includes('meta_ads.read')) return reply({ ok: false, error: 'Forbidden' }, 403, origin);
  const rate = await allowed(env, auth.access.user_id);
  if (!rate.ok) return reply({ ok: false, error: 'Rate limit', retry_after: 60 }, 429, origin);
  const url = new URL(request.url);
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

export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('origin') || undefined;
    if (origin && origin !== env.ALLOWED_ORIGIN) return reply({ ok: false, error: 'Origin denied' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': env.ALLOWED_ORIGIN,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'authorization', vary: 'Origin',
    } });
    if (new URL(request.url).pathname === '/health') return reply({ ok: true, app_id: APP_ID, mode: 'read' }, 200, origin);
    return handle(request, env, origin);
  },
};
