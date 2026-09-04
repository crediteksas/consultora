type Destinatario = { telefono: string; nombre: string };
type Sesion = "apertura" | "cierre";
type DispatchBody = { fecha: string; sesion: Sesion; resumen: string; informe: string };
type AuraUser = { id?: string; email?: string };
type AuraAccess = { apps?: Array<{ app_id?: string; role_id?: string; permissions?: string[] }> };

function respuesta(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function respuestaCors(data: unknown, status: number, env: Env): Response {
  const response = respuesta(data, status);
  response.headers.set("Access-Control-Allow-Origin", env.AURA_ALLOWED_ORIGIN);
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Vary", "Origin");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function usuarioAura(request: Request, env: Env): Promise<AuraUser | null> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  if (!response.ok) return null;
  const user = await response.json<AuraUser>();
  if (!user.id) return null;
  const accessResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/aura_my_access`, {
    method: "POST",
    headers: { Authorization: authorization, apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!accessResponse.ok) return null;
  const access = await accessResponse.json<AuraAccess>();
  const authorized = access.apps?.some((grant) => grant.role_id === "aura.owner" || (
    grant.app_id === "finanzas" && grant.permissions?.includes("finanzas.read")
  ));
  if (!authorized) return null;
  return user;
}

async function firmaInforme(id: string, exp: number, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${exp}`));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function coincideSecreto(provided: string, expected: string): Promise<boolean> {
  const normalizedProvided = provided.trim();
  const normalizedExpected = expected.trim();
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(normalizedProvided)),
    crypto.subtle.digest("SHA-256", encoder.encode(normalizedExpected)),
  ]);
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}

function destinatarios(env: Env): Destinatario[] {
  const value: unknown = JSON.parse(env.DESTINATARIOS_JSON);
  if (!Array.isArray(value)) throw new Error("DESTINATARIOS_JSON no es una lista");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Destinatario inválido");
    const telefono = Reflect.get(item, "telefono");
    const nombre = Reflect.get(item, "nombre");
    if (typeof telefono !== "string" || typeof nombre !== "string") throw new Error("Destinatario incompleto");
    return { telefono, nombre };
  });
}

function validarBody(value: unknown): DispatchBody {
  if (!value || typeof value !== "object") throw new Error("Cuerpo inválido");
  const fecha = Reflect.get(value, "fecha");
  const sesion = Reflect.get(value, "sesion");
  const resumen = Reflect.get(value, "resumen");
  const informe = Reflect.get(value, "informe");
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Fecha inválida");
  if (sesion !== "apertura" && sesion !== "cierre") throw new Error("Sesión inválida");
  if (typeof resumen !== "string" || resumen.length < 20 || resumen.length > 900) throw new Error("Resumen inválido");
  if (typeof informe !== "string" || informe.length < 100 || informe.length > 50_000) throw new Error("Informe inválido");
  return { fecha, sesion, resumen, informe };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  })[char] ?? char);
}

function htmlInforme(data: DispatchBody): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe AURA Finanzas</title><style>body{margin:0;background:#f5f7fb;color:#17203a;font:16px/1.55 system-ui,sans-serif}.wrap{max-width:820px;margin:auto;padding:24px}.card{background:white;border:1px solid #e4e8f2;border-radius:18px;padding:28px;box-shadow:0 12px 36px #17203a12}h1{margin:0 0 4px;font-size:26px}.meta{color:#667085;margin-bottom:24px}.report{white-space:pre-wrap}.foot{margin-top:28px;color:#667085;font-size:13px}</style></head><body><main class="wrap"><article class="card"><h1>AURA Finanzas</h1><div class="meta">Informe de ${escapeHtml(data.sesion)} · ${escapeHtml(data.fecha)}</div><div class="report">${escapeHtml(data.informe)}</div><div class="foot">Investigación informativa. No garantiza rentabilidad ni ejecuta operaciones.</div></article></main></body></html>`;
}

async function enviarPlantilla(env: Env, dest: Destinatario, data: DispatchBody, url: string): Promise<void> {
  const contenido = `${data.sesion === "apertura" ? "Apertura" : "Cierre"}: ${data.resumen}\nInforme completo: ${url}`;
  const response = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: dest.telefono,
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE_NAME,
        language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: dest.nombre },
            { type: "text", text: contenido },
          ],
        }],
      },
    }),
  });
  if (!response.ok) throw new Error(`Meta ${response.status}: ${(await response.text()).slice(0, 500)}`);
}

