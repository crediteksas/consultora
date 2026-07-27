(function (global) {
  'use strict';

  function numeroNoNegativo(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero >= 0 ? numero : null;
  }

  function calcularPromedioPonderado({
    stockAnterior,
    costoAnterior,
    cantidadEntrada,
    costoEntrada,
  }) {
    const stock = numeroNoNegativo(stockAnterior);
    const costo = numeroNoNegativo(costoAnterior);
    const entrada = numeroNoNegativo(cantidadEntrada);
    const costoNuevo = numeroNoNegativo(costoEntrada);
    if (stock === null || costo === null || entrada === null || costoNuevo === null) {
      return null;
    }
    const cantidadTotal = stock + entrada;
    if (cantidadTotal === 0) return null;
    return ((stock * costo) + (entrada * costoNuevo)) / cantidadTotal;
  }

  global.CreditekInventarioCosto = Object.freeze({
    calcularPromedioPonderado,
  });
})(typeof window !== 'undefined' ? window : globalThis);
