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
      await page.setContent(`${css}<body class="kora-responsive-ready kora-product-page"><main class="main-content"><div class="page"><header class="head"><div><h1>Tesorería</h1><p>Cobros, pagos y disponibilidad.</p></div><div class="actions"><button class="btn">Actualizar</button></div></header><section class="${kind} card">${['01/08/2026', '30/08/2026', 'Aliados', 'Krediya', 'Todos los ejecutivos', 'Todos los establecimientos', 'Todas las ciudades'].map(t => `<select class="control"><option>${t}</option></select>`).join('')}<button class="btn">Limpiar filtros</button></section><section class="metrics">${['Operaciones nuevas', 'Utilidad disponible', 'Ventas del periodo', 'Bonificaciones del periodo', 'Gastos aprobados', 'Novedades bloqueantes'].map(t=>`<div class="metric"><small>${t}</small><strong>$ 14.476.977</strong></div>`).join('')}</section></div></main></body>`);
      const result = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d');
        const header = document.querySelector('.page > .head');
        const headerActions = header.querySelector(':scope > .actions');
        const headerStyle = getComputedStyle(header);
        const actionsStyle = getComputedStyle(headerActions);
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1, clipped: [...document.querySelectorAll('select')].filter(el => {
          const s = getComputedStyle(el); ctx.font = s.font;
          return ctx.measureText(el.selectedOptions[0].text).width > el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - 20;
        }).map(el => el.value), header: {
          background: headerStyle.backgroundColor,
          radius: parseFloat(headerStyle.borderTopLeftRadius),
          clipped: headerStyle.overflow === 'hidden',
          actionBackground: actionsStyle.backgroundColor,
          actionBorder: parseFloat(actionsStyle.borderTopWidth),
          actionPadding: parseFloat(actionsStyle.paddingLeft),
        } };
      });
      assert.equal(result.overflow, false, `${kind} ${width}: viewport overflow`);
      assert.deepEqual(result.clipped, [], `${kind} ${width}: clipped labels`);
      assert.equal(result.header.background, 'rgb(255, 255, 255)', `${kind} ${width}: header surface`);
      assert.equal(result.header.radius, 16, `${kind} ${width}: header radius`);
      assert.equal(result.header.clipped, true, `${kind} ${width}: header clipping`);
      assert.equal(result.header.actionBackground, 'rgba(0, 0, 0, 0)', `${kind} ${width}: duplicate action surface`);
      assert.equal(result.header.actionBorder, 0, `${kind} ${width}: duplicate action border`);
      assert.equal(result.header.actionPadding, 0, `${kind} ${width}: duplicate action padding`);
      if(kind === 'toolbar') await page.screenshot({path:`/tmp/kora-layout-${width}.png`, fullPage:true});
    }
  }
  console.log('30 escenarios: cabecera y cinco contenedores compartidos en seis anchos, sin doble superficie, recorte ni desborde.');
} finally { await browser.close(); }
