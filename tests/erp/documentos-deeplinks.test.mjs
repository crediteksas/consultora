import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ID = '00000000-0000-0000-0000-000000000011';
const modules = [
  { page: 'traslados', cache: 'trasladosCache', next: 'cargarTraslados', open: 'abrirModalVerTraslado' },
  { page: 'remisiones', cache: 'remisionesCache', next: 'cargarRemisiones', open: 'abrirModalRemision' },
  { page: 'ventas', cache: 'ventasCache', next: 'cargarVentas', open: 'abrirDetalleVenta' },
  { page: 'gastos', cache: 'gastosCache', next: 'cargarGastos', open: 'abrirCorreccionGasto' },
];

function harness(module, { search = `?documento=${ID}`, data = { id: ID }, error = null, central = true } = {}) {
  const html = readFileSync(`creditek/erp/${module.page}.html`, 'utf8');
  const start = html.indexOf('let documentoEnlaceProcesado = false;');
  const end = html.indexOf(`async function ${module.next}()`, start);
  assert.ok(start >= 0 && end > start);
  const body = html.slice(start, end);
  const queries = [], opened = [], messages = [], elements = new Map();
  const query = {
    select(value) { queries.push(['select', value]); return query; },
    eq(key, value) { queries.push(['eq', key, value]); return query; },
    async maybeSingle() { queries.push(['maybeSingle']); return { data, error }; },
  };
  const context = vm.createContext({
    URLSearchParams, location: { search },
    sb: { from(table) { queries.push(['from', table]); return query; } },
    [module.cache]: [],
    currentPerfil: { rol: central ? 'gerencia' : 'admin_tienda', tienda_codigo: 'CK-01' },
    esCentral: () => central,
    puedeRegistrarGasto: () => true,
    mostrarBanner: message => messages.push(message),
    renderTablaTraslados() {}, renderTablaRemisiones() {}, renderTablaVentas() {}, renderTablaGastos() {}, renderColaAprobacion() {},
    abrirModalVerTraslado: (...args) => opened.push(args),
    abrirModalRemision: (...args) => opened.push(args),
    abrirDetalleVenta: (...args) => opened.push(args),
    abrirCorreccionGasto: (...args) => opened.push(args),
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { value: 'filtro anterior' });
        return elements.get(id);
      },
      querySelector() { return { scrollIntoView() {}, focus() {} }; },
    },
  });
  vm.runInContext(body, context);
  return { html, body, context, queries, opened, messages, elements, run: () => context.abrirDocumentoSolicitado() };
}

for (const module of modules) {
  test(`${module.page}: enlace exacto fuera de filtros o página, sin RPC ni escritura`, async () => {
    const h = harness(module);
    await h.run();
    assert.deepEqual(h.queries.filter(x => x[0] === 'from'), [['from', module.page]]);
    assert.deepEqual(h.queries.filter(x => x[0] === 'eq'), [['eq', 'id', ID]]);
    assert.ok(h.queries.some(x => x[0] === 'maybeSingle'));
    assert.equal(h.context[module.cache][0].id, ID);
    assert.ok([...h.elements.values()].every(e => e.value === ''));
    assert.doesNotMatch(h.body, /\.rpc\(|\.(update|delete|insert|upsert)\(|confirm\(|anularTraslado\(|aplicarAjusteVenta\(/);
    if (module.page !== 'gastos') assert.equal(h.opened.length, 1);
    else assert.equal(h.opened.length, 0);
    const count = h.queries.length;
    await h.run();
    assert.equal(h.queries.length, count, 'una recarga interna no reabre ni repite la selección');
  });

  test(`${module.page}: RLS/sin acceso/error no abre documentos ni editores`, async () => {
    for (const error of [null, { message: 'RLS/consulta no disponible' }]) {
      const h = harness(module, { data: null, error });
      await h.run();
      assert.equal(h.opened.length, 0);
      assert.equal(h.context[module.cache].length, 0);
      assert.match(h.messages[0], /no existir o no estar disponible para tu perfil/);
    }
  });

  test(`${module.page}: ID inválido o ausente no genera consultas`, async () => {
    for (const search of ['', '?documento=11', '?documento=%22%3E%3Cscript%3E', '?documento=x&accion=anular']) {
      const h = harness(module, { search });
      await h.run();
      assert.equal(h.queries.length, 0);
      assert.equal(h.opened.length, 0);
    }
  });

  test(`${module.page}: JavaScript válido e inicialización conectada`, () => {
    const { html } = harness(module);
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      if (match[1].trim()) new vm.Script(match[1]);
    }
    assert.match(html, new RegExp(`await ${module.next}\\(\\);\\s+await abrirDocumentoSolicitado\\(\\);`));
  });
}

test('remisiones: enlace de tienda solo lectura, incluso borrador', async () => {
  const h = harness(modules[1], { central: false, data: { id: ID, estado: 'borrador' } });
  await h.run();
  assert.equal(h.opened[0][1], 'lectura');
  assert.match(h.html, /const soloLectura = modo === 'lectura' \|\|/);
  assert.match(h.html, /const correccionRecepcion = modo !== 'lectura'/);
});

test('gastos: devuelve al editor existente solo un gasto devuelto y permitido', async () => {
  const h = harness(modules[3], { central: false, data: { id: ID, correccion_pendiente: true, tienda_codigo: 'CK-01' } });
  await h.run();
  assert.deepEqual(h.opened, [[ID]]);
  const otherStore = harness(modules[3], { central: false, data: { id: ID, correccion_pendiente: true, tienda_codigo: 'CK-02' } });
  await otherStore.run();
  assert.equal(otherStore.opened.length, 0);
});
