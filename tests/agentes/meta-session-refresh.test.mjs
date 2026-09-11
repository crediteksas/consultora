import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaSessionToken } from '../../creditek/agentes/agente3-meta-session.mjs';
import { AURA_AUTH } from '../../creditek/agentes/aura-auth.mjs';

function memory(session) {
  const values = new Map(session ? [[AURA_AUTH.storage, JSON.stringify(session)]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const expired = { access_token: 'old', refresh_token: 'refresh-old', expires_at: 100 };
const fresh = { access_token: 'fresh', refresh_token: 'refresh-new', expires_at: 5000 };

for (const persistent of [true, false]) {
  test(`renews expired ${persistent ? 'persistent' : 'temporary'} session once for concurrent requests`, async () => {
    const storage = memory(persistent ? expired : null);
    const transientStorage = memory(persistent ? null : expired);
    let calls = 0;
    const token = createMetaSessionToken({ storage, transientStorage, now: () => 200000,
      fetchImpl: async (url, options) => {
        calls++;
        assert.match(url, /grant_type=refresh_token/);
        assert.deepEqual(JSON.parse(options.body), { refresh_token: 'refresh-old' });
        return Response.json(fresh);
      } });
    assert.deepEqual(await Promise.all([token(), token(), token()]), ['fresh', 'fresh', 'fresh']);
    assert.equal(calls, 1);
    assert.equal(JSON.parse((persistent ? storage : transientStorage).getItem(AURA_AUTH.storage)).access_token, 'fresh');
    assert.equal((persistent ? transientStorage : storage).getItem(AURA_AUTH.storage), null);
    assert.equal(await token(), 'fresh');
    assert.equal(calls, 1);
  });
}

test('uses changes made by the shell and respects logout', async () => {
  const storage = memory(fresh);
  const token = createMetaSessionToken({ storage, transientStorage: memory(), now: () => 200000,
    fetchImpl: () => { throw new Error('Unexpected network'); } });
  assert.equal(await token(), 'fresh');
  storage.setItem(AURA_AUTH.storage, JSON.stringify({ ...fresh, access_token: 'shell-renewed' }));
  assert.equal(await token(), 'shell-renewed');
  storage.removeItem(AURA_AUTH.storage);
  assert.equal(await token(), '');
});

test('does not send an expired token when renewal is rejected', async () => {
  const storage = memory(expired);
  const token = createMetaSessionToken({ storage, transientStorage: memory(), now: () => 200000,
    fetchImpl: async () => Response.json({ error: 'invalid_grant' }, { status: 400 }) });
  assert.equal(await token(), '');
  assert.equal(storage.getItem(AURA_AUTH.storage), null);
});
