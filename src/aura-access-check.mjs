import { AURA_CAPABILITIES } from './aura-access-policy.mjs';
import { authenticateAuraCapability } from './aura-enlaces-proxy.mjs';

const ALLOWED = new Set(Object.values(AURA_CAPABILITIES));

export async function handleAuraAccessCheck(request, fetcher = fetch) {
  if (request.method !== 'GET') return Response.json({ allowed: false }, { status: 405 });
  const capability = new URL(request.url).searchParams.get('capability') || '';
  if (!ALLOWED.has(capability)) return Response.json({ allowed: false }, { status: 400 });
  const authenticated = await authenticateAuraCapability(request, capability, fetcher);
  return Response.json({ allowed: Boolean(authenticated) }, {
    status: authenticated ? 200 : 403,
    headers: { 'cache-control': 'no-store' },
  });
}
