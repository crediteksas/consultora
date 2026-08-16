(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.CreditekTesoreriaTercerizacion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const B2B_TYPES = new Set(['pago_proveedor','otra_obligacion_b2b']);
  const OUTSOURCING_TYPES = new Set(['pago_ejecutivo','gasto_administrativo','gasto_financiero','impuesto','retiro_socios','otro_movimiento_autorizado']);
  const amount = value => Math.round(Number(value || 0) * 100) / 100;

  function destinoRetail(input) {
    const recibidoPlataforma = amount(input.valorCredito);
    const derechoRetail = amount(input.valorComercial * input.porcentaje);
    const compensacionB2B = amount(derechoRetail - input.inicial);
    return { recibidoPlataforma, derechoRetail, compensacionB2B, comisionTercerizacion:amount(input.valorComercial - derechoRetail) };
  }
  function destinoAliado(input) {
    const recibidoPlataforma = amount(input.valorCredito);
    const derechoAliado = amount(input.valorComercial * input.porcentaje);
    const pagoNetoAliado = amount(derechoAliado - input.inicial);
    return { recibidoPlataforma, derechoAliado, pagoNetoAliado, comisionTercerizacion:amount(input.valorComercial - derechoAliado) };
  }
  function aplicarCompensacion({ deuda, compensacion }) {
    const saldoAntes = amount(deuda);
    const saldoDespues = amount(saldoAntes - compensacion);
    return { saldoAntes, saldoDespues, saldoFavor:Math.max(0,amount(-saldoDespues)) };
  }
  function validarMovimiento({ unidad, tipo, valor, saldo }) {
    const allowed = unidad === 'b2b' ? B2B_TYPES.has(tipo) : unidad === 'tercerizacion' ? OUTSOURCING_TYPES.has(tipo) : false;
    if (!allowed) return { ok:false,error:'tipo_unidad_invalido' };
    if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) return { ok:false,error:'valor_invalido' };
    if (Number(valor) > Number(saldo || 0)) return { ok:false,error:'saldo_insuficiente' };
    return { ok:true };
  }
  return { destinoRetail, destinoAliado, aplicarCompensacion, validarMovimiento, B2B_TYPES, OUTSOURCING_TYPES };
});
