import { describe, expect, it } from 'vitest';
import { provisionAlly, type AllyProvisionEnv } from '../src/aliado-provision';
import { hashOpaqueToken } from '../src/registro-security';

const env: AllyProvisionEnv = { SUPABASE_SERVICE_KEY: 'service-test', TOKEN_HASH_SECRET: 'hash-test', ALLY_PROVISION_SECRET: 'provision-test', ALLY_TOKEN_DERIVATION_SECRET: 'derive-test' };
const payload = { radicado: 'test-001', nombre_comercial: 'Tienda Prueba', municipio: 'Corozal', responsable: 'Persona Prueba', ejecutivo: 'Ejecutivo Prueba', telefono: '3000000000', vendedores: [{ nombres: 'Ana', apellidos: 'Prueba' }] };
const request = (data: unknown = payload, headers: Record<string, string> = {}) => new Request('https://example.com/api/interno/aliados/aprovisionar', { method: 'POST', headers: { 'X-Creditek-Provision-Secret': env.ALLY_PROVISION_SECRET, ...headers }, body: JSON.stringify(data) });
const origin = { codigo: 'AL-EXISTENTE', nombre: 'Tienda Prueba', ciudad: 'Corozal', tipo: 'aliado', activo: true };
function backend(origins: unknown[] = [], rpcError?: string) {
  const calls: Request[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init); calls.push(req.clone());
    if (req.url.includes('/origenes?')) return Response.json(origins);
    if (rpcError) return Response.json({ message: rpcError }, { status: 400 });
    const args = await req.json() as any;
    return Response.json([{ codigo: args.p_codigo, enlace_creado: true, vendedores_procesados: args.p_vendedores.length }]);
  }) as typeof fetch;
  return { calls, fetcher };
}
describe('server-to-server ally provisioning', () => {
  it.each(['', 'wrong'])('rejects unauthorized secret %s without DB access', async secret => {
    const b = backend(); const r = await provisionAlly(request(payload, { 'X-Creditek-Provision-Secret': secret }), env, b.fetcher);
    expect(r.status).toBe(401); expect(b.calls).toHaveLength(0); expect(r.headers.has('access-control-allow-origin')).toBe(false);
  });
  it('rejects browser calls and non-POST methods', async () => {
    expect((await provisionAlly(request(payload, { Origin: 'https://registro.crediteksas.com' }), env)).status).toBe(403);
    expect((await provisionAlly(new Request('https://example.com', { method: 'OPTIONS' }), env)).status).toBe(405);
  });
  it('fails closed if configuration is missing', async () => {
    expect((await provisionAlly(request(), { ...env, ALLY_TOKEN_DERIVATION_SECRET: '' })).status).toBe(503);
  });
  it.each([{}, { ...payload, vendedores: [] }, { ...payload, telefono: '<bad>' }])('validates before DB writes', async data => {
    const b = backend(); expect((await provisionAlly(request(data), env, b.fetcher)).status).toBe(400); expect(b.calls).toHaveLength(0);
  });
  it('limits request size', async () => {
    expect((await provisionAlly(request({ data: 'x'.repeat(17000) }), env)).status).toBe(413);
  });
  it('creates a stable retry-safe link and sends only its hash to the RPC', async () => {
    const b = backend(); const r = await provisionAlly(request(), env, b.fetcher); const result = await r.json() as any;
    expect(r.status).toBe(200); expect(result.enlace).toMatch(/^https:\/\/registro\.crediteksas\.com\/creditek\/erp\/registro\?t=[A-Za-z0-9_-]{43}$/);
    const token = result.enlace.split('=')[1]; const args = await b.calls[1].json() as any;
    expect(args.p_token_hash).toBe(await hashOpaqueToken(token, env.TOKEN_HASH_SECRET)); expect(args.p_token_hash).not.toBe(token);
    expect(args.p_vendedores).toEqual([{ nombre: 'Ana Prueba' }]);
    const retry = await provisionAlly(request({ ...payload, radicado: 'test-002', nombre_comercial: 'TIENDA PRUEBA' }), env, backend().fetcher);
    expect((await retry.json() as any).enlace).toBe(result.enlace);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('reuses an existing origin by normalized name and city', async () => {
    const r = await provisionAlly(request({ ...payload, municipio: 'CORÓZAL' }), env, backend([origin]).fetcher);
    expect((await r.json() as any).codigo).toBe(origin.codigo);
  });
  it.each([{ origins: [origin, origin] }, { origins: [{ ...origin, tipo: 'propia' }] }, { origins: [{ ...origin, activo: false }] }])('rejects conflicting stores', async ({ origins }) => {
    const b = backend(origins); expect((await provisionAlly(request(), env, b.fetcher)).status).toBe(409); expect(b.calls).toHaveLength(1);
  });
  it('never replaces an incompatible active link', async () => {
    expect((await provisionAlly(request(), env, backend([origin], 'enlace_activo_incompatible').fetcher)).status).toBe(409);
  });
  it('rejects foreign link URLs before provisioning', async () => {
    const b = backend([origin]); expect((await provisionAlly(request({ ...payload, enlace_existente: 'https://evil.example/' }), env, b.fetcher)).status).toBe(409); expect(b.calls).toHaveLength(1);
  });
  it('hides internal errors and secrets', async () => {
    const r = await provisionAlly(request(), env, (async () => { throw Error('secret-service-test'); }) as typeof fetch);
    expect(r.status).toBe(503); expect(await r.text()).not.toContain('secret-service-test');
  });
});
