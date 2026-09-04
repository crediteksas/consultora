import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('incidents separate history, paginate, focus and do not send bonuses to price form', async () => {
  const source = readFileSync('creditek/erp/aliados-liquidaciones-app.js', 'utf8');
  const fn = source.slice(source.indexOf('  async function loadIncidents('), source.indexOf('  async function loadPayments('));
  const elements = new Map();
  const $ = (id) => { if (!elements.has(id)) elements.set(id, { innerHTML: '' }); return elements.get(id); };
  const data = Array.from({ length: 12 }, (_, i) => ({ id: String(i), operation_id: String(i), estado: 'abierta', tipo: 'krediya_bono_sin_configurar', liquidation_operations: { establishment_name: `Store${i}`, imei: '123' } }));
  data.push({ id: 'closed', estado: 'resuelta', tipo: 'comercio_no_reconocido', descripcion: 'OLD CLOSED' });
  const query = { select() { return this; }, eq() { return this; }, order: async () => ({ data }) };
  const context = vm.createContext({ $, sb: { from: () => query }, selected: { id: 'batch' }, esc: String, state: String, UX: { traducirEstado: String }, document: { querySelectorAll: () => [], querySelector: () => null } });
  await vm.runInContext(`${fn}; loadIncidents();`, context);
  assert.equal(($('detailBody').innerHTML.match(/<article/g) || []).length, 8);
  assert.doesNotMatch($('detailBody').innerHTML, /OLD CLOSED|data-resolve=/);
  $('nextIssues').onclick();
  assert.equal(($('detailBody').innerHTML.match(/<article/g) || []).length, 4);
  $('historyIssues').onclick();
  assert.match($('detailBody').innerHTML, /OLD CLOSED/);
  await vm.runInContext('loadIncidents("3")', context);
  assert.equal(($('detailBody').innerHTML.match(/<article/g) || []).length, 1);
  assert.match($('detailBody').innerHTML, /Store3/);
});
