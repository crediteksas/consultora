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
      const pygStyles=(await fs.readFile(path.join(root,'creditek/erp/pyg.html'),'utf8')).match(/<style>([\s\S]*?)<\/style>/)[1];
      res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/design-system/components/kora-product.css">
        <style>${pygStyles}</style><link rel="stylesheet" href="/creditek/erp/kora-finish.css" media="screen"><script src="/design-system/components/kora-product.js" defer></script>
        <body data-kora-finish="2026.11" class="kora-product-page kora-responsive-ready"><div id="navigationFixture"><main class="page"><h2>Resumen ejecutivo</h2><p>Vista de prueba sin datos reales.</p><style>.remision-heading{display:flex;justify-content:space-between;gap:16px}.qa-invalid{border:2px solid rgb(190,20,20)}.qa-card{border-top:3px solid rgb(8,108,117)}</style><section class="card qa-card"><label>Campo con error<input class="qa-invalid" aria-invalid="true"></label><button id="cancelarVenta" class="danger" style="background:rgb(190,20,20)">Anular venta</button><button aria-label="Cerrar caja" style="background:rgb(11,31,58)">Cerrar caja</button><button data-kora-finish-role="dismiss">Cancelar</button><table><thead><tr><th><button style="color:white;background:transparent">Ordenar</button></th></tr></thead><tbody><tr><td>Valor confirmado</td></tr></tbody></table></section><section class="panel"><div id="business"><table><thead><tr>${['Negocio / tienda','Ingresos','Costo de venta','Margen','Gastos','Bajas','Utilidad neta','Estado'].map(x=>'<th>'+x+'</th>').join('')}</tr></thead><tbody><tr>${['Tienda de prueba','$ 105.500.275','$ 75.613.901','$ 29.886.374','$ 31.891.631','$ 700.887','-$ 2.706.144','Parcial · 2 datos pendientes'].map((x,i)=>'<td data-label="'+['Tienda','Ingresos','Costo','Margen','Gastos','Bajas','Utilidad','Estado'][i]+'">'+x+'</td>').join('')}</tr></tbody></table></div></section><section class="remision-heading"><div style="display:flex;align-items:center;gap:16px"><img src="/creditek/shared/branding/creditek-logo.png" alt="Creditek" style="height:52px;object-fit:contain"><div><h2>REMISIÓN #123</h2><p>Documento de traslado de mercancía</p></div></div><div><p>Remisión recibida · estado de prueba</p><p>Fecha de prueba</p><p id="doc-trace-id">TRAZA-FICTICIA-SIN-DATOS-DE-PRODUCCION-12345678</p></div></section></main></div>
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
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
      const originalBorder=await page.evaluate(()=>{document.body.removeAttribute('data-kora-finish');const s=getComputedStyle(document.querySelector('.qa-card'));const border=[s.borderTopColor,s.borderTopWidth];document.body.setAttribute('data-kora-finish','2026.11');return border;});
      assert.deepEqual(await page.locator('.qa-card').evaluate(e=>[getComputedStyle(e).borderTopColor,getComputedStyle(e).borderTopWidth]),originalBorder);
      const linkColor=await page.locator('.kora-nav-link').first().evaluate(e=>getComputedStyle(e).color);
      assert.notEqual(linkColor,'rgb(255, 255, 255)','los enlaces se distinguen del fondo blanco');
      assert.deepEqual(await page.locator('.qa-invalid').evaluate(e=>[getComputedStyle(e).borderTopColor,e.getAttribute('aria-invalid')]),['rgb(190, 20, 20)','true']);
      assert.equal(await page.locator('#cancelarVenta').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(190, 20, 20)');
      assert.equal(await page.locator('[aria-label="Cerrar caja"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(11, 31, 58)');
      assert.equal(await page.locator('[data-kora-finish-role="dismiss"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
      assert.equal(await page.locator('th').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(11, 30, 61)');
      const drawer = page.locator('.kora-sidebar');
      const overlay = page.locator('.kora-drawer-overlay');
      const toggle = page.locator('.kora-navigation-toggle');
      for (const width of [320, 390, 430, 768, 1023]) {
        await page.setViewportSize({ width, height: 844 });
        await toggle.tap();
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
        if(width<=700)assert.equal(await page.locator('.remision-heading').evaluate(e=>{const [a,b]=[...e.children].map(x=>x.getBoundingClientRect());return a.bottom<=b.top;}),true,'logo/título y estado sin solaparse');

        if (process.env.KORA_SCREENSHOT_DIR && width <= 390) {
          await fs.mkdir(process.env.KORA_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.KORA_SCREENSHOT_DIR, `menu-movil-${mode}-${width}.png`) });
        }
        await drawer.getByRole('button', { name: 'Cerrar navegación', exact: true }).tap();
        await overlay.waitFor({state:"hidden"});
        assert.equal(await overlay.isVisible(), false);
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
        await toggle.tap();
        await page.keyboard.press('Escape');
        await overlay.waitFor({state:"hidden"});
        assert.equal(await overlay.isVisible(), false);
        await toggle.tap();
        await page.waitForFunction(()=>document.querySelector('.kora-sidebar').getBoundingClientRect().left>=-1);
        await page.touchscreen.tap(width - 24,300);
        await overlay.waitFor({state:"hidden"});
        assert.equal(await overlay.isVisible(), false);
      }
      await toggle.tap();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.querySelector('.kora-drawer-overlay').hidden);
      assert.deepEqual(await page.locator('#business td:not(:first-child):not(:last-child)').evaluateAll(es=>es.map(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length;})),[1,1,1,1,1,1],'importes completos en una sola línea');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);

      assert.equal(await drawer.getAttribute('role'), null);
      assert.equal(await page.locator('.kora-shell-root').getAttribute('data-sidebar-collapsed'), String(mode === 'auto'));
      await toggle.tap();
      assert.equal(await page.locator('.kora-shell-root').getAttribute('data-sidebar-collapsed'), String(mode !== 'auto'));
      for(const width of [1024,1128,1280]) {
        await page.setViewportSize({width,height:900});
        await page.evaluate(()=>{document.querySelector('.kora-shell-root').setAttribute('data-sidebar-collapsed','false');document.getAnimations().forEach(a=>a.finish());});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'sin desbordamiento en escritorio angosto '+width);
        assert.deepEqual(await page.locator('#business td:not(:first-child):not(:last-child)').evaluateAll(es=>es.map(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length;})),[1,1,1,1,1,1],'importes completos '+width);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await toggle.tap();
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
