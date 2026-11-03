(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tablero-ejecutivos.js'));
  else root.KoraPresupuestoCierre = factory(root.CreditekTableroEjecutivos);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (credits) {
  'use strict';
  const METRICAS = Object.freeze([
    { id: 'ventas', campo: 'meta_venta_total', nombre: 'Ventas', dinero: true },
    { id: 'creditos', campo: 'meta_creditos', nombre: 'Créditos', dinero: false },
    { id: 'celulares', campo: 'meta_uds_cel', nombre: 'Celulares de contado', dinero: false },
    { id: 'accesorios', campo: 'meta_uds_acc', nombre: 'Accesorios', dinero: false },
  ]);
  function diaColombia(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function periodo(mes, now = new Date()) {
    if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Selecciona un mes válido.');
    const hoy = diaColombia(now);
    if (mes > hoy.slice(0, 7)) throw new Error('Elige un mes transcurrido o el mes actual.');
    const [y, m] = mes.split('-').map(Number);
    const fin = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const cerrado = mes < hoy.slice(0, 7);
    const corte = cerrado ? ultimo : hoy;
    return { mes, inicio: mes + '-01', fin, dias: Number(ultimo.slice(8)), corte, cerrado,
      finReal: new Date(Date.parse(corte + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10) };
  }
  function numero(value, label, { negativo = false, entero = false } = {}) {
    if (value == null || String(value).trim() === '' || !['number', 'string'].includes(typeof value)) throw new Error(`Falta un valor válido de ${label}.`);
    const n = Number(value);
    if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER / 100 || (!negativo && n < 0) || (entero && !Number.isSafeInteger(n))) throw new Error(`Valor no válido de ${label}.`);
    return n;
  }
  function centavos(value, label) {
    const n = numero(value, label, { negativo: true }), cents = Math.round(n * 100);
    if (Math.abs(n * 100 - cents) > .00001) throw new Error(`${label} debe conservar como máximo dos decimales.`);
    return cents;
  }
  function suma(a, b) {
    const result = a + b;
    if (!Number.isSafeInteger(result)) throw new Error('El total excede el rango seguro del informe.');
    return result;
  }
  function tiendasElegidas(tiendas, codigo) {
    if (!Array.isArray(tiendas) || !tiendas.length) throw new Error('No hay puntos de venta Retail disponibles.');
    const seen = new Set();
    for (const t of tiendas) {
      if (!t?.codigo || !t.nombre || seen.has(t.codigo)) throw new Error('Revisa el catálogo de tiendas antes de generar el informe.');
      seen.add(t.codigo);
    }
    if (codigo === '__todas__') return tiendas;
    const tienda = tiendas.find(t => t.codigo === codigo);
    if (!tienda) throw new Error('Selecciona un punto de venta válido.');
    return [tienda];
  }
  function resumir({ tiendas, mes, presupuestos, ventas, items, productos, creditData, now = new Date() }) {
    const p = periodo(mes, now), codes = new Set(tiendas.map(t => t.codigo));
    const budgets = new Map(), sales = new Map(), products = new Map(), itemIds = new Set();
    const actual = new Map(tiendas.map(t => [t.codigo, { ventas: 0, celulares: 0, accesorios: 0, creditos: 0, celularesPendientes: 0, accesoriosPendientes: 0 }]));
    for (const b of presupuestos) {
      if (!codes.has(b.tienda_codigo) || b.fecha < p.inicio || b.fecha >= p.fin) continue;
      const day = Number(String(b.fecha).slice(8));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || day < 1 || day > p.dias) throw new Error('Fecha no válida en el presupuesto registrado.');
      const key = b.tienda_codigo + '|' + b.fecha;
      if (budgets.has(key)) throw new Error('Hay días duplicados en el presupuesto registrado.');
      budgets.set(key, b);
    }
    for (const v of ventas) {
      if (!codes.has(v.tienda_codigo) || v.anulada === true || v.fecha < p.inicio || v.fecha > p.corte) continue;
      if (!v.id || sales.has(v.id)) throw new Error('La consulta de ventas contiene identificadores duplicados o incompletos.');
      if (!['contado', 'credito'].includes(v.tipo)) throw new Error('Hay una venta sin tipo válido para clasificar las unidades.');
      sales.set(v.id, v);
      const row = actual.get(v.tienda_codigo);
      row.ventas = suma(row.ventas, centavos(v.total, 'venta'));
    }
    for (const product of productos) {
      if (!product.id || products.has(product.id)) throw new Error('La consulta de referencias está incompleta o duplicada.');
      products.set(product.id, product);
    }
    const withItems = new Set();
    for (const item of items) {
      const sale = sales.get(item.venta_id);
      if (!sale) continue;
      if (!item.id || itemIds.has(item.id)) throw new Error('Hay unidades duplicadas en la consulta de ventas.');
      itemIds.add(item.id); withItems.add(sale.id);
      const qty = numero(item.cantidad, 'cantidad vendida', { entero: true }), product = products.get(item.producto_id), row = actual.get(sale.tienda_codigo);
      if (!['serializado', 'cantidad'].includes(product?.tipo)) {
        row.accesoriosPendientes++;
        if (sale.tipo === 'contado') row.celularesPendientes++;
      } else {
        if (product.tipo === 'cantidad') row.accesorios = suma(row.accesorios, qty);
        if (product.tipo === 'serializado' && sale.tipo === 'contado') row.celulares = suma(row.celulares, qty);
      }
    }
    for (const sale of sales.values()) if (!withItems.has(sale.id)) {
      const row = actual.get(sale.tienda_codigo); row.accesoriosPendientes++;
      if (sale.tipo === 'contado') row.celularesPendientes++;
    }
    // El mismo cómputo de Liquidaciones que usa el Resumen ejecutivo.
    const ops = credits.credits(creditData, { start: p.inicio, end: p.finReal });
    for (const op of ops) if (op.tipo_establecimiento === 'propia' && codes.has(op.origen_codigo)) actual.get(op.origen_codigo).creditos += op.reversion_id ? -1 : 1;
    return tiendas.map(tienda => {
      const a = actual.get(tienda.codigo), notes = [];
      const categorias = METRICAS.map(metric => {
        let target = 0, registrados = 0;
        for (let d = 1; d <= p.dias; d++) {
          const b = budgets.get(tienda.codigo + '|' + mes + '-' + String(d).padStart(2, '0'));
          if (b?.[metric.campo] == null || b[metric.campo] === '') continue;
          const value = numero(b[metric.campo], 'meta de ' + metric.nombre);
          target = metric.dinero ? suma(target, centavos(value, 'meta de ventas')) : target + value;
          registrados++;
        }
        const presupuesto = registrados === p.dias ? (metric.dinero ? target / 100 : target) : null;
        const desconocido = a[metric.id + 'Pendientes'] || 0;
        const realizado = desconocido ? null : metric.dinero ? a[metric.id] / 100 : a[metric.id];
        const cumplimiento = presupuesto != null && presupuesto > 0 && realizado != null ? realizado / presupuesto : null;
        const diferencia = presupuesto != null && realizado != null ? metric.dinero ? (a[metric.id] - target) / 100 : realizado - presupuesto : null;
        const estado = realizado == null ? 'Resultado por validar' : presupuesto == null ? 'Presupuesto incompleto' : presupuesto === 0 ? 'Sin meta asignada' : cumplimiento >= 1 ? 'Meta alcanzada' : 'Por debajo de la meta';
        if (presupuesto == null) notes.push(`${metric.nombre}: ${registrados} de ${p.dias} días con meta registrada; no se presenta una meta parcial como total mensual.`);
        if (desconocido) notes.push(`${metric.nombre}: ${desconocido} registro(s) sin clasificación o detalle suficiente; el resultado queda pendiente de validar.`);
        return { ...metric, presupuesto, realizado, diferencia, cumplimiento, estado, diasRegistrados: registrados };
      });
      return { tienda, periodo: p, categorias, notes };
    });
  }
  async function cargar({ sb, perfil, tiendas, mes, codigo = '__todas__', now = new Date() }) {
    if (!perfil?.activo || !['gerencia', 'auditoria'].includes(perfil.rol)) throw new Error('Esta consulta está disponible para Gerencia o Auditoría.');
    const selected = tiendasElegidas(tiendas, codigo), p = periodo(mes, now), codes = selected.map(t => t.codigo);
    const [presupuestos, ventas, creditData] = await Promise.all([
      credits.allRows(sb, 'presupuestos', 'id,tienda_codigo,fecha,meta_venta_total,meta_creditos,meta_uds_cel,meta_uds_acc', 'id', q => q.gte('fecha', p.inicio).lt('fecha', p.fin).in('tienda_codigo', codes)),
      credits.allRows(sb, 'ventas', 'id,tienda_codigo,fecha,tipo,total,anulada', 'id', q => q.gte('fecha', p.inicio).lt('fecha', p.finReal).eq('anulada', false).in('tienda_codigo', codes)),
      credits.loadCreditData(sb),
    ]);
    const items = [], productos = [];
    for (let i = 0; i < ventas.length; i += 200) items.push(...await credits.allRows(sb, 'venta_items_lectura', 'id,venta_id,producto_id,cantidad', 'id', q => q.in('venta_id', ventas.slice(i, i + 200).map(v => v.id))));
    const ids = [...new Set(items.map(i => i.producto_id).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 200) productos.push(...await credits.allRows(sb, 'productos', 'id,tipo', 'id', q => q.in('id', ids.slice(i, i + 200))));
    return resumir({ tiendas: selected, mes, presupuestos, ventas, items, productos, creditData, now });
  }
  function informe(cierre) {
    const { tienda, periodo: p, categorias } = cierre;
    const values = c => [c.presupuesto, c.realizado, c.diferencia, c.cumplimiento, c.estado];
    const label = p.cerrado ? 'Cierre mensual' : 'Avance del mes · cifras parciales';
    return { title: `${label} de presupuesto · ${tienda.nombre}`, mode: 'summary',
      route: '/creditek/erp/presupuestos.html#informe-puntos-venta', scope: { business: 'retail', label: `Retail · ${tienda.nombre}` },
      filters: [['Negocio', 'Retail'], ['Punto de venta', `${tienda.nombre} · ${tienda.codigo}`], ['Mes', p.mes], ['Desde', p.inicio], ['Corte de resultados', p.corte], ['Estado del mes', p.cerrado ? 'Mes transcurrido completo' : 'Mes en curso']],
      tables: [
        { heading: 'Ventas', headers: ['Presupuesto (COP)', 'Realizado (COP)', 'Diferencia (COP)', 'Cumplimiento', 'Estado'], rows: [values(categorias[0])], columnTypes: ['currency', 'currency', 'currency', 'percentage', 'text'] },
        { heading: 'Créditos, celulares y accesorios', headers: ['Categoría', 'Presupuesto', 'Realizado', 'Diferencia', 'Cumplimiento', 'Estado'], rows: categorias.slice(1).map(c => [c.nombre, ...values(c)]), columnTypes: ['text', 'number', 'number', 'number', 'percentage', 'text'] },
      ],
      notes: [...cierre.notes,
        'Se compara el presupuesto mensual registrado con los resultados disponibles al generar el informe. Las propuestas sin aprobar no sustituyen las metas registradas.',
        'Ventas: registros Retail vigentes por fecha comercial, sin ventas anuladas. Créditos: Liquidaciones por fecha de venta, con el mismo tratamiento de duplicados y reversiones del Resumen ejecutivo.',
        'Celulares de contado: unidades de productos serializados en ventas de contado. Accesorios: unidades de productos por cantidad en las ventas vigentes. La diferencia corresponde a realizado menos presupuesto.',
        ...(p.cerrado ? [] : ['El mes está en curso: el presupuesto es mensual y los resultados son parciales hasta el corte indicado.']),
      ] };
  }
  return Object.freeze({ METRICAS, diaColombia, periodo, tiendasElegidas, resumir, cargar, informe });
});
