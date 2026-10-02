(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KoraPresupuestosRetailCartas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const METRICAS = [
    ['meta_venta_total', 'Ventas', true],
    ['meta_creditos', 'Créditos', false],
    ['meta_uds_cel', 'Celulares de contado', false],
    ['meta_uds_acc', 'Accesorios', false],
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const pesos = value => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(Number(value) || 0);
  const numero = value => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value) || 0);

  function tiendasElegidas(tiendas, codigo) {
    const activas = Array.isArray(tiendas) ? tiendas.filter(t => t.codigo && t.nombre) : [];
    if (!activas.length) throw new Error('No hay tiendas Retail activas para este presupuesto.');
    if (codigo === '__todas__') return activas;
    const tienda = activas.find(t => t.codigo === codigo);
    if (!tienda) throw new Error('Selecciona una tienda o Todas las tiendas activas.');
    return [tienda];
  }

  function resumen(tienda, mes, filas, administradores = []) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Selecciona un mes válido.');
    const [anio, numeroMes] = mes.split('-').map(Number);
    const diasMes = new Date(anio, numeroMes, 0).getDate();
    const porFecha = new Map();
    for (const fila of filas || []) {
      if (fila.tienda_codigo !== tienda.codigo || !String(fila.fecha || '').startsWith(mes + '-')) continue;
      if (porFecha.has(fila.fecha)) throw new Error('Hay fechas duplicadas en el presupuesto de ' + tienda.nombre);
      porFecha.set(fila.fecha, fila);
    }
    const dias = Array.from({ length: diasMes }, (_, index) => {
      const fecha = mes + '-' + String(index + 1).padStart(2, '0');
      return { fecha, ...(porFecha.get(fecha) || {}) };
    });
    const totales = Object.fromEntries(METRICAS.map(([campo]) =>
      [campo, dias.reduce((suma, dia) => suma + (Number(dia[campo]) || 0), 0)]));
    const diasRegistrados = dias.filter(d => porFecha.has(d.fecha)).length;
    return {
      tienda, mes, dias, totales, diasMes, diasRegistrados,
      completo: diasRegistrados === diasMes,
      administradores: administradores.filter(a => a.tienda_codigo === tienda.codigo).map(a => a.nombre),
    };
  }

  function premioPayload(carta, valores) {
    const importe = valor => {
      if (valor === '' || valor == null) return null;
      const n = Number(valor);
      if (!Number.isFinite(n) || n < 0 || n > 1000000000 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001)
        throw new Error('Ingresa premios válidos en pesos, con máximo dos decimales.');
      return n;
    };
    const estrategia = String(valores.estrategia || '').trim();
    if (!estrategia || estrategia.length > 120) throw new Error('Escribe un nombre de estrategia de hasta 120 caracteres.');
    const tres = importe(valores.tres), cuatro = importe(valores.cuatro);
    if (valores.activo && tres === null && cuatro === null) throw new Error('Ingresa al menos un premio para mostrar la estrategia.');
    return { p_tienda: carta.tienda.codigo, p_mes: carta.mes + '-01', p_activo: !!valores.activo,
      p_estrategia: estrategia, p_premio_tres: tres, p_premio_cuatro: cuatro, p_revision: carta.premio?.revision || 0 };
  }

  function cartaHtml(carta) {
    if (!carta.completo) throw new Error('No se puede emitir una carta con días sin presupuesto registrado.');
    const mesLabel = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(carta.mes + '-01T12:00:00Z'));
    const administradores = carta.administradores.length ? carta.administradores.map(esc).join(', ') : 'Administración de la tienda';
    const premio = carta.premio;
    const importePremio = valor => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:2 }).format(Number(valor));
    const nivel = (cantidad,valor) => valor == null ? '' : `<div class="nivel"><span>${cantidad === 3 ? 'Si cumples exactamente 3 de las 4 metas' : 'Si cumples las 4 metas'}</span><strong>${importePremio(valor)}</strong></div>`;
    const estrategia = premio?.activo ? `<section class="premio"><div class="eyebrow">PREMIO POR CUMPLIMIENTO</div><h3>${esc(premio.estrategia)}</h3><div class="niveles">${nivel(3,premio.premio_tres)}${nivel(4,premio.premio_cuatro)}</div><p>Las metas son ventas, créditos, celulares de contado y accesorios. Cada meta se cumple al alcanzar el 100% del objetivo mensual. Aplica el premio del nivel alcanzado; los premios no se suman.</p></section>` : '';
    const aviso = carta.accesoriosPendientes ? '<p class="aviso">La meta de accesorios está pendiente de verificar. Esta carta requiere completar ese dato antes de su entrega.</p>' : '';
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Presupuesto - ${esc(carta.tienda.nombre)} - ${esc(carta.mes)}</title><style>
@page{size:A4;margin:13mm}*{box-sizing:border-box}body{margin:0 auto;padding:28px 34px;font-family:Arial,Helvetica,sans-serif;color:#112640;max-width:794px;background:white;font-size:13px;line-height:1.6}
.print-action{background:#102641;color:white;border:0;border-radius:8px;padding:10px 16px;font-weight:bold;cursor:pointer;margin-bottom:24px}.header{display:flex;justify-content:space-between;align-items:center;border-top:5px solid #02bbc1;border-bottom:1px solid #dce7eb;padding:25px 0}.header img{width:145px}.header div{text-align:right;font-size:10px;color:#627383}.eyebrow{font-size:10px;letter-spacing:1.5px;color:#008a91;font-weight:bold;margin:24px 0 6px}h1{font-size:31px;letter-spacing:-.5px;line-height:1.15;margin:0 0 8px}h2{font-size:18px;font-weight:400;color:#5b6b7b;margin:0 0 18px}.recipient{border-left:3px solid #06bbc2;padding-left:14px;margin:0 0 18px}.recipient strong{font-size:14px;display:block}.intro{color:#46596e;margin:16px 0 20px}.sales{background:#102641;color:white;padding:20px 24px;border-radius:11px}.sales span{font-size:10px;letter-spacing:1px;text-transform:uppercase}.sales strong{display:block;font-size:35px;line-height:1.35}.sales small{color:#b5c8d7;font-size:11px}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:13px 0 20px}.metric{border:1px solid #dbe5ea;border-radius:9px;padding:15px;background:#f7fafb}.metric span{display:block;color:#617183;font-size:11px}.metric strong{display:block;font-size:25px;margin-top:5px}.metric .pendiente{font-size:14px;color:#875e1b}.premio{border:1px solid #b6dedb;border-radius:10px;padding:16px 20px;background:#f0f9f7;margin:18px 0}.premio .eyebrow{margin:0 0 3px}.premio h3{font-size:16px;margin:0 0 12px}.niveles{display:flex;gap:16px}.nivel{flex:1;border-left:2px solid #02a8a6;padding-left:12px}.nivel span{display:block;font-size:11px;color:#46596e}.nivel strong{font-size:21px}.premio p{font-size:10px;color:#536b68;line-height:1.5;margin:12px 0 0}.aviso{color:#875e1b;font-size:11px}.closing{color:#46596e;margin:18px 0}.signature strong{display:block}.footer{border-top:1px solid #dce7eb;margin-top:22px;padding-top:12px;font-size:10px;color:#728293;display:flex;justify-content:space-between}
@media(max-width:450px){body{padding:18px 12px}.metrics{gap:5px}.metric{padding:9px}.sales strong{font-size:29px}.niveles{flex-direction:column}.header img{width:110px}}
@media print{body{padding:0;font-size:12px}.print-action{display:none}.header{padding:18px 0}.eyebrow{margin-top:18px}.metrics,.premio,.signature{break-inside:avoid}}
</style></head><body><button type="button" class="print-action" id="imprimirCarta" ${carta.accesoriosPendientes ? 'disabled title="Completa la meta de accesorios antes de entregar la carta"' : ''}>Imprimir / guardar PDF</button>
<header class="header"><img src="/creditek/shared/branding/creditek-logo.png" alt="Creditek"><div>PRESUPUESTO COMERCIAL<br>${esc(mesLabel.toUpperCase())}</div></header><div class="eyebrow">METAS DEL MES</div><h1>${esc(carta.tienda.nombre)}</h1><h2>${esc(mesLabel)}</h2><div class="recipient">Para<br><strong>${administradores}</strong>Administración de tienda</div><p class="intro">Compartimos el presupuesto de tu tienda para ${esc(mesLabel)}. Estas son las metas mensuales para orientar la gestión comercial y el seguimiento de resultados.</p>
<section class="sales"><span>Meta de ventas del mes</span><strong>${pesos(carta.totales.meta_venta_total)}</strong><small>Pesos colombianos · Total mensual</small></section>
<section class="metrics">${METRICAS.slice(1).map(([campo,label])=>`<div class="metric"><span>${esc(label)}</span><strong class="${campo==='meta_uds_acc'&&carta.accesoriosPendientes?'pendiente':''}">${campo==='meta_uds_acc'&&carta.accesoriosPendientes?'Pendiente de verificar':numero(carta.totales[campo])}</strong></div>`).join('')}</section>${aviso}${estrategia}
<p class="closing">Gracias por tu compromiso con la atención a nuestros clientes y el cumplimiento de las metas de la tienda.</p><div class="signature">Cordialmente,<strong>Gerencia · Creditek</strong></div><footer class="footer"><span>${esc(carta.tienda.nombre)} · ${esc(mesLabel)}</span><span>Metas registradas en KORA</span></footer></body></html>`;
  }

  return Object.freeze({ METRICAS, tiendasElegidas, resumen, cartaHtml, premioPayload });
});
