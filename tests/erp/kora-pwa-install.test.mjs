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

test('el shell ofrece un botón visual para instalar KORA', async () => {
  const [sidebar, installer] = await Promise.all([read('creditek/erp/sidebar.js'), read('creditek/erp/kora-install.js')]);
  assert.match(sidebar, /data-kora-install/); assert.match(sidebar, />Instalar KORA</); assert.match(sidebar, /kora-install\.js\?v=1\.0\.0/);
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
