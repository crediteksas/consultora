(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.CreditekTesoreriaTercerizacion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const B2B_TYPES = new Set(['pago_proveedor','otra_obligacion_b2b']);
  const OUTSOURCING_TYPES = new Set(['pago_ejecutivo','gasto_administrativo','gasto_financiero','impuesto','retiro_socios','otro_movimiento_autorizado']);
  const amount = value => Math.round(Number(value || 0) * 100) / 100;

  function saldosActualesTiendas(movimientos) {
    const saldos = new Map();
    for (const movimiento of movimientos) {
      if (!movimiento.tienda_codigo || !['cargo', 'abono'].includes(movimiento.tipo)
        || movimiento.monto == null || movimiento.monto === '' || !Number.isFinite(Number(movimiento.monto))) {
        throw new Error('Movimiento de cartera inválido');
      }
      const centavos = Math.round(Number(movimiento.monto) * 100);
      const saldo = (saldos.get(movimiento.tienda_codigo) || 0)
        + (movimiento.tipo === 'cargo' ? centavos : -centavos);
      if (!Number.isSafeInteger(saldo)) throw new Error('Saldo fuera de rango');
      saldos.set(movimiento.tienda_codigo, saldo);
    }
    return new Map([...saldos].map(([codigo, centavos]) => [codigo, centavos / 100]));
  }

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
  function diaBogota(value = new Date()) {
    const d = new Date(value);
    if (!value || !Number.isFinite(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  function filtrarMovimientosTiendas(items, { tienda = '', desde = '', hasta = '', plataforma = '', imei = '', valor = '' } = {}) {
    const rangoInvalido = Boolean(desde && hasta && desde > hasta);
    return { rangoInvalido, rows: rangoInvalido ? [] : items.filter(x => {
      const dia = diaBogota(x.created_at);
      const importe = x.compensation_value ?? (x.direction === 'debit' ? -Number(x.amount) : x.amount);
      return (!tienda || x.store_code === tienda) && (!plataforma || x.platform === plataforma)
        && (!desde || (dia && dia >= desde)) && (!hasta || (dia && dia <= hasta))
        && (!imei || String(x.imei || '').includes(imei.trim()))
        && (valor === '' || (Number.isFinite(Number(valor)) && Number(importe) === Number(valor)));
    }) };
  }
  function loteAutorizado(p) {
    const l=p.liquidations||{};
    return Boolean((l.frozen_at&&l.approved_at) ||
      (l.estado==='programada'&&!l.approved_at&&p.estado==='programado'&&p.authorized_by&&p.authorized_at));
  }
  function pagoAutorizado(p) {
    return Boolean(p.authorized_by && p.authorized_at && !p.recovery_review_required);
  }
  function paymentReadiness(p) {
    if (p.historico_inicial || p.estado === 'conciliado') return {ready:false,reason:'Pago cerrado'};
    if (p.estado === 'pagado') return {ready:!p.soporte_path,reason:p.soporte_path ? 'Pago con soporte registrado' : '',supportOnly:true};
    if (!loteAutorizado(p))
      return {ready:false,reason:`Falta aprobar el lote ${p.platform_snapshot || ''} · corte ${p.cutoff_snapshot || 'sin fecha'}`};
    if (!['pendiente','programado'].includes(p.estado))
      return {ready:false,reason:'La orden no está pendiente de pago'};
    if (!pagoAutorizado(p))
      return {ready:false,reason:'Falta autorización individual del pago por Gerencia'};
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
  function paymentBusinessName(payment, origins = []) {
    const snapshot = payment.business_snapshot || {};
    return snapshot.name || snapshot.nombre || origins.find(origin => origin.codigo === payment.origin_code)?.nombre || payment.origin_code || '';
  }
  function paymentPaidDate(payment) {
    return payment.fecha_pagada || (payment.historico_inicial ? payment.cutoff_snapshot : null) || null;
  }
  function paymentHistoryRows(payments, { from = '', to = '', origins = [] } = {}) {
    if (from && to && from > to) return [];
    return payments
      .filter(payment => ['pagado','conciliado'].includes(payment.estado) || payment.historico_inicial)
      .map(payment => ({
        payment,
        paidDate:paymentPaidDate(payment),
        business:paymentBusinessName(payment, origins),
        holder:payment.bank_snapshot?.holder || payment.beneficiary_name || '',
        identification:payment.bank_snapshot?.holder_identification || payment.beneficiary_identification || '',
      }))
      .filter(row => {
        const paid = String(row.paidDate || '').slice(0, 10);
        return paid && (!from || paid >= from) && (!to || paid <= to);
      })
      .sort((a, b) => String(b.paidDate).localeCompare(String(a.paidDate)) || String(a.holder).localeCompare(String(b.holder), 'es'));
  }
  function paymentHistorySummary(rows) {
    const groups = new Map();
    for (const row of rows) {
      const key = row.identification || row.holder;
      const current = groups.get(key) || { identification:row.identification, holder:row.holder, businesses:new Set(), amount:0, payments:0 };
      if (row.business) current.businesses.add(row.business);
      current.amount = amount(current.amount + Number(row.payment.valor || 0));
      current.payments += 1;
      groups.set(key, current);
    }
    return [...groups.values()].map(item => ({ ...item, businesses:[...item.businesses].sort((a,b)=>a.localeCompare(b,'es')) }))
      .sort((a,b)=>b.amount-a.amount || a.holder.localeCompare(b.holder,'es'));
  }
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\s\t]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  }
  function paymentHistoryCsv(rows) {
    const header = ['Fecha de pago','Negocio relacionado','Titular o razón social','CC o NIT','Banco','Tipo de cuenta','Cuenta terminada en','Plataforma','Corte','Concepto','Valor girado','Orden KORA','Liquidación KORA','Estado','Soporte','Origen del registro'];
    const lines = rows.map(({payment,paidDate,business,holder,identification}) => {
      const bank = payment.bank_snapshot || {}, account = String(bank.account_number || '');
      return [String(paidDate).slice(0,10),business,holder,identification,bank.bank,bank.account_type,account ? account.slice(-4) : '',payment.platform_snapshot,String(payment.cutoff_snapshot || '').slice(0,10),payment.concept,amount(payment.valor),payment.id,payment.liquidation_id,payment.estado,payment.soporte_path,payment.historico_inicial ? 'Histórico inicial' : 'Operación KORA'].map(csvCell).join(';');
    });
    return `\uFEFF${[header.map(csvCell).join(';'),...lines].join('\r\n')}`;
  }
  return { diaBogota, filtrarMovimientosTiendas, saldosActualesTiendas, loteAutorizado, pagoAutorizado, paymentReadiness, paymentGroupKey, paymentBusinessName, paymentPaidDate, paymentHistoryRows, paymentHistorySummary, paymentHistoryCsv, destinoRetail, destinoAliado, aplicarCompensacion, validarMovimiento, filtrarCompensaciones, tiendasCompensaciones, B2B_TYPES, OUTSOURCING_TYPES };
});
