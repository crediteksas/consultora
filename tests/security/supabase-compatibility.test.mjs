import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { sqlStatements, createdObjects } from '../../scripts/supabase-compat/sql-statements.mjs';
import { classifyFile, scanConsumers, reconcileMigrations, permissionMatrix } from '../../scripts/supabase-compat/inventory.mjs';
import { checkPermissionContract } from '../../scripts/supabase-compat/check-permission-contract.mjs';

const emptyCatalog = () => ({ relations: [], functions: [], defaults: [], policies: [], role_config: [], schema_grants: [], triggers: [] });
const fixtureRelation = () => ({ schema: 'public', name: 'fixture', kind: 'r', owner: 'postgres', rls: true, force_rls: false, policy_count: 1, columns: [], grants: [{ grantee: 'authenticated', privilege: 'SELECT', grantable: false }] });
function contractCase() {
  const relation = fixtureRelation();
  return { before: emptyCatalog(), after: { ...emptyCatalog(), relations: [relation] },
    created: [{ schema: 'public', name: 'fixture', kind: 'table' }],
    contract: { schema_version: 1, project: 'fixture', objects: [{ ...relation, justification: 'Fictitious store-isolated read', isolation_test: 'fixture-negative-test', column_acls: {} }] } };
}

test('publication gate accepts explicit finite contract but is not production certification', () => {
  const result = checkPermissionContract(contractCase());
  assert.equal(result.ok, true);
  assert.equal(result.scope, 'isolated-catalog-contract-only');
});

test('publication gate blocks new tables without contract, SELECT or RLS', () => {
  const cases = [
    value => { value.contract.objects = []; },
    value => { value.after.relations[0].grants = []; },
    value => { value.after.relations[0].rls = false; },
    value => { value.created[0].schema = null; },
    value => { delete value.created; },
  ];
  for (const modify of cases) { const value = contractCase(); modify(value); assert.equal(checkPermissionContract(value).ok, false); }
});

test('publication gate rejects anonymous, unknown-role or grant-option escalation', () => {
  for (const extra of [
    { grantee: 'anon', privilege: 'SELECT' },
    { grantee: 'unreviewed_role', privilege: 'SELECT' },
    { grantee: 'authenticated', privilege: 'SELECT', grantable: true },
  ]) {
    const value = contractCase();
    value.after.relations[0].grants = [...value.after.relations[0].grants, extra];
    assert.equal(checkPermissionContract(value).ok, false);
  }
});

test('publication gate requires exact column ACL, policies and unchanged unrelated access', () => {
  const value = contractCase();
  value.after.relations[0].columns = [{ name: 'hidden', acl: '{anon=r/postgres}' }];
  assert.equal(checkPermissionContract(value).ok, false);
  value.after.relations[0].columns = [];
  value.after.policies = [{ name: 'unexpected_policy' }];
  assert.equal(checkPermissionContract(value).ok, false);
  value.after.policies = [];
  value.before.relations = [{ ...fixtureRelation(), name: 'untouched', grants: [] }];
  value.after.relations.push({ ...fixtureRelation(), name: 'untouched' });
  assert.equal(checkPermissionContract(value).ok, false);
});

test('publication gate rejects silent object removal and incomplete function identity', () => {
  const value = contractCase();
  value.before.functions = [{ schema: 'public', name: 'fixture_fn', identity: '', owner: 'postgres', grants: [], security_definer: false }];
  assert.equal(checkPermissionContract(value).ok, false);
  value.before.functions = [];
  value.created.push({ schema: 'public', name: 'fixture_fn', kind: 'function' });
  assert.equal(checkPermissionContract(value).ok, false);
});

