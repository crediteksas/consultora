import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const originalFetch = globalThis.fetch;
const token = 'test-session-token';
const origin = 'https://registro.crediteksas.com';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function env(overrides: Record<string, unknown> = {}) {
  return {
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'public-anon-key',
    META_ACCESS_TOKEN: 'server-only-meta-token',
    META_AD_ACCOUNT_ID: 'act_123',
    META_GRAPH_VERSION: 'v25.0',
    ALLOWED_ORIGIN: origin,
    RATE_LIMIT_PER_MINUTE: '30',
    RATE_LIMITER: { idFromName: () => 'id', get: () => ({ fetch: () => json({ allowed: true }) }) },
    ...overrides,
  } as any;
}

function request(path = '/v1/dashboard', bearer = token, method = 'GET') {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { origin, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
  });
}

function mockNetwork(permissions = ['meta_ads.access', 'meta_ads.read']) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return json({ id: 'u1', email: 'owner@example.com', banned_until: null });
    if (url.endsWith('/rest/v1/rpc/aura_my_access')) return json({
      user_id: 'u1', email: 'owner@example.com', active: true,
      apps: [{ app_id: 'meta_ads', role_id: 'meta_ads.reader', permissions }],
    });
    if (url.endsWith('/rest/v1/rpc/aura_meta_ads_my_access')) return json({ active: true, role_id: 'meta_ads.reader', permissions });
    if (url.endsWith('/rest/v1/rpc/aura_record_action')) return json(true);
    if (url.includes('/act_123/insights')) return json({ data: [{ spend: '10000', impressions: '1000', clicks: '50', reach: '800', frequency: '1.25', ctr: '5', cpc: '200', cpm: '10000', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '4' }] }] });
    if (url.includes('/act_123/campaigns')) return json({ data: [{ id: 'c1', name: 'Campaña 1', effective_status: 'ACTIVE', daily_budget: '50000' }] });
    throw new Error(`unexpected ${url}`);
  }) as any;
}

beforeEach(() => { globalThis.fetch = originalFetch; });

describe('AURA Meta Ads read-only worker', () => {
  it('rejects a user without a session', async () => {
    const response = await worker.fetch(request('/v1/dashboard', ''), env());
    expect(response.status).toBe(401);
  });

  it('rejects a user without meta_ads.read and never calls Meta', async () => {
    mockNetwork(['meta_ads.access']);
    const response = await worker.fetch(request(), env());
    expect(response.status).toBe(403);
    expect((globalThis.fetch as any).mock.calls.some(([url]: [unknown]) => String(url).includes('graph.facebook.com'))).toBe(false);
  });

  it('returns normalized real metrics to a reader and audits the query', async () => {
    mockNetwork();
    const response = await worker.fetch(request(), env());
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.metrics).toMatchObject({ spend: 10000, impressions: 1000, clicks: 50, conversions: 4 });
    expect(body.campaigns).toHaveLength(1);
    expect((globalThis.fetch as any).mock.calls.some(([url]: [unknown]) => String(url).includes('aura_record_action'))).toBe(true);
  });

  it('fails closed when audit is unavailable', async () => {
    mockNetwork();
    const base = globalThis.fetch as any;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('aura_record_action')) return json({}, 503);
      return base(input, init);
    }) as any;
    const response = await worker.fetch(request(), env());
    expect(response.status).toBe(503);
  });

  it('sanitizes an invalid Meta token error', async () => {
    mockNetwork();
    const base = globalThis.fetch as any;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('graph.facebook.com')) return json({ error: { message: 'token secret value', code: 190 } }, 401);
      return base(input, init);
    }) as any;
    const response = await worker.fetch(request(), env());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('token secret value');
  });

  it('enforces rate limiting before querying Meta', async () => {
    mockNetwork();
    const response = await worker.fetch(request(), env({ RATE_LIMITER: { idFromName: () => 'id', get: () => ({ fetch: () => json({ allowed: false, retry_after: 30 }, 429) }) } }));
    expect(response.status).toBe(429);
  });

  it('rejects every write method in phase one', async () => {
    mockNetwork(['meta_ads.access', 'meta_ads.read', 'meta_ads.manage']);
    const response = await worker.fetch(request('/v1/campaigns/c1/pause', token, 'POST'), env());
    expect(response.status).toBe(405);
  });

  it('fails safely when the Meta secret is absent', async () => {
    mockNetwork();
    const response = await worker.fetch(request(), env({ META_ACCESS_TOKEN: '' }));
    expect(response.status).toBe(503);
  });

  it('normalizes a partial Meta response without inventing attribution', async () => {
    mockNetwork();
    const base = globalThis.fetch as any;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/act_123/insights')) return json({ data: [{ spend: '5000' }] });
      if (String(input).includes('/act_123/campaigns')) return json({ data: [] });
      return base(input, init);
    }) as any;
    const response = await worker.fetch(request(), env());
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.metrics).toMatchObject({ spend: 5000, clicks: 0, impressions: 0, roas_estimated: null });
    expect(body.attribution.status).toBe('unavailable');
  });

  it('denies an inactive AURA user', async () => {
    mockNetwork();
    const base = globalThis.fetch as any;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/rest/v1/rpc/aura_my_access')) return json({ user_id: 'u1', email: 'owner@example.com', active: false, apps: [] });
      return base(input, init);
    }) as any;
    expect((await worker.fetch(request(), env())).status).toBe(401);
  });

  it('rejects foreign origins', async () => {
    const foreign = new Request('https://worker.test/v1/dashboard', { headers: { origin: 'https://evil.test', authorization: `Bearer ${token}` } });
    expect((await worker.fetch(foreign, env())).status).toBe(403);
  });
});
