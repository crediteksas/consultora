import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile('creditek/erp/migrations/20260802_creditek_aliados_liquidaciones_v1.sql','utf8');
const rollback = await readFile('creditek/erp/migrations/rollback/20260802_creditek_aliados_liquidaciones_v1_rollback.sql','utf8');
const html = await readFile('creditek/erp/aliados-liquidaciones.html','utf8');
const app = await readFile('creditek/erp/aliados-liquidaciones-app.js','utf8');
const login = await readFile('creditek/erp/app.html','utf8');
const sidebar = await readFile('creditek/erp/sidebar.js','utf8');

test('la migración reutiliza maestros, auditoría y bucket sin crear duplicados', () => {
  assert.match(sql,/to_regclass\('public\.origenes'\)/);
  assert.match(sql,/to_regclass\('public\.ejecutivos'\)/);
  assert.match(sql,/public\.audit_log/);
  assert.match(sql,/storage\.buckets where id='soportes'/);
  assert.doesNotMatch(sql,/insert into storage\.buckets/i);
  assert.doesNotMatch(sql,/create table if not exists public\.(allies|executives|establishments)/i);
});

test('política 77 queda como dato versionado y no en el motor JavaScript', async () => {
  const domain = await readFile('creditek/erp/aliados-liquidaciones-domain.js','utf8');
  assert.match(sql,/settlement_policy_versions/);
  assert.match(sql,/values\(1,'payjoy','aliado',0\.77/);
  assert.match(sql,/\(1,'alo','aliado',0\.77/);
  assert.match(sql,/base_field text not null/);
  assert.match(sql,/'alo','aliado',0\.77,'monto_credito'/);
  assert.doesNotMatch(domain,/\b0\.77\b|\b77\s*%/);
  assert.match(sql,/policy_snapshot jsonb not null/);
});

test('ALO conserva total y accesorios separados mientras la política elige monto crédito', () => {
  assert.match(sql,/monto_credito numeric/);
  assert.match(sql,/monto_base numeric/);
  assert.match(sql,/accesorios_cantidad integer/);
  assert.match(sql,/accesorios numeric/);
  assert.match(sql,/case p\.base_field when 'monto_credito' then o\.monto_credito else o\.monto_base end/);
  assert.match(app,/monto_credito,monto_base,accesorios_cantidad,accesorios/);
});

test('estados, aprobación exclusiva e inmutabilidad se aplican en servidor', () => {
  for (const state of ['importada','validada','con_novedades','calculada','revisada','aprobada','programada','pagada','conciliada','cerrada','anulada']) assert.match(sql,new RegExp(`'${state}'`));
  assert.match(sql,/tiene_capacidad_aliados\('aprobador'\)/);
  assert.match(sql,/Solo Óscar\/aprobador puede aprobar/);
  assert.match(sql,/liquidation_immutable_after_approval/);
  assert.match(sql,/Existen novedades que bloquean la aprobación/);
  assert.match(sql,/Pago total diferente al detalle/);
  assert.match(sql,/aliados_cambiar_estado_pago/);
  assert.match(sql,/Transición de pago inválida/);
  assert.match(sql,/payment\.scheduled/);
  assert.match(sql,/payment\.completed/);
  assert.match(sql,/aliados_resolver_operaciones_propias/);
  assert.match(sql,/aliados_guardar_pagamos/);
  assert.match(sql,/aliados_resolver_novedad/);
  assert.match(sql,/operacion_tienda_sin_pagamos/);
  assert.match(sql,/diferencia_inicial_sin_revisar/);
});

test('tiendas propias extienden operaciones con snapshots sin crear tablas paralelas', () => {
  for (const field of ['inicial_kora','diferencia_inicial','costo_equipo','pagamos','pago_neto_tienda','utilidad_tienda']) assert.match(sql,new RegExp(field));
  assert.doesNotMatch(sql,/create table if not exists public\.(liquidation_store|tiendas_liquidacion)/i);
  assert.match(sql,/from public\.venta_items vi/);
  assert.match(sql,/join public\.ventas v/);
  assert.match(sql,/join public\.creditos c/);
  assert.match(sql,/join public\.unidades u/);
});

test('importación, pagos y eventos tienen claves de idempotencia', () => {
  assert.match(sql,/liquidations[\s\S]*idempotency_key uuid not null unique/);
  assert.match(sql,/payment_orders[\s\S]*idempotency_key uuid not null unique/);
  assert.match(sql,/liquidation_bonuses[\s\S]*idempotency_key uuid not null unique/);
  assert.match(sql,/liquidation_domain_events[\s\S]*idempotency_key text not null unique/);
  for (const event of ['liquidation.imported','liquidation.validated','liquidation.has_incidents','liquidation.calculated','liquidation.reviewed','liquidation.approved','payment.scheduled','payment.completed','payment.rejected','liquidation.closed']) assert.match(sql,new RegExp(event.replace('.','\\.')));
});

test('RLS y Storage solo exponen Aliados a operadores autorizados', () => {
  assert.match(sql,/enable row level security/);
  assert.match(sql,/create policy aliados_select/);
  assert.match(sql,/create policy audit_log_aliados_select/);
  assert.match(sql,/tiene_capacidad_aliados\('revisor'\)/);
  assert.match(sql,/bucket_id='soportes'/);
  assert.match(sql,/\^aliados\/\(originales\|pagos\)/);
  assert.match(sql,/10485760/);
  assert.doesNotMatch(sql,/UUID_[0-9a-f-]{8}/i);
});

test('rollback se niega a borrar históricos y retira solo objetos V1', () => {
  assert.match(rollback,/exists\(select 1 from public\.liquidations\)/);
  assert.match(rollback,/Rollback automático bloqueado/);
  assert.doesNotMatch(rollback,/drop table.*(origenes|ejecutivos|perfiles|audit_log)/i);
  assert.doesNotMatch(rollback,/delete from public\.(origenes|ejecutivos|perfiles|audit_log)/i);
});

test('interfaz usa el shell actual y no genera Excel', () => {
  assert.match(html,/sidebar\.js/);
  assert.match(html,/aliados-liquidaciones-domain\.js/);
  assert.match(html,/Nueva importación/);
  assert.match(app,/XLSX\.read/);
  assert.doesNotMatch(app,/XLSX\.write|writeFile|book_new/);
  assert.match(app,/storage\.from\('soportes'\)/);
  assert.match(sidebar,/CREDITEK ALIADOS/);
  assert.match(sidebar,/perfil\.es_operador_aliados/);
});

test('interfaz incluye vistas operativas agrupadas por aliado y ejecutivo', () => {
  assert.match(html,/data-tab="allies"[^>]*>Por aliado</);
  assert.match(html,/data-tab="executives"[^>]*>Por ejecutivo</);
  assert.match(app,/D\.agruparPorAliado/);
  assert.match(app,/D\.agruparPorEjecutivo/);
  for (const label of ['Aliado','Sede','Plataforma','Monto liquidado','Pago al aliado','Estado del pago','Ejecutivo','Aliados incluidos','Total a recibir']) {
    assert.match(app,new RegExp(label));
  }
});

test('interfaz administrativa separa modelos y oculta datos técnicos por defecto', () => {
  assert.match(html,/aliados-liquidaciones-ux\.js/);
  for (const label of ['Todas','Tiendas propias','Aliados','Estado actual','Guardar revisión','Aprobar liquidación','Rechazar y devolver a revisión']) assert.match(html,new RegExp(label));
  for (const label of ['Beneficiario','Fecha programada','Fecha de pago','Cuenta bancaria','Realizada por','Descripción','Resultado','Ver detalle técnico']) assert.match(app,new RegExp(label));
  assert.match(app,/UX\.formatoCOP/);
  assert.match(app,/UX\.fechaCorta/);
  assert.match(app,/aliados_guardar_pagamos/);
  assert.doesNotMatch(app,/head=\['Pago','Valor'/);
});

test('Liquidaciones reutiliza la sesión, shell y configuración general de KORA', () => {
  assert.match(html,/kora-environment\.generated\.js/);
  assert.match(html,/data-kora-requires-auth="true"/);
  assert.doesNotMatch(html,/loginEmail|loginPass|btnLogin|type="password"/);
  assert.doesNotMatch(app,/signInWithPassword|createClient\(/);
  assert.match(app,/window\.creditekSidebar\.sb/);
  assert.match(app,/window\.creditekSidebar\.perfil/);
  assert.match(app,/tiene_capacidad_aliados/);
  assert.match(app,/kora-sidebar-ready/);
  assert.match(app,/location\.href='app\.html'/);
  assert.match(html,/Acceso denegado/);
  assert.match(sidebar,/KORA_ERP_SUPABASE_URL/);
  assert.match(sidebar,/KORA_ERP_SUPABASE_ANON_KEY/);
  assert.match(login,/kora-environment\.generated\.js/);
  assert.match(login,/KORA_ENV\.KORA_ERP_SUPABASE_URL/);
  assert.match(login,/KORA_ENV\.KORA_ERP_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(login,/const SUPABASE_URL = 'https:\/\//);
});
