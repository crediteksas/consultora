export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  META_ACCESS_TOKEN: string;
  META_AD_ACCOUNT_ID: string;
  META_GRAPH_VERSION: string;
  META_PAGE_ID: string;
  META_CONTINUE_CAMPAIGN_ID?: string;
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

type MetaFailureDetails = {
  endpoint: string;
  status: number;
  code: string;
  subcode: string;
  type: string;
  message: string;
  error_user_title: string;
  error_user_msg: string;
  error_data: string;
  fbtrace_id: string;
  variant?: string;
};

class MetaApiError extends Error {
  constructor(public readonly stage: string, public readonly details: MetaFailureDetails) {
    super(stage);
    this.name = 'MetaApiError';
  }
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
    const metaError = body.error && typeof body.error === 'object' ? body.error as {
      code?: unknown; type?: unknown; error_subcode?: unknown; message?: unknown;
      error_user_title?: unknown; error_user_msg?: unknown; error_data?: unknown; fbtrace_id?: unknown;
    } : {};
    const safeMessage = String(metaError.message || 'UNKNOWN').replace(/[A-Za-z0-9_-]{80,}/g, '[redacted]').slice(0, 240);
    const safeDetail = (value: unknown) => JSON.stringify(value ?? null).replace(/[A-Za-z0-9_-]{80,}/g, '[redacted]').slice(0, 800);
    const details = {
      endpoint: `/${path}`,
      status: response.status,
      code: String(metaError.code || 'UNKNOWN'),
      subcode: String(metaError.error_subcode || 'NONE'),
      type: String(metaError.type || 'UNKNOWN'),
      message: safeMessage,
      error_user_title: safeDetail(metaError.error_user_title),
      error_user_msg: safeDetail(metaError.error_user_msg),
      error_data: safeDetail(metaError.error_data),
      fbtrace_id: String(metaError.fbtrace_id || 'NONE').slice(0, 80),
    } satisfies MetaFailureDetails;
    console.warn('meta_write_failed', JSON.stringify({ ...details, path: details.endpoint }));
    throw new MetaApiError('META_UPSTREAM', details);
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
  const [piecesResponse, citiesResponse, instagram] = await Promise.all([
    supabase(env, '/rest/v1/rpc/aura_meta_ads_ready_pieces', token, {}),
    supabase(env, '/rest/v1/rpc/aura_meta_ads_ready_cities', token, {}),
    resolveInstagramActor(env),
  ]);
  if (!piecesResponse.ok || !citiesResponse.ok) {
    const citiesError = citiesResponse.ok ? null : await citiesResponse.clone().json().catch(() => ({})) as { code?: string };
    console.warn('publisher_catalog_http', `pieces=${piecesResponse.status}`, `cities=${citiesResponse.status}`, `code=${citiesError?.code || 'UNKNOWN'}`);
    throw new Error('CATALOG_UNAVAILABLE');
  }
  const pieces = await piecesResponse.json() as MetaRow[];
  const cities = await citiesResponse.json() as MetaRow[];
  return { ok: true, pieces, cities, objectives: OBJECTIVES, ctas: CTAS, instagram };
}

type PublishPayload = {
  piece_id?: string; cities?: string[]; platforms?: string[]; objective?: string; budget_cop?: number;
  start_date?: string; end_date?: string; copy?: string; headline?: string; cta?: string; image_url?: string;
  budget_type?: 'daily' | 'lifetime'; image_data?: { name?: string; mime_type?: string; bytes_base64?: string };
  campaign_name?: string; final_confirmation?: boolean;
  variants?: Array<{ piece_id?: string; copy?: string; headline?: string; cta?: string; image_url?: string; image_data?: PublishPayload['image_data'] }>;
};

