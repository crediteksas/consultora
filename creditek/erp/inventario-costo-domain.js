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

  function calcularCostoVentaAccesorio({
    cantidad,
    precioVentaUnitario,
    costoPromedioUnitario,
  }) {
    const unidades = numeroNoNegativo(cantidad);
    const precio = numeroNoNegativo(precioVentaUnitario);
    const costo = numeroNoNegativo(costoPromedioUnitario);
    if (unidades === null || precio === null || costo === null) return null;
    const costoTotal = unidades * costo;
    return {
      costoCongeladoUnitario: costo,
      costoTotal,
      utilidad: (unidades * precio) - costoTotal,
    };
  }

  global.CreditekInventarioCosto = Object.freeze({
    calcularPromedioPonderado,
    calcularCostoVentaAccesorio,
  });
})(typeof window !== 'undefined' ? window : globalThis);
