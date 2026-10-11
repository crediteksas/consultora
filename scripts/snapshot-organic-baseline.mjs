// Read-only production snapshot. Never saves credential-bearing settings.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = '/private/tmp/aura-organic-baseline-20261011';
await mkdir(dir, { recursive: true });
const config = await readFile('/Users/oscarm/.wrangler/config/default.toml', 'utf8');
const token = config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!token) throw Error('CLOUDFLARE_SESSION_REQUIRED');
const root = 'https://api.cloudflare.com/client/v4/accounts/853eee9e3d80f805fee58f4f99507e8a';
const headers = { Authorization: `Bearer ${token}` };
for (const worker of ['creditek-aura', 'aura-meta-ads-api']) {
  const res = await fetch(`${root}/workers/services/${worker}/environments/production/content`, { headers });
  if (!res.ok) throw Error(`SNAPSHOT_${worker}_${res.status}`);
  const form = await res.formData();
  for (const [name, part] of form) {
    if (!/^[\w.-]+$/.test(name)) throw Error('UNSAFE_MODULE_NAME');
    const bytes = typeof part === 'string' ? part : await part.text();
    await writeFile(`${dir}/${worker}-${name}`, bytes);
    console.log(JSON.stringify({ worker, module: name, sha256: createHash('sha256').update(bytes).digest('hex') }));
  }
  const r = await fetch(`${root}/workers/scripts/${worker}/settings`, { headers });
  const data = await r.json();
  console.log(JSON.stringify({ worker, bindings: data.result?.bindings?.map(b => ({ name: b.name, type: b.type })) }));
}