test('publication gate requires schema ACLs and blocks silent USAGE escalation', () => {
  const value = contractCase();
  delete value.after.schema_grants;
  assert.equal(checkPermissionContract(value).ok, false);
  value.after.schema_grants = [{ schema: 'public', owner: 'postgres', grants: [{ grantee: 'anon', privilege: 'USAGE' }] }];
  assert.equal(checkPermissionContract(value).ok, false);
  value.contract.allow_catalog_changes = { schema_grants: JSON.stringify(value.after.schema_grants.map(entry => ({ grants: entry.grants.map(g=>({grantee:g.grantee,privilege:g.privilege})), owner: entry.owner, schema: entry.schema }))) };
  assert.equal(checkPermissionContract(value).ok, true);
});

test('publication gate fails closed when any required catalog is absent or malformed', () => {
  for (const side of ['before','after']) {
    for (const field of ['relations','functions','defaults','policies','role_config','schema_grants','triggers']) {
      const value = contractCase();
      delete value[side][field];
      assert.equal(checkPermissionContract(value).ok, false, `${side}.${field} missing`);
      value[side][field] = {};
      assert.equal(checkPermissionContract(value).ok, false, `${side}.${field} malformed`);
    }
  }
});

test('publication gate blocks new columns on existing broadly granted tables', () => {
  const value = contractCase();
  value.before.relations = [fixtureRelation()];
  value.contract.objects = [];
  value.created = [];
  value.after.relations[0].columns = [{name:'new_sensitive_column',type:'text',identity:'',generated:'',acl:null}];
  assert.equal(checkPermissionContract(value).ok, false);
  value.contract.objects = [{ ...fixtureRelation(), justification:'Fictitious read',isolation_test:'negative-fixture' }];
  assert.equal(checkPermissionContract(value).ok, false);
  value.contract.objects[0].columns = [...value.after.relations[0].columns];
  assert.equal(checkPermissionContract(value).ok, true);
});

test('publication gate pins contracted function/view definitions and rejects missing fingerprints', () => {
  for(const kind of ['function','v']) {
    const value = contractCase();
    const object = {schema:'public',name:'fixture_definition',kind,owner:'postgres',grants:[],
      definition_md5:'a'.repeat(32),security_definer:false,columns:[],options:[]};
    if(kind === 'function') {object.identity=''; value.before.functions=[object];value.after.functions=[{...object,definition_md5:'b'.repeat(32)}];}
    else {value.before.relations.push(object);value.after.relations.push({...object,definition_md5:'b'.repeat(32)});}
    const entry = {...object,justification:'Fictitious definition',isolation_test:'negative-fixture'};
    value.contract.objects.push(entry);
    assert.equal(checkPermissionContract(value).ok,false);
    entry.definition_md5='b'.repeat(32);
    assert.equal(checkPermissionContract(value).ok,true);
    delete entry.definition_md5;
    assert.equal(checkPermissionContract(value).ok,false);
  }
});

test('SQL lexer ignores comment/string/body semicolons and nested comments', () => {
  const statements = sqlStatements(`-- GRANT ALL ON public.hidden TO anon;
    /* outer /* nested ; */ end */
    create table public.fixture (id int, note text default ';');
    create function public.fake() returns text language sql as $body$select 'grant select;';$body$;
    grant select on public.fixture to authenticated;`);
  assert.equal(statements.length, 3);
  assert.deepEqual(createdObjects(statements).map(({ schema, name, kind }) => ({ schema, name, kind })), [
    { schema: 'public', name: 'fixture', kind: 'table' },
    { schema: 'public', name: 'fake', kind: 'function' },
  ]);
  assert.equal(statements[1].tokens.filter(t => t.kind === 'body').length, 1);
});

test('SQL lexer preserves quoted case, escaped identifiers and E literals', () => {
  const statements = sqlStatements(`create table "public"."Case""Name" (x text default E'it\\'s;ok');`);
  assert.equal(statements.length, 1);
  assert.equal(createdObjects(statements)[0].name, 'Case"Name');
});

