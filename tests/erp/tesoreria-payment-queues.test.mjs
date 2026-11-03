import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { paymentQueue } = require('../../creditek/erp/aliados-tesoreria-domain.js');

test('autorizar mueve el pago a soportes sin marcarlo pagado', () => {
  const payment = {estado:'pendiente', valor:100};
  assert.equal(paymentQueue(payment), 'authorization');
  const authorized = {...payment, estado:'programado', authorized_by:'manager', authorized_at:'2026-11-03'};
  assert.equal(paymentQueue(authorized), 'support');
  assert.equal(authorized.estado, 'programado');
  assert.equal(paymentQueue({...authorized, bank_snapshot:null}), 'support');
  assert.equal(paymentQueue({...authorized, recovery_review_required:true}), 'authorization');
});
test('pagos realizados sin soporte permanecen abajo y los cerrados en histórico', () => {
  assert.equal(paymentQueue({estado:'pagado'}), 'support');
  for (const payment of [{estado:'pagado',soporte_path:'receipt.pdf'}, {estado:'conciliado'}, {historico_inicial:true}, {estado:'anulado',valor:0}]) {
    assert.equal(paymentQueue(payment), 'history');
  }
});
test('las colas son excluyentes aun compartiendo beneficiario', () => {
  const rows = [{id:'a',beneficiary_id:'same',estado:'pendiente'}, {id:'b',beneficiary_id:'same',estado:'programado',authorized_by:'manager',authorized_at:'2026-11-03'}, {id:'c',estado:'pagado',soporte_path:'file'}];
  assert.deepEqual(rows.filter(p=>paymentQueue(p)==='authorization').map(p=>p.id),['a']);
  assert.deepEqual(rows.filter(p=>paymentQueue(p)==='support').map(p=>p.id),['b']);
  assert.deepEqual(rows.filter(p=>paymentQueue(p)==='history').map(p=>p.id),['c']);
});
