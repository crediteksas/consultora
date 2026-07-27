(function (global) {
  'use strict';

  function numero(valor) {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : 0;
  }

  function normalizarDetalle(datos) {
    const facturaOriginal = datos?.factura || {};
    const lineas = (datos?.lineas || []).map(linea => {
      const cantidad = numero(linea.cantidad);
      const costoUnitario = numero(linea.costo_unitario);
      return {
        ...linea,
        cantidad,
        costo_unitario: costoUnitario,
        precio_tienda: numero(linea.precio_tienda),
        subtotal: linea.subtotal == null
          ? cantidad * costoUnitario
          : numero(linea.subtotal),
      };
    });
    const pagos = (datos?.pagos || []).map(pago => ({
      ...pago,
      monto: numero(pago.monto),
    }));

    return {
      factura: {
        ...facturaOriginal,
        total: numero(facturaOriginal.total),
        saldo: numero(facturaOriginal.saldo),
      },
      lineas,
      pagos,
      totalLineas: lineas.reduce((total, linea) => total + linea.subtotal, 0),
      totalPagado: pagos.reduce((total, pago) => total + pago.monto, 0),
    };
  }

  function validarPago({ monto, saldo, fecha }) {
    const montoNumero = numero(monto);
    const saldoNumero = numero(saldo);
    if (montoNumero <= 0) throw new Error('El pago debe ser mayor que cero');
    if (montoNumero > saldoNumero) throw new Error('El pago supera el saldo pendiente');
    if (!fecha) throw new Error('La fecha del pago es requerida');
    return { monto: montoNumero, fecha };
  }

  function normalizarFechaLocal(valor) {
    return /^\d{4}-\d{2}-\d{2}$/.test(valor || '')
      ? `${valor}T00:00:00`
      : valor;
  }

  function fechaCalendarioLocal(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  global.CreditekProveedoresDomain = Object.freeze({
    normalizarDetalle,
    validarPago,
    normalizarFechaLocal,
    fechaCalendarioLocal,
  });
})(typeof window !== 'undefined' ? window : globalThis);
