// Local component QA: real Tesorería HTML, KORA styles and fonts; no user session.
// Run: node --test tests/e2e/cobros-plataformas-local.test.mjs
// Requires installed Google Chrome and access to KORA's public font/icon assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pagePath = '/creditek/erp/aliados-tesoreria.html';
const scriptPaths = new Set([
  '/design-system/components/kora-product.js',
  '/creditek/erp/cobros-plataformas.js',
]);
const assetTypes = {
  '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function localServer() {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(root, `.${pathname}`);
      const extension = path.extname(file);
      const html = pathname === pagePath;
      const script = scriptPaths.has(pathname);
      if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || (!html && !script && !assetTypes[extension])) {
        response.writeHead(404).end();
        return;
      }
      let body = await readFile(file);
      // Omit auth/bootstrap/payment scripts. Only the component and KORA enhancement
      // script are restored below, and every data call uses the explicit RPC fixture.
      if (html) body = body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      response.setHeader('Content-Type', html ? 'text/html; charset=utf-8' : script ? 'text/javascript; charset=utf-8' : assetTypes[extension]);
      response.end(body);
    } catch (_) {
      response.writeHead(404).end();
    }
  });
}

test('cobros se adapta a 390/768/1128/1440 con HTML, CSS y tipografía reales de KORA', { timeout: 60000 }, async t => {
  const server = localServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    page.setDefaultTimeout(10000);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      const publicAsset = route.request().method() === 'GET' && (
        ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
        || (url.hostname === 'unpkg.com' && url.pathname === '/lucide@1.27.0/dist/umd/lucide.min.js')
      );
      return url.origin === origin || publicAsset ? route.continue() : route.abort();
    });
    await page.goto(`${origin}${pagePath}`, { waitUntil: 'networkidle' });
    await page.addScriptTag({ url: `${origin}/design-system/components/kora-product.js` });
    await page.addScriptTag({ url: `${origin}/creditek/erp/cobros-plataformas.js` });
    await page.evaluate(async () => {
      document.querySelector('#pageContent').classList.remove('hidden');
      document.querySelector('#cobrosContent').classList.remove('hidden');
      document.querySelector('#showCobros').classList.remove('hidden');
      document.querySelector('#showCobros').classList.add('active');
      document.querySelector('#outgoingContent').classList.add('hidden');
      document.querySelector('#paymentReport').classList.add('hidden');
      const raw = {
        expected: [
          { id: 'e1', plataforma: 'payjoy', corte: '2026-08-31', fecha_esperada: '2026-09-01', importe: 12500000, concepto: 'Consignación correspondiente al corte del 31 de agosto de 2026', soporte: 'https://example.com/soporte.pdf', estado: 'activo', fuente_tipo: 'neto_confirmado' },
          { id: 'e2', plataforma: 'payjoy', corte: '2026-09-02', fecha_esperada: '2026-09-07', importe: 7500000, concepto: 'Consignación correspondiente al corte del 2 de septiembre de 2026', soporte: 'Liquidación bancaria número 4567', estado: 'activo', fuente_tipo: 'manual' },
        ],
        deposits: [{ id: 'd1', plataforma: 'payjoy', fecha: '2026-09-02', importe: 15000000, banco: 'Bancolombia', cuenta_ultimos4: '1234', referencia: 'Consignación septiembre 2026 de plataforma PayJoy', soporte: 'Comprobante número 1234', estado: 'activo' }],
        allocations: [{ id: 'a1', expected_id: 'e1', deposit_id: 'd1', importe: 5000000, estado: 'activo' }],
        events: [{ id: 'event1', tipo: 'allocation_creada', registro_id: 'a1', actor_nombre: 'Gerencia', created_at: '2026-09-04T12:00:00Z', detalle: { importe: 5000000, expected_id: 'e1', deposit_id: 'd1' } }],
        candidates: [{ liquidation_id: 'l1', plataforma: 'payjoy', corte: '2026-09-03', base_estimada: 55000000, operaciones: 80, concepto: 'Liquidación del corte 3 de septiembre', estado_liquidacion: 'aprobada' }],
      };
      window.cobrosQaCalls = [];
      const sb = { rpc: async (name, args) => {
        window.cobrosQaCalls.push({ name, args });
        if (name !== 'cobros_plataformas_resumen') throw new Error(`RPC inesperada en QA visual: ${name}`);
        return { data: raw, error: null };
      } };
      await window.CreditekCobrosPlataformas.create({ sb, canEdit: true, canVoid: true }).mount(document.querySelector('#cobrosContent'));
      await document.fonts.ready;
    });
    await page.locator('[data-cobros-filter]').selectOption('payjoy');
    assert.equal(await page.locator('[data-cobros-form="candidate"] [name="importe"]').inputValue(), '', 'el neto confirmado inicia vacío');
    assert.match(await page.locator('.cobros-plataformas > .cobros-metrics .cobros-metric').first().textContent(), /20[.]000[.]000/, 'la base estimada no se agrega al esperado');
    assert.equal(await page.getByText('Neto confirmado', { exact: true }).count(), 1);

    const screenshots = await mkdtemp(path.join(tmpdir(), 'cobros-plataformas-kora-'));
    t.diagnostic(`Capturas de QA local: ${screenshots}`);
    for (const width of [390, 768, 1128, 1440]) {
      await t.test(`${width}px: tarjetas y formularios completos sin overflow`, async () => {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => scrollTo(0, 0));
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          font: getComputedStyle(document.body).fontFamily,
          interLoaded: [...document.fonts].some(font => font.family.replaceAll('"', '') === 'Inter' && font.status === 'loaded'),
          overflow: [...document.querySelectorAll('.cobros-metric, .cobros-record-fields dd, .cobros-field')]
            .filter(node => node.scrollWidth > node.clientWidth + 1)
            .map(node => node.textContent.trim()),
        }));
        assert(layout.scrollWidth <= width + 1, `ancho del documento ${layout.scrollWidth} supera ${width}`);
        assert.deepEqual(layout.overflow, [], 'los importes y etiquetas caben completos');
        assert.match(layout.font, /Inter/, 'se usa la familia tipográfica KORA');
        assert.equal(layout.interLoaded, true, 'la fuente real Inter debe cargar; verifica acceso a fonts.googleapis.com/fonts.gstatic.com');
        await page.screenshot({ path: path.join(screenshots, `cobros-${width}.png`), fullPage: true });

        await page.locator('.cobros-entry, .cobros-history, .cobros-void').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
        const expanded = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          overflow: [...document.querySelectorAll('.cobros-field')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.trim()),
        }));
        assert(expanded.scrollWidth <= width + 1, 'abrir los formularios no ensancha la página');
        assert.deepEqual(expanded.overflow, [], 'las etiquetas de formularios se muestran completas');
        assert.equal(await page.locator('[data-cobros-form="allocate"]').isVisible(), true);
        await page.screenshot({ path: path.join(screenshots, `cobros-${width}-formularios.png`), fullPage: true });
        await page.locator('.cobros-entry, .cobros-history, .cobros-void').evaluateAll(nodes => nodes.forEach(node => { node.open = false; }));
      });
    }
    assert.deepEqual(errors, [], 'el componente no produce errores de JavaScript');
    assert.deepEqual(await page.evaluate(() => window.cobrosQaCalls.map(call => call.name)), ['cobros_plataformas_resumen'], 'la prueba solo consulta el fixture; no escribe datos');
    assert.equal(await page.evaluate(() => typeof window.supabase), 'undefined', 'no se inicializa un SDK ni una sesión adicional');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
