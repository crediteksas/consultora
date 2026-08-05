import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = 'creditek/erp/migrations/20260804_creditek_aliados_v1_1.sql';
const rollbackPath = 'creditek/erp/migrations/rollback/20260804_creditek_aliados_v1_1_rollback.sql';
const routes = [
  'aliados-dashboard.html', 'aliados.html', 'aliados-ejecutivos.html',
  'aliados-plataformas.html', 'aliados-liquidaciones.html', 'aliados-calidad.html',
  'aliados-bonificaciones.html', 'aliados-reportes.html',
];

test('cada módulo de Creditek Aliados tiene una ruta real e independiente', async () => {
  const guard = await readFile('creditek/erp/kora-access-control.js', 'utf8');
  for (const route of routes) {
    assert.match(guard, new RegExp(route.replace('.', '\\.')));
    const html = await readFile(`creditek/erp/${route}`, 'utf8');
    assert.match(html, /data-kora-requires-auth="true"/);
    assert.match(html, /kora-access-control\.js\?v=2\.0\.9/);
    assert.match(html, /sidebar\.js\?v=2\.0\.9/);
    assert.match(html, /Acceso denegado/);
    assert.doesNotMatch(html, /En desarrollo/i);
  }
  assert.doesNotMatch(guard, /aliados-liquidaciones\.html#(dashboard|aliados|ejecutivos|plataformas|calidad|bonificaciones|reportes)/);
});

test('la migración V1.1 crea solo el maestro y soporte operativo autorizado', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const table of ['aliados', 'aliados_sedes', 'aliados_plataformas', 'aliados_documentos', 'aliados_estado_historial', 'aliados_domain_events']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(sql, /references public\.ejecutivos/);
  assert.match(sql, /references public\.origenes/);
  assert.match(sql, /estado_asociacion/);
  assert.match(sql, /pendiente_asociacion/);
  assert.doesNotMatch(sql, /update public\.(liquidations|liquidation_operations|settlement_policy_versions)/i);
  assert.doesNotMatch(sql, /\b0\.77\b|\b77\s*%/);
});

test('suspender y reactivar son operaciones de servidor con motivo, auditoría y evento', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const rpc of ['aliados_suspendender', 'aliados_reactivar']) assert.match(sql, new RegExp(`function public\\.${rpc}`));
  assert.match(sql, /Motivo obligatorio/);
  assert.match(sql, /insert into public\.aliados_estado_historial/);
  assert.match(sql, /insert into public\.audit_log/);
  assert.match(sql, /insert into public\.aliados_domain_events/);
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke all on function public\.aliados_suspendender/);
});

test('RLS excluye tiendas y usa Gerencia o las capacidades existentes de Aliados', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /rol = 'gerencia'/);
  assert.match(sql, /tiene_capacidad_aliados\('revisor'\)/);
  assert.doesNotMatch(sql, /admin_tienda|asesor/);
  assert.match(sql, /revoke all on public\.aliados/);
});

test('rollback protege históricos y no elimina entidades compartidas', async () => {
  const rollback = await readFile(rollbackPath, 'utf8');
  assert.match(rollback, /Rollback V1\.1 bloqueado/);
  assert.doesNotMatch(rollback, /drop table.*(origenes|ejecutivos|perfiles|audit_log|liquidations)/i);
});

test('las vistas reutilizan datos reales y nunca convierten ausencia de calidad en cero', async () => {
  const app = await readFile('creditek/erp/aliados-v1-1-app.js', 'utf8');
  for (const table of ['aliados', 'aliados_sedes', 'aliados_plataformas', 'liquidations', 'liquidation_operations', 'liquidation_bonuses']) {
    assert.match(app, new RegExp(`from\\('${table}'\\)`));
  }
  assert.match(app, /Sin política configurada/);
  assert.match(app, /Sin información de calidad/);
  assert.doesNotMatch(app, /calidad[^\n]{0,30}:\s*0/i);
  assert.match(app, /Intl\.NumberFormat\('es-CO'/);
});

test('el artefacto productivo incluye la hoja visual compartida de Aliados', async () => {
  const build = await readFile('scripts/build-public.mjs', 'utf8');
  assert.match(build, /ERP_EXTENSIONS = new Set\(\['\.html', '\.js', '\.css'\]\)/);
});
