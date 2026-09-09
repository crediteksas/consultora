import { hashOpaqueToken } from './registro-security';
import { resolveRegistrationContext, type RegistrationContextEnv } from './registro-context';

export interface AllyProvisionEnv extends RegistrationContextEnv {
  ALLY_PROVISION_SECRET: string;
  ALLY_TOKEN_DERIVATION_SECRET: string;
}
const DB = 'https://jfkmiyvcdfbsbwchyvol.supabase.co/rest/v1/';
const PUBLIC_LINK = 'https://registro.crediteksas.com/creditek/erp/registro?t=';
const MAX_BODY = 16384;
type Fetcher = typeof fetch;
const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
const reply = (status: number, data: unknown) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
class ProvisionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string') throw new ProvisionError(400, 'datos_aliado_invalidos');
  const result = value.trim().replace(/\s+/g, ' ');
  if (result.length < 2 || result.length > max || /[\x00-\x1f]/.test(result)) throw new ProvisionError(400, 'datos_aliado_invalidos');
  return result;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new ProvisionError(413, 'solicitud_demasiado_grande');
  const reader = request.body?.getReader();
  if (!reader) throw new ProvisionError(400, 'datos_aliado_invalidos');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new ProvisionError(413, 'solicitud_demasiado_grande'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error();
    return parsed;
  } catch { throw new ProvisionError(400, 'datos_aliado_invalidos'); }
}

export async function provisionAlly(request: Request, env: AllyProvisionEnv, fetcher: Fetcher = fetch): Promise<Response> {
  try {
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'metodo_no_permitido' });
    // This endpoint is exclusively server-to-server, never a browser API.
    if (request.headers.has('origin')) return reply(403, { ok: false, error: 'origen_no_permitido' });
    if (!env.ALLY_PROVISION_SECRET || !env.ALLY_TOKEN_DERIVATION_SECRET || !env.TOKEN_HASH_SECRET || !env.SUPABASE_SERVICE_KEY) {
      throw new ProvisionError(503, 'aprovisionamiento_no_disponible');
    }
    const received = request.headers.get('X-Creditek-Provision-Secret') || '';
    if (!received || received.length > 512) return reply(401, { ok: false, error: 'unauthorized' });
    const [a, b] = await Promise.all([
      hashOpaqueToken(received, env.ALLY_PROVISION_SECRET),
      hashOpaqueToken(env.ALLY_PROVISION_SECRET, env.ALLY_PROVISION_SECRET),
    ]);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    if (diff) return reply(401, { ok: false, error: 'unauthorized' });

    const input = await body(request);
    text(input.radicado, 120);
    const nombre = text(input.nombre_comercial, 160);
    const ciudad = text(input.municipio, 120);
    text(input.responsable, 160);
    text(input.ejecutivo, 160);
    if (typeof input.telefono !== 'string' || !/^\+?[0-9 ()-]{7,22}$/.test(input.telefono)) throw new ProvisionError(400, 'datos_aliado_invalidos');
    if (!Array.isArray(input.vendedores) || input.vendedores.length < 1 || input.vendedores.length > 5) throw new ProvisionError(400, 'vendedores_invalidos');
    const vendedores = input.vendedores.map(s => {
      if (!s || typeof s !== 'object') throw new ProvisionError(400, 'vendedores_invalidos');
      return { nombre: text(`${text(s.nombres, 100)} ${text(s.apellidos, 100)}`, 160) };
    });
    const headers = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };
    // Match both name AND city. Never move an existing link to another store.
    type Origin = { codigo: string; nombre: string; ciudad: string | null; tipo: string; activo: boolean };
    const origins: Origin[] = [];
    for (let offset = 0; ; offset += 1000) {
      if (offset >= 100000) throw new ProvisionError(503, 'aprovisionamiento_no_disponible');
      const response = await fetcher(`${DB}origenes?select=codigo,nombre,ciudad,tipo,activo&order=codigo&limit=1000&offset=${offset}`, { headers: { ...headers, Prefer: 'count=exact' } });
      if (!response.ok) throw new ProvisionError(503, 'aprovisionamiento_no_disponible');
      const page = await response.json() as Origin[];
      if (!Array.isArray(page)) throw new ProvisionError(503, 'aprovisionamiento_no_disponible');
      origins.push(...page);
      const total = Number(response.headers.get('content-range')?.split('/')[1]);
      if (page.length < 1000) {
        if (Number.isFinite(total) && total > origins.length) throw new ProvisionError(503, 'aprovisionamiento_no_disponible');
        break;
      }
    }
    const matches = origins.filter(o => normalized(o.nombre || '') === normalized(nombre) && normalized(o.ciudad || '') === normalized(ciudad));
    if (matches.length > 1 || matches.some(o => o.tipo !== 'aliado' || !o.activo)) throw new ProvisionError(409, 'tienda_en_conflicto');
    const identity = `${normalized(nombre)}|${normalized(ciudad)}`;
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)))].map(v => v.toString(16).padStart(2, '0')).join('');
    const slug = normalized(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'TIENDA';
    const codigo = matches[0]?.codigo || `AL-${slug}-${digest.slice(0, 12)}`.toUpperCase();
    let token = await hashOpaqueToken(`alta-aliado:v1:${codigo}`, env.ALLY_TOKEN_DERIVATION_SECRET);
    if (input.enlace_existente !== undefined) {
      if (typeof input.enlace_existente !== 'string' || !/^https:\/\/registro\.crediteksas\.com\/creditek\/erp\/registro\?t=[A-Za-z0-9_-]{43}$/.test(input.enlace_existente)) throw new ProvisionError(409, 'enlace_incompatible');
      token = input.enlace_existente.slice(PUBLIC_LINK.length);
      let context;
      try { context = await resolveRegistrationContext(token, env, fetcher); }
      catch { throw new ProvisionError(409, 'enlace_incompatible'); }
      if (!matches.length || context.tipo !== 'tienda' || context.origen.codigo !== codigo || normalized(context.origen.nombre) !== normalized(nombre)) throw new ProvisionError(409, 'enlace_incompatible');
    }
    const rpc = await fetcher(`${DB}rpc/aprovisionar_aliado_registro`, {
      method: 'POST', headers, body: JSON.stringify({
        p_codigo: codigo, p_nombre: nombre, p_ciudad: ciudad, p_vendedores: vendedores,
        p_token_hash: await hashOpaqueToken(token, env.TOKEN_HASH_SECRET), p_token_sufijo: token.slice(-6),
      }),
    });
    if (!rpc.ok) {
      const error = await rpc.json().catch(() => ({})) as { message?: string };
      if (/enlace_activo_incompatible|codigo_origen_en_conflicto|captadores_duplicados_normalizados/.test(error.message || '')) throw new ProvisionError(409, 'alta_en_conflicto');
      throw new ProvisionError(503, 'aprovisionamiento_no_disponible');
    }
    const rows = await rpc.json() as Array<{ codigo: string; enlace_creado: boolean; vendedores_procesados: number }>;
    const result = rows?.[0];
    if (rows.length !== 1 || result.codigo !== codigo || typeof result.enlace_creado !== 'boolean' || !Number.isInteger(result.vendedores_procesados)) throw new ProvisionError(503, 'aprovisionamiento_no_disponible');
    return reply(200, { ok: true, codigo, enlace: `${PUBLIC_LINK}${token}`, vendedores: result.vendedores_procesados, enlace_creado: result.enlace_creado });
  } catch (error) {
    return reply(error instanceof ProvisionError ? error.status : 503, { ok: false, error: error instanceof ProvisionError ? error.message : 'aprovisionamiento_no_disponible' });
  }
}
