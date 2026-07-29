import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../../supabase/migrations/20260729_b2b_catalog_v1.sql', import.meta.url);
const edgePath = new URL('../../supabase/functions/submit-b2b-order/index.ts', import.meta.url);
const appsScriptPath = new URL('../../creditek/portal/Code.gs', import.meta.url);
const analyzerPath = new URL('../../supabase/functions/analyze-b2b-catalog/index.ts', import.meta.url);
const portalPath = new URL('../../creditek/portal/index.html', import.meta.url);

test('la migración separa la vista pública de las tablas internas', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create\s+(?:or\s+replace\s+)?view\s+public\.b2b_catalog_public/i);
  assert.match(sql, /enable\s+row\s+level\s+security/i);
  assert.match(sql, /revoke\s+all[\s\S]+b2b_catalog_offers[\s\S]+anon/i);
  assert.doesNotMatch(
    sql.match(/create\s+(?:or\s+replace\s+)?view\s+public\.b2b_catalog_public[\s\S]+?(?=;\s*(?:create|alter|grant|revoke))/i)?.[0] ?? '',
    /\b(cost|provider_id|margin|utility)\b/i,
  );
});

test('submit-b2b-order exige JWT y resuelve los ítems dentro de Supabase', async () => {
  const source = await readFile(edgePath, 'utf8');

  assert.match(source, /authorization/i);
  assert.match(source, /auth\.getUser/i);
  assert.match(source, /resolve_b2b_order_items/i);
  assert.match(source, /B2B_APPS_SCRIPT_SECRET/);
  assert.doesNotMatch(source, /service_role\s*[:=]\s*['"]/i);
});

test('Apps Script valida firma e idempotencia antes de guardar el pedido interno', async () => {
  const source = await readFile(appsScriptPath, 'utf8');

  assert.match(source, /guardar_pedido_seguro/);
  assert.match(source, /B2B_APPS_SCRIPT_SECRET/);
  assert.match(source, /Utilities\.computeHmacSha256Signature/);
  assert.match(source, /pedidoYaRegistrado_/);
});

test('el analizador conserva el texto original y exige permiso administrativo', async () => {
  const source = await readFile(analyzerPath, 'utf8');

  assert.match(source, /auth\.getUser/i);
  assert.match(source, /b2b_is_catalog_admin/i);
  assert.match(source, /raw_text/);
  assert.match(source, /GEMINI_API_KEY/);
  assert.doesNotMatch(source, /publish_b2b_catalog/i);
});

test('el portal elimina la carga heredada de Excel y usa Supabase como fuente del catálogo', async () => {
  const source = await readFile(portalPath, 'utf8');

  assert.doesNotMatch(source, /function\s+cargarExcel\s*\(/);
  assert.doesNotMatch(source, /action=catalogo/);
  assert.match(source, /const\s+catalogoRaw\s*=\s*\[\s*\]/);
  assert.match(source, /catalog-admin\.mjs/);
});

test('la publicación bloquea excepciones comerciales y referencias sin fotografía', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const publish = sql.match(
    /create or replace function public\.publish_b2b_catalog[\s\S]+?(?=create or replace function)/i,
  )?.[0] ?? '';
  const correction = sql.match(
    /create or replace function public\.correct_b2b_catalog_offer[\s\S]+?(?=create or replace function)/i,
  )?.[0] ?? '';

  assert.match(publish, /missing_image/);
  assert.match(publish, /suspicious_price/);
  assert.match(correction, /image_slug/);
});

test('la utilidad comercial se configura mediante una función administrativa auditada', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /set_b2b_catalog_utility/);
  assert.match(sql, /utility_type/);
  assert.match(sql, /auth\.uid\(\)/);
});
