(function (global) {
  'use strict';

  // Tarifas verificadas contra las tres operaciones del reporte original de Addi.
  const TARIFA_INTERMEDIACION = 0.075;
  const IVA_TARIFA = 0.19;
  const DIAS_PAGO = 15;

  function centavos(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0 || Math.abs(Math.round(numero * 100) - numero * 100) > 0.000001) {
      throw new Error('Ingresa un valor de crédito positivo, con máximo dos decimales.');
    }
    return Math.round(numero * 100);
  }

  function calcular(valorCredito) {
    const bruto = centavos(valorCredito);
    const tarifa = Math.round(bruto * TARIFA_INTERMEDIACION);
    const iva = Math.round(tarifa * IVA_TARIFA);
    return Object.freeze({
      credito: bruto / 100,
      tarifa: tarifa / 100,
      ivaTarifa: iva / 100,
      netoEstimado: (bruto - tarifa - iva) / 100,
      diasPago: DIAS_PAGO,
    });
  }

  global.CreditekAddiLiquidacion = Object.freeze({
    TARIFA_INTERMEDIACION,
    IVA_TARIFA,
    DIAS_PAGO,
    calcular,
  });
})(typeof window !== 'undefined' ? window : globalThis);
