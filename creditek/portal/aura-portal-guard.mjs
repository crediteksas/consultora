import {
  auraAuth,
  hasPermission,
  loginUrlFor,
  portalDecision,
} from '../agentes/aura-auth.mjs';

export const AURA_LOGIN_PATH = '/creditek/agentes/';
export const decidePortalAccess = (session, access) => portalDecision({ session, access });

export async function guardPortal({ location = window.location } = {}) {
  const access = await auraAuth.restore();
  const decision = decidePortalAccess(auraAuth.session(), access);
  if (decision === 'redirect') {
    location.replace(loginUrlFor(`${location.pathname}${location.search}${location.hash}`));
    return { decision, access: null };
  }
  if (decision === 'deny') return { decision, access };
  return { decision, access, grant: access.apps.find(app => app.app_id === 'portal_b2b') };
}

export async function auraPortalFetch(path, options = {}) {
  const token = await auraAuth.token();
  if (!token) throw new Error('Sesión vencida');
  const response = await fetch(`https://aura-b2b-api.comercial-853.workers.dev${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (response.status === 401) {
    auraAuth.clear();
    location.replace(loginUrlFor(`${location.pathname}${location.search}${location.hash}`));
    throw new Error('Sesión vencida');
  }
  return response;
}

export { auraAuth, hasPermission };
