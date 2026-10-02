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
    ['meta_utilidad', 'Utilidad', true],
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

  function cartaHtml(carta) {
    if (!carta.completo) throw new Error('No se puede emitir una carta con días sin presupuesto registrado.');
    const mesLabel = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(carta.mes + '-01T12:00:00Z'));
    const administradores = carta.administradores.length
      ? carta.administradores.map(esc).join(', ') : 'Administración de la tienda';
    const encabezados = METRICAS.map(([, label]) => '<th>' + esc(label) + '</th>').join('');
    const celdas = dia => METRICAS.map(([campo, , moneda]) =>
      '<td>' + (moneda ? pesos(dia[campo]) : numero(dia[campo])) + '</td>').join('');
    const filas = carta.dias.map(dia =>
      '<tr><td>' + esc(dia.fecha.slice(-2)) + '</td>' + celdas(dia) + '</tr>').join('');
    const totales = METRICAS.map(([campo, label, moneda]) =>
      '<div class="kpi"><span>' + esc(label) + '</span><strong>' +
      (moneda ? pesos(carta.totales[campo]) : numero(carta.totales[campo])) +
      '</strong></div>').join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Presupuesto · ${esc(carta.tienda.nombre)} · ${esc(carta.mes)}</title>
<style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#0b1e3d;max-width:900px;margin:32px auto;padding:0 22px}
header{border-bottom:4px solid #00c4cc;padding-bottom:18px;margin-bottom:20px}h1{font-size:25px;margin:0 0 8px}h2{font-size:16px;margin:24px 0 9px}
.eyebrow{color:#007f86;font-size:12px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase}.meta{line-height:1.65;color:#42516a}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.kpi{border:1px solid #dce8eb;border-radius:10px;padding:13px;background:#f6fbfc}.kpi span{display:block;font-size:11px;color:#58677f}.kpi strong{display:block;font-size:18px;margin-top:4px}
table{border-collapse:collapse;width:100%;font-size:10px}th,td{border-bottom:1px solid #dce8eb;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#0b1e3d;color:white}
.nota{font-size:11px;color:#58677f;line-height:1.5;margin-top:15px}.firma{margin-top:30px;border-top:1px solid #a8b7c7;padding-top:10px;font-size:12px}
.print-action{border:0;border-radius:8px;background:#0b1e3d;color:white;padding:12px 18px;font-weight:bold;cursor:pointer;margin-bottom:22px}
@media print{body{margin:0;padding:0}.print-action{display:none}.grid{break-inside:avoid}table{break-inside:auto}tr{break-inside:avoid}}
</style></head><body><button type="button" class="print-action" id="imprimirCarta">Imprimir / guardar PDF</button><header><div class="eyebrow">Creditek · Presupuesto Retail</div><h1>${esc(carta.tienda.nombre)}</h1>
<div class="meta">Para: ${administradores}<br>Periodo: ${esc(mesLabel)}<br>Estado: presupuesto registrado en KORA</div></header>
<p>Estas son las metas de la tienda para el periodo indicado. Los valores diarios detallan cómo se distribuye el presupuesto mensual.</p>
<h2>Metas del mes</h2><div class="grid">${totales}</div>
<h2>Detalle por día</h2><table><thead><tr><th>Día</th>${encabezados}</tr></thead><tbody>${filas}<tr><th>Total</th>${celdas(carta.totales)}</tr></tbody></table>
<p class="nota">Documento generado desde los presupuestos registrados en KORA. No es un comprobante de pago ni registra una aprobación nueva. Verifica cualquier ajuste posterior en el sistema.</p>
<div class="firma">Gerencia · Creditek</div></body></html>`;
  }

  return Object.freeze({ METRICAS, tiendasElegidas, resumen, cartaHtml });
});
