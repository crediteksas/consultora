import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiPath = new URL('../../creditek/portal/catalog-api.mjs', import.meta.url);
const adminPath = new URL('../../creditek/portal/catalog-admin.mjs', import.meta.url);
const portalPath = new URL('../../creditek/portal/index.html', import.meta.url);
const appsScriptPath = new URL('../../creditek/portal/Code.gs', import.meta.url);

test('los proveedores se obtienen de Apps Script y no de una lista fija del frontend', async () => {
  const api = await readFile(apiPath, 'utf8');

  assert.match(api, /action:\s*'listar_proveedores_admin'/);
  assert.doesNotMatch(api, /Promise\.resolve\(\s*\[\s*\{\s*id:\s*'Conquia'/);
});

test('el panel incluye gestión de proveedores y creación junto al selector', async () => {
  const portal = await readFile(portalPath, 'utf8');

  assert.match(portal, /data-catalog-tab="providers"[^>]*>Proveedores</);
  assert.match(portal, /id="catalogNewProvider"/);
  assert.match(portal, /id="catalogProviderDialog"/);
  assert.match(portal, /id="catalogProviderSearch"/);
});

test('la interfaz refresca el selector y selecciona el proveedor recién creado', async () => {
  const admin = await readFile(adminPath, 'utf8');

  assert.match(admin, /saveProvider/);
  assert.match(admin, /refreshProviderSelect\(saved\.id\)/);
  assert.match(admin, /Proveedor guardado correctamente/);
});

test('Apps Script mantiene PROVEEDORES como fuente central, sin eliminación física', async () => {
  const source = await readFile(appsScriptPath, 'utf8');

  assert.match(source, /SHEET_PROVEEDORES:\s*'PROVEEDORES'/);
  assert.match(source, /listar_proveedores_admin/);
  assert.match(source, /guardar_proveedor_admin/);
  assert.match(source, /normalizarNombreProveedor_/);
  assert.match(source, /Ya existe un proveedor con ese nombre/);
  assert.doesNotMatch(source, /deleteRow\([^)]*proveedor/i);
});

test('nombre y nombre comercial son obligatorios', async () => {
  const portal = await readFile(portalPath, 'utf8');
  const source = await readFile(appsScriptPath, 'utf8');

  assert.match(portal, /id="catalogProviderCommercialName"\s+required/);
  assert.match(source, /El nombre comercial del proveedor es obligatorio/);
});

test('el selector operativo recibe únicamente proveedores activos', async () => {
  const source = await readFile(appsScriptPath, 'utf8');
  const api = await readFile(apiPath, 'utf8');

  assert.match(api, /providers\(\{\s*activeOnly\s*=\s*true\s*\}/);
  assert.match(source, /solo_activos/);
  assert.match(source, /provider\.status\s*===\s*'activo'/);
});
