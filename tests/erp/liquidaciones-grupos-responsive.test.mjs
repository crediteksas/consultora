import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js', 'utf8');
const page = fs.readFileSync('creditek/erp/aliados-liquidaciones.html', 'utf8');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const money = (value) => `COP ${Number(value)}`;

function extract(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Debe existir ${startMarker.trim()}`);
  return app.slice(start, end);
}

function render(groups, kind = 'allies') {
  const nodes = new Map([
    ['detailHead', { innerHTML: '<tr><th>Aliado</th><th>Sede</th><th>Pago al aliado</th></tr>' }],
    ['detailBody', { innerHTML: '' }]
  ]);
  const buttons = [];
  const calls = [];
  const context = {
    $: (id) => nodes.get(id), selected: { plataforma: 'krediya', estado: 'con_novedades' },
    esc: escapeHtml, money, platformName: () => 'Krediya',
    loadTab: (tab) => calls.push(tab),
    document: { querySelectorAll(selector) {
      assert.equal(selector, '[data-group-payments]');
      if (!buttons.length) {
        for (const _ of nodes.get('detailBody').innerHTML.matchAll(/\bdata-group-payments\b/g)) buttons.push({});
      }
      return buttons;
    } }
  };
  const source = extract('  function renderGrouped(', '  async function loadTab(');
  vm.runInNewContext(`${source};this.render = renderGrouped;`, context);
  context.render(groups, kind);
  return { head: nodes.get('detailHead').innerHTML, html: nodes.get('detailBody').innerHTML, buttons, calls };
}

function metric(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<dt>${escaped}</dt><dd>([\\s\\S]*?)</dd>`));
  assert.ok(match, `Debe mostrar la métrica ${label}`);
  return match[1];
}

const group = {
  label: 'Aliado Corozal', establishments: new Set(['Aliado Corozal']),
  operations: 3, sales: 1898000, initial: 241600, issues: 2
};

test('Por aliado muestra una tarjeta por grupo sin duplicar Aliado y Sede ni inventar pagos', () => {
  const { head, html } = render([group]);
  assert.equal(head, '');
  assert.equal((html.match(/<article\b[^>]*class="[^"]*\bgrouped-summary\b/g) || []).length, 1);
  assert.match(html, /<h3\b[^>]*>Aliado Corozal<\/h3>/);
  assert.equal((html.match(/Aliado Corozal/g) || []).length, 1);
  assert.doesNotMatch(html, /<th\b|colspan="[89]"/);
  assert.match(metric(html, 'Operaciones'), />?3(?:<|$)/);
  assert.match(metric(html, 'Crédito financiado'), /COP 1898000/);
  assert.match(metric(html, 'Iniciales'), /COP 241600/);
  assert.doesNotMatch(html, /Pago al aliado<\/dt>|Estado del pago|Pendiente/);
  assert.match(html, /Krediya/);
});

test('el conteo se identifica como operaciones sin reconocer y nunca se presenta como dinero', () => {
  for (const issues of [0, 2]) {
    const { html } = render([{ ...group, issues }]);
    assert.match(html.replace(/<[^>]*>/g, ' '), new RegExp(`Operaciones sin reconocer:\\s*${issues}\\b`));
    assert.doesNotMatch(html, /COP (?:0|2)(?:<|\b)|Estado del pago|Pendiente/);
    assert.match(metric(html, 'Crédito financiado'), /COP 1898000/);
    assert.match(metric(html, 'Iniciales'), /COP 241600/);
  }
});

test('Por ejecutivo muestra su nombre, aliados y crédito sin fabricar bonos ni estado de pago', () => {
  const { head, html } = render([{
    ...group, label: 'Ejecutivo de prueba',
    establishments: new Set(['Aliado Corozal', 'Aliado Chinú'])
  }], 'executives');
  assert.equal(head, '');
  assert.match(html, /<article\b[^>]*class="[^"]*\bgrouped-summary\b/);
  assert.match(html, /<h3\b[^>]*>Ejecutivo de prueba<\/h3>/);
  assert.doesNotMatch(html, /<th\b/);
  assert.match(metric(html, 'Aliados incluidos'), />?2(?:<|$)/);
  assert.match(metric(html, 'Operaciones'), />?3(?:<|$)/);
  assert.match(metric(html, 'Crédito financiado'), /COP 1898000/);
  assert.match(html, /Aliado Corozal/);
  assert.match(html, /Aliado Chinú/);
  assert.doesNotMatch(html, /Bonos<\/dt>|Total a recibir<\/dt>|Iniciales<\/dt>|Estado del pago|Pendiente|COP 0(?:<|\b)/);
});

test('cada grupo conserva sus propios importes sin mezclar cifras entre aliados', () => {
  const { html } = render([group, { ...group, label: 'Aliado Tolú', establishments: new Set(['Aliado Tolú']), operations: 1, sales: 450000, initial: 100000, issues: 0 }]);
  const cards = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map((match) => match[1]);
  assert.equal(cards.length, 2);
  assert.match(metric(cards[0], 'Crédito financiado'), /COP 1898000/);
  assert.match(metric(cards[0], 'Iniciales'), /COP 241600/);
  assert.match(metric(cards[1], 'Crédito financiado'), /COP 450000/);
  assert.match(metric(cards[1], 'Iniciales'), /COP 100000/);
});

