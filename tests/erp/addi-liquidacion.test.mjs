import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../../creditek/erp/addi-liquidacion.js';

const addi = globalThis.CreditekAddiLiquidacion;

test('Addi usa tarifa fija 7,5%, IVA 19% sobre la tarifa y pago a 15 días', () => {
  assert.equal(addi.TARIFA_INTERMEDIACION, 0.075);
  assert.equal(addi.IVA_TARIFA, 0.19);
  assert.equal(addi.DIAS_PAGO, 15);
  assert.deepEqual(addi.calcular(90000), {
    credito: 90000, tarifa: 6750, ivaTarifa: 1282.5, netoEstimado: 81967,
    pagoTienda: 68400, porcentajeTienda: 0.76, diasPago: 15,
  });
  assert.deepEqual(addi.calcular(258800), {
    credito: 258800, tarifa: 19410, ivaTarifa: 3687.9, netoEstimado: 235702,
    pagoTienda: 196688, porcentajeTienda: 0.76, diasPago: 15,
  });
  assert.deepEqual(addi.calcular(996200), {
    credito: 996200, tarifa: 74715, ivaTarifa: 14195.85, netoEstimado: 907289,
    pagoTienda: 757112, porcentajeTienda: 0.76, diasPago: 15,
  });
});

test('Addi rechaza importes inexistentes o con más de dos decimales', () => {
  for (const invalid of [0, -1, 'abc', 100.001]) {
    assert.throws(() => addi.calcular(invalid), /valor de crédito positivo/);
  }
});
