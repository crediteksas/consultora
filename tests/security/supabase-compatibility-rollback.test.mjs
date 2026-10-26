import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { prepareTariffRollback } from '../../scripts/supabase-compat/tariff-rollback.mjs';

const catalogSql = await readFile(new URL('../../scripts/supabase-compat/catalog-query.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../supabase/migrations/20261021161019_kora_compat_select_krediya_price_rules.sql', import.meta.url), 'utf8');
const capture = async db => (await db.query(catalogSql)).rows[0].snapshot;
const normalized = ({ captured_at, ...s }) => ({ ...s, relations: s.relations.map(({ acl, ...r }) => r) });
const plan = (before, after) => prepareTariffRollback({ before, after, catalogSql });

async function fixture(extra = '') {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges revoke execute on functions from public;
    create function public.tiene_capacidad_aliados(text) returns boolean language sql security invoker
      as $$ select current_setting('fixture.reviewer', true) = 'yes' $$;
    grant execute on function public.tiene_capacidad_aliados(text) to authenticated;
    create table public.krediya_price_rules(id int primary key, referencia text);
    alter table public.krediya_price_rules enable row level security;
    create policy krediya_price_rules_select on public.krediya_price_rules for select to authenticated
      using(public.tiene_capacidad_aliados('revisor'));
    create policy krediya_price_rules_write on public.krediya_price_rules for all to authenticated
      using(public.tiene_capacidad_aliados('revisor')) with check(public.tiene_capacidad_aliados('revisor'));
    insert into public.krediya_price_rules values(1, 'FICTITIOUS_DEVICE');
    ${extra}
  `);
  return db;
}

test('post-commit rollback reverses only a newly added SELECT and restores effective catalog', async () => {
  const db = await fixture();
  try {
    const before = await capture(db);
    await db.exec(migration);
    const rollback = plan(before, await capture(db));
    assert.equal(rollback.action, 'revoke-added-select');
    await db.exec(rollback.sql);
    assert.deepEqual(normalized(await capture(db)), normalized(before));
    assert.doesNotMatch(rollback.sql, /FICTITIOUS_DEVICE|UPDATE pg_|DELETE FROM|GRANT ALL/i);
  } finally { await db.close(); }
});

test('legacy SELECT including grant option is preserved, never blindly revoked', async () => {
  for (const suffix of ['', ' with grant option']) {
    const db = await fixture(`grant select on public.krediya_price_rules to authenticated${suffix};`);
    try {
      const before = await capture(db);
      await db.exec(migration);
      const rollback = plan(before, await capture(db));
      assert.equal(rollback.action, 'no-op');
      assert.doesNotMatch(rollback.sql, /REVOKE SELECT ON TABLE/i);
      await db.exec(rollback.sql);
      assert.deepEqual(normalized(await capture(db)), normalized(before));
    } finally { await db.close(); }
  }
});

test('existing other-role grants are preserved exactly', async () => {
  const db = await fixture('grant select on public.krediya_price_rules to service_role;');
  try {
    const before = await capture(db);
    await db.exec(migration);
    await db.exec(plan(before, await capture(db)).sql);
    assert.deepEqual(normalized(await capture(db)), normalized(before));
  } finally { await db.close(); }
});

test('column-specific ACL backup is refused rather than removed by table REVOKE', async () => {
  const db = await fixture('grant select(id) on public.krediya_price_rules to authenticated;');
  try {
    const before = await capture(db);
    await db.exec(migration);
    const after = await capture(db);
    assert.throws(() => plan(before, after), /Column ACL backup/);
  } finally { await db.close(); }
});

test('rollback refuses incomplete catalog, missing target or unexpected grants', async () => {
  const db = await fixture();
  try {
    const before = await capture(db);
    await db.exec(migration);
    const after = await capture(db);
    for (const side of ['before', 'after']) for (const field of ['relations', 'functions', 'policies', 'defaults', 'role_config', 'schema_grants','triggers']) {
      const values = structuredClone({ before, after });
      delete values[side][field];
      assert.throws(() => plan(values.before, values.after), /Complete catalog/);
    }
    assert.throws(() => plan({ ...before, relations: [] }, after), /Exactly one/);
    await db.exec('grant insert on public.krediya_price_rules to authenticated;');
    const unexpected = await capture(db);
    assert.throws(() => plan(before, unexpected), /Only the reviewed/);
  } finally { await db.close(); }
});

test('runtime catalog drift aborts without undoing any newer authorization', async () => {
  for (const drift of [
    'grant insert on public.krediya_price_rules to authenticated',
    'alter policy krediya_price_rules_select on public.krediya_price_rules using(true)',
    'grant create on schema public to authenticated',
    'create table public.unreviewed_fixture(id int)',
    'alter default privileges grant select on tables to authenticated',
  ]) {
    const db = await fixture();
    try {
      const before = await capture(db);
      await db.exec(migration);
      const rollback = plan(before, await capture(db));
      await db.exec(drift);
      const changed = await capture(db);
      await assert.rejects(db.exec(rollback.sql), /Rollback stopped: catalog changed/);
      await db.exec('rollback');
      assert.deepEqual(normalized(await capture(db)), normalized(changed));
    } finally { await db.close(); }
  }
});

test('catalog identifier cannot prematurely close the generated SQL body', async () => {
  const db = await fixture('create table public."$tariff_rollback_0$"(id int);');
  try {
    const before = await capture(db);
    await db.exec(migration);
    const rollback = plan(before, await capture(db));
    assert.match(rollback.sql, /DO \$tariff_rollback_1\$/);
    await db.exec(rollback.sql);
    assert.deepEqual(normalized(await capture(db)), normalized(before));
  } finally { await db.close(); }
});

test('executor identity guard refuses a non-postgres role even when it can lock the table', async () => {
  const db = await fixture('grant update on public.krediya_price_rules to authenticated;');
  try {
    const before = await capture(db);
    await db.exec(migration);
    const after = await capture(db), rollback = plan(before, after);
    await db.exec('set role authenticated');
    await assert.rejects(db.exec(rollback.sql), /Rollback requires reviewed postgres executor/);
    await db.exec('rollback; reset role;');
    assert.deepEqual(normalized(await capture(db)), normalized(after));
  } finally { await db.close(); }
});

test('quoted catalog metadata stays literal even if caller disabled standard-conforming strings', async () => {
  const db = await fixture('create table public."quote\'and\\slash"(id int); set standard_conforming_strings=off;');
  try {
    const before = await capture(db);
    await db.exec(migration);
    const rollback = plan(before, await capture(db));
    assert.match(rollback.sql, /SET LOCAL standard_conforming_strings=on/);
    await db.exec(rollback.sql);
    assert.deepEqual(normalized(await capture(db)), normalized(before));
    assert.equal((await db.query('show standard_conforming_strings')).rows[0].standard_conforming_strings, 'off');
  } finally { await db.close(); }
});
