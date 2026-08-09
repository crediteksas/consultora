import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const originalFetch = globalThis.fetch;
const token = 'test-session-token';
const origin = 'https://registro.crediteksas.com';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function env(overrides: Record<string, unknown> = {}) {
  const publications = new Map<string, unknown>();
  return {
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'public-anon-key',
    META_ACCESS_TOKEN: 'server-only-meta-token',
    META_AD_ACCOUNT_ID: 'act_123',
    META_GRAPH_VERSION: 'v25.0',
    META_PAGE_ID: 'page-1',
    META_INSTAGRAM_ACTOR_ID: 'ig-1',
    ALLOWED_ORIGIN: origin,
    RATE_LIMIT_PER_MINUTE: '30',
    RATE_LIMITER: { idFromName: () => 'id', get: () => ({ fetch: () => json({ allowed: true }) }) },
    PUBLISH_COORDINATOR: {
      idFromName: (key: string) => key,
      get: (key: string) => ({
        fetch: async (_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body || '{}'));
          if (body.action === 'get') return publications.has(key) ? json({ state: 'completed', result: publications.get(key) }) : json({ state: 'new' });
          if (body.action === 'reserve') return publications.has(key) ? json({ state: 'completed', result: publications.get(key) }) : json({ state: 'reserved' });
          if (body.action === 'complete') { publications.set(key, body.result); return json({ state: 'completed' }); }
          return json({ state: 'unknown' }, 400);
        },
      }),
    },
    ...overrides,
  } as any;
}

