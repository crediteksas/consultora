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

// Ejecuta las funciones reales de presentación, sin sesión ni escrituras de ventas.
function pantallaVenta({ articulo = 110000, credito = 110000, financiera = 'addi', medio = 'efectivo' } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const campo = { style: {} };
      elements.set(id, { value: '', textContent: '', innerHTML: '', hidden: false, style: {}, closest: () => campo });
    }
    return elements.get(id);
  };
  element('creditoFinanciera').value = financiera;
  element('creditoValorEsperado').value = credito === null ? '' : String(credito);
  element('addiMedio').value = medio;
  const venta = { tipo: 'credito', items: [{ nombreProducto: 'Artículo de prueba', precio_venta: articulo, cantidad: 1 }],
    credito: { financiera, valor_esperado: credito, cuota_inicial: 0, medio_pago_complementario: medio, plazo_meses: 12 } };
  const ui = vm.createContext({
    window: { CreditekAddiLiquidacion: addi }, venta,
    document: { getElementById: element },
    ventasUtilidad: { calcular: () => ({ utilidad: null }) },
    escapeHtml: value => String(value),
  });
  const preview = sale.slice(sale.indexOf('function actualizarVistaAddi()'), sale.indexOf("document.getElementById('creditoFinanciera').addEventListener"));
  const summary = sale.slice(sale.indexOf('function renderResumenFinal()'), sale.indexOf('async function confirmarVenta()'));
  vm.runInContext(sale.match(/function fmtCOP\(n\) \{[^\n]+/)[0] + '\n' + preview + summary, ui);
  return { element, venta, ui };
}

const datosInternos = /\b(?:IVA|tarifa|comisi[oó]n|Creditek|consignar[aá]|d[ií]as calendario)\b|%/i;

test('el aviso Addi de tienda solo muestra crédito, pago a tienda y diferencia del artículo', () => {
  for (const [articulo, credito, pago, diferencia] of [[110000,110000,83600,26400], [552600,600000,456000,96600], [456000,600000,456000,0]]) {
    for (const medio of ['efectivo', 'tarjeta', 'transferencia', 'otro']) {
      const f = pantallaVenta({ articulo, credito, medio });
      vm.runInContext('actualizarVistaAddi()', f.ui);
      const aviso = f.element('addiLiquidacionVista').textContent.replace(/\s+/g, ' ');
      const pesos = valor => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 }).format(valor).replace(/\s+/g, ' ');
      assert.ok(aviso.includes(`Crédito Addi: ${pesos(credito)}`));
      assert.ok(aviso.includes(`La tienda recibirá por ese crédito ${pesos(pago)}`));
      assert.ok(aviso.includes(`Debe cobrar al cliente ${pesos(diferencia)}`));
      assert.doesNotMatch(aviso, datosInternos);
      assert.equal(f.element('addiComplemento').value, String(diferencia));
      assert.equal(f.element('creditoInicial').value, '0');
      assert.equal(f.element('addiMedioGrupo').style.display, diferencia > 0 ? '' : 'none');
      assert.equal(f.element('addiReferenciaGrupo').style.display, diferencia > 0 && medio !== 'efectivo' ? '' : 'none');
    }
  }
});

test('el resumen final Addi tampoco expone tarifa, IVA, porcentaje ni consignación a Creditek', () => {
  const f = pantallaVenta({ articulo:552600, credito:600000, medio:'tarjeta' });
  f.venta.credito.cuota_inicial = 96600;
  vm.runInContext('renderResumenFinal()', f.ui);
  const resumen = f.element('resumenFinal').innerHTML.replace(/\s+/g, ' ');
  assert.match(resumen, /Valor bruto del crédito Addi<\/span><span>\$ 600\.000/);
  assert.match(resumen, /Pago pactado a la tienda por el crédito<\/strong><strong>\$ 456\.000/);
  assert.match(resumen, /Cobrado al cliente \(tarjeta\)<\/span><span>\$ 96\.600/);
  assert.match(resumen, /Total<\/span><span>\$ 552\.600/);
  assert.doesNotMatch(resumen, datosInternos);
  assert.doesNotMatch(resumen, /Cuota inicial/);
  assert.doesNotMatch(sale, /\b(?:resultado|addi)\.(?:tarifa|ivaTarifa|netoEstimado|diasPago|porcentajeTienda)\b/);
});

test('mantiene el aviso de ingreso del crédito y las otras financieras sin cambios', () => {
  const vacio = pantallaVenta({ credito:null });
  vm.runInContext('actualizarVistaAddi()', vacio.ui);
  assert.match(vacio.element('addiLiquidacionVista').textContent, /Ingresa el valor bruto del crédito Addi/);
  assert.doesNotMatch(vacio.element('addiLiquidacionVista').textContent, datosInternos);
  for (const financiera of ['payjoy', 'krediya']) {
    const f = pantallaVenta({ financiera });
    vm.runInContext('actualizarVistaAddi(); renderResumenFinal()', f.ui);
    assert.equal(f.element('addiLiquidacionVista').hidden, true);
    assert.equal(f.element('creditoInicial').readOnly, false);
    assert.equal(f.element('creditoValorEsperadoLabel').textContent, 'Valor esperado de la financiera');
    assert.match(f.element('resumenFinal').innerHTML, /Cuota inicial/);
    assert.match(f.element('resumenFinal').innerHTML, /12 cuotas/);
    assert.doesNotMatch(f.element('resumenFinal').innerHTML, /Pago pactado a la tienda por el crédito/);
  }
});
