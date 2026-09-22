(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CreditekReportesHistorico = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function serie2026(ventas, historicoMensual, mesActual) {
    const operativo = {};
    const historico = {};
    for (const venta of ventas || []) {
      const mes = Number(String(venta.fecha || '').slice(5, 7));
      if (mes >= 1 && mes <= 12) operativo[mes] = (operativo[mes] || 0) + Number(venta.total || 0);
    }
    for (const fila of historicoMensual || []) {
      if (Number(fila.anio) !== 2026) continue;
      const mes = Number(fila.mes);
      if (mes >= 1 && mes <= 12) historico[mes] = (historico[mes] || 0) + Number(fila.venta_total || 0);
    }
    return Array.from({ length: 12 }, (_, indice) => {
      const mes = indice + 1;
      if (mes > mesActual) return { mes, total: null, fuente: 'futuro' };
      if (Object.hasOwn(operativo, mes)) return { mes, total: operativo[mes], fuente: 'ventas operativas' };
      if (Object.hasOwn(historico, mes)) return { mes, total: historico[mes], fuente: 'histórico mensual' };
      return { mes, total: null, fuente: 'sin fuente cargada' };
    });
  }

  return Object.freeze({ serie2026 });
});