function request(path = '/v1/dashboard', bearer = token, method = 'GET', body?: unknown, idempotencyKey?: string) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { origin, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function mockNetwork(permissions = ['meta_ads.access', 'meta_ads.read']) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return json({ id: 'u1', email: 'owner@example.com', banned_until: null });
    if (url.endsWith('/rest/v1/rpc/aura_my_access')) return json({
      user_id: 'u1', email: 'owner@example.com', active: true,
      apps: [{ app_id: 'meta_ads', role_id: 'meta_ads.reader', permissions }],
    });
    if (url.endsWith('/rest/v1/rpc/aura_meta_ads_my_access')) return json({ active: true, role_id: 'meta_ads.reader', permissions });
    if (url.endsWith('/rest/v1/rpc/aura_meta_ads_record_action')) return json(true);
    if (url.endsWith('/rest/v1/rpc/aura_meta_ads_record_publish')) return json({ ok: true });
    if (url.endsWith('/rest/v1/rpc/aura_meta_ads_ready_pieces')) return json([{ id: 'piece-1', headline: 'Estrena hoy', copy: 'Sujeto a aprobación de crédito. Aplican términos y condiciones.', imagen_url: 'https://cdn.test/piece.jpg', plataformas: ['facebook', 'instagram'], estado: 'lista_para_publicar' }]);
    if (url.endsWith('/rest/v1/rpc/aura_meta_ads_ready_cities')) return json([
      { id: 'retail-tolu', name: 'Tolú', country_code: 'CO', origin: 'retail', active: true },
      { id: 'aliado-apartado', name: 'Apartadó', country_code: 'CO', origin: 'aliado', active: true },
    ]);
    if (url.includes('/debug_token')) return json({ data: { app_id: '123456789', is_valid: true, scopes: ['ads_management', 'business_management'] } });
    if (url.includes('/search?')) return json({ data: [{ key: '123', name: 'Tolú', type: 'city', country_code: 'CO' }] });
    if (url.includes('/page-1?')) return json({ id: 'page-1', name: 'Creditek', instagram_business_account: { id: '17841400000000000', username: 'creditek' } });
    if (url.includes('/act_123/instagram_accounts?')) return json({ data: [{ id: '17841400000000000', username: 'creditek' }] });
    if (url.includes('/campaign-existing/adsets?')) return json({ data: [{ id: 'adset-1', campaign_id: 'campaign-existing', name: 'Tolú · Tráfico · 5–6 agosto · conjunto', status: 'PAUSED', effective_status: 'PAUSED', daily_budget: '6000', start_time: '2026-08-05T12:00:00-0500', end_time: '2026-08-06T23:59:00-0500', targeting: { geo_locations: { cities: [{ key: '123' }] }, publisher_platforms: ['facebook','instagram'] } }] });
    if (url.includes('/campaign-existing?')) return json({ id: 'campaign-existing', account_id: '123', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', effective_status: 'PAUSED' });
    if (url.includes('/act_123/campaigns') && init?.method === 'POST') return json({ id: 'campaign-1' });
    if (url.includes('/act_123/adimages')) return json({ images: { 'pieza.png': { hash: 'image-hash-1' } } });
    if (url.includes('/act_123/adsets')) return json({ id: 'adset-1' });
    if (url.includes('/act_123/adcreatives')) return json({ id: 'creative-1' });
    if (url.includes('/act_123/ads')) return json({ id: 'ad-1' });
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
    expect((globalThis.fetch as any).mock.calls.some(([url]: [unknown]) => String(url).includes('aura_meta_ads_record_action'))).toBe(true);
  });

  it('fails closed when audit is unavailable', async () => {
    mockNetwork();
    const base = globalThis.fetch as any;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('aura_meta_ads_record_action')) return json({}, 503);
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

describe('AURA Meta Ads secure publisher', () => {
  const publishPermissions = ['meta_ads.access','meta_ads.read','meta_ads.publish','meta_ads.manage','meta_ads.budget.manage'];
  const payload = {
    piece_id: 'piece-1', cities: ['retail-tolu'], platforms: ['facebook','instagram'], objective: 'OUTCOME_TRAFFIC',
    budget_type: 'daily', budget_cop: 6000, start_date: '2026-08-05', end_date: '2026-08-06', copy: 'Sujeto a aprobación de crédito. Aplican términos y condiciones.',
    headline: 'Estrena hoy', cta: 'LEARN_MORE', image_url: 'https://cdn.test/piece.jpg', campaign_name: 'Tolú · Tráfico · 5–6 agosto', final_confirmation: true,
  };

  it('lists only approved pieces and official cities for an authorized publisher', async () => {
    mockNetwork(publishPermissions);
    const response = await worker.fetch(request('/v1/publisher/options'), env());
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.pieces).toEqual([expect.objectContaining({ id: 'piece-1', estado: 'lista_para_publicar' })]);
    expect(body.cities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'retail-tolu', name: 'Tolú', origin: 'retail' }),
      expect.objectContaining({ id: 'aliado-apartado', name: 'Apartadó', origin: 'aliado' }),
    ]));
    expect((globalThis.fetch as any).mock.calls.some(([url]: [unknown]) => String(url).endsWith('/rest/v1/rpc/aura_meta_ads_ready_cities'))).toBe(true);
    expect((globalThis.fetch as any).mock.calls.some(([url]: [unknown]) => String(url).includes('/debug_token'))).toBe(true);
  });

  it('reports the Page-linked Instagram actor only when the ad account exposes it', async () => {
    mockNetwork(publishPermissions);
    const response = await worker.fetch(request('/v1/publisher/options'), env());
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.instagram).toEqual({
      ready: true,
      page_id: 'page-1',
      actor_id: '17841400000000000',
      source: 'instagram_business_account',
    });
    expect((globalThis.fetch as any).mock.calls.some(([url]: [unknown]) => String(url).includes('/act_123/instagram_accounts?'))).toBe(true);
  });

  it('requires all publishing permissions and never calls Meta when one is missing', async () => {
    mockNetwork(['meta_ads.access','meta_ads.read','meta_ads.manage']);
    const response = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'publish-1'), env());
    expect(response.status).toBe(403);
    expect((globalThis.fetch as any).mock.calls.some(([url]: [unknown]) => String(url).includes('graph.facebook.com'))).toBe(false);
  });

  it('requires explicit final confirmation and an idempotency key', async () => {
    mockNetwork(publishPermissions);
    expect((await worker.fetch(request('/v1/publisher/publish', token, 'POST', { ...payload, final_confirmation: false }, 'publish-1'), env())).status).toBe(409);
    expect((await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload), env())).status).toBe(400);
  });

  it('crea campaña, conjunto, creativo y anuncio pausados en un solo flujo seguro', async () => {
    mockNetwork(publishPermissions);
    const response = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'publish-1'), env());
    const body = await response.json() as any;
    expect(response.status).toBe(201);
    expect(body.meta_ids).toEqual({ campaign_id: 'campaign-1', adset_id: 'adset-1', creative_id: 'creative-1', ad_id: 'ad-1' });
    expect(body.status).toBe('PAUSED');
    const metaCalls = (globalThis.fetch as any).mock.calls.filter(([url]: [unknown]) => String(url).includes('graph.facebook.com'));
    expect(metaCalls.every(([, init]: [unknown, RequestInit]) => !String(init?.body || '').includes('server-only-meta-token'))).toBe(true);
    const campaignCall = metaCalls.find(([url]: [unknown]) => String(url).includes('/act_123/campaigns'));
    expect(String(campaignCall?.[1]?.body)).toContain('buying_type=AUCTION');
    const campaignBody = String(campaignCall?.[1]?.body);
    expect(campaignBody).toContain('name=Tol%C3%BA+%C2%B7+Tr%C3%A1fico+%C2%B7+5%E2%80%936+agosto');
    expect(campaignBody).toContain('objective=OUTCOME_TRAFFIC');
    expect(campaignBody).not.toContain('objective=LINK_CLICKS');
    expect(campaignBody).toContain('status=PAUSED');
    expect(campaignBody).toContain('buying_type=AUCTION');
    expect(campaignBody).toContain('special_ad_categories=%5B%5D');
    expect(campaignBody).toContain('is_adset_budget_sharing_enabled=false');
    const adsetBody = String(metaCalls.find(([url]: [unknown]) => String(url).includes('/act_123/adsets'))?.[1]?.body);
    expect(adsetBody).toContain('daily_budget=6000');
    expect(adsetBody).not.toContain('lifetime_budget');
    expect(metaCalls.some(([url]: [unknown]) => String(url).includes('/act_123/adcreatives'))).toBe(true);
    expect(metaCalls.some(([url]: [unknown]) => String(url).includes('/act_123/ads'))).toBe(true);
  });

  it('alinea presupuesto total con lifetime_budget y fechas Meta', async () => {
    mockNetwork(publishPermissions);
    const response = await worker.fetch(request('/v1/publisher/publish', token, 'POST', { ...payload, budget_type: 'lifetime', budget_cop: 120000 }, 'publish-total'), env());
    expect(response.status).toBe(201);
    const adsetCall = (globalThis.fetch as any).mock.calls.find(([url]: [unknown]) => String(url).includes('/act_123/adsets'));
    const body = String(adsetCall?.[1]?.body);
    expect(body).toContain('lifetime_budget=120000');
    expect(body).not.toContain('daily_budget');
    expect(body).toContain('start_time=');
    expect(body).toContain('end_time=');
  });

  it('acepta imagen manual validada y la sube a Meta sin URL pública', async () => {
    mockNetwork(publishPermissions);
    const image = { name: 'pieza.png', mime_type: 'image/png', bytes_base64: 'iVBORw0KGgoAAAANSUhEUg==' };
    const response = await worker.fetch(request('/v1/publisher/publish', token, 'POST', { ...payload, piece_id: 'manual', image_url: '', image_data: image }, 'publish-image'), env());
    expect(response.status).toBe(201);
    const upload = (globalThis.fetch as any).mock.calls.find(([url]: [unknown]) => String(url).includes('/act_123/adimages'));
    expect(String(upload?.[1]?.body)).toContain('bytes=iVBORw0KGgoAAAANSUhEUg%3D%3D');
    const creative = (globalThis.fetch as any).mock.calls.find(([url]: [unknown]) => String(url).includes('/act_123/adcreatives'));
    expect(String(creative?.[1]?.body)).toContain('image_hash');
  });

  it('continúa la campaña existente y crea conjunto, creativo y anuncio pausados sin crear otra campaña', async () => {
    mockNetwork(publishPermissions);
    const response = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'complete-existing'), env({ META_CONTINUE_CAMPAIGN_ID: 'campaign-existing' }));
    const body = await response.json() as any;
    expect(response.status).toBe(201);
    expect(body.meta_ids).toEqual({ campaign_id: 'campaign-existing', adset_id: 'adset-1', creative_id: 'creative-1', ad_id: 'ad-1' });
    expect(body.statuses).toEqual({ campaign: 'PAUSED', adset: 'PAUSED', creative: 'PAUSED', ad: 'PAUSED' });
    const metaCalls = (globalThis.fetch as any).mock.calls.filter(([url]: [unknown]) => String(url).includes('graph.facebook.com'));
    expect(metaCalls.some(([url, init]: [unknown, RequestInit]) => String(url).includes('/act_123/campaigns') && init?.method === 'POST')).toBe(false);
    expect(metaCalls.some(([url, init]: [unknown, RequestInit]) => String(url).includes('/act_123/adsets') && init?.method === 'POST')).toBe(false);
    expect(String(metaCalls.find(([url]: [unknown]) => String(url).includes('/act_123/ads'))?.[1]?.body)).toContain('status=PAUSED');
  });

  it('audita progresivamente cada objeto antes de crear el siguiente', async () => {
    mockNetwork(publishPermissions);
    const response = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'audit-existing'), env({ META_CONTINUE_CAMPAIGN_ID: 'campaign-existing' }));
    expect(response.status).toBe(201);
    const audits = (globalThis.fetch as any).mock.calls
      .filter(([url]: [unknown]) => String(url).includes('/rest/v1/rpc/aura_meta_ads_record_publish'))
      .map(([, init]: [unknown, RequestInit]) => JSON.parse(String(init?.body || '{}')).p_meta_ids);
    expect(audits).toEqual([
      { campaign_id: 'campaign-existing', adset_id: 'adset-1' },
      { campaign_id: 'campaign-existing', adset_id: 'adset-1', creative_id: 'creative-1' },
      { campaign_id: 'campaign-existing', adset_id: 'adset-1', creative_id: 'creative-1', ad_id: 'ad-1' },
    ]);
  });

  it('reabre únicamente la campaña controlada con una llave versionada y audita antes del creativo', async () => {
    mockNetwork(publishPermissions);
    const coordinatorName = vi.fn((key: string) => key);
    const coordinator = {
      idFromName: coordinatorName,
      get: () => ({
        fetch: async (_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body || '{}'));
          return body.action === 'reserve' ? json({ state: 'reserved' }) : json({ state: 'completed' });
        },
      }),
    };
    const response = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'controlled-reopen'), env({
      META_CONTINUE_CAMPAIGN_ID: 'campaign-existing', PUBLISH_COORDINATOR: coordinator,
    }));
    expect(response.status).toBe(201);
    expect(coordinatorName).toHaveBeenCalledWith('complete_campaign_campaign-existing_instagram_assignment_v2');
    const audits = (globalThis.fetch as any).mock.calls
      .filter(([url]: [unknown]) => String(url).includes('/rest/v1/rpc/aura_meta_ads_record_publish'))
      .map(([, init]: [unknown, RequestInit]) => JSON.parse(String(init?.body || '{}')));
    expect(audits[0]).toMatchObject({
      p_status: 'REOPENED',
      p_meta_ids: { campaign_id: 'campaign-existing', adset_id: 'adset-1' },
    });
    const creativeCall = (globalThis.fetch as any).mock.calls.findIndex(([url]: [unknown]) => String(url).includes('/act_123/adcreatives'));
    const reopenAudit = (globalThis.fetch as any).mock.calls.findIndex(([url]: [unknown]) => String(url).includes('/rest/v1/rpc/aura_meta_ads_record_publish'));
    expect(reopenAudit).toBeLessThan(creativeCall);
  });

  it('descubre el actor desde la página vinculada y reutiliza el conjunto pausado existente', async () => {
    mockNetwork(publishPermissions);
    const response = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'linked-instagram'), env({ META_CONTINUE_CAMPAIGN_ID: 'campaign-existing' }));
    expect(response.status).toBe(201);
    const metaCalls = (globalThis.fetch as any).mock.calls.filter(([url]: [unknown]) => String(url).includes('graph.facebook.com'));
    expect(metaCalls.some(([url, init]: [unknown, RequestInit]) => String(url).includes('/act_123/adsets') && init?.method === 'POST')).toBe(false);
    const creativeBody = String(metaCalls.find(([url]: [unknown]) => String(url).includes('/act_123/adcreatives'))?.[1]?.body);
    expect(creativeBody).toContain('instagram_actor_id%22%3A%2217841400000000000');
    expect(creativeBody).not.toContain('instagram_actor_id%22%3A%22ig-1');
  });

  it('detiene la publicación antes del creativo si el actor de la Page no está asignado a la cuenta publicitaria', async () => {
    mockNetwork(publishPermissions);
    const base = globalThis.fetch as any;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/act_123/instagram_accounts?')) return json({ data: [] });
      return base(input, init);
    }) as any;
    const response = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'unassigned-instagram'), env({ META_CONTINUE_CAMPAIGN_ID: 'campaign-existing' }));
    const body = await response.json() as any;
    expect(response.status).toBe(502);
    expect(body.reason).toBe('META_INSTAGRAM_ACTOR_RESOLUTION_FAILED');
    expect((globalThis.fetch as any).mock.calls.some(([url]: [unknown]) => String(url).includes('/act_123/adcreatives'))).toBe(false);
  });

  it('returns the completed result for the same idempotency key without creating a second campaign', async () => {
    mockNetwork(publishPermissions);
    const testEnv = env();
    const first = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'publish-once'), testEnv);
    const callsAfterFirst = (globalThis.fetch as any).mock.calls.filter(([url]: [unknown]) => String(url).includes('/act_123/campaigns')).length;
    const second = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'publish-once'), testEnv);
    const callsAfterSecond = (globalThis.fetch as any).mock.calls.filter(([url]: [unknown]) => String(url).includes('/act_123/campaigns')).length;
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  it('closes a failed idempotency key and never repeats the Meta write', async () => {
    mockNetwork(publishPermissions);
    const base = globalThis.fetch as any;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/act_123/campaigns') && init?.method === 'POST') return json({ error: { code: 100 } }, 400);
      return base(input, init);
    }) as any;
    const testEnv = env();
    const first = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'publish-failed'), testEnv);
    const firstBody = await first.clone().json() as any;
    const callsAfterFirst = (globalThis.fetch as any).mock.calls.filter(([url]: [unknown]) => String(url).includes('/act_123/campaigns')).length;
    const second = await worker.fetch(request('/v1/publisher/publish', token, 'POST', payload, 'publish-failed'), testEnv);
    const callsAfterSecond = (globalThis.fetch as any).mock.calls.filter(([url]: [unknown]) => String(url).includes('/act_123/campaigns')).length;
    expect(first.status).toBe(502);
    expect(firstBody.reason).toBe('META_CAMPAIGN_CREATE_FAILED');
    expect(second.status).toBe(200);
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });
});
