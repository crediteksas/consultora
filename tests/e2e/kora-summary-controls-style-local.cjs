const { chromium } = require('@playwright/test');
const fs = require('fs/promises');
const path = require('path');
const assert = require('assert/strict');
const root = process.cwd();
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.hostname !== 'kora.test') return route.abort();
      try { return route.fulfill({ contentType: 'text/css', body: await fs.readFile(path.join(root, u.pathname)) }); }
      catch { return route.abort(); }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const doc = await fs.readFile(root + '/creditek/erp/tablero.html', 'utf8');
    const template = doc.match(/<template id="tplTablero">([\s\S]*?)<\/template>/)[1];
    const links = [...doc.split('</head>')[0].matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(x => x[0]).join('');
    await page.setContent('<!doctype html><html><head><base href="https://kora.test/creditek/erp/"><meta name="viewport" content="width=device-width,initial-scale=1">' + links + '</head><body class="kora-product-page" data-kora-dashboard="1.0.0"><main style="padding:16px">' + template + '</main></body></html>');
    for (const [id, text] of Object.entries({ kpiVentas: '$ 123.456.789,12', kpiCreditos: '123', kpiUtilidad: '$ 12.345.678,90', kpiClientes: '18' })) {
      if (await page.locator('#' + id).count()) await page.locator('#' + id).evaluate((e, text) => e.textContent = text, text);
    }
    await page.locator('#tbodyTiendas').evaluate(e => e.innerHTML = '<tr><td><button class="kora-drilldown-link">Tienda de prueba</button></td><td><button class="kora-drilldown-link">5</button> / 16</td><td>31%</td><td><button class="kora-drilldown-link">$8.7M</button></td><td><button class="kora-drilldown-link">-$ 426.858</button></td><td>Al día</td></tr>');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.kora-summary-open,.kora-drilldown-link')).every(e => getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)'));
      for (const item of await page.locator('.kora-summary-open,.kora-drilldown-link').all()) {
        const css = await item.evaluate(e => ({ background: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
        assert.equal(css.background, 'rgba(0, 0, 0, 0)');
        assert.notEqual(css.color, 'rgba(0, 0, 0, 0)');
      }
      for (const item of await page.locator('.kpi-valor, #tbodyTiendas td, #tbodyTiendas button').all()) {
        const size = await item.evaluate(e => ({ w: e.clientWidth, sw: e.scrollWidth, text: e.textContent, overflow: getComputedStyle(e).overflowX }));
        assert.ok(size.sw <= size.w + 1 || size.overflow === 'visible', `Clipped at ${width}: ${size.text}`);
      }
      await page.locator('.kora-summary-open').first().focus();
      assert.notEqual(await page.locator('.kora-summary-open').first().evaluate(e => getComputedStyle(e).outlineStyle), 'none');
      await page.screenshot({ path: '/tmp/kora-summary-' + width + '.png', fullPage: true });
      console.log(`PASS ${width}: transparent controls, readable KPIs and row values, keyboard focus`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
