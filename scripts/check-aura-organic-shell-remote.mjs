// Read-only deployment guard/postflight. Never prints credentials or user data.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const after = process.argv.includes('--after');
const account = '853eee9e3d80f805fee58f4f99507e8a';
const zone = '4117c7a89e988ae0869c02755ffa77ab';
const hash = value => createHash('sha256').update(value).digest('hex');
const token = (await readFile('/Users/oscarm/.wrangler/config/default.toml', 'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!token) throw Error('Cloudflare session required');
async function get(path) {
  const r = await fetch('https://api.cloudflare.com/client/v4' + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error(`Read failed: HTTP ${r.status}`);
  return r;
}
const worker = `/accounts/${account}/workers`;
const routes = (await (await get(`/zones/${zone}/workers/routes`)).json()).result;
const expectedRoutes = [
  ['acd144edaa3e4db3950f54ba359a58e0', 'aura.crediteksas.com/creditek/agentes/index.html'],
  ['6f5b652665c941f0a3455ed29a01a60c', 'aura.crediteksas.com/creditek/agentes/'],
  ['217f0ed75c1b4760854a4ef53ea946f0', 'aura.crediteksas.com/creditek/agentes/*'],
].sort();
const actual = routes.filter(r => r.script === 'creditek-aura-shell').map(r => [r.id, r.pattern]).sort();
if (JSON.stringify(actual) !== JSON.stringify(expectedRoutes)) throw Error('Shell route ownership changed');
const settings = (await (await get(`${worker}/scripts/creditek-aura-shell/settings`)).json()).result;
if (settings.bindings.length || settings.compatibility_date !== '2026-07-23' || settings.compatibility_flags.length) throw Error('Shell bindings/runtime changed');
const parts = await (await get(`${worker}/services/creditek-aura-shell/environments/production/content`)).formData();
const moduleHashes = {};
for (const [name, part] of parts) moduleHashes[name] = hash(typeof part === 'string' ? part : await part.text());
const expectedHashes = after ? [hash(await readFile('dist/aura-organic-shell/worker.mjs'))] : [
  'd9c8cf7a34212a457638c4ff004ea24a2690dada05854c8b2dee106f452e25a4',
  '7fd3fa9663b863c2fe32e6906392acd78e8dc44567e9887087c390d1a23aeacf',
];
if (JSON.stringify(Object.values(moduleHashes).sort()) !== JSON.stringify(expectedHashes.sort())) throw Error('Remote code differs from expected reviewed state');
const deployment = (await (await get(`${worker}/scripts/creditek-aura-shell/deployments`)).json()).result.deployments[0];
const pages = [];
for (const path of ['/creditek/agentes/?source=pwa', '/creditek/agentes/index.html']) {
  const r = await fetch('https://aura.crediteksas.com' + path, { signal: AbortSignal.timeout(30000) });
  const html = await r.text();
  const stripped = html.replace(/<a[^>]+data-organic-app-(?:nav|card)[^]*?<\/a>/g, '');
  if (r.status !== 200 || hash(stripped) !== '7fd3fa9663b863c2fe32e6906392acd78e8dc44567e9887087c390d1a23aeacf') throw Error('Unexpected public shell HTML');
  if (after && (!html.includes('data-organic-app-card') || r.headers.get('x-aura-organic-app-release') !== '20261011-shell')) throw Error('New navigation not served');
  pages.push({ path, status: r.status, navigation: html.includes('data-organic-app-card'), originalSha256: hash(stripped) });
}
console.log(JSON.stringify({ after, worker: 'creditek-aura-shell', deployment, moduleHashes, routesPreserved: actual, pages }));
