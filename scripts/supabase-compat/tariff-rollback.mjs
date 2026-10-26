import { isDeepStrictEqual } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const schema = 'public', name = 'krediya_price_rules';
const fields = ['relations', 'functions', 'defaults', 'policies', 'role_config', 'schema_grants','triggers'];
const selectGrant = g => g.grantor === 'postgres' && g.grantee === 'authenticated' && g.privilege === 'SELECT' && g.grantable === false;
const literal = value => `'${value.replaceAll("'", "''")}'`;
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
const equals = (a, b) => isDeepStrictEqual(stable(a), stable(b));

function catalog(value) {
  if (!value || fields.some(field => !Array.isArray(value[field]))) throw new Error('Complete catalog backup required');
  // Timestamp is observational, not restorable state.
  const { captured_at, ...result } = value;
  for (const field of ['relations', 'functions', 'schema_grants','triggers']) {
    const identities = result[field].map(x => JSON.stringify([x.schema, x.name ?? x.schema, x.identity ?? null]));
    if (identities.length !== new Set(identities).size) throw new Error(`Duplicate catalog identities: ${field}`);
  }
  // REVOKE can leave explicit owner ACL where PostgreSQL originally stored NULL.
  // Relation grants preserve the SAME effective permissions. Only relation ACL
  // text is normalized: this one-table change cannot alter function/schema/
  // default ACLs, so even representation drift there is conservatively refused.
  // Never write system catalogs to force an old storage representation.
  return { ...result, relations: result.relations.map(({ acl, ...relation }) => relation) };
}

// This deliberately supports ONE additive migration, not arbitrary ACL repair.
// Nothing connects to Postgres or executes SQL. Runtime guards in the emitted
// SQL fail closed if the reviewed catalog or executor changed since backup.
export function prepareTariffRollback({ before, after, catalogSql }) {
  const original = catalog(before), expected = catalog(after);
  if (typeof catalogSql !== 'string' || !catalogSql.trim()) throw new Error('Reviewed catalog query required');
  const target = value => value.relations.filter(r => r.schema === schema && r.name === name);
  const [oldTable] = target(original), [newTable] = target(expected);
  if (target(original).length !== 1 || target(expected).length !== 1) throw new Error('Exactly one existing tariff table required');
  for (const table of [oldTable, newTable]) {
    if (table.kind !== 'r' || table.owner !== 'postgres' || !table.rls || table.policy_count !== 2 ||
        !Array.isArray(table.grants) || !Array.isArray(table.columns)) throw new Error('Unexpected tariff table protection/shape');
  }
  const rest = value => ({ ...value, relations: value.relations.filter(r => !(r.schema === schema && r.name === name)) });
  if (!equals(rest(original), rest(expected))) throw new Error('Unrelated catalog drift: no rollback generated');
  const withoutAcl = ({ grants, ...table }) => table;
  if (!equals(withoutAcl(oldTable), withoutAcl(newTable))) throw new Error('Tariff shape/protection drift: no rollback generated');

  let action = 'no-op';
  if (!equals(oldTable, newTable)) {
    if (oldTable.columns.some(column => column.acl !== null)) throw new Error('Column ACL backup requires a separately reviewed restoration');
    const added = newTable.grants.filter(g => !oldTable.grants.some(old => equals(old, g)));
    const removed = oldTable.grants.filter(g => !newTable.grants.some(current => equals(g, current)));
    if (removed.length || added.length !== 1 || !selectGrant(added[0])) throw new Error('Only the reviewed postgres-to-authenticated SELECT addition is supported');
    action = 'revoke-added-select';
  }
  const query = catalogSql.trim().replace(/;\s*$/, '');
  const comparableQuery = `SELECT jsonb_set(snapshot - 'captured_at', '{relations}', (SELECT coalesce(jsonb_agg(relation - 'acl'), '[]'::jsonb) FROM jsonb_array_elements(snapshot->'relations') relation)) FROM (${query}) checked`;
  const guard = (value, message) => `IF (${comparableQuery}) IS DISTINCT FROM ${literal(JSON.stringify(value))}::jsonb THEN\n    RAISE EXCEPTION '${message}';\n  END IF;`;
  const mutation = action === 'no-op' ? '-- SELECT existed before migration: preserve it. No ACL mutation.' :
    'REVOKE SELECT ON TABLE public.krediya_price_rules FROM authenticated RESTRICT;';
  const body = `BEGIN\n  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Rollback requires reviewed postgres executor'; END IF;\n  ${guard(expected, 'Rollback stopped: catalog changed after backup')}\n  ${mutation}\n  ${guard(original, 'Rollback stopped: original catalog was not restored')}\nEND`;
  let index = 0, tag;
  do { tag = `$tariff_rollback_${index++}$`; } while (body.includes(tag));
  return {
    schema_version: 1, scope: 'single-additive-tariff-grant-only', action,
    limitations: ['No production execution.', 'Column ACL additions are refused, not guessed.', 'Rollback requires the complete reviewed catalog to remain unchanged.', 'Exact effective relation grants; NULL versus equivalent explicit owner ACL is not rewritten.', 'On failure, issue ROLLBACK or disconnect before reusing the session.'],
    sql: `-- Generated from before/after METADATA only; no business rows.\nBEGIN;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='30s';\nLOCK TABLE public.krediya_price_rules IN ACCESS EXCLUSIVE MODE;\nDO ${tag}\n${body}\n${tag};\nCOMMIT;\n`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = { '--before': 'before', '--after': 'after' }[process.argv[i]];
    if (!key || !process.argv[i + 1]) throw new Error('Usage: tariff-rollback.mjs --before PATH --after PATH');
    options[key] = JSON.parse(await readFile(process.argv[i + 1], 'utf8'));
  }
  options.catalogSql = await readFile(new URL('./catalog-query.sql', import.meta.url), 'utf8');
  process.stdout.write(JSON.stringify(prepareTariffRollback(options), null, 2) + '\n');
}
