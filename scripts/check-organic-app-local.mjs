// Read-only application-shell check. Session and backend are simulated locally.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const useLive = process.argv.includes('--live');
const liveHome = await (await fetch('https://aura.crediteksas.com/creditek/agentes/?source=pwa')).text();
const mf = useLive ? null : new Miniflare(convertV4MiniflareOptions({ modules: true, script: await readFile('dist/aura-organic-shell/worker.mjs', 'utf8'), compatibilityDate: '2026-07-23' }));
const patchedHome = useLive ? liveHome : await (await mf.dispatchFetch('https://aura.crediteksas.com/creditek/agentes/?source=pwa')).text();
if (!patchedHome.includes('data-organic-app-card')) throw Error('App navigation is not present');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1150, height: 840 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('requestfailed', r => errors.push(`Failed ${new URL(r.url()).pathname}: ${r.failure()?.errorText}`));
  await page.addInitScript(() => localStorage.setItem('aura_supabase_session_v1', JSON.stringify({ access_token: 'LOCAL-TEST', refresh_token: 'LOCAL-TEST', expires_at: 9999999999 })));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname === 'aura.crediteksas.com' && url.pathname === '/creditek/agentes/') return route.fulfill({ contentType: 'text/html', body: patchedHome });
    if (url.hostname.endsWith('.supabase.co')) {
      if (url.pathname.endsWith('/aura_my_access')) return route.fulfill({ json: { display_name: 'PRUEBA LOCAL', apps: [{ role_id: 'aura.owner', app_id: 'sofia', permissions: ['sofia.use'] }] } });
      return route.fulfill({ json: [] });
    }
    if (url.hostname.endsWith('.workers.dev') || url.pathname.startsWith('/api/')) {
      if (url.pathname.endsWith('/connection')) return route.fulfill({ json: { page_name: 'SIMULACIÓN', instagram_username: 'local', automation_enabled: false, missing: { facebook: [], instagram: [], measurement: ['read_insights'] } } });
      if (url.pathname.endsWith('/calendars') && req.method() === 'GET') return route.fulfill({ json: { calendars: [], learning: { channels: { facebook: { status: 'insufficient_data', comparable_posts: 0, topics: [] }, instagram: { status: 'insufficient_data', comparable_posts: 0, topics: [] } } } } });
      return route.abort();
    }
    if (!['GET', 'HEAD'].includes(req.method())) return route.abort();
    return route.continue();
  });
  await page.goto('https://aura.crediteksas.com/creditek/agentes/?source=pwa');
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.locator('[data-organic-app-card]').click();
  const frame = page.frameLocator('#main-iframe');
  await frame.locator('#connection').waitFor();
  await frame.locator('#refresh').click();
  await frame.locator('#manual').click();
  await frame.locator('#pieces textarea').fill('Prueba aislada: no guardar ni publicar.');
  const child = page.frames().find(f => f.url().includes('aura-organic-studio'));
  const bounds = await page.locator('#main-iframe').boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(300);
  const down = await child.evaluate(() => scrollY);
  await page.mouse.wheel(0, -10000);
  await page.waitForTimeout(300);
  const up = await child.evaluate(() => scrollY);
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  console.log(JSON.stringify({ test: useLive ? 'Live published AURA app shell; session/backend locally mocked' : 'Actual route Worker bundle; session/backend locally mocked', iframeBounds: bounds, scrollDown: down, scrollUp: up, returnedToPanel: await page.locator('#main-content').isVisible(), errors }));
  if (down <= 0 || up !== 0 || !await page.locator('#main-content').isVisible()) throw Error('Embedded navigation/scroll failed');
} finally { await browser.close(); if (mf) await mf.dispose(); }