function validatePublishPayload(value: unknown): PublishPayload {
  const input = (value && typeof value === 'object' ? value : {}) as PublishPayload;
  if (!input.final_confirmation) throw new Error('CONFIRMATION_REQUIRED');
  if (!input.piece_id || !Array.isArray(input.cities) || !input.cities.length) throw new Error('INVALID_REQUEST');
  if (!Array.isArray(input.platforms) || !input.platforms.length || input.platforms.some(item => !['facebook','instagram'].includes(item))) throw new Error('INVALID_REQUEST');
  if (!OBJECTIVES.includes(String(input.objective)) || !CTAS.includes(String(input.cta))) throw new Error('INVALID_REQUEST');
  if (!['daily','lifetime'].includes(String(input.budget_type)) || !Number.isInteger(Number(input.budget_cop)) || Number(input.budget_cop) < 6000 || Number(input.budget_cop) > 10000000) throw new Error('INVALID_BUDGET');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.start_date)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.end_date)) || String(input.end_date) < String(input.start_date)) throw new Error('INVALID_DATES');
  const image = input.image_data;
  const manualImage = input.piece_id === 'manual' && image && ['image/jpeg','image/png','image/webp'].includes(String(image.mime_type))
    && /^[A-Za-z0-9+/]+={0,2}$/.test(String(image.bytes_base64 || '')) && String(image.bytes_base64).length <= 7_000_000;
  if (!String(input.copy || '').trim() || !String(input.headline || '').trim() || (!/^https:\/\//.test(String(input.image_url || '')) && !manualImage)) throw new Error('INVALID_CREATIVE');
  if (input.variants !== undefined) {
    if (!Array.isArray(input.variants) || input.variants.length !== 2) throw new Error('INVALID_VARIANTS');
    for (const variant of input.variants) {
      if (!String(variant.copy || '').trim() || !String(variant.headline || '').trim() || !CTAS.includes(String(variant.cta))) throw new Error('INVALID_VARIANTS');
      const variantManual = variant.piece_id === 'manual' && variant.image_data && ['image/jpeg','image/png','image/webp'].includes(String(variant.image_data.mime_type))
        && /^[A-Za-z0-9+/]+={0,2}$/.test(String(variant.image_data.bytes_base64 || '')) && String(variant.image_data.bytes_base64).length <= 7_000_000;
      if (!/^https:\/\//.test(String(variant.image_url || '')) && !variantManual) throw new Error('INVALID_VARIANTS');
    }
  }
  return input;
}

async function verifyMetaApp(env: Env) {
  const result = await metaObject(env, 'debug_token', { input_token: env.META_ACCESS_TOKEN });
  const data = (result.data || {}) as MetaRow;
  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : [];
  console.warn('meta_token_scopes_verified', { scopes: scopes.sort() });
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

async function resolveInstagramActor(env: Env) {
  const [page, availableResult] = await Promise.all([
    metaObject(env, env.META_PAGE_ID, {
      fields: 'id,name,instagram_business_account{id,username},connected_instagram_account{id,username}',
    }),
    metaObject(env, `${env.META_AD_ACCOUNT_ID}/instagram_accounts`, { fields: 'id,username', limit: '100' }),
  ]);
  const business = page.instagram_business_account && typeof page.instagram_business_account === 'object'
    ? page.instagram_business_account as MetaRow : null;
  const connected = page.connected_instagram_account && typeof page.connected_instagram_account === 'object'
    ? page.connected_instagram_account as MetaRow : null;
  const actorId = String(business?.id || connected?.id || '');
  const available = Array.isArray(availableResult.data) ? availableResult.data as MetaRow[] : [];
  if (String(page.id) !== String(env.META_PAGE_ID) || !/^\d+$/.test(actorId)) throw new Error('INSTAGRAM_ACTOR_UNAVAILABLE');
  if (!available.some(account => String(account.id) === actorId)) {
    console.warn('meta_instagram_actor_assignment_missing', {
      page_id: String(page.id), linked_actor_id: actorId,
      ad_account_actor_ids: available.map(account => String(account.id)).filter(id => /^\d+$/.test(id)),
    });
    throw new Error('INSTAGRAM_ACTOR_NOT_ASSIGNED_TO_AD_ACCOUNT');
  }
  const source = business?.id ? 'instagram_business_account' : 'connected_instagram_account';
  console.info('meta_instagram_actor_resolved', { page_id: String(page.id), instagram_actor_id: actorId, source, ad_account_assigned: true });
  return { ready: true, page_id: String(page.id), actor_id: actorId, source };
}

async function recordPublish(env: Env, token: string, payload: PublishPayload, idempotencyKey: string, status: string, metaIds: Record<string, string>) {
  const response = await supabase(env, '/rest/v1/rpc/aura_meta_ads_record_publish', token, {
    p_piece_id: payload.piece_id, p_cities: payload.cities, p_platforms: payload.platforms,
    p_objective: payload.objective, p_budget_type: payload.budget_type, p_budget_cop: payload.budget_cop, p_start_date: payload.start_date,
    p_end_date: payload.end_date, p_idempotency_key: idempotencyKey, p_status: status, p_meta_ids: metaIds,
  });
  if (!response.ok) throw new Error('AUDIT_UNAVAILABLE');
}

async function approvedCreative(env: Env, token: string, payload: Pick<PublishPayload, 'piece_id' | 'copy' | 'headline' | 'image_url'>) {
  if (payload.piece_id === 'manual') return;
  const pieces = await supabaseRows(env, '/rest/v1/rpc/aura_meta_ads_ready_pieces', token);
  const piece = pieces.find(item => String(item.id) === String(payload.piece_id));
  if (!piece || String(piece.estado) !== 'lista_para_publicar'
    || String(piece.copy || '') !== String(payload.copy || '')
    || String(piece.headline || '') !== String(payload.headline || '')
    || String(piece.imagen_url || '') !== String(payload.image_url || '')) throw new Error('CREATIVE_NOT_APPROVED');
}

async function creativeImage(env: Env, payload: Pick<PublishPayload, 'piece_id' | 'image_url' | 'image_data'>) {
  if (payload.piece_id !== 'manual') return { picture: String(payload.image_url) };
  const image = payload.image_data!;
  const uploaded = await metaObject(env, `${env.META_AD_ACCOUNT_ID}/adimages`, { bytes: String(image.bytes_base64) }, 'POST');
  const images = uploaded.images && typeof uploaded.images === 'object' ? uploaded.images as Record<string, MetaRow> : {};
  const hash = Object.values(images).map(item => String(item?.hash || '')).find(Boolean) || String(uploaded.hash || '');
  if (!hash) throw new Error('META_IMAGE_UPLOAD_FAILED');
  return { image_hash: hash };
}

function adsetPayload(payload: PublishPayload, name: string, campaignId: string, cities: { key: string; radius: number; distance_unit: string }[]) {
  const budget: Record<string, string> = payload.budget_type === 'lifetime'
    ? { lifetime_budget: String(payload.budget_cop) }
    : { daily_budget: String(payload.budget_cop) };
  return {
    name: `${name} · conjunto`, campaign_id: campaignId, ...budget,
    start_time: `${payload.start_date}T00:05:00-0500`, end_time: `${payload.end_date}T23:55:00-0500`,
    billing_event: 'IMPRESSIONS', optimization_goal: payload.objective === 'OUTCOME_AWARENESS' ? 'REACH' : 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: JSON.stringify({ geo_locations: { cities }, publisher_platforms: payload.platforms }), status: 'PAUSED',
  };
}

async function publicationStep<T>(code: string, operation: () => Promise<T>, variant?: string) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof MetaApiError) throw new MetaApiError(code, { ...error.details, ...(variant ? { variant } : {}) });
    throw new Error(code);
  }
}

