import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { checkPermissionContract } from './check-permission-contract.mjs';

const folder = 'tests/fixtures/supabase-compat/retenciones-proveedor';
const migration = 'supabase/migrations/20261110180316_registro_retenciones_proveedor.sql';
const testPath = 'tests/security/supabase-compatibility-retenciones-proveedor.test.mjs';
const read = file => readFileSync(file, 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, (_, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    : item);

export async function capture(scenario) {
  const db = await PGlite.create();
  try {
    const fixture = read('tests/erp/retenciones-factura-proveedor.test.mjs').match(/await db\.exec\(`([\s\S]*?)`\);/);
    assert.ok(fixture);
    await db.exec(fixture[1]);
    await db.exec(`
      create role service_role bypassrls;
      alter default privileges in schema public grant execute on functions to service_role;
      alter default privileges in schema public grant all on tables to service_role;
      create table public.pagos_proveedor (id uuid primary key);
    `);
    if (scenario === 'rebuild') {
      await db.exec('alter default privileges revoke execute on functions from public;');
    }
    await db.exec(read('creditek/erp/migrations/20260727_compra_contado_tesoreria.sql'));
    const catalog = async () => {
      const { rows } = await db.query(read('scripts/supabase-compat/catalog-query.sql'));
      const snapshot = Object.values(rows[0])[0];
      delete snapshot.captured_at;
      return snapshot;
    };
    const before = await catalog();
    await db.exec(read(migration));
    const after = await catalog();
    const names = ['registrar_compra_proveedor_operativa', 'registrar_retencion_factura_proveedor'];
    const functions = after.functions.filter(fn => fn.schema === 'public' && names.includes(fn.name));
    const table = after.relations.find(rel => rel.schema === 'public' && rel.name === 'retenciones_factura_proveedor');
    assert.equal(functions.length, 3);
    assert.ok(table.rls);
    assert.equal(table.policy_count, 1);

    const priorPurchase = before.functions.find(fn => fn.name === names[0]);
    const legacyPurchase = functions.find(fn => fn.identity === priorPurchase.identity);
    assert.deepEqual(legacyPurchase.grants, priorPurchase.grants);
    const grantsFor = object => object.grants.filter(grant => grant.grantee !== object.owner);
    const permissions = object => grantsFor(object).map(grant => grant.grantee + ':' + grant.privilege).sort();
    for (const fn of functions) {
      assert.equal(fn.security_definer, true);
      assert.deepEqual(permissions(fn), ['authenticated:EXECUTE', 'service_role:EXECUTE']);
    }
    assert.deepEqual(permissions(table), [
      'authenticated:SELECT', 'service_role:DELETE', 'service_role:INSERT', 'service_role:MAINTAIN',
      'service_role:REFERENCES', 'service_role:SELECT', 'service_role:TRIGGER', 'service_role:TRUNCATE',
      'service_role:UPDATE',
    ]);

    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.retenciones_factura_proveedor'), { code: '42501' });
    await assert.rejects(db.query('select public.registrar_retencion_factura_proveedor(null,null,null,null,null,null,null)'), { code: '42501' });
    await db.exec("reset role; set role authenticated; set test.central = 'no';");
    await assert.rejects(db.query('select public.registrar_retencion_factura_proveedor(null,null,null,null,null,null,null)'), /Solo gerencia o auditoría/);
    await assert.rejects(db.query('insert into public.retenciones_factura_proveedor default values'), { code: '42501' });

    const objects = [table, ...functions.map(fn => ({...fn, kind: 'function'}))].map(object => ({
      ...object, grants: grantsFor(object), column_acls: {}, isolation_test: testPath,
      justification: 'Authenticated users are limited by the central-role policy and server authorization. Service role retains the project default.',
    }));
    const contract = { schema_version: 1, project: 'kora', objects,
      allow_catalog_changes: { policies: stable(after.policies) } };
    const created = objects.map(({schema, name, kind, identity}) => ({schema, name, kind, identity}));
    const result = checkPermissionContract({before, after, contract, created});
    assert.ok(result.ok, result.errors.join('\n'));
    return {before, after, contract, created};
  } finally {
    await db.close();
  }
}

async function emit() {
  function pin(file, value) {
    const body = JSON.stringify(value, null, 2) + '\n';
    writeFileSync(file, body);
    return {path: file, sha256: sha256(body)};
  }
  const release = { schema_version: 1, project: 'kora', scope: 'Reduced isolated supplier-withholding fixture.',
    migration_sha256: {[migration]: sha256(read(migration))},
    isolation_tests: [{path: testPath, sha256: sha256(read(testPath))}],
    test_runner_sha256: sha256(read('scripts/run-kora-local-tests.mjs')) };
  for (const scenario of ['upgrade', 'rebuild']) {
    release[scenario] = {};
    for (const [key, value] of Object.entries(await capture(scenario))) {
      release[scenario][key] = pin(folder + '/' + scenario + '-' + key + '.json', value);
    }
  }
  const ref = pin(folder + '/release.json', release);
  const rootPath = 'config/kora-permission-release.json';
  const root = JSON.parse(read(rootPath));
  root.additional_releases = root.additional_releases.filter(item => item.path !== ref.path);
  root.additional_releases.push(ref);
  pin(rootPath, root);
}

if (process.argv.includes('--emit')) await emit();
