import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const moduleCode = readFileSync(new URL('../../creditek/erp/addi-liquidacion.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(moduleCode, context);
const addi = context.CreditekAddiLiquidacion;
const cajaContext = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../creditek/erp/caja-domain.js', import.meta.url), 'utf8'), cajaContext);
const caja = cajaContext.CreditekCajaDomain;
const sale = readFileSync(new URL('../../creditek/erp/ventas.html', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260924224850_addi_sale_net_price_and_tender.sql', import.meta.url), 'utf8');

test('precio tienda, credito bruto y efectivo no se confunden', () => {
  const result = addi.calcularVenta(552600, 600000);
  assert.equal(result.pagoTienda, 456000);
  assert.equal(result.porCobrar, 96600);
  assert.equal(result.netoEstimado, 546450);
  assert.equal(result.netoEstimado - result.pagoTienda, 90450);
});

test('no permite pago Addi mayor al articulo ni centavos en los valores capturados', () => {
  assert.throws(() => addi.calcularVenta(450000, 600000), /supera/);
  assert.throws(() => addi.calcularVenta(552600.5, 600000), /pesos enteros/);
  assert.throws(() => addi.calcularVenta(552600, 600000.5), /pesos enteros/);
});

test('la pantalla exige medio, calcula diferencia sobre pago tienda y persiste la referencia', () => {
  assert.match(sale, /calcularVenta\(totalVenta, esperado\)/);
  assert.match(sale, /medio_pago_complementario: medioComplementario/);
  assert.match(sale, /referencia_pago_complementario: referenciaComplementaria/);
  assert.match(sale, /Selecciona cómo pagó el cliente la diferencia/);
});

test('el servidor valida politica Addi y no suma tarjetas a Caja', () => {
  assert.match(migration, /addi_redondear_peso\('/);
  assert.match(migration, /medio_pago_complementario/);
  assert.match(migration, /sum\(case when lower\(coalesce\(c\.financiera/);
  assert.match(migration, /c\.medio_pago_complementario<>''efectivo''/);
});

test('tarjeta Addi no aumenta efectivo esperado; efectivo sí', () => {
  const venta = medio => [{ tipo: 'credito', total: 552600,
    creditos: [{ financiera: 'addi', cuota_inicial: 96600, valor_esperado_financiera: 600000,
      medio_pago_complementario: medio }], venta_items: [] }];
  assert.equal(caja.resumirVentas(venta('tarjeta')).totalIniciales, 0);
  assert.equal(caja.resumirVentas(venta('efectivo')).totalIniciales, 96600);
});
