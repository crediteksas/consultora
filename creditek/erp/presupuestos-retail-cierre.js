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
  // El histórico mensual permite comparar meses completos. Nunca se prorratea
  // una cifra mensual como si fuera el resultado real de los días transcurridos.
  function compararConAnterior(cierres, historico = [], { errorHistorico = false } = {}) {
    const fuenteInvalida = !Array.isArray(historico) || historico.some(h => !h || typeof h !== 'object');
    return cierres.map(cierre => {
      const p = cierre.periodo, anioAnterior = Number(p.mes.slice(0, 4)) - 1, mesAnterior = `${anioAnterior}-${p.mes.slice(5)}`;
      const rows = !fuenteInvalida ? historico.filter(h => h.tienda_codigo === cierre.tienda.codigo && Number(h.anio) === anioAnterior && Number(h.mes) === Number(p.mes.slice(5))) : [];
      const rowsActuales = !fuenteInvalida ? historico.filter(h => h.tienda_codigo === cierre.tienda.codigo && Number(h.anio) === Number(p.mes.slice(0,4)) && Number(h.mes) === Number(p.mes.slice(5))) : [];
      const notes = [...cierre.notes];
      const categorias = cierre.categorias.map(m => {
        let valorAnterior = null, variacionAnual = null, crecimientoAnual = null, estadoCrecimiento;
        const h = rows[0], campo = { ventas: 'venta_total', creditos: 'cred_uds', celulares: 'cel_uds', accesorios: 'acc_uds' }[m.id];
        if (errorHistorico || fuenteInvalida) estadoCrecimiento = 'Histórico no disponible';
        else if (!rows.length) estadoCrecimiento = 'Sin histórico comparable';
        else if (rows.length !== 1) estadoCrecimiento = 'Histórico duplicado por validar';
        else {
          try {
            valorAnterior = m.dinero ? centavos(h[campo], 'histórico de ventas') / 100 : numero(h[campo], 'histórico de ' + m.nombre, { entero: true });
            // Una venta histórica positiva sin cantidad no demuestra cero unidades.
            const ventaUnidades = m.id === 'accesorios' ? h.acc_venta : m.id === 'celulares' ? h.cel_venta : null;
            if (!m.dinero && valorAnterior === 0 && Number(ventaUnidades) > 0) throw new Error('Cantidad histórica pendiente');
          } catch (_) { valorAnterior = null; estadoCrecimiento = 'Histórico por validar'; }
          if (valorAnterior != null) {
            if (!p.cerrado) estadoCrecimiento = 'Sin comparativo al corte';
            else if (m.realizado == null || !Number.isFinite(m.realizado)) estadoCrecimiento = 'Resultado actual por validar';
            else {
              let actualConciliado = true;
              if (rowsActuales.length) {
                try {
                  const hActual = rowsActuales[0];
                  const registrado = m.dinero ? centavos(hActual[campo], 'histórico del año actual') / 100 : numero(hActual[campo], 'histórico del año actual', { entero: true });
                  const montoActual = m.id === 'accesorios' ? hActual.acc_venta : m.id === 'celulares' ? hActual.cel_venta : null;
                  actualConciliado = rowsActuales.length === 1 && registrado === m.realizado && !(registrado === 0 && !m.dinero && Number(montoActual) > 0);
                } catch (_) { actualConciliado = false; }
              }
              if (!actualConciliado) {
                estadoCrecimiento = 'Resultado actual por conciliar';
                notes.push(`${m.nombre}: el histórico mensual del año actual no coincide con el resultado operativo; validar ambas fuentes antes de informar crecimiento. El presupuesto y el resultado operativo conservan sus valores.`);
                return { ...m, valorAnterior, variacionAnual, crecimientoAnual, estadoCrecimiento };
              }
              const anterior = m.dinero ? centavos(valorAnterior, 'histórico de ventas') : valorAnterior;
              const actual = m.dinero ? centavos(m.realizado, 'venta actual') : m.realizado;
              const delta = suma(actual, -anterior);
              variacionAnual = m.dinero ? delta / 100 : delta;
              crecimientoAnual = anterior > 0 ? delta / anterior : null;
              estadoCrecimiento = anterior <= 0 ? 'Sin base porcentual' : delta > 0 ? 'Crecimiento' : delta < 0 ? 'Disminución' : 'Sin variación';
            }
          }
        }
        if (valorAnterior == null) notes.push(`${m.nombre}: ${estadoCrecimiento.toLowerCase()} de ${mesAnterior}; no se reemplaza por cero ni se estima el crecimiento.`);
        return { ...m, valorAnterior, variacionAnual, crecimientoAnual, estadoCrecimiento };
      });
      if (!p.cerrado) notes.push(`El histórico de ${mesAnterior} corresponde al mes completo. El resultado actual llega al ${p.corte}; sin un histórico diario verificado del mismo corte no se calcula variación ni crecimiento interanual.`);
      return { ...cierre, categorias, notes, comparativo: { anioAnterior, mesAnterior, base: 'Histórico mensual registrado', comparable: p.cerrado } };
    });
  }
  async function cargar({ sb, perfil, tiendas, mes, codigo = '__todas__', now = new Date() }) {
    if (!perfil?.activo || !['gerencia', 'auditoria'].includes(perfil.rol)) throw new Error('Esta consulta está disponible para Gerencia o Auditoría.');
    const selected = tiendasElegidas(tiendas, codigo), p = periodo(mes, now), codes = selected.map(t => t.codigo);
    const [presupuestos, ventas, creditData, historico] = await Promise.all([
      credits.allRows(sb, 'presupuestos', 'id,tienda_codigo,fecha,meta_venta_total,meta_creditos,meta_uds_cel,meta_uds_acc', 'id', q => q.gte('fecha', p.inicio).lt('fecha', p.fin).in('tienda_codigo', codes)),
      credits.allRows(sb, 'ventas', 'id,tienda_codigo,fecha,tipo,total,anulada', 'id', q => q.gte('fecha', p.inicio).lt('fecha', p.finReal).eq('anulada', false).in('tienda_codigo', codes)),
      credits.loadCreditData(sb),
      credits.allRows(sb, 'historico_mensual', 'id,tienda_codigo,anio,mes,venta_total,cred_uds,cel_uds,acc_uds,cel_venta,acc_venta', 'id', q => q.in('anio', [Number(mes.slice(0, 4)) - 1, Number(mes.slice(0, 4))]).eq('mes', Number(mes.slice(5))).in('tienda_codigo', codes))
        .then(rows => ({ rows, error: false }), () => ({ rows: [], error: true })),
    ]);
    const items = [], productos = [];
    for (let i = 0; i < ventas.length; i += 200) items.push(...await credits.allRows(sb, 'venta_items_lectura', 'id,venta_id,producto_id,cantidad', 'id', q => q.in('venta_id', ventas.slice(i, i + 200).map(v => v.id))));
    const ids = [...new Set(items.map(i => i.producto_id).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 200) productos.push(...await credits.allRows(sb, 'productos', 'id,tipo', 'id', q => q.in('id', ids.slice(i, i + 200))));
    return compararConAnterior(resumir({ tiendas: selected, mes, presupuestos, ventas, items, productos, creditData, now }), historico.rows, { errorHistorico: historico.error });
  }
  // Solo presentación: se usan las proporciones existentes, sin redondearlas ni cambiar estados.
  function tonosCategoria(categoria) {
    const cumplimiento = categoria.cumplimiento, crecimiento = categoria.crecimientoAnual;
    return {
      cumplimiento: !Number.isFinite(cumplimiento) ? 'neutral' : cumplimiento >= 1 ? 'positive' : cumplimiento >= 0.9 ? 'steady' : 'negative',
      crecimiento: !Number.isFinite(crecimiento) ? 'neutral' : crecimiento > 0 ? 'positive' : crecimiento < 0 ? 'negative' : 'steady',
    };
  }
  const LEYENDA_COLORES = 'Cumplimiento: verde desde 100%; amarillo desde 90% y hasta menos de 100%; rojo por debajo de 90%. Crecimiento interanual: verde si aumenta; rojo si disminuye; amarillo sin variación. Gris: sin porcentaje comparable. Los porcentajes y estados conservan su significado.';
  function informe(cierre) {
    const { tienda, periodo: p, categorias } = cierre;
    const anioAnterior = Number(p.mes.slice(0, 4)) - 1;
    const anteriorLabel = `${p.mes.slice(5)}/${anioAnterior} · mes completo`;
    const values = c => [`${c.nombre} (${c.dinero ? 'COP' : 'unidades'})`, c.valorAnterior ?? null, c.presupuesto, c.realizado, c.diferencia, c.cumplimiento, c.variacionAnual ?? null, c.crecimientoAnual ?? null];
    const rowTypes = c => ['text', ...Array(4).fill(c.dinero ? 'currency' : 'number'), 'percentage', c.dinero ? 'currency' : 'number', 'percentage'];
    const label = p.cerrado ? 'Cierre mensual' : 'Avance del mes · cifras parciales';
    return { title: `${label} de presupuesto · ${tienda.nombre}`, mode: 'summary', orientation: 'portrait',
      pdfBatch: { kind: 'retail-budget-close', mes: p.mes, cerrado: p.cerrado, tiendaCodigo: tienda.codigo, tiendaNombre: tienda.nombre },
      route: '/creditek/erp/presupuestos.html#informe-puntos-venta', scope: { business: 'retail', label: `Retail · ${tienda.nombre}` },
      filters: [['Negocio', 'Retail'], ['Punto de venta', `${tienda.nombre} · ${tienda.codigo}`], ['Mes', p.mes], ['Desde', p.inicio], ['Corte de resultados', p.corte], ['Estado del mes', p.cerrado ? 'Mes transcurrido completo' : 'Mes en curso'], ['Comparativo interanual', `${p.mes.slice(5)}/${anioAnterior} · histórico mensual`]],
      tables: [
        { heading: 'Presupuesto y crecimiento', layout: 'matrix', numericPresentation: 'large-centered', pdfColumnGroups: [[0, 1, 2, 3, 4], [0, 5, 6, 7]], headers: ['Categoría', anteriorLabel, 'Presupuesto', 'Realizado', 'Diferencia vs. meta', 'Cumplimiento', 'Variación interanual', 'Crecimiento interanual'], rows: categorias.map(values),
          columnTypes: ['text', 'number', 'number', 'number', 'number', 'percentage', 'number', 'percentage'], rowTypes: categorias.map(rowTypes),
          rowTones: categorias.map(c => { const tonos = tonosCategoria(c); return ['', '', '', '', '', tonos.cumplimiento, '', tonos.crecimiento]; }),
          rowNotes: categorias.map(c => ['', '', '', '', '', c.estado, '', c.estadoCrecimiento || 'Sin histórico comparable']) },
      ],
      notes: [...cierre.notes, LEYENDA_COLORES,
        'Se compara el presupuesto mensual registrado con los resultados disponibles al generar el informe. Las propuestas sin aprobar no sustituyen las metas registradas.',
        'Crecimiento interanual: (resultado actual − resultado del mismo mes del año anterior) / resultado anterior. Solo se calcula para meses completos con base anterior positiva y datos verificables; la variación es la diferencia entre ambos resultados.',
        'Ventas: registros Retail vigentes por fecha comercial, sin ventas anuladas. Créditos: Liquidaciones por fecha de venta, con el mismo tratamiento de duplicados y reversiones del Resumen ejecutivo.',
        'Celulares de contado: unidades de productos serializados en ventas de contado. Accesorios: unidades de productos por cantidad en las ventas vigentes. La diferencia corresponde a realizado menos presupuesto.',
        ...(p.cerrado ? [] : ['El mes está en curso: el presupuesto es mensual y los resultados son parciales hasta el corte indicado.']),
      ] };
  }
  return Object.freeze({ METRICAS, diaColombia, periodo, tiendasElegidas, resumir, compararConAnterior, cargar, informe, tonosCategoria, LEYENDA_COLORES });
});
