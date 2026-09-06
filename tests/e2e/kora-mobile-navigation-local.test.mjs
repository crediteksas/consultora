// Real shared navigation and styles. Synthetic profile, no session or database access.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { chromium, webkit } from '@playwright/test';

test('menú móvil abre con preferencia automática o fijada, sin perder navegación', async () => {
  const root = process.cwd();
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/creditek/erp/aliados-liquidaciones.html') {
      // Verifica el destino sin cargar el módulo financiero ni autenticar.
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><title>Destino de prueba</title><h1>Liquidaciones</h1>');
      return;
    }
    if (pathname === '/creditek/erp/navigation-test') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/design-system/components/kora-product.css">
        <script src="/design-system/components/kora-product.js" defer></script>
        <body class="kora-product-page kora-responsive-ready"><div id="navigationFixture"><main><h2>Resumen ejecutivo</h2><p>Vista de prueba sin datos reales.</p></main></div>
        <script src="/creditek/erp/sidebar.js" data-kora-shell-mode="agents"></script></body></html>`);
      return;
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + '/') || !['.css', '.js', '.woff2', '.png'].includes(path.extname(file))) {
      res.writeHead(404).end(); return;
    }
    try {
      res.setHeader('Content-Type', { '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)]);
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = process.env.KORA_TEST_BROWSER === 'webkit'
      ? await webkit.launch({ headless: true })
      : await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(5000);
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());

    for (const mode of ['auto', 'pinned']) {
      await page.goto(origin + '/creditek/erp/navigation-test');
      await page.evaluate(mode => {
        localStorage.setItem('kora_sidebar_mode_v2', mode);
        window.KoraNavigation.mount({
          root: document.getElementById('navigationFixture'),
          profile: { nombre: 'Usuario de prueba', rol: 'gerencia', es_operador_aliados: true },
          activeItem: { label: 'Resumen ejecutivo', group: 'TABLERO' },
          onLogout() {},
        });
      }, mode);
      const drawer = page.locator('.kora-sidebar');
      const overlay = page.locator('.kora-drawer-overlay');
      const toggle = page.locator('.kora-navigation-toggle');
      for (const width of [320, 390, 430, 768, 1023]) {
        await page.setViewportSize({ width, height: 844 });
        await toggle.click();
        await page.waitForFunction(() => Math.abs(document.querySelector('.kora-sidebar').getBoundingClientRect().left) < 1);
        const box = await drawer.boundingBox();
        assert.ok(box.x >= -1 && box.x + box.width <= width, `${mode}/${width}: drawer dentro de la ventana`);
        assert.equal(await overlay.isVisible(), true);
        assert.equal(await drawer.evaluate(el => el.contains(document.elementFromPoint(40, 80))), true);
        const group = drawer.getByRole('button', { name: 'CREDITEK ALIADOS', exact: true });
        if (await group.getAttribute('aria-expanded') !== 'true') await group.click();
        await drawer.getByRole('link', { name: 'Liquidaciones', exact: true }).click({ trial: true });
        assert.ok(await drawer.getByRole('link', { name: 'Liquidaciones', exact: true }).getAttribute('href'));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        if (process.env.KORA_SCREENSHOT_DIR && width <= 390) {
          await fs.mkdir(process.env.KORA_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.KORA_SCREENSHOT_DIR, `menu-movil-${mode}-${width}.png`) });
        }
        await drawer.getByRole('button', { name: 'Cerrar navegación', exact: true }).click();
        assert.equal(await overlay.isVisible(), false);
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
        await toggle.click();
        await page.keyboard.press('Escape');
        assert.equal(await overlay.isVisible(), false);
        await toggle.click();
        await overlay.click({ position: { x: width - 5, y: 300 } });
        assert.equal(await overlay.isVisible(), false);
      }
      await toggle.click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.querySelector('.kora-drawer-overlay').hidden);
      assert.equal(await drawer.getAttribute('role'), null);
      assert.equal(await page.locator('.kora-shell-root').getAttribute('data-sidebar-collapsed'), String(mode === 'auto'));
      await toggle.click();
      assert.equal(await page.locator('.kora-shell-root').getAttribute('data-sidebar-collapsed'), String(mode !== 'auto'));
      await page.setViewportSize({ width: 390, height: 844 });
      await toggle.click();
      const group = drawer.getByRole('button', { name: 'CREDITEK ALIADOS', exact: true });
      if (await group.getAttribute('aria-expanded') !== 'true') await group.click();
      await drawer.getByRole('link', { name: 'Liquidaciones', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/creditek/erp/aliados-liquidaciones.html');
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
