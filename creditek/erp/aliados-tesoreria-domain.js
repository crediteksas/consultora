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
  // Fechas de corte (DATE), no timestamps ni fecha de registro del abono.
  // Sólo selecciona registros: nunca recalcula cartera ni modifica movimientos.
  function filtrarCompensaciones(items, { tienda = '', desde = '', hasta = '' } = {}) {
    const rangoInvalido = Boolean(desde && hasta && desde > hasta);
    const rows = rangoInvalido ? [] : items.filter(item => {
      const corte = String(item.cutoff_date || '').slice(0, 10);
      return (!tienda || item.store_code === tienda)
        && (!desde || (corte && corte >= desde))
        && (!hasta || (corte && corte <= hasta));
    });
    return { rows, rangoInvalido };
  }
  function tiendasCompensaciones(items, origins = []) {
    const nombres = new Map(origins.map(origin => [origin.codigo, origin.nombre]));
    return [...new Set(items.map(item => item.store_code).filter(Boolean))]
      .map(codigo => ({ codigo, nombre: nombres.get(codigo) || codigo }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  }
  function loteAutorizado(p) {
    const l=p.liquidations||{};
    return Boolean((l.frozen_at&&l.approved_at) ||
      (l.estado==='programada'&&!l.approved_at&&p.estado==='programado'&&p.authorized_by&&p.authorized_at));
  }
  function paymentReadiness(p) {
    if (p.historico_inicial || p.estado === 'conciliado') return {ready:false,reason:'Pago cerrado'};
    if (p.estado === 'pagado') return {ready:!p.soporte_path,reason:p.soporte_path ? 'Pago con soporte registrado' : '',supportOnly:true};
    if (!loteAutorizado(p))
      return {ready:false,reason:`Falta aprobar el lote ${p.platform_snapshot || ''} · corte ${p.cutoff_snapshot || 'sin fecha'}`};
    if (!['pendiente','programado'].includes(p.estado))
      return {ready:false,reason:'La orden no está pendiente de pago'};
    const bank = p.bank_snapshot || {};
    if (!(Number(p.valor)>0) || !bank.bank || !bank.account_type || !bank.account_number || !bank.holder || !bank.holder_identification)
      return {ready:false,reason:'Faltan datos completos de la orden o su cuenta'};
    return {ready:true,reason:'',supportOnly:false};
  }
  function paymentGroupKey(p) {
    const eligibility = paymentReadiness(p), b = p.bank_snapshot || {};
    if (!eligibility.ready || eligibility.supportOnly) return p.id;
    return JSON.stringify([p.beneficiary_id,b.bank,b.account_type,b.account_number,b.holder,b.holder_identification,p.estado]);
  }
  return { loteAutorizado, paymentReadiness, paymentGroupKey, destinoRetail, destinoAliado, aplicarCompensacion, validarMovimiento, filtrarCompensaciones, tiendasCompensaciones, B2B_TYPES, OUTSOURCING_TYPES };
});
