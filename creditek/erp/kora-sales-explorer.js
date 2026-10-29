(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.KoraSalesExplorer = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const cents = value => number(value) == null ? null : Math.round(Number(value) * 100);
  const money = value => value == null ? 'No disponible' : new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:2}).format(value / 100);
  const uuid = value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(value || ''));
  function day(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
    const parsed = new Date(value);
    return value && Number.isFinite(+parsed) ? new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(parsed) : '';
  }
  function range(selection) {
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(+new Date(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
    if (!valid(selection.from) || !valid(selection.to) || selection.from > selection.to) throw Error('El período del resumen no es válido.');
    return {...selection};
  }
  function documentLink(kind, id) {
    if (!uuid(id)) return '';
    const routes = {retail:['ventas.html','documento'],b2b:['remisiones.html','documento'],aliados:['aliados-liquidaciones.html','lote'],expense:['gastos.html','documento']};
    const route = routes[kind];
    return route ? route[0]+'?'+route[1]+'='+encodeURIComponent(id) : '';
  }
  function safeHref(value) {
    if (!value) return '';
    let url;try{url=new URL(value, 'https://kora.invalid/creditek/erp/');}catch{return '';}
    return url.origin === 'https://kora.invalid' && /^\/creditek\/erp\/(ventas|remisiones|aliados-liquidaciones|gastos)\.html$/.test(url.pathname) ? url.pathname.slice('/creditek/erp/'.length)+url.search : '';
  }
  function reference(operation) {
    return text(operation.referencia) || text(operation.modelo) || text(operation.normalized_data?.referencia) || text(operation.normalized_data?.modelo) || 'Referencia no informada';
  }
  function fromOperations(operations, names = new Map(), profit = false, saleDay = day) {
    return operations.map(o => ({
      id:String(o.id),date:saleDay(o.operation_at),storeKey:text(o.origen_codigo) || text(o.establishment_name) || 'unknown',
      store:names.get(o.origen_codigo) || text(o.establishment_name) || text(o.origen_codigo) || 'Establecimiento no informado',
      reference:reference(o),quantity:o.reversion_id ? -1 : 1,amount:cents(profit ? o.utilidad_creditek : o.monto_base),
      documentKey:String(o.id),document:(o.reversion_id ? 'Reversión · ' : 'Crédito · ')+(text(o.external_id) || 'Sin número informado'),
      href:documentLink('aliados',o.liquidation_id),linkLabel:'Abrir liquidación',platform:text(o.plataforma) || 'Plataforma no informada',
    }));
  }
  function fromB2B(rows, profit = false) {
    return rows.map(o => ({
      id:String(o.margen_id || o.id || o.remision_item_id),date:day(o.fecha),storeKey:text(o.tienda_codigo) || 'unknown',
      store:text(o.tienda_nombre) || text(o.tienda_codigo) || 'Cliente no informado',reference:text(o.producto_nombre) || text(o.referencia_nombre) || text(o.referencia) || 'Referencia no informada',
      quantity:number(o.cantidad),amount:profit ? cents(o.utilidad) : cents(o.facturado),
      documentKey:text(o.remision_id) || String(o.margen_id || o.id),document:'Remisión · '+(text(o.remision_consecutivo) || text(o.consecutivo) || (uuid(o.remision_id) ? String(o.remision_id).slice(0,8) : 'Sin número informado')),
      href:documentLink('b2b',o.remision_id),linkLabel:'Abrir remisión',platform:'B2B',
    }));
  }
  function fromRetail(sales, items, names = new Map(), profit = false) {
    const bySale = new Map();
    for (const item of items) { if (!bySale.has(item.venta_id)) bySale.set(item.venta_id,[]); bySale.get(item.venta_id).push(item); }
    return sales.flatMap(sale => {
      const base = {date:day(sale.fecha),storeKey:sale.tienda_codigo,store:names.get(sale.tienda_codigo) || sale.tienda_codigo || 'Tienda no informada',documentKey:sale.id,document:'Venta #'+(sale.consecutivo ?? 'Sin número'),href:documentLink('retail',sale.id),linkLabel:'Abrir venta',platform:'Retail'};
      const lines = (bySale.get(sale.id) || []).map(item => ({...base,id:String(item.id),reference:text(item.productos?.nombre) || 'Referencia no informada',quantity:number(item.cantidad),amount:profit ? cents(item.utilidad) : number(item.cantidad) == null || cents(item.precio_venta) == null ? null : Math.round(cents(item.precio_venta)*Number(item.cantidad))}));
      if (!lines.length) return [{...base,id:'missing:'+sale.id,reference:'Venta sin líneas consultables',quantity:null,amount:profit ? null : cents(sale.total)}];
      if (!profit && lines.every(line => line.amount != null) && cents(sale.total) != null) {
        const difference = cents(sale.total)-lines.reduce((n,line)=>n+line.amount,0);
        if (difference) lines.push({...base,id:'difference:'+sale.id,reference:'Diferencia del total registrado',quantity:0,amount:difference});
      }
      return lines;
    });
  }
  function ledgerRows(entries, label, names = new Map(), storeKey = 'CENTRAL') {
    return entries.map(e => ({id:label+':'+e.id,date:day(e.date || e.created_at || e.fecha),storeKey:e.store || e.tienda_codigo || storeKey,store:names.get(e.store || e.tienda_codigo) || (e.store || e.tienda_codigo ? text(e.store || e.tienda_codigo) : 'Gastos generales del negocio'),reference:label,quantity:0,amount:cents(e.value),documentKey:label+':'+e.id,document:label,href:e.href || '',linkLabel:'Abrir gasto',platform:'Gastos y ajustes'}));
  }
  async function allRows(sb, table, columns, filter = q=>q) {
    const result=[];
    for(let from=0;;from+=500){
      const {data,error}=await filter(sb.from(table).select(columns)).order('id').range(from,from+499);
      if(error)throw error;
      if(!Array.isArray(data))throw Error('La consulta no devolvió todos los registros.');
      result.push(...data);if(data.length<500)return result;
    }
  }
  async function retailRows(sb, selection, names = new Map(), profitData) {
    const s=range(selection), sales=await allRows(sb,'ventas','id,consecutivo,fecha,tienda_codigo,total',q=>{q=q.eq('anulada',false).gte('fecha',s.from).lte('fecha',s.to);if(s.store)q=q.eq('tienda_codigo',s.store);if(s.type)q=q.eq('tipo',s.type);return q;});
    const items=[];
    for(let i=0;i<sales.length;i+=200)items.push(...await allRows(sb,'venta_items_lectura','id,venta_id,cantidad,precio_venta,utilidad,productos(nombre)',q=>q.in('venta_id',sales.slice(i,i+200).map(x=>x.id))));
    const rows=fromRetail(sales,items,names,s.profit);
    if(s.profit){
      if(!profitData)throw Error('No se pudo comprobar el desglose de gastos.');
      const data=await profitData();
      if(!s.store && data.generalAvailable===false)throw Error('No tienes acceso al consolidado de gastos generales.');
      rows.push(...ledgerRows(data.expenses.map(e=>({...e,value:number(e.monto)==null?null:-Number(e.monto),href:documentLink('expense',e.id)})),'Gasto aprobado',names));
      rows.push(...ledgerRows(data.writeoffs.map(e=>({...e,value:number(e.valor)==null?null:-Number(e.valor)})),'Baja de inventario autorizada',names));
      rows.push(...ledgerRows(data.generalExpenses.map(e=>({...e,value:number(e.amount)==null?null:-Number(e.amount)})),'Gasto general Retail',names));
    }
    return rows;
  }
  async function enrichOperations(sb, operations) {
    const ids=[...new Set(operations.filter(o=>!o.historical && !String(o.id).startsWith('addi:')).map(o=>o.original_operation_id || o.id).filter(uuid))],map=new Map();
    for(let i=0;i<ids.length;i+=200){
      const rows=await allRows(sb,'liquidation_operations','id,liquidation_id,referencia,modelo,establishment_name,monto_base',q=>q.in('id',ids.slice(i,i+200)));
      for(const row of rows)map.set(row.id,row);
    }
    if(ids.some(id=>!map.has(id)))throw Error('No se pudieron consultar todos los créditos del resumen.');
    return operations.map(o=>({...map.get(o.original_operation_id || o.id),...o}));
  }
  function filterRows(rows, filters) {
    const search=(filters.search || '').trim().toLocaleLowerCase('es');
    return rows.filter(r=>(!filters.store || r.storeKey===filters.store) && (!filters.reference || r.reference===filters.reference) && (!search || [r.store,r.reference,r.document,r.platform].join(' ').toLocaleLowerCase('es').includes(search)));
  }
  function summarize(rows) {
    return {documents:new Set(rows.map(r=>r.documentKey)).size,quantity:rows.some(r=>r.quantity==null)?null:rows.reduce((n,r)=>n+r.quantity,0),amount:rows.some(r=>r.amount==null)?null:rows.reduce((n,r)=>n+r.amount,0),missing:rows.filter(r=>r.amount==null).length};
  }
  function groupRows(rows, field) {
    const groups=new Map();
    for(const row of rows){const key=field==='store'?row.storeKey:row.reference;if(!groups.has(key))groups.set(key,{key,label:field==='store'?row.store:row.reference,rows:[]});groups.get(key).rows.push(row);}
    return [...groups.values()].map(g=>({...g,...summarize(g.rows)})).sort((a,b)=>(b.amount??-Infinity)-(a.amount??-Infinity)||a.label.localeCompare(b.label,'es'));
  }
  let dialog, sequence=0, opener, currentRows=[], currentConfig, filters, view='store', page=0, displayedGroups=[];
  const PAGE_SIZE=50;
  function ensureDialog() {
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.className='kora-explorer';dialog.setAttribute('aria-labelledby','koraExplorerTitle');document.body.append(dialog);
    dialog.addEventListener('close',()=>{sequence++;currentRows=[];currentConfig=null;dialog.innerHTML='';if(opener?.isConnected)opener.focus();});
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.explorerAction==='close')dialog.close();
      if(button.dataset.explorerAction==='retry' && currentConfig)open(currentConfig);
      if(button.dataset.explorerAction==='clear'){filters={store:'',reference:'',search:''};for(const id of['Store','Reference','Search'])dialog.querySelector('#koraExplorer'+id).value='';page=0;render();}
      if(button.dataset.explorerView){view=button.dataset.explorerView;page=0;render();}
      if(button.dataset.explorerPage){page+=Number(button.dataset.explorerPage);render();}
      if(button.dataset.explorerGroup!=null){const group=displayedGroups[Number(button.dataset.explorerGroup)];if(!group)return;if(view==='store'){filters.store=group.key;dialog.querySelector('#koraExplorerStore').value=group.key;view='reference';}else{filters.reference=group.key;dialog.querySelector('#koraExplorerReference').value=group.key;view='documents';}page=0;render();}
    });
    dialog.addEventListener('input',event=>{const keys={koraExplorerStore:'store',koraExplorerReference:'reference',koraExplorerSearch:'search'},key=keys[event.target.id];if(key){filters[key]=event.target.value;page=0;render();}});
  }
  function shell(config) {
    return `<header class="kora-explorer__head"><div><p>Resumen → detalle</p><h2 id="koraExplorerTitle">${esc(config.title)}</h2><p>${esc(config.from)} a ${esc(config.to)}</p></div><button type="button" class="kora-explorer__button" data-explorer-action="close" aria-label="Cerrar detalle">Cerrar</button></header><div class="kora-explorer__body"><p class="kora-explorer__note">${esc(config.note || 'Detalle de los registros del resumen seleccionado. Puedes explorar por tienda, referencia y documento.')}</p><div id="koraExplorerBody" role="status">Consultando el detalle…</div></div>`;
  }
  async function open(config) {
    ensureDialog();const ticket=++sequence;currentConfig=config;opener=config.trigger || (dialog.open ? opener : document.activeElement);currentRows=[];filters={store:'',reference:'',search:''};view='store';page=0;
    dialog.innerHTML=shell(config);if(!dialog.open)dialog.showModal();
    try{
      range(config);const rows=await config.load();if(ticket!==sequence || !dialog.open)return;
      if(!Array.isArray(rows))throw Error('Respuesta incompleta');currentRows=rows;
      const options=(field)=>[...new Map(rows.map(r=>field==='store'?[r.storeKey,r.store]:[r.reference,r.reference])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'es')).map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join('');
      dialog.querySelector('#koraExplorerBody').outerHTML=`<div class="kora-explorer__filters"><label>Tienda o cliente<select id="koraExplorerStore"><option value="">Todos</option>${options('store')}</select></label><label>Referencia o concepto<select id="koraExplorerReference"><option value="">Todas</option>${options('reference')}</select></label><label>Buscar<input id="koraExplorerSearch" type="search" placeholder="Referencia, documento o plataforma"></label><button type="button" class="kora-explorer__button" data-explorer-action="clear">Limpiar detalle</button></div><div class="kora-explorer__views" role="group" aria-label="Explorar detalle"><button type="button" data-explorer-view="store">Por tienda o cliente</button><button type="button" data-explorer-view="reference">Por referencia</button><button type="button" data-explorer-view="documents">Documentos</button></div><div id="koraExplorerTotals" class="kora-explorer__totals" aria-live="polite"></div><div id="koraExplorerResults"></div>`;
      render();
    }catch(error){if(ticket!==sequence || !dialog.open)return;(dialog.querySelector('#koraExplorerBody') || dialog.querySelector('.kora-explorer__body')).innerHTML='<p role="alert">No se pudo consultar todo el detalle. No se muestran resultados parciales.</p><button type="button" class="kora-explorer__button" data-explorer-action="retry">Reintentar</button>';}
  }
  function render() {
    const selected=filterRows(currentRows,filters),total=summarize(selected),rows=view==='documents'?selected:groupRows(selected,view),last=Math.max(0,Math.ceil(rows.length/PAGE_SIZE)-1);page=Math.max(0,Math.min(page,last));displayedGroups=rows;
    dialog.querySelectorAll('[data-explorer-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.explorerView===view)));
    dialog.querySelector('#koraExplorerTotals').innerHTML=`<div><span>Documentos / registros</span><strong>${total.documents}</strong></div><div><span>Unidades netas</span><strong>${total.quantity ?? 'No informadas'}</strong></div><div><span>${esc(currentConfig.valueLabel || 'Valor vendido')}</span><strong>${money(total.amount)}</strong></div>${total.missing?'<p>Hay importes pendientes de confirmar. No se sustituyen por cero.</p>':''}`;
    const shown=rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    const body=shown.map((r,index)=>view==='documents'?`<tr><td>${esc(r.date)}</td><td>${esc(r.store)}</td><td>${esc(r.reference)}</td><td>${r.quantity ?? '—'}</td><td>${money(r.amount)}</td><td>${esc(r.document)}<small>${esc(r.platform)}</small>${safeHref(r.href)?`<a href="${esc(safeHref(r.href))}" target="_blank" rel="noopener">${esc(r.linkLabel || 'Abrir documento')} ↗</a>`:''}</td></tr>`:`<tr><td><button type="button" class="kora-explorer__link" data-explorer-group="${page*PAGE_SIZE+index}">${esc(r.label)}</button></td><td>${r.documents}</td><td>${r.quantity ?? '—'}</td><td>${money(r.amount)}</td></tr>`).join('');
    const headings=view==='documents'?['Fecha','Tienda / cliente','Referencia / concepto','Unidades',currentConfig.valueLabel || 'Valor','Documento']:[view==='store'?'Tienda o cliente':'Referencia o concepto','Documentos','Unidades',currentConfig.valueLabel || 'Valor vendido'];
    dialog.querySelector('#koraExplorerResults').innerHTML=rows.length?`<div class="kora-explorer__table" tabindex="0"><table><thead><tr>${headings.map(x=>'<th>'+esc(x)+'</th>').join('')}</tr></thead><tbody>${body}</tbody></table></div><div class="kora-explorer__paging"><button type="button" class="kora-explorer__button" data-explorer-page="-1" ${page===0?'disabled':''}>Anterior</button><span>${page*PAGE_SIZE+1}–${Math.min(rows.length,(page+1)*PAGE_SIZE)} de ${rows.length}</span><button type="button" class="kora-explorer__button" data-explorer-page="1" ${page===last?'disabled':''}>Siguiente</button></div>`:'<p class="kora-explorer__empty">No hay registros con estos filtros.</p>';
  }
  return {open,cents,day,range,documentLink,safeHref,reference,fromOperations,fromB2B,fromRetail,ledgerRows,retailRows,enrichOperations,allRows,filterRows,summarize,groupRows};
});
