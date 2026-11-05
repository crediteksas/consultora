var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// production-baseline-20261011.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
function trustedImageURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (["fbcdn.net", "fbsbx.com"].some((host) => url.hostname === host || url.hostname.endsWith("." + host)) || ["facebook.com", "www.facebook.com"].includes(url.hostname) && url.pathname === "/ads/image/");
  } catch {
    return false;
  }
}
__name(trustedImageURL, "trustedImageURL");
__name2(trustedImageURL, "trustedImageURL");
async function imageSnapshot(url, fetcher = fetch) {
  if (!trustedImageURL(url)) return null;
  let response;
  for (let hop = 0; hop < 4; hop++) {
    if (!trustedImageURL(url)) return null;
    response = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(8e3) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || hop === 3) return null;
    url = new URL(location, url).href;
  }
  const type = response.headers.get("content-type")?.split(";")[0];
  const limit = 64 * 1024;
  if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(type) || Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (!size) return null;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${type};base64,${btoa(binary)}`;
}
__name(imageSnapshot, "imageSnapshot");
__name2(imageSnapshot, "imageSnapshot");
async function campaignThumbnails(env, campaignId, readMeta, coordinate2) {
  const key = `campaign-thumbnails-v1:${env.META_AD_ACCOUNT_ID}:${campaignId}`;
  const old = await coordinate2(env, key, "thumbnail_get");
  if (old.items?.length && old.checkedAt && Date.now() - old.checkedAt < 36e5) return old;
  try {
    const ads = await readMeta(env, `${env.META_AD_ACCOUNT_ID}/ads`, {
      filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: [campaignId] }]),
      fields: "id,name,creative{id,thumbnail_url,image_url}",
      limit: "5"
    });
    const items = [];
    for (const ad of ads) {
      const creativeId = String(ad.creative?.id || "");
      if (!creativeId || items.some((item) => item.creativeId === creativeId)) continue;
      const previous = old.items?.find((item) => item.creativeId === creativeId);
      let image = previous?.image || null;
      if (!image) {
        const small = await metaObject(env, creativeId, { fields: "thumbnail_url", thumbnail_width: "240", thumbnail_height: "240" }).catch(() => ({}));
        for (const url of [small.thumbnail_url, ad.creative?.thumbnail_url, ad.creative?.image_url]) {
          image = await imageSnapshot(url).catch(() => null);
          if (image) break;
        }
      }
      if (image) items.push({ creativeId, adId: String(ad.id), name: String(ad.name || "").slice(0, 160), image });
    }
    const result = { campaignId, checkedAt: Date.now(), items: items.length ? items : old.items || [], partial: ads.length === 5, stale: !items.length && ads.length > 0 };
    await coordinate2(env, key, "thumbnail_put", result);
    return result;
  } catch {
    return { ...old, campaignId, items: old.items || [], stale: true };
  }
}
__name(campaignThumbnails, "campaignThumbnails");
__name2(campaignThumbnails, "campaignThumbnails");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var APP_ID = "meta_ads";
var ALL_PERMISSIONS = ["meta_ads.access", "meta_ads.read", "meta_ads.analyze", "meta_ads.publish", "meta_ads.manage", "meta_ads.campaign.create", "meta_ads.campaign.pause", "meta_ads.budget.manage", "meta_ads.audit.read"];
var PUBLISH_PERMISSIONS = ["meta_ads.publish", "meta_ads.manage", "meta_ads.budget.manage"];
var OBJECTIVES = ["OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_SALES"];
var CTAS = ["LEARN_MORE", "APPLY_NOW", "CONTACT_US", "SEND_MESSAGE", "SHOP_NOW"];
function reply(body, status = 200, origin) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}
__name(reply, "reply");
__name2(reply, "reply");
__name22(reply, "reply");
var MetaApiError = class extends Error {
  static {
    __name(this, "MetaApiError");
  }
  static {
    __name2(this, "MetaApiError");
  }
  constructor(stage, details) {
    super(stage);
    this.stage = stage;
    this.details = details;
    this.name = "MetaApiError";
  }
  stage;
  details;
  static {
    __name22(this, "MetaApiError");
  }
};
var number = /* @__PURE__ */ __name22((value) => Number.isFinite(Number(value)) ? Number(value) : 0, "number");
var actionValue = /* @__PURE__ */ __name22((row, names) => {
  const actions = Array.isArray(row.actions) ? row.actions : [];
  return actions.filter((item) => names.includes(String(item.action_type))).reduce((sum, item) => sum + number(item.value), 0);
}, "actionValue");
function normalizeMetrics(row = {}) {
  const spend = number(row.spend);
  const clicks = number(row.clicks);
  const impressions = number(row.impressions);
  const reach = number(row.reach);
  const conversions = actionValue(row, ["onsite_conversion.messaging_conversation_started_7d", "lead", "offsite_conversion.fb_pixel_lead"]);
  const conversations = actionValue(row, ["onsite_conversion.messaging_conversation_started_7d", "messaging_conversation_started_7d"]);
  const leads = actionValue(row, ["lead", "offsite_conversion.fb_pixel_lead"]);
  return {
    spend,
    impressions,
    clicks,
    reach,
    conversions,
    conversations,
    leads,
    frequency: number(row.frequency),
    ctr: number(row.ctr),
    cpc: number(row.cpc) || (clicks ? spend / clicks : 0),
    cpm: number(row.cpm) || (impressions ? spend * 1e3 / impressions : 0),
    cost_per_result: conversions ? spend / conversions : null,
    roas_estimated: null
  };
}
__name(normalizeMetrics, "normalizeMetrics");
__name2(normalizeMetrics, "normalizeMetrics");
__name22(normalizeMetrics, "normalizeMetrics");
async function supabase(env, path, token, body) {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    method: body === void 0 ? "GET" : "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, ...body === void 0 ? {} : { "content-type": "application/json" } },
    ...body === void 0 ? {} : { body: JSON.stringify(body) }
  });
}
__name(supabase, "supabase");
__name2(supabase, "supabase");
__name22(supabase, "supabase");
async function authenticate(request, env) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const [userResponse, accessResponse, metaAccessResponse] = await Promise.all([
    supabase(env, "/auth/v1/user", token),
    supabase(env, "/rest/v1/rpc/aura_my_access", token, {}),
    supabase(env, "/rest/v1/rpc/aura_meta_ads_my_access", token, {})
  ]);
  if (!userResponse.ok || !accessResponse.ok) return null;
  const user = await userResponse.json();
  const access = await accessResponse.json();
  if (!user.id || !user.email || access.user_id !== user.id || access.email?.toLowerCase() !== user.email.toLowerCase()) return null;
  if (access.active === false || user.banned_until && Date.parse(user.banned_until) > Date.now()) return null;
  const metaGrant = metaAccessResponse.ok ? await metaAccessResponse.json() : null;
  if (metaGrant?.active === false) return null;
  let grant = metaGrant?.active && Array.isArray(metaGrant.permissions) ? { app_id: APP_ID, role_id: metaGrant.role_id || "meta_ads.reader", permissions: metaGrant.permissions } : access.apps?.find((candidate) => candidate.app_id === APP_ID) || null;
  const owner = access.apps?.some((candidate) => candidate.role_id === "aura.owner");
  if (!grant && owner) grant = { app_id: APP_ID, role_id: "aura.owner", permissions: ALL_PERMISSIONS };
  return grant ? { token, access, grant } : null;
}
__name(authenticate, "authenticate");
__name2(authenticate, "authenticate");
__name22(authenticate, "authenticate");
async function audit(env, token, action, metadata) {
  const result = await supabase(env, "/rest/v1/rpc/aura_meta_ads_record_action", token, {
    p_action: action,
    p_period: number(metadata.period)
  });
  return result.ok;
}
__name(audit, "audit");
__name2(audit, "audit");
__name22(audit, "audit");
async function allowed(env, userId) {
  const id = env.RATE_LIMITER.idFromName(userId);
  const response = await env.RATE_LIMITER.get(id).fetch("https://rate-limit/check", {
    method: "POST",
    body: String(Math.max(1, number(env.RATE_LIMIT_PER_MINUTE) || 30))
  });
  return response;
}
__name(allowed, "allowed");
__name2(allowed, "allowed");
__name22(allowed, "allowed");
function dateRange(url) {
  const period = Math.min(90, Math.max(1, number(url.searchParams.get("period")) || 7));
  const until = /* @__PURE__ */ new Date();
  const since = new Date(until);
  since.setUTCDate(until.getUTCDate() - period + 1);
  return { period, since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}
__name(dateRange, "dateRange");
__name2(dateRange, "dateRange");
__name22(dateRange, "dateRange");
async function meta(env, path, params) {
  if (!env.META_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) throw new Error("META_NOT_CONFIGURED");
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION || "v25.0"}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("access_token", env.META_ACCESS_TOKEN);
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15e3) });
  if (!response.ok) throw new Error(response.status === 404 ? "META_NOT_FOUND" : "META_UPSTREAM");
  const body = await response.json();
  return Array.isArray(body.data) ? body.data : [];
}
__name(meta, "meta");
__name2(meta, "meta");
__name22(meta, "meta");
async function metaObject(env, path, params, method = "GET") {
  if (!env.META_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) throw new Error("META_NOT_CONFIGURED");
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION || "v25.0"}/${path}`);
  url.searchParams.set("access_token", env.META_ACCESS_TOKEN);
  const init = { method, headers: { accept: "application/json" }, signal: AbortSignal.timeout(15e3) };
  if (method === "GET") Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  else {
    init.headers = { ...init.headers, "content-type": "application/x-www-form-urlencoded" };
    init.body = new URLSearchParams(params);
  }
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const metaError = body.error && typeof body.error === "object" ? body.error : {};
    const safeMessage = String(metaError.message || "UNKNOWN").replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]").slice(0, 240);
    const safeDetail = /* @__PURE__ */ __name22((value) => JSON.stringify(value ?? null).replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]").slice(0, 800), "safeDetail");
    const details = {
      endpoint: `/${path}`,
      status: response.status,
      code: String(metaError.code || "UNKNOWN"),
      subcode: String(metaError.error_subcode || "NONE"),
      type: String(metaError.type || "UNKNOWN"),
      message: safeMessage,
      error_user_title: safeDetail(metaError.error_user_title),
      error_user_msg: safeDetail(metaError.error_user_msg),
      error_data: safeDetail(metaError.error_data),
      fbtrace_id: String(metaError.fbtrace_id || "NONE").slice(0, 80)
    };
    console.warn("meta_write_failed", JSON.stringify({ ...details, path: details.endpoint }));
    throw new MetaApiError("META_UPSTREAM", details);
  }
  return body;
}
__name(metaObject, "metaObject");
__name2(metaObject, "metaObject");
__name22(metaObject, "metaObject");
async function supabaseRows(env, path, token) {
  const response = await supabase(env, path, token);
  if (!response.ok) throw new Error("CATALOG_UNAVAILABLE");
  return await response.json();
}
__name(supabaseRows, "supabaseRows");
__name2(supabaseRows, "supabaseRows");
__name22(supabaseRows, "supabaseRows");
async function publisherOptions(env, token) {
  await verifyMetaApp(env);
  const [piecesResponse, citiesResponse, instagram] = await Promise.all([
    supabase(env, "/rest/v1/rpc/aura_meta_ads_ready_pieces", token, {}),
    supabase(env, "/rest/v1/rpc/aura_meta_ads_ready_cities", token, {}),
    resolveInstagramActor(env)
  ]);
  if (!piecesResponse.ok || !citiesResponse.ok) {
    const citiesError = citiesResponse.ok ? null : await citiesResponse.clone().json().catch(() => ({}));
    console.warn("publisher_catalog_http", `pieces=${piecesResponse.status}`, `cities=${citiesResponse.status}`, `code=${citiesError?.code || "UNKNOWN"}`);
    throw new Error("CATALOG_UNAVAILABLE");
  }
  const pieces = await piecesResponse.json();
  const cities = await citiesResponse.json();
  return { ok: true, pieces, cities, objectives: OBJECTIVES, ctas: CTAS, instagram };
}
__name(publisherOptions, "publisherOptions");
__name2(publisherOptions, "publisherOptions");
__name22(publisherOptions, "publisherOptions");
function validatePublishPayload(value) {
  const input = value && typeof value === "object" ? value : {};
  if (!input.final_confirmation) throw new Error("CONFIRMATION_REQUIRED");
  if (!input.piece_id || !Array.isArray(input.cities) || !input.cities.length) throw new Error("INVALID_REQUEST");
  if (!Array.isArray(input.platforms) || !input.platforms.length || input.platforms.some((item) => !["facebook", "instagram"].includes(item))) throw new Error("INVALID_REQUEST");
  if (!OBJECTIVES.includes(String(input.objective)) || !CTAS.includes(String(input.cta))) throw new Error("INVALID_REQUEST");
  if (!["daily", "lifetime"].includes(String(input.budget_type)) || !Number.isInteger(Number(input.budget_cop)) || Number(input.budget_cop) < 6e3 || Number(input.budget_cop) > 1e7) throw new Error("INVALID_BUDGET");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.start_date)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.end_date)) || String(input.end_date) < String(input.start_date)) throw new Error("INVALID_DATES");
  const image = input.image_data;
  const manualImage = input.piece_id === "manual" && image && ["image/jpeg", "image/png", "image/webp"].includes(String(image.mime_type)) && /^[A-Za-z0-9+/]+={0,2}$/.test(String(image.bytes_base64 || "")) && String(image.bytes_base64).length <= 7e6;
  if (!String(input.copy || "").trim() || !String(input.headline || "").trim() || !/^https:\/\//.test(String(input.image_url || "")) && !manualImage) throw new Error("INVALID_CREATIVE");
  if (input.variants !== void 0) {
    if (!Array.isArray(input.variants) || input.variants.length !== 2) throw new Error("INVALID_VARIANTS");
    for (const variant of input.variants) {
      if (!String(variant.copy || "").trim() || !String(variant.headline || "").trim() || !CTAS.includes(String(variant.cta))) throw new Error("INVALID_VARIANTS");
      const variantManual = variant.piece_id === "manual" && variant.image_data && ["image/jpeg", "image/png", "image/webp"].includes(String(variant.image_data.mime_type)) && /^[A-Za-z0-9+/]+={0,2}$/.test(String(variant.image_data.bytes_base64 || "")) && String(variant.image_data.bytes_base64).length <= 7e6;
      if (!/^https:\/\//.test(String(variant.image_url || "")) && !variantManual) throw new Error("INVALID_VARIANTS");
    }
  }
  return input;
}
__name(validatePublishPayload, "validatePublishPayload");
__name2(validatePublishPayload, "validatePublishPayload");
__name22(validatePublishPayload, "validatePublishPayload");
async function verifyMetaApp(env) {
  const result = await metaObject(env, "debug_token", { input_token: env.META_ACCESS_TOKEN });
  const data = result.data || {};
  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : [];
  console.warn("meta_token_scopes_verified", { scopes: scopes.sort() });
  if (!/^\d+$/.test(String(data.app_id || "")) || data.is_valid !== true || !scopes.includes("ads_management")) throw new Error("META_PERMISSION_DENIED");
}
__name(verifyMetaApp, "verifyMetaApp");
__name2(verifyMetaApp, "verifyMetaApp");
__name22(verifyMetaApp, "verifyMetaApp");
async function resolveCities(env, token, ids) {
  const response = await supabase(env, "/rest/v1/rpc/aura_meta_ads_ready_cities", token, {});
  if (!response.ok) throw new Error("CATALOG_UNAVAILABLE");
  const available = await response.json();
  const requested = new Set(ids);
  const catalog = available.filter((city) => requested.has(String(city.id)));
  if (catalog.length !== new Set(ids).size) throw new Error("INVALID_CITY");
  return Promise.all(catalog.map(async (city) => {
    const result = await metaObject(env, "search", { type: "adgeolocation", location_types: '["city"]', q: String(city.name), country_code: String(city.country_code || "CO") });
    const choices = Array.isArray(result.data) ? result.data : [];
    const match = choices.find((item) => String(item.name).toLowerCase() === String(city.name).toLowerCase()) || choices[0];
    if (!match?.key) throw new Error("INVALID_CITY");
    return { key: String(match.key), radius: 25, distance_unit: "kilometer" };
  }));
}
__name(resolveCities, "resolveCities");
__name2(resolveCities, "resolveCities");
__name22(resolveCities, "resolveCities");
async function resolveInstagramActor(env) {
  const [page, availableResult] = await Promise.all([
    metaObject(env, env.META_PAGE_ID, {
      fields: "id,name,instagram_business_account{id,username},connected_instagram_account{id,username}"
    }),
    metaObject(env, `${env.META_AD_ACCOUNT_ID}/instagram_accounts`, { fields: "id,username", limit: "100" })
  ]);
  const business = page.instagram_business_account && typeof page.instagram_business_account === "object" ? page.instagram_business_account : null;
  const connected = page.connected_instagram_account && typeof page.connected_instagram_account === "object" ? page.connected_instagram_account : null;
  const actorId = String(business?.id || connected?.id || "");
  const available = Array.isArray(availableResult.data) ? availableResult.data : [];
  if (String(page.id) !== String(env.META_PAGE_ID) || !/^\d+$/.test(actorId)) throw new Error("INSTAGRAM_ACTOR_UNAVAILABLE");
  if (!available.some((account) => String(account.id) === actorId)) {
    console.warn("meta_instagram_actor_assignment_missing", {
      page_id: String(page.id),
      linked_actor_id: actorId,
      ad_account_actor_ids: available.map((account) => String(account.id)).filter((id) => /^\d+$/.test(id))
    });
    throw new Error("INSTAGRAM_ACTOR_NOT_ASSIGNED_TO_AD_ACCOUNT");
  }
  const source = business?.id ? "instagram_business_account" : "connected_instagram_account";
  console.info("meta_instagram_actor_resolved", { page_id: String(page.id), instagram_actor_id: actorId, source, ad_account_assigned: true });
  return { ready: true, page_id: String(page.id), actor_id: actorId, source };
}
__name(resolveInstagramActor, "resolveInstagramActor");
__name2(resolveInstagramActor, "resolveInstagramActor");
__name22(resolveInstagramActor, "resolveInstagramActor");
async function recordPublish(env, token, payload, idempotencyKey, status, metaIds) {
  const response = await supabase(env, "/rest/v1/rpc/aura_meta_ads_record_publish", token, {
    p_piece_id: payload.piece_id,
    p_cities: payload.cities,
    p_platforms: payload.platforms,
    p_objective: payload.objective,
    p_budget_type: payload.budget_type,
    p_budget_cop: payload.budget_cop,
    p_start_date: payload.start_date,
    p_end_date: payload.end_date,
    p_idempotency_key: idempotencyKey,
    p_status: status,
    p_meta_ids: metaIds
  });
  if (!response.ok) throw new Error("AUDIT_UNAVAILABLE");
}
__name(recordPublish, "recordPublish");
__name2(recordPublish, "recordPublish");
__name22(recordPublish, "recordPublish");
function assertCompleteMetaIds(metaIds, comparison) {
  const required = comparison ? ["campaign_id", "adset_id", "creative_a_id", "creative_b_id", "ad_a_id", "ad_b_id"] : ["campaign_id", "adset_id", "creative_a_id", "ad_a_id"];
  if (required.some((key) => {
    const value = String(metaIds[key] || "").trim();
    return !value || value === "null" || value === "undefined";
  })) throw new Error("META_PUBLICATION_INCOMPLETE");
}
__name(assertCompleteMetaIds, "assertCompleteMetaIds");
__name2(assertCompleteMetaIds, "assertCompleteMetaIds");
__name22(assertCompleteMetaIds, "assertCompleteMetaIds");
async function approvedCreative(env, token, payload) {
  if (payload.piece_id === "manual") return;
  const pieces = await supabaseRows(env, "/rest/v1/rpc/aura_meta_ads_ready_pieces", token);
  const piece = pieces.find((item) => String(item.id) === String(payload.piece_id));
  if (!piece || String(piece.estado) !== "lista_para_publicar" || String(piece.copy || "") !== String(payload.copy || "") || String(piece.headline || "") !== String(payload.headline || "") || String(piece.imagen_url || "") !== String(payload.image_url || "")) throw new Error("CREATIVE_NOT_APPROVED");
}
__name(approvedCreative, "approvedCreative");
__name2(approvedCreative, "approvedCreative");
__name22(approvedCreative, "approvedCreative");
async function creativeImage(env, payload) {
  if (payload.piece_id !== "manual") return { picture: String(payload.image_url) };
  const image = payload.image_data;
  const uploaded = await metaObject(env, `${env.META_AD_ACCOUNT_ID}/adimages`, { bytes: String(image.bytes_base64) }, "POST");
  const images = uploaded.images && typeof uploaded.images === "object" ? uploaded.images : {};
  const hash = Object.values(images).map((item) => String(item?.hash || "")).find(Boolean) || String(uploaded.hash || "");
  if (!hash) throw new Error("META_IMAGE_UPLOAD_FAILED");
  return { image_hash: hash };
}
__name(creativeImage, "creativeImage");
__name2(creativeImage, "creativeImage");
__name22(creativeImage, "creativeImage");
function adsetPayload(payload, name, campaignId, cities, pageId) {
  const budget = payload.budget_type === "lifetime" ? { lifetime_budget: String(payload.budget_cop) } : { daily_budget: String(payload.budget_cop) };
  const isWhatsApp = payload.objective === "OUTCOME_ENGAGEMENT" && payload.cta === "SEND_MESSAGE";
  return {
    name: `${name} \xB7 conjunto`,
    campaign_id: campaignId,
    ...budget,
    start_time: `${payload.start_date}T00:05:00-0500`,
    end_time: `${payload.end_date}T23:55:00-0500`,
    billing_event: "IMPRESSIONS",
    optimization_goal: isWhatsApp ? "CONVERSATIONS" : payload.objective === "OUTCOME_AWARENESS" ? "REACH" : "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: JSON.stringify({ geo_locations: { cities }, publisher_platforms: payload.platforms }),
    ...isWhatsApp ? { destination_type: "WHATSAPP", promoted_object: JSON.stringify({ page_id: String(pageId) }) } : {},
    status: "PAUSED"
  };
}
__name(adsetPayload, "adsetPayload");
__name2(adsetPayload, "adsetPayload");
__name22(adsetPayload, "adsetPayload");
async function publicationStep(code, operation, variant) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MetaApiError) throw new MetaApiError(code, { ...error.details, ...variant ? { variant } : {} });
    throw new Error(code);
  }
}
__name(publicationStep, "publicationStep");
__name2(publicationStep, "publicationStep");
__name22(publicationStep, "publicationStep");
function campaignPayload(payload, name) {
  const objective = String(payload.objective);
  if (!OBJECTIVES.includes(objective)) throw new Error("INVALID_CAMPAIGN_OBJECTIVE");
  return { name, objective, buying_type: "AUCTION", status: "PAUSED", special_ad_categories: "[]", is_adset_budget_sharing_enabled: "false" };
}
__name(campaignPayload, "campaignPayload");
__name2(campaignPayload, "campaignPayload");
__name22(campaignPayload, "campaignPayload");
function requireMetaId(value, code) {
  const id = String(value?.id || "").trim();
  if (!id || id === "undefined" || id === "null") throw new Error(code);
  return id;
}
__name(requireMetaId, "requireMetaId");
__name2(requireMetaId, "requireMetaId");
__name22(requireMetaId, "requireMetaId");
async function rollbackCreatedObjects(env, created) {
  for (const id of [...new Set(created)].reverse()) {
    await metaObject(env, id, { status: "PAUSED" }, "POST").catch(() => void 0);
  }
}
__name(rollbackCreatedObjects, "rollbackCreatedObjects");
__name2(rollbackCreatedObjects, "rollbackCreatedObjects");
__name22(rollbackCreatedObjects, "rollbackCreatedObjects");
async function publishCampaign(env, auth, payload, idempotencyKey) {
  const created = [];
  try {
    return await publishCampaignUnsafe(env, auth, payload, idempotencyKey, created);
  } catch (error) {
    await rollbackCreatedObjects(env, created);
    throw error;
  }
}
__name(publishCampaign, "publishCampaign");
__name2(publishCampaign, "publishCampaign");
__name22(publishCampaign, "publishCampaign");
async function publishCampaignUnsafe(env, auth, payload, idempotencyKey, created) {
  await verifyMetaApp(env);
  const variants = payload.variants?.length === 2 ? payload.variants : [{
    piece_id: payload.piece_id,
    copy: payload.copy,
    headline: payload.headline,
    cta: payload.cta,
    image_url: payload.image_url,
    image_data: payload.image_data
  }];
  for (let index = 0; index < variants.length; index += 1) {
    const label = variants.length === 2 ? index === 0 ? "A" : "B" : "A";
    await publicationStep("META_PREFLIGHT_CREATIVE_FAILED", () => approvedCreative(env, auth.token, variants[index]), label);
    if (!["LEARN_MORE", "APPLY_NOW", "CONTACT_US", "SEND_MESSAGE", "SHOP_NOW"].includes(String(variants[index].cta))) {
      throw new Error(`INVALID_CTA_${label}`);
    }
  }
  const destination = env.META_DESTINATION_URL || "https://registro.crediteksas.com/creditek/agentes/";
  if (!/^https:\/\//i.test(destination)) throw new Error("INVALID_DESTINATION_URL");
  const publicationId = crypto.randomUUID();
  const publishedAt = (/* @__PURE__ */ new Date()).toISOString();
  const publishedBy = String(auth.access.user_id || "");
  const cities = await publicationStep("META_CITY_RESOLUTION_FAILED", () => resolveCities(env, auth.token, payload.cities || []));
  const whatsappOnly = variants.every((variant) => payload.objective === "OUTCOME_ENGAGEMENT" && variant.cta === "SEND_MESSAGE");
  const instagram = whatsappOnly ? { ready: true, actor_id: "", source: "whatsapp_destination" } : await publicationStep("META_INSTAGRAM_ACTOR_RESOLUTION_FAILED", () => resolveInstagramActor(env));
  const images = [];
  for (let index = 0; index < variants.length; index += 1) {
    const label = variants.length === 2 ? index === 0 ? "A" : "B" : "A";
    images.push(await publicationStep("META_IMAGE_UPLOAD_FAILED", () => creativeImage(env, variants[index]), label));
  }
  const name = String(payload.campaign_name || `AURA ${payload.piece_id}`).slice(0, 120);
  const campaign = await publicationStep("META_CAMPAIGN_CREATE_FAILED", () => metaObject(
    env,
    `${env.META_AD_ACCOUNT_ID}/campaigns`,
    campaignPayload(payload, name),
    "POST"
  ));
  const campaignId = await publicationStep("META_CAMPAIGN_INVALID_RESPONSE", async () => requireMetaId(campaign, "META_CAMPAIGN_INVALID_RESPONSE"));
  created.push(campaignId);
  const trace = { publication_id: publicationId, published_at: publishedAt, published_by: publishedBy, campaign_name: name };
  const adset = await publicationStep("META_ADSET_CREATE_FAILED", () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/adsets`, adsetPayload(payload, name, campaignId, cities, env.META_PAGE_ID), "POST"));
  const adsetId = await publicationStep("META_ADSET_INVALID_RESPONSE", async () => requireMetaId(adset, "META_ADSET_INVALID_RESPONSE"));
  created.push(adsetId);
  const variantIds = [];
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const label = variants.length === 2 ? `VARIANTE ${index === 0 ? "A" : "B"}` : "";
    const image = images[index];
    const isWhatsApp = payload.objective === "OUTCOME_ENGAGEMENT" && variant.cta === "SEND_MESSAGE";
    const linkData = isWhatsApp ? { message: variant.copy, link: "https://api.whatsapp.com/send", name: variant.headline, ...image, call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } } } : { message: variant.copy, link: destination, name: variant.headline, ...image, call_to_action: { type: variant.cta, value: { link: destination } } };
    const story = isWhatsApp ? { page_id: env.META_PAGE_ID, link_data: linkData } : { page_id: env.META_PAGE_ID, instagram_actor_id: instagram.actor_id, link_data: linkData };
    const creative = await publicationStep("META_CREATIVE_CREATE_FAILED", () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/adcreatives`, { name: `${name}${label ? ` \xB7 ${label}` : ""} \xB7 creativo`, object_story_spec: JSON.stringify(story) }, "POST"), label || "A");
    const creativeId = await publicationStep("META_CREATIVE_INVALID_RESPONSE", async () => requireMetaId(creative, "META_CREATIVE_INVALID_RESPONSE"), label || "A");
    const ad = await publicationStep("META_AD_CREATE_FAILED", () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/ads`, { name: `${name}${label ? ` \xB7 ${label}` : ""} \xB7 anuncio`, adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: "PAUSED" }, "POST"), label || "A");
    const adId = await publicationStep("META_AD_INVALID_RESPONSE", async () => requireMetaId(ad, "META_AD_INVALID_RESPONSE"), label || "A");
    created.push(adId);
    variantIds.push({ label: label || "single", creative_id: creativeId, ad_id: adId });
  }
  const comparison = variants.length === 2;
  const metaIds = comparison ? { campaign_id: campaignId, adset_id: adsetId, creative_a_id: variantIds[0].creative_id, ad_a_id: variantIds[0].ad_id, creative_b_id: variantIds[1].creative_id, ad_b_id: variantIds[1].ad_id } : { campaign_id: campaignId, adset_id: adsetId, creative_a_id: variantIds[0].creative_id, ad_a_id: variantIds[0].ad_id };
  assertCompleteMetaIds(metaIds, comparison);
  await recordPublish(env, auth.token, payload, idempotencyKey, "PAUSED", { ...trace, ...metaIds });
  const activated = [];
  try {
    await publicationStep("META_ADSET_ACTIVATION_FAILED", () => metaObject(env, adsetId, { status: "ACTIVE" }, "POST"));
    activated.push(adsetId);
    for (const variant of variantIds) {
      await publicationStep("META_AD_ACTIVATION_FAILED", () => metaObject(env, variant.ad_id, { status: "ACTIVE" }, "POST"), variant.label);
      activated.push(variant.ad_id);
    }
    await publicationStep("META_CAMPAIGN_ACTIVATION_FAILED", () => metaObject(env, campaignId, { status: "ACTIVE" }, "POST"));
    activated.push(campaignId);
  } catch (error) {
    for (const id of activated.reverse()) await metaObject(env, id, { status: "PAUSED" }, "POST").catch(() => void 0);
    throw error;
  }
  await recordPublish(env, auth.token, payload, idempotencyKey, "ACTIVE", { ...trace, ...metaIds });
  console.info("meta_campaign_published", { ...metaIds, status: "ACTIVE", review_status: "EN_REVISI\xD3N_DE_META" });
  return { ok: true, status: "ACTIVE", review_status: "EN_REVISI\xD3N_DE_META", comparison: comparison ? "A/B" : null, publication_id: publicationId, published_at: publishedAt, published_by: publishedBy, campaign_name: name, statuses: { campaign: "ACTIVE", adset: "ACTIVE", creative: "IN_REVIEW", ad: "ACTIVE" }, meta_ids: metaIds, variants: variantIds };
}
__name(publishCampaignUnsafe, "publishCampaignUnsafe");
__name2(publishCampaignUnsafe, "publishCampaignUnsafe");
__name22(publishCampaignUnsafe, "publishCampaignUnsafe");
async function continueCampaign(env, auth, payload, idempotencyKey, campaignId) {
  await verifyMetaApp(env);
  const campaign = await publicationStep("META_CAMPAIGN_VALIDATION_FAILED", () => metaObject(env, campaignId, {
    fields: "id,account_id,objective,status,effective_status,name"
  }));
  const expectedAccount = String(env.META_AD_ACCOUNT_ID).replace(/^act_/, "");
  if (String(campaign.id) !== campaignId || String(campaign.account_id) !== expectedAccount || String(campaign.objective) !== "OUTCOME_TRAFFIC" || String(campaign.status) !== "PAUSED") {
    throw new Error("INVALID_EXISTING_CAMPAIGN");
  }
  if (payload.objective !== "OUTCOME_TRAFFIC" || Number(payload.budget_cop) !== 6e3 || payload.start_date !== "2026-08-05" || payload.end_date !== "2026-08-06" || JSON.stringify([...payload.cities || []].sort()) !== JSON.stringify(["retail-tolu"]) || JSON.stringify([...payload.platforms || []].sort()) !== JSON.stringify(["facebook", "instagram"])) {
    throw new Error("CONTROLLED_PAYLOAD_MISMATCH");
  }
  const pieces = await supabaseRows(env, "/rest/v1/rpc/aura_meta_ads_ready_pieces", auth.token);
  const piece = pieces.find((item) => String(item.id) === String(payload.piece_id));
  if (!piece || String(piece.estado) !== "lista_para_publicar" || String(piece.copy || "") !== String(payload.copy || "") || String(piece.headline || "") !== String(payload.headline || "") || String(piece.imagen_url || "") !== String(payload.image_url || "")) {
    throw new Error("CREATIVE_NOT_APPROVED");
  }
  const cities = await publicationStep("META_CITY_RESOLUTION_FAILED", () => resolveCities(env, auth.token, payload.cities || []));
  const name = String(payload.campaign_name || `AURA ${payload.piece_id}`).slice(0, 120);
  const destination = env.META_DESTINATION_URL || "https://registro.crediteksas.com/creditek/agentes/";
  const adsetsResult = await publicationStep("META_ADSET_VALIDATION_FAILED", () => metaObject(env, `${campaignId}/adsets`, {
    fields: "id,campaign_id,name,status,effective_status,daily_budget,start_time,end_time,targeting",
    limit: "50"
  }));
  const adsets = Array.isArray(adsetsResult.data) ? adsetsResult.data : [];
  const adset = adsets.find((item) => String(item.name) === `${name} \xB7 conjunto`);
  const targeting = adset?.targeting && typeof adset.targeting === "object" ? adset.targeting : {};
  const geo = targeting.geo_locations && typeof targeting.geo_locations === "object" ? targeting.geo_locations : {};
  const targetCities = Array.isArray(geo.cities) ? geo.cities : [];
  const targetPlatforms = Array.isArray(targeting.publisher_platforms) ? targeting.publisher_platforms.map(String).sort() : [];
  if (!adset || String(adset.campaign_id) !== campaignId || String(adset.status) !== "PAUSED" || Number(adset.daily_budget) !== 6e3 || !String(adset.start_time || "").startsWith("2026-08-05") || !String(adset.end_time || "").startsWith("2026-08-06") || !cities.every((city) => targetCities.some((item) => String(item.key) === city.key)) || JSON.stringify(targetPlatforms) !== JSON.stringify(["facebook", "instagram"])) throw new Error("INVALID_EXISTING_ADSET");
  await recordPublish(env, auth.token, payload, idempotencyKey, "REOPENED", {
    campaign_id: campaignId,
    adset_id: String(adset.id)
  });
  console.warn("meta_publication_reopened", {
    idempotency_key: idempotencyKey,
    campaign_id: campaignId,
    adset_id: String(adset.id)
  });
  const instagram = await publicationStep("META_INSTAGRAM_ACTOR_RESOLUTION_FAILED", () => resolveInstagramActor(env));
  const linkData = { message: payload.copy, link: destination, name: payload.headline, picture: payload.image_url, call_to_action: { type: payload.cta, value: { link: destination } } };
  const story = { page_id: env.META_PAGE_ID, instagram_actor_id: instagram.actor_id, link_data: linkData };
  const creative = await publicationStep("META_CREATIVE_CREATE_FAILED", () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/adcreatives`, { name: `${name} \xB7 creativo`, object_story_spec: JSON.stringify(story) }, "POST"));
  await recordPublish(env, auth.token, payload, idempotencyKey, "PAUSED", { campaign_id: campaignId, adset_id: String(adset.id), creative_a_id: String(creative.id) });
  const ad = await publicationStep("META_AD_CREATE_FAILED", () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/ads`, { name: `${name} \xB7 anuncio`, adset_id: String(adset.id), creative: JSON.stringify({ creative_id: creative.id }), status: "PAUSED" }, "POST"));
  const metaIds = { campaign_id: campaignId, adset_id: String(adset.id), creative_a_id: String(creative.id), ad_a_id: String(ad.id) };
  await recordPublish(env, auth.token, payload, idempotencyKey, "PAUSED", metaIds);
  console.info("meta_campaign_completed_paused", { ...metaIds, status: "PAUSED" });
  return { ok: true, status: "PAUSED", statuses: { campaign: "PAUSED", adset: "PAUSED", creative: "PAUSED", ad: "PAUSED" }, meta_ids: metaIds };
}
__name(continueCampaign, "continueCampaign");
__name2(continueCampaign, "continueCampaign");
__name22(continueCampaign, "continueCampaign");
async function coordinate(env, key, action, result) {
  const stub = env.PUBLISH_COORDINATOR.get(env.PUBLISH_COORDINATOR.idFromName(key));
  const response = await stub.fetch("https://publish-lock/state", { method: "POST", body: JSON.stringify({ action, result }) });
  return await response.json();
}
__name(coordinate, "coordinate");
__name2(coordinate, "coordinate");
__name22(coordinate, "coordinate");
async function dashboard(env, url) {
  const range = dateRange(url);
  const timeRange = JSON.stringify({ since: range.since, until: range.until });
  const today = /* @__PURE__ */ new Date();
  const weekSince = new Date(today);
  weekSince.setUTCDate(today.getUTCDate() - (today.getUTCDay() + 6) % 7);
  const monthSince = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const fields = "spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,actions";
  const [insights, campaigns, campaignInsights, trends, weekly, monthly] = await Promise.all([
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields,
      time_range: timeRange
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/campaigns`, {
      fields: "id,name,objective,effective_status,daily_budget,lifetime_budget,start_time,stop_time",
      limit: "100"
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields: `campaign_id,campaign_name,${fields}`,
      level: "campaign",
      time_range: timeRange,
      limit: "100"
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields: `date_start,date_stop,${fields}`,
      time_range: timeRange,
      time_increment: "1",
      limit: "100"
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields,
      time_range: JSON.stringify({ since: weekSince.toISOString().slice(0, 10), until: today.toISOString().slice(0, 10) })
    }),
    meta(env, `${env.META_AD_ACCOUNT_ID}/insights`, {
      fields,
      time_range: JSON.stringify({ since: monthSince.toISOString().slice(0, 10), until: today.toISOString().slice(0, 10) })
    })
  ]);
  const insightByCampaign = new Map(campaignInsights.map((item) => [String(item.campaign_id || ""), normalizeMetrics(item)]));
  const normalized = campaigns.map((item) => {
    const id = String(item.id || "");
    return {
      id,
      name: String(item.name || "Sin nombre"),
      objective: String(item.objective || "UNKNOWN"),
      status: String(item.effective_status || "UNKNOWN"),
      daily_budget: number(item.daily_budget),
      lifetime_budget: number(item.lifetime_budget),
      start_time: item.start_time || null,
      stop_time: item.stop_time || null,
      metrics: insightByCampaign.get(id) || normalizeMetrics()
    };
  }).sort((a, b) => b.metrics.conversions - a.metrics.conversions || b.metrics.clicks - a.metrics.clicks);
  const metrics2 = normalizeMetrics(insights[0] || {});
  const weeklyMetrics = normalizeMetrics(weekly[0] || {});
  const monthlyMetrics = normalizeMetrics(monthly[0] || {});
  const weeklyBudget = normalized.filter((item) => item.status === "ACTIVE").reduce((sum, item) => sum + item.daily_budget * 7, 0);
  const alerts = [];
  if (metrics2.frequency > 3.5) alerts.push({ type: "fatigue", message: "Frecuencia alta: posible fatiga publicitaria." });
  if (weeklyBudget && weeklyMetrics.spend > weeklyBudget) alerts.push({ type: "overdelivery", message: "El gasto semanal supera el presupuesto activo calculado." });
  return {
    ok: true,
    mode: "read",
    source: "meta",
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    range,
    metrics: { ...metrics2, spend_weekly: weeklyMetrics.spend, spend_monthly: monthlyMetrics.spend, budget_weekly: weeklyBudget },
    campaigns: normalized,
    trends: trends.map((item) => ({ date: item.date_start || item.date_stop || null, ...normalizeMetrics(item) })),
    comparisons: [],
    attribution: { status: "unavailable", sales: null, campaigns_without_attribution: normalized.length },
    filters: { municipality: "metadata_pending", platform: "metadata_pending", origin: "metadata_pending", period: range.period },
    alerts
  };
}
__name(dashboard, "dashboard");
__name2(dashboard, "dashboard");
__name22(dashboard, "dashboard");
function validMetaId(value) {
  const id = String(value || "").trim();
  return /^\d{5,32}$/.test(id) ? id : "";
}
__name(validMetaId, "validMetaId");
__name2(validMetaId, "validMetaId");
__name22(validMetaId, "validMetaId");
function configuredAccountId(env) {
  return String(env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
}
__name(configuredAccountId, "configuredAccountId");
__name2(configuredAccountId, "configuredAccountId");
__name22(configuredAccountId, "configuredAccountId");
async function readSmallJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 32768) throw new Error("REQUEST_TOO_LARGE");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_JSON");
  return body;
}
__name(readSmallJson, "readSmallJson");
__name2(readSmallJson, "readSmallJson");
__name22(readSmallJson, "readSmallJson");
function operationError(error, fallback) {
  if (error instanceof MetaApiError) return { ok: false, error: fallback, detail: error.details };
  const detail = error instanceof Error ? error.message : "UNKNOWN";
  return { ok: false, error: fallback, detail: String(detail).slice(0, 240) };
}
__name(operationError, "operationError");
__name2(operationError, "operationError");
__name22(operationError, "operationError");
async function campaignInConfiguredAccount(env, campaignId) {
  const campaign = await metaObject(env, campaignId, { fields: "id,account_id,name,status,effective_status" });
  if (String(campaign.id) !== campaignId || String(campaign.account_id).replace(/^act_/, "") !== configuredAccountId(env)) throw new Error("CAMPAIGN_NOT_IN_ACCOUNT");
  return campaign;
}
__name(campaignInConfiguredAccount, "campaignInConfiguredAccount");
__name2(campaignInConfiguredAccount, "campaignInConfiguredAccount");
__name22(campaignInConfiguredAccount, "campaignInConfiguredAccount");
async function adSetInConfiguredAccount(env, adSetId) {
  const adSet = await metaObject(env, adSetId, { fields: "id,account_id,campaign_id,name,targeting" });
  if (String(adSet.id) !== adSetId || String(adSet.account_id).replace(/^act_/, "") !== configuredAccountId(env)) throw new Error("ADSET_NOT_IN_ACCOUNT");
  return adSet;
}
__name(adSetInConfiguredAccount, "adSetInConfiguredAccount");
__name2(adSetInConfiguredAccount, "adSetInConfiguredAccount");
__name22(adSetInConfiguredAccount, "adSetInConfiguredAccount");
async function campaignAdSets(env, campaignId, fields) {
  await campaignInConfiguredAccount(env, campaignId);
  return meta(env, `${campaignId}/adsets`, {
    fields,
    limit: "100"
  });
}
__name(campaignAdSets, "campaignAdSets");
__name2(campaignAdSets, "campaignAdSets");
__name22(campaignAdSets, "campaignAdSets");
async function citiesFromNames(env, names) {
  const cities = [];
  for (const name of names) {
    const result = await metaObject(env, "search", { type: "adgeolocation", location_types: '["city"]', q: name, country_code: "CO" });
    const options = Array.isArray(result.data) ? result.data : [];
    const match = options.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase()) || options[0];
    if (!match?.key) throw new Error(`CITY_NOT_FOUND:${name}`);
    cities.push({ key: String(match.key), radius: 25, distance_unit: "kilometer" });
  }
  return cities;
}
__name(citiesFromNames, "citiesFromNames");
__name2(citiesFromNames, "citiesFromNames");
__name22(citiesFromNames, "citiesFromNames");
async function handle(request, env, origin, ctx) {
  const auth = await authenticate(request, env);
  if (!auth) return reply({ ok: false, error: "Unauthorized" }, 401, origin);
  if (!auth.grant.permissions.includes("meta_ads.read")) return reply({ ok: false, error: "Forbidden" }, 403, origin);
  const rate = await allowed(env, auth.access.user_id);
  if (!rate.ok) return reply({ ok: false, error: "Rate limit", retry_after: 60 }, 429, origin);
  const url = new URL(request.url);
  if (url.pathname.startsWith("/campaign/")) url.pathname = "/v1" + url.pathname;
  if (url.pathname === "/v1/publisher/options" && request.method === "GET") {
    if (!PUBLISH_PERMISSIONS.every((permission) => auth.grant.permissions.includes(permission))) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    try {
      return reply(await publisherOptions(env, auth.token), 200, origin);
    } catch (error) {
      console.warn("publisher_options_unavailable", error instanceof Error ? error.message : "UNKNOWN");
      return reply({ ok: false, error: "Publisher catalog unavailable" }, 503, origin);
    }
  }
  if (url.pathname === "/v1/publisher/publish" && request.method === "POST") {
    if (!PUBLISH_PERMISSIONS.every((permission) => auth.grant.permissions.includes(permission))) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    const key = request.headers.get("idempotency-key")?.trim() || "";
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) return reply({ ok: false, error: "Invalid idempotency key" }, 400, origin);
    let payload;
    try {
      payload = validatePublishPayload(await request.json());
    } catch (error) {
      return reply({ ok: false, error: error instanceof Error ? error.message : "INVALID_REQUEST" }, error instanceof Error && error.message === "CONFIRMATION_REQUIRED" ? 409 : 400, origin);
    }
    const controlledCampaignId = String(env.META_CONTINUE_CAMPAIGN_ID || "").trim();
    const coordinationKey = controlledCampaignId ? `complete_campaign_${controlledCampaignId}_instagram_assignment_v2` : key;
    const existing = await coordinate(env, coordinationKey, "reserve");
    if (existing.state === "completed") return reply(existing.result, 200, origin);
    if (existing.state !== "reserved") return reply({ ok: false, error: "Publication already in progress" }, 409, origin);
    try {
      const result = controlledCampaignId ? await continueCampaign(env, auth, payload, coordinationKey, controlledCampaignId) : await publishCampaign(env, auth, payload, key);
      await coordinate(env, coordinationKey, "complete", result);
      if (result.meta_ids?.campaign_id) ctx?.waitUntil(campaignThumbnails(env, result.meta_ids.campaign_id, meta, coordinate).catch(() => console.warn("campaign_thumbnail_pending")));
      return reply(result, 201, origin);
    } catch (error) {
      const code = error instanceof Error ? error.message : "META_UPSTREAM";
      const status = code === "META_PERMISSION_DENIED" ? 403 : code === "AUDIT_UNAVAILABLE" ? 503 : 502;
      const incomplete = code.startsWith("META_") && !code.includes("ACTIVATION");
      const failure = {
        ok: false,
        error: code === "META_PERMISSION_DENIED" ? "Meta permissions unavailable" : incomplete ? "PUBLICACI\xD3N INCOMPLETA" : "Publication failed safely",
        reason: code,
        ...error instanceof MetaApiError ? { meta: { ...error.details, stage: error.stage } } : {}
      };
      console.error("publication_failed", JSON.stringify({ reason: code, meta: error instanceof MetaApiError ? error.details : void 0 }));
      await coordinate(env, coordinationKey, "complete", failure);
      return reply(failure, status, origin);
    }
  }
  if (url.pathname === "/v1/campaign/status" && request.method === "POST") {
    if (!auth.grant.permissions.includes("meta_ads.manage")) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    let body;
    try {
      body = await readSmallJson(request);
    } catch (error) {
      return reply({ ok: false, error: error instanceof Error ? error.message : "INVALID_JSON" }, 400, origin);
    }
    const campaignId = validMetaId(body.campaignId);
    const status = String(body.status || "");
    if (!campaignId || !["ACTIVE", "PAUSED"].includes(status)) return reply({ ok: false, error: "campaignId y status (ACTIVE|PAUSED) requeridos" }, 400, origin);
    try {
      await campaignInConfiguredAccount(env, campaignId);
      await audit(env, auth.token, "meta_ads.campaign.status_change", { period: 0 }).catch(() => {
      });
      const result = await metaObject(env, campaignId, { status }, "POST");
      console.info("meta_campaign_status_changed", { campaign_id: campaignId, status, user_id: String(auth.access.user_id || "") });
      return reply({ ok: true, campaignId, newStatus: status, result }, 200, origin);
    } catch (error) {
      console.error("meta_campaign_status_failed", { campaign_id: campaignId, reason: error instanceof Error ? error.message : "UNKNOWN" });
      return reply(operationError(error, "No se pudo cambiar el estado"), 502, origin);
    }
  }
  if (url.pathname === "/v1/campaign/edit" && request.method === "POST") {
    if (!auth.grant.permissions.includes("meta_ads.manage")) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    let body;
    try {
      body = await readSmallJson(request);
    } catch (error) {
      return reply({ ok: false, error: error instanceof Error ? error.message : "INVALID_JSON" }, 400, origin);
    }
    const campaignId = validMetaId(body.campaignId);
    const hasBudget = body.dailyBudget !== void 0 && body.dailyBudget !== null && body.dailyBudget !== "";
    const dailyBudget = hasBudget ? Number(body.dailyBudget) : null;
    const endTime = body.endTime ? String(body.endTime) : "";
    if (!campaignId) return reply({ ok: false, error: "campaignId requerido" }, 400, origin);
    if (!hasBudget && !endTime) return reply({ ok: false, error: "dailyBudget o endTime requerido" }, 400, origin);
    if (hasBudget && (!Number.isInteger(dailyBudget) || dailyBudget < 6e3 || dailyBudget > 1e7)) return reply({ ok: false, error: "dailyBudget inv\xE1lido" }, 400, origin);
    if (endTime && !/^\d{4}-\d{2}-\d{2}$/.test(endTime)) return reply({ ok: false, error: "endTime debe usar YYYY-MM-DD" }, 400, origin);
    try {
      const adSets = await campaignAdSets(env, campaignId, "id,name,daily_budget,end_time,status");
      if (!adSets.length) return reply({ ok: false, error: "No se encontraron ad sets para esta campa\xF1a" }, 404, origin);
      await audit(env, auth.token, "meta_ads.campaign.edit", { period: 0 }).catch(() => {
      });
      const results = [];
      for (const adSet of adSets) {
        const params = {};
        if (hasBudget) params.daily_budget = String(dailyBudget);
        if (endTime) params.end_time = `${endTime}T23:55:00-0500`;
        const result = await metaObject(env, String(adSet.id), params, "POST");
        results.push({ adSetId: String(adSet.id), name: String(adSet.name || ""), result });
      }
      console.info("meta_campaign_edited", { campaign_id: campaignId, adsets_updated: results.length, user_id: String(auth.access.user_id || "") });
      return reply({ ok: true, campaignId, adSetsUpdated: results.length, results }, 200, origin);
    } catch (error) {
      console.error("meta_campaign_edit_failed", { campaign_id: campaignId, reason: error instanceof Error ? error.message : "UNKNOWN" });
      return reply(operationError(error, "No se pudo editar la campa\xF1a"), 502, origin);
    }
  }
  if (url.pathname === "/v1/campaign/targeting" && request.method === "POST") {
    if (!auth.grant.permissions.includes("meta_ads.manage")) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    let body;
    try {
      body = await readSmallJson(request);
    } catch (error) {
      return reply({ ok: false, error: error instanceof Error ? error.message : "INVALID_JSON" }, 400, origin);
    }
    const adSetId = validMetaId(body.adSetId);
    const campaignId = validMetaId(body.campaignId);
    const targeting = body.targeting && typeof body.targeting === "object" && !Array.isArray(body.targeting) ? body.targeting : null;
    const cityNames = Array.isArray(body.cities) ? [...new Set(body.cities.map((value) => String(value).trim()).filter(Boolean))] : [];
    if (!adSetId && !(campaignId && cityNames.length)) return reply({ ok: false, error: "adSetId y targeting, o campaignId y cities, requeridos" }, 400, origin);
    if (adSetId && !targeting) return reply({ ok: false, error: "targeting requerido" }, 400, origin);
    if (cityNames.length > 25 || cityNames.some((name) => name.length > 80)) return reply({ ok: false, error: "Lista de ciudades inv\xE1lida" }, 400, origin);
    if (targeting && JSON.stringify(targeting).length > 2e4) return reply({ ok: false, error: "targeting demasiado grande" }, 400, origin);
    try {
      const updates = [];
      if (adSetId) {
        await adSetInConfiguredAccount(env, adSetId);
        await audit(env, auth.token, "meta_ads.campaign.targeting_edit", { period: 0 }).catch(() => {
        });
        const result = await metaObject(env, adSetId, { targeting: JSON.stringify(targeting) }, "POST");
        updates.push({ adSetId, result });
      } else {
        const adSets = await campaignAdSets(env, campaignId, "id,name,targeting");
        if (!adSets.length) return reply({ ok: false, error: "No se encontraron ad sets para esta campa\xF1a" }, 404, origin);
        const cities = await citiesFromNames(env, cityNames);
        await audit(env, auth.token, "meta_ads.campaign.targeting_edit", { period: 0 }).catch(() => {
        });
        for (const adSet of adSets) {
          const current = adSet.targeting && typeof adSet.targeting === "object" ? structuredClone(adSet.targeting) : {};
          delete current.targeting_automation;
          current.geo_locations = { ...current.geo_locations || {}, cities };
          const result = await metaObject(env, String(adSet.id), { targeting: JSON.stringify(current) }, "POST");
          updates.push({ adSetId: String(adSet.id), result });
        }
      }
      console.info("meta_campaign_targeting_changed", { campaign_id: campaignId || null, adset_id: adSetId || null, updates: updates.length, user_id: String(auth.access.user_id || "") });
      return reply({ ok: true, campaignId: campaignId || void 0, adSetId: adSetId || void 0, adSetsUpdated: updates.length, results: updates }, 200, origin);
    } catch (error) {
      console.error("meta_campaign_targeting_failed", { campaign_id: campaignId || null, adset_id: adSetId || null, reason: error instanceof Error ? error.message : "UNKNOWN" });
      return reply(operationError(error, "No se pudo actualizar targeting"), 502, origin);
    }
  }
  if (url.pathname === "/v1/campaign/duplicate" && request.method === "POST") {
    if (!PUBLISH_PERMISSIONS.every((permission) => auth.grant.permissions.includes(permission))) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    let body;
    try {
      body = await readSmallJson(request);
    } catch (error) {
      return reply({ ok: false, error: error instanceof Error ? error.message : "INVALID_JSON" }, 400, origin);
    }
    const campaignId = validMetaId(body.campaignId);
    const targetCity = String(body.targetCity || "").trim();
    if (!campaignId || !targetCity || targetCity.length > 80) return reply({ ok: false, error: "campaignId y targetCity requeridos" }, 400, origin);
    try {
      await campaignInConfiguredAccount(env, campaignId);
      await audit(env, auth.token, "meta_ads.campaign.duplicate", { period: 0 }).catch(() => {
      });
      const copyResult = await metaObject(env, `${campaignId}/copies`, { deep_copy: "true", status_option: "PAUSED" }, "POST");
      const newCampaignId = validMetaId(copyResult.copied_campaign_id || copyResult.id);
      if (!newCampaignId) return reply({ ok: false, error: "Meta no devolvi\xF3 ID de la campa\xF1a copiada" }, 502, origin);
      await metaObject(env, newCampaignId, { name: `[${targetCity}] Duplicada - ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}` }, "POST");
      console.info("meta_campaign_duplicated", { original_id: campaignId, new_campaign_id: newCampaignId, target_city: targetCity, user_id: String(auth.access.user_id || "") });
      return reply({ ok: true, originalId: campaignId, newCampaignId, targetCity, status: "PAUSED", note: "La campa\xF1a se cre\xF3 PAUSADA. Edita el targeting y act\xEDvala manualmente." }, 201, origin);
    } catch (error) {
      console.error("meta_campaign_duplicate_failed", { campaign_id: campaignId, reason: error instanceof Error ? error.message : "UNKNOWN" });
      return reply(operationError(error, "No se pudo duplicar la campa\xF1a"), 502, origin);
    }
  }
  if (request.method !== "GET") return reply({ ok: false, error: "Method not allowed" }, 405, origin);
  if (url.pathname === "/v1/campaign/thumbnails") {
    const ids = [...new Set((url.searchParams.get("ids") || "").split(","))];
    if (!ids.length || ids.length > 10 || ids.some((id) => !/^\d{1,30}$/.test(id))) return reply({ ok: false, error: "Invalid campaign ids" }, 400, origin);
    try {
      const campaigns = [];
      for (let i = 0; i < ids.length; i += 2) {
        campaigns.push(...await Promise.all(ids.slice(i, i + 2).map((id) => campaignThumbnails(env, id, meta, coordinate))));
      }
      return reply({ ok: true, campaigns }, 200, origin);
    } catch {
      return reply({ ok: false, error: "Miniaturas no disponibles" }, 503, origin);
    }
  }
  if (url.pathname === "/v1/session") return reply({ ok: true, app_id: APP_ID, role_id: auth.grant.role_id, permissions: auth.grant.permissions, mode: "read" }, 200, origin);
  if (url.pathname === "/v1/campaign/targeting") {
    if (!auth.grant.permissions.includes("meta_ads.manage")) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    const campaignId = validMetaId(url.searchParams.get("id"));
    if (!campaignId) return reply({ ok: false, error: "id requerido" }, 400, origin);
    try {
      await audit(env, auth.token, "meta_ads.campaign.targeting_read", { period: 0 }).catch(() => {
      });
      const adSets = await campaignAdSets(env, campaignId, "id,name,targeting{geo_locations{cities,regions,countries,zips}}");
      const targeting = adSets.map((adSet) => ({
        adSetId: String(adSet.id),
        name: String(adSet.name || ""),
        targeting: adSet.targeting && typeof adSet.targeting === "object" ? adSet.targeting : {}
      }));
      const allCities = adSets.flatMap((adSet) => (adSet.targeting?.geo_locations?.cities || []).map((city) => String(city.name || "")).filter(Boolean));
      return reply({ ok: true, campaignId, targeting, cities: [...new Set(allCities)] }, 200, origin);
    } catch (error) {
      return reply(operationError(error, "No se pudo obtener targeting"), 502, origin);
    }
  }
  if (url.pathname === "/v1/campaign/diagnose") {
    if (!auth.grant.permissions.includes("meta_ads.manage")) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    const campaignId = validMetaId(url.searchParams.get("id"));
    if (!campaignId) return reply({ ok: false, error: "id requerido" }, 400, origin);
    try {
      await audit(env, auth.token, "meta_ads.campaign.diagnose", { period: 0 }).catch(() => {
      });
      const [campaign, adSets, ads] = await Promise.all([
        campaignInConfiguredAccount(env, campaignId),
        campaignAdSets(env, campaignId, "id,name,status,effective_status,configured_status,daily_budget,targeting,start_time,end_time"),
        meta(env, `${env.META_AD_ACCOUNT_ID}/ads`, {
          filtering: JSON.stringify([{ field: "campaign_id", operator: "EQUAL", value: campaignId }]),
          fields: "id,name,status,effective_status,configured_status,creative{id,name,status}",
          limit: "100"
        })
      ]);
      const issues = [];
      if (campaign.effective_status !== "ACTIVE") issues.push(`La campa\xF1a tiene status ${campaign.effective_status || campaign.status || "UNKNOWN"}.`);
      for (const adSet of adSets) {
        if (adSet.effective_status !== "ACTIVE") issues.push(`Ad Set "${String(adSet.name || "Sin nombre")}" tiene status ${adSet.effective_status || "UNKNOWN"}.`);
        if (adSet.daily_budget && Number(adSet.daily_budget) < 6e3) issues.push(`Ad Set "${String(adSet.name || "Sin nombre")}" tiene presupuesto inferior al m\xEDnimo operativo configurado.`);
        if (adSet.end_time && new Date(adSet.end_time) < /* @__PURE__ */ new Date()) issues.push(`Ad Set "${String(adSet.name || "Sin nombre")}" ya termin\xF3 (${String(adSet.end_time).slice(0, 10)}).`);
      }
      for (const ad of ads) if (ad.effective_status !== "ACTIVE") issues.push(`Anuncio "${String(ad.name || "Sin nombre")}" tiene status ${ad.effective_status || "UNKNOWN"}.`);
      if (!issues.length) issues.push("No se encontraron problemas evidentes. La campa\xF1a puede estar en aprendizaje o competir con una audiencia limitada.");
      return reply({ ok: true, campaignId, diagnosis: issues.join("\n"), issues, details: { campaign, adSets, ads } }, 200, origin);
    } catch (error) {
      return reply(operationError(error, "No se pudo diagnosticar"), 502, origin);
    }
  }
  if (url.pathname === "/v1/campaign/creative") {
    if (!auth.grant.permissions.includes("meta_ads.manage")) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    const campaignId = validMetaId(url.searchParams.get("id"));
    if (!campaignId) return reply({ ok: false, error: "id requerido" }, 400, origin);
    try {
      await campaignInConfiguredAccount(env, campaignId);
      await audit(env, auth.token, "meta_ads.campaign.creative_read", { period: 0 }).catch(() => {
      });
      const ads = await meta(env, `${env.META_AD_ACCOUNT_ID}/ads`, {
        filtering: JSON.stringify([{ field: "campaign_id", operator: "EQUAL", value: campaignId }]),
        fields: "id,name,creative{id,thumbnail_url,image_url,body,title,link_url}",
        limit: "5"
      });
      const creatives = ads.map((ad) => ({
        adId: String(ad.id),
        adName: String(ad.name || ""),
        imageUrl: ad.creative?.image_url || ad.creative?.thumbnail_url || null,
        body: ad.creative?.body || null,
        title: ad.creative?.title || null,
        linkUrl: ad.creative?.link_url || null
      }));
      return reply({ ok: true, campaignId, creatives, imageUrl: creatives[0]?.imageUrl || null, videoUrl: null }, 200, origin);
    } catch (error) {
      return reply(operationError(error, "No se pudo obtener creativos"), 502, origin);
    }
  }
  if (url.pathname !== "/v1/dashboard") return reply({ ok: false, error: "Not found" }, 404, origin);
  const range = dateRange(url);
  if (!await audit(env, auth.token, "meta_ads.dashboard.read", { period: range.period })) return reply({ ok: false, error: "Audit unavailable" }, 503, origin);
  try {
    return reply(await dashboard(env, url), 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : "META_UPSTREAM";
    if (code === "META_NOT_CONFIGURED") return reply({ ok: false, error: "Meta integration unavailable" }, 503, origin);
    if (code === "META_NOT_FOUND") return reply({ ok: false, error: "Campaign not found" }, 404, origin);
    return reply({ ok: false, error: "Meta service unavailable" }, 502, origin);
  }
}
__name(handle, "handle");
__name2(handle, "handle");
__name22(handle, "handle");
var RateLimiter = class {
  static {
    __name(this, "RateLimiter");
  }
  static {
    __name2(this, "RateLimiter");
  }
  constructor(state) {
    this.state = state;
  }
  state;
  static {
    __name22(this, "RateLimiter");
  }
  async fetch(request) {
    const limit = Math.max(1, number(await request.text()) || 30);
    const bucket = Math.floor(Date.now() / 6e4);
    const stored = await this.state.storage.get("rate");
    const next = stored?.bucket === bucket ? { bucket, count: stored.count + 1 } : { bucket, count: 1 };
    await this.state.storage.put("rate", next);
    return reply({ allowed: next.count <= limit }, next.count <= limit ? 200 : 429);
  }
};
var PublicationCoordinator = class {
  static {
    __name(this, "PublicationCoordinator");
  }
  static {
    __name2(this, "PublicationCoordinator");
  }
  constructor(state) {
    this.state = state;
  }
  state;
  static {
    __name22(this, "PublicationCoordinator");
  }
  async fetch(request) {
    const input = await request.json();
    if (input.action === "thumbnail_get") {
      const manifest = await this.state.storage.get("thumbnail_manifest");
      if (!manifest) return reply({ items: [] });
      const items = [];
      for (const key of manifest.keys) {
        const item = await this.state.storage.get(key);
        if (item) items.push(item);
      }
      return reply({ ...manifest, items });
    }
    if (input.action === "thumbnail_put") {
      const value = input.result;
      if (!value || !Array.isArray(value.items) || value.items.length > 5) return reply({ error: "Invalid thumbnail" }, 400);
      const entries = {};
      for (const item of value.items) {
        if (!/^\d+$/.test(item.creativeId) || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(item.image) || item.image.length > 9e4) return reply({ error: "Invalid thumbnail" }, 400);
        entries["thumbnail:" + item.creativeId] = item;
      }
      entries.thumbnail_manifest = { campaignId: value.campaignId, checkedAt: value.checkedAt, partial: value.partial, stale: value.stale, keys: Object.keys(entries) };
      await this.state.storage.put(entries);
      return reply({ ok: true });
    }
    const stored = await this.state.storage.get("publication");
    if (input.action === "get") return reply(stored || { state: "new" });
    if (input.action === "reserve") {
      if (stored) return reply(stored);
      const reserved = { state: "reserved" };
      await this.state.storage.put("publication", reserved);
      return reply(reserved);
    }
    if (input.action === "complete") {
      const completed = { state: "completed", result: input.result };
      await this.state.storage.put("publication", completed);
      return reply(completed);
    }
    return reply({ state: "invalid" }, 400);
  }
};
var index_default = {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("origin") || void 0;
    const ALLOWED = [env.ALLOWED_ORIGIN, "https://aura.crediteksas.com", "https://registro.crediteksas.com"];
    if (origin && !ALLOWED.includes(origin)) return reply({ ok: false, error: "Origin denied" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, idempotency-key",
      vary: "Origin"
    } });
    if (new URL(request.url).pathname === "/health") return reply({ ok: true, app_id: APP_ID, mode: "read" }, 200, origin);
    return handle(request, env, origin, ctx);
  }
};

