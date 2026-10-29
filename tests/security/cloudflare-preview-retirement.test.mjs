import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TARGETS, TIMER, client, capture, apply, restoreChanges, hash, validateSnapshot } from '../../scripts/maintenance/cloudflare-retire-previews.mjs';

const NOW = new Date('2026-10-29T12:00:00Z');
function fixture() {
  const names = [...TARGETS, TIMER, 'aura-runtime-core-preview', 'creditek-kora'];
  const state = Object.fromEntries(names.map(name => [name, {
    settings: { bindings: [], compatibility_date: '2026-09-01' }, script: { observability: { enabled: true } },
    subdomain: { enabled: true, previews_enabled: true }, schedules: name === TIMER ? [{ cron: '*/5 * * * *' }] : [], etag: `fictional-${name}`,
    deployment: { deployments: [{id:`fictional-deployment-${name}`,created_on:NOW.toISOString(),versions:[{version_id:`fictional-version-${name}`,percentage:100}]}] },
  }]));
  const writes = []; const config = { routes: [], domains: [], incoming: [], durable: [], outbounds: [], pagesFunction: false, tails: [], requests: 0 };
  const api = { account: 'a'.repeat(32), runtimeCodeHash: async () => '18e008ccd6a4a688cbf4834b79d2eef5311c5e87ddee40c2e74149b575958f25',
    async request(path, method = 'GET', body) {
      if (path === '/graphql') return { viewer: { accounts: [{ workersInvocationsAdaptive: [{ dimensions: { scriptName: TARGETS[0] }, sum: { requests: config.requests } }] }] } };
      if (path.startsWith('/zones?')) return [{ id: 'fictional-zone' }];
      if (path.endsWith('/workers/routes')) return structuredClone(config.routes);
      if (path.endsWith('/workers/domains')) return structuredClone(config.domains);
      if (path.endsWith('/workers/scripts')) return names.map(id => ({ id, etag: state[id].etag }));
      if (path.includes('/tails/by-consumer/')) return structuredClone(config.tails);
      const [name, endpoint] = path.split('/workers/scripts/')[1].split('/');
      if (endpoint === 'references') return { services: { incoming: structuredClone(config.incoming), outgoing: [], pages_function: config.pagesFunction }, durable_objects: structuredClone(config.durable), dispatch_outbounds: structuredClone(config.outbounds) };
      if (endpoint === 'deployments') return structuredClone(state[name].deployment);
      const key = endpoint === 'script-settings' ? 'script' : endpoint;
      if (method !== 'GET') {
        writes.push({ name, endpoint, method, body: structuredClone(body) });
        state[name][key] = structuredClone(body);
        await config.onWrite?.({ name, endpoint, method, body, count: writes.length, state });
      }
      return endpoint === 'schedules' ? { schedules: structuredClone(state[name][key]) } : structuredClone(state[name][key]);
    },
  };
  return { api, state, writes, config };
}
const saved = () => { const records = []; return { records, save: async row => records.push(structuredClone(row)) }; };

