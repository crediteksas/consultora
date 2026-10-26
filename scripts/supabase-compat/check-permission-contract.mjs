import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Offline semantic release gate. Inputs must be snapshots taken from a
// disposable reconstruction/update, never a claim inferred from RLS alone.
// It neither connects to production nor emits/applies GRANT statements.
const apiRoles = new Set(['PUBLIC', 'anon', 'authenticated', 'service_role']);
const objectKey = object => `${object.schema}.${object.name}${object.identity === undefined ? '' : `(${object.identity})`}`;
const objects = snapshot => [...snapshot.relations, ...snapshot.functions.map(fn => ({ ...fn, kind: 'function' }))];
const sort = values => [...values].sort();
const grants = object => sort((object.grants || []).filter(g => g.grantee !== object.owner).map(g => `${g.grantee}:${g.privilege}:${Boolean(g.grantable)}:${g.grantor || object.owner}`));
const columns = object => Object.fromEntries((object.columns || []).filter(c => c.acl).map(c => [c.name, c.acl]));
const columnShape = object => (object.columns || []).map(({name,type,identity,generated}) => ({name,type,identity,generated}));
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export function checkPermissionContract({ before, after, contract, created }) {
  const errors = [];
  if (contract.schema_version !== 1 || !['kora', 'aura', 'fixture'].includes(contract.project) || !Array.isArray(contract.objects)) {
    return { ok: false, errors: ['Invalid explicit project/object contract'], scope: 'isolated-catalog-contract-only' };
  }
  if (!Array.isArray(created)) return { ok: false, errors: ['Explicit created/recreated object inventory is required'], scope: 'isolated-catalog-contract-only' };
  const requiredCatalogs = ['relations','functions','defaults','policies','role_config','schema_grants','triggers'];
  if (requiredCatalogs.some(key => !Array.isArray(before?.[key]) || !Array.isArray(after?.[key]))) {
    return { ok: false, errors: ['Both snapshots must include relations, functions, defaults, policies, role_config, schema_grants and triggers arrays'], scope: 'isolated-catalog-contract-only' };
  }
  const previous = new Map(objects(before).map(o => [objectKey(o), o]));
  const next = new Map(objects(after).map(o => [objectKey(o), o]));
  for (const [label, catalog] of [['before', previous], ['after', next]]) {
    for (const [key, object] of catalog) {
      if (['v','m','function'].includes(object.kind) && !/^[a-f0-9]{32}$/.test(object.definition_md5 || '')) errors.push(`${key}: ${label} definition fingerprint is required`);
    }
  }
  const contracts = new Map();
  for (const entry of contract.objects) {
    const key = objectKey(entry);
    if (contracts.has(key)) errors.push(`${key}: duplicate contract`);
    contracts.set(key, entry);
  }
  const required = new Set([...next.keys()].filter(key => !previous.has(key)));
  for (const entry of created) {
    if (!entry.schema) { errors.push(`${entry.name}: unqualified schema requires manual resolution`); continue; }
    if (['function', 'procedure'].includes(entry.kind) && entry.identity === undefined) {
      errors.push(`${entry.schema}.${entry.name}: exact function identity is required`); continue;
    }
    required.add(objectKey(entry));
  }
  for (const key of required) if (!contracts.has(key)) errors.push(`${key}: new/recreated object has no reviewed permission contract`);
  for (const [key, entry] of contracts) {
    const actual = next.get(key);
    if (!actual) { errors.push(`${key}: contracted object is absent`); continue; }
    if (!entry.justification || !entry.isolation_test || !Array.isArray(entry.grants) || !entry.owner || !entry.kind) {
      errors.push(`${key}: justification, isolation test, owner, kind and finite grants are required`); continue;
    }
    if (actual.owner !== entry.owner || actual.kind !== entry.kind) errors.push(`${key}: owner/kind differs`);
    if (Array.isArray(actual.columns) && (!Array.isArray(entry.columns) || stable(columnShape(actual)) !== stable(columnShape(entry)))) errors.push(`${key}: complete column shape differs`);
    if (['r', 'p'].includes(actual.kind)) {
      if (entry.rls !== true || actual.rls !== true) errors.push(`${key}: table RLS must remain enabled`);
      if (Boolean(actual.force_rls) !== Boolean(entry.force_rls)) errors.push(`${key}: FORCE RLS differs`);
      if (entry.policy_count !== actual.policy_count) errors.push(`${key}: policy count differs; review policies and isolation tests`);
    }
    if (['v', 'm'].includes(actual.kind) && stable(sort(actual.options || [])) !== stable(sort(entry.options || []))) errors.push(`${key}: view options differ`);
    if (actual.kind === 'function' && actual.security_definer !== entry.security_definer) errors.push(`${key}: function security semantics differ`);
    if (actual.kind === 'function' && stable(sort(actual.config || [])) !== stable(sort(entry.config || []))) errors.push(`${key}: function configuration differs`);
    if (['v','m','function'].includes(actual.kind) && (!entry.definition_md5 || entry.definition_md5 !== actual.definition_md5)) errors.push(`${key}: reviewed definition fingerprint differs`);
    if (actual.kind === 'function' && previous.get(key)?.security_definer === false && actual.security_definer === true) errors.push(`${key}: invoker-to-definer conversion is not a compatibility fix`);
    if (entry.grants.some(g => !apiRoles.has(g.grantee) || /^(?:ALL|ALL PRIVILEGES)$/i.test(g.privilege))) errors.push(`${key}: explicit supported roles and finite privileges are required`);
    if (stable(grants(actual)) !== stable(grants(entry))) errors.push(`${key}: actual API grants differ from minimum/maximum contract`);
    if (stable(columns(actual)) !== stable(entry.column_acls || {})) errors.push(`${key}: column ACL differs`);
  }
  // A compatibility release must not silently alter unrelated access, owners,
  // policies, function security semantics or default privileges.
  for (const [key, old] of previous) {
    const current = next.get(key);
    if (!current) { errors.push(`${key}: unexpected object removal`); continue; }
    if (contracts.has(key)) continue;
    const access = object => ({ owner: object.owner, kind: object.kind, rls: object.rls, force_rls: object.force_rls,
      policy_count: object.policy_count, options: sort(object.options || []), security_definer: object.security_definer,
      definition_md5: object.definition_md5, config: sort(object.config || []), grants: grants(object), columns: columns(object), column_shape: columnShape(object) });
    if (stable(access(old)) !== stable(access(current))) errors.push(`${key}: access changed outside the contract`);
  }
  for (const key of ['defaults', 'policies', 'role_config', 'schema_grants','triggers']) {
    if (stable(before[key] || []) !== stable(after[key] || []) && contract.allow_catalog_changes?.[key] !== stable(after[key] || [])) {
      errors.push(`${key}: catalog change requires an exact explicit expected snapshot`);
    }
  }
  return { ok: !errors.length, errors, checked_objects: contracts.size, scope: 'isolated-catalog-contract-only',
    limitations: ['Requires independently verified role/project mapping and full update/reconstruction tests.', 'Function bodies and RLS business semantics require review and negative tests.', 'This check does not grant publication approval or modify a database.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = { '--before': 'before', '--after': 'after', '--contract': 'contract', '--created': 'created' }[process.argv[i]];
    if (!key || !process.argv[i + 1]) throw new Error('Usage: check-permission-contract.mjs --before JSON --after JSON --contract JSON --created JSON');
    args[key] = JSON.parse(await readFile(process.argv[i + 1], 'utf8'));
  }
  if (!args.before || !args.after || !args.contract || !args.created) throw new Error('All four inputs are required');
  const result = checkPermissionContract(args);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
