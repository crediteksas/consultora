import { generateOpaqueToken, hashOpaqueToken } from './registro-security';

const SUPABASE_URL = 'https://jfkmiyvcdfbsbwchyvol.supabase.co';
const REGISTRATION_URL = 'https://registro.crediteksas.com/creditek/erp/registro';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Fetcher = typeof fetch;

export interface AdminEnlacesEnv {
  SUPABASE_SERVICE_KEY: string;
  TOKEN_HASH_SECRET: string;
}

interface OriginRow {
  codigo: string;
  nombre: string;
  tipo: string;
  ciudad: string | null;
  ejecutivo_id: string | null;
}

interface LinkRow {
  id: string;
  origen_codigo: string;
  token_sufijo: string;
  created_at: string;
  ultima_utilizacion_at: string | null;
  activo?: boolean;
  revoked_at?: string | null;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function headers(env: AdminEnlacesEnv, prefer?: string): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function rows<T>(path: string, env: AdminEnlacesEnv, fetcher: Fetcher): Promise<T[]> {
  const response = await fetcher(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers(env) });
  if (!response.ok) throw new Error('supabase_read_failed');
  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new Error('supabase_read_failed');
  return value as T[];
}

async function audit(
  env: AdminEnlacesEnv,
  fetcher: Fetcher,
  action: string,
  id: string,
  detail: Record<string, unknown>,
): Promise<void> {
  const response = await fetcher(`${SUPABASE_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: headers(env, 'return=minimal'),
    body: JSON.stringify({
      usuario: 'aura.owner',
      accion: action,
      tabla: 'enlaces_registro',
      registro_id: id,
      detalle: detail,
    }),
  });
  if (!response.ok) console.error('[ADMIN-ENLACES] No se pudo registrar auditoría');
}

async function countRegistrations(originCode: string, env: AdminEnlacesEnv, fetcher: Fetcher): Promise<number> {
  const path = `solicitudes?select=id,enlaces_registro!inner(origen_codigo)&enlaces_registro.origen_codigo=eq.${encodeURIComponent(originCode)}`;
  const response = await fetcher(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'HEAD',
    headers: headers(env, 'count=exact'),
  });
  if (!response.ok) throw new Error('supabase_count_failed');
  const count = Number((response.headers.get('Content-Range') || '').split('/')[1]);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('supabase_count_failed');
  return count;
}

export async function listOriginLinks(env: AdminEnlacesEnv, fetcher: Fetcher = fetch): Promise<Response> {
  try {
    const [origins, links, executives] = await Promise.all([
      rows<OriginRow>('origenes?activo=eq.true&tipo=in.(propia,aliado)&select=codigo,nombre,tipo,ciudad,ejecutivo_id&order=nombre', env, fetcher),
      rows<LinkRow>('enlaces_registro?activo=eq.true&revoked_at=is.null&select=id,origen_codigo,token_sufijo,created_at,ultima_utilizacion_at', env, fetcher),
      rows<{ id: string; nombre: string }>('ejecutivos?activo=eq.true&select=id,nombre', env, fetcher),
    ]);
    const executiveNames = new Map(executives.map((row) => [row.id, row.nombre]));
    const activeLinks = new Map(links.map((row) => [row.origen_codigo, row]));
    const counts = await Promise.all(origins.map((origin) => countRegistrations(origin.codigo, env, fetcher)));
    return json(origins.map((origin, index) => {
      const link = activeLinks.get(origin.codigo);
      return {
        codigo: origin.codigo,
        nombre: origin.nombre,
        tipo: origin.tipo,
        ciudad: origin.ciudad,
        ejecutivo_responsable: origin.ejecutivo_id ? executiveNames.get(origin.ejecutivo_id) ?? null : null,
        enlace_activo: link ? {
          id: link.id,
          token_sufijo: link.token_sufijo,
          created_at: link.created_at,
          ultima_utilizacion_at: link.ultima_utilizacion_at,
        } : null,
        total_registros: counts[index],
      };
    }));
  } catch {
    return json({ ok: false, error: 'No se pudieron cargar los enlaces' }, 503);
  }
}

export async function createOriginLink(request: Request, env: AdminEnlacesEnv, fetcher: Fetcher = fetch): Promise<Response> {
  const body = await request.json().catch(() => null) as { origen_codigo?: unknown; captador_id?: unknown } | null;
  const originCode = typeof body?.origen_codigo === 'string' ? body.origen_codigo.trim() : '';
  const captadorId = body?.captador_id;
  if (!originCode || (captadorId !== undefined && captadorId !== null && (typeof captadorId !== 'string' || !UUID_PATTERN.test(captadorId)))) {
    return json({ ok: false, error: 'Datos inválidos' }, 400);
  }

  try {
    const [origin, active] = await Promise.all([
      rows<OriginRow>(`origenes?codigo=eq.${encodeURIComponent(originCode)}&activo=eq.true&select=codigo,nombre,tipo,ciudad,ejecutivo_id&limit=1`, env, fetcher),
      rows<LinkRow>(`enlaces_registro?origen_codigo=eq.${encodeURIComponent(originCode)}&activo=eq.true&revoked_at=is.null&select=id,origen_codigo,token_sufijo,created_at,ultima_utilizacion_at&limit=1`, env, fetcher),
    ]);
    if (origin.length !== 1) return json({ ok: false, error: 'Origen inválido o inactivo' }, 404);
    if (active.length) return json({ ok: false, error: 'ya existe un enlace activo, revócalo primero' }, 409);

    const token = generateOpaqueToken(32);
    const tokenHash = await hashOpaqueToken(token, env.TOKEN_HASH_SECRET);
    const response = await fetcher(`${SUPABASE_URL}/rest/v1/enlaces_registro`, {
      method: 'POST',
      headers: headers(env, 'return=representation'),
      body: JSON.stringify({
        token_hash: tokenHash,
        token_sufijo: token.slice(-8),
        origen_codigo: originCode,
        captador_id: captadorId ?? null,
      }),
    });
    if (!response.ok) {
      if (response.status === 409) return json({ ok: false, error: 'ya existe un enlace activo, revócalo primero' }, 409);
      throw new Error('supabase_insert_failed');
    }
    const inserted = await response.json() as Array<{ id?: unknown }>;
    const id = typeof inserted?.[0]?.id === 'string' ? inserted[0].id : '';
    if (!UUID_PATTERN.test(id)) throw new Error('supabase_insert_failed');
    await audit(env, fetcher, 'enlace_registro_creado', id, { origen_codigo: originCode, captador_id: captadorId ?? null });
    return json({
      enlace_id: id,
      token_completo: token,
      url_completa: `${REGISTRATION_URL}?t=${encodeURIComponent(token)}`,
    }, 201);
  } catch {
    return json({ ok: false, error: 'No se pudo crear el enlace' }, 503);
  }
}

export async function revokeOriginLink(id: string, env: AdminEnlacesEnv, fetcher: Fetcher = fetch): Promise<Response> {
  if (!UUID_PATTERN.test(id)) return json({ ok: false, error: 'Identificador inválido' }, 400);
  try {
    const revokedAt = new Date().toISOString();
    const response = await fetcher(`${SUPABASE_URL}/rest/v1/enlaces_registro?id=eq.${encodeURIComponent(id)}&activo=eq.true&revoked_at=is.null`, {
      method: 'PATCH',
      headers: headers(env, 'return=representation'),
      body: JSON.stringify({ activo: false, revoked_at: revokedAt }),
    });
    if (!response.ok) throw new Error('supabase_update_failed');
    const updated = await response.json() as Array<{ id?: unknown; origen_codigo?: unknown }>;
    if (updated.length !== 1 || updated[0].id !== id) return json({ ok: false, error: 'Enlace activo no encontrado' }, 404);
    await audit(env, fetcher, 'enlace_registro_revocado', id, { origen_codigo: updated[0].origen_codigo ?? null });
    return json({ ok: true, enlace_id: id, revoked_at: revokedAt });
  } catch {
    return json({ ok: false, error: 'No se pudo revocar el enlace' }, 503);
  }
}
