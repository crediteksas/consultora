import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

test('los importes del resumen ejecutivo se muestran completos en distintos anchos', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.route('http://kora.test/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      try { route.fulfill({ contentType: 'text/css', body: readFileSync(path) }); }
      catch { route.fulfill({ status: 404, body: '' }); }
    });
    for (const width of [375, 500, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`
        <link rel="stylesheet" href="http://kora.test/design-system/components/kora-dashboard.css">
        <link rel="stylesheet" href="http://kora.test/design-system/components/kora-dashboard-premium.css">
        <body data-kora-dashboard="1.0.0">
          <main style="width:calc(100% - 32px);max-width:1400px;margin:auto">
            <section class="dashboard-metrics">
              <article class="dashboard-metric"><div class="dashboard-metric__header"><span class="kpi-label">Ventas totales</span></div><div class="kpi-valor kpi-valor--moneda">$ 123.582.000</div></article>
              <article class="dashboard-metric"><div class="dashboard-metric__header"><span class="kpi-label">Créditos</span></div><div class="kpi-valor">84 uds</div></article>
              <article class="dashboard-metric"><div class="dashboard-metric__header"><span class="kpi-label">Resultado operativo</span></div><div class="kpi-valor kpi-valor--moneda">$ 39.896.330</div></article>
              <article class="dashboard-metric"><div class="dashboard-metric__header"><span class="kpi-label">Clientes pendientes</span></div><div class="kpi-valor">93</div></article>
            </section>
          </main>
        </body>`);
      await page.waitForLoadState('networkidle');
      const results = await page.locator('.kpi-valor--moneda').evaluateAll(elements => elements.map(element => {
        const card = element.closest('.dashboard-metric');
        const style = getComputedStyle(element);
        return {
          text: element.textContent,
          clipped: style.overflow === 'hidden' || style.textOverflow === 'ellipsis',
          horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
          verticalOverflow: element.scrollHeight > element.clientHeight + 1,
          escapesCard: element.getBoundingClientRect().right > card.getBoundingClientRect().right + 1,
        };
      }));
      assert.equal(results.length, 2);
      for (const result of results) {
        assert.equal(result.clipped, false, `${width}px: ${result.text} no debe usar elipsis`);
        assert.equal(result.horizontalOverflow, false, `${width}px: ${result.text} desborda horizontalmente`);
        assert.equal(result.verticalOverflow, false, `${width}px: ${result.text} desborda verticalmente`);
        assert.equal(result.escapesCard, false, `${width}px: ${result.text} sale de la tarjeta`);
      }
    }
  } finally {
    await browser.close();
  }
});
