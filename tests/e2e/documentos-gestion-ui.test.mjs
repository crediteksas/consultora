// Synthetic browser fixture only: every request is intercepted, never production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium, expect } from '@playwright/test';

test('gestión documental: consulta, permisos, enlaces y presentación sin desbordamiento', { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'kora.test') return route.abort();
      if (/kora-environment|kora-notifications|kora-incident|kora-context-help|kora-report-export|kora-install/.test(url.pathname)) {
        return route.fulfill({ contentType: 'text/javascript', body: '' });
      }
      const file = resolve(process.cwd(), '.' + url.pathname);
      if (!file.startsWith(process.cwd() + '/')) return route.abort();
      try {
        let body = await readFile(file);
        // Real shell and CSS, with boot/auth bypassed only in this isolated mock.
        if (url.pathname.endsWith('/documentos-gestion.html')) body = body.toString().replace('data-kora-shell="1.0.0"', 'data-kora-shell="1.0.0" data-kora-shell-mode="agents"');
        await route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' })[extname(file)] || 'application/octet-stream', body });
      } catch { await route.fulfill({ status: 404, body: '' }); }
    });
    await page.addInitScript(() => {
      window.qa = { reads: [], writes: [], fail: false };
      const id = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      const docs = {
        traslados: Array.from({ length: 23 }, (_, i) => ({ id: id(i + 1), consecutivo: i + 1, estado: i === 0 ? 'anulado' : 'despachado', despachado_at: '2026-09-19T17:30:00Z', tienda_origen: 'CK-01', tienda_destino: 'CK-02', origen: { nombre: 'Tienda origen de prueba' }, destino: { nombre: 'Chinucell nombre largo de prueba para diseño adaptable' } })),
        unidades_lectura: [{ id: id(999), imei: '357113744396318' }],
        traslado_items_lectura: [{ traslado_id: id(11), unidad_id: id(999) }],
        remisiones: [{ id: id(101), consecutivo: 28, estado: 'despachada', created_at: '2026-09-19T17:30:00Z', tienda_codigo: 'CK-01', origenes: { nombre: 'Tienda de prueba' } }],
        ventas: [{ id: id(201), consecutivo: 37, fecha: '2026-09-19', tienda_codigo: 'CK-01', anulada: false, total: 1280000, clientes: { nombre_completo: '<script>no ejecutar</script>' }, origen: { nombre: 'Tienda de prueba' } }],
        gastos: [{ id: id(301), revision: 0, fecha: '2026-09-19', tienda_codigo: 'CK-01', estado: 'aprobado', concepto_id: id(401), monto: 32000, descripcion: 'Taxi', conceptos_gasto: { nombre: 'Transporte de prueba' }, origenes: { nombre: 'Tienda de prueba' } }],
        conceptos_gasto: [{ id: id(401), nombre: 'Transporte de prueba', preautorizado: true, activo: true }],
      };
      window.qa.sb = {
        from(table) {
          let rows = [...(docs[table] || [])], begin = 0, end = Infinity;
          const q = {
            select() { return q; },
            eq(field, value) { rows = rows.filter(row => String(row[field]) === String(value)); return q; },
            in(field, values) { rows = rows.filter(row => values.includes(row[field])); return q; },
            or() { return q; }, gte() { return q; }, lte() { return q; }, lt() { return q; }, order() { return q; },
            limit(count) { end = count - 1; return q; }, range(a, b) { begin = a; end = b; return q; },
            maybeSingle() { window.qa.reads.push(table); return Promise.resolve({ data: rows[0] || null, error: null }); },
            insert() { throw new Error('Escritura no permitida en prueba de consulta'); },
            update() { throw new Error('Escritura no permitida en prueba de consulta'); },
            delete() { throw new Error('Escritura no permitida en prueba de consulta'); },
            then(resolve, reject) {
              window.qa.reads.push(table);
              return Promise.resolve(window.qa.fail ? { error: { message: 'Fallo sintético de consulta' } } : { data: rows.slice(begin, end + 1), count: rows.length }).then(resolve, reject);
            },
          };
          return q;
        },
        rpc(name, args) { window.qa.writes.push({ name, args }); return Promise.resolve({ data: { id: args.p_id }, error: null }); },
      };
      if (location.search.includes('preliminary=1')) window.creditekSidebar = {
        perfil: { id: '6de0ad26-64af-4966-8cd9-d468880af627', rol: 'gerencia', activo: true },
        authorization: { allowed: true }, tiendas: [], sb: window.qa.sb,
      };
    });
    const mount = async (id = '6de0ad26-64af-4966-8cd9-d468880af627', rol = 'gerencia', preliminary = false) => {
      await page.goto(`https://kora.test/creditek/erp/documentos-gestion.html${preliminary ? '?preliminary=1' : ''}`);
      if (preliminary) assert.deepEqual(await page.evaluate(() => window.qa.reads), [], 'el contexto preliminar no inicia consultas antes de montar el shell');
      await page.evaluate(({ id, rol }) => {
        const perfil = { id, rol, activo: true, nombre: 'Usuario sintético', es_operador_aliados: false };
        const authorization = window.KoraAccessControl.authorize(perfil, 'documentos-gestion.html');
        const tiendas = [{ codigo: 'CK-01', nombre: 'Tienda de prueba' }];
        if (authorization.allowed) window.KoraNavigation.mount({
          root: document.getElementById('app'), profile: perfil, stores: tiendas,
          modules: window.KoraAccessControl.navigationFor(perfil).map(section => ({ titulo: section.title, lucide: section.icon, items: section.items })),
          activeItem: { label: 'Editar o anular documentos', group: 'ADMINISTRACIÓN' }, onLogout() {},
        });
        window.creditekSidebar = { perfil, tiendas, authorization, sb: window.qa.sb };
        document.dispatchEvent(new Event('kora-sidebar-ready'));
      }, { id, rol });
    };
    await mount();
    await expect(page.locator('.doc-row')).toHaveCount(20);
    await expect(page.locator('#docCount')).toHaveText('1–20 de 23');
    await expect(page.locator('#docTypes [aria-pressed="true"]')).toHaveCSS('background-color', 'rgb(11, 30, 61)');
    await expect(page.locator('#docTypes [aria-pressed="false"]').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('#docClear')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('#docClear')).toHaveCSS('color', 'rgb(11, 30, 61)');
    await expect(page.locator('.doc-row').first()).toContainText('Anulado');
    await expect(page.locator('.doc-row').first().getByRole('link')).toHaveAttribute('href', 'traslados.html?documento=00000000-0000-4000-8000-000000000001');
    await page.locator('#docNext').click();
    await expect(page.locator('.doc-row')).toHaveCount(3);
    await expect(page.locator('#docNext')).toBeDisabled();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.locator('.doc-page').evaluate(el => ({ page: document.documentElement.scrollWidth, viewport: innerWidth, inner: el.scrollWidth, width: el.clientWidth }));
      assert.ok(overflow.page <= overflow.viewport + 1, JSON.stringify(overflow));
      assert.ok(overflow.inner <= overflow.width + 1, JSON.stringify(overflow));
      const outside = await page.locator('.doc-page input, .doc-page select, .doc-page button, .doc-row-action').evaluateAll(elements => elements.filter(el => {
        const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
      }).map(el => el.id || el.className));
      assert.deepEqual(outside, [], `controles dentro de pantalla ${width}`);
      await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.kora-shell-content').scrollTop = 0; document.querySelector('.kora-shell-main').scrollTop = 0; });
      await page.screenshot({ path: `/tmp/kora-documentos-gestion-${width}.png`, fullPage: true, animations: 'disabled' });
    }
    await page.locator('#docQuery').fill('357113744396318');
    await page.getByRole('button', { name: 'Buscar documentos', exact: true }).click();
    await expect(page.locator('.doc-row')).toHaveCount(1);
    await expect(page.locator('.doc-row')).toContainText('Traslado #11');
    assert.ok((await page.evaluate(() => window.qa.reads)).includes('unidades_lectura'));
    await page.locator('#docTypes [data-type="remisiones"]').click();
    await expect(page.locator('.doc-row')).toContainText('Remisión #28');
    await page.locator('#docTypes [data-type="ventas"]').click();
    await expect(page.locator('.doc-row')).toContainText('<script>no ejecutar</script>');
    assert.equal(await page.locator('#docRows script').count(), 0);
    await page.locator('#docTypes [data-type="gastos"]').click();
    await expect(page.locator('.doc-row')).toContainText('Transporte de prueba');
    await page.getByRole('button', { name: /Editar Gasto.*aquí/ }).click();
    await expect(page.locator('[data-expense-form]')).toBeVisible();
    await expect(page.locator('#docExpenseAmount')).toHaveValue('32000');
    await page.locator('#docExpenseAmount').fill('30000');
    await page.locator('#docExpenseReason').fill('El soporte indica treinta mil pesos');
    await page.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(page.locator('#docNotice')).toContainText('pendiente de aprobación');
    assert.deepEqual(await page.evaluate(() => window.qa.writes.map(w => w.name)), ['editar_gasto_administrativo']);
    await page.evaluate(() => { window.qa.writes = []; });
    await page.locator('#docQuery').fill('8');
    await page.getByRole('button', { name: 'Buscar documentos', exact: true }).click();
    await expect(page.locator('#docNotice')).toContainText('Los gastos no tienen consecutivo');
    await expect(page.locator('.doc-row')).toHaveCount(0);
    await page.evaluate(() => { window.qa.fail = true; });
    await page.locator('#docClear').click();
    await expect(page.locator('#docNotice')).toContainText('Fallo sintético');
    await expect(page.locator('#docRows')).toContainText('No se modificó ningún documento');
    assert.deepEqual(await page.evaluate(() => window.qa.writes), []);
    await mount('d1782db6-bacc-4caf-af6f-ce1b8d1c0391', 'auditoria');
    await expect(page.locator('.doc-row')).toHaveCount(20);
    await expect(page.locator('#docOtherLinks')).not.toContainText('Tesorería');
    await mount('6de0ad26-64af-4966-8cd9-d468880af627', 'gerencia', true);
    await expect(page.locator('.doc-row')).toHaveCount(20);
    await expect(page.locator('#docStore option')).toHaveCount(2);
    await expect(page.locator('#docStore')).toContainText('Tienda de prueba');
    await mount('00000000-0000-4000-8000-000000000099', 'auditoria');
    await expect(page.locator('#app')).toBeHidden();
    assert.deepEqual(await page.evaluate(() => window.qa.reads), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
