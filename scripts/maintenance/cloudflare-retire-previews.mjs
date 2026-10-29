import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const TARGETS = Object.freeze([
  'aura-agent1-design-preview', 'aura-agent4-v1-1-preview',
  'aura-hub-staging', 'aura-hub-staging-image-proxy',
  'aura-kora-agents-preview', 'aura-ux-preview',
  'aura-commercial-kpis-api-staging', 'creditek-integrations',
]);
export const TIMER = 'aura-agent4-api-core-preview';
const RUNTIME = 'aura-runtime-core-preview';
// Pin the published module whose disabled consumer flag was inspected before authorization.
const RUNTIME_CODE_SHA256 = '18e008ccd6a4a688cbf4834b79d2eef5311c5e87ddee40c2e74149b575958f25';
const CLOSED = { enabled: false, previews_enabled: false };
const canonical = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const equal = (a, b) => canonical(a) === canonical(b);
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const fingerprint = (settings, script) => hash({ settings: pick(settings, ['bindings', 'compatibility_date', 'compatibility_flags', 'usage_model', 'limits', 'assets', 'placement', 'migrations']), script });
const subdomain = value => {
  assert.equal(typeof value.enabled, 'boolean'); assert.equal(typeof value.previews_enabled, 'boolean');
  return pick(value, ['enabled', 'previews_enabled']);
};
const schedules = value => {
  assert.ok(Array.isArray(value.schedules));
  return value.schedules.map(row => { assert.equal(typeof row.cron, 'string'); return { cron: row.cron }; }).sort((a,b) => a.cron.localeCompare(b.cron));
};
const deployment = value => {
  assert.ok(Array.isArray(value.deployments) && value.deployments.length > 0, 'Active deployment unavailable');
  const latest = [...value.deployments].sort((a,b) => a.created_on.localeCompare(b.created_on)).at(-1);
  assert.ok(typeof latest.id === 'string' && Array.isArray(latest.versions) && latest.versions.length > 0);
  const versions = latest.versions.map(v => {
    assert.ok(typeof v.version_id === 'string' && Number.isFinite(v.percentage) && v.percentage > 0);
    return pick(v, ['version_id', 'percentage']);
  }).sort((a,b) => a.version_id.localeCompare(b.version_id));
  assert.equal(versions.reduce((sum,v) => sum + v.percentage, 0), 100);
  return { id: latest.id, versions };
};

// This adapter has no DELETE, deployment, storage or binding mutation capability.
export function client(account, token, transport = fetch) {
  assert.match(account, /^[a-f0-9]{32}$/);
  const prefix = `/accounts/${account}`;
  const allowed = new Map(TARGETS.map(name => [`${prefix}/workers/scripts/${name}/subdomain`, 'POST']));
  allowed.set(`${prefix}/workers/scripts/${TIMER}/schedules`, 'PUT');
  return {
    account,
    async request(path, method = 'GET', body) {
      if (method !== 'GET') {
        assert.ok((path === '/graphql' && method === 'POST' && /^query\b/.test(body?.query ?? '')) || allowed.get(path) === method, 'Mutation outside approved scope');
        if (path.endsWith('/subdomain')) { subdomain(body); assert.deepEqual(Object.keys(body).sort(), ['enabled', 'previews_enabled']); }
        if (path.endsWith('/schedules')) assert.ok(Array.isArray(body) && body.every(x => Object.keys(x).length === 1 && typeof x.cron === 'string'));
      }
      const response = await transport(`https://api.cloudflare.com/client/v4${path}`, {
        method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok || result.success === false || result.errors?.length) throw new Error(`Cloudflare request failed: ${method} ${path.split('/').at(-1)} HTTP ${response.status}`);
      return path === '/graphql' ? result.data : result.result;
    },
    async runtimeCodeHash() {
      const response = await transport(`https://api.cloudflare.com/client/v4${prefix}/workers/scripts/${RUNTIME}/content/v2`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.status, 200, 'Runtime source unavailable');
      const content = await response.text(); const boundary = (response.headers.get('content-type') ?? '').match(/boundary="?([^";]+)"?/i)?.[1];
      const modules = boundary ? content.split(`--${boundary}`).flatMap(block => {
        const at = block.indexOf('\r\n\r\n');
        return at >= 0 && /javascript|typescript|text\/|json/i.test(block.slice(0, at)) ? [block.slice(at + 4).replace(/\r\n$/, '')] : [];
      }) : [content];
      assert.equal(modules.length, 1, 'Unexpected runtime source layout');
      assert.match(modules[0], /agent4_consumer_enabled:\s*false\b/, 'Consumer flag is no longer disabled');
      return createHash('sha256').update(modules[0]).digest('hex');
    },
  };
}