function campaignPayload(payload: PublishPayload, name: string): Record<string, string> {
  const objective = String(payload.objective);
  if (!OBJECTIVES.includes(objective)) throw new Error('INVALID_CAMPAIGN_OBJECTIVE');
  return { name, objective, buying_type: 'AUCTION', status: 'PAUSED', special_ad_categories: '[]', is_adset_budget_sharing_enabled: 'false' };
}

function requireMetaId(value: MetaRow, code: string) {
  const id = String(value?.id || '').trim();
  if (!id || id === 'undefined' || id === 'null') throw new Error(code);
  return id;
}

async function publishCampaign(env: Env, auth: { token: string }, payload: PublishPayload, idempotencyKey: string) {
  await verifyMetaApp(env);
  const variants = payload.variants?.length === 2 ? payload.variants : [{
    piece_id: payload.piece_id, copy: payload.copy, headline: payload.headline,
    cta: payload.cta, image_url: payload.image_url, image_data: payload.image_data,
  }];
  for (let index = 0; index < variants.length; index += 1) {
    const label = variants.length === 2 ? (index === 0 ? 'A' : 'B') : 'A';
    await publicationStep('META_PREFLIGHT_CREATIVE_FAILED', () => approvedCreative(env, auth.token, variants[index]), label);
    if (!['LEARN_MORE','APPLY_NOW','CONTACT_US','SEND_MESSAGE','SHOP_NOW'].includes(String(variants[index].cta))) {
      throw new Error(`INVALID_CTA_${label}`);
    }
  }
  const destination = env.META_DESTINATION_URL || 'https://registro.crediteksas.com/creditek/agentes/';
  if (!/^https:\/\//i.test(destination)) throw new Error('INVALID_DESTINATION_URL');
  const cities = await publicationStep('META_CITY_RESOLUTION_FAILED', () => resolveCities(env, auth.token, payload.cities || []));
  const instagram = await publicationStep('META_INSTAGRAM_ACTOR_RESOLUTION_FAILED', () => resolveInstagramActor(env));
  const images = [] as Array<{ picture?: string; image_hash?: string }>;
  for (let index = 0; index < variants.length; index += 1) {
    const label = variants.length === 2 ? (index === 0 ? 'A' : 'B') : 'A';
    images.push(await publicationStep('META_IMAGE_UPLOAD_FAILED', () => creativeImage(env, variants[index]), label));
  }
  const name = String(payload.campaign_name || `AURA ${payload.piece_id}`).slice(0, 120);
  const campaign = await publicationStep('META_CAMPAIGN_CREATE_FAILED', () => metaObject(
    env,
    `${env.META_AD_ACCOUNT_ID}/campaigns`,
    campaignPayload(payload, name),
    'POST',
  ));
  const campaignId = requireMetaId(campaign, 'META_CAMPAIGN_INVALID_RESPONSE');
  await recordPublish(env, auth.token, payload, idempotencyKey, 'PAUSED', { campaign_id: campaignId });
  const adset = await publicationStep('META_ADSET_CREATE_FAILED', () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/adsets`, adsetPayload(payload, name, campaignId, cities), 'POST'));
  const adsetId = requireMetaId(adset, 'META_ADSET_INVALID_RESPONSE');
  await recordPublish(env, auth.token, payload, idempotencyKey, 'PAUSED', { campaign_id: campaignId, adset_id: adsetId });
  const variantIds: Array<{ label: string; creative_id: string; ad_id: string }> = [];
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const label = variants.length === 2 ? `VARIANTE ${index === 0 ? 'A' : 'B'}` : '';
    const image = images[index];
    const linkData = { message: variant.copy, link: destination, name: variant.headline, ...image, call_to_action: { type: variant.cta, value: { link: destination } } };
    const story = { page_id: env.META_PAGE_ID, instagram_actor_id: instagram.actor_id, link_data: linkData };
    const creative = await publicationStep('META_CREATIVE_CREATE_FAILED', () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/adcreatives`, { name: `${name}${label ? ` · ${label}` : ''} · creativo`, object_story_spec: JSON.stringify(story) }, 'POST'), label || 'A');
    const creativeId = requireMetaId(creative, 'META_CREATIVE_INVALID_RESPONSE');
    await recordPublish(env, auth.token, payload, idempotencyKey, 'PAUSED', { campaign_id: campaignId, adset_id: adsetId, creative_id: creativeId, variant: label || 'single' });
    const ad = await publicationStep('META_AD_CREATE_FAILED', () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/ads`, { name: `${name}${label ? ` · ${label}` : ''} · anuncio`, adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: 'PAUSED' }, 'POST'), label || 'A');
    variantIds.push({ label: label || 'single', creative_id: creativeId, ad_id: requireMetaId(ad, 'META_AD_INVALID_RESPONSE') });
  }
  const metaIds: Record<string, string> = variants.length === 2
    ? { campaign_id: campaignId, adset_id: adsetId, variant_a_creative_id: variantIds[0].creative_id, variant_a_ad_id: variantIds[0].ad_id, variant_b_creative_id: variantIds[1].creative_id, variant_b_ad_id: variantIds[1].ad_id }
    : { campaign_id: campaignId, adset_id: adsetId, creative_id: variantIds[0].creative_id, ad_id: variantIds[0].ad_id };
  const activated: string[] = [];
  try {
    await publicationStep('META_ADSET_ACTIVATION_FAILED', () => metaObject(env, adsetId, { status: 'ACTIVE' }, 'POST')); activated.push(adsetId);
    for (const variant of variantIds) { await publicationStep('META_AD_ACTIVATION_FAILED', () => metaObject(env, variant.ad_id, { status: 'ACTIVE' }, 'POST'), variant.label); activated.push(variant.ad_id); }
    await publicationStep('META_CAMPAIGN_ACTIVATION_FAILED', () => metaObject(env, campaignId, { status: 'ACTIVE' }, 'POST')); activated.push(campaignId);
  } catch (error) {
    for (const id of activated.reverse()) await metaObject(env, id, { status: 'PAUSED' }, 'POST').catch(() => undefined);
    throw error;
  }
  await recordPublish(env, auth.token, payload, idempotencyKey, 'ACTIVE', metaIds);
  console.info('meta_campaign_published', { ...metaIds, status: 'ACTIVE', review_status: 'EN_REVISIÓN_DE_META' });
  return { ok: true, status: 'ACTIVE', review_status: 'EN_REVISIÓN_DE_META', comparison: variants.length === 2 ? 'A/B' : null, statuses: { campaign: 'ACTIVE', adset: 'ACTIVE', creative: 'IN_REVIEW', ad: 'ACTIVE' }, meta_ids: metaIds, variants: variantIds };
}

async function continueCampaign(env: Env, auth: { token: string }, payload: PublishPayload, idempotencyKey: string, campaignId: string) {
  await verifyMetaApp(env);
  const campaign = await publicationStep('META_CAMPAIGN_VALIDATION_FAILED', () => metaObject(env, campaignId, {
    fields: 'id,account_id,objective,status,effective_status,name',
  }));
  const expectedAccount = String(env.META_AD_ACCOUNT_ID).replace(/^act_/, '');
  if (String(campaign.id) !== campaignId || String(campaign.account_id) !== expectedAccount
    || String(campaign.objective) !== 'OUTCOME_TRAFFIC' || String(campaign.status) !== 'PAUSED') {
    throw new Error('INVALID_EXISTING_CAMPAIGN');
  }
  if (payload.objective !== 'OUTCOME_TRAFFIC' || Number(payload.budget_cop) !== 6000
    || payload.start_date !== '2026-08-05' || payload.end_date !== '2026-08-06'
    || JSON.stringify([...(payload.cities || [])].sort()) !== JSON.stringify(['retail-tolu'])
    || JSON.stringify([...(payload.platforms || [])].sort()) !== JSON.stringify(['facebook','instagram'])) {
    throw new Error('CONTROLLED_PAYLOAD_MISMATCH');
  }
  const pieces = await supabaseRows(env, '/rest/v1/rpc/aura_meta_ads_ready_pieces', auth.token);
  const piece = pieces.find(item => String(item.id) === String(payload.piece_id));
  if (!piece || String(piece.estado) !== 'lista_para_publicar'
    || String(piece.copy || '') !== String(payload.copy || '')
    || String(piece.headline || '') !== String(payload.headline || '')
    || String(piece.imagen_url || '') !== String(payload.image_url || '')) {
    throw new Error('CREATIVE_NOT_APPROVED');
  }
  const cities = await publicationStep('META_CITY_RESOLUTION_FAILED', () => resolveCities(env, auth.token, payload.cities || []));
  const name = String(payload.campaign_name || `AURA ${payload.piece_id}`).slice(0, 120);
  const destination = env.META_DESTINATION_URL || 'https://registro.crediteksas.com/creditek/agentes/';
  const adsetsResult = await publicationStep('META_ADSET_VALIDATION_FAILED', () => metaObject(env, `${campaignId}/adsets`, {
    fields: 'id,campaign_id,name,status,effective_status,daily_budget,start_time,end_time,targeting', limit: '50',
  }));
  const adsets = Array.isArray(adsetsResult.data) ? adsetsResult.data as MetaRow[] : [];
  const adset = adsets.find(item => String(item.name) === `${name} · conjunto`);
  const targeting = adset?.targeting && typeof adset.targeting === 'object' ? adset.targeting as MetaRow : {};
  const geo = targeting.geo_locations && typeof targeting.geo_locations === 'object' ? targeting.geo_locations as MetaRow : {};
  const targetCities = Array.isArray(geo.cities) ? geo.cities as MetaRow[] : [];
  const targetPlatforms = Array.isArray(targeting.publisher_platforms) ? targeting.publisher_platforms.map(String).sort() : [];
  if (!adset || String(adset.campaign_id) !== campaignId || String(adset.status) !== 'PAUSED'
    || Number(adset.daily_budget) !== 6000 || !String(adset.start_time || '').startsWith('2026-08-05')
    || !String(adset.end_time || '').startsWith('2026-08-06') || !cities.every(city => targetCities.some(item => String(item.key) === city.key))
    || JSON.stringify(targetPlatforms) !== JSON.stringify(['facebook','instagram'])) throw new Error('INVALID_EXISTING_ADSET');
  await recordPublish(env, auth.token, payload, idempotencyKey, 'REOPENED', {
    campaign_id: campaignId, adset_id: String(adset.id),
  });
  console.warn('meta_publication_reopened', {
    idempotency_key: idempotencyKey, campaign_id: campaignId, adset_id: String(adset.id),
  });
  const instagram = await publicationStep('META_INSTAGRAM_ACTOR_RESOLUTION_FAILED', () => resolveInstagramActor(env));
  const linkData = { message: payload.copy, link: destination, name: payload.headline, picture: payload.image_url, call_to_action: { type: payload.cta, value: { link: destination } } };
  const story: Record<string, unknown> = { page_id: env.META_PAGE_ID, instagram_actor_id: instagram.actor_id, link_data: linkData };
  const creative = await publicationStep('META_CREATIVE_CREATE_FAILED', () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/adcreatives`, { name: `${name} · creativo`, object_story_spec: JSON.stringify(story) }, 'POST'));
  await recordPublish(env, auth.token, payload, idempotencyKey, 'PAUSED', { campaign_id: campaignId, adset_id: String(adset.id), creative_id: String(creative.id) });
  const ad = await publicationStep('META_AD_CREATE_FAILED', () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/ads`, { name: `${name} · anuncio`, adset_id: String(adset.id), creative: JSON.stringify({ creative_id: creative.id }), status: 'PAUSED' }, 'POST'));
  const metaIds = { campaign_id: campaignId, adset_id: String(adset.id), creative_id: String(creative.id), ad_id: String(ad.id) };
  await recordPublish(env, auth.token, payload, idempotencyKey, 'PAUSED', metaIds);
  console.info('meta_campaign_completed_paused', { ...metaIds, status: 'PAUSED' });
  return { ok: true, status: 'PAUSED', statuses: { campaign: 'PAUSED', adset: 'PAUSED', creative: 'PAUSED', ad: 'PAUSED' }, meta_ids: metaIds };
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
    const controlledCampaignId = String(env.META_CONTINUE_CAMPAIGN_ID || '').trim();
    const coordinationKey = controlledCampaignId ? `complete_campaign_${controlledCampaignId}_instagram_assignment_v2` : key;
    const existing = await coordinate(env, coordinationKey, 'reserve');
    if (existing.state === 'completed') return reply(existing.result, 200, origin);
    if (existing.state !== 'reserved') return reply({ ok: false, error: 'Publication already in progress' }, 409, origin);
    try {
      const result = controlledCampaignId
        ? await continueCampaign(env, auth, payload, coordinationKey, controlledCampaignId)
        : await publishCampaign(env, auth, payload, key);
      await coordinate(env, coordinationKey, 'complete', result);
      return reply(result, 201, origin);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'META_UPSTREAM';
      const status = code === 'META_PERMISSION_DENIED' ? 403 : code === 'AUDIT_UNAVAILABLE' ? 503 : 502;
      const failure = {
        ok: false,
        error: code === 'META_PERMISSION_DENIED' ? 'Meta permissions unavailable' : 'Publication failed safely',
        reason: code,
        ...(error instanceof MetaApiError ? { meta: { ...error.details, stage: error.stage } } : {}),
      };
      console.error('publication_failed', JSON.stringify({ reason: code, meta: error instanceof MetaApiError ? error.details : undefined }));
      await coordinate(env, coordinationKey, 'complete', failure);
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
