import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('creditek/erp/traslados.html', 'utf8');
const id = '00000000-0000-0000-0000-000000000011';
const record = { id, consecutivo: 11, estado: 'despachado', tienda_origen: 'CK-10', tienda_destino: 'CK-03', origen: { nombre: 'Sonivox' }, destino: { nombre: 'Celfiao' } };
const body = html.slice(html.indexOf('function anularTraslado(id)'), html.indexOf('// ─── Escáner de código de barras (BarcodeDetector nativo)', html.indexOf('function anularTraslado(id)')));
const permission = html.match(/function puedeAnularTraslado\(traslado\) \{[^\n]+\}/)[0];

function harness({ central = true, traslado = record, rpc = async () => ({ data: { ok: true, consecutivo: 11 }, error: null }) } = {}) {
  const elements = new Map(), calls = [], messages = [];
  function getElementById(key) {
    if (!elements.has(key)) {
      const classes = new Set(), attrs = {};
      elements.set(key, {
        value: '', checked: false, disabled: false, textContent: '', open: false,
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
        showModal() { this.open = true; }, close() { this.open = false; },
        reset() { getElementById('anularTrasladoMotivo').value = ''; getElementById('anularTrasladoConfirmacion').checked = false; },
        setAttribute(name, value) { attrs[name] = value; }, removeAttribute(name) { delete attrs[name]; },
      });
    }
    return elements.get(key);
  }
  const context = vm.createContext({
    trasladosCache: [traslado], trasladoActual: traslado, trasladoParaAnular: null, anulacionEnCurso: false,
    esCentral: () => central, etiquetaEstado: value => value,
    document: { getElementById },
    sb: { rpc: async (name, args) => { calls.push({ name, args }); return rpc(); } },
    mostrarBanner: message => messages.push(message), renderTablaTraslados() {}, async cargarTraslados() {},
  });
  vm.runInContext(permission + '\n' + body, context);
  const approve = () => {
    getElementById('anularTrasladoMotivo').value = 'Destino elegido por error';
    getElementById('anularTrasladoConfirmacion').checked = true;
  };
  const submit = () => context.confirmarAnulacionTraslado({ preventDefault() {} });
  return { context, calls, messages, element: getElementById, approve, submit };
}

test('abrir anulación no escribe; identifica número, origen y destino y exige confirmación nueva', () => {
  const h = harness();
  h.approve();
  h.context.anularTraslado(id);
  assert.equal(h.calls.length, 0);
  assert.equal(h.element('dialogAnularTraslado').open, true);
  assert.equal(h.element('anularTrasladoTitulo').textContent, 'Anular traslado #11');
  assert.match(h.element('anularTrasladoResumen').textContent, /Sonivox → Celfiao/);
  assert.equal(h.element('anularTrasladoMotivo').value, '');
  assert.equal(h.element('anularTrasladoConfirmacion').checked, false);
});

test('solo central y estados previos al visto bueno permiten abrir anulación', () => {
  for (const central of [false, true]) {
    for (const estado of ['despachado', 'recibido_pendiente_aprobacion', 'recibido', 'cerrado', 'anulado']) {
      const h = harness({ central, traslado: { ...record, estado } });
      h.context.anularTraslado(id);
      assert.equal(h.element('dialogAnularTraslado').open, central && ['despachado', 'recibido_pendiente_aprobacion'].includes(estado));
      assert.equal(h.calls.length, 0);
    }
  }
});

test('motivo y confirmación son obligatorios sin depender de validación HTML', async () => {
  for (const [reason, checked] of [['', true], ['abcd', true], ['  ', true], ['x'.repeat(1001), true], ['Destino incorrecto', false]]) {
    const h = harness(); h.context.anularTraslado(id);
    h.element('anularTrasladoMotivo').value = reason;
    h.element('anularTrasladoConfirmacion').checked = checked;
    await h.submit();
    assert.equal(h.calls.length, 0);
    assert.equal(h.element('dialogAnularTraslado').open, true);
    assert.equal(h.element('anularTrasladoErr').classList.contains('show'), true);
  }
});

test('doble clic no duplica RPC; no permite cerrar mientras se procesa', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const h = harness({ rpc: () => pending });
  h.context.anularTraslado(id); h.approve();
  const first = h.submit();
  await h.submit();
  h.context.cerrarAnulacionTraslado();
  assert.equal(h.calls.length, 1);
  assert.equal(h.element('dialogAnularTraslado').open, true);
  assert.equal(h.element('btnConfirmarAnulacionTraslado').disabled, true);
  assert.equal(h.element('btnCancelarAnulacionTraslado').disabled, true);
  resolve({ data: { ok: true, consecutivo: 11 }, error: null });
  await first;
  assert.equal(h.element('dialogAnularTraslado').open, false);
  assert.equal(h.context.trasladosCache[0].estado, 'anulado');
  assert.match(h.messages.at(-1), /Todos sus productos regresaron a Sonivox/);
  assert.equal(h.calls[0].name, 'anular_traslado');
  assert.equal(h.calls[0].args.p_traslado_id, id);
  assert.equal(h.calls[0].args.p_motivo, 'Destino elegido por error');
});

