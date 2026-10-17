import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Commerce = require('../../creditek/erp/liquidaciones-comercios.js');
const browser = {window:{}};
vm.runInNewContext(readFileSync('creditek/erp/tesoreria-preparacion.js','utf8'),browser);
const CreditekTesoreriaPreparacion = browser.window.CreditekTesoreriaPreparacion;

test('incidents separate history, paginate, focus and do not send bonuses to price form', async () => {
  const source = readFileSync('creditek/erp/aliados-liquidaciones-app.js', 'utf8');
  const fn = source.slice(source.indexOf('  async function loadIncidents('), source.indexOf('  async function loadPayments('));
  const helpers = source.slice(source.indexOf('  const awaitingCalculation ='), source.indexOf('  function statesForMode()'));
  assert.match(helpers, /const awaitingCalculation/);
  assert.match(helpers, /const PENDING_STATES/);
  const elements = new Map();
  const $ = (id) => { if (!elements.has(id)) elements.set(id, { innerHTML: '' }); return elements.get(id); };
  const data = Array.from({ length: 12 }, (_, i) => ({ id: String(i), operation_id: String(i), estado: 'abierta', tipo: 'krediya_bono_sin_configurar', liquidation_operations: { establishment_name: `Store${i}`, imei: '123' } }));
  data.push({ id: 'closed', estado: 'resuelta', tipo: 'comercio_no_reconocido', descripcion: 'OLD CLOSED' });
  const query = { select() { return this; }, eq() { return this; }, order: async () => ({ data }) };
  const calls = [];
  const context = vm.createContext({ $, Commerce, CreditekTesoreriaPreparacion,
    sb: { from: table => { assert.equal(table, 'liquidation_incidents'); return query; },
      rpc: async (name, params) => { calls.push([name,params]); return {data:[]}; } },
    selected: { id: 'batch', plataforma: 'krediya', estado: 'calculada' }, esc: String, state: String,
    UX: { traducirEstado: String }, document: { querySelectorAll: () => [], querySelector: () => null } });
  await vm.runInContext(`${helpers}\n${fn}; loadIncidents();`, context);
  assert.equal(($('detailBody').innerHTML.match(/<article/g) || []).length, 8);
  assert.doesNotMatch($('detailBody').innerHTML, /OLD CLOSED|data-resolve=/);
  $('nextIssues').onclick();
  assert.equal(($('detailBody').innerHTML.match(/<article/g) || []).length, 4);
  $('historyIssues').onclick();
  assert.match($('detailBody').innerHTML, /OLD CLOSED/);
  await vm.runInContext('loadIncidents("3")', context);
  assert.equal(($('detailBody').innerHTML.match(/<article/g) || []).length, 1);
  assert.match($('detailBody').innerHTML, /Store3/);
  assert.match($('detailBody').innerHTML, /IMEI 123/);
  assert.match($('detailBody').innerHTML, /1 novedades/);
  $('allIssues').onclick();
  assert.equal(($('detailBody').innerHTML.match(/<article/g) || []).length, 8);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(([name,params]) => name === 'aliados_contextos_precios_krediya' && params.p_liquidation_id === 'batch'));
});
