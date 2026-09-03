(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.CreditekAliadosUX = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const moneyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0, minimumFractionDigits: 0,
  });
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const auditDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const states = {
    pendiente:'Pendiente',programado:'Programado',pagado:'Pagado',conciliado:'Conciliado',rechazado:'Rechazado',anulado:'Anulado',
    importada:'Importada',validada:'Validada',con_novedades:'Con novedades',calculada:'Calculada',revisada:'En revisión',aprobada:'Aprobada',programada:'Programada',pagada:'Pagada',conciliada:'Conciliada',cerrada:'Cerrada',
    propia:'Operación Retail',aliado:'Operación Aliados',pago_tienda:'Pago Operación Retail',pago_aliado:'Pago Operación Aliados',
  };
  const actions = {
    aliados_liquidacion_importada:['Archivo de liquidación importado','Importada'],
    aliados_liquidacion_validada:['Liquidación validada','Validada'],
    aliados_liquidacion_calculada:['Liquidación calculada','Calculada'],
    aliados_liquidacion_revisada:['Liquidación revisada por Maite','En revisión'],
    aliados_liquidacion_aprobada:['Liquidación aprobada por Óscar','Aprobada'],
    aliados_pago_programado:['Pago programado','Programado'],
    aliados_pago_pagado:['Pago registrado','Pagado'],
    aliados_pago_conciliado:['Pago conciliado','Conciliado'],
    aliados_bono_manual:['Bono agregado','Registrado'],
    aliados_novedad_resuelta:['Novedad resuelta','Resuelta'],
  };

  function formatoCOP(value) { return moneyFormatter.format(Number(value || 0)).replace(/\u00a0/g,' '); }
  function dateValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const raw=String(value).trim();
    const dateOnly=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    // PostgreSQL `date` has no timezone.  Parsing YYYY-MM-DD directly makes
    // JavaScript assume UTC midnight, which displays as the previous day in
    // Colombia.  Noon UTC keeps the same calendar day in America/Bogota.
    const date=dateOnly
      ? new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00.000Z`)
      : new Date(value);
    return Number.isNaN(date.getTime())?null:date;
  }
  function fechaCorta(value) { const date=dateValue(value); return date?dateFormatter.format(date):'—'; }
  function fechaAuditoria(value) { const date=dateValue(value); return date?auditDateFormatter.format(date).replace(',', ''):'—'; }
  function traducirEstado(value) { return states[value] || String(value || '—').replaceAll('_',' '); }
  function cuentaTerminadaEn(value) { const digits=String(value || '').replace(/\D/g,''); return digits ? `•••• ${digits.slice(-4).padStart(4,'•')}` : '—'; }
  function calcularTiendaPropia(input) {
    const plataforma=String(input.plataforma||'').toLowerCase();
    const inicialPlataforma=Number(input.inicialPlataforma||0),inicialKora=Number(input.inicialKora||0),pagamos=Number(input.pagamos||0),costo=Number(input.costo||0);
    const diferencia=plataforma==='payjoy'?inicialKora-inicialPlataforma:inicialPlataforma-inicialKora;
    const totalRealTienda=plataforma==='payjoy'?Number(input.montoCredito||input.montoTotal||0)-inicialKora:Number(input.montoTotal||0)-inicialKora;
    const pagoNetoTienda=plataforma==='payjoy'?pagamos-inicialKora-diferencia:pagamos-diferencia-inicialPlataforma;
    return { diferencia,totalRealTienda,pagoNetoTienda,utilidadCreditek:Number(input.montoTotal||input.montoCredito||0)-(plataforma==='payjoy'?inicialKora:0)-pagoNetoTienda,utilidadTienda:pagamos-costo };
  }
  function describirAuditoria(item) {
    const [accion,resultado]=actions[item.accion] || ['Acción administrativa','Registrada'];
    const role=item.actorCapacidad==='aprobador'?'Aprobador':item.actorCapacidad==='revisor'?'Revisión':null;
    let descripcion='Se registró una acción sobre la liquidación';
    if (item.detalle?.anterior && item.detalle?.nuevo) descripcion=`La liquidación pasó de ${traducirEstado(item.detalle.anterior)} a ${traducirEstado(item.detalle.nuevo)}`;
    if (item.accion==='aliados_liquidacion_calculada') descripcion=`Se calculó un total a pagar de ${formatoCOP(item.detalle?.total_pagar)}`;
    if (item.accion==='aliados_liquidacion_aprobada') descripcion=`${item.actorNombre||'Óscar'} aprobó la liquidación`;
    return { accion,realizadaPor:`${item.actorNombre||'Usuario'}${role?` — ${role}`:''}`,descripcion,resultado };
  }
  function detalleTecnico(value) { return { abierto:false,valor:value }; }

  return { formatoCOP,fechaCorta,fechaAuditoria,traducirEstado,cuentaTerminadaEn,calcularTiendaPropia,describirAuditoria,detalleTecnico };
});
