import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(readFileSync(new URL('../../creditek/erp/compra-retencion-automatica.js', import.meta.url), 'utf8'), context);
const {calcularDesdeIVA, calcularDesdeFactura} = context.CreditekRetencionAutomatica;
const plain = value => JSON.parse(JSON.stringify(value));
const factura = {total:1190, baseAntesIVA:1000, iva:190, detalleIVA:[{monto:190}]};

test('el costo bruto conserva el IVA; la base, retención y neto se derivan sin descontar dos veces', () => {
  assert.deepEqual(plain(calcularDesdeIVA({total:1190, iva:190})), {base:1000, iva:190, tarifa:2.5, valor:25, neto:1165});
});
test('factura sin IVA confirmado', () => {
  assert.deepEqual(plain(calcularDesdeIVA({total:1000, iva:'0'})), {base:1000, iva:0, tarifa:2.5, valor:25, neto:975});
});
test('admite mezcla de IVA 19 %, 5 % y productos sin IVA, sin presumir una tarifa única', () => {
  // Bases ficticias: 1000 al 19 %, 200 al 5 %, 300 sin IVA.
  assert.deepEqual(plain(calcularDesdeIVA({total:1700, iva:200})), {base:1500, iva:200, tarifa:2.5, valor:37.5, neto:1662.5});
});
test('conserva centavos para el cálculo aunque la interfaz presente pesos', () => {
  assert.deepEqual(plain(calcularDesdeIVA({total:1190.24, iva:190.04})), {base:1000.2, iva:190.04, tarifa:2.5, valor:25.01, neto:1165.23});
});
test('no convierte IVA ausente, inválido o fuera de rango en cero', () => {
  for (const iva of ['', '  ', null, undefined, false, [], {}, NaN, Infinity, -1, 1190, 1191, 0.001]) {
    assert.throws(() => calcularDesdeIVA({total:1190, iva}), undefined, String(iva));
  }
});
test('rechaza total inválido y cambio de la tarifa configurada', () => {
  for (const total of [null, '', false, 0, -1, Infinity, NaN, Number.MAX_SAFE_INTEGER, 1.001]) {
    assert.throws(() => calcularDesdeIVA({total, iva:0}));
  }
  assert.throws(() => calcularDesdeIVA({total:1190, iva:190, tarifa:3.5}));
});
test('XML con desglose concordante', () => {
  assert.deepEqual(plain(calcularDesdeFactura({total:1190, factura})), plain(calcularDesdeIVA({total:1190, iva:190})));
});
test('XML sin IVA necesita base y total iguales y ausencia de desglose', () => {
  assert.equal(calcularDesdeFactura({total:1000, factura:{total:1000, baseAntesIVA:1000, iva:null, detalleIVA:[]}}).iva, 0);
  assert.throws(() => calcularDesdeFactura({total:1190, factura:{...factura, iva:null, detalleIVA:[]}}));
  assert.throws(() => calcularDesdeFactura({total:1000, factura:{total:1000, baseAntesIVA:1000, iva:null, detalleIVA:[{monto:null}]}}));
});
test('XML incompleto o con otros impuestos inconsistentes no se aplica', () => {
  for (const broken of [{baseAntesIVA:null}, {iva:null}, {baseAntesIVA:999}, {iva:191}, {total:null}]) {
    assert.throws(() => calcularDesdeFactura({total:1190, factura:{...factura,...broken}}));
  }
});
test('el XML debe coincidir con el bruto hasta el centavo; no reajusta bases proporcionalmente', () => {
  for (const total of [0, 1190.01, 1189.99, 1190.5, 2380]) {
    assert.throws(() => calcularDesdeFactura({total, factura}), /no coincide/);
  }
});
