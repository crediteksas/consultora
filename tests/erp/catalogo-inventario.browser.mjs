// Prueba de las pantallas reales con datos sintéticos; no usa sesiones de producción.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const pantalla of ['catalogo', 'inventario']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    const html = await readFile(`creditek/erp/${pantalla}.html`, 'utf8');
    const main = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('const KORA_ENV'));
    await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
    await page.addScriptTag({ path: 'creditek/erp/inventario-domain.js' });
    await page.addScriptTag({ path: 'creditek/erp/producto-foto.js' });
    await page.evaluate(() => {
      window.__KORA_ENV__ = {};
      window.KoraConteosUI = { init: () => ({ abrir() {} }) };
      window.XLSX = {};
      window.queries = [];
      const products = [
        { id: 1, codigo: 'V10', nombre: 'Vidrio 10', tienda_codigo: 'A', costo_min: 100, costo_max: 100 },
        { id: 2, codigo: 'V2', nombre: 'Vidrio 2', tienda_codigo: 'A', costo_min: 100, costo_max: 100 },
        { id: 3, codigo: 'X', nombre: 'AJENO', tienda_codigo: 'B', costo_min: 999, costo_max: 999 },
      ].map(p => ({ ...p, tipo: 'cantidad', categoria: 'accesorio', activo: true }));
      window.supabase = { createClient: () => ({
        auth: { getSession: async () => ({ data: { session: null } }) },
        from(table) {
          const entry = { table, filters: [] }; window.queries.push(entry);
          let rows = table === 'catalogo_tienda_lectura' || table === 'productos' ? products
            : table === 'stock_cantidad_lectura' ? products.map(p => ({ producto_id: p.id, tienda_codigo: p.tienda_codigo, productos: p, tiendas: { nombre: p.tienda_codigo }, precio_tienda: 100, cantidad: 2 })) : [];
          // Deliberadamente ignora el filtro remoto para comprobar la segunda defensa del cliente.
          const q = { select() { return q; }, eq(...v) { entry.filters.push(v); return q; }, order() { return q; },
            range() { return Promise.resolve({ data: rows, error: null }); },
            then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); } };
          return q;
        },
      }) };
    });
    await page.addScriptTag({ content: main });
    await page.evaluate(() => { currentPerfil = { rol: 'admin_tienda', tienda_codigo: 'A' }; document.getElementById('loginScreen').style.display = 'none'; document.getElementById('app').classList.add('show'); initPagina(); });
    const tbody = pantalla === 'catalogo' ? '#tbodyProductos' : '#tbodyAccesorios';
    if (pantalla === 'inventario') await page.evaluate(() => cambiarTab('accesorios'));
    await page.waitForFunction(selector => document.querySelector(selector).children.length === 2, tbody);
    let text = await page.locator(tbody).innerText();
    assert(!text.includes('AJENO'));
    assert(text.indexOf('Vidrio 2') < text.indexOf('Vidrio 10'));
    const search = pantalla === 'catalogo' ? '#filtroBusqueda' : '#filtroBusquedaAcc';
    await page.locator(search).fill('V10');
    assert.equal(await page.locator(`${tbody} tr`).count(), 1);
    assert((await page.locator(tbody).innerText()).includes('Vidrio 10'));
    assert(await page.evaluate(() => !queries.some(q => q.table === 'productos')));
    assert(await page.evaluate(() => queries.filter(q => ['catalogo_tienda_lectura','stock_cantidad_lectura','unidades_lectura'].includes(q.table)).every(q => q.filters.some(([key, value]) => key.startsWith('tienda_') && value === 'A'))));
    await page.evaluate(async name => { currentPerfil.tienda_codigo = null; queries.length = 0; if (name === 'catalogo') await cargarProductos(); else await cargarTodo(); }, pantalla);
    assert.equal(await page.locator(`${tbody} tr`).count(), 0);
    assert.equal(await page.evaluate(() => queries.length), 0);
    assert.deepEqual(errors, []);
    console.log(`${pantalla}: aislamiento, consulta por tienda, búsqueda, orden y cuenta sin tienda OK`);
    await page.close();
  }
} finally { await browser.close(); }
