// Reviewed fallback to Cloudflare's documented PUT script endpoint. The versions
// path accepted assets.config but retained the previous runtime configuration.
// No asset upload, route/domain changes, backend deployment or secret reads.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const account = '853eee9e3d80f805fee58f4f99507e8a';
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const config = JSON.parse(await readFile('releases/aura-organic-20261011/wrangler.overlay.jsonc', 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const expected = '607f10ac992f105915feadedbbde64ca8bcdd4ecd9b9cac5c340d0a275b594f7';
const apply = process.argv.includes('--apply');
if (apply && execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) throw Error('Commit reviewed files before deployment');
const auth = (await readFile('/Users/oscarm/.wrangler/config/default.toml', 'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!auth) throw Error('Cloudflare login required');
const headers = { Authorization: `Bearer ${auth}` };
async function cf(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`Cloudflare HTTP ${response.status}`);
  return response;
}
const remote = await (await cf('/services/creditek-aura/environments/production/content')).formData();
const part = remote.get('worker.mjs');
if (sha(typeof part === 'string' ? part : await part.text()) !== expected) throw Error('Production changed: re-review before deployment');
const { result: settings } = await (await cf('/scripts/creditek-aura/settings')).json();
const names = settings.bindings.map(b => `${b.name}:${b.type}`).sort();
if (JSON.stringify(names) !== JSON.stringify(['ASSETS:assets', 'REGISTRATION_SERVICE:service', 'WORKER_SHARED_SECRET:secret_text'])) throw Error('Bindings changed');
const service = settings.bindings.find(b => b.name === 'REGISTRATION_SERVICE');
if (service.service !== 'creditek-clientes' || service.entrypoint !== 'AuraRegistrationGateway' || service.environment !== 'production') throw Error('Registration binding changed');
const code = await readFile('dist/aura-organic-overlay/worker.mjs', 'utf8');
if (code.length > 400000) throw Error('Unexpected bundle size');
const metadata = {
  main_module: 'worker.mjs', compatibility_date: config.compatibility_date,
  compatibility_flags: config.compatibility_flags,
  bindings: settings.bindings.filter(b => b.type !== 'secret_text'),
  keep_bindings: ['secret_text', 'plain_text', 'json'],
  keep_assets: true, assets: config.unsafe.metadata.assets,
};
console.log(JSON.stringify({ apply, target: 'creditek-aura', previousSha256: expected, nextSha256: sha(code), keep_assets: true, paths: metadata.assets.config.run_worker_first }));
if (apply) {
  const form = new FormData();
  form.set('metadata', JSON.stringify(metadata));
  form.set('worker.mjs', new Blob([code], { type: 'application/javascript+module' }), 'worker.mjs');
  const result = await (await cf('/scripts/creditek-aura', { method: 'PUT', body: form })).json();
  if (!result.success) throw Error('Deployment not confirmed');
  console.log(JSON.stringify({ deployed: true, version: result.result?.deployment_id, requiresPostflight: true }));
}
