import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const requestedPath = pathname === '/' ? '/creditek/erp/compra-proveedor.html' : pathname;
      const absolutePath = path.resolve(root, `.${requestedPath}`);
      if (!absolutePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(absolutePath);
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(absolutePath)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const supabaseStub = `
  (() => {
    const session = { user: { id: 'qa-user', email: 'qa@creditek.test' } };
    const rows = {
      proveedores: [{ id: 'proveedor-1', nombre: 'Proveedor QA', nit: '900000001' }],
      productos: [{
        id: 'producto-1', nombre: 'CELULAR QA', categoria: 'CELULAR',
        tipo: 'serializado', margen_tipo: 'porcentaje', margen_valor: 10
      }],
    };

    function query(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        order() { return chain; },
        then(resolve) { resolve({ data: rows[table] || [], error: null }); },
      };
      return chain;
    }

    window.supabase = {
      createClient() {
        return {
          auth: { getSession: async () => ({ data: { session } }) },
          rpc: async name => ({ data: name === 'rol_actual' ? 'gerencia' : null, error: null }),
          from: query,
        };
      },
    };
  })();
`;

test('el buscador de compras usa controles neutrales y resultados alineados a la izquierda', async () => {
  const server = await startStaticServer();
  const address = server.address();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css', route => route.fulfill({
      contentType: 'text/css',
      body: '.hidden{display:none!important}.w-full{width:100%}.text-left{text-align:left}',
    }));
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
      contentType: 'application/javascript',
      body: supabaseStub,
    }));
    await page.route('**/creditek/erp/sidebar.js*', route => route.fulfill({
      contentType: 'application/javascript',
      body: '',
    }));

    await page.goto(`http://127.0.0.1:${address.port}/creditek/erp/compra-proveedor.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-buscar-idx="0"]').click();

    const result = page.locator('#search-results [data-prod-id="producto-1"]');
    await result.waitFor({ state: 'visible' });
    const resultStyle = await result.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        justifyContent: style.justifyContent,
      };
    });

    const closeStyle = await page.locator('#cerrar-modal').evaluate(element => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, color: style.color };
    });

    assert.deepEqual(resultStyle, {
      backgroundColor: 'rgb(255, 255, 255)',
      color: 'rgb(11, 30, 61)',
      justifyContent: 'flex-start',
    });
    assert.notEqual(closeStyle.backgroundColor, 'rgb(11, 30, 61)');
    assert.notEqual(closeStyle.color, 'rgb(255, 255, 255)');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