test('SQL lexer fails closed on incomplete quotes and comments', () => {
  for (const sql of ["select 'unfinished", '/* unfinished', 'select $body$ unfinished', 'select "unfinished']) {
    assert.throws(() => sqlStatements(sql), /Unterminated SQL/);
  }
});

test('consumer scanner distinguishes table, RPC, Storage and Array.from', () => {
  const refs = scanConsumers(`
    Array.from(items);
    db.from('fixture').select('id, total').eq('id', 1);
    db.rpc('fixture_summary', {});
    db.storage.from('fixture-bucket').upload('file', blob);
    db.from(tableName).select('*');
    fetch('/rest/v1/fixture');
  `, 'creditek/erp/fixture.js');
  assert.equal(refs.length, 5);
  assert.deepEqual(refs.find(r => r.object === 'fixture' && r.confidence === 'heuristic-chain-review').operations, ['SELECT']);
  assert.deepEqual(refs.find(r => r.kind === 'function').operations, ['EXECUTE']);
  assert.equal(refs.filter(r => r.confidence === 'unresolved').length, 1);
});

test('consumer scanner never treats write use as authorization to grant it', () => {
  const refs = scanConsumers("db.from('fixture').upsert({id: 1}).select('*');", 'creditek/erp/fixture.js');
  assert.deepEqual(refs[0].operations, ['SELECT', 'INSERT', 'UPDATE']);
  assert.equal(refs[0].confidence, 'heuristic-chain-review');
  assert.equal(refs[0].grant, undefined);
});

test('migration equivalence requires exact content, not version or name', () => {
  const local = [{ file: 'a.sql', classification: 'migration', version: '1', name: 'same', full_md5: 'x', trimmed_md5: 'y', statement_md5: ['z'] }];
  const result = reconcileMigrations(local, [
    { version: '1', name: 'same', joined_md5: 'different', statement_fingerprints: [] },
    { version: '2', name: 'other', joined_md5: 'x', statement_fingerprints: [] },
    { version: '3', name: 'missing', joined_md5: 'no', statement_fingerprints: [] },
  ]);
  assert.deepEqual(result.map(r => r.status), ['same-version-content-unverified', 'exact-content-match', 'remote-only-unreconciled']);
});

test('fixtures and rollback SQL are not deployment candidates', () => {
  assert.equal(classifyFile('creditek/erp/migrations/rollback/fixture.sql'), 'test-or-rollback');
  assert.equal(classifyFile('tests/fixtures/old.sql'), 'test-or-rollback');
  assert.equal(classifyFile('scripts/maintenance/old.sql'), 'maintenance-review');
  assert.equal(classifyFile('creditek/erp/legacy_billing.js'), 'kora-frontend');
  assert.equal(classifyFile('creditek/erp/rollback-button.js'), 'kora-frontend');
});

test('owner view with anonymous SELECT is a separate review, not an automatic revoke', () => {
  const matrix = permissionMatrix({
    relations: [{ schema: 'public', name: 'fixture_view', kind: 'v', owner: 'postgres', rls: false, force_rls: false, policy_count: 0, options: null, columns: [], grants: [{ grantee: 'anon', privilege: 'SELECT' }] }],
    functions: [], defaults: [], role_config: [],
  }, { view_dependencies: [], sequence_ownership: [], policy_dependencies: [], schemas: [] }, []);
  assert.equal(matrix.relations[0].disposition, 'owner-view-with-anonymous-select-separate-review');
  assert.equal(matrix.relations[0].current_grants.length, 1);
});

