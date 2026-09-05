import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../../creditek/erp/cobros-plataformas.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../../creditek/erp/cobros-plataformas.css', import.meta.url), 'utf8');

function loadModule() {
  const context = {
    window: {}, crypto: webcrypto, URL, Blob, Intl, Date, setTimeout,
    FormData: class { constructor(form) { this.fields = form.fields; } get(key) { return this.fields[key]; } },
  };
  vm.runInNewContext(source, context);
  return context.window.CreditekCobrosPlataformas;
}
const domain = loadModule();
const expected = (id, importe, overrides = {}) => ({ id, importe, plataforma: 'payjoy', corte: '2026-08-31', fecha_esperada: '2026-09-01', concepto: 'Liquidación', estado: 'activo', ...overrides });
const deposit = (id, importe, overrides = {}) => ({ id, importe, plataforma: 'payjoy', fecha: '2026-09-02', banco: 'Banco', cuenta_ultimos4: '1234', referencia: 'REF-1', estado: 'activo', ...overrides });
const allocation = (id, expected_id, deposit_id, importe, overrides = {}) => ({ id, expected_id, deposit_id, importe, estado: 'activo', ...overrides });
const dataset = overrides => ({ expected: [], deposits: [], allocations: [], events: [], candidates: [], ...overrides });
const clone = value => JSON.parse(JSON.stringify(value));

test('abono multicorte se cuenta una sola vez y conserva el saldo sin aplicar', () => {
  const raw = dataset({
    expected: [expected('e1', '100.25', { aplicado: 20 }), expected('e2', '200.75', { fecha_esperada: '2026-09-05' })],
    deposits: [deposit('d1', 160, { aplicado: 120 })],
    allocations: [allocation('a1', 'e1', 'd1', 20), allocation('a2', 'e2', 'd1', 100)],
  });
  const copy = clone(raw);
  const summary = domain.summarize(raw, '2026-09-04');
  assert.deepEqual(clone(summary.totals), { expected: 30100, received: 16000, applied: 12000, pending: 18100, overdue: 8025, unapplied: 4000 });
  assert.deepEqual(raw, copy, 'el resumen no modifica la respuesta del servidor');
  assert.equal(summary.deposits[0].remaining, 4000);
});

test('varios abonos cancelan un corte; el día esperado aún no está vencido', () => {
  const summary = domain.summarize(dataset({
    expected: [expected('e1', 100, { fecha_esperada: '2026-09-04' })],
    deposits: [deposit('d1', 40), deposit('d2', 60)],
    allocations: [allocation('a1', 'e1', 'd1', 40), allocation('a2', 'e1', 'd2', 60)],
  }), '2026-09-04');
  assert.equal(summary.totals.pending, 0);
  assert.equal(summary.totals.overdue, 0);
  assert.equal(summary.totals.received, 10000);
  assert.equal(summary.totals.unapplied, 0);
});

test('las anulaciones quedan trazables y no afectan los saldos activos', () => {
  const summary = domain.summarize(dataset({
    expected: [expected('e1', 100), expected('e2', 200, { estado: 'anulado' })],
    deposits: [deposit('d1', 80), deposit('d2', 200, { estado: 'anulado' })],
    allocations: [allocation('a1', 'e1', 'd1', 20, { estado: 'anulada' }), allocation('a2', 'e2', 'd2', 200, { estado: 'anulado' })],
  }), '2026-09-04');
  assert.deepEqual(clone(summary.totals), { expected: 10000, received: 8000, applied: 0, pending: 10000, overdue: 10000, unapplied: 8000 });
  assert.equal(summary.expected.length, 2);
  assert.equal(summary.allocations.length, 2);
});

test('una respuesta incompleta o importes inválidos no se convierten en ceros', () => {
  for (const raw of [null, {}, { expected: [], deposits: [] }, dataset({ deposits: [deposit('d1', null)] }), dataset({ expected: [expected('e1', 'no disponible')] })]) {
    assert.throws(() => domain.summarize(raw, '2026-09-04'));
  }
  for (const value of ['', '1,000', '1.234', 'Infinity', -10, NaN, null, undefined, true]) assert.throws(() => domain.cents(value));
  assert.equal(domain.cents('1000.25'), 100025);
  assert.equal(domain.cents(0.29), 29);
});

test('rechaza sobreaplicaciones, duplicados y cruces entre plataformas', () => {
  const data = dataset({ expected: [expected('e1', 100)], deposits: [deposit('d1', 80)], allocations: [allocation('a1', 'e1', 'd1', 81)] });
  assert.throws(() => domain.summarize(data, '2026-09-04'), /superan/);
  assert.throws(() => domain.summarize(dataset({ expected: [expected('e1', 100), expected('e1', 200)] }), '2026-09-04'), /duplicados/);
  assert.throws(() => domain.summarize({ ...data, deposits: [deposit('d1', 100, { plataforma: 'alo' })] }, '2026-09-04'), /inconsistente/);
  assert.throws(() => domain.summarize({ ...data, deposits: [deposit('d1', 100, { estado: 'anulado' })] }, '2026-09-04'), /inconsistente/);
});

