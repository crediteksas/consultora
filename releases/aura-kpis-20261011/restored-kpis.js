function kpiJson(data,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});}
var BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1e3;
function periodosBogota(now = /* @__PURE__ */ new Date()) {
  const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  const hoy = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const mes = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1));
  const siguienteMes = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1));
  const utc = /* @__PURE__ */ __name((date) => new Date(date.getTime() - BOGOTA_OFFSET_MS).toISOString(), "utc");
  return { hoyInicio: utc(hoy), manana: utc(new Date(hoy.getTime() + 864e5)), mesInicio: utc(mes), mesFin: utc(siguienteMes) };
}
__name(periodosBogota, "periodosBogota");
async function contarSolicitudes(inicio, fin, env2) {
  const query = `${SUPABASE_URL6}/rest/v1/solicitudes?created_at=gte.${encodeURIComponent(inicio)}&created_at=lt.${encodeURIComponent(fin)}&select=created_at`;
  const response = await fetch(query, { signal: AbortSignal.timeout(10000), headers: sbHeaders(env2, { Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" }) });
  if (!response.ok) throw new Error("solicitudes count failed");
  const contentRange = response.headers.get("Content-Range") || "";
  const countText = contentRange.split("/")[1];
  if (!/^\d+$/.test(countText || "")) throw new Error("solicitudes count unavailable");
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("solicitudes count unavailable");
  return count;
}
__name(contarSolicitudes, "contarSolicitudes");
async function handleInscritos(request, env2) {
  const url = new URL(request.url);
  const inicio = url.searchParams.get("inicio");
  const fin = url.searchParams.get("fin");
  if (!inicio || !fin || Number.isNaN(Date.parse(inicio)) || Number.isNaN(Date.parse(fin)) || Date.parse(inicio) >= Date.parse(fin)) {
    return kpiJson({ ok: false, error: "Rango inv\xE1lido" }, 400);
  }
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!await tokenValido(token, env2.CLIENTES_AGREGADOS_TOKEN)) return kpiJson({ ok: false, error: "unauthorized" }, 401);
  const periodos = periodosBogota();
  try {
    const [hoy, mes] = await Promise.all([
      contarSolicitudes(periodos.hoyInicio, periodos.manana, env2),
      contarSolicitudes(inicio, fin, env2)
    ]);
    return kpiJson({ hoy, mes, timezone: "America/Bogota" });
  } catch {
    console.error("[KPI-INSCRITOS] fuente no disponible");
    return kpiJson({ ok: false, error: "Fuente de solicitudes no disponible" }, 503);
  }
}
__name(handleInscritos, "handleInscritos");
