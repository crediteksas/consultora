import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

test('Dashboard conserva estilos externos, ocultación y cierre responsive sin desbordes', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'kora.test') return route.abort();
      if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-system/components/kora-dashboard.css?v=1.0.1"></head><body data-kora-dashboard="1.0.0"><main style="padding:20px"><section class="dashboard-month-close" hidden><div class="dashboard-month-close__grid">${Array.from({ length: 3 }, () => '<div class="dashboard-month-close__item"><strong>Negocio de prueba</strong><p>Utilidad neta: $ 120.000</p></div>').join('')}</div></section></main></body></html>` });
      const path = resolve(process.cwd(), '.' + url.pathname);
      if (!path.startsWith(process.cwd() + '/')) return route.abort();
      try { await route.fulfill({ contentType: 'text/css', body: await readFile(path) }); }
      catch { await route.fulfill({ status: 404, body: '' }); }
    });
    await page.goto('https://kora.test/fixture');
    assert.equal(await page.locator('.dashboard-month-close').isVisible(), false);
    await page.evaluate(() => document.querySelectorAll('[hidden]').forEach(el => el.hidden = false));
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const columns = await page.locator('.dashboard-month-close__grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width <= 760 ? 1 : 3);
    }
  } finally { await browser.close(); }
});
