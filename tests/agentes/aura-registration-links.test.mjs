import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const htmlPath = new URL('../../creditek/agentes/index.html', import.meta.url);

test('registration links panel uses the protected AURA proxy and owner gate', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /data-aura-owner-only/);
  assert.match(html, /grant\?\.role_id === 'aura\.owner'/);
  assert.match(html, /fetch\(`\/api\/aura\/enlaces\$\{path\}`/);
  assert.match(html, /auraAuth\.token\(\)/);
  assert.doesNotMatch(html, /ADMIN_ENLACES_TOKEN/);
});

test('registration links panel warns about one-time display and supports QR download', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /Este link solo se muestra una vez/);
  assert.match(html, /qrcodejs\/1\.0\.0\/qrcode\.min\.js/);
  assert.match(html, /toDataURL\('image\/png'\)/);
});
