(function (global) {
  'use strict';

  function numero(valor) {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : 0;
  }

  function calcularEfectivoEsperado({
    apertura,
    ventasContado,
    financiadoRecibido,
    iniciales,
    otrosIngresos,
    gastosEfectivo,
    salidasExplicitas,
  }) {
    return numero(apertura)
      + numero(ventasContado)
      + numero(financiadoRecibido)
      + numero(iniciales)
      + numero(otrosIngresos)
      - numero(gastosEfectivo)
      - numero(salidasExplicitas);
  }

  function clasificarVentaCredito({ totalVenta, cuotaInicial, saldoPendiente }) {
    const total = numero(totalVenta);
    const recibido = numero(cuotaInicial);
    const porCobrar = numero(saldoPendiente);
    if (total < 0 || recibido < 0 || porCobrar < 0
        || Math.abs(total - recibido - porCobrar) > 0.01) {
      throw new Error('El dinero recibido y el saldo por cobrar no concilian con el total de venta.');
    }
    return {
      totalVenta: total,
      dineroRecibido: recibido,
      saldoPorCobrar: porCobrar,
    };
  }

  function validarCierre({ efectivoContado, efectivoEsperado }) {
    const contado = Number(efectivoContado);
    const esperado = Number(efectivoEsperado);

    if (!Number.isFinite(contado) || !Number.isFinite(esperado) || contado < 0) {
      return {
        ok: false,
        diferencia: null,
        mensaje: 'El efectivo contado y esperado deben ser valores válidos.',
      };
    }

    const diferencia = contado - esperado;
    if (diferencia !== 0) {
      return {
        ok: false,
        diferencia,
        mensaje: `La caja tiene una diferencia de ${diferencia}.`,
      };
    }

    return { ok: true, diferencia: 0, mensaje: '' };
  }

  global.CreditekCajaPiloto = Object.freeze({
    calcularEfectivoEsperado,
    clasificarVentaCredito,
    validarCierre,
  });
})(typeof window !== 'undefined' ? window : globalThis);
