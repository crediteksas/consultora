import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../../supabase/migrations/20260729_b2b_catalog_v1.sql', import.meta.url);
const edgePath = new URL('../../supabase/functions/submit-b2b-order/index.ts', import.meta.url);
const appsScriptPath = new URL('../../creditek/portal/Code.gs', import.meta.url);
const analyzerPath = new URL('../../supabase/functions/analyze-b2b-catalog/index.ts', import.meta.url);
const portalPath = new URL('../../creditek/portal/index.html', import.meta.url);
const catalogApiPath = new URL('../../creditek/portal/catalog-api.mjs', import.meta.url);
const productCssPath = new URL('../../design-system/components/kora-product.css', import.meta.url);
const productJsPath = new URL('../../design-system/components/kora-product.js', import.meta.url);

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

test('Apps Script resuelve costos internamente y aplica idempotencia', async () => {
  const source = await readFile(appsScriptPath, 'utf8');

  assert.match(source, /guardarPedidoPublico_/);
  assert.match(source, /resolverProductosCatalogo_/);
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

test('el portal elimina la carga heredada de Excel y usa el catálogo público de Apps Script', async () => {
  const source = await readFile(portalPath, 'utf8');
  const api = await readFile(catalogApiPath, 'utf8');

  assert.doesNotMatch(source, /function\s+cargarExcel\s*\(/);
  assert.match(api, /action=catalogo/);
  assert.match(source, /const\s+catalogoRaw\s*=\s*\[\s*\]/);
  assert.match(source, /catalog-admin\.mjs/);
});

test('la ampliación conserva la interfaz moderna compartida de AURA', async () => {
  const source = await readFile(portalPath, 'utf8');
  const productCss = await readFile(productCssPath, 'utf8');
  const productJs = await readFile(productJsPath, 'utf8');

  assert.match(source, /design-system\/components\/kora-product\.css/);
  assert.match(source, /design-system\/components\/kora-product\.js/);
  assert.match(source, /data-kora-brand/);
  assert.match(source, /data-lucide="store"/);
  assert.match(source, /class="resumen-header"/);
  assert.match(source, /class="excel-section"/);
  assert.match(source, /id="catalogAdminMount"/);
  assert.match(source, /class="cierre-section"/);
  assert.doesNotMatch(source, /id="btnActualizarCatalogo"/);
  assert.doesNotMatch(source, /B2BCatalogAdmin\.open\(\)[^;]*["']ACTUALIZAR CATÁLOGO/);
  assert.match(productCss, /@import url\("\.\.\/styles\/index\.css"\)/);
  assert.match(productJs, /dataset\.koraProduct = '1\.0\.0'/);
});

test('el cierre conserva los identificadores de hoja y retira los pedidos cerrados', async () => {
  const source = await readFile(portalPath, 'utf8');

  assert.match(source, /_hoja:p\._hoja/);
  assert.match(source, /_fila:p\._fila/);
  assert.match(source, /cargarPendientesAdmin\(\);renderConsolidado\(\)/);
});

test('la actualización de catálogo exige una sesión administrativa validada en Apps Script', async () => {
  const source = await readFile(appsScriptPath, 'utf8');

  assert.match(source, /validarSesionConAlcance_\(body\.session_token, 'admin'\)/);
  assert.match(source, /B2B_ADMIN_PIN_HASH/);
  assert.doesNotMatch(source, /body\.admin_pin/);
  assert.match(source, /publicarCatalogoAdmin_/);
  assert.match(source, /crearSnapshotCatalogo_/);
});

test('el contrato de tienda no envía ni recibe proveedor o costos', async () => {
  const appsScript = await readFile(appsScriptPath, 'utf8');
  const portal = await readFile(portalPath, 'utf8');
  const publicCatalog = appsScript.match(
    /function leerCatalogo_\(\)[\s\S]+?(?=\nfunction )/,
  )?.[0] ?? '';
  const submit = portal.match(
    /async function enviarPedido\(\)[\s\S]+?(?=\nfunction )/,
  )?.[0] ?? '';

  assert.doesNotMatch(publicCatalog, /proveedor|precioCompra|margen|utilidad/i);
  assert.doesNotMatch(submit, /proveedor|precioCompra|margen|utilidad/i);
  assert.match(submit, /nombre:i\.producto\.nombre/);
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
