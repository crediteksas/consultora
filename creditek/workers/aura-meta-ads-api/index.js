var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
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
var MetaApiError = class extends Error {
  constructor(stage, details) {
    super(stage);
    this.stage = stage;
    this.details = details;
    this.name = "MetaApiError";
  }
  stage;
  details;
  static {
    __name(this, "MetaApiError");
  }
};
var number = /* @__PURE__ */ __name((value) => Number.isFinite(Number(value)) ? Number(value) : 0, "number");
var actionValue = /* @__PURE__ */ __name((row, names) => {
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
async function supabase(env, path, token, body) {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    method: body === void 0 ? "GET" : "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, ...body === void 0 ? {} : { "content-type": "application/json" } },
    ...body === void 0 ? {} : { body: JSON.stringify(body) }
  });
}
__name(supabase, "supabase");
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
async function audit(env, token, action, metadata) {
  const result = await supabase(env, "/rest/v1/rpc/aura_meta_ads_record_action", token, {
    p_action: action,
    p_period: number(metadata.period)
  });
  return result.ok;
}
__name(audit, "audit");
async function allowed(env, userId) {
  const id = env.RATE_LIMITER.idFromName(userId);
  const response = await env.RATE_LIMITER.get(id).fetch("https://rate-limit/check", {
    method: "POST",
    body: String(Math.max(1, number(env.RATE_LIMIT_PER_MINUTE) || 30))
  });
  return response;
}
__name(allowed, "allowed");
function dateRange(url) {
  const period = Math.min(90, Math.max(1, number(url.searchParams.get("period")) || 7));
  const until = /* @__PURE__ */ new Date();
  const since = new Date(until);
  since.setUTCDate(until.getUTCDate() - period + 1);
  return { period, since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}
__name(dateRange, "dateRange");
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
    const safeDetail = /* @__PURE__ */ __name((value) => JSON.stringify(value ?? null).replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]").slice(0, 800), "safeDetail");
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
async function supabaseRows(env, path, token) {
  const response = await supabase(env, path, token);
  if (!response.ok) throw new Error("CATALOG_UNAVAILABLE");
  return await response.json();
}
__name(supabaseRows, "supabaseRows");
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
async function verifyMetaApp(env) {
  const result = await metaObject(env, "debug_token", { input_token: env.META_ACCESS_TOKEN });
  const data = result.data || {};
  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : [];
  console.warn("meta_token_scopes_verified", { scopes: scopes.sort() });
  if (!/^\d+$/.test(String(data.app_id || "")) || data.is_valid !== true || !scopes.includes("ads_management")) throw new Error("META_PERMISSION_DENIED");
}
__name(verifyMetaApp, "verifyMetaApp");
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
function assertCompleteMetaIds(metaIds, comparison) {
  const required = comparison ? ["campaign_id", "adset_id", "creative_a_id", "creative_b_id", "ad_a_id", "ad_b_id"] : ["campaign_id", "adset_id", "creative_a_id", "ad_a_id"];
  if (required.some((key) => {
    const value = String(metaIds[key] || "").trim();
    return !value || value === "null" || value === "undefined";
  })) throw new Error("META_PUBLICATION_INCOMPLETE");
}
__name(assertCompleteMetaIds, "assertCompleteMetaIds");
async function approvedCreative(env, token, payload) {
  if (payload.piece_id === "manual") return;
  const pieces = await supabaseRows(env, "/rest/v1/rpc/aura_meta_ads_ready_pieces", token);
  const piece = pieces.find((item) => String(item.id) === String(payload.piece_id));
  if (!piece || String(piece.estado) !== "lista_para_publicar" || String(piece.copy || "") !== String(payload.copy || "") || String(piece.headline || "") !== String(payload.headline || "") || String(piece.imagen_url || "") !== String(payload.image_url || "")) throw new Error("CREATIVE_NOT_APPROVED");
}
__name(approvedCreative, "approvedCreative");
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
function adsetPayload(payload, name, campaignId, cities) {
  const budget = payload.budget_type === "lifetime" ? { lifetime_budget: String(payload.budget_cop) } : { daily_budget: String(payload.budget_cop) };
  return {
    name: `${name} \xB7 conjunto`,
    campaign_id: campaignId,
    ...budget,
    start_time: `${payload.start_date}T00:05:00-0500`,
    end_time: `${payload.end_date}T23:55:00-0500`,
    billing_event: "IMPRESSIONS",
    optimization_goal: payload.objective === "OUTCOME_AWARENESS" ? "REACH" : "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: JSON.stringify({ geo_locations: { cities }, publisher_platforms: payload.platforms }),
    status: "PAUSED"
  };
}
__name(adsetPayload, "adsetPayload");
async function publicationStep(code, operation, variant) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MetaApiError) throw new MetaApiError(code, { ...error.details, ...variant ? { variant } : {} });
    throw new Error(code);
  }
}
__name(publicationStep, "publicationStep");
function campaignPayload(payload, name) {
  const objective = String(payload.objective);
  if (!OBJECTIVES.includes(objective)) throw new Error("INVALID_CAMPAIGN_OBJECTIVE");
  return { name, objective, buying_type: "AUCTION", status: "PAUSED", special_ad_categories: "[]", is_adset_budget_sharing_enabled: "false" };
}
__name(campaignPayload, "campaignPayload");
function requireMetaId(value, code) {
  const id = String(value?.id || "").trim();
  if (!id || id === "undefined" || id === "null") throw new Error(code);
  return id;
}
__name(requireMetaId, "requireMetaId");
async function rollbackCreatedObjects(env, created) {
  for (const id of [...new Set(created)].reverse()) {
    await metaObject(env, id, { status: "PAUSED" }, "POST").catch(() => void 0);
  }
}
__name(rollbackCreatedObjects, "rollbackCreatedObjects");
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
  const instagram = await publicationStep("META_INSTAGRAM_ACTOR_RESOLUTION_FAILED", () => resolveInstagramActor(env));
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
  const adset = await publicationStep("META_ADSET_CREATE_FAILED", () => metaObject(env, `${env.META_AD_ACCOUNT_ID}/adsets`, adsetPayload(payload, name, campaignId, cities), "POST"));
  const adsetId = await publicationStep("META_ADSET_INVALID_RESPONSE", async () => requireMetaId(adset, "META_ADSET_INVALID_RESPONSE"));
  created.push(adsetId);
  const variantIds = [];
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const label = variants.length === 2 ? `VARIANTE ${index === 0 ? "A" : "B"}` : "";
    const image = images[index];
    const linkData = { message: variant.copy, link: destination, name: variant.headline, ...image, call_to_action: { type: variant.cta, value: { link: destination } } };
    const story = { page_id: env.META_PAGE_ID, instagram_actor_id: instagram.actor_id, link_data: linkData };
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
async function coordinate(env, key, action, result) {
  const stub = env.PUBLISH_COORDINATOR.get(env.PUBLISH_COORDINATOR.idFromName(key));
  const response = await stub.fetch("https://publish-lock/state", { method: "POST", body: JSON.stringify({ action, result }) });
  return await response.json();
}
__name(coordinate, "coordinate");
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
  const metrics = normalizeMetrics(insights[0] || {});
  const weeklyMetrics = normalizeMetrics(weekly[0] || {});
  const monthlyMetrics = normalizeMetrics(monthly[0] || {});
  const weeklyBudget = normalized.filter((item) => item.status === "ACTIVE").reduce((sum, item) => sum + item.daily_budget * 7, 0);
  const alerts = [];
  if (metrics.frequency > 3.5) alerts.push({ type: "fatigue", message: "Frecuencia alta: posible fatiga publicitaria." });
  if (weeklyBudget && weeklyMetrics.spend > weeklyBudget) alerts.push({ type: "overdelivery", message: "El gasto semanal supera el presupuesto activo calculado." });
  return {
    ok: true,
    mode: "read",
    source: "meta",
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    range,
    metrics: { ...metrics, spend_weekly: weeklyMetrics.spend, spend_monthly: monthlyMetrics.spend, budget_weekly: weeklyBudget },
    campaigns: normalized,
    trends: trends.map((item) => ({ date: item.date_start || item.date_stop || null, ...normalizeMetrics(item) })),
    comparisons: [],
    attribution: { status: "unavailable", sales: null, campaigns_without_attribution: normalized.length },
    filters: { municipality: "metadata_pending", platform: "metadata_pending", origin: "metadata_pending", period: range.period },
    alerts
  };
}
__name(dashboard, "dashboard");
function validMetaId(value) {
  const id = String(value || "").trim();
  return /^\d{5,32}$/.test(id) ? id : "";
}
__name(validMetaId, "validMetaId");
function configuredAccountId(env) {
  return String(env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
}
__name(configuredAccountId, "configuredAccountId");
async function readSmallJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 32768) throw new Error("REQUEST_TOO_LARGE");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_JSON");
  return body;
}
__name(readSmallJson, "readSmallJson");
function operationError(error, fallback) {
  if (error instanceof MetaApiError) return { ok: false, error: fallback, detail: error.details };
  const detail = error instanceof Error ? error.message : "UNKNOWN";
  return { ok: false, error: fallback, detail: String(detail).slice(0, 240) };
}
__name(operationError, "operationError");
async function campaignInConfiguredAccount(env, campaignId) {
  const campaign = await metaObject(env, campaignId, { fields: "id,account_id,name,status,effective_status" });
  if (String(campaign.id) !== campaignId || String(campaign.account_id).replace(/^act_/, "") !== configuredAccountId(env)) throw new Error("CAMPAIGN_NOT_IN_ACCOUNT");
  return campaign;
}
__name(campaignInConfiguredAccount, "campaignInConfiguredAccount");
async function adSetInConfiguredAccount(env, adSetId) {
  const adSet = await metaObject(env, adSetId, { fields: "id,account_id,campaign_id,name,targeting" });
  if (String(adSet.id) !== adSetId || String(adSet.account_id).replace(/^act_/, "") !== configuredAccountId(env)) throw new Error("ADSET_NOT_IN_ACCOUNT");
  return adSet;
}
__name(adSetInConfiguredAccount, "adSetInConfiguredAccount");
async function campaignAdSets(env, campaignId, fields) {
  await campaignInConfiguredAccount(env, campaignId);
  return meta(env, `${campaignId}/adsets`, {
    fields,
    limit: "100"
  });
}
__name(campaignAdSets, "campaignAdSets");
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
async function handle(request, env, origin) {
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
      await audit(env, auth.token, "meta_ads.campaign.status_change", { period: 0 }).catch(() => {});
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
    if (hasBudget && (!Number.isInteger(dailyBudget) || dailyBudget < 6e3 || dailyBudget > 1e7)) return reply({ ok: false, error: "dailyBudget inválido" }, 400, origin);
    if (endTime && !/^\d{4}-\d{2}-\d{2}$/.test(endTime)) return reply({ ok: false, error: "endTime debe usar YYYY-MM-DD" }, 400, origin);
    try {
      const adSets = await campaignAdSets(env, campaignId, "id,name,daily_budget,end_time,status");
      if (!adSets.length) return reply({ ok: false, error: "No se encontraron ad sets para esta campaña" }, 404, origin);
      await audit(env, auth.token, "meta_ads.campaign.edit", { period: 0 }).catch(() => {});
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
      return reply(operationError(error, "No se pudo editar la campaña"), 502, origin);
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
    if (cityNames.length > 25 || cityNames.some((name) => name.length > 80)) return reply({ ok: false, error: "Lista de ciudades inválida" }, 400, origin);
    if (targeting && JSON.stringify(targeting).length > 2e4) return reply({ ok: false, error: "targeting demasiado grande" }, 400, origin);
    try {
      const updates = [];
      if (adSetId) {
        await adSetInConfiguredAccount(env, adSetId);
        await audit(env, auth.token, "meta_ads.campaign.targeting_edit", { period: 0 }).catch(() => {});
        const result = await metaObject(env, adSetId, { targeting: JSON.stringify(targeting) }, "POST");
        updates.push({ adSetId, result });
      } else {
        const adSets = await campaignAdSets(env, campaignId, "id,name,targeting");
        if (!adSets.length) return reply({ ok: false, error: "No se encontraron ad sets para esta campaña" }, 404, origin);
        const cities = await citiesFromNames(env, cityNames);
        await audit(env, auth.token, "meta_ads.campaign.targeting_edit", { period: 0 }).catch(() => {});
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
      await audit(env, auth.token, "meta_ads.campaign.duplicate", { period: 0 }).catch(() => {});
      const copyResult = await metaObject(env, `${campaignId}/copies`, { deep_copy: "true", status_option: "PAUSED" }, "POST");
      const newCampaignId = validMetaId(copyResult.copied_campaign_id || copyResult.id);
      if (!newCampaignId) return reply({ ok: false, error: "Meta no devolvió ID de la campaña copiada" }, 502, origin);
      await metaObject(env, newCampaignId, { name: `[${targetCity}] Duplicada - ${new Date().toISOString().slice(0, 10)}` }, "POST");
      console.info("meta_campaign_duplicated", { original_id: campaignId, new_campaign_id: newCampaignId, target_city: targetCity, user_id: String(auth.access.user_id || "") });
      return reply({ ok: true, originalId: campaignId, newCampaignId, targetCity, status: "PAUSED", note: "La campaña se creó PAUSADA. Edita el targeting y actívala manualmente." }, 201, origin);
    } catch (error) {
      console.error("meta_campaign_duplicate_failed", { campaign_id: campaignId, reason: error instanceof Error ? error.message : "UNKNOWN" });
      return reply(operationError(error, "No se pudo duplicar la campaña"), 502, origin);
    }
  }
  if (request.method !== "GET") return reply({ ok: false, error: "Method not allowed" }, 405, origin);
  if (url.pathname === "/v1/session") return reply({ ok: true, app_id: APP_ID, role_id: auth.grant.role_id, permissions: auth.grant.permissions, mode: "read" }, 200, origin);
  if (url.pathname === "/v1/campaign/targeting") {
    if (!auth.grant.permissions.includes("meta_ads.manage")) return reply({ ok: false, error: "Forbidden" }, 403, origin);
    const campaignId = validMetaId(url.searchParams.get("id"));
    if (!campaignId) return reply({ ok: false, error: "id requerido" }, 400, origin);
    try {
      await audit(env, auth.token, "meta_ads.campaign.targeting_read", { period: 0 }).catch(() => {});
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
      await audit(env, auth.token, "meta_ads.campaign.diagnose", { period: 0 }).catch(() => {});
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
      if (campaign.effective_status !== "ACTIVE") issues.push(`La campaña tiene status ${campaign.effective_status || campaign.status || "UNKNOWN"}.`);
      for (const adSet of adSets) {
        if (adSet.effective_status !== "ACTIVE") issues.push(`Ad Set "${String(adSet.name || "Sin nombre")}" tiene status ${adSet.effective_status || "UNKNOWN"}.`);
        if (adSet.daily_budget && Number(adSet.daily_budget) < 6e3) issues.push(`Ad Set "${String(adSet.name || "Sin nombre")}" tiene presupuesto inferior al mínimo operativo configurado.`);
        if (adSet.end_time && new Date(adSet.end_time) < new Date()) issues.push(`Ad Set "${String(adSet.name || "Sin nombre")}" ya terminó (${String(adSet.end_time).slice(0, 10)}).`);
      }
      for (const ad of ads) if (ad.effective_status !== "ACTIVE") issues.push(`Anuncio "${String(ad.name || "Sin nombre")}" tiene status ${ad.effective_status || "UNKNOWN"}.`);
      if (!issues.length) issues.push("No se encontraron problemas evidentes. La campaña puede estar en aprendizaje o competir con una audiencia limitada.");
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
      await audit(env, auth.token, "meta_ads.campaign.creative_read", { period: 0 }).catch(() => {});
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
var RateLimiter = class {
  constructor(state) {
    this.state = state;
  }
  state;
  static {
    __name(this, "RateLimiter");
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
  constructor(state) {
    this.state = state;
  }
  state;
  static {
    __name(this, "PublicationCoordinator");
  }
  async fetch(request) {
    const input = await request.json();
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
  async fetch(request, env) {
    const origin = request.headers.get("origin") || void 0;
    const ALLOWED = [env.ALLOWED_ORIGIN, "https://aura.crediteksas.com", "https://registro.crediteksas.com"]; if (origin && !ALLOWED.includes(origin)) return reply({ ok: false, error: "Origin denied" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, idempotency-key",
      vary: "Origin"
    } });
    if (new URL(request.url).pathname === "/health") return reply({ ok: true, app_id: APP_ID, mode: "read" }, 200, origin);
    return handle(request, env, origin);
  }
};
export {
  PublicationCoordinator,
  RateLimiter,
  index_default as default
};
//# sourceMappingURL=index.js.map
