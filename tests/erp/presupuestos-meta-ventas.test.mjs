import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../../creditek/erp/presupuestos.html', import.meta.url), 'utf8');

test('Presupuestos permite consultar y editar la meta diaria de ventas', () => {
  assert.match(html, /id="tabVentas" data-metrica="meta_venta_total">Ventas<\/button>/);
  assert.match(html, /meta_venta_total: 'Meta de ventas'/);
  assert.match(html, /meta_venta_total: reg \? reg\.meta_venta_total : 0/);
  assert.match(html, /metricaActual === 'meta_venta_total'/);
});

test('la meta se prepara por tienda y solo se guarda después de aprobación', () => {
  assert.match(html, /id="genTienda"/);
  assert.match(html, /Calcular propuesta/);
  assert.match(html, /id="btnAprobarPropuesta"/);
  assert.match(html, /rpc\('proponer_presupuesto_operativo'/);
  assert.match(html, /rpc\('guardar_presupuesto_operativo'/);
  assert.match(html, /propuesta_sin_guardar/);
  assert.match(html, /Aprobar indicador actual/);
  assert.match(html, /value="__todas__">Todas las tiendas activas/);
  assert.match(html, /id="btnGenerarCartas">Generar presupuestos/);
});

function budgetFixture({ failProposal = false, failSave = false, role = 'gerencia' } = {}) {
  const fields = Object.fromEntries(['genErr','genMes','genTienda','btnGenerar','verMes','btnAprobarPropuesta','btnCancelarPropuesta'].map(id => [id, {
    value: id === 'genMes' ? '2026-10' : id === 'genTienda' ? 'TEST' : '',
    style: {}, classList: { add() {}, remove() {} }, textContent: '', disabled: false,
  }]));
  const calls = [], banners = [];
  const context = {
    document: { getElementById: id => fields[id] },
    currentPerfil: { rol: role },
    tiendasCache: [{ codigo: 'TEST', nombre: 'Tienda de prueba' }],
    propuestaActual: null, metricaActual: 'meta_venta_total', presupuestoCache: [],
    leerPorcentaje: () => 20,
    KoraPresupuestosRetailCartas: { tiendasElegidas: (stores, code) => stores.filter(t => t.codigo === code) },
    sb: { async rpc(name, params) {
      calls.push({ name, params });
      return name === 'proponer_presupuesto_operativo'
        ? failProposal ? { error: { message: 'Propuesta no disponible' } } : { data: [{ fecha: '2026-10-01', meta_propuesta: 120000.25 }] }
        : failSave ? { error: { message: 'No autorizado' } } : { data: null };
    } },
    cargarPresupuesto: async () => { context.presupuestoCache = []; },
    renderTabla() {}, mostrarBanner: text => banners.push(text), confirm: () => true,
  };
  const proposal = html.slice(html.indexOf('async function generarPresupuesto()'), html.indexOf('async function guardarTodosLosIndicadores()'));
  const save = html.slice(html.indexOf('async function guardarPropuesta()'), html.indexOf('async function descartarPropuesta()'));
  vm.runInNewContext(proposal + save, context);
  return { context, fields, calls, banners };
}

test('calcular presupuesto solo consulta; aprobar guarda los mismos parámetros y no repite sin propuesta', async () => {
  const { context, fields, calls } = budgetFixture();
  await context.generarPresupuesto();
  assert.deepEqual(calls.map(c => c.name), ['proponer_presupuesto_operativo']);
  assert.equal(context.presupuestoCache[0].meta_venta_total, 120000.25);
  assert.equal(context.presupuestoCache[0].generado_desde, 'propuesta_sin_guardar');
  assert.equal(fields.btnAprobarPropuesta.style.display, '');
  await context.guardarPropuesta();
  assert.deepEqual(calls.map(c => c.name), ['proponer_presupuesto_operativo', 'guardar_presupuesto_operativo']);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].params)), JSON.parse(JSON.stringify(calls[0].params)));
  assert.equal(context.propuestaActual, null);
  assert.equal(fields.btnAprobarPropuesta.style.display, 'none');
  await context.guardarPropuesta();
  assert.equal(calls.length, 2);
});

test('errores de propuesta o aprobación no aparentan un guardado exitoso y auditoría no muestra aprobar', async () => {
  const unavailable = budgetFixture({ failProposal: true });
  await unavailable.context.generarPresupuesto();
  assert.equal(unavailable.context.propuestaActual, null);
  assert.equal(unavailable.fields.btnGenerar.disabled, false);
  assert.match(unavailable.fields.genErr.textContent, /No se pudo calcular/);
  assert.ok(unavailable.calls.every(c => c.name === 'proponer_presupuesto_operativo'));
  const denied = budgetFixture({ failSave: true });
  await denied.context.generarPresupuesto();
  await denied.context.guardarPropuesta();
  assert.match(denied.fields.genErr.textContent, /Fallaron 1.*No autorizado/);
  assert.ok(denied.banners.every(text => !text.startsWith('Presupuesto aprobado')));
  const audit = budgetFixture({ role: 'auditoria' });
  await audit.context.generarPresupuesto();
  assert.equal(audit.fields.btnAprobarPropuesta.style.display, 'none');
  assert.ok(audit.calls.every(c => c.name === 'proponer_presupuesto_operativo'));
});
