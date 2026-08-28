var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../../private/tmp/creditek-aura-credentials-hotfix/recovered/worker-sources/creditek-gemini-proxy.index.hotfix.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
function decodePart(part) {
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
__name(decodePart, "decodePart");
__name2(decodePart, "decodePart");
function inspectBearer(authorization, now = Math.floor(Date.now() / 1e3)) {
  const token = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const result = {
    token_present: Boolean(token),
    token_format_valid: false,
    iss: null,
    aud: null,
    sub_present: false,
    sub: null,
    exp: null,
    expired: false,
    token
  };
  if (!JWT_RE.test(token)) return result;
  try {
    const payload = decodePart(token.split(".")[1]);
    result.token_format_valid = true;
    result.iss = typeof payload.iss === "string" ? payload.iss : null;
    result.aud = typeof payload.aud === "string" ? payload.aud : Array.isArray(payload.aud) ? payload.aud.join(",") : null;
    result.sub_present = typeof payload.sub === "string" && payload.sub.length > 0;
    result.sub = result.sub_present ? payload.sub : null;
    result.exp = Number.isFinite(payload.exp) ? payload.exp : null;
    result.expired = result.exp !== null && result.exp <= now;
  } catch {
    result.token_format_valid = false;
  }
  return result;
}
__name(inspectBearer, "inspectBearer");
__name2(inspectBearer, "inspectBearer");
function publicDiagnostics(info, cause) {
  return {
    token_present: info.token_present,
    token_format_valid: info.token_format_valid,
    iss: info.iss,
    aud: info.aud,
    sub_present: info.sub_present,
    exp: info.exp,
    cause
  };
}
__name(publicDiagnostics, "publicDiagnostics");
__name2(publicDiagnostics, "publicDiagnostics");
function normalizeAccess(value) {
  return Array.isArray(value) ? value[0] || {} : value && typeof value === "object" ? value : {};
}
__name(normalizeAccess, "normalizeAccess");
__name2(normalizeAccess, "normalizeAccess");
async function authenticateAura(request, env, fetcher = fetch, logger = console) {
  const authorization = request.headers.get("Authorization") || "";
  const info = inspectBearer(authorization);
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = env.AURA_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  const expectedIssuer = env.SUPABASE_JWT_ISSUER || `${supabaseUrl}/auth/v1`;
  let cause = "ok";
  if (!info.token_present) cause = "missing_bearer_token";
  else if (!info.token_format_valid) cause = "malformed_jwt";
  else if (!supabaseUrl || !anonKey) cause = "supabase_configuration_missing";
  else if (info.iss !== expectedIssuer) cause = "issuer_mismatch";
  else if (info.aud !== (env.SUPABASE_JWT_AUDIENCE || "authenticated")) cause = "audience_mismatch";
  else if (!info.sub_present) cause = "subject_missing";
  else if (info.exp === null) cause = "expiration_missing";
  else if (info.expired) cause = "token_expired";
  if (cause === "ok") {
    const headers = { apikey: anonKey, Authorization: `Bearer ${info.token}` };
    let userResponse;
    try {
      userResponse = await fetcher(`${supabaseUrl}/auth/v1/user`, { headers });
    } catch {
      cause = "supabase_auth_unreachable";
    }
    if (cause === "ok" && !userResponse.ok) cause = `supabase_auth_http_${userResponse.status}`;
    if (cause === "ok") {
      const user = await userResponse.json().catch(() => ({}));
      if (user.id !== info.sub) cause = "subject_mismatch";
      if (cause === "ok") {
        let accessResponse;
        try {
          accessResponse = await fetcher(`${supabaseUrl}/rest/v1/rpc/aura_my_access`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: "{}"
          });
        } catch {
          cause = "supabase_access_unreachable";
        }
        if (cause === "ok" && !accessResponse.ok) cause = `supabase_access_http_${accessResponse.status}`;
        if (cause === "ok") {
          const access = normalizeAccess(await accessResponse.json().catch(() => ({})));
          if (access.user_id !== info.sub || access.active === false || !Array.isArray(access.apps) || access.apps.length === 0) {
            cause = "aura_access_denied";
          }
        }
      }
    }
  }
  const diagnostics = publicDiagnostics(info, cause);
  if (env.AUTH_DIAGNOSTICS === "true") logger.log("[AURA-AUTH]", JSON.stringify(diagnostics));
  return cause === "ok";
}
__name(authenticateAura, "authenticateAura");
__name2(authenticateAura, "authenticateAura");
var CORS = {
  "Access-Control-Allow-Origin": "https://aura.crediteksas.com",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type"
};
var WORKER_URL = "https://creditek-gemini-proxy.comercial-853.workers.dev";
var _saToken = null;
var _saTokenExpiry = 0;
async function llamarOpenAI_(env, payload) {
  if (!env.OPENAI_API_KEY) return err("OpenAI no est\xE1 configurado en el servidor", 503);
  if (payload?.model !== "gpt-5.6" || !Array.isArray(payload?.tools) || !payload.tools.some((tool) => tool?.type === "image_generation")) {
    return err("Solicitud de imagen OpenAI inv\xE1lida", 400);
  }
  const started = Date.now();
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload),
      // GPT Image puede tardar más de dos minutos en composiciones complejas.
      // Se espera una sola llamada hasta cuatro minutos; nunca se reintenta.
      signal: AbortSignal.timeout(24e4)
    });
  } catch (error) {
    const safe = /* @__PURE__ */ __name2((value) => String(value || "").replace(/[\r\n]+/g, " ").slice(0, 180), "safe");
    console.error("[OPENAI-IMAGE-NETWORK]", JSON.stringify({
      error_name: safe(error?.name),
      error_message: safe(error?.message)
    }));
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return err(timedOut
      ? "GPT Image excedi\xF3 el tiempo de generaci\xF3n. No se realiz\xF3 un segundo intento."
      : "No se pudo conectar con OpenAI. No se realiz\xF3 un segundo intento.", 502);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerError = data?.error || {};
    const safe = /* @__PURE__ */ __name2((value) => String(value || "").replace(/[\r\n]+/g, " ").slice(0, 240), "safe");
    console.error("[OPENAI-IMAGE]", JSON.stringify({
      status: response.status,
      code: safe(providerError.code),
      type: safe(providerError.type),
      param: safe(providerError.param),
      message: safe(providerError.message),
      request_id: safe(response.headers.get("x-request-id")),
      elapsed_ms: Date.now() - started
    }));
    const message = response.status === 401 ? "OpenAI no est\xE1 autorizado en el servidor" : response.status === 429 ? "L\xEDmite de uso OpenAI alcanzado. Espera un momento." : "OpenAI no pudo generar la imagen";
    return err(message, response.status === 429 ? 429 : 502);
  }
  console.log("[OPENAI-IMAGE]", JSON.stringify({
    status: response.status,
    request_id: String(response.headers.get("x-request-id") || "").slice(0, 120),
    output_type: Array.isArray(data.output) ? data.output.map((item) => item?.type || "unknown").join(",") : typeof data.output,
    elapsed_ms: Date.now() - started
  }));
  return ok(data);
}
__name(llamarOpenAI_, "llamarOpenAI_");
__name2(llamarOpenAI_, "llamarOpenAI_");
async function llamarRecraft_(env, payload) {
  if (!env.RECRAFT_API_TOKEN) return err("Recraft no est\xE1 configurado en el servidor", 503);
  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt || prompt.length > 1e4) return err("Solicitud Recraft inv\xE1lida", 400);
  const size = payload?.format === "stories" ? "832x1280" : "1024x1024";
  const started = Date.now();
  let response;
  try {
    response = await fetch("https://external.api.recraft.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.RECRAFT_API_TOKEN}`
      },
      body: JSON.stringify({ prompt, model: "recraftv4_1", size, n: 1 }),
      signal: AbortSignal.timeout(9e4)
    });
  } catch (error) {
    console.error("[RECRAFT-IMAGE-NETWORK]", JSON.stringify({
      error_name: String(error?.name || "").slice(0, 80),
      elapsed_ms: Date.now() - started
    }));
    return err("No se pudo conectar con Recraft. No se realiz\xF3 un segundo intento.", 502);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[RECRAFT-IMAGE]", JSON.stringify({
      status: response.status,
      request_id: String(response.headers.get("x-request-id") || "").slice(0, 120),
      elapsed_ms: Date.now() - started,
      error: String(data?.detail || data?.error?.message || "").replace(/[\r\n]+/g, " ").slice(0, 240)
    }));
    const message = response.status === 401 ? "Recraft no est\xE1 autorizado en el servidor" : response.status === 429 ? "L\xEDmite de Recraft alcanzado" : "Recraft no pudo generar la imagen";
    return err(message, response.status === 429 ? 429 : 502);
  }
  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) return err("Recraft no devolvi\xF3 una imagen", 502);
  let imageResponse;
  try {
    imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(2e4) });
  } catch {
    return err("Recraft gener\xF3 la imagen, pero no pudo recuperarse", 502);
  }
  const contentLength = Number(imageResponse.headers.get("content-length") || 0);
  if (!imageResponse.ok || contentLength > 8 * 1024 * 1024) return err("La imagen de Recraft no pudo recuperarse de forma segura", 502);
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  if (bytes.length > 8 * 1024 * 1024) return err("La imagen de Recraft supera el tama\xF1o permitido", 502);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const mimeType = imageResponse.headers.get("content-type")?.split(";")[0] || "image/png";
  console.log("[RECRAFT-IMAGE]", JSON.stringify({
    status: response.status,
    request_id: String(response.headers.get("x-request-id") || "").slice(0, 120),
    model: "recraftv4_1",
    images_requested: 1,
    estimated_api_units: 35,
    estimated_cost_usd: 0.035,
    output_bytes: bytes.length,
    elapsed_ms: Date.now() - started
  }));
  return ok({
    predictions: [{ bytesBase64Encoded: btoa(binary), mimeType }],
    model: "recraftv4_1",
    label: "Recraft V4.1",
    billing: { images: 1, api_units: 35, estimated_usd: 0.035 }
  });
}
__name(llamarRecraft_, "llamarRecraft_");
__name2(llamarRecraft_, "llamarRecraft_");
async function llamarAnthropic_(env, payload) {
  if (!env.ANTHROPIC_API_KEY) return err("Anthropic no est\xE1 configurado en el servidor", 503);
  if (!payload?.model || !Array.isArray(payload?.messages) || payload.messages.length === 0) {
    return err("Solicitud Anthropic inv\xE1lida", 400);
  }
  const allowedPayload = {
    model: payload.model,
    messages: payload.messages,
    max_tokens: payload.max_tokens,
    temperature: payload.temperature,
    system: payload.system
  };
  for (const key of Object.keys(allowedPayload)) {
    if (allowedPayload[key] === void 0) delete allowedPayload[key];
  }
  const started = Date.now();
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(allowedPayload),
      signal: AbortSignal.timeout(12e4)
    });
  } catch (error) {
    const safe = /* @__PURE__ */ __name2((value) => String(value || "").replace(/[\r\n]+/g, " ").slice(0, 180), "safe");
    console.error("[ANTHROPIC-NETWORK]", JSON.stringify({
      error_name: safe(error?.name),
      error_message: safe(error?.message)
    }));
    return err("No se pudo conectar con Anthropic. Intenta nuevamente.", 502);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerError = data?.error || {};
    const safe = /* @__PURE__ */ __name2((value) => String(value || "").replace(/[\r\n]+/g, " ").slice(0, 240), "safe");
    console.error("[ANTHROPIC]", JSON.stringify({
      status: response.status,
      type: safe(providerError.type),
      message: safe(providerError.message),
      request_id: safe(response.headers.get("request-id")),
      elapsed_ms: Date.now() - started
    }));
    const message = response.status === 401 ? "Anthropic no est\xE1 autorizado en el servidor" : response.status === 429 ? "L\xEDmite de uso Anthropic alcanzado. Espera un momento." : "Anthropic no pudo procesar la solicitud";
    return err(message, response.status === 429 ? 429 : 502);
  }
  console.log("[ANTHROPIC]", JSON.stringify({
    status: response.status,
    request_id: String(response.headers.get("request-id") || "").slice(0, 120),
    content_type: Array.isArray(data.content) ? data.content.map((item) => item?.type || "unknown").join(",") : typeof data.content,
    elapsed_ms: Date.now() - started
  }));
  return ok(data);
}
__name(llamarAnthropic_, "llamarAnthropic_");
__name2(llamarAnthropic_, "llamarAnthropic_");
function b64urlJson(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(b64urlJson, "b64urlJson");
__name2(b64urlJson, "b64urlJson");
function b64urlBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(b64urlBytes, "b64urlBytes");
__name2(b64urlBytes, "b64urlBytes");
async function signJwt(privateKeyPem, payload) {
  const header = { alg: "RS256", typ: "JWT", kid: "creditek-key-1" };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const pem = privateKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64urlBytes(new Uint8Array(sigBytes))}`;
}
__name(signJwt, "signJwt");
__name2(signJwt, "signJwt");
async function getVertexToken(env) {
  const now = Math.floor(Date.now() / 1e3);
  if (_saToken && now < _saTokenExpiry - 60) return _saToken;
  const jwt = await signJwt(env.GCP_WIF_PRIVATE_KEY, {
    iss: WORKER_URL,
    sub: "creditek-worker",
    aud: WORKER_URL,
    iat: now,
    exp: now + 3600
  });
  const stsRes = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience: env.GCP_WIF_AUDIENCE,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token: jwt,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt"
    })
  });
  const stsData = await stsRes.json();
  if (!stsData.access_token) {
    throw new Error(`WIF STS error (${stsRes.status}): ${JSON.stringify(stsData)}`);
  }
  const impRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.GCP_SA_EMAIL}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stsData.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scope: ["https://www.googleapis.com/auth/cloud-platform"],
        lifetime: "3600s"
      })
    }
  );
  const impData = await impRes.json();
  if (!impData.accessToken) {
    throw new Error(`SA impersonation error (${impRes.status}): ${JSON.stringify(impData)}`);
  }
  _saToken = impData.accessToken;
  _saTokenExpiry = Math.floor(new Date(impData.expireTime).getTime() / 1e3);
  return _saToken;
}
__name(getVertexToken, "getVertexToken");
__name2(getVertexToken, "getVertexToken");
async function llamarGemini3Pro_(env, { prompt, imageUrl, imageBase64, imageMimeType, aspectRatio, extra = {}, via = null }) {
  if (!env.GCP_WIF_PRIVATE_KEY || !env.GCP_WIF_AUDIENCE) {
    return err("Falta GCP_WIF_PRIVATE_KEY para gemini3pro", 401);
  }
  const token = await getVertexToken(env);
  const g3url = `https://aiplatform.googleapis.com/v1/projects/${env.GCP_PROJECT_ID}/locations/global/publishers/google/models/gemini-3-pro-image:generateContent`;
  const parts = [];
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8e3),
        redirect: "follow"
      });
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const mimeType = imgRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
        parts.push({ inlineData: { mimeType, data: btoa(bin) } });
      }
    } catch {
    }
  }
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: imageMimeType || "image/png", data: imageBase64 } });
  }
  parts.push({ text: prompt });
  const started = Date.now();
  const g3res = await fetch(g3url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio }
      }
    }),
    signal: AbortSignal.timeout(6e4)
  });
  if (!g3res.ok) {
    const d = await g3res.json().catch(() => ({}));
    console.error("[GEMINI-IMAGE]", JSON.stringify({
      status: g3res.status,
      request_id: String(g3res.headers.get("x-request-id") || "").slice(0, 120),
      elapsed_ms: Date.now() - started,
      error: String(d.error?.message || "").replace(/[\r\n]+/g, " ").slice(0, 240)
    }));
    return err(d.error?.message || `gemini3pro error ${g3res.status}`, g3res.status);
  }
  const g3data = await g3res.json().catch(() => ({}));
  const imgPart = g3data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!imgPart) return err("gemini3pro: sin imagen en respuesta", 502);
  console.log("[GEMINI-IMAGE]", JSON.stringify({
    status: g3res.status,
    request_id: String(g3res.headers.get("x-request-id") || "").slice(0, 120),
    output_type: imgPart.inlineData.mimeType || "image",
    output_bytes: Math.floor((imgPart.inlineData.data?.length || 0) * 0.75),
    elapsed_ms: Date.now() - started
  }));
  return ok({
    predictions: [{ bytesBase64Encoded: imgPart.inlineData.data }],
    label: "Gemini 3 Pro Image",
    ...extra
  }, via);
}
__name(llamarGemini3Pro_, "llamarGemini3Pro_");
__name2(llamarGemini3Pro_, "llamarGemini3Pro_");
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    const path = new URL(request.url).pathname;
    if (path === "/.well-known/openid-configuration") {
      return new Response(JSON.stringify({
        issuer: WORKER_URL,
        jwks_uri: `${WORKER_URL}/.well-known/jwks.json`
      }), { headers: { "Content-Type": "application/json", ...CORS } });
    }
    if (path === "/.well-known/jwks.json") {
      const keys = env.GCP_WIF_PUBLIC_JWK ? [JSON.parse(env.GCP_WIF_PUBLIC_JWK)] : [];
      return new Response(JSON.stringify({ keys }), {
        headers: { "Content-Type": "application/json", ...CORS }
      });
    }
    if (path === "/test-fetch") {
      const urls = [
        "https://exito.com",
        "https://falabella.com.co",
        "https://alkosto.com",
        "https://ktronix.com"
      ];
      const results = await Promise.all(urls.map(async (url) => {
        try {
          const res = await fetch(url, { method: "HEAD", redirect: "manual" });
          return { url, status: res.status, ok: res.ok };
        } catch (e) {
          return { url, status: null, error: e.message };
        }
      }));
      return ok({ results });
    }
    if (path === "/test-brands") {
      const TEST_URLS = [
        "https://www.tcl.com/mx/es/smartphones.html",
        "https://www.motorola.com/mx/smartphones",
        "https://www.oppo.com/mx/smartphones/",
        "https://www.realme.com/mx/smartphones/",
        "https://www.infinixmobility.com/mx",
        "https://www.honor.com/mx/phones/",
        "https://listado.mercadolibre.com.co/celulares-telefonos/celulares-smartphones/",
        "https://www.linio.com.co/c/celulares-y-smartphones",
        "https://www.ktronix.com/celulares",
        "https://www.falabella.com.co/falabella-co/category/cat40062/Celulares"
      ];
      const results = await Promise.all(TEST_URLS.map(async (url) => {
        const t0 = Date.now();
        try {
          const res = await fetch(url, {
            method: "HEAD",
            redirect: "manual",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept-Language": "es-CO,es;q=0.9"
            },
            signal: AbortSignal.timeout(8e3)
          });
          return {
            url,
            status: res.status,
            ok: res.status === 200 || res.status === 301 || res.status === 302,
            location: res.headers.get("location") || null,
            ms: Date.now() - t0
          };
        } catch (e) {
          return { url, status: null, ok: false, error: e.message, ms: Date.now() - t0 };
        }
      }));
      return ok({ results });
    }
    if (path === "/brand-references") {
      let stripTags = /* @__PURE__ */ __name(function(s) {
        return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }, "stripTags"), parseSpecs = /* @__PURE__ */ __name(function(text) {
        const specs = {};
        const ram = text.match(/(\d+)\s*GB\s+(?:de\s+)?RAM/i) || text.match(/RAM[:\s]+(\d+)\s*GB/i);
        const storage = text.match(/(\d+)\s*GB\s+(?:de\s+)?(?:almacenamiento|ROM|storage|memoria\s+interna|internal)/i) || text.match(/(?:storage|almacenamiento|ROM)[:\s]+(\d+)\s*GB/i);
        const cam = text.match(/(\d+)\s*MP\s+(?:c[aá]mara|camera|principal|main|rear|trasera)/i) || text.match(/(?:c[aá]mara|camera)[^.]{0,30}?(\d+)\s*MP/i) || text.match(/(\d+)\s*MP/i);
        const bat = text.match(/(\d[\d.]*)\s*mAh/i);
        const screen = text.match(/(\d+[.,]\d+)\s*(?:pulgadas|pulg\b|["″]|inch(?:es)?)/i) || text.match(/(?:pantalla|display|screen)[:\s]+(\d+[.,]\d+)/i);
        const chip = text.match(/(?:Snapdragon|Dimensity|Exynos|Helio[_ ]?[GP]?\d|MediaTek\s+\w+)\s*[\w\d+]*/i);
        if (ram) specs.ram = ram[1] + "GB RAM";
        if (storage) specs.almacenamiento = storage[1] + "GB";
        if (cam) specs.camara = cam[1] + "MP";
        if (bat) specs.bateria = bat[1] + "mAh";
        if (screen) specs.pantalla = screen[1].replace(",", ".") + '"';
        if (chip) specs.procesador = chip[0];
        return Object.keys(specs).length ? specs : null;
      }, "parseSpecs"), parsePrice = /* @__PURE__ */ __name(function(text) {
        const m = text.match(/\$\s*([\d.,]{4,})/);
        return m ? "$" + m[1] : null;
      }, "parsePrice");
      __name2(stripTags, "stripTags");
      __name2(parseSpecs, "parseSpecs");
      __name2(parsePrice, "parsePrice");
      const STATIC = {
        "Xiaomi CO": [
          { nombre: "Redmi Note 15 Pro 5G", specs: { ram: "12GB RAM", almacenamiento: "256GB", camara: "200MP", bateria: "5110mAh", pantalla: '6.67"', procesador: "MediaTek Dimensity 7400 Ultra" }, precioLista: null },
          { nombre: "Redmi Note 14 5G", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "108MP", bateria: "5110mAh", pantalla: '6.67"', procesador: "MediaTek Dimensity 7025 Ultra" }, precioLista: null },
          { nombre: "Poco X7 Pro 5G", specs: { ram: "12GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "6000mAh", pantalla: '6.67"', procesador: "MediaTek Dimensity 7300 Ultra" }, precioLista: null },
          { nombre: "Poco M6 Pro", specs: { ram: "12GB RAM", almacenamiento: "256GB", camara: "64MP", bateria: "5000mAh", pantalla: '6.67"' }, precioLista: null },
          { nombre: "Redmi 14C", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5160mAh", pantalla: '6.88"', procesador: "MediaTek Helio G81 Ultra" }, precioLista: null },
          { nombre: "Redmi 13C", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.74"' }, precioLista: null }
        ],
        "Motorola CO": [
          { nombre: "Moto G85 5G", specs: { ram: "12GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.67"', procesador: "Snapdragon 6s Gen 3" }, precioLista: null },
          { nombre: "Moto G75 5G", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.78"', procesador: "Snapdragon 6 Gen 3" }, precioLista: null },
          { nombre: "Moto G55 5G", specs: { ram: "8GB RAM", almacenamiento: "128GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.49"', procesador: "MediaTek Dimensity 7025" }, precioLista: null },
          { nombre: "Moto G35 5G", specs: { ram: "8GB RAM", almacenamiento: "128GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.72"', procesador: "Unisoc T760" }, precioLista: null },
          { nombre: "Moto E45", specs: { ram: "4GB RAM", almacenamiento: "128GB", camara: "48MP", bateria: "5000mAh", pantalla: '6.56"' }, precioLista: null },
          { nombre: "Razr 50 5G", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "4200mAh", pantalla: '6.9"' }, precioLista: null }
        ],
        "OPPO CO": [
          { nombre: "OPPO Reno14 5G", specs: { ram: "12GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5800mAh", pantalla: '6.76"' }, precioLista: null },
          { nombre: "OPPO Reno14 F 5G", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.67"' }, precioLista: null },
          { nombre: "OPPO Reno12 F 5G", specs: { ram: "12GB RAM", almacenamiento: "256GB", camara: "108MP", bateria: "5000mAh", pantalla: '6.67"' }, precioLista: null },
          { nombre: "OPPO A60", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.67"' }, precioLista: null },
          { nombre: "OPPO Find N6", specs: { ram: "16GB RAM", almacenamiento: "512GB", camara: "50MP", bateria: "5600mAh", pantalla: '8.0"' }, precioLista: null },
          { nombre: "OPPO A6s", specs: { ram: "6GB RAM", almacenamiento: "128GB", camara: "13MP", bateria: "5100mAh", pantalla: '6.67"' }, precioLista: null }
        ],
        "Realme CO": [
          { nombre: "Realme GT 6", specs: { ram: "12GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5500mAh", pantalla: '6.78"' }, precioLista: null },
          { nombre: "Realme 12 Pro+", specs: { ram: "12GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.7"' }, precioLista: null },
          { nombre: "Realme C67", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "108MP", bateria: "5000mAh", pantalla: '6.72"' }, precioLista: null },
          { nombre: "Realme Narzo 70x 5G", specs: { ram: "6GB RAM", almacenamiento: "128GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.67"' }, precioLista: null },
          { nombre: "Realme C55", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "64MP", bateria: "5000mAh", pantalla: '6.72"' }, precioLista: null },
          { nombre: "Realme 12 5G", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.72"' }, precioLista: null }
        ],
        "TCL CO": [
          { nombre: "TCL 50 5G", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5010mAh", pantalla: '6.6"' }, precioLista: null },
          { nombre: "TCL 40 XL 5G", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "50MP", bateria: "5010mAh", pantalla: '6.78"' }, precioLista: null },
          { nombre: "TCL 40 SE", specs: { ram: "4GB RAM", almacenamiento: "128GB", camara: "50MP", bateria: "5010mAh", pantalla: '6.75"' }, precioLista: null },
          { nombre: "TCL 505", specs: { ram: "4GB RAM", almacenamiento: "128GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.75"' }, precioLista: null },
          { nombre: "TCL 30+", specs: { ram: "4GB RAM", almacenamiento: "128GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.7"' }, precioLista: null }
        ],
        "Honor CO": [
          { nombre: "Honor X8b", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "108MP", bateria: "4500mAh", pantalla: '6.7"' }, precioLista: null },
          { nombre: "Honor 90 Lite", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "100MP", bateria: "4500mAh", pantalla: '6.7"' }, precioLista: null },
          { nombre: "Honor X7b", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "108MP", bateria: "6000mAh", pantalla: '6.8"' }, precioLista: null },
          { nombre: "Honor X6b", specs: { ram: "6GB RAM", almacenamiento: "128GB", camara: "50MP", bateria: "5000mAh", pantalla: '6.56"' }, precioLista: null },
          { nombre: "Honor Magic6 Lite", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "100MP", bateria: "5000mAh", pantalla: '6.78"' }, precioLista: null }
        ],
        "Infinix CO": [
          { nombre: "Infinix Note 40 Pro", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "108MP", bateria: "4600mAh", pantalla: '6.78"' }, precioLista: null },
          { nombre: "Infinix Hot 40i", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "48MP", bateria: "5000mAh", pantalla: '6.56"' }, precioLista: null },
          { nombre: "Infinix Zero 30 5G", specs: { ram: "8GB RAM", almacenamiento: "256GB", camara: "108MP", bateria: "5000mAh", pantalla: '6.78"' }, precioLista: null },
          { nombre: "Infinix Hot 30i", specs: { ram: "4GB RAM", almacenamiento: "128GB", camara: "13MP", bateria: "5000mAh", pantalla: '6.56"' }, precioLista: null },
          { nombre: "Infinix Smart 8", specs: { ram: "4GB RAM", almacenamiento: "64GB", camara: "13MP", bateria: "5000mAh", pantalla: '6.6"' }, precioLista: null }
        ]
      };
      const FINANCIERAS_INFO = {
        "PayJoy CO": {
          tagline: "Financia tu celular desde $0 de inicial",
          beneficios: "Aprobaci\xF3n inmediata con c\xE9dula \xB7 Sin codeudor \xB7 Cuotas desde $29.900/mes",
          url: "https://www.payjoy.com/co",
          color: "#00A651"
        },
        "Krediya": {
          tagline: "Cr\xE9dito digital r\xE1pido para tu celular",
          beneficios: "Proceso 100% digital \xB7 Aprobaci\xF3n en minutos \xB7 Sin papeler\xEDa",
          url: "https://www.krediya.com.co",
          color: "#FF6B00"
        },
        "Addi CO": {
          tagline: "Compra ahora, paga despu\xE9s \u2014 BNPL",
          beneficios: "Divide en cuotas sin salir de la tienda \xB7 Sin intereses en plazos cortos \xB7 Aprobaci\xF3n instant\xE1nea",
          url: "https://www.addi.com/co",
          color: "#A259FF"
        },
        "Alo Credit": {
          tagline: "Cr\xE9dito f\xE1cil para tu celular",
          beneficios: "Cr\xE9dito inmediato \xB7 Para todos los colombianos \xB7 Sin historial crediticio requerido",
          url: "https://www.alocredit.co",
          color: "#00B4D8"
        }
      };
      const brands = [
        { marca: "Samsung CO", urls: ["https://www.samsung.com/co/smartphones/all-smartphones/"] },
        { marca: "Xiaomi CO", urls: [] },
        { marca: "Motorola CO", urls: ["https://www.motorola.com/mx/smartphones", "https://www.motorola.com/cl/smartphones"] },
        { marca: "OPPO CO", urls: ["https://www.oppo.com/mx/smartphones/"] },
        { marca: "Realme CO", urls: ["https://www.realme.com/cl/smartphones/", "https://www.realme.com/pe/smartphones/"] },
        { marca: "TCL CO", urls: ["https://www.tcl.com/mx/es/smartphones", "https://www.tcl.com/mx/es/smartphones.html"] },
        { marca: "Honor CO", urls: ["https://www.honor.com/mx/phones/"] },
        { marca: "Infinix CO", urls: ["https://www.infinixmobility.com/mx"] }
      ];
      async function fetchHtml(url, maxBytes = 6e5) {
        const res = await fetch(url, {
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache"
          },
          signal: AbortSignal.timeout(12e3)
        });
        if (!res.ok) return { html: "", status: res.status };
        const reader = res.body.getReader();
        const chunks = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          total += value.length;
          if (total >= maxBytes) {
            reader.cancel();
            break;
          }
        }
        const buf = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          buf.set(c, off);
          off += c.length;
        }
        return { html: new TextDecoder().decode(buf), status: res.status };
      }
      __name(fetchHtml, "fetchHtml");
      __name2(fetchHtml, "fetchHtml");
      const BRAND_KEYWORDS = {
        "Xiaomi": ["xiaomi", "redmi", "poco"],
        "Motorola": ["motorola", "moto g", "moto e", "moto s", "razr"],
        "Realme": ["realme", "narzo"],
        "TCL": ["tcl"],
        "OPPO": ["oppo", "reno"],
        "Honor": ["honor"],
        "Infinix": ["infinix"]
      };
      async function fetchGoogleShoppingModelos(marcaBase) {
        const q = encodeURIComponent(marcaBase + " celular colombia");
        const url = `https://www.google.com.co/search?q=${q}&tbm=shop&hl=es&gl=co`;
        try {
          const { html, status } = await fetchHtml(url, 3e5);
          if (!html || status !== 200) return null;
          const seen = /* @__PURE__ */ new Set();
          const modelos = [];
          const keywords = BRAND_KEYWORDS[marcaBase] || [marcaBase.toLowerCase()];
          const matches = /* @__PURE__ */ __name2((t) => keywords.some((kw) => t.toLowerCase().includes(kw)), "matches");
          for (const m of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)) {
            const text = stripTags(m[1]).trim();
            if (!text || text.length > 120 || seen.has(text) || !matches(text)) continue;
            seen.add(text);
            modelos.push({ nombre: text, specs: parseSpecs(text), precioLista: parsePrice(text) });
          }
          for (const m of html.matchAll(/aria-label="([^"]{10,100})"/g)) {
            const text = m[1].trim();
            if (seen.has(text) || !matches(text)) continue;
            seen.add(text);
            modelos.push({ nombre: text, specs: parseSpecs(text), precioLista: null });
          }
          return modelos.length >= 2 ? modelos.slice(0, 10) : null;
        } catch {
          return null;
        }
      }
      __name(fetchGoogleShoppingModelos, "fetchGoogleShoppingModelos");
      __name2(fetchGoogleShoppingModelos, "fetchGoogleShoppingModelos");
      async function fetchAmazonModelos(marcaBase) {
        const q = encodeURIComponent(marcaBase + " celular");
        const url = `https://www.amazon.com.mx/s?k=${q}&i=electronics`;
        try {
          const { html, status } = await fetchHtml(url, 3e5);
          if (!html || status !== 200) return null;
          const seen = /* @__PURE__ */ new Set();
          const modelos = [];
          const brandLc = marcaBase.toLowerCase();
          for (const m of html.matchAll(/<span\b[^>]*class="[^"]*a-size-medium[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)) {
            const text = stripTags(m[1]).trim();
            if (!text || text.length < 8 || text.length > 150 || seen.has(text)) continue;
            if (!text.toLowerCase().includes(brandLc)) continue;
            seen.add(text);
            modelos.push({ nombre: text.slice(0, 100), specs: parseSpecs(text), precioLista: null });
          }
          return modelos.length >= 2 ? modelos.slice(0, 10) : null;
        } catch {
          return null;
        }
      }
      __name(fetchAmazonModelos, "fetchAmazonModelos");
      __name2(fetchAmazonModelos, "fetchAmazonModelos");
      const GS_BRANDS = ["Xiaomi", "Motorola", "Realme", "TCL", "OPPO", "Infinix", "Honor"];
      async function extractModels({ marca, urls }) {
        const marcaBase = marca.replace(/\s+(CO|MX|CL|PE)$/, "");
        if (!urls.length) {
          if (GS_BRANDS.includes(marcaBase)) {
            const gsResult = await fetchGoogleShoppingModelos(marcaBase);
            if (gsResult?.length) return { marca, status: 200, url: "google-shopping", modelos: gsResult.slice(0, 12), contexto: "" };
          }
          if (STATIC[marca]) return { marca, status: 200, url: "static", modelos: STATIC[marca], contexto: "" };
        }
        let html = "", status = 0, usedUrl = "";
        for (const url of urls) {
          const result = await fetchHtml(url);
          if (result.html && result.status === 200) {
            html = result.html;
            status = result.status;
            usedUrl = url;
            break;
          }
          status = result.status;
        }
        try {
          if (!html) {
            if (GS_BRANDS.includes(marcaBase)) {
              const gsResult = await fetchGoogleShoppingModelos(marcaBase);
              if (gsResult?.length) return { marca, status: 200, url: "google-shopping", modelos: gsResult.slice(0, 12), contexto: "" };
            }
            return { marca, modelos: STATIC[marca] || [], status, url: usedUrl };
          }
          const seen = /* @__PURE__ */ new Set();
          const modelos = [];
          for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
            try {
              const data = JSON.parse(m[1]);
              const items = [data].flat();
              for (const node of items) {
                const products = node["@type"] === "ItemList" ? (node.itemListElement || []).map((e) => e.item || e).filter(Boolean) : node["@type"] === "Product" ? [node] : [];
                for (const p of products) {
                  const nombre = (p.name || "").trim();
                  if (!nombre || seen.has(nombre) || nombre.length > 100) continue;
                  seen.add(nombre);
                  const desc = [p.description || "", p.name || ""].join(" ");
                  const precioLista = p.offers?.price ? `$${Number(p.offers.price).toLocaleString("es-CO")}` : parsePrice(desc);
                  const imagenRef = p.image ? Array.isArray(p.image) ? p.image[0] : p.image : null;
                  modelos.push({ nombre, specs: parseSpecs(desc), precioLista, imagenRef });
                }
              }
            } catch {
            }
          }
          const ogTitle = (html.match(/property=["']og:title["'][^>]*content=["']([^"']{3,80})["']/i) || html.match(/content=["']([^"']{3,80})["'][^>]*property=["']og:title["']/i))?.[1] || "";
          const metaDesc = (html.match(/name=["']description["'][^>]*content=["']([^"']{10,200})["']/i) || html.match(/content=["']([^"']{10,200})["'][^>]*name=["']description["']/i))?.[1] || "";
          for (const m of html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)) {
            const text = stripTags(m[1]).trim();
            if (text.length < 6 || text.length > 120 || seen.has(text)) continue;
            const hasModel = /Galaxy|Redmi|Poco|Narzo|Moto\s*[A-Z]|Razr|Stylus|OPPO\s*[A-Z]|Reno\d|Find\s*[NX]|Realme\s*\d|GT\s*\d|Note\s*\d+\s*Pro|Samsung|Xiaomi|Motorola|TCL\s*\d|Honor\s*[X\d]|Magic\d|Infinix\s+(?:Hot|Note|Smart|Zero)|Infinix|Honor|TCL/i.test(text);
            const hasSpec = /\d+\s*GB|\d+\s*MP|\d{4}\s*mAh/i.test(text);
            if (!hasModel && !hasSpec) continue;
            seen.add(text);
            modelos.push({ nombre: text, specs: parseSpecs(text), precioLista: parsePrice(text) });
          }
          const plainText = stripTags(
            html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<nav[\s\S]*?<\/nav>/gi, "").replace(/<header[\s\S]*?<\/header>/gi, "").replace(/<footer[\s\S]*?<\/footer>/gi, "")
          ).slice(0, 1e3);
          let finalModelos = modelos.length ? modelos.slice(0, 12) : null;
          let gsUrl = null;
          if (!finalModelos && GS_BRANDS.includes(marcaBase)) {
            const gsResult = await fetchGoogleShoppingModelos(marcaBase);
            if (gsResult?.length) {
              finalModelos = gsResult;
              gsUrl = "google-shopping";
            } else {
              const amzResult = await fetchAmazonModelos(marcaBase);
              if (amzResult?.length) {
                finalModelos = amzResult;
                gsUrl = "amazon-mx";
              }
            }
          }
          if (!finalModelos) finalModelos = STATIC[marca] || [];
          const returnUrl = gsUrl ? gsUrl : usedUrl && status === 200 && finalModelos.length ? usedUrl : finalModelos === STATIC[marca] ? "static" : usedUrl || "static";
          return {
            marca,
            status: gsUrl ? 200 : status,
            url: returnUrl,
            modelos: finalModelos,
            contexto: [ogTitle, metaDesc].filter(Boolean).join(" | ").slice(0, 300) || plainText.slice(0, 300)
          };
        } catch (e) {
          return { marca, modelos: STATIC[marca] || [], contexto: "", status, url: usedUrl, error: e.message };
        }
      }
      __name(extractModels, "extractModels");
      __name2(extractModels, "extractModels");
      const results = await Promise.all(brands.map(extractModels));
      return ok({ results, financieras: FINANCIERAS_INFO });
    }
    if (path === "/health") {
      return ok({
        ok: true,
        wif: !!env.GCP_WIF_PRIVATE_KEY,
        jwks: !!env.GCP_WIF_PUBLIC_JWK,
        wif_audience: env.GCP_WIF_AUDIENCE || null,
        jwt_audience: WORKER_URL
      });
    }
    if (path !== "/openai/responses" && path !== "/recraft/images" && path !== "/anthropic/messages") return err("Ruta no encontrada", 404);
    if (request.method !== "POST") return err("Solo POST", 405);
    if (!await authenticateAura(request, env)) return err("Autenticaci\xF3n AURA requerida", 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return err("JSON inv\xE1lido", 400);
    }
    if (path === "/openai/responses") return llamarOpenAI_(env, body);
    if (path === "/recraft/images") return llamarRecraft_(env, body);
    if (path === "/anthropic/messages") return llamarAnthropic_(env, body);
    const { prompt, aspectRatio = "1:1", engine, imageUrl, imageBase64, imageMimeType } = body;
    if (!prompt) return err('Campo "prompt" requerido', 400);
    let via0Skip = null;
    if (engine === "gemini3pro") {
      return await llamarGemini3Pro_(env, { prompt, imageUrl, imageBase64, imageMimeType, aspectRatio });
    }
    const nbKey = (env.GEMINI_API_KEY || "").trim();
    if (nbKey) {
      const nbUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${nbKey}`;
      try {
        const started = Date.now();
        const nbRes = await fetch(nbUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
          }),
          signal: AbortSignal.timeout(9e4)
        });
        if (nbRes.ok) {
          let nbData = {};
          try {
            nbData = await nbRes.json();
          } catch {
          }
          const nbParts = nbData.candidates?.[0]?.content?.parts || [];
          const nbImg = nbParts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
          if (nbImg) {
            console.log("[GEMINI-IMAGE]", JSON.stringify({
              status: nbRes.status,
              request_id: String(nbRes.headers.get("x-request-id") || "").slice(0, 120),
              output_type: nbImg.inlineData.mimeType || "image",
              output_bytes: Math.floor((nbImg.inlineData.data?.length || 0) * 0.75),
              elapsed_ms: Date.now() - started
            }));
            return ok({
              predictions: [{ bytesBase64Encoded: nbImg.inlineData.data, mimeType: nbImg.inlineData.mimeType }],
              model: "gemini-3.1-flash-image-preview",
              label: "Nano Banana 2"
            }, "0: Nano Banana 2 (gemini-3.1-flash-image-preview)");
          }
          const partTypes = nbParts.map((p) => p.inlineData ? `inlineData(${p.inlineData.mimeType})` : p.text ? "text" : Object.keys(p).join(",")).join("|");
          return err(`Via0: HTTP 200 pero sin imagen. parts=[${partTypes || "vac\xEDo"}] candidates=${nbData.candidates?.length ?? 0}`, 502);
        } else if (nbRes.status === 401) {
          console.error("[GEMINI-IMAGE]", JSON.stringify({ status: nbRes.status, elapsed_ms: Date.now() - started, error: "provider_unauthorized" }));
          return err("GEMINI_API_KEY inv\xE1lida.", 401);
        } else {
          let errBody = "";
          try {
            errBody = await nbRes.text();
          } catch {
          }
          console.error("[GEMINI-IMAGE]", JSON.stringify({ status: nbRes.status, elapsed_ms: Date.now() - started, error: errBody.replace(/[\r\n]+/g, " ").slice(0, 240) }));
          via0Skip = `Via0 skip: HTTP ${nbRes.status} \u2014 ${errBody.slice(0, 120)}`;
        }
      } catch (_) {
      }
    }
    return await llamarGemini3Pro_(env, {
      prompt,
      imageUrl,
      imageBase64,
      imageMimeType,
      aspectRatio,
      extra: via0Skip ? { via0Skip } : {},
      via: "1: Gemini 3 Pro Image (respaldo)"
    });
  }
};
function ok(data, via = null) {
  const body = via ? { ...data, via } : data;
  const headers = { ...CORS, "Content-Type": "application/json" };
  if (via) headers["X-Via"] = via;
  return new Response(JSON.stringify(body), { status: 200, headers });
}
__name(ok, "ok");
__name2(ok, "ok");
function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
__name(err, "err");
__name2(err, "err");
export {
  index_default as default
};
//# sourceMappingURL=creditek-gemini-proxy.index.hotfix.js.map
