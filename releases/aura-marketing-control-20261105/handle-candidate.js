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
  const requestedContract = url.searchParams.get("contract");
  if (requestedContract !== null && requestedContract !== "2") return reply({ ok: false, error: "Unsupported contract" }, 400, origin);
  if (requestedContract === "2" && request.method !== "GET") return reply({ ok: false, error: "Method not allowed" }, 405, origin);
  if (requestedContract === "2" && !["7", "14", "30"].includes(url.searchParams.get("period") ?? "7")) return reply({ ok: false, error: "Invalid period" }, 400, origin);
  const range = dateRange(url);
  if (!await audit(env, auth.token, "meta_ads.dashboard.read", { period: range.period })) return reply({ ok: false, error: "Audit unavailable" }, 503, origin);
  try {
    return reply(requestedContract === "2" ? await readDashboardV2({ env, period: Number(url.searchParams.get("period") ?? "7") }) : await dashboard(env, url), 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : "META_UPSTREAM";
    if (code === "META_NOT_CONFIGURED") return reply({ ok: false, error: "Meta integration unavailable" }, 503, origin);
    if (code === "META_NOT_FOUND") return reply({ ok: false, error: "Campaign not found" }, 404, origin);
    return reply({ ok: false, error: "Meta service unavailable" }, 502, origin);
  }
}