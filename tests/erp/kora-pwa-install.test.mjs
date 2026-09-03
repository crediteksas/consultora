import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relative => readFile(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('KORA declara una aplicación instalable con identidad Creditek', async () => {
  const manifest = JSON.parse(await read('creditek/erp/kora.webmanifest'));
  assert.equal(manifest.short_name, 'KORA');
  assert.equal(manifest.start_url, '/creditek/erp/app?source=pwa');
  assert.equal(manifest.scope, '/creditek/erp/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#0B1E3D');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
});

test('el shell no expone la instalación a todos los perfiles', async () => {
  const [sidebar, installer] = await Promise.all([read('creditek/erp/sidebar.js'), read('creditek/erp/kora-install.js')]);
  assert.doesNotMatch(sidebar, /data-kora-install/); assert.doesNotMatch(sidebar, />Instalar KORA</); assert.match(sidebar, /kora-install\.js\?v=1\.0\.0/);
  assert.match(installer, /beforeinstallprompt/); assert.match(installer, /Agregar a pantalla de inicio/); assert.match(installer, /serviceWorker\?\.register/);
});

test('el service worker no guarda información autenticada en caché', async () => {
  const worker = await read('creditek/erp/kora-service-worker.js');
  assert.match(worker, /event\.respondWith\(fetch\(event\.request\)\)/); assert.doesNotMatch(worker, /caches\.(?:open|match)/); assert.doesNotMatch(worker, /cache\.put/);
});

test('el login enlaza manifiesto e icono de pantalla principal', async () => {
  const app = await read('creditek/erp/app.html');
  assert.match(app, /rel="manifest" href="\/creditek\/erp\/kora\.webmanifest"/);
  assert.match(app, /rel="apple-touch-icon" href="\/creditek\/erp\/kora-icon-192\.png"/);
  assert.match(app, /name="theme-color" content="#0B1E3D"/);
});

test('KORA ofrece un enlace público y adaptable para distribuir la instalación', async () => {
  const [page, worker, config] = await Promise.all([
    read('creditek/erp/instalar.html'),
    read('src/kora-version-worker.mjs'),
    read('wrangler.kora.jsonc'),
  ]);
  assert.match(page, /Instala KORA en este dispositivo/);
  assert.match(page, /beforeinstallprompt/);
  assert.match(page, /Agregar a pantalla de inicio/);
  assert.match(page, /Añadir al Dock/);
  assert.match(page, /Safari instala la aplicación desde el menú Archivo/);
  assert.doesNotMatch(page, /navigator\.share/);
  assert.doesNotMatch(page, /Compartir enlace de instalación/);
  assert.match(page, /kora-service-worker\.js/);
  assert.match(worker, /url\.pathname === '\/instalar'/);
  assert.match(config, /"\/instalar"/);
});

test('compartir la instalación queda dentro de Administración y solo para perfiles corporativos', async () => {
  const [page, sidebar, access] = await Promise.all([
    read('creditek/erp/compartir-instalacion.html'),
    read('creditek/erp/sidebar.js'),
    read('creditek/erp/kora-access-control.js'),
  ]);
  assert.match(page, /data-kora-requires-auth="true"/);
  assert.match(page, /Compartir instalación de KORA/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /instalar\?v=1\.0\.1/);
  assert.match(page, /Chrome no puede ordenar que Safari abra una página/);
  assert.match(sidebar, /label:\s*'Compartir instalación'[\s\S]*roles:\s*\['gerencia', 'auditoria'\]/);
  assert.match(access, /label:\s*'Compartir instalación'[\s\S]*roles:\s*\['gerencia', 'auditoria'\]/);
  const storeRoutes = access.match(/const STORE_ROUTES_BY_ROLE[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.doesNotMatch(storeRoutes, /compartir-instalacion/);
});
