import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

test('Retail: propone para todas y prepara cartas individuales solo de metas guardadas', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const source = fs.readFileSync('creditek/erp/presupuestos.html', 'utf8');
    const inline = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
    const html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    await page.route('**/*', route => route.request().resourceType() === 'document'
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto('http://kora-local.test/creditek/erp/presupuestos.html');
    await page.evaluate(() => {
      const month = '2026-10';
      window.calls = [];
      window.__KORA_ENV__ = {};
      window.CreditekTiendasCanonicas = { cargar: async () => [
        { codigo: 'CK-01', nombre: 'Móvil Shopping' },
        { codigo: 'CK-02', nombre: 'Celfiao' },
      ] };
      const saved = Array.from({ length: 31 }, (_, index) =>
        ['CK-01', 'CK-02'].map(code => ({
          tienda_codigo: code, fecha: month + '-' + String(index + 1).padStart(2, '0'),
          meta_venta_total: 1000, meta_creditos: 1, meta_uds_cel: 2,
          meta_uds_acc: 3, meta_utilidad: 100,
        }))).flat();
      window.supabase = { createClient: () => ({
        auth: { getSession: async () => ({ data: { session: { user: { id: 'gerencia-test' } } } }) },
        from(table) {
          const query = {
            select() { return this; }, eq() { return this; }, gte() { return this; },
            lt() { return this; }, range(start, end) {
              return Promise.resolve({ data: saved.slice(start, end + 1), error: null });
            },
            maybeSingle: async () => ({ data: { id: 'gerencia-test', nombre: 'Gerencia', rol: 'gerencia', activo: true }, error: null }),
            then(resolve) {
              return Promise.resolve({ data: table === 'perfiles'
                ? [{ nombre: 'Ana Administradora', tienda_codigo: 'CK-01' },
                  { nombre: 'Beatriz Administradora', tienda_codigo: 'CK-02' }] : saved, error: null }).then(resolve);
            },
          };
          return query;
        },
        async rpc(name, params) {
          window.calls.push({ name, tienda: params.p_tienda });
          if (name === 'guardar_presupuesto_operativo_general')
            return { data: null, error: params.p_tienda === 'CK-02' ? { message: 'Fallo simulado' } : null };
          if (name !== 'proponer_presupuesto_operativo') throw Error('RPC inesperada.');
          return { data: Array.from({ length: 31 }, (_, i) => ({
            fecha: month + '-' + String(i + 1).padStart(2, '0'),
            meta_propuesta: 2, fuente: 'histórico local',
          })), error: null };
        },
      }) };
    });
    await page.addScriptTag({ path: 'creditek/erp/presupuestos-negocios.js' });
    await page.addScriptTag({ path: 'creditek/erp/presupuestos-b2b.js' });
    await page.addScriptTag({ path: 'creditek/erp/presupuestos-retail-cartas.js' });
    await page.addScriptTag({ content: inline });
    await page.getByRole('heading', { name: 'Presupuesto de Retail' }).waitFor();
    await page.locator('#genTienda').selectOption('__todas__');
    await page.locator('#genMes').fill('2026-10');
    await page.getByRole('button', { name: 'Calcular propuesta' }).click();
    await page.getByText(/Propuesta para 2 tienda\(s\), sin guardar/).waitFor();
    assert.deepEqual((await page.evaluate(() => window.calls)).map(x => x.tienda), ['CK-01', 'CK-02']);
    await page.getByRole('button', { name: 'Generar presupuestos' }).click();
    await page.locator('.carta-preview').first().waitFor();
    assert.equal(await page.locator('.carta-preview').count(), 2);
    assert.match(await page.locator('.carta-preview').first().innerText(), /Ana Administradora/);
    assert.match(await page.locator('.carta-preview').first().innerText(), /31 de 31 días registrados/);
    assert.match(await page.locator('.carta-preview').first().innerText(), /Créditos\s+31/);
    assert.doesNotMatch(await page.locator('.carta-preview').first().innerText(), /Utilidad/);
    await page.locator('#cartasPresupuesto').screenshot({ path: '/tmp/kora-presupuesto-cartas.png' });
    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-abrir-carta="CK-01"]').click();
    const popup = await popupPromise;
    await popup.getByRole('heading', { name: 'Móvil Shopping' }).waitFor();
    assert.match(await popup.locator('body').innerText(), /Detalle por día/);
    assert.match(await popup.locator('body').innerText(), /Ana Administradora/);
    assert.doesNotMatch(await popup.locator('body').innerText(), /Utilidad/);
    await popup.close();
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Aprobar los 4 indicadores' }).click();
    await page.getByText(/Se aprobaron 1 tienda\(s\).*Fallo simulado/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Aprobar los 4 indicadores' }).isEnabled(), true);
  } finally {
    await browser.close();
  }
});
