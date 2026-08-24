var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1e3;
var ALLOWED_ORIGINS = [
  "https://aura.crediteksas.com",
  "https://registro.crediteksas.com"
];
var CLIENTES_SERVICE_URL = "https://creditek-clientes.internal/internal/kpis/inscritos";
function validarInscritos(value) {
  if (!value || typeof value !== "object") throw new Error("invalid clients aggregate");
  const candidate = value;
  if (!Number.isInteger(candidate.hoy) || !Number.isInteger(candidate.mes) || candidate.hoy < 0 || candidate.mes < 0 || candidate.timezone !== "America/Bogota") {
    throw new Error("invalid clients aggregate");
  }
  return { hoy: candidate.hoy, mes: candidate.mes, timezone: "America/Bogota" };
}
__name(validarInscritos, "validarInscritos");
function validarConteoRpc(value) {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error("invalid leads aggregate");
    return validarConteoRpc(value[0]);
  }
  if (value !== null && typeof value === "object") {
    const candidate = value;
    if (!Object.prototype.hasOwnProperty.call(candidate, "aura_leads_enviados_count")) {
      throw new Error("invalid leads aggregate");
    }
    return validarConteoRpc(candidate.aura_leads_enviados_count);
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("invalid leads aggregate");
  }
  return value;
}
__name(validarConteoRpc, "validarConteoRpc");
function respuestaKpis(inscritos, leads, generatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    schema_version: 1,
    timezone: "America/Bogota",
    generated_at: generatedAt,
    clientes_inscritos: { hoy: inscritos.hoy, mes: inscritos.mes, source: "solicitudes.created_at" },
    leads_enviados: leads
  };
}
__name(respuestaKpis, "respuestaKpis");
function periodoBogota(now = /* @__PURE__ */ new Date()) {
  const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  const hoy = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const mes = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1));
  const siguienteMes = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1));
  const utc = /* @__PURE__ */ __name((date) => new Date(date.getTime() - BOGOTA_OFFSET_MS).toISOString(), "utc");
  return { hoyInicio: utc(hoy), manana: utc(new Date(hoy.getTime() + 864e5)), mesInicio: utc(mes), mesFin: utc(siguienteMes) };
}
__name(periodoBogota, "periodoBogota");
function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
__name(unauthorized, "unauthorized");
function forbidden() {
  return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
__name(forbidden, "forbidden");
function withCors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
__name(withCors, "withCors");
function preflight(origin) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(null, { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin" } });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Cache-Control": "no-store",
      Vary: "Origin"
    }
  });
}
__name(preflight, "preflight");
function decodePart(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(decodePart, "decodePart");
function toArrayBuffer(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
__name(toArrayBuffer, "toArrayBuffer");
async function autorizarOwner(request, env, fetcher = fetch) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return "unauthorized";
  const token = authorization.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return "unauthorized";
  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(decodePart(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
  } catch {
    return "unauthorized";
  }
  const audienceOk = claims.aud === "authenticated" || Array.isArray(claims.aud) && claims.aud.includes("authenticated");
  if (header.alg !== "ES256" || !header.kid || !audienceOk || claims.iss !== `${env.SUPABASE_URL}/auth/v1` || !claims.exp || claims.exp <= Math.floor(Date.now() / 1e3) || !claims.sub) return "unauthorized";
  try {
    const jwksResponse = await fetcher(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`, { headers: { Accept: "application/json" } });
    if (!jwksResponse.ok) return "unauthorized";
    const jwks = await jwksResponse.json();
    const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.alg === "ES256" && candidate.kty === "EC" && candidate.crv === "P-256");
    if (!jwk) return "unauthorized";
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      toArrayBuffer(decodePart(parts[2])),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!valid) return "unauthorized";
  } catch {
    return "unauthorized";
  }
  const owners = (env.AURA_OWNER_SUBJECTS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return owners.includes(claims.sub) ? "ok" : "forbidden";
}
__name(autorizarOwner, "autorizarOwner");
async function rpcCount(env, inicio, fin, tipo) {
  if (!env.AURA_SUPABASE_SECRET_KEY) throw new Error("AURA backend credential missing");
  const params = { p_inicio: inicio, p_fin: fin };
  if (tipo) params.p_destination_type = tipo;
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/aura_leads_enviados_count`, {
    method: "POST",
    headers: { apikey: env.AURA_SUPABASE_SECRET_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  if (!response.ok) throw new Error(`Supabase KPI respondi\xF3 ${response.status}`);
  return validarConteoRpc(await response.json());
}
__name(rpcCount, "rpcCount");
async function consultarClientes(env, inicio, fin) {
  if (!env.CLIENTES_AGREGADOS_TOKEN) throw new Error("clients service credential missing");
  if (!env.CLIENTES_AGREGADOS_SERVICE) throw new Error("clients service binding missing");
  const url = new URL(CLIENTES_SERVICE_URL);
  url.searchParams.set("inicio", inicio);
  url.searchParams.set("fin", fin);
  return env.CLIENTES_AGREGADOS_SERVICE.fetch(url, {
    headers: { Authorization: `Bearer ${env.CLIENTES_AGREGADOS_TOKEN}` }
  });
}
__name(consultarClientes, "consultarClientes");
var index_default = {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return preflight(origin);
    const respond = /* @__PURE__ */ __name((response) => withCors(response, origin), "respond");
    if (request.method !== "GET" || new URL(request.url).pathname !== "/api/commercial-kpis") return respond(new Response("Not found", { status: 404 }));
    const authorization = await autorizarOwner(request, env);
    if (authorization === "unauthorized") return respond(unauthorized());
    if (authorization === "forbidden") return respond(forbidden());
    const periodos = periodoBogota();
    try {
      const clients = await consultarClientes(env, periodos.mesInicio, periodos.manana);
      if (!clients.ok) return respond(new Response(JSON.stringify({ error: "clients_source_unavailable" }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
      const inscritos = validarInscritos(await clients.json());
      const [hoy, mes, hoyTiendas, hoyAliados, mesTiendas, mesAliados] = await Promise.all([
        rpcCount(env, periodos.hoyInicio, periodos.manana),
        rpcCount(env, periodos.mesInicio, periodos.mesFin),
        rpcCount(env, periodos.hoyInicio, periodos.manana, "tienda"),
        rpcCount(env, periodos.hoyInicio, periodos.manana, "aliado"),
        rpcCount(env, periodos.mesInicio, periodos.mesFin, "tienda"),
        rpcCount(env, periodos.mesInicio, periodos.mesFin, "aliado")
      ]);
      const payload = respuestaKpis(inscritos, { hoy: { total: hoy, tiendas: hoyTiendas, aliados: hoyAliados }, mes: { total: mes, tiendas: mesTiendas, aliados: mesAliados }, certified_from: env.CERTIFIED_FROM });
      return respond(new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
    } catch (error) {
      console.error("[COMMERCIAL-KPIS]", error instanceof Error ? error.message : "source failure");
      return respond(new Response(JSON.stringify({ error: "kpi_source_unavailable" }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
    }
  }
};
export {
  autorizarOwner,
  index_default as default,
  periodoBogota,
  respuestaKpis,
  validarConteoRpc,
  validarInscritos
};
//# sourceMappingURL=index.js.map
