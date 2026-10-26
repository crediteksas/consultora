import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sqlStatements, createdObjects } from './sql-statements.mjs';

const hash = value => createHash('md5').update(value).digest('hex');
const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.html', '.sql']);
const excludedDirs = new Set(['.git', 'node_modules', 'dist', 'public', 'vendor', 'vendors', 'coverage']);

async function walk(root, relative = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.posix.join(relative, entry.name);
    if (entry.isDirectory() && !excludedDirs.has(entry.name) && !entry.name.startsWith('.')) result.push(...await walk(root, file));
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name)) && !/\.min\.|supabase-js-|xlsx(?:\.full)?\.|exceljs|jspdf|chart\.umd/i.test(entry.name)) result.push(file);
  }
  return result.sort();
}

export function classifyFile(file) {
  if (/(?:^|\/)(?:tests?|fixtures?|rollback)(?:\/|$)/i.test(file) || /(?:rollback|smoke_test)[^/]*\.sql$/i.test(file)) return 'test-or-rollback';
  if (/(?:^|\/)(?:archive|backup|legacy|historico|_archivo)(?:\/|$)/i.test(file)) return 'historical-review';
  if (/\.sql$/.test(file)) return /(?:^|\/)migrations\//.test(file) ? 'migration' : 'maintenance-review';
  if (/^creditek\/erp\//.test(file)) return 'kora-frontend';
  if (/^creditek\/(?:agentes|aura)\//.test(file) || /^src\/aura-/.test(file)) return 'aura-frontend-or-proxy';
  if (/worker|^src\//.test(file)) return 'worker-or-server';
  return 'other-source-review';
}

// Heuristics produce REVIEW CANDIDATES, never GRANT statements or claims that
// every dynamic/runtime consumer was found. Reports contain identifiers only.
export function scanConsumers(source, file) {
  const found = [];
  const sourceClass = classifyFile(file);
  const projects = sourceClass === 'kora-frontend' ? ['kora'] : sourceClass === 'aura-frontend-or-proxy' ? ['aura'] : ['kora', 'aura'];
  const add = (index, object, kind, operations, confidence, columns = []) => found.push({
    file, line: source.slice(0, index).split('\n').length, source_class: sourceClass, project_candidates: projects,
    object, kind, operations, columns, confidence,
  });
  for (const m of source.matchAll(/\.\s*(from|rpc)\s*\(\s*(['"`])([A-Za-z_][\w.-]*)\2/g)) {
    const before = source.slice(Math.max(0, m.index - 100), m.index);
    if (/(?:Array|Buffer|Object)\s*$/.test(before)) continue;
    if (/\.storage\s*$/.test(before)) {
      add(m.index, m[3], 'storage-bucket', [], 'literal-review'); continue;
    }
    if (m[1] === 'rpc') { add(m.index, m[3], 'function', ['EXECUTE'], 'literal-review'); continue; }
    const chain = source.slice(m.index, m.index + 2500).split(';')[0];
    const operations = [];
    if (/\.\s*select\s*\(/.test(chain)) operations.push('SELECT');
    if (/\.\s*insert\s*\(/.test(chain)) operations.push('INSERT');
    if (/\.\s*upsert\s*\(/.test(chain)) operations.push('INSERT', 'UPDATE');
    if (/\.\s*update\s*\(/.test(chain)) operations.push('UPDATE');
    if (/\.\s*delete\s*\(/.test(chain)) operations.push('DELETE');
    const columns = chain.match(/\.\s*select\s*\(\s*['"]([A-Za-z0-9_, *]+)['"]/i)?.[1].split(',').map(s => s.trim()).filter(Boolean) || [];
    add(m.index, m[3], 'relation', [...new Set(operations)], 'heuristic-chain-review', columns);
  }
  for (const m of source.matchAll(/\.\s*(from|rpc)\s*\(\s*(?!['"`\s])([A-Za-z_$][\w$]*)/g)) {
    if (/(?:Array|Buffer|Object)\s*$/.test(source.slice(Math.max(0, m.index - 20), m.index))) continue;
    add(m.index, null, `dynamic-${m[1]}`, [], 'unresolved');
  }
  for (const m of source.matchAll(/\/rest\/v1\/(rpc\/)?([A-Za-z_][\w]*)/g)) {
    add(m.index, m[2], m[1] ? 'function' : 'relation', m[1] ? ['EXECUTE'] : [], 'rest-literal-review');
  }
  for (const m of source.matchAll(/postgres_changes[\s\S]{0,350}?table\s*:\s*['"]([A-Za-z_][\w]*)['"]/g)) {
    add(m.index, m[1], 'relation', ['SELECT'], 'realtime-review');
  }
  return found;
}

export function reconcileMigrations(local, remote) {
  return remote.map(migration => {
    const exact = local.filter(file => file.full_md5 === migration.joined_md5 ||
      (migration.statement_fingerprints?.length === 1 && file.trimmed_md5 === migration.statement_fingerprints[0].md5) ||
      (file.statement_md5.length && file.statement_md5.length === migration.statement_fingerprints?.length && file.statement_md5.every((md5, index) => md5 === migration.statement_fingerprints[index].md5)));
    const version = local.filter(file => file.version === migration.version);
    const name = local.filter(file => file.name === migration.name);
    return {
      version: migration.version, name: migration.name, statement_count: migration.statement_count,
      status: exact.length ? 'exact-content-match' : version.length ? 'same-version-content-unverified' : name.length ? 'same-name-content-unverified' : 'remote-only-unreconciled',
      // Fixtures/rollbacks may be exact copies; they are evidence, NOT replay candidates.
      exact_files: exact.map(file => ({ file: file.file, classification: file.classification })),
      version_candidates: version.map(file => file.file), name_candidates: name.map(file => file.file),
    };
  });
}

export function permissionMatrix(snapshot, extra, consumers) {
  const relations = snapshot.relations.map(relation => {
    const names = [relation.name, `${relation.schema}.${relation.name}`];
    const refs = consumers.filter(ref => ref.kind === 'relation' && names.includes(ref.object));
    const active = refs.filter(ref => !['test-or-rollback', 'migration', 'maintenance-review', 'historical-review'].includes(ref.source_class));
    const anonymous = relation.grants.filter(grant => ['anon', 'PUBLIC'].includes(grant.grantee));
    return {
      schema: relation.schema, object: relation.name, kind: relation.kind, owner: relation.owner,
      rls: relation.rls, force_rls: relation.force_rls, policy_count: relation.policy_count, options: relation.options,
      current_grants: relation.grants, column_grants: relation.columns.filter(column => column.acl).map(column => ({ name: column.name, acl: column.acl })),
      consumers: active, non_runtime_references: refs.length - active.length,
      candidate_operations: [...new Set(active.flatMap(ref => ref.operations))],
      view_dependencies: extra.view_dependencies.filter(dep => dep.schema === relation.schema && dep.view === relation.name),
      owned_sequences: extra.sequence_ownership.filter(dep => dep.table_schema === relation.schema && dep.table === relation.name),
      trigger_dependencies: (snapshot.triggers || []).filter(t => t.schema === relation.schema && t.table === relation.name),
      policy_function_dependencies: extra.policy_dependencies.filter(dep => dep.schema === relation.schema && dep.table === relation.name),
      disposition: relation.kind === 'v' && anonymous.some(grant => grant.privilege === 'SELECT') && !relation.options?.includes('security_invoker=true')
        ? 'owner-view-with-anonymous-select-separate-review'
        : !active.length && !relation.policy_count ? 'internal-or-unresolved-consumer-review' : 'minimum-permissions-review-required',
    };
  });
  const functions = snapshot.functions.map(fn => ({
    schema: fn.schema, object: fn.name, identity: fn.identity, owner: fn.owner,
    security_definer: fn.security_definer, current_grants: fn.grants,
    consumers: consumers.filter(ref => ref.kind === 'function' && [fn.name, `${fn.schema}.${fn.name}`].includes(ref.object)),
    // Name-only matches cannot disambiguate overloaded signatures.
    disposition: 'signature-and-internal-authorization-review-required',
  }));
  return { relations, functions, role_config: snapshot.role_config, schema_grants: extra.schemas, defaults: snapshot.defaults };
}

export async function buildInventory({ root, metadataDir, outputDir }) {
  if (!root || !metadataDir || !outputDir) throw new Error('root, metadataDir and outputDir are required');
  const files = await walk(root);
  const consumers = [], local = [], skipped = [];
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    if (source.length > 2_000_000) { skipped.push({ file, reason: 'large-source-manual-review' }); continue; }
    if (!file.endsWith('.sql')) { consumers.push(...scanConsumers(source, file)); continue; }
    try {
      const statements = sqlStatements(source);
      const match = path.basename(file).match(/^(\d+)[_-](.+)\.sql$/);
      local.push({ file, classification: classifyFile(file), version: match?.[1] || null, name: match?.[2] || null,
        full_md5: hash(source), trimmed_md5: hash(source.trim()), statement_md5: statements.map(s => hash(s.raw.trim())),
        created_objects: createdObjects(statements), statement_count: statements.length });
    } catch (error) { skipped.push({ file, reason: 'sql-lexing-failed', error: error.message }); }
  }
  await mkdir(outputDir, { recursive: true });
  const projects = {};
  for (const project of ['kora', 'aura']) {
    const read = async suffix => JSON.parse(await readFile(path.join(metadataDir, `${project}-${suffix}.json`), 'utf8'));
    const snapshot = await read('snapshot'), extra = await read('dependencies'), fingerprints = await read('migration-fingerprints');
    const projectConsumers = consumers.filter(ref => ref.project_candidates.includes(project));
    const matrix = permissionMatrix(snapshot, extra, projectConsumers);
    const reconciliation = reconcileMigrations(local, fingerprints);
    const relationNames = new Set(snapshot.relations.flatMap(r => [r.name, `${r.schema}.${r.name}`]));
    const functionNames = new Set(snapshot.functions.flatMap(r => [r.name, `${r.schema}.${r.name}`]));
    const unmatched = projectConsumers.filter(ref => ref.object && ((ref.kind === 'relation' && !relationNames.has(ref.object)) || (ref.kind === 'function' && !functionNames.has(ref.object))));
    projects[project] = {
      captured_at: snapshot.captured_at, public_tables: snapshot.relations.filter(r => ['r','p'].includes(r.kind) && r.schema === 'public').length,
      public_tables_without_rls: snapshot.relations.filter(r => ['r','p'].includes(r.kind) && r.schema === 'public' && !r.rls).map(r => r.name),
      migration_statuses: Object.fromEntries([...new Set(reconciliation.map(r => r.status))].map(status => [status, reconciliation.filter(r => r.status === status).length])),
      unresolved_consumers: unmatched.length, relations_needing_review: matrix.relations.length,
      owner_views_anonymous: matrix.relations.filter(r => r.disposition === 'owner-view-with-anonymous-select-separate-review').map(r => `${r.schema}.${r.object}`),
    };
    await writeFile(path.join(outputDir, `${project}-permission-matrix.json`), JSON.stringify(matrix, null, 2) + '\n');
    await writeFile(path.join(outputDir, `${project}-migration-reconciliation.json`), JSON.stringify(reconciliation, null, 2) + '\n');
    await writeFile(path.join(outputDir, `${project}-unmatched-consumers.json`), JSON.stringify(unmatched, null, 2) + '\n');
  }
  const summary = {
    generated_at: new Date().toISOString(), methodology: 'offline-metadata-and-static-candidates-not-access-certification',
    limitations: ['No business rows or SQL bodies exported.', 'Name matches do not prove project, runtime role or overloaded signature.', 'Comments and dead code can be candidates; dynamic consumers remain unresolved.', 'MD5 is only an exact-content comparison aid, not a security signature.', 'No migration was replayed and no grants were generated.'],
    source_files_scanned: files.length, sql_files: local.length, consumers: consumers.length,
    dynamic_consumers: consumers.filter(r => r.confidence === 'unresolved').length, skipped, projects,
  };
  await writeFile(path.join(outputDir, 'local-sql-inventory.json'), JSON.stringify(local, null, 2) + '\n');
  await writeFile(path.join(outputDir, 'source-consumers.json'), JSON.stringify(consumers, null, 2) + '\n');
  await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = { '--root': 'root', '--metadata-dir': 'metadataDir', '--output-dir': 'outputDir' }[process.argv[i]];
    if (!key || !process.argv[i + 1]) throw new Error('Usage: inventory.mjs --root PATH --metadata-dir PATH --output-dir PATH');
    options[key] = path.resolve(process.argv[i + 1]);
  }
  console.log(JSON.stringify(await buildInventory(options), null, 2));
}
