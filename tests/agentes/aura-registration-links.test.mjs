import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const htmlPath = new URL('../../creditek/agentes/index.html', import.meta.url);

test('registration links panel uses the protected AURA proxy and explicit permission', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /data-aura-app="registro_links"/);
  assert.match(html, /hasPermission\(auraAccess, 'registro_links', 'registro_links\.manage'\)/);
  assert.match(html, /if \(!canManageRegistrationLinks\(\)\)/);
  assert.match(html, /fetch\(`\/api\/aura\/enlaces\$\{path\}`/);
  assert.match(html, /auraAuth\.token\(\)/);
  assert.doesNotMatch(html, /ADMIN_ENLACES_TOKEN/);
});

test('convenios has its own permission and no longer inherits Sofia access', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /data-aura-app="convenios"/);
  assert.match(html, /hasPermission\(auraAccess, appId, 'convenios\.use'\)/);
  assert.doesNotMatch(html, /Convenios de Aliados',this,'sofia'/);
  assert.doesNotMatch(html, /Convenios de Aliados','sofia'/);
});

test('registration links panel warns about one-time display and supports QR download', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /Este link solo se muestra una vez/);
  assert.match(html, /qrcodejs\/1\.0\.0\/qrcode\.min\.js/);
  assert.match(html, /toDataURL\('image\/png'\)/);
});
