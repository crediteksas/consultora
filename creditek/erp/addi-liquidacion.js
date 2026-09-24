(function (global) {
  'use strict';

  // Tarifas verificadas contra las tres operaciones del reporte original de Addi.
  const TARIFA_INTERMEDIACION = 0.075;
  const IVA_TARIFA = 0.19;
  const DIAS_PAGO = 15;
  const PORCENTAJE_TIENDA_PROPIA = 0.76;
  const PORCENTAJE_TIENDA_ALIADA = 0.77;

  function centavos(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0 || Math.abs(Math.round(numero * 100) - numero * 100) > 0.000001) {
      throw new Error('Ingresa un valor de crédito positivo, con máximo dos decimales.');
    }
    return Math.round(numero * 100);
  }

  function pesosSinCentavos(valorCentavos) {
    return Math.floor(valorCentavos / 100) + (valorCentavos % 100 > 50 ? 1 : 0);
  }

  function calcular(valorCredito, tipoTienda = 'propia') {
    const bruto = centavos(valorCredito);
    const tarifa = Math.round(bruto * TARIFA_INTERMEDIACION);
    const iva = Math.round(tarifa * IVA_TARIFA);
    const porcentajeTienda = tipoTienda === 'aliada' ? PORCENTAJE_TIENDA_ALIADA : PORCENTAJE_TIENDA_PROPIA;
    const pagoTienda = pesosSinCentavos(Math.round(bruto * porcentajeTienda));
    return Object.freeze({
      credito: bruto / 100,
      tarifa: tarifa / 100,
      ivaTarifa: iva / 100,
      netoEstimado: pesosSinCentavos(bruto - tarifa - iva),
      pagoTienda,
      porcentajeTienda,
      diasPago: DIAS_PAGO,
    });
  }

  global.CreditekAddiLiquidacion = Object.freeze({
    TARIFA_INTERMEDIACION,
    IVA_TARIFA,
    DIAS_PAGO,
    PORCENTAJE_TIENDA_PROPIA,
    PORCENTAJE_TIENDA_ALIADA,
    calcular,
  });
})(typeof window !== 'undefined' ? window : globalThis);