export async function capture(api, now = new Date()) {
  const prefix = `/accounts/${api.account}`;
  const runtimeCodeHash = await api.runtimeCodeHash();
  assert.equal(runtimeCodeHash, RUNTIME_CODE_SHA256, 'Runtime code differs from the inspected disabled consumer');
  const list = await api.request(`${prefix}/workers/scripts`);
  assert.ok(Array.isArray(list) && list.length > 0 && list.length < 100, 'Unexpected or potentially truncated Worker list');
  const names = list.map(w => w.id).sort();
  for (const name of [...TARGETS, TIMER, RUNTIME]) assert.ok(names.includes(name), `Missing expected Worker ${name}`);
  const domains = await api.request(`${prefix}/workers/domains`);
  const zones = await api.request(`/zones?account.id=${api.account}&per_page=50`);
  assert.ok(Array.isArray(domains) && Array.isArray(zones) && zones.length < 50);
  const routes = [];
  for (const zone of zones) {
    const entries = await api.request(`/zones/${zone.id}/workers/routes`);
    assert.ok(Array.isArray(entries));
    routes.push(...entries.map(r => pick(r, ['pattern', 'script', 'environment'])));
  }
  const workers = {};
  for (let i = 0; i < names.length; i += 4) {
    await Promise.all(names.slice(i, i + 4).map(async name => {
      const path = `${prefix}/workers/scripts/${name}`;
      const [settings, script, cron, publicAccess, deployments] = await Promise.all([
        api.request(`${path}/settings`), api.request(`${path}/script-settings`),
        api.request(`${path}/schedules`), api.request(`${path}/subdomain`), api.request(`${path}/deployments`),
      ]);
      assert.ok(Array.isArray(settings.bindings), 'Bindings unavailable');
      const metadata = list.find(w => w.id === name);
      // Secret values are never saved: plain text configuration is hashed in memory.
      workers[name] = {
        fingerprint: fingerprint(settings, script),
        codeEtag: metadata.etag ?? null,
        deployment: deployment(deployments),
        subdomain: subdomain(publicAccess), schedules: schedules(cron),
      };
    }));
  }
  const targets = {};
  for (const name of TARGETS) {
    const path = `${prefix}/workers/scripts/${name}`;
    const [refs, tails] = await Promise.all([api.request(`${path}/references`), api.request(`${prefix}/workers/tails/by-consumer/${name}`)]);
    assert.ok(Array.isArray(refs.services?.incoming) && Array.isArray(tails), 'Dependency evidence unavailable');
    assert.ok(!refs.services.incoming.length && !refs.services.pages_function && !(refs.dispatch_outbounds ?? []).length && !tails.length, `Dependency on ${name}`);
    // This lot had no DO bindings at audit time. Refuse every DO reference,
    // including self references, without depending on reference direction.
    assert.equal((refs.durable_objects ?? []).length, 0, `Durable Object reference on ${name}`);
    assert.ok(!routes.some(r => r.script === name) && !domains.some(d => d.service === name), `Public route on ${name}`);
    assert.ok(!workers[name].schedules.length, `Unexpected cron on ${name}`);
    targets[name] = workers[name].subdomain;
  }
  const start = new Date(now.getTime() - 30 * 86400000).toISOString();
  const data = await api.request('/graphql', 'POST', {
    query: 'query RetirementUsage($account: string,$start: string,$end: string){viewer{accounts(filter:{accountTag:$account}){workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$start,datetime_leq:$end}){dimensions{scriptName}sum{requests}}}}}',
    variables: { account: api.account, start, end: now.toISOString() },
  });
  const accounts = data?.viewer?.accounts;
  assert.ok(Array.isArray(accounts) && accounts.length === 1);
  const usage = accounts[0].workersInvocationsAdaptive;
  assert.ok(Array.isArray(usage) && usage.length < 1000, 'Usage unavailable or truncated');
  const counts = Object.fromEntries(TARGETS.map(name => [name, usage.filter(row => row.dimensions.scriptName === name).reduce((sum,row) => sum + row.sum.requests, 0)]));
  for (const [name, count] of Object.entries(counts)) assert.equal(count, 0, `New activity on ${name}`);
  assert.ok(equal(workers[TIMER].schedules, [{ cron: '*/5 * * * *' }]) || !workers[TIMER].schedules.length, 'Unexpected timer configuration');
  return { schema: 1, capturedAt: now.toISOString(), account: api.account, runtimeCodeHash, names, workers, targets, counts,
    routingHash: hash({ domains, routes: routes.sort((a,b) => a.pattern.localeCompare(b.pattern)) }),
    operations: [...TARGETS.map(name => ({ name, type: 'subdomain', method: 'POST', before: targets[name], after: CLOSED })),
      { name: TIMER, type: 'schedules', method: 'PUT', before: workers[TIMER].schedules, after: [] }],
  };
}

