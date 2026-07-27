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

  global.CreditekCajaPiloto = Object.freeze({
    calcularEfectivoEsperado,
  });
})(typeof window !== 'undefined' ? window : globalThis);