// organic-model.mjs
var CHANNELS = ["facebook", "instagram"];
var HOUR = 36e5;
var OrganicError = class extends Error {
  static {
    __name(this, "OrganicError");
  }
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
};
function requireOrganicOwner(auth) {
  if (!auth?.access?.apps?.some((a) => a.role_id === "aura.owner")) throw new OrganicError("OWNER_REQUIRED", 403);
}
__name(requireOrganicOwner, "requireOrganicOwner");
async function digest(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(digest, "digest");
async function boundedBytes(request, limit) {
  if (Number(request.headers.get("content-length")) > limit) throw new OrganicError("BODY_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new OrganicError("BODY_REQUIRED");
  let length = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new OrganicError("BODY_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
__name(boundedBytes, "boundedBytes");
function jpegDimensions(bytes) {
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new OrganicError("JPEG_REQUIRED");
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset++] !== 255) break;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) break;
    const size = bytes[offset] * 256 + bytes[offset + 1];
    if (size < 2 || offset + size > bytes.length) break;
    if ([192, 193, 194].includes(marker)) {
      const height = bytes[offset + 3] * 256 + bytes[offset + 4];
      const width = bytes[offset + 5] * 256 + bytes[offset + 6];
      if (width < 320 || width > 1440 || height < 320 || width / height < 0.8 || width / height > 1.91) throw new OrganicError("FEED_DIMENSIONS_REQUIRED");
      return { width, height };
    }
    offset += size;
  }
  throw new OrganicError("INVALID_JPEG");
}
__name(jpegDimensions, "jpegDimensions");
function contentWarnings(text) {
  const warnings = [];
  if (/aprobaci[oó]n garantizada|te aprobamos|creditek te financia|sin revisar historial/i.test(text)) warnings.push("Promesa de cr\xE9dito no permitida");
  if (/\$\s*\d|\d+\s*%|testimonio|cuotas? desde/i.test(text)) warnings.push("Precio, promoci\xF3n o testimonio requiere respaldo: usar el flujo comercial verificado");
  if (/cr[eé]dito|financi|payjoy|krediya|alo credit|addi/i.test(text) && !/sujeto a aprobaci[oó]n.*t[eé]rminos y condiciones/is.test(text)) warnings.push("Falta aviso de aprobaci\xF3n y t\xE9rminos");
  return warnings;
}
__name(contentWarnings, "contentWarnings");
function validateCalendar(input, now = Date.now()) {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(input?.id || "")) throw new OrganicError("INVALID_CALENDAR_ID");
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 100) throw new OrganicError("INVALID_TITLE");
  if (!Array.isArray(input.pieces) || input.pieces.length < 1 || input.pieces.length > 31) throw new OrganicError("CALENDAR_REQUIRES_1_TO_31_PIECES");
  const ids = /* @__PURE__ */ new Set();
  const pieces = input.pieces.map((p) => {
    if (!/^[\w-]{8,64}$/.test(p?.id || "") || ids.has(p.id)) throw new OrganicError("INVALID_PIECE_ID");
    ids.add(p.id);
    if (p.format !== "image") throw new OrganicError("ONLY_FEED_IMAGES_SUPPORTED");
    if (typeof p.caption !== "string" || !p.caption.trim() || p.caption.length > 2200) throw new OrganicError("INVALID_CAPTION");
    if (typeof p.topic !== "string" || !p.topic.trim() || p.topic.length > 80) throw new OrganicError("INVALID_TOPIC");
    if (p.asset && !/^[a-f0-9]{64}\.jpg$/.test(p.asset)) throw new OrganicError("INVALID_ASSET");
    if (!Array.isArray(p.channels) || !p.channels.length || p.channels.some((c) => !CHANNELS.includes(c)) || new Set(p.channels).size !== p.channels.length) throw new OrganicError("INVALID_CHANNELS");
    const due = Date.parse(p.scheduled_at);
    if (!Number.isFinite(due) || due < now + 5 * 6e4 || due > now + 90 * 24 * HOUR) throw new OrganicError("SCHEDULE_MUST_BE_5_MIN_TO_90_DAYS_AHEAD");
    return { id: p.id, format: "image", topic: p.topic.trim(), caption: p.caption.trim(), asset: p.asset || null, channels: [...p.channels].sort(), scheduled_at: new Date(due).toISOString(), results: {} };
  });
  return { id: input.id, title: input.title.trim(), pieces };
}
__name(validateCalendar, "validateCalendar");
function approvalPayload(calendar) {
  return JSON.stringify({ id: calendar.id, revision: calendar.revision, title: calendar.title, pieces: calendar.pieces.map(({ results, ...p }) => p) });
}
__name(approvalPayload, "approvalPayload");
function hasStarted(calendar) {
  return calendar.pieces.some((p) => Object.values(p.results).some((r) => !["scheduled", "cancelled"].includes(r.status)));
}
__name(hasStarted, "hasStarted");
function learnFromCalendars(calendars) {
  const channels = {};
  for (const channel of CHANNELS) {
    const samples = [];
    for (const c of calendars) for (const p of c.pieces) {
      const r = p.results[channel];
      const s = r?.snapshots?.find((x) => x.age_hours >= 24 && x.age_hours <= 30 && Number.isFinite(x.reach) && x.reach > 0 && Number.isFinite(x.likes));
      if (s) samples.push({ piece_id: p.id, topic: p.topic, hour: new Date(Date.parse(r.published_at) - 5 * HOUR).getUTCHours(), rate: s.likes / s.reach, reach: s.reach });
    }
    const groups = /* @__PURE__ */ new Map();
    for (const s of samples) {
      const a = groups.get(s.topic) || [];
      a.push(s);
      groups.set(s.topic, a);
    }
    const eligible = [...groups].filter(([, rows]) => rows.length >= 3).map(([topic, rows]) => ({ topic, n: rows.length, likes_per_reach: rows.reduce((a, r) => a + r.rate, 0) / rows.length, evidence: rows.map((r) => r.piece_id) })).sort((a, b) => b.likes_per_reach - a.likes_per_reach);
    channels[channel] = { comparable_posts: samples.length, status: samples.length >= 8 && eligible.length >= 2 ? "observational_suggestion" : "insufficient_data", topics: samples.length >= 8 && eligible.length >= 2 ? eligible : [], note: "Comparaci\xF3n exploratoria a las 24\u201330 h. No demuestra causalidad ni garantiza alcance. Conserva variedad y requiere aprobaci\xF3n del pr\xF3ximo calendario." };
  }
  return { channels, leads_attribution: "unavailable", automatic_changes_to_approved_content: false };
}
__name(learnFromCalendars, "learnFromCalendars");

