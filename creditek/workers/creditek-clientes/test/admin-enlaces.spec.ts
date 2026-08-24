import { describe, expect, it } from 'vitest';
import {
  createOriginLink,
  listOriginLinks,
  revokeOriginLink,
  type AdminEnlacesEnv,
} from '../src/admin-enlaces';

const ENV: AdminEnlacesEnv = {
  SUPABASE_SERVICE_KEY: 'service-key',
  TOKEN_HASH_SECRET: 'hash-secret',
};
const LINK_ID = '11111111-1111-4111-8111-111111111111';

type Handler = (request: Request) => Response | Promise<Response>;

function mockFetch(handler: Handler, requests: Request[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    return handler(request);
  }) as typeof fetch;
}

describe('admin registration links', () => {
  it('lists active origins with executive, link metadata, and registration count', async () => {
    const response = await listOriginLinks(ENV, mockFetch((request) => {
      if (request.url.includes('/origenes?')) return Response.json([{
        codigo: 'CK-01', nombre: 'Creditek Centro', tipo: 'propia', ciudad: 'Corozal', ejecutivo_id: null,
      }, {
        codigo: 'AL-01', nombre: 'Aliado Uno', tipo: 'aliado', ciudad: 'Sincelejo', ejecutivo_id: 'exec-1',
      }]);
      if (request.url.includes('/enlaces_registro?')) return Response.json([{
        id: LINK_ID, origen_codigo: 'AL-01', token_sufijo: 'abcdefgh',
        created_at: '2026-08-23T10:00:00Z', ultima_utilizacion_at: null,
      }]);
      if (request.url.includes('/ejecutivos?')) return Response.json([{ id: 'exec-1', nombre: 'Luis' }]);
      if (request.method === 'HEAD' && request.url.includes('origen_codigo=eq.CK-01')) {
        return new Response(null, { headers: { 'Content-Range': '0-2/3' } });
      }
      if (request.method === 'HEAD' && request.url.includes('origen_codigo=eq.AL-01')) {
        return new Response(null, { headers: { 'Content-Range': '0-4/5' } });
      }
      return new Response(null, { status: 500 });
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        codigo: 'CK-01', nombre: 'Creditek Centro', tipo: 'propia', ciudad: 'Corozal',
        ejecutivo_responsable: null, enlace_activo: null, total_registros: 3,
      },
      {
        codigo: 'AL-01', nombre: 'Aliado Uno', tipo: 'aliado', ciudad: 'Sincelejo',
        ejecutivo_responsable: 'Luis',
        enlace_activo: {
          id: LINK_ID, token_sufijo: 'abcdefgh', created_at: '2026-08-23T10:00:00Z', ultima_utilizacion_at: null,
        },
        total_registros: 5,
      },
    ]);
  });

  it('rejects creation when the origin already has an active link', async () => {
    const response = await createOriginLink(
      new Request('https://clientes.test/api/admin/enlaces', {
        method: 'POST', body: JSON.stringify({ origen_codigo: 'CK-01' }),
      }),
      ENV,
      mockFetch((request) => request.url.includes('/origenes?')
        ? Response.json([{ codigo: 'CK-01' }])
        : Response.json([{ id: LINK_ID }])),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'ya existe un enlace activo, revócalo primero' });
  });

  it('creates a cryptographic token, stores only its hash, and audits the action', async () => {
    const requests: Request[] = [];
    const response = await createOriginLink(
      new Request('https://clientes.test/api/admin/enlaces', {
        method: 'POST', body: JSON.stringify({ origen_codigo: 'CK-01' }),
      }),
      ENV,
      mockFetch(async (request) => {
        if (request.url.includes('/origenes?')) return Response.json([{ codigo: 'CK-01' }]);
        if (request.url.includes('/enlaces_registro?')) return Response.json([]);
        if (request.url.endsWith('/enlaces_registro') && request.method === 'POST') return Response.json([{ id: LINK_ID }]);
        if (request.url.endsWith('/audit_log')) return new Response(null, { status: 201 });
        return new Response(null, { status: 500 });
      }, requests),
    );

    expect(response.status).toBe(201);
    const body = await response.json() as { token_completo: string; url_completa: string };
    expect(body.token_completo).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.url_completa).toBe(`https://registro.crediteksas.com/creditek/erp/registro?t=${body.token_completo}`);
    const insert = requests.find((request) => request.url.endsWith('/enlaces_registro') && request.method === 'POST')!;
    const inserted = await insert.json() as { token_hash: string; token_sufijo: string };
    expect(inserted.token_hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inserted.token_hash).not.toBe(body.token_completo);
    expect(inserted.token_sufijo).toBe(body.token_completo.slice(-8));
    expect(requests.some((request) => request.url.endsWith('/audit_log'))).toBe(true);
  });

  it('revokes exactly one active link and audits the action', async () => {
    const requests: Request[] = [];
    const response = await revokeOriginLink(LINK_ID, ENV, mockFetch(async (request) => {
      if (request.url.includes('/enlaces_registro?')) return Response.json([{ id: LINK_ID, origen_codigo: 'CK-01' }]);
      if (request.url.endsWith('/audit_log')) return new Response(null, { status: 201 });
      return new Response(null, { status: 500 });
    }, requests));

    expect(response.status).toBe(200);
    const revoke = requests.find((request) => request.url.includes('/enlaces_registro?'))!;
    expect(revoke.method).toBe('PATCH');
    await expect(revoke.json()).resolves.toMatchObject({ activo: false });
    expect(requests.some((request) => request.url.endsWith('/audit_log'))).toBe(true);
  });
});
