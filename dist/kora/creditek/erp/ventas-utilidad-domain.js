(function (global) {
  'use strict';

  function numero(valor) {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : null;
  }

  function calcular({ precioVenta, costoRemisionCongelado, cantidad = 1 }) {
    const precio = numero(precioVenta);
    const costo = numero(costoRemisionCongelado);
    const unidades = numero(cantidad);
    if (precio === null || precio < 0 || costo === null || costo < 0
        || unidades === null || unidades <= 0) {
      return {
        totalVenta: null,
        totalCostoRemision: null,
        utilidad: null,
      };
    }
    return {
      totalVenta: precio * unidades,
      totalCostoRemision: costo * unidades,
      utilidad: (precio - costo) * unidades,
    };
  }

  global.CreditekVentasUtilidad = Object.freeze({ calcular });
})(typeof window !== 'undefined' ? window : globalThis);