export function validateSnapshot(snapshot, expectedHash, now = new Date()) {
  assert.equal(hash(snapshot), expectedHash, 'Snapshot hash mismatch');
  assert.equal(snapshot.schema, 1); assert.match(snapshot.account, /^[a-f0-9]{32}$/);
  const age = now.getTime() - new Date(snapshot.capturedAt).getTime();
  assert.ok(age >= 0 && age <= 30 * 60000, 'Snapshot is stale or from the future');
  assert.deepEqual(Object.keys(snapshot.targets).sort(), [...TARGETS].sort());
  const expected = [...TARGETS.map(name => ({ name, type: 'subdomain', method: 'POST', before: subdomain(snapshot.workers[name].subdomain), after: CLOSED })),
    { name: TIMER, type: 'schedules', method: 'PUT', before: snapshot.workers[TIMER].schedules, after: [] }];
  assert.ok(equal(expected, snapshot.operations), 'Altered mutation scope');
}

export async function restoreChanges(api, snapshot, attempted) {
  validateSnapshot(snapshot, hash(snapshot), new Date(snapshot.capturedAt));
  assert.equal(api.account, snapshot.account);
  assert.ok(attempted.every(op => snapshot.operations.some(expected => equal(expected, op))), 'Unexpected rollback operation');
  const failures = [];
  for (const op of [...attempted].reverse()) {
    try {
      const prefix = `/accounts/${api.account}/workers/scripts/${op.name}`;
      const [current, settings, script, list, deployments] = await Promise.all([
        api.request(`${prefix}/${op.type}`), api.request(`${prefix}/settings`), api.request(`${prefix}/script-settings`),
        api.request(`/accounts/${api.account}/workers/scripts`), api.request(`${prefix}/deployments`),
      ]);
      const value = op.type === 'subdomain' ? subdomain(current) : schedules(current);
      if (equal(value, op.before)) continue;
      const metadata = list.find(w => w.id === op.name);
      assert.ok(metadata && (metadata.etag ?? null) === snapshot.workers[op.name].codeEtag && fingerprint(settings, script) === snapshot.workers[op.name].fingerprint, 'Worker changed; do not reopen different code');
      assert.ok(equal(deployment(deployments), snapshot.workers[op.name].deployment), 'Active version changed; do not reopen different assets');
      assert.ok(equal(value, op.after), 'Concurrent change prevents rollback');
      await api.request(`${prefix}/${op.type}`, op.method, op.before);
      const result = await api.request(`${prefix}/${op.type}`);
      assert.ok(equal(op.type === 'subdomain' ? subdomain(result) : schedules(result), op.before));
    } catch { failures.push(`${op.name}/${op.type}`); }
  }
  return failures;
}