test('valida el saldo de ambos lados antes de aplicar y no admite otra plataforma', () => {
  const summary = domain.summarize(dataset({ expected: [expected('e1', 100), expected('e2', 200, { plataforma: 'alo' })], deposits: [deposit('d1', 80)] }), '2026-09-04');
  assert.equal(domain.validateAllocation(summary, 'd1', 'e1', '30.25'), 30.25);
  assert.throws(() => domain.validateAllocation(summary, 'd1', 'e1', 81), /sin aplicar/);
  assert.throws(() => domain.validateAllocation(summary, 'd1', 'e2', 1), /misma plataforma/);
  assert.throws(() => domain.validateAllocation(summary, 'd1', 'e1', 0), /mayor que cero/);
  assert.throws(() => domain.validateAllocation(summary, 'ausente', 'e1', 1), /activos/);
});

test('la base estimada de liquidaciones no entra en esperado ni concilia abonos', () => {
  const summary = domain.summarize(dataset({ candidates: [{ liquidation_id: 'l1', plataforma: 'addi', corte: '2026-08-31', base_estimada: '1500000.00', operaciones: 3 }] }), '2026-09-04');
  assert.equal(summary.candidates[0].baseAmount, 150000000);
  assert.equal(summary.totals.expected, 0);
  assert.equal(summary.totals.received, 0);
  assert.equal(summary.totals.pending, 0);
  assert(summary.platforms.some(row => row.plataforma === 'addi'));
  const missing = domain.summarize(dataset({ candidates: [{ liquidation_id: 'l2', plataforma: 'addi', corte: '2026-08-31', base_estimada: null, operaciones: 0 }] }), '2026-09-04');
  assert.equal(missing.candidates[0].baseAmount, null, 'una base ausente no aparece como cero');
});

test('CSV lleva BOM, trazabilidad multicorte y neutraliza fórmulas de Excel', () => {
  const summary = domain.summarize(dataset({
    expected: [expected('e1', 100, { concepto: '=HYPERLINK("https://malicioso")', soporte: '\t=1+1' }), expected('e2', 100, { plataforma: 'alo' })],
    deposits: [deposit('d1', 80, { referencia: '  @SUM(1,2)' })],
    allocations: [allocation('a1', 'e1', 'd1', 20)],
  }), '2026-09-04');
  const csv = domain.exportCsv(summary, 'payjoy');
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /"'\=HYPERLINK\(""https:\/\/malicioso""\)"/);
  assert.match(csv, /"'  @SUM/);
  assert.match(csv, /"'\t=1\+1"/);
  assert.match(csv, /Aplicación \(no sumar a recibido\)/);
  assert.match(csv, /"e1";"d1";"aplicacion"/);
  assert.doesNotMatch(csv, /ALO Credit/);
  assert.match(csv, /•••• 1234/);
});

test('la fecha de vencimiento sigue Bogotá durante el cambio de día UTC', () => {
  assert.equal(domain.todayBogota(new Date('2026-09-05T02:00:00Z')), '2026-09-04');
  assert.equal(domain.todayBogota(new Date('2026-09-05T05:01:00Z')), '2026-09-05');
});

function container() {
  const listeners = new Map();
  const notice = { textContent: '', hidden: true, className: '', setAttribute() {} };
  return {
    innerHTML: '', listeners, notice,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
    querySelector(selector) { return selector === '[data-cobros-notice]' ? notice : null; },
    querySelectorAll() { return []; }, setAttribute() {}, contains() { return true; },
  };
}

function form(type, fields, dataset = {}) {
  return { dataset: { cobrosForm: type, ...dataset }, fields, reportValidity() { return true; }, closest() { return this; } };
}
const submit = (element, target) => element.listeners.get('submit')({ target, preventDefault() {} });
const expectedFields = { plataforma: 'payjoy', corte: '2026-08-31', fecha_esperada: '2026-09-05', concepto: 'Neto de corte', importe: '100', soporte: 'Comprobante 1' };

