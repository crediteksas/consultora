(function (root) {
  'use strict';
  function calcular({ total, base, tarifa = 2.5 }) {
    const importe = Number(total), antesIVA = base === '' || base == null ? NaN : Number(base);
    if (!Number.isFinite(importe) || importe < 0 || !Number.isFinite(antesIVA) || antesIVA <= 0 || antesIVA > importe
        || Math.abs(antesIVA * 100 - Math.round(antesIVA * 100)) > 0.00001 || Number(tarifa) !== 2.5) {
      throw new Error('Confirma la base antes de IVA de la factura.');
    }
    const valor = Math.round(Math.round(antesIVA * 100) * Number(tarifa) / 100) / 100;
    return { base: antesIVA, tarifa: Number(tarifa), valor, neto: Math.round((importe - valor) * 100) / 100 };
  }
  root.CreditekRetencionAutomatica = { calcular };
})(typeof window === 'undefined' ? globalThis : window);