export async function apply(api, snapshot, expectedHash, save, now = new Date()) {
  validateSnapshot(snapshot, expectedHash, now); assert.equal(api.account, snapshot.account);
  const fresh = await capture(api, now);
  assert.ok(equal({ ...fresh, capturedAt: null }, { ...snapshot, capturedAt: null }), 'Live state changed after backup');
  const journal = { status: 'applying', snapshotHash: expectedHash, before: snapshot, attempted: [] };
  await save(journal); // durable write before the first API mutation
  try {
    for (const op of snapshot.operations) {
      const path = `/accounts/${api.account}/workers/scripts/${op.name}/${op.type}`;
      const current = await api.request(path);
      const value = op.type === 'subdomain' ? subdomain(current) : schedules(current);
      assert.ok(equal(value, op.before), `Concurrent change on ${op.name}`);
      if (equal(op.before, op.after)) continue;
      journal.attempted.push(op); await save(journal); // record even an ambiguous network result
      await api.request(path, op.method, op.after);
      const observed = await api.request(path);
      assert.ok(equal(op.type === 'subdomain' ? subdomain(observed) : schedules(observed), op.after), `Readback failed on ${op.name}`);
    }
    const after = await capture(api, now);
    assert.ok(equal(snapshot.names, after.names) && snapshot.routingHash === after.routingHash, 'Worker inventory or routing changed');
    for (const name of snapshot.names) {
      const expected = structuredClone(snapshot.workers[name]);
      if (TARGETS.includes(name)) expected.subdomain = CLOSED;
      if (name === TIMER) expected.schedules = [];
      assert.ok(equal(expected, after.workers[name]), `Protected state drift on ${name}`);
    }
    journal.status = 'applied'; journal.after = after; await save(journal); return journal;
  } catch (error) {
    journal.status = 'rolling-back';
    try { await save(journal); } catch { journal.journalWriteFailed = true; }
    const failures = await restoreChanges(api, snapshot, journal.attempted);
    journal.status = failures.length ? 'rollback-needs-attention' : 'rolled-back'; journal.rollbackFailures = failures;
    try { await save(journal); } catch { journal.journalWriteFailed = true; }
    throw new Error(`${journal.status}: ${error.message}`);
  }
}

async function main() {
  const [mode, snapshotFile, expectedHash, journalFile] = process.argv.slice(2);
  assert.ok(['capture', 'apply', 'restore'].includes(mode) && snapshotFile, 'Use capture <file>, apply <snapshot> <hash> <journal>, or restore <receipt> <hash> <journal>');
  const root = process.env.CREDITEK_REPOSITORY; assert.ok(root, 'CREDITEK_REPOSITORY is required');
  const account = JSON.parse(await readFile(`${root}/.wrangler/cache/wrangler-account.json`, 'utf8')).account.id;
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    const config = await readFile(`${process.env.HOME}/.wrangler/config/default.toml`, 'utf8');
    token = config.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1] ?? config.match(/^api_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
  }
  assert.ok(token, 'Existing authentication unavailable');
  const api = client(account, token);
  if (mode === 'capture') {
    const snapshot = await capture(api); await writeFile(snapshotFile, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ mode, snapshotHash: hash(snapshot), workerCount: snapshot.names.length, operations: snapshot.operations.length }));
  } else if (mode === 'apply') {
    assert.ok(expectedHash && journalFile, 'Pinned snapshot hash and new journal file required');
    const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
    // Reserve the receipt so another invocation cannot overwrite an earlier operation.
    await writeFile(journalFile, '{}', { flag: 'wx', mode: 0o600 });
    const result = await apply(api, snapshot, expectedHash, value => writeFile(journalFile, JSON.stringify(value, null, 2), { mode: 0o600 }));
    console.log(JSON.stringify({ status: result.status, changed: result.attempted.length, workerCount: result.after.names.length }));
  } else {
    assert.ok(expectedHash && journalFile, 'Pinned receipt hash and new journal file required');
    const receipt = JSON.parse(await readFile(snapshotFile, 'utf8'));
    assert.equal(hash(receipt), expectedHash, 'Receipt hash mismatch'); assert.equal(receipt.status, 'applied');
    assert.equal(hash(receipt.before), receipt.snapshotHash);
    await writeFile(journalFile, '{}', { flag: 'wx', mode: 0o600 });
    const result = { status: 'restoring', sourceReceiptHash: expectedHash };
    await writeFile(journalFile, JSON.stringify(result), { mode: 0o600 });
    result.failures = await restoreChanges(api, receipt.before, receipt.attempted);
    result.status = result.failures.length ? 'restore-needs-attention' : 'restored';
    await writeFile(journalFile, JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result)); if (result.failures.length) process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