async function fixtureDB() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    -- Simulate the new defaults in a disposable in-memory database only.
    alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
    alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
    create table public.fixture_records (id bigint generated by default as identity, store text not null, module text not null, amount numeric not null);
    alter table public.fixture_records enable row level security;
    create policy fixture_store_select on public.fixture_records for select to authenticated using (store = current_setting('app.fixture_store', true));
    create policy fixture_store_insert on public.fixture_records for insert to authenticated with check (store = current_setting('app.fixture_store', true));
    insert into public.fixture_records(store,module,amount) values
      ('alpha','sales',10),('beta','sales',20),('alpha','cash',30),('alpha','inventory',40),
      ('alpha','suppliers',50),('alpha','receivables',60),('alpha','settlements',70),('alpha','reports',80),('alpha','sofia-outbox-disabled',90);
  `);
  return db;
}

async function asRole(db, role, sql, store = 'alpha') {
  try {
    await db.exec(`set role ${role}; set app.fixture_store = '${store}';`);
    return await db.query(sql);
  } finally { await db.exec('reset role; reset app.fixture_store;'); }
}

test('new defaults: RLS alone does not grant authenticated table access', async () => {
  const db = await fixtureDB();
  try {
    await assert.rejects(asRole(db, 'authenticated', 'select * from public.fixture_records'), error => error.code === '42501');
    await assert.rejects(asRole(db, 'service_role', 'select * from public.fixture_records'), error => error.code === '42501');
  } finally { await db.close(); }
});

test('explicit SELECT restores isolated reads and denies anon and another store', async () => {
  const db = await fixtureDB();
  try {
    await db.exec('grant select on public.fixture_records to authenticated;');
    const alpha = await asRole(db, 'authenticated', 'select store from public.fixture_records');
    const beta = await asRole(db, 'authenticated', 'select store from public.fixture_records', 'beta');
    const unknown = await asRole(db, 'authenticated', 'select store from public.fixture_records', 'unknown');
    assert.equal(alpha.rows.length, 8);
    assert.ok(alpha.rows.every(r => r.store === 'alpha'));
    assert.equal(beta.rows.length, 1);
    assert.equal(unknown.rows.length, 0);
    await assert.rejects(asRole(db, 'anon', 'select * from public.fixture_records'), error => error.code === '42501');
    await assert.rejects(asRole(db, 'authenticated', "insert into public.fixture_records(store,module,amount) values ('alpha','cash',1)"), error => error.code === '42501');
  } finally { await db.close(); }
});

test('existing objects keep grants when defaults change; reconstruction needs explicit grants', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;
      alter default privileges in schema public grant select on tables to authenticated;
      create table public.fixture_existing(id int);
      alter default privileges in schema public revoke select on tables from authenticated;
      create table public.fixture_new(id int);`);
    assert.equal((await asRole(db, 'authenticated', 'select * from public.fixture_existing')).rows.length, 0);
    await assert.rejects(asRole(db, 'authenticated', 'select * from public.fixture_new'), error => error.code === '42501');
    await db.exec('drop table public.fixture_existing; create table public.fixture_existing(id int);');
    await assert.rejects(asRole(db, 'authenticated', 'select * from public.fixture_existing'), error => error.code === '42501');
  } finally { await db.close(); }
});

test('sequence USAGE must be explicit for serial inserts, without granting UPDATE or SELECT on it', async () => {
  const db = await fixtureDB();
  try {
    await db.exec(`create table public.fixture_serial(id serial primary key, store text);
      alter table public.fixture_serial enable row level security;
      create policy fixture_insert on public.fixture_serial for insert to authenticated with check(store=current_setting('app.fixture_store',true));
      grant insert(store) on public.fixture_serial to authenticated;`);
    await assert.rejects(asRole(db, 'authenticated', "insert into public.fixture_serial(store) values('alpha')"), error => error.code === '42501');
    await db.exec('grant usage on sequence public.fixture_serial_id_seq to authenticated;');
    await asRole(db, 'authenticated', "insert into public.fixture_serial(store) values('alpha')");
    await assert.rejects(asRole(db, 'authenticated', "select setval('public.fixture_serial_id_seq',100)"), error => error.code === '42501');
    await assert.rejects(asRole(db, 'authenticated', "insert into public.fixture_serial(store) values('beta')"), error => error.code === '42501');
  } finally { await db.close(); }
});

