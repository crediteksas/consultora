import { OrganicError } from './organic-model.mjs';
export class GraphFailure extends Error {
  constructor(status, code, ambiguous = false) { super(`META_${status}_${code}`); this.ambiguous = ambiguous; }
}
export async function graph(env, token, path, params = {}, method = 'GET') {
  if (!token) throw new OrganicError('META_TOKEN_MISSING', 503);
  if (!/^[\d_]+(?:\/(?:photos|media|media_publish|insights))?$/.test(path) && path !== 'me/permissions') throw new OrganicError('GRAPH_PATH_DENIED', 500);
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/${path}`);
  const init = { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000), redirect: 'manual' };
  if (method === 'GET') for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else { init.headers['content-type'] = 'application/x-www-form-urlencoded'; init.body = new URLSearchParams(params); }
  let response;
  try { response = await fetch(url, init); } catch { throw new GraphFailure('NETWORK', 'UNKNOWN', method === 'POST'); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.error) throw new GraphFailure(response.status, data?.error?.code || 'INVALID_RESPONSE', method === 'POST' && (response.status >= 500 || !data));
  return data;
}
export async function connection(env) {
  const page = await graph(env, env.META_ACCESS_TOKEN, env.META_PAGE_ID, { fields: 'id,name,access_token,instagram_business_account{id,username}' });
  if (String(page.id) !== env.META_PAGE_ID || !page.access_token) throw new OrganicError('PAGE_ACCESS_NOT_CONFIRMED', 503);
  const permissions = await graph(env, env.META_ACCESS_TOKEN, 'me/permissions');
  const granted = new Set(permissions.data?.filter(x => x.status === 'granted').map(x => x.permission));
  const missing = {
    facebook: ['pages_manage_posts', 'pages_read_engagement'].filter(x => !granted.has(x)),
    instagram: ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement'].filter(x => !granted.has(x)),
    measurement: ['read_insights', 'instagram_manage_insights'].filter(x => !granted.has(x)),
  };
  if (!page.instagram_business_account?.id) missing.instagram.push('INSTAGRAM_PAGE_CONNECTION');
  return { token: page.access_token, page_id: page.id, page_name: page.name, instagram_id: page.instagram_business_account?.id || null, instagram_username: page.instagram_business_account?.username || null, missing };
}
export function publicConnection(c, env) {
  const { token, ...safe } = c;
  return { ...safe, automation_enabled: env.ORGANIC_AUTOMATION_ENABLED === 'true', supported_formats: ['image'], checked_at: new Date().toISOString() };
}
export async function verifyPublication(env, c, channel, id) {
  const row = await graph(env, c.token, id, { fields: channel === 'facebook' ? 'id,is_published,permalink_url' : 'id,permalink,media_type' });
  const link = channel === 'facebook' ? row.permalink_url : row.permalink;
  const expectedHost = channel === 'facebook' ? /^(www\.)?facebook\.com$/ : /^(www\.)?instagram\.com$/;
  if (String(row.id) !== id || !link || (channel === 'facebook' && row.is_published !== true)) throw new OrganicError('PUBLICATION_NOT_YET_VERIFIED', 502);
  const parsed = new URL(link);
  if (parsed.protocol !== 'https:' || !expectedHost.test(parsed.hostname)) throw new OrganicError('INVALID_META_PERMALINK', 502);
  return link;
}
export async function metrics(env, c, channel, id, publishedAt, now = Date.now()) {
  const result = { source: 'meta', observed_at: new Date(now).toISOString(), age_hours: (now - Date.parse(publishedAt)) / 3600000, reach: null, likes: null, comments: null, shares: null, saved: null, errors: [] };
  const scalar = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  try {
    const fields = channel === 'facebook' ? 'reactions.type(LIKE).limit(0).summary(true),comments.limit(0).summary(true),shares' : 'like_count,comments_count';
    const row = await graph(env, c.token, id, { fields });
    result.likes = scalar(channel === 'facebook' ? row.reactions?.summary?.total_count : row.like_count);
    result.comments = scalar(channel === 'facebook' ? row.comments?.summary?.total_count : row.comments_count);
    if (channel === 'facebook') result.shares = scalar(row.shares?.count);
  } catch (e) { result.errors.push(e.message); }
  // Request metrics independently: a retired/unsupported metric cannot erase others.
  for (const [name, target] of (channel === 'facebook' ? [['post_impressions_unique', 'reach']] : [['reach', 'reach'], ['saved', 'saved'], ['shares', 'shares']])) {
    try {
      const row = await graph(env, c.token, `${id}/insights`, { metric: name });
      const metric = row.data?.find(d => d.name === name);
      result[target] = scalar(metric?.values?.[0]?.value ?? metric?.total_value?.value);
    } catch (e) { result.errors.push(`${name}:${e.message}`); }
  }
  return result;
}
