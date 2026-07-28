import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const REGISTRO_URL = process.env.KORA_REGISTRO_E2E_URL
  || 'http://127.0.0.1:4173/creditek/erp/registro-interno.html';

test('el registro interno publica el formulario completo al shell', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.supabase = {
          createClient() {
            return {
              auth: { getSession: async () => ({ data: { session: { user: { id: 'qa-user' } } } }) },
              from(table) {
                const query = {
                  select() { return query; },
                  eq() { return query; },
                  maybeSingle: async () => ({ data: {
                    id: 'qa-user', nombre: 'QA', rol: 'gerencia',
                    tienda_codigo: null, activo: true
                  }, error: null }),
                  order: async () => ({ data: [
                    { codigo: 'QA-01', nombre: 'Tienda de prueba' }
                  ], error: null })
                };
                return query;
              },
              rpc: async () => ({ data: { ok: true }, error: null })
            };
          }
        };
      `,
    }));

    await page.goto(REGISTRO_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#formCliente');
    await page.waitForFunction(() => {
      const app = document.querySelector('#app');
      return app && !app.hidden && app.classList.contains('show');
    });

    for (const label of [
      'Cédula',
      'Nombre completo',
      'Celular',
      'Ciudad',
      'Dirección',
      'Tienda',
    ]) {
      assert.equal(await page.getByLabel(label, { exact: true }).isVisible(), true);
    }
    assert.equal(await page.locator('#creditekShellBootError').count(), 0);
  } finally {
    await browser.close();
  }
});