async function dispatch(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !await coincideSecreto(auth.slice(7), env.DISPATCH_TOKEN)) {
    return respuesta({ ok: false, error: "No autorizado" }, 401);
  }
  let data: DispatchBody;
  try {
    data = validarBody(await request.json());
  } catch (error) {
    return respuesta({ ok: false, error: error instanceof Error ? error.message : "Solicitud inválida" }, 400);
  }
  const key = `${data.fecha}:${data.sesion}`;
  if (await env.REPORT_STATE.get(`sent:${key}`)) return respuesta({ ok: true, duplicado: true });

  const reportId = crypto.randomUUID();
  await env.REPORT_STATE.put(`report:${reportId}`, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 45 });
  await env.REPORT_STATE.put(`latest:${data.sesion}`, JSON.stringify({ id: reportId, ...data }), { expirationTtl: 60 * 60 * 24 * 45 });
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const sig = await firmaInforme(reportId, exp, env.DISPATCH_TOKEN);
  const url = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/r/${reportId}?exp=${exp}&sig=${sig}`;
  for (const dest of destinatarios(env)) await enviarPlantilla(env, dest, data, url);
  await env.REPORT_STATE.put(`sent:${key}`, new Date().toISOString(), { expirationTtl: 60 * 60 * 24 * 45 });
  console.log(JSON.stringify({ event: "informe_enviado", key, destinatarios: destinatarios(env).length }));
  return respuesta({ ok: true, duplicado: false, url });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return respuesta({ ok: true, servicio: "aura-finanzas" });
    if (request.method === "OPTIONS" && request.headers.get("Origin") === env.AURA_ALLOWED_ORIGIN) {
      return respuestaCors({ ok: true }, 204, env);
    }
    if (url.pathname === "/api/dashboard" && request.method === "GET") {
      if (request.headers.get("Origin") !== env.AURA_ALLOWED_ORIGIN || !await usuarioAura(request, env)) {
        return respuestaCors({ ok: false, error: "No autorizado" }, 401, env);
      }
      const [portfolio, apertura, cierre] = await Promise.all([
        env.REPORT_STATE.get("portfolio:current", "json"),
        env.REPORT_STATE.get("latest:apertura", "json"),
        env.REPORT_STATE.get("latest:cierre", "json"),
      ]);
      return respuestaCors({ ok: true, portfolio, informes: { apertura, cierre }, whatsapp: "meta_pending" }, 200, env);
    }
    if (url.pathname === "/portfolio" && request.method === "PUT") {
      const auth = request.headers.get("Authorization") ?? "";
      if (!auth.startsWith("Bearer ") || !await coincideSecreto(auth.slice(7), env.DISPATCH_TOKEN)) return respuesta({ ok: false, error: "No autorizado" }, 401);
      const portfolio = await request.json();
      await env.REPORT_STATE.put("portfolio:current", JSON.stringify(portfolio));
      return respuesta({ ok: true });
    }
    if (url.pathname === "/dispatch" && request.method === "POST") return dispatch(request, env);
    if (url.pathname.startsWith("/r/") && request.method === "GET") {
      const id = url.pathname.slice(3);
      const exp = Number(url.searchParams.get("exp"));
      const provided = url.searchParams.get("sig") ?? "";
      if (!Number.isSafeInteger(exp) || exp < Math.floor(Date.now() / 1000)) return new Response("Enlace vencido", { status: 401 });
      const expected = await firmaInforme(id, exp, env.DISPATCH_TOKEN);
      if (!provided || !await coincideSecreto(provided, expected)) return new Response("Enlace inválido", { status: 401 });
      const raw = await env.REPORT_STATE.get(`report:${id}`);
      if (!raw) return new Response("Informe no encontrado o vencido", { status: 404 });
      return new Response(htmlInforme(validarBody(JSON.parse(raw))), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
      });
    }
    return respuesta({ ok: false, error: "Ruta no encontrada" }, 404);
  },
} satisfies ExportedHandler<Env>;

export { destinatarios, validarBody };
import { timingSafeEqual } from "node:crypto";
