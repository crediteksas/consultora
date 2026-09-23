(function (root) {
  'use strict';
  const TYPES = Object.freeze({
    traslados: { label: 'Traslados', singular: 'Traslado', route: 'traslados.html', date: 'despachado_at', imei: true,
      select: 'id,consecutivo,estado,despachado_at,tienda_origen,tienda_destino,origen:tienda_origen(nombre),destino:tienda_destino(nombre)',
      help: 'Puedes anular un traslado antes del visto bueno central. Para cambiar el destino, anula el envío y crea el correcto; no se reescribe el historial.' },
    remisiones: { label: 'Remisiones', singular: 'Remisión', route: 'remisiones.html', date: 'created_at',
      select: 'id,consecutivo,estado,created_at,tienda_codigo,origenes(nombre)',
      help: 'Corrige el documento desde su detalle. Las líneas y el destino se corrigen antes de recibir; la anulación está disponible para borradores. Los demás casos dependen del estado de la remisión.' },
    ventas: { label: 'Ventas', singular: 'Venta', route: 'ventas.html', date: 'fecha', dateOnly: true, imei: true,
      select: 'id,consecutivo,fecha,created_at,tienda_codigo,anulada,tipo,total,clientes(nombre_completo),origen:tienda_codigo(nombre)',
      help: 'Abre el detalle para la corrección administrativa o la anulación con motivo. El sistema valida los permisos y las condiciones de la operación al confirmar.' },
    gastos: { label: 'Gastos de tiendas', singular: 'Gasto', route: 'gastos.html', date: 'fecha', dateOnly: true,
      select: 'id,fecha,created_at,tienda_codigo,estado,correccion_pendiente,monto,descripcion,conceptos_gasto(nombre),origenes:tienda_codigo(nombre)',
      help: 'Selecciona un gasto para revisar y corregir sus datos aquí mismo. El motivo queda registrado y el gasto corregido vuelve a aprobación; no se elimina el historial.' },
  });
  const PAGE_SIZE = 20;
  function type(key) { if (!Object.hasOwn(TYPES, key)) throw new Error('Selecciona un tipo de documento válido.'); return TYPES[key]; }
  function searchValue(key, raw) {
    const config = type(key), value = String(raw || '').trim().replace(/^#\s*/, '');
    if (!value) return { kind: 'all' };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return { kind: 'id', value };
    if (config.imei && /^\d{15}$/.test(value)) return { kind: 'imei', value };
    if (key !== 'gastos' && /^\d{1,14}$/.test(value) && Number(value) > 0) return { kind: 'consecutivo', value };
    throw new Error(key === 'gastos' ? 'Los gastos no tienen consecutivo. Busca por tienda y fechas, o pega el ID completo.' : `Escribe el número del documento${config.imei ? ' o un IMEI completo de 15 dígitos' : ''}. También puedes pegar el ID completo.`);
  }
  function dateValue(value) {
    if (!value) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('Revisa las fechas seleccionadas.');
    return value;
  }
  function nextDay(value) { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10); }
  function status(key, row) {
    if (key === 'ventas') return row.anulada ? 'Anulada' : 'Registrada';
    if (key === 'gastos' && row.correccion_pendiente) return 'Corrección pendiente';
    return ({despachado:'Despachado',despachada:'Despachada',recibido_pendiente_aprobacion:'Pendiente de visto bueno',recibido:'Cerrado',recibida:'Recibida',cerrado:'Cerrado',anulado:'Anulado',anulada:'Anulada',borrador:'Borrador',pendiente:'Pendiente',aprobado:'Aprobado',rechazado:'Rechazado',cartera_b2b:'Cartera B2B'})[row.estado] || row.estado || 'Sin estado';
  }
  function documentView(key, row) {
    const config = type(key), number = row.consecutivo != null ? `#${row.consecutivo}` : `· ${String(row.id).slice(-8)}`;
    const store = key === 'traslados' ? `${row.origen?.nombre || row.tienda_origen || 'Origen sin identificar'} → ${row.destino?.nombre || row.tienda_destino || 'Destino sin identificar'}` : row.origen?.nombre || row.origenes?.nombre || row.tienda_codigo || 'Sin tienda';
    return { title: `${config.singular} ${number}`, store, status: status(key,row), date: row[config.date], dateOnly: !!config.dateOnly,
      description: key === 'ventas' ? row.clientes?.nombre_completo || 'Sin cliente registrado' : key === 'gastos' ? row.conceptos_gasto?.nombre || row.descripcion || 'Gasto registrado' : '',
      amount: key === 'ventas' ? row.total : key === 'gastos' ? row.monto : null,
      href: `${config.route}?documento=${encodeURIComponent(row.id)}` };
  }
  async function findDocuments(sb, access, profile, options) {
    // Client gate is additional to, not a substitute for, existing RLS and RPC checks.
    if (!access?.canManageDocuments(profile)) throw new Error('Este panel está reservado para Óscar y Maythe.');
    const key=options.type, config=type(key), search=searchValue(key,options.query), from=dateValue(options.from), to=dateValue(options.to);
    if (from && to && from > to) throw new Error('La fecha inicial no puede ser posterior a la final.');
    const page=options.page ?? 0;
    if (!Number.isSafeInteger(page) || page < 0) throw new Error('Página no válida.');
    const store=String(options.store || '');
    if (store && !/^[\w-]{1,40}$/.test(store)) throw new Error('Selecciona una tienda válida.');
    let ids;
    if (search.kind === 'imei') {
      const units = await sb.from('unidades_lectura').select('id').eq('imei',search.value).limit(2);
      if (units.error) throw units.error;
      if (!units.data?.length) return { rows:[], count:0 };
      if (units.data.length > 1) throw new Error('El IMEI aparece más de una vez. Revisa las unidades antes de seleccionar un documento.');
      const field=key==='traslados'?'traslado_id':'venta_id';
      const matches = await sb.from(key==='traslados'?'traslado_items_lectura':'venta_items_lectura').select(field,{count:'exact'}).eq('unidad_id',units.data[0].id).limit(1000);
      if (matches.error) throw matches.error;
      if ((matches.count ?? matches.data?.length ?? 0)>1000) throw new Error('El IMEI tiene demasiados movimientos. Busca por número de documento.');
      ids=[...new Set((matches.data||[]).map(row=>row[field]))];
      if (!ids.length) return { rows:[], count:0 };
    }
    let query=sb.from(key).select(config.select,{count:'exact'});
    if (search.kind==='id' || search.kind==='consecutivo') query=query.eq(search.kind,search.value);
    if (ids) query=query.in('id',ids);
    if (store) query=key==='traslados'?query.or(`tienda_origen.eq.${store},tienda_destino.eq.${store}`):query.eq('tienda_codigo',store);
    if (from) query=query.gte(config.date,config.dateOnly?from:`${from}T00:00:00-05:00`);
    if (to) query=config.dateOnly?query.lte(config.date,to):query.lt(config.date,`${nextDay(to)}T00:00:00-05:00`);
    const result=await query.order(config.date,{ascending:false}).order('id',{ascending:false}).range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
    if (result.error) throw result.error;
    return {rows:result.data||[],count:result.count};
  }
  root.KoraDocuments = Object.freeze({TYPES,PAGE_SIZE,type,searchValue,dateValue,nextDay,status,documentView,findDocuments});
})(typeof window !== 'undefined' ? window : globalThis);