test('error de RPC, red o resultado ambiguo conserva modal/datos sin afirmar éxito', async () => {
  for (const rpc of [async () => ({ error: { message: 'Ya fue recibido' }, data: null }), async () => { throw new Error('Sin conexión'); }, async () => ({ error: null, data: null })]) {
    const h = harness({ rpc }); h.context.anularTraslado(id); h.approve();
    await h.submit();
    assert.equal(h.element('dialogAnularTraslado').open, true);
    assert.equal(h.context.trasladosCache[0].estado, 'despachado');
    assert.equal(h.messages.length, 0);
    assert.equal(h.element('anularTrasladoErr').classList.contains('show'), true);
    assert.equal(h.element('btnConfirmarAnulacionTraslado').disabled, false);
    assert.equal(h.element('anularTrasladoMotivo').value, 'Destino elegido por error');
  }
});

test('anulación usa diálogo nativo accesible con advertencia, no prompt ni ejecución por URL', () => {
  assert.match(html, /<dialog[^>]+id="dialogAnularTraslado"[^>]+aria-labelledby="anularTrasladoTitulo"[^>]+aria-describedby=/);
  assert.match(html, /Se anulará todo el traslado, no solo un teléfono/);
  assert.match(html, /Todos sus productos volverán al inventario de la tienda de origen/);
  assert.match(html, /id="anularTrasladoMotivo"[^>]+required/);
  assert.match(html, /id="anularTrasladoConfirmacion" required/);
  assert.match(html, /id="anularTrasladoErr" role="alert"/);
  assert.doesNotMatch(body, /prompt\(|confirm\(/);
  assert.match(html, /btnAnularDetalleTraslado'\)\.style\.display = puedeAnularTraslado\(t\)/);
  assert.match(html, /addEventListener\('cancel', event => \{ if \(anulacionEnCurso\) event.preventDefault\(\)/);
});

test('nuevo traslado nunca selecciona Celfiao u otra tienda por defecto', () => {
  const start = html.indexOf('function abrirModalTraslado()');
  const end = html.indexOf('function agregarItemCelularTra()', start);
  const create = html.slice(start, end);
  assert.match(create, /<option value="">Selecciona la tienda destino<\/option>/);
  assert.match(create, /sel.value = ''/);
  assert.match(html, /if \(!tienda_destino\) \{ err.textContent = 'Elige la tienda destino.'/);
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
});

test('detalle del traslado consulta y muestra el IMEI completo, producto y costo sin alterarlos', async () => {
  const start = html.indexOf('async function abrirModalVerTraslado(t)');
  const end = html.indexOf('async function confirmarRecepcionTraslado()', start);
  const detail = html.slice(start, end);
  const values = new Map(), selected = [];
  const data = [
    { unidad_id: id, cantidad: 1, precio_tienda: 368000, productos: { nombre: 'Samsung A07 128 GB' }, unidades: { imei: '357113744396318' } },
    { unidad_id: null, cantidad: 2, precio_tienda: 10000, productos: { nombre: 'Cable' }, unidades: null },
  ];
  const context = vm.createContext({
    trasladoActual: null, currentPerfil: { rol: 'gerencia' },
    sb: { from(table) {
      assert.equal(table, 'traslado_items_lectura');
      return { select(value) { selected.push(value); return this; }, async eq(key, value) { assert.equal(key, 'traslado_id'); assert.equal(value, id); return { data, error: null }; } };
    } },
    document: { getElementById(key) {
      if (!values.has(key)) values.set(key, { textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} } });
      return values.get(key);
    } },
    esCentral: () => true, puedeAnularTraslado: () => true, etiquetaEstado: value => value,
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;'), fmtCOP: value => String(value),
    window: { KoraTrasladosDomain: { resumir: () => ({ unidades: 3, celulares: 1, accesorios: 2, valorTotal: 388000 }) } },
  });
  vm.runInContext(detail, context);
  await context.abrirModalVerTraslado(record);
  assert.deepEqual(selected, ['*, productos(nombre), unidades(imei)']);
  const content = values.get('verTrasladoItems').innerHTML;
  assert.match(content, /Samsung A07 128 GB/);
  assert.match(content, /IMEI:<\/strong> 357113744396318/);
  assert.match(content, /Costo de remisión: 368000/);
  assert.match(content, /Cable ×2/);
  assert.equal((content.match(/IMEI:/g) || []).length, 1);
  data[0].unidades = null;
  await context.abrirModalVerTraslado(record);
  assert.match(values.get('verTrasladoItems').innerHTML, /No disponible · verifica el equipo antes de continuar/);
});