test('agrupar conserva crédito, iniciales y no reconocidas, y resuelve nombres de ejecutivos', async () => {
  const rows = [
    { establishment_name: 'Aliado Corozal', ejecutivo_id: 'exec-known', reconocida: true, monto_credito: 100000, inicial: 10000 },
    { establishment_name: 'Aliado Corozal', ejecutivo_id: 'exec-known', reconocida: false, monto_credito: 200000, inicial: 20000 },
    { establishment_name: 'Aliado Tolú', ejecutivo_id: null, reconocida: true, monto_credito: null, monto_base: 300000, inicial: 30000 },
    { establishment_name: 'Aliado Chinú', ejecutivo_id: 'exec-missing', reconocida: true, monto_credito: 400000, inicial: 40000 }
  ];
  const calls = [];
  const renders = [];
  const context = {
    selected: { id: 'batch' },
    sb: { from(table) {
      calls.push(table);
      assert.ok(['liquidation_operations', 'ejecutivos'].includes(table));
      const result = table === 'ejecutivos' ? [{ id: 'exec-known', nombre: 'María Ejecutiva' }] : rows;
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        then(resolve) { return Promise.resolve({ data: result, error: null }).then(resolve); }
      };
      return query;
    } },
    renderGrouped: (groups, kind) => renders.push({ groups, kind })
  };
  vm.runInNewContext(`${extract('  async function loadGrouped(', '  function renderGrouped(')};this.load = loadGrouped;`, context);
  await context.load('allies');
  await context.load('executives');
  assert.equal(renders.length, 2);
  const allied = renders[0].groups.find((item) => item.label === 'Aliado Corozal');
  assert.ok(allied);
  assert.equal(allied.operations, 2);
  assert.equal(allied.sales, 300000);
  assert.equal(allied.initial, 30000);
  assert.equal(allied.issues, 1);
  assert.deepEqual([...allied.establishments], ['Aliado Corozal']);
  const executives = renders[1].groups;
  assert.deepEqual(Array.from(executives, (item) => item.label).sort(), ['Ejecutivo no disponible', 'María Ejecutiva', 'Sin ejecutivo asignado'].sort());
  const known = executives.find((item) => item.label === 'María Ejecutiva');
  assert.equal(known.sales, 300000);
  assert.equal(known.initial, 30000);
  assert.equal(known.issues, 1);
  assert.ok(calls.includes('ejecutivos'));
});

test('nombres de aliados y ejecutivos se escapan y las listas vacías no dejan la tabla anterior', () => {
  const name = 'Aliado <img src=x onerror="alert(1)"> & \'Sede\'';
  for (const kind of ['allies', 'executives']) {
    const { html } = render([{ ...group, label: name, establishments: new Set([name]) }], kind);
    assert.ok(html.includes(escapeHtml(name)));
    assert.ok(!html.includes(name));
    assert.doesNotMatch(html, /<img\b/);
    const result = render([], kind);
    assert.equal(result.head, '');
    assert.match(result.html, /Sin registros\./);
    assert.doesNotMatch(result.html, /<article\b|<th\b|colspan="[89]"/);
  }
});

test('Ver pagos y Ver bonos y pagos llevan a la pestaña de pagos del lote', () => {
  for (const [kind, label] of [['allies', 'Ver pagos'], ['executives', 'Ver bonos y pagos']]) {
    const result = render([group], kind);
    assert.match(result.html, new RegExp(`${label}<\\/button>`));
    assert.equal(result.buttons.length, 1);
    assert.equal(typeof result.buttons[0].onclick, 'function');
    result.buttons[0].onclick();
    assert.deepEqual(result.calls, ['payments']);
  }
});

test('cambiar pestañas aplica grouped-cards solo a aliados y ejecutivos', async () => {
  const classes = new Set(['operations-cards', 'operations-table']);
  const calls = [];
  const wrapper = { classList: {
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
  } };
  const context = {
    activeTab: 'operations', esc: escapeHtml,
    $: () => ({ innerHTML: '' }),
    document: { querySelector: () => wrapper, querySelectorAll: () => [] },
    loadOperations: async () => calls.push('operations'),
    loadIncidents: async () => calls.push('incidents'),
    loadPayments: async () => calls.push('payments'),
    loadAudit: async () => calls.push('audit'),
    loadGrouped: async (kind) => calls.push(kind)
  };
  vm.runInNewContext(`${extract('  async function loadTab(', '  async function savePagamos(')};this.load = loadTab;`, context);
  for (const kind of ['allies', 'executives']) {
    await context.load(kind);
    assert.ok(classes.has('grouped-cards'));
    assert.ok(!classes.has('operations-table'));
    assert.ok(!classes.has('operations-cards'));
    assert.ok(!classes.has('incidents-table'));
  }
  for (const kind of ['incidents', 'payments', 'audit', 'operations']) {
    await context.load(kind);
    assert.ok(!classes.has('grouped-cards'), `${kind} no debe conservar estilos de grupos`);
  }
  assert.deepEqual(calls, ['allies', 'executives', 'incidents', 'payments', 'audit', 'operations']);
});

test('las tarjetas usan ancho disponible y rejilla de tres columnas que pasa a una en móvil', () => {
  const tableRule = page.match(/\.grouped-cards\s+table\s*\{([^}]*)\}/)?.[1];
  assert.ok(tableRule, 'Debe existir una regla de ancho para la tabla que contiene las tarjetas');
  assert.match(tableRule, /width\s*:\s*100%/);
  assert.match(tableRule, /min-width\s*:\s*0(?:!important)?\s*[;}]/);
  assert.match(page, /\.grouped-values\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(page, /@media\s*\(max-width:\s*\d+px\)\s*\{(?:(?!@media)[\s\S])*?\.grouped-values\s*\{[^}]*grid-template-columns\s*:\s*(?:1fr|minmax\(0,\s*1fr\))/);
  const groupRules = [...page.matchAll(/([^{}]*\.grouped-[^{}]*)\{([^}]*)\}/g)].map((match) => match[2]);
  for (const rule of groupRules) {
    assert.doesNotMatch(rule, /min-width\s*:\s*[1-9]\d{2,}(?:px|rem)/);
  }
});
