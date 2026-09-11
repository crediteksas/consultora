import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const domain = require('../../creditek/erp/aliados-tesoreria-domain.js');
const source = readFileSync('creditek/erp/aliados-tesoreria-app.js', 'utf8');
const html = readFileSync('creditek/erp/aliados-tesoreria.html', 'utf8');
const row = (id, store_code, cutoff_date, compensation_value = 100) => ({
  id, store_code, cutoff_date, compensation_value, account_balance_after: -40,
  platform: 'payjoy', imei: `IMEI-${id}`, created_at: cutoff_date ? `${cutoff_date}T20:00:00Z` : null,
});
const rows = [row('uno', 'A', '2026-09-02', 100), row('dos', 'B', '2026-09-03', 200), row('tres', 'A', '2026-09-04', 300)];

test('fecha del registro en Bogotá no se confunde con corte ni con UTC', () => {
  const inputs = [{ ...rows[0], created_at: '2026-09-12T04:59:00Z' }, { ...rows[1], created_at: '2026-09-12T05:00:00Z' }];
  assert.deepEqual(domain.filtrarMovimientosTiendas(inputs, { desde: '2026-09-11', hasta: '2026-09-11' }).rows, [inputs[0]]);
  assert.equal(domain.filtrarMovimientosTiendas(inputs, { plataforma: 'payjoy', tienda: 'A', imei: 'uno', valor: '100' }).rows.length, 1);
  assert.equal(domain.filtrarMovimientosTiendas(inputs, { valor: '0' }).rows.length, 0);
  assert.equal(domain.filtrarMovimientosTiendas(inputs, { desde: '2026-09-12', hasta: '2026-09-11' }).rangoInvalido, true);
});

test('abre todas las compensaciones y permite consultar hoy sin escribir', async () => {
  const ui = await boot([{ ...rows[0], created_at: new Date().toISOString() }, rows[1]], { keepToday: true });
  assert.equal(ui.node('#compensationCount').textContent, 2);
  assert.equal(ui.node('#compensationFrom').value, '');
  await ui.node('#showStoreMovements').onclick();
  assert.equal(ui.node('#storeMovementsContent').classList.contains('hidden'), false);
  assert.equal(ui.node('#paymentSections').classList.contains('hidden'), true);
  ui.node('#clearCompensationFilters').onclick();
  assert.equal(ui.node('#compensationCount').textContent, 2);
  ui.change('compensationImei', 'dos');
  assert.equal(ui.node('#compensationCount').textContent, 1);
  assert.deepEqual(ui.writes, []);
});

test('pagos abiertos y compensaciones permanecen visibles aunque existan filtros', async () => {
  const ui=await boot(rows);
  ui.change('platform','krediya');
  assert.match(ui.node('#persistentPending').innerHTML,/Pendientes siempre visibles/);
  assert.match(ui.node('#persistentPending').innerHTML,/3 ·/);
  assert.match(source,/treasuryView === "history" \? filtered\(source\) : source/);
});

