import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
const root = resolve('creditek/agentes');
test('studio: session, manual draft, JPEG upload, saved revision, whole-calendar approval and unsaved-edit gate', async t => {
  const server = createServer(async (req, res) => { try { const path = resolve(root, '.' + new URL(req.url, 'http://local').pathname); if (!path.startsWith(root + '/')) throw Error(); const type = path.endsWith('.mjs') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html'; res.setHeader('content-type', type); res.end(await readFile(path)); } catch { res.writeHead(404).end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let stored = null, approvals = 0, imageBuffer = null;
  await page.addInitScript(() => { localStorage.setItem('aura_supabase_session_v1', JSON.stringify({ access_token: 'test-only', refresh_token: 'test-only', expires_at: 9999999999 })); });
  await page.route('https://**/*', async route => {
    const request = route.request(), url = new URL(request.url()); let data;
    if (url.pathname.endsWith('/aura_my_access')) data = { apps: [{ role_id: 'aura.owner' }] };
    else if (url.pathname.endsWith('/aura_meta_ads_my_access')) data = { active: false };
    else if (url.pathname.endsWith('/connection')) data = { page_name: 'Creditek (simulación)', instagram_username: 'creditek-test', automation_enabled: true, missing: { facebook: [], instagram: [], measurement: [] } };
    else if (url.pathname.endsWith('/calendars') && request.method() === 'GET') data = { calendars: stored ? [stored] : [], learning: { channels: { facebook: { comparable_posts: 0, status: 'insufficient_data', topics: [] }, instagram: { comparable_posts: 0, status: 'insufficient_data', topics: [] } } } };
    else if (url.pathname.endsWith('/calendars')) { stored = { ...request.postDataJSON(), revision: 1, state: 'draft', approval_digest: 'mock-digest' }; data = stored; }
    else if (url.pathname.endsWith('/media') && request.method() === 'POST') data = { asset: 'a'.repeat(64) + '.jpg' };
    else if (url.pathname.endsWith('/preview')) data = stored;
    else if (url.pathname.endsWith('/approve')) { assert.equal(request.postDataJSON().confirm, 'APPROVE_CALENDAR_AND_SCHEDULE'); approvals++; stored.approval = { by: 'owner' }; stored.state = 'approved'; for (const p of stored.pieces) p.results = { facebook: { status: 'scheduled' }, instagram: { status: 'scheduled' } }; data = stored; }
    else if (url.pathname.endsWith('/pause')) { stored.approval = null; stored.state = 'paused'; for (const p of stored.pieces) p.results = { facebook: { status: 'cancelled' }, instagram: { status: 'cancelled' } }; data = stored; }
    else if (url.pathname.endsWith('.jpg') && imageBuffer) return route.fulfill({ status: 200, body: imageBuffer, contentType: 'image/png' });
    else return route.abort();
    await route.fulfill({ status: 200, json: data });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/aura-organic-studio.html`);
  await page.waitForFunction(() => !document.getElementById('app').hidden);
  await page.getByRole('button', { name: 'Crear pieza manual' }).click();
  await page.locator('#pieces textarea').fill('Un celular cuidado te acompaña por más tiempo. ¿Qué consejo usas?');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 600; const ctx = c.getContext('2d'); ctx.fillStyle = '#0b1e3d'; ctx.fillRect(0, 0, 600, 600); ctx.fillStyle = '#00c4cc'; ctx.fillRect(0, 480, 600, 120); ctx.fillStyle = '#fff'; ctx.font = '32px sans-serif'; ctx.fillText('IMAGEN DE PRUEBA LOCAL', 65, 280); return c.toDataURL('image/png').split(',')[1]; });
  imageBuffer = Buffer.from(png, 'base64');
  await page.locator('#pieces input[type=file]').setInputFiles({ name: 'local-test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('Imagen guardada'));
  assert.equal(await page.locator('#approve').isDisabled(), true);
  await page.locator('#save').click(); await page.waitForFunction(() => !document.getElementById('approve').disabled);
  page.on('dialog', dialog => dialog.accept()); await page.locator('#approve').click();
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('Calendario aprobado'));
  assert.equal(approvals, 1);
  assert.equal(await page.locator('#pieces textarea').isDisabled(), true);
  await page.locator('#edit').click(); await page.waitForFunction(() => !document.querySelector('#pieces textarea').disabled);
  await page.locator('#pieces textarea').fill('Texto modificado sin aprobar.'); assert.equal(await page.locator('#approve').isDisabled(), true);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/private/tmp/aura-organic-studio-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/private/tmp/aura-organic-studio-mobile.png', fullPage: true });
});