test('security_invoker view requires underlying read grants and preserves RLS', async () => {
  const db = await fixtureDB();
  try {
    await db.exec(`create view public.fixture_report with(security_invoker=true) as select store,amount from public.fixture_records;
      grant select on public.fixture_report to authenticated;`);
    await assert.rejects(asRole(db, 'authenticated', 'select * from public.fixture_report'), error => error.code === '42501');
    await db.exec('grant select(store,amount) on public.fixture_records to authenticated;');
    const result = await asRole(db, 'authenticated', 'select * from public.fixture_report');
    assert.equal(result.rows.length, 8);
    assert.ok(result.rows.every(r => r.store === 'alpha'));
    await assert.rejects(asRole(db, 'authenticated', 'select module from public.fixture_records'), error => error.code === '42501');
  } finally { await db.close(); }
});

test('invoker RPC and pre-request execution need explicit EXECUTE without SECDEF escalation', async () => {
  const db = await fixtureDB();
  try {
    await db.exec(`create function public.fixture_summary() returns bigint language sql security invoker as $$ select count(*) from public.fixture_records $$;
      create function public.fixture_pre_request() returns text language sql security invoker as $$ select current_setting('app.fixture_store',true) $$;
      revoke execute on function public.fixture_summary(), public.fixture_pre_request() from public;
      grant select on public.fixture_records to authenticated;`);
    await assert.rejects(asRole(db, 'authenticated', 'select public.fixture_summary()'), error => error.code === '42501');
    await db.exec('grant execute on function public.fixture_summary(),public.fixture_pre_request() to authenticated;');
    assert.equal(Number((await asRole(db, 'authenticated', 'select public.fixture_summary() as n')).rows[0].n), 8);
    assert.equal((await asRole(db, 'authenticated', 'select public.fixture_pre_request() as store')).rows[0].store, 'alpha');
    await assert.rejects(asRole(db, 'anon', 'select public.fixture_pre_request()'), error => error.code === '42501');
  } finally { await db.close(); }
});

test('service backend needs table grants even with BYPASSRLS; fake outbox never sends', async () => {
  const db = await fixtureDB();
  try {
    await db.exec('grant select on public.fixture_records to service_role;');
    const modules = (await asRole(db, 'service_role', 'select distinct module from public.fixture_records')).rows;
    assert.equal(modules.length, 8);
    assert.ok(modules.some(r => r.module === 'sofia-outbox-disabled'));
    // These rows cover ACL primitives only, not full production module workflows.
    assert.equal((await db.query("select count(*) as n from pg_proc where pronamespace='public'::regnamespace")).rows[0].n, 0);
  } finally { await db.close(); }
});

test('rollback must restore column privileges removed by a table-level REVOKE', async () => {
  const db = await fixtureDB();
  try {
    await db.exec('grant select(store) on public.fixture_records to authenticated with grant option;');
    const snapshot = async () => (await db.query(`select coalesce(c.relacl,acldefault('r',c.relowner))::text as acl,c.relrowsecurity as rls,
      (select attacl::text from pg_attribute where attrelid=c.oid and attname='store') as column_acl
      from pg_class c where c.oid='public.fixture_records'::regclass`)).rows[0];
    const before = await snapshot();
    await db.exec('grant select on public.fixture_records to authenticated;');
    assert.notDeepEqual(await snapshot(), before);
    await db.exec('revoke select on public.fixture_records from authenticated;');
    // PostgreSQL also removes the column SELECT grants! Rebuild precisely from
    // the captured column ACL; revoking only the new table grant is insufficient.
    assert.equal((await snapshot()).column_acl, null);
    await db.exec('grant select(store) on public.fixture_records to authenticated with grant option;');
    assert.deepEqual(await snapshot(), before);
    const rows = await asRole(db, 'authenticated', 'select store from public.fixture_records');
    assert.equal(rows.rows.length, 8);
  } finally { await db.close(); }
});