test('IMEI en cartera usa consulta mínima por referencia y tienda sin recalcular', () => {
  const cc = readFileSync('creditek/erp/cuenta-corriente.html', 'utf8');
  const sql = readFileSync('supabase/migrations/20260911145851_cuenta_corriente_imei_compensacion.sql', 'utf8');
  assert.match(cc, /sb.rpc\('cuenta_corriente_imei_compensaciones'/);
  assert.match(cc, /escapeHtml\(imeisCompensaciones.get/);
  assert.match(sql, /r.store_code = c.tienda_codigo/);
  assert.match(sql, /c.tienda_codigo = public.tienda_actual\(\)/);
  assert.match(sql, /auth.uid\(\) is not null/);
  assert.doesNotMatch(sql, /\b(update|insert|delete)\b/i);
});

test('tienda y rango de corte se combinan con límites inclusivos sin cambiar importes', () => {
  const original = structuredClone(rows);
  assert.deepEqual(domain.filtrarCompensaciones(rows, { tienda: 'A', desde: '2026-09-02', hasta: '2026-09-04' }).rows, [rows[0], rows[2]]);
  assert.deepEqual(domain.filtrarCompensaciones(rows, { desde: '2026-09-03', hasta: '2026-09-03' }).rows, [rows[1]]);
  assert.deepEqual(rows, original);
});

test('rango abierto, vacío, invertido y cortes ausentes tienen resultado explícito', () => {
  assert.equal(domain.filtrarCompensaciones(rows).rows.length, 3);
  assert.equal(domain.filtrarCompensaciones(rows, { desde: '2026-09-03' }).rows.length, 2);
  assert.equal(domain.filtrarCompensaciones(rows, { hasta: '2026-09-02' }).rows.length, 1);
  assert.deepEqual(domain.filtrarCompensaciones(rows, { desde: '2026-09-04', hasta: '2026-09-02' }), { rows: [], rangoInvalido: true });
  assert.equal(domain.filtrarCompensaciones([row('sin-fecha', 'A', null)], { hasta: '2026-09-05' }).rows.length, 0);
  assert.equal(domain.filtrarCompensaciones(rows, { tienda: 'inexistente' }).rows.length, 0);
});

test('selector usa códigos únicos y nombres de tienda ordenados, con respaldo para históricos', () => {
  assert.deepEqual(domain.tiendasCompensaciones(rows, [{ codigo: 'A', nombre: 'Sonivox' }, { codigo: 'B', nombre: 'Celfiao Tolú' }]), [
    { codigo: 'B', nombre: 'Celfiao Tolú' }, { codigo: 'A', nombre: 'Sonivox' },
  ]);
  assert.deepEqual(domain.tiendasCompensaciones([row('x', 'ANTIGUA', null)]), [{ codigo: 'ANTIGUA', nombre: 'ANTIGUA' }]);
});

async function boot(records = rows, options = {}) {
  const nodes = new Map(), queries = [], writes = [], listeners = new Map();
  function node(selector) {
    if (options.withoutLegacyForm && selector.startsWith('#movementForm')) return null;
    if (nodes.has(selector)) return nodes.get(selector);
    const classes = new Set(), attrs = {}, handlers = {};
    const n = {
      value: '', textContent: '', disabled: false, handlers, attrs, children: [],
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle(x, flag) { flag ? classes.add(x) : classes.delete(x); } },
      setAttribute: (k, v) => { attrs[k] = v; }, addEventListener: (k, fn) => { handlers[k] = fn; },
      set innerHTML(value) {
        this.markup = value;
        this.children = [...value.matchAll(/data-compensation-select="([^"]+)"/g)].map(match => ({ dataset: { compensationSelect: match[1] }, checked: false }));
      }, get innerHTML() { return this.markup || ''; },
    };
    nodes.set(selector, n);
    return n;
  }
  const sb = {
    from(table) {
      const q = { table };
      const builder = {
        select(...args) { q.select = args; return this; },
        order() { return this; }, eq() { return this; }, gt() { return this; },
        range(from, to) { q.range = [from, to]; return this; },
        then(resolve, reject) {
          queries.push(q);
          const list = table === 'cuenta_corriente' ? (options.ledger || []) : table === 'retail_b2b_compensations' ? records : table === 'origenes'
            ? [{ codigo: 'A', nombre: 'Sonivox' }, { codigo: 'B', nombre: '<Tienda B>' }] : [];
          let result = { data: q.range ? list.slice(q.range[0], q.range[1] + 1) : list, error: null, count: list.length };
          if (options.pageResult && q.range) result = options.pageResult(result, q);
          if (table === 'cuenta_corriente' && options.ledgerError) result = { error: { message: 'Sin conexión' }, data: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc(...args) {
      if (args[0] === 'tiene_capacidad_aliados') return Promise.resolve({data:false,error:null});
      writes.push(args); throw new Error('No se permite escribir desde filtros');
    },
  };
  const location = { href: '' };
  const context = {
    window: { creditekSidebar: { sb, perfil: { rol: 'gerencia', activo: true } }, CreditekTesoreriaTercerizacion: domain, CreditekCobrosPlataformas: { create: () => ({}) } },
    document: { querySelector: node, querySelectorAll: selector => selector === '[data-compensation-select]' ? node('#compensations').children : [], addEventListener: (k, fn) => listeners.set(k, fn) },
    location, URLSearchParams, console: { error() {} }, Intl, Date, Set, Map, setTimeout() {},
  };
  vm.runInNewContext(source, context);
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  if (!options.keepToday && node('#compensations').innerHTML) node('#clearCompensationFilters').onclick();
  return { node, queries, writes, location, change(id, value) { node(`#${id}`).value = value; node(`#${id}`).handlers.change(); } };
}

test('interfaz filtra, suma sólo resultados y limpia sin modificar otras secciones', async () => {
  const ui = await boot();
  const metrics = ui.node('#metrics').innerHTML;
  assert.equal(ui.node('#compensationCount').textContent, 3);
  assert.match(ui.node('#compensationStore').innerHTML, /&lt;Tienda B&gt;/);
  ui.change('compensationStore', 'A');
  ui.change('compensationFrom', '2026-09-03');
  assert.equal(ui.node('#compensationCount').textContent, 1);
  assert.match(ui.node('#compensationSummary').textContent, /1 de 3 abonos.*300/);
  assert.match(ui.node('#compensations').innerHTML, /IMEI-tres/);
  assert.doesNotMatch(ui.node('#compensations').innerHTML, /IMEI-uno|IMEI-dos/);
  assert.equal(ui.node('#metrics').innerHTML, metrics, 'no afecta saldos generales');
  ui.node('#clearCompensationFilters').onclick();
  assert.equal(ui.node('#compensationCount').textContent, 3);
  assert.equal(ui.node('#compensationFrom').value, '');
  assert.deepEqual(ui.writes, []);
});

test('saldo visible es cartera actual completa, no instantánea histórica ni suma del filtro', async () => {
  const ledger = [{ id: 1, tienda_codigo: 'A', tipo: 'abono', monto: 824340 },
    { id: 2, tienda_codigo: 'A', tipo: 'cargo', monto: 26177371 },
    { id: 3, tienda_codigo: 'A', tipo: 'abono', monto: 2275580 }];
  const before = structuredClone(rows);
  const ui = await boot(rows, { ledger });
  assert.match(ui.node('#compensations').innerHTML, /Saldo actual de tienda/);
  assert.match(ui.node('#compensations').innerHTML, /23\.077\.451/);
  assert.doesNotMatch(ui.node('#compensations').innerHTML, /-\$?\s*40/);
  ui.change('compensationStore', 'A');
  ui.change('compensationFrom', '2026-09-04');
  assert.match(ui.node('#compensations').innerHTML, /23\.077\.451/);
  assert.deepEqual(rows, before);
  assert.deepEqual(ui.writes, []);
});

test('cartera pagina completa y falla explícitamente sin mostrar saldo histórico o cero', async () => {
  const ledger = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, tienda_codigo: 'A', tipo: 'cargo', monto: 1 }));
  const ui = await boot(rows, { ledger });
  assert.match(ui.node('#compensations').innerHTML, /\$\s*501/);
  assert.equal(ui.queries.filter(q => q.table === 'cuenta_corriente').length, 2);
  const failed = await boot(rows, { ledgerError: true });
  assert.match(failed.node('#compensations').innerHTML, /Saldo no disponible/);
  const partial = await boot(rows, { ledger, pageResult: (r, q) => q.table === 'cuenta_corriente' && q.range[0] > 0 ? { ...r, data: [] } : r });
  assert.match(partial.node('#compensations').innerHTML, /Saldo no disponible/);
});

test('saldo actual conserva saldos a favor reales, centavos y rechaza datos inválidos', () => {
  const result = domain.saldosActualesTiendas([{ tienda_codigo: 'A', tipo: 'cargo', monto: 0.3 },
    { tienda_codigo: 'A', tipo: 'abono', monto: 0.1 }, { tienda_codigo: 'B', tipo: 'abono', monto: 100 }]);
  assert.equal(result.get('A'), 0.2);
  assert.equal(result.get('B'), -100);
  assert.throws(() => domain.saldosActualesTiendas([{ tienda_codigo: 'A', tipo: 'cargo', monto: null }]));
});

test('un registro oculto por el filtro pierde selección y no puede abrir cartera', async () => {
  const ui = await boot();
  const checkbox = ui.node('#compensations').children[0];
  checkbox.checked = true;
  checkbox.onchange();
  assert.equal(ui.node('#openStoreLedger').disabled, false);
  ui.change('compensationStore', 'B');
  assert.equal(ui.node('#openStoreLedger').disabled, true);
  assert.equal(ui.node('#compensationSelection').textContent, 'Ninguna compensación seleccionada');
  ui.node('#openStoreLedger').onclick();
  assert.equal(ui.location.href, '');
});

test('rango inválido se explica y la consulta es independiente de los filtros de pagos', async () => {
  const ui = await boot();
  ui.change('compensationFrom', '2026-09-04');
  ui.change('compensationTo', '2026-09-02');
  assert.equal(ui.node('#compensationFrom').attrs['aria-invalid'], 'true');
  assert.equal(ui.node('#compensationFilterError').classList.contains('hidden'), false);
  assert.match(ui.node('#compensationSummary').textContent, /Corrige el rango/);
  ui.node('#clearCompensationFilters').onclick();
  ui.change('platform', 'krediya');
  assert.equal(ui.node('#compensationCount').textContent, 3);
  ui.node('#clearCompensationFilters').onclick();
  assert.equal(ui.node('#platform').value, 'krediya', 'limpiar abonos no altera otros filtros');
});

test('carga el historial completo en páginas antes de filtrar, no sólo los primeros mil', async () => {
  const many = Array.from({ length: 1201 }, (_, i) => row(`r${i}`, i === 1200 ? 'B' : 'A', '2026-09-03'));
  const ui = await boot(many);
  assert.deepEqual(ui.queries.filter(q => q.table==='retail_b2b_compensations'&&q.range).map(q => q.range), [[0, 499], [500, 999], [1000, 1499]]);
  ui.change('compensationStore', 'B');
  assert.equal(ui.node('#compensationCount').textContent, 1);
  assert.match(ui.node('#compensations').innerHTML, /IMEI-r1200/);
});

test('no presenta como completo un historial truncado o fallido', async () => {
  for (const pageResult of [
    () => ({ data: [], count: 3, error: null }),
    () => ({ data: null, count: null, error: { message: 'falló la consulta' } }),
  ]) {
    const ui = await boot(rows, { pageResult });
    assert.match(ui.node('#notice').textContent, /No fue posible cargar Tesorería/);
    assert.equal(ui.node('#compensations').innerHTML, '');
  }
});

test('filtros etiquetados y adaptables usan el diseño KORA y assets versionados', () => {
  for (const id of ['compensationStore', 'compensationFrom', 'compensationTo']) assert.match(html, new RegExp(`label for="${id}"`));
  assert.match(html, /repeat\(auto-fit, minmax\(min\(100%, 180px\), 1fr\)\)/);
  assert.match(html, /compensationSummary[^>]+role="status"/);
  assert.match(html, /aliados-tesoreria-domain.js\?v=1.6.0/);
  assert.match(html, /aliados-tesoreria-app.js\?v=2.13.0/);
});

test('la pantalla actual sin formulario antiguo de proveedores carga sin un falso aviso de error', async () => {
  assert.doesNotMatch(html, /id="movementForm"/);
  const ui = await boot(rows, { withoutLegacyForm: true });
  assert.equal(ui.node('#notice').textContent, '');
  assert.equal(ui.node('#compensationCount').textContent, 3);
});
