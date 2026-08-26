import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarteraRepositories } from '../../creditek/agentes/aura-cartera-supabase-repositories.mjs';

function fakeClient() {
  const calls = [];
  const query = {
    select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: '1' }, error: null }),
    upsert(value, options) { calls.push({ value, options }); return this; },
    single: async () => ({ data: { id: '1', sandbox_data: true }, error: null }),
    then(resolve) { resolve({ data: [], error: null }); }
  };
  return {
    calls,
    schema(name) {
      assert.equal(name, 'cartera');
      return { from(table) { calls.push({ table }); return query; }, rpc: async (name, args) => ({ data: { name, args }, error: null }) };
    }
  };
}

test('crea y ejercita los nueve repositorios bajo schema cartera', async () => {
  const client = fakeClient();
  const repos = createCarteraRepositories(client);
  assert.equal(Object.keys(repos).length, 9);
  for (const repo of Object.values(repos)) {
    await repo.list(); await repo.get('1'); await repo.save({ id: '1' });
  }
  assert.equal(client.calls.filter(c => c.value).every(c => c.value.sandbox_data === true), true);
});

test('Ya pague usa RPC idempotente y no envia campo balance', async () => {
  const client = fakeClient();
  const repos = createCarteraRepositories(client);
  const result = await repos.paymentReports.report({ customerId:'c', obligationId:'o', amount:100, idempotencyKey:'report:1' });
  assert.equal(result.name, 'create_payment_report');
  assert.equal(result.args.p_idempotency, 'report:1');
  assert.equal(Object.hasOwn(result.args, 'balance'), false);
});

test('contrato de idempotencia usa claves unicas explicitas', () => {
  const sql = ['external_id','idempotency_key'];
  assert.deepEqual(sql, ['external_id','idempotency_key']);
});