test('monta con la sesión recibida sin consultar al crear y escapa contenido remoto', async () => {
  const calls = [];
  const sb = { rpc: async (...args) => { calls.push(args); return { data: dataset({ expected: [expected('e1', 100, { concepto: '<img src=x onerror=alert(1)>', soporte: 'javascript:alert(1)' })] }), error: null }; } };
  const instance = domain.create({ sb });
  assert.equal(calls.length, 0);
  const host = container();
  await instance.mount(host);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'cobros_plataformas_resumen');
  assert.match(host.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(host.innerHTML, /<img|href="javascript:/);
  assert.doesNotMatch(host.innerHTML, /data-cobros-form=/);
  instance.destroy();
  assert.equal(host.listeners.size, 0);
});

test('error inicial presenta indisponibilidad en vez de métricas con cero', async () => {
  const host = container();
  await domain.create({ sb: { rpc: async () => ({ data: null, error: { message: 'Sin permiso' } }) } }).mount(host);
  assert.match(host.notice.textContent, /No se pudieron consultar.*Sin permiso/);
  assert.match(host.innerHTML, /Los saldos no están disponibles/);
  assert.doesNotMatch(host.innerHTML, /cobros-metric|Exportar para Excel/);
});

test('el historial muestra el motivo JSON de anulaciones y el actor', async () => {
  const host = container();
  await domain.create({ sb: { rpc: async () => ({ data: dataset({ events: [{ tipo: 'deposit_anulado', registro_id: 'd1', detalle: { motivo: 'Comprobante duplicado' }, actor_nombre: 'Gerencia', created_at: '2026-09-04T12:00:00Z' }] }), error: null }) } }).mount(host);
  assert.match(host.innerHTML, /Abono anulado/);
  assert.match(host.innerHTML, /Comprobante duplicado/);
  assert.match(host.innerHTML, /Gerencia/);
  assert.doesNotMatch(host.innerHTML, /\[object Object\]/);
});

test('neto de candidato inicia vacío y se confirma una sola vez ligado a la liquidación', async () => {
  const calls = [];
  const raw = dataset({ candidates: [{ liquidation_id: 'l1', plataforma: 'payjoy', corte: '2026-08-31', concepto: 'Lote 1', base_estimada: 9000, operaciones: 2 }] });
  const host = container();
  await domain.create({ canEdit: true, sb: { rpc: async (name, args) => { calls.push([name, args]); return { data: name === 'cobros_plataformas_resumen' ? raw : { id: 'e1' }, error: null }; } } }).mount(host);
  assert.match(host.innerHTML, /La base del archivo no equivale al abono bancario/);
  const candidateHtml = host.innerHTML.split('data-cobros-form="candidate"')[1].split('</form>')[0];
  assert.match(candidateHtml, /name="importe" type="number" value=""/);
  await submit(host, form('candidate', expectedFields, { liquidation: 'l1' }));
  const saved = calls.find(([name]) => name === 'cobros_crear_esperado')[1];
  assert.equal(saved.p_liquidation_id, 'l1');
  assert.equal(saved.p_importe, 100);
  assert.equal(saved.p_corte, '2026-08-31');
  assert.match(saved.p_idempotency_key, /^[\da-f-]{36}$/);
});

test('solicitud en curso bloquea doble envío; el reintento conserva idempotencia', async () => {
  const calls = [];
  let finish;
  const host = container();
  const sb = { rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'cobros_plataformas_resumen') return { data: dataset(), error: null };
    if (!finish) return new Promise(resolve => { finish = resolve; });
    return { data: { id: 'e1' }, error: null };
  } };
  await domain.create({ sb, canEdit: true }).mount(host);
  const target = form('expected', expectedFields);
  const pending = submit(host, target);
  await submit(host, target);
  assert.equal(calls.filter(([name]) => name === 'cobros_crear_esperado').length, 1);
  finish({ data: null, error: { message: 'Conexión interrumpida' } });
  await pending;
  await submit(host, target);
  const writes = calls.filter(([name]) => name === 'cobros_crear_esperado');
  assert.equal(writes.length, 2);
  assert.equal(writes[0][1].p_idempotency_key, writes[1][1].p_idempotency_key);
});

test('si se guarda pero falla la recarga bloquea nuevas escrituras hasta actualizar', async () => {
  let reads = 0;
  let writes = 0;
  const host = container();
  const instance = domain.create({ canEdit: true, sb: { rpc: async name => {
    if (name !== 'cobros_plataformas_resumen') { writes += 1; return { data: { id: 'e1' }, error: null }; }
    reads += 1;
    return reads === 2 ? { data: null, error: { message: 'Red no disponible' } } : { data: dataset(), error: null };
  } } });
  await instance.mount(host);
  await submit(host, form('expected', expectedFields));
  assert.match(host.notice.textContent, /El registro se guardó.*Pulsa Actualizar/);
  await submit(host, form('expected', expectedFields));
  assert.equal(writes, 1);
  await instance.refresh();
  await submit(host, form('expected', expectedFields));
  assert.equal(writes, 2);
});

test('anular requiere canVoid y conserva el motivo; lectura no admite submits inyectados', async () => {
  for (const permissions of [{ canEdit: false, canVoid: false }, { canEdit: true, canVoid: false }, { canEdit: true, canVoid: true }]) {
    const calls = [];
    const host = container();
    await domain.create({ ...permissions, sb: { rpc: async (name, args) => { calls.push([name, args]); return { data: dataset({ expected: [expected('e1', 100)] }), error: null }; } } }).mount(host);
    await submit(host, form('void', { motivo: 'Duplicado confirmado' }, { kind: 'expected', id: 'e1' }));
    const writes = calls.filter(([name]) => name === 'cobros_anular_registro');
    assert.equal(writes.length, permissions.canVoid ? 1 : 0);
    if (permissions.canVoid) assert.equal(writes[0][1].p_motivo, 'Duplicado confirmado');
    if (!permissions.canEdit) {
      await submit(host, form('expected', expectedFields));
      assert.equal(calls.filter(([name]) => name === 'cobros_crear_esperado').length, 0);
    }
  }
});

test('CSS mantiene valores y etiquetas visibles en móviles sin recortes forzados', () => {
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis|line-clamp|white-space:\s*nowrap|overflow:\s*hidden/);
});
