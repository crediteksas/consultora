import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Isolated presentation fixture: no credentials, API requests or business writes.
const css = ['creditek/erp/aliados-v1-1.css', 'design-system/components/kora-product.css', 'design-system/components/kora-responsive.css'].map(p => `<link rel="stylesheet" href="http://kora.test/${p}">`).join('');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('http://kora.test/**', route => {
    const p = new URL(route.request().url()).pathname.slice(1);
    try { route.fulfill({contentType: p.endsWith('.css') ? 'text/css' : 'application/octet-stream', body: readFileSync(p)}); }
    catch { route.fulfill({status:404, body:''}); }
  });
  for (const width of [320, 390, 768, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const kind of ['toolbar', 'filters', 'filtros', 'filter-bar', 'filter-row']) {
      await page.setContent(`${css}<body class="kora-responsive-ready kora-product-page"><main class="main-content"><div class="page"><h1>Dashboard de liquidaciones</h1><section class="${kind} card">${['01/08/2026', '30/08/2026', 'Aliados', 'Krediya', 'Todos los ejecutivos', 'Todos los establecimientos', 'Todas las ciudades'].map(t => `<select class="control"><option>${t}</option></select>`).join('')}<button class="btn">Limpiar filtros</button></section><section class="metrics">${['Operaciones nuevas', 'Utilidad disponible', 'Ventas del periodo', 'Bonificaciones del periodo', 'Gastos aprobados', 'Novedades bloqueantes'].map(t=>`<div class="metric"><small>${t}</small><strong>$ 14.476.977</strong></div>`).join('')}</section></div></main></body>`);
      const result = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d');
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1, clipped: [...document.querySelectorAll('select')].filter(el => {
          const s = getComputedStyle(el); ctx.font = s.font;
          return ctx.measureText(el.selectedOptions[0].text).width > el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - 20;
        }).map(el => el.value) };
      });
      assert.equal(result.overflow, false, `${kind} ${width}: viewport overflow`);
      assert.deepEqual(result.clipped, [], `${kind} ${width}: clipped labels`);
      if(kind === 'toolbar') await page.screenshot({path:`/tmp/kora-filtros-${width}.png`, fullPage:true});
    }
  }
  console.log('30 escenarios: cinco contenedores compartidos, seis anchos, sin recorte de filtros ni desborde.');
} finally { await browser.close(); }
