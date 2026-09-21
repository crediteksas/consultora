(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KoraAlertasCelulares = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = (store, product) => `${store}|${product}`;
  function period(now = new Date()) {
    const end = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const start = new Date(end + 'T12:00:00Z');
    start.setUTCDate(start.getUTCDate() - 29);
    // Primer día con ventas detalladas en KORA. No usar históricos agregados.
    return {start: [start.toISOString().slice(0,10), '2026-09-02'].sort().pop(), end};
  }
  async function all(sb, table, columns, filter = q => q, order = 'id') {
    const rows = [];
    for (let offset = 0;; offset += 500) {
      let query = filter(sb.from(table).select(columns));
      for (const field of [].concat(order)) query=query.order(field);
      const {data,error} = await query.range(offset,offset+499);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Consulta incompleta: ' + table);
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }
  function summarize(data, range) {
    const products = new Map(data.products.filter(p => p.categoria === 'CELULAR').map(p => [p.id,p]));
    const stores = new Map(data.stores.filter(s => s.activo && s.tipo === 'propia').map(s => [s.codigo,s.nombre]));
    const rows = new Map();
    const days = Math.max(1, (Date.parse(range.end)-Date.parse(range.start))/86400000+1);
    const recent = new Date(range.end+'T12:00:00Z'); recent.setUTCDate(recent.getUTCDate()-6);
    for (const sale of data.sales) {
      if (sale.anulada || sale.fecha < range.start || sale.fecha > range.end || !stores.has(sale.tienda_codigo)) continue;
      for (const item of sale.items || []) {
        const product = products.get(item.producto_id);
        if (!product || !(Number(item.cantidad)>0)) continue;
        const k = key(sale.tienda_codigo,product.id);
        if (!rows.has(k)) rows.set(k,{store:sale.tienda_codigo,storeName:stores.get(sale.tienda_codigo),product:product.id,name:product.nombre,active:product.activo,sold:0,recent:0,stock:0,pending:false});
        const row=rows.get(k); row.sold+=Number(item.cantidad);
        if (sale.fecha >= recent.toISOString().slice(0,10)) row.recent+=Number(item.cantidad);
      }
    }
    for (const unit of data.units) {
      if (unit.estado !== 'disponible' || products.get(unit.producto_id)?.tipo !== 'serializado') continue;
      const row=rows.get(key(unit.tienda_actual,unit.producto_id)); if (row) row.stock++;
    }
    for (const stock of data.stock) {
      if (products.get(stock.producto_id)?.tipo !== 'cantidad') continue;
      const row=rows.get(key(stock.tienda_codigo,stock.producto_id)); if (row) row.stock+=Number(stock.cantidad);
    }
    // Señal de gestión, no suma: un pedido puede ser la misma compra/remisión.
    // Evita contar dos veces el mismo abastecimiento y no presume fecha de llegada.
    for (const pending of data.pending) {
      const row=rows.get(key(pending.store,pending.product)); if (row) row.pending=true;
    }
    return [...rows.values()].map(row => {
      row.coverage=row.stock/(row.sold/days);
      row.status=!row.active?'Referencia inactiva':row.pending?'Reposición en gestión':row.stock<=0?'Sin stock':row.coverage<7?'Stock bajo':'Con stock';
      row.priority=!row.active?4:row.pending?2:row.stock<=0?0:row.coverage<7?1:3;
      return row;
    }).sort((a,b)=>a.priority-b.priority || b.recent-a.recent || b.sold-a.sold || a.name.localeCompare(b.name,'es'));
  }
  async function load(sb, profile, now) {
    if (!profile?.activo || !['gerencia','auditoria','admin_tienda'].includes(profile.rol)) throw new Error('Perfil no autorizado');
    const central=['gerencia','auditoria'].includes(profile.rol);
    if (!central && !profile.tienda_codigo) throw new Error('Tienda no asignada');
    const scope=(q,field)=>central?q:q.eq(field,profile.tienda_codigo);
    const range=period(now);
    const [products,stores,sales,units,stock,requests,remissions,transfers,orders]=await Promise.all([
      all(sb,'productos','id,nombre,categoria,tipo,activo',q=>q.eq('categoria','CELULAR')),
      all(sb,'origenes','codigo,nombre,tipo,activo',q=>scope(q.eq('tipo','propia').eq('activo',true),'codigo'),'codigo'),
      all(sb,'ventas','id,fecha,tienda_codigo,anulada,items:venta_items_lectura(producto_id,cantidad)',q=>scope(q.eq('anulada',false).gte('fecha',range.start).lte('fecha',range.end),'tienda_codigo')),
      all(sb,'unidades_lectura','id,producto_id,estado,tienda_actual',q=>scope(q.eq('estado','disponible'),'tienda_actual')),
      all(sb,'stock_cantidad_lectura','producto_id,tienda_codigo,cantidad',q=>scope(q,'tienda_codigo'),['tienda_codigo','producto_id']),
      all(sb,'pedidos_b2b','id,tienda_codigo,estado,items:pedido_b2b_items(producto_id,cantidad_solicitada,cantidad_recibida)',q=>scope(q.in('estado',['solicitado','en_compra','parcial']),'tienda_codigo')),
      all(sb,'remisiones','id,tienda_codigo,estado,items:remision_items(producto_id,cantidad)',q=>scope(q.in('estado',['borrador','despachada']),'tienda_codigo')),
      all(sb,'traslados','id,tienda_destino,estado,items:traslado_items_lectura(producto_id,cantidad)',q=>scope(q.in('estado',['despachado','recibido_pendiente_aprobacion']),'tienda_destino')),
      // Las órdenes de proveedor son privadas de central. La tienda consulta
      // su pedido y remisión, nunca costos o datos privados de proveedores.
      central?all(sb,'ordenes_compra','id,estado,items:orden_compra_items(producto_id,tienda_destino,cantidad_ordenada,cantidad_recibida)',q=>q.in('estado',['enviada','recepcion_parcial'])):Promise.resolve([]),
    ]);
    const pending=[];
    requests.forEach(r=>(r.items||[]).filter(i=>i.cantidad_solicitada>i.cantidad_recibida).forEach(i=>pending.push({store:r.tienda_codigo,product:i.producto_id})));
    remissions.forEach(r=>(r.items||[]).filter(i=>i.cantidad>0).forEach(i=>pending.push({store:r.tienda_codigo,product:i.producto_id})));
    transfers.forEach(r=>(r.items||[]).filter(i=>i.cantidad>0).forEach(i=>pending.push({store:r.tienda_destino,product:i.producto_id})));
    orders.forEach(r=>(r.items||[]).filter(i=>i.cantidad_ordenada>i.cantidad_recibida).forEach(i=>pending.push({store:i.tienda_destino,product:i.producto_id})));
    return {range,central,rows:summarize({products,stores,sales,units,stock,pending},range)};
  }
  function cards(rows, central) {
    return rows.map(r=>`<li class="kora-phone-row"><div class="kora-phone-title"><strong>${esc(r.name)}</strong>${central?`<small>${esc(r.storeName)}</small>`:''}</div><span class="kora-phone-state" data-level="${r.priority}">${esc(r.status)}</span><dl><div><dt>Vendidos en el período</dt><dd>${r.sold}</dd></div><div><dt>Últimos 7 días</dt><dd>${r.recent}</dd></div><div><dt>Disponibles hoy</dt><dd>${r.stock}</dd></div></dl><p>${!r.active?'Revisar catálogo antes de reponer.':r.pending?'Revisar lo ya solicitado o enviado antes de comprar más.':r.priority<2?'Revisar reposición o traslado. Confirmar pedidos antes de comprar.':'Consultar entre los más vendidos para planear el abastecimiento.'}</p></li>`).join('');
  }
  function html(result, mode='priority') {
    const date=d=>d.split('-').reverse().join('/');
    const rows=mode==='sales'?[...result.rows].sort((a,b)=>b.sold-a.sold || b.recent-a.recent):result.rows;
    return `<header><div><small>INVENTARIO Y VENTAS</small><h2>Alertas de celulares</h2></div><button type="button" data-phone-action="refresh">Actualizar</button></header><p class="kora-phone-period">${result.central?'Todas las tiendas':'Tu tienda'} · ${date(result.range.start)} — ${date(result.range.end)} · Ventas registradas, sin anuladas.</p><nav aria-label="Orden de celulares"><button type="button" data-phone-action="priority" aria-pressed="${mode==='priority'}">Prioridades</button><button type="button" data-phone-action="sales" aria-pressed="${mode==='sales'}">Más vendidos</button></nav>${rows.length?`<ul>${cards(rows.slice(0,4),result.central)}</ul>${rows.length>4?`<details><summary>Ver las ${rows.length} referencias por tienda</summary><ul>${cards(rows.slice(4),result.central)}</ul></details>`:''}`:'<p>No hay ventas de celulares registradas en este período. No se recomienda comprar sin datos de venta.</p>'}<details class="kora-phone-method"><summary>Cómo se prioriza</summary><p>Sin stock: hubo ventas y no quedan unidades disponibles. Stock bajo: las existencias cubren menos de 7 días al ritmo medio del período; es una orientación, no una compra automática. No usa históricos sin detalle por referencia.</p><p>La reposición en gestión señala pedidos pendientes, remisiones o traslados; en central también órdenes de compra pendientes. No suma documentos que pueden pertenecer al mismo envío. Confirmar cantidades y fecha de llegada con Gestión.</p></details>`;
  }
  async function mount(element,sb,profile) {
    if (!element) return;
    if (!profile?.activo || !['gerencia','auditoria','admin_tienda'].includes(profile.rol)) {element.hidden=true;return;}
    element.hidden=false;
    const token={}; element._phoneLoad=token;
    element.innerHTML='<h2>Alertas de celulares</h2><p role="status">Consultando ventas e inventario…</p>';
    try {
      const result=await load(sb,profile);
      if(element._phoneLoad!==token)return;
      const render=mode=>{
        element.innerHTML=html(result,mode);
        element.querySelectorAll('[data-phone-action]').forEach(button=>button.addEventListener('click',()=>button.dataset.phoneAction==='refresh'?mount(element,sb,profile):render(button.dataset.phoneAction)));
      };
      render('priority');
    } catch(error) {
      if(element._phoneLoad!==token)return;
      element.innerHTML='<h2>Alertas de celulares</h2><p role="alert">No fue posible consultar todas las fuentes. No se muestran recomendaciones incompletas.</p><button type="button">Reintentar</button>';
      element.querySelector('button').addEventListener('click',()=>mount(element,sb,profile));
      console.warn('Alertas de celulares:',error.message);
    }
  }
  return {period,all,summarize,load,html,mount};
});