// organic-meta.mjs
var GraphFailure = class extends Error {
  static {
    __name(this, "GraphFailure");
  }
  constructor(status, code, ambiguous = false) {
    super(`META_${status}_${code}`);
    this.ambiguous = ambiguous;
  }
};
async function graph(env, token, path, params = {}, method = "GET") {
  if (!token) throw new OrganicError("META_TOKEN_MISSING", 503);
  if (!/^[\d_]+(?:\/(?:photos|media|media_publish|insights))?$/.test(path) && path !== "me/permissions") throw new OrganicError("GRAPH_PATH_DENIED", 500);
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION || "v25.0"}/${path}`);
  const init = { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2e4), redirect: "manual" };
  if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(params);
  }
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new GraphFailure("NETWORK", "UNKNOWN", method === "POST");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.error) throw new GraphFailure(response.status, data?.error?.code || "INVALID_RESPONSE", method === "POST" && (response.status >= 500 || !data));
  return data;
}
__name(graph, "graph");
async function connection(env) {
  const page = await graph(env, env.META_ACCESS_TOKEN, env.META_PAGE_ID, { fields: "id,name,access_token,instagram_business_account{id,username}" });
  if (String(page.id) !== env.META_PAGE_ID || !page.access_token) throw new OrganicError("PAGE_ACCESS_NOT_CONFIRMED", 503);
  const permissions = await graph(env, env.META_ACCESS_TOKEN, "me/permissions");
  const granted = new Set(permissions.data?.filter((x) => x.status === "granted").map((x) => x.permission));
  const missing = {
    facebook: ["pages_manage_posts", "pages_read_engagement"].filter((x) => !granted.has(x)),
    instagram: ["instagram_basic", "instagram_content_publish", "pages_read_engagement"].filter((x) => !granted.has(x)),
    measurement: ["read_insights", "instagram_manage_insights"].filter((x) => !granted.has(x))
  };
  if (!page.instagram_business_account?.id) missing.instagram.push("INSTAGRAM_PAGE_CONNECTION");
  return { token: page.access_token, page_id: page.id, page_name: page.name, instagram_id: page.instagram_business_account?.id || null, instagram_username: page.instagram_business_account?.username || null, missing };
}
__name(connection, "connection");
function publicConnection(c, env) {
  const { token, ...safe } = c;
  return { ...safe, automation_enabled: env.ORGANIC_AUTOMATION_ENABLED === "true", supported_formats: ["image"], checked_at: (/* @__PURE__ */ new Date()).toISOString() };
}
__name(publicConnection, "publicConnection");
async function verifyPublication(env, c, channel, id) {
  const row = await graph(env, c.token, id, { fields: channel === "facebook" ? "id,is_published,permalink_url" : "id,permalink,media_type" });
  const link = channel === "facebook" ? row.permalink_url : row.permalink;
  const expectedHost = channel === "facebook" ? /^(www\.)?facebook\.com$/ : /^(www\.)?instagram\.com$/;
  if (String(row.id) !== id || !link || channel === "facebook" && row.is_published !== true) throw new OrganicError("PUBLICATION_NOT_YET_VERIFIED", 502);
  const parsed = new URL(link);
  if (parsed.protocol !== "https:" || !expectedHost.test(parsed.hostname)) throw new OrganicError("INVALID_META_PERMALINK", 502);
  return link;
}
__name(verifyPublication, "verifyPublication");
async function metrics(env, c, channel, id, publishedAt, now = Date.now()) {
  const result = { source: "meta", observed_at: new Date(now).toISOString(), age_hours: (now - Date.parse(publishedAt)) / 36e5, reach: null, likes: null, comments: null, shares: null, saved: null, errors: [] };
  const scalar = /* @__PURE__ */ __name((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null, "scalar");
  try {
    const fields = channel === "facebook" ? "reactions.type(LIKE).limit(0).summary(true),comments.limit(0).summary(true),shares" : "like_count,comments_count";
    const row = await graph(env, c.token, id, { fields });
    result.likes = scalar(channel === "facebook" ? row.reactions?.summary?.total_count : row.like_count);
    result.comments = scalar(channel === "facebook" ? row.comments?.summary?.total_count : row.comments_count);
    if (channel === "facebook") result.shares = scalar(row.shares?.count);
  } catch (e) {
    result.errors.push(e.message);
  }
  for (const [name, target] of channel === "facebook" ? [["post_impressions_unique", "reach"]] : [["reach", "reach"], ["saved", "saved"], ["shares", "shares"]]) {
    try {
      const row = await graph(env, c.token, `${id}/insights`, { metric: name });
      const metric = row.data?.find((d) => d.name === name);
      result[target] = scalar(metric?.values?.[0]?.value ?? metric?.total_value?.value);
    } catch (e) {
      result.errors.push(`${name}:${e.message}`);
    }
  }
  return result;
}
__name(metrics, "metrics");

// organic-api.mjs
async function organicApi(request, env, { authenticate: authenticate2, allowed: allowed2, reply: reply2 }, origin) {
  const url = new URL(request.url), path = url.pathname.replace(/^\/v1\/organic/, "");
  try {
    const media = path.match(/^\/media\/([a-f0-9]{64}\.jpg)$/);
    if (request.method === "GET" && media) {
      const object = await env.ORGANIC_MEDIA?.get(media[1]);
      if (!object) return reply2({ error: "NOT_FOUND" }, 404, origin);
      return new Response(object.body, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "access-control-allow-origin": "*" } });
    }
    const auth = await authenticate2(request, env);
    if (!auth) throw new OrganicError("LOGIN_REQUIRED", 401);
    requireOrganicOwner(auth);
    const rate = await allowed2(env, auth.access.user_id);
    if (!rate.ok) throw new OrganicError("RATE_LIMIT", 429);
    if (!env.ORGANIC_CALENDARS || !env.ORGANIC_MEDIA) throw new OrganicError("ORGANIC_BINDINGS_NOT_CONFIGURED", 503);
    const calendar = env.ORGANIC_CALENDARS.getByName(`page:${env.META_PAGE_ID}`);
    if (request.method === "GET" && path === "/connection") return reply2(publicConnection(await connection(env), env), 200, origin);
    if (request.method === "GET" && path === "/calendars") return reply2(await calendar.list(), 200, origin);
    if (request.method === "GET" && path === "/preview") return reply2(await calendar.preview(url.searchParams.get("id")), 200, origin);
    if (request.method === "POST" && path === "/media") {
      const bytes = await boundedBytes(request, 8 * 1024 * 1024);
      const dimensions = jpegDimensions(bytes), hash = await digest(bytes), key = `${hash}.jpg`;
      if (!await env.ORGANIC_MEDIA.head(key)) await env.ORGANIC_MEDIA.put(key, bytes, { sha256: hash, httpMetadata: { contentType: "image/jpeg" } });
      return reply2({ asset: key, url: `${env.ORGANIC_PUBLIC_BASE}/v1/organic/media/${key}`, ...dimensions }, 201, origin);
    }
    if (request.method === "POST" && ["/calendars", "/approve", "/pause"].includes(path)) {
      let input;
      try {
        input = JSON.parse(new TextDecoder().decode(await boundedBytes(request, 128 * 1024)));
      } catch (e) {
        if (e instanceof OrganicError) throw e;
        throw new OrganicError("INVALID_JSON");
      }
      const actor = auth.access.user_id;
      const result = path === "/calendars" ? await calendar.save(input, actor) : path === "/approve" ? await calendar.approve(input, actor) : await calendar.pause(input.id, actor);
      return reply2(result, 200, origin);
    }
    return reply2({ error: "NOT_FOUND" }, 404, origin);
  } catch (error) {
    const code = /^[A-Z_0-9]+$/.test(error.message) ? error.message : "ORGANIC_OPERATION_FAILED";
    const mappedStatus = code === "NOT_FOUND" ? 404 : /CONFLICT|APPROVAL_REQUIRED|REVIEW_REQUIRED|IMMUTABLE|MISSING_.*_PERMISSIONS/.test(code) ? 409 : 503;
    return reply2({ ok: false, error: code }, error.status || mappedStatus, origin);
  }
}
__name(organicApi, "organicApi");

// organic-calendar.mjs
import { DurableObject } from "cloudflare:workers";
var OrganicCalendar = class extends DurableObject {
  static {
    __name(this, "OrganicCalendar");
  }
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS calendars (id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at INTEGER NOT NULL)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS organic_audit (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, calendar_id TEXT NOT NULL, revision INTEGER NOT NULL)");
    });
  }
  #get(id) {
    const row = this.ctx.storage.sql.exec("SELECT document FROM calendars WHERE id = ?", id).toArray()[0];
    return row ? JSON.parse(row.document) : null;
  }
  #put(c, actor, action) {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("INSERT INTO calendars (id, document, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at", c.id, JSON.stringify(c), Date.now());
      if (action) this.ctx.storage.sql.exec("INSERT INTO organic_audit (at, actor, action, calendar_id, revision) VALUES (?, ?, ?, ?, ?)", Date.now(), actor, action, c.id, c.revision);
    });
  }
  async list() {
    const calendars = this.#all();
    return { calendars, learning: learnFromCalendars(calendars) };
  }
  #all() {
    return this.ctx.storage.sql.exec("SELECT document FROM calendars ORDER BY updated_at DESC LIMIT 200").toArray().map((r) => JSON.parse(r.document));
  }
  async save(input, actor) {
    const clean = validateCalendar(input);
    const old = this.#get(clean.id);
    if ((old?.revision || 0) !== input.revision) throw new OrganicError("REVISION_CONFLICT", 409);
    if (old && hasStarted(old)) throw new OrganicError("STARTED_CALENDAR_IS_IMMUTABLE", 409);
    if (!old && this.#all().length >= 200) throw new OrganicError("CALENDAR_LIMIT_REQUIRES_ARCHIVING", 409);
    const c = { ...clean, revision: (old?.revision || 0) + 1, approval: null, state: "draft", created_at: old?.created_at || (/* @__PURE__ */ new Date()).toISOString(), updated_by: actor };
    this.#put(c, actor, "saved_approval_invalidated");
    await this.#schedule();
    return { ...c, approval_digest: await digest(approvalPayload(c)) };
  }
  async preview(id) {
    const c = this.#get(id);
    if (!c) throw new OrganicError("NOT_FOUND", 404);
    return { ...c, approval_digest: await digest(approvalPayload(c)) };
  }
  async approve(input, actor) {
    if (this.env.ORGANIC_AUTOMATION_ENABLED !== "true") throw new OrganicError("AUTOMATION_NOT_ENABLED", 503);
    const c = this.#get(input.id);
    if (!c || c.revision !== input.revision || !["draft", "paused"].includes(c.state) || hasStarted(c)) throw new OrganicError("REVISION_CONFLICT", 409);
    const expected = await digest(approvalPayload(c));
    if (input.confirm !== "APPROVE_CALENDAR_AND_SCHEDULE" || input.digest !== expected) throw new OrganicError("EXACT_CALENDAR_APPROVAL_REQUIRED", 409);
    validateCalendar(c);
    for (const p of c.pieces) {
      if (!p.asset || contentWarnings(p.caption).length) throw new OrganicError("CONTENT_REVIEW_REQUIRED", 409);
      if (!await this.env.ORGANIC_MEDIA.head(p.asset)) throw new OrganicError("IMAGE_MISSING", 409);
    }
    const conn = await connection(this.env);
    for (const channel of new Set(c.pieces.flatMap((p) => p.channels))) if (conn.missing[channel].length) throw new OrganicError(`MISSING_${channel.toUpperCase()}_PERMISSIONS`, 409);
    const current = this.#get(input.id);
    if (current.revision !== c.revision || current.state !== c.state || current.approval) throw new OrganicError("REVISION_CONFLICT", 409);
    c.approval = { digest: expected, by: actor, at: (/* @__PURE__ */ new Date()).toISOString(), page_id: conn.page_id, instagram_id: conn.instagram_id, scope: "exact_calendar_automatic_schedule" };
    c.state = "approved";
    for (const p of c.pieces) for (const channel of p.channels) p.results[channel] = { status: "scheduled", due: Date.parse(p.scheduled_at) };
    this.#put(c, actor, "calendar_approved_and_scheduled");
    await this.#schedule();
    return c;
  }
  async pause(id, actor) {
    const c = this.#get(id);
    if (!c) throw new OrganicError("NOT_FOUND", 404);
    for (const p of c.pieces) for (const r of Object.values(p.results)) if (["scheduled", "preparing", "container_ready"].includes(r.status)) r.status = "cancelled";
    c.state = "paused";
    c.approval = null;
    this.#put(c, actor, "paused_pending_only");
    await this.#schedule();
    return { calendar: c, note: "No elimina publicaciones existentes ni puede retirar una petici\xF3n ya enviada a Meta." };
  }
  #update(id, pieceId, channel, mutate) {
    const c = this.#get(id), p = c?.pieces.find((p2) => p2.id === pieceId);
    if (!p?.results[channel]) return;
    mutate(p.results[channel], c, p);
    this.#put(c, "scheduler", null);
  }
  async #schedule() {
    const times = [];
    for (const c of this.#all()) for (const p of c.pieces) for (const r of Object.values(p.results)) {
      if (["scheduled", "container_ready", "accepted"].includes(r.status)) times.push(r.due);
      if (["preparing", "creating", "sending"].includes(r.status)) times.push(r.lease_until);
      if (r.status === "published" && r.next_metrics) times.push(r.next_metrics);
    }
    const valid = times.filter(Number.isFinite);
    if (valid.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1e3, Math.min(...valid)));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    await this.ctx.storage.setAlarm(Date.now() + 6e4);
    let count = 0;
    for (const c of this.#all()) for (const p of c.pieces) for (const channel of p.channels) {
      const r = p.results[channel];
      if (!r) continue;
      if (["preparing", "creating", "sending"].includes(r.status) && r.lease_until <= Date.now()) {
        this.#update(c.id, p.id, channel, (live) => {
          live.status = r.status === "preparing" ? "blocked" : "uncertain";
          live.error = "INTERRUPTED_REVIEW_REQUIRED_NO_AUTOMATIC_RESEND";
        });
      }
      if (count >= 4) continue;
      if (["scheduled", "container_ready", "accepted"].includes(r.status) && r.due <= Date.now()) {
        count++;
        await this.#process(c.id, p.id, channel);
      } else if (r.status === "published" && r.next_metrics && r.next_metrics <= Date.now()) {
        count++;
        await this.#measure(c.id, p.id, channel);
      }
    }
    await this.#schedule();
  }
  async #process(id, pieceId, channel) {
    let c = this.#get(id), p = c.pieces.find((p2) => p2.id === pieceId), r = p.results[channel];
    const initial = r.status;
    if (!["scheduled", "container_ready", "accepted"].includes(initial)) return;
    if (initial !== "accepted") {
      if (!c.approval || c.state !== "approved" || this.env.ORGANIC_AUTOMATION_ENABLED !== "true") {
        this.#update(id, pieceId, channel, (x) => {
          x.status = "blocked";
          x.error = "APPROVAL_OR_AUTOMATION_DISABLED";
        });
        return;
      }
      if (Date.now() - Date.parse(p.scheduled_at) > HOUR) {
        this.#update(id, pieceId, channel, (x) => {
          x.status = "blocked";
          x.error = "MISSED_SLOT_REVIEW_REQUIRED";
        });
        return;
      }
      r.status = "preparing";
      r.lease_until = Date.now() + 12e4;
      this.#put(c, "scheduler", "preflight_started");
    }
    try {
      const conn = await connection(this.env);
      c = this.#get(id);
      p = c.pieces.find((p2) => p2.id === pieceId);
      r = p.results[channel];
      if (initial !== "accepted" && (r.status !== "preparing" || !c.approval)) return;
      if (initial !== "accepted" && (String(conn.page_id) !== String(c.approval.page_id) || String(conn.instagram_id) !== String(c.approval.instagram_id))) throw new OrganicError("DESTINATION_CHANGED");
      if (initial === "accepted") {
        await this.#verify(id, pieceId, channel, conn);
        return;
      }
      if (conn.missing[channel].length) throw new OrganicError("META_PERMISSION_MISSING");
      if (!await this.env.ORGANIC_MEDIA.head(p.asset)) throw new OrganicError("IMAGE_MISSING");
      c = this.#get(id);
      p = c.pieces.find((p2) => p2.id === pieceId);
      r = p.results[channel];
      if (!c.approval || r.status !== "preparing") return;
      const imageUrl = `${this.env.ORGANIC_PUBLIC_BASE}/v1/organic/media/${p.asset}`;
      if (channel === "instagram" && !r.container_id) {
        r.status = "creating";
        this.#put(c, "scheduler", "instagram_container_requested");
        const body = await graph(this.env, conn.token, `${conn.instagram_id}/media`, { image_url: imageUrl, caption: p.caption }, "POST");
        if (!/^\d+$/.test(String(body.id))) throw new OrganicError("META_CONTAINER_ID_MISSING");
        this.#update(id, pieceId, channel, (x, live) => {
          x.container_id = String(body.id);
          x.status = live.approval ? "container_ready" : "cancelled";
          x.due = Date.now() + 6e4;
        });
        return;
      }
      if (channel === "instagram") {
        const container = await graph(this.env, conn.token, r.container_id, { fields: "status_code" });
        c = this.#get(id);
        p = c.pieces.find((p2) => p2.id === pieceId);
        r = p.results[channel];
        if (!c.approval || r.status !== "preparing") return;
        if (container.status_code !== "FINISHED") {
          if (container.status_code === "IN_PROGRESS" && (r.polls || 0) < 10) {
            r.polls = (r.polls || 0) + 1;
            r.status = "container_ready";
            r.due = Date.now() + 6e4;
            this.#put(c);
            return;
          }
          throw new OrganicError("INSTAGRAM_CONTAINER_NOT_READY");
        }
      }
      r.status = "sending";
      r.lease_until = Date.now() + 12e4;
      this.#put(c, "scheduler", `${channel}_publish_requested`);
      const sent = channel === "facebook" ? await graph(this.env, conn.token, `${conn.page_id}/photos`, { url: imageUrl, caption: p.caption, published: "true" }, "POST") : await graph(this.env, conn.token, `${conn.instagram_id}/media_publish`, { creation_id: r.container_id }, "POST");
      const publishedId = String(channel === "facebook" ? sent.post_id || "" : sent.id || "");
      if (!/^[\d_]+$/.test(publishedId)) throw new OrganicError("META_POST_ID_MISSING");
      this.#update(id, pieceId, channel, (x) => {
        x.id = publishedId;
        x.status = "accepted";
        x.accepted_at = (/* @__PURE__ */ new Date()).toISOString();
        x.due = Date.now() + 6e4;
      });
      await this.#verify(id, pieceId, channel, conn);
    } catch (error) {
      this.#update(id, pieceId, channel, (x) => {
        if (x.status === "cancelled") return;
        if (x.status === "accepted") {
          x.verify_attempts = (x.verify_attempts || 0) + 1;
          x.due = Date.now() + 5 * 6e4;
          if (x.verify_attempts >= 6) x.status = "needs_verification";
        } else x.status = ["sending", "creating"].includes(x.status) ? error.ambiguous !== false ? "uncertain" : "failed" : "blocked";
        x.error = /^(META_|[A-Z_]+$)/.test(error.message) ? error.message.slice(0, 120) : "UNEXPECTED_FAILURE_REVIEW_REQUIRED";
      });
    }
  }
  async #verify(id, pieceId, channel, conn) {
    const r = this.#get(id).pieces.find((p) => p.id === pieceId).results[channel];
    const permalink = await verifyPublication(this.env, conn, channel, r.id);
    this.#update(id, pieceId, channel, (x) => {
      x.status = "published";
      x.permalink = permalink;
      x.published_at = x.accepted_at;
      x.error = null;
      x.next_metrics = Date.parse(x.published_at) + 24 * HOUR;
      x.snapshots = [];
    });
  }
  async #measure(id, pieceId, channel) {
    const r = this.#get(id).pieces.find((p) => p.id === pieceId).results[channel];
    this.#update(id, pieceId, channel, (x) => {
      x.next_metrics = Date.now() + 6 * HOUR;
    });
    try {
      const conn = await connection(this.env);
      const snapshot = await metrics(this.env, conn, channel, r.id, r.published_at);
      this.#update(id, pieceId, channel, (x) => {
        x.snapshots = [...x.snapshots || [], snapshot].slice(-40);
        x.metrics_error = null;
        x.next_metrics = snapshot.age_hours < 30 ? Date.parse(x.published_at) + 72 * HOUR : snapshot.age_hours < 72 ? Date.parse(x.published_at) + 72 * HOUR : snapshot.age_hours < 168 ? Date.parse(x.published_at) + 168 * HOUR : null;
      });
    } catch {
      this.#update(id, pieceId, channel, (x) => {
        x.metrics_error = "META_METRICS_UNAVAILABLE";
        x.metrics_attempts = (x.metrics_attempts || 0) + 1;
        if (x.metrics_attempts >= 4) x.next_metrics = null;
      });
    }
  }
};

// organic-entry.mjs
var organic_entry_default = {
  fetch(request, env, ctx) {
    if (!new URL(request.url).pathname.startsWith("/v1/organic/")) return index_default.fetch(request, env, ctx);
    const origin = request.headers.get("origin");
    if (origin && origin !== env.ALLOWED_ORIGIN) return reply({ error: "ORIGIN_DENIED" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": origin || env.ALLOWED_ORIGIN, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "vary": "Origin" } });
    return organicApi(request, env, { authenticate, allowed, reply }, origin);
  }
};
export {
  OrganicCalendar,
  PublicationCoordinator,
  RateLimiter,
  organic_entry_default as default
};
//# sourceMappingURL=organic-entry.js.map