test('apply changes only eight public access settings and the old timer; explicit restore is exact', async () => {
  const f = fixture(); const before = structuredClone(f.state); const snapshot = await capture(f.api, NOW); const log = saved();
  const result = await apply(f.api, snapshot, hash(snapshot), log.save, NOW);
  assert.equal(result.status, 'applied'); assert.equal(f.writes.length, 9);
  assert.ok(f.writes.every(w => (TARGETS.includes(w.name) && w.endpoint === 'subdomain') || (w.name === TIMER && w.endpoint === 'schedules')));
  assert.deepEqual(f.state['creditek-kora'], before['creditek-kora']);
  assert.deepEqual(await restoreChanges(f.api, snapshot, result.attempted), []);
  assert.deepEqual(f.state, before);
});
test('reapplying a freshly captured already retired state makes no changes', async () => {
  const f = fixture(); let s = await capture(f.api, NOW); await apply(f.api,s,hash(s),saved().save,NOW);
  f.writes.length=0; s=await capture(f.api,NOW); await apply(f.api,s,hash(s),saved().save,NOW); assert.equal(f.writes.length,0);
});
for (const [label, modify] of [
  ['new traffic', f => { f.config.requests=1; }],
  ['incoming service', f => { f.config.incoming=[{service:'fictional-live-consumer'}]; }],
  ['route', f => { f.config.routes=[{pattern:'example.invalid/*',script:TARGETS[0]}]; }],
  ['tail consumer', f => { f.config.tails=[{producer:{service:'fictional-producer'}}]; }],
  ['Pages consumer', f => { f.config.pagesFunction=true; }],
  ['dispatch outbound', f => { f.config.outbounds=[{service:'fictional-dispatch'}]; }],
  ['custom domain', f => { f.config.domains=[{hostname:'fictional.example.invalid',service:TARGETS[0]}]; }],
  ['foreign Durable Object reference', f => { f.config.durable=[{service:'fictional-other-worker'}]; }],
  ['self Durable Object reference', f => { f.config.durable=[{service:TARGETS[0]}]; }],
  ['new schedule', f => { f.state[TARGETS[0]].schedules=[{cron:'0 * * * *'}]; }],
  ['protected code drift', f => { f.state['creditek-kora'].etag='new-fictional-etag'; }],
  ['protected configuration drift', f => { f.state['creditek-kora'].settings.bindings=[{type:'plain_text',name:'FAKE_FLAG',text:'changed'}]; }],
  ['changed runtime source', f => { f.api.runtimeCodeHash=async()=> '0'.repeat(64); }],
  ['asset version drift', f => { f.state[TARGETS[0]].deployment.deployments[0].versions[0].version_id='fictional-new-assets'; }],
  ['missing active deployment', f => { f.state[TARGETS[0]].deployment.deployments=[]; }],
]) test(`preflight rejects ${label} without a mutation`, async () => {
  const f=fixture(); const s=await capture(f.api,NOW); modify(f);
  await assert.rejects(apply(f.api,s,hash(s),saved().save,NOW)); assert.equal(f.writes.length,0);
});
test('snapshot hash, age and mutation scope fail closed', async () => {
  const f=fixture(); const s=await capture(f.api,NOW);
  assert.throws(()=>validateSnapshot(s,'0'.repeat(64),NOW));
  assert.throws(()=>validateSnapshot(s,hash(s),new Date(NOW.getTime()+31*60000)));
  assert.throws(()=>validateSnapshot(s,hash(s),new Date(NOW.getTime()-1000)));
  s.operations.push({name:'creditek-kora',type:'subdomain',method:'POST',before:{enabled:true,previews_enabled:true},after:{enabled:false,previews_enabled:false}});
  assert.throws(()=>validateSnapshot(s,hash(s),NOW));
});
test('ambiguous network failure after a write restores every attempted change', async () => {
  const f=fixture(); const before=structuredClone(f.state); const s=await capture(f.api,NOW);
  f.config.onWrite=({count})=>{if(count===3)throw Error('fictional ambiguous response');};
  await assert.rejects(apply(f.api,s,hash(s),saved().save,NOW),/rolled-back/); assert.deepEqual(f.state,before);
});
test('journal write failure after a mutation still attempts restoration', async () => {
  const f=fixture();const before=structuredClone(f.state);const s=await capture(f.api,NOW);let calls=0;
  const save=async()=>{if(++calls>=3)throw Error('fictional disk error');};
  await assert.rejects(apply(f.api,s,hash(s),save,NOW),/rolled-back/);assert.deepEqual(f.state,before);
});
test('rollback does not overwrite a concurrent access change', async () => {
  const f=fixture();const s=await capture(f.api,NOW);
  f.config.onWrite=({count,state})=>{if(count===2){state[TARGETS[0]].subdomain={enabled:false,previews_enabled:true};throw Error('fictional failure');}};
  const log=saved();await assert.rejects(apply(f.api,s,hash(s),log.save,NOW),/rollback-needs-attention/);
  assert.deepEqual(f.state[TARGETS[0]].subdomain,{enabled:false,previews_enabled:true});assert.equal(log.records.at(-1).rollbackFailures.length,1);
});
test('restore refuses to reopen changed Worker code', async () => {
  const f=fixture();const s=await capture(f.api,NOW);const receipt=await apply(f.api,s,hash(s),saved().save,NOW);
  f.state[TARGETS[0]].etag='fictional-new-code'; const failures=await restoreChanges(f.api,s,receipt.attempted);
  assert.deepEqual(failures,[`${TARGETS[0]}/subdomain`]);assert.deepEqual(f.state[TARGETS[0]].subdomain,{enabled:false,previews_enabled:false});
});
test('restore refuses to reopen changed assets when a Worker has no JavaScript ETag', async () => {
  const f=fixture();f.state[TARGETS[0]].etag=null;const s=await capture(f.api,NOW);
  const receipt=await apply(f.api,s,hash(s),saved().save,NOW);
  f.state[TARGETS[0]].deployment.deployments[0].versions[0].version_id='fictional-new-assets';
  assert.deepEqual(await restoreChanges(f.api,s,receipt.attempted),[`${TARGETS[0]}/subdomain`]);
  assert.deepEqual(f.state[TARGETS[0]].subdomain,{enabled:false,previews_enabled:false});
});
test('transport cannot delete resources, deploy, change bindings or change production access', async () => {
  const calls=[];const api=client('a'.repeat(32),'fictional-token',async(u,o)=>{calls.push([u,o]);return new Response(JSON.stringify({success:true,result:{enabled:false,previews_enabled:false}}));});
  for(const [path,method,body] of [
    [`/accounts/${api.account}/workers/scripts/${TARGETS[0]}`,'DELETE'],
    [`/accounts/${api.account}/workers/scripts/${TARGETS[0]}/settings`,'PATCH',{bindings:[]}],
    [`/accounts/${api.account}/workers/scripts/creditek-kora/subdomain`,'POST',{enabled:false,previews_enabled:false}],
    [`/accounts/${api.account}/workers/scripts/${TIMER}/deployments`,'POST',{}],
    ['/graphql','POST',{query:'mutation Forbidden { destroyEverything }'}],
    [`/accounts/${api.account}/workers/scripts/${TARGETS[0]}/subdomain`,'POST',{enabled:false,previews_enabled:false,unapproved:true}],
  ]) await assert.rejects(api.request(path,method,body));
  assert.equal(calls.length,0);
  await api.request(`/accounts/${api.account}/workers/scripts/${TARGETS[0]}/subdomain`,'POST',{enabled:false,previews_enabled:false});assert.equal(calls.length,1);
});

