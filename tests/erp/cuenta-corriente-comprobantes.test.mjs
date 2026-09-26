import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../../creditek/erp/cuenta-corriente.html', import.meta.url), 'utf8');
const script = html.match(/<script>\nconst KORA_ENV[\s\S]*?<\/script>/)[0].slice(8, -9);

function fixture(rol, tienda, estado = 'pendiente', error = null) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', textContent: '', value: '', style: {}, hidden: false,
      classList: { add() {}, remove() {} }, addEventListener() {}, querySelectorAll: () => [],
      querySelector: () => null,
    });
    return elements.get(id);
  };
  const calls = [];
  const row = { id: 'fixture-instruction', tienda_codigo: tienda, fecha: '2026-09-25', banco: 'Banco de prueba',
    numero_cuenta: '00000000000', valor_esperado: 489500, estado, soporte_path: estado === 'pendiente' ? null : 'fixture.jpg' };
  const context = vm.createContext({
    window: { __KORA_ENV__: {}, CreditekCuentaCorrienteDomain: {} },
    document: { getElementById: element, addEventListener() {}, body: { classList: { add() {} } } },
    supabase: { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) },
      rpc: async name => { calls.push(name); return { data: [row], error }; } }) },
    crypto, requestAnimationFrame: fn => fn(),
  });
  vm.runInContext(script, context);
  vm.runInContext(`currentPerfil = ${JSON.stringify({ rol, activo: true, tienda_codigo: tienda })}; nombresTiendas = new Map([[${JSON.stringify(tienda)}, 'Tienda de prueba']]);`, context);
  return { context, element, calls };
}

test('todas las tiendas tienen Subir comprobante dentro de la columna Comprobante', async () => {
  for (const tienda of ['CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','CK-10']) {
    const f = fixture('admin_tienda', tienda);
    await vm.runInContext('cargarInstrucciones()', f.context);
    const row = f.element('tbodyInstrucciones').innerHTML;
    assert.match(row, /<td data-label="Comprobante">[\s\S]*data-enviar="fixture-instruction">Subir comprobante<\/button>[\s\S]*<\/div><\/td>/);
    assert.equal((row.match(/<td\b/g) || []).length, 7, 'sin columna Acciones escondida');
    assert.doesNotMatch(row, /data-aprobar|data-rechazar/);
    vm.runInContext("abrirComprobante('fixture-instruction')", f.context);
    assert.equal(f.element('comprobanteValor').value, 489500);
    assert.match(f.element('comprobanteDestino').textContent, /Banco de prueba/);
    assert.deepEqual(f.calls, ['listar_instrucciones_consignacion'], 'abrir el formulario no registra un pago');
  }
});

test('preserva los estados y el control de validación de administración', async () => {
  for (const rol of ['admin_tienda','gerencia','auditoria']) {
    for (const estado of ['pendiente','rechazado','en_validacion','validado']) {
      const f = fixture(rol, 'CK-02', estado);
      await vm.runInContext('cargarInstrucciones()', f.context);
      const row = f.element('tbodyInstrucciones').innerHTML;
      assert.equal(row.includes('data-enviar='), rol === 'admin_tienda' && ['pendiente','rechazado'].includes(estado));
      assert.equal(row.includes('data-aprobar='), rol !== 'admin_tienda' && estado === 'en_validacion');
      assert.equal(row.includes('data-rechazar='), rol !== 'admin_tienda' && estado === 'en_validacion');
      assert.equal(row.includes('data-soporte='), estado !== 'pendiente');
      if (rol === 'admin_tienda' && estado === 'rechazado') assert.match(row, /Reenviar comprobante/);
    }
  }
});

test('error al consultar no deja botones de instrucciones antiguas', async () => {
  const f = fixture('admin_tienda', 'CK-02', 'pendiente', {message:'Error de prueba'});
  f.element('tbodyInstrucciones').innerHTML = 'fila anterior';
  await vm.runInContext('cargarInstrucciones()', f.context);
  assert.equal(f.element('tbodyInstrucciones').innerHTML, '');
  assert.match(f.element('emptyInstrucciones').textContent, /No se pudieron cargar/);
});

test('tabla acotada, etiquetas en móvil y botones con área táctil', () => {
  assert.match(html, /<table id="tablaInstrucciones">/);
  assert.match(html, /#tablaInstrucciones \{ table-layout: fixed; width: 100%; min-width: 0;/);
  assert.match(html, /@media \(max-width: 900px\)/);
  assert.match(html, /#tablaInstrucciones td::before \{ content: attr\(data-label\)/);
  assert.match(html, /#tablaInstrucciones button[^}]*min-height: 44px/);
});