const syntheticSource = 'export const config = { flags: { agent4_consumer_enabled: false } };';
const multipart = (bodies, boundary='fictional-boundary') => bodies.map((body,i)=>`--${boundary}\r\nContent-Disposition: form-data; name="worker${i}.js"; filename="worker${i}.js"\r\nContent-Type: application/javascript\r\n\r\n${body}\r\n`).join('')+`--${boundary}--\r\n`;
test('runtime pin reader handles plain and multipart modules with exact content hashes', async () => {
  for (const [body,type] of [[syntheticSource,'application/javascript'],[multipart([syntheticSource]),'multipart/form-data; boundary="fictional-boundary"']]) {
    const api=client('a'.repeat(32),'fictional-token',async()=>new Response(body,{headers:{'content-type':type}}));
    assert.equal(await api.runtimeCodeHash(),createHash('sha256').update(syntheticSource).digest('hex'));
  }
});
for (const [label,body,type,status] of [
  ['enabled consumer',syntheticSource.replace('false','true'),'application/javascript',200],
  ['missing flag','export default {};','application/javascript',200],
  ['multiple modules',multipart([syntheticSource,'export const extra=1;']),'multipart/form-data; boundary=fictional-boundary',200],
  ['empty multipart','--fictional-boundary--\r\n','multipart/form-data; boundary=fictional-boundary',200],
  ['unavailable source','fictional denied','text/plain',403],
]) test(`runtime pin reader rejects ${label}`, async () => {
  const api=client('a'.repeat(32),'fictional-token',async()=>new Response(body,{status,headers:{'content-type':type}}));
  await assert.rejects(api.runtimeCodeHash());
});
