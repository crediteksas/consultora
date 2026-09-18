(function(root){
 'use strict';
 const D=typeof module==='object'&&module.exports?require('./b2b-listas-domain.js'):root.KoraB2BListas;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const amount=value=>value==null||value===''?null:D.amount(value);
 const money=value=>value==null?'—':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(value);
 const date=value=>value?new Date(value).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'—';
 const order=(a,b)=>a.costo-b.costo||a.precio_tienda-b.precio_tienda||String(a.proveedor_id).localeCompare(String(b.proveedor_id));
 function latestDrafts(rows){
  const found=new Map();
  for(const row of [...rows].sort((a,b)=>String(b.creado_at).localeCompare(String(a.creado_at))||String(b.id).localeCompare(String(a.id))))if(!found.has(row.proveedor_id))found.set(row.proveedor_id,row);
  return [...found.values()];
 }
 function build({providers,products,offers,winners,drafts,generatedAt=new Date().toISOString()}){
  const suppliers=[...providers].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const productMap=new Map(products.map(p=>[p.id,p])),supplierMap=new Map(suppliers.map(p=>[p.id,p]));
  const published=offers.filter(o=>supplierMap.has(o.proveedor_id)&&productMap.has(o.producto_id)&&o.vigente!==false).map(o=>({...o,costo:amount(o.costo),precio_tienda:amount(o.precio_tienda)}));
  if(published.some(o=>!(o.costo>0)||!(o.precio_tienda>0)))throw Error('Hay una oferta publicada con valores inválidos. No se generó un comparativo incompleto.');
  const selected=new Map(winners.map(o=>[o.producto_id,{...o,costo:amount(o.costo),precio_tienda:amount(o.precio_tienda)}]));
  const unresolved=[],draftOffers=[],sources=[];
  for(const draft of latestDrafts(drafts)){
   const provider=supplierMap.get(draft.proveedor_id);
   if(!provider)continue;
   sources.push({provider:provider.nombre,id:draft.id,date:draft.creado_at,state:draft.lista_id?'Publicado anteriormente':'Borrador sin publicar'});
   // Los borradores se comparan aparte: nunca sustituyen lo que está publicado.
   if(draft.lista_id)continue;
   if(!Array.isArray(draft.filas))throw Error('Una lista guardada no se pudo leer. Reintenta antes de descargar.');
   const duplicates=new Map();
   for(const row of draft.filas)if(row.included===true&&row.producto_id)duplicates.set(row.producto_id,(duplicates.get(row.producto_id)||0)+1);
   for(const row of draft.filas){
    const cost=amount(row.costo),price=amount(row.precio_tienda),product=productMap.get(row.producto_id);
    let reason='';
    if(row.included!==true)reason='Excluida: '+(row.exclusion||'Sin motivo registrado');
    else if(!product)reason='Pendiente de vincular a una referencia activa de KORA';
    else if(row.proveedor_id!==draft.proveedor_id)reason='El proveedor de la fila no coincide con la lista';
    else if(!(cost>0)||!(price>0))reason='Falta costo o precio retail válido';
    else if(duplicates.get(row.producto_id)>1)reason='Referencia repetida en esta lista: revisar antes de comparar';
    else if(row.priceWarning&&!row.priceConfirmed)reason='Precio pendiente de confirmar';
    else if(Math.round((price-cost)*100)!==D.defaultMargin(cost)*100&&D.isDefaultReason(row.motivo))reason='Margen especial pendiente de justificar';
    if(reason)unresolved.push({provider:provider.nombre,reference:row.reference||row.original||product?.nombre||'Sin referencia',cost,price,reason,line:row.row,date:draft.creado_at});
    else draftOffers.push({...row,costo:cost,precio_tienda:price,sourceDate:draft.creado_at});
   }
  }
  function matrix(rows,isPublished){
   const grouped=new Map();
   for(const row of rows){if(!grouped.has(row.producto_id))grouped.set(row.producto_id,[]);grouped.get(row.producto_id).push(row);}
   return [...grouped].map(([id,values])=>{
    const best=[...values].sort(order)[0],actual=selected.get(id),chosen=isPublished?actual:best;
    const cells=suppliers.map(p=>values.filter(v=>v.proveedor_id===p.id));
    const tied=values.filter(v=>v.costo===best.costo);
    const matches=!!actual&&actual.proveedor_id===best.proveedor_id&&actual.costo===best.costo&&actual.precio_tienda===best.precio_tienda;
    return {product:productMap.get(id),cells,best,chosen,actual,ties:tied.length,status:isPublished?(matches?'Coincide con el menor costo vigente':'REVISAR: selección publicada distinta o no disponible'):'Propuesta parcial · no publicada'};
   }).sort((a,b)=>a.product.nombre.localeCompare(b.product.nombre,'es'));
  }
  const publishedSources=published.map(o=>({provider:supplierMap.get(o.proveedor_id).nombre,id:o.lista_id,date:o.b2b_listas_precios?.creado_at,state:'Oferta vigente publicada',file:o.b2b_listas_precios?.archivo||''}));
  const uniqueSources=[...new Map([...publishedSources,...sources].map(s=>[s.provider+'|'+s.id+'|'+s.state,s])).values()];
  return {suppliers,published:matrix(published,true),drafts:matrix(draftOffers,false),unresolved,sources:uniqueSources,generatedAt};
 }
 function rows(report,kind){
  return [['Referencia','Código',...report.suppliers.map(p=>'Costo · '+p.nombre),'Menor costo','Proveedor de menor costo','Proveedor elegido / propuesto','Costo elegido','Margen elegido','Precio retail elegido / propuesto','Precio publicado que ve la tienda','Validación'],...report[kind].map(r=>[r.product.nombre,r.product.codigo,...r.cells.map(c=>c.length?c.map(x=>x.costo).join(' | '):''),r.best.costo,report.suppliers.find(p=>p.id===r.best.proveedor_id)?.nombre,report.suppliers.find(p=>p.id===r.chosen?.proveedor_id)?.nombre,r.chosen?.costo??'',r.chosen?r.chosen.precio_tienda-r.chosen.costo:'',r.chosen?.precio_tienda??'',r.actual?.precio_tienda??'',r.status+(r.ties>1?' · empate en costo':'')])];
 }
 function csv(report){
  return D.csv([['KORA · Comparativo de proveedores'],['Consulta (Colombia)',date(report.generatedAt)],['Moneda','COP. Costos registrados, sin agregar IVA. No incluye cambios sin guardar.'],['PUBLICADO: LO QUE VE LA TIENDA'],...rows(report,'published'),[],['BORRADORES: ÚLTIMA LISTA GUARDADA POR PROVEEDOR, NO PUBLICADA'],['Comparación parcial: no incluye ofertas publicadas ni filas pendientes/excluidas; no reemplaza el precio de la tienda.'],...rows(report,'drafts'),[],['PENDIENTES Y EXCLUIDAS'],['Proveedor','Referencia original','Costo','Precio retail propuesto','Estado / motivo','Línea','Guardado en KORA'],...report.unresolved.map(r=>[r.provider,r.reference,r.cost,r.price,r.reason,r.line,date(r.date)]),[],['FUENTES'],['Proveedor','Estado','Guardado / publicado en KORA','Archivo','ID de trazabilidad'],...report.sources.map(s=>[s.provider,s.state,date(s.date),s.file||'',s.id])]);
 }
 function html(report){
  function table(kind){
   const list=report[kind];
   if(!list.length)return '<p class="empty">'+(kind==='published'?'No hay ofertas publicadas para mostrar a las tiendas. Los borradores de abajo todavía no están visibles para ellas.':'No hay referencias vinculadas y válidas en los últimos borradores sin publicar. Revisa las pendientes de abajo.')+'</p>';
   return '<div class="scroll"><table><thead><tr><th>Referencia</th>'+report.suppliers.map(p=>'<th>'+esc(p.nombre)+'<small>Costo proveedor</small></th>').join('')+'<th>Menor costo</th><th>Elegido / propuesto</th><th>Costo elegido</th><th>Margen</th><th>Precio retail</th><th>La tienda ve</th><th>Validación</th></tr></thead><tbody>'+list.map(r=>'<tr><th>'+esc(r.product.nombre)+'<small>'+esc(r.product.codigo)+'</small></th>'+r.cells.map(c=>'<td class="num '+(c.some(x=>x.costo===r.best.costo)?'best':'')+'">'+(c.length?c.map(x=>money(x.costo)).join('<br>'):'<span class="muted">Sin oferta</span>')+'</td>').join('')+'<td class="num best">'+money(r.best.costo)+'</td><td>'+esc(report.suppliers.find(p=>p.id===r.chosen?.proveedor_id)?.nombre||'No disponible')+'</td><td class="num">'+money(r.chosen?.costo)+'</td><td class="num">'+money(r.chosen?r.chosen.precio_tienda-r.chosen.costo:null)+'</td><td class="num"><strong>'+money(r.chosen?.precio_tienda)+'</strong></td><td class="num">'+money(r.actual?.precio_tienda)+'</td><td>'+esc(r.status)+(r.ties>1?'<small>Empate en costo</small>':'')+'</td></tr>').join('')+'</tbody></table></div>';
  }
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KORA · Comparativo de proveedores</title><style>body{margin:0;background:#f5f7fa;color:#0b1e3d;font:14px/1.5 Arial,sans-serif}main{padding:24px;max-width:1900px;margin:auto}h1{font-size:27px}h2{font-size:20px}section,header{background:#fff;padding:22px;border:1px solid #dfe6ef;border-top:3px solid #00c4cc;border-radius:14px;margin-bottom:20px}.scroll{overflow:auto;max-height:75vh}table{width:100%;border-collapse:separate;border-spacing:0}th,td{text-align:left;padding:12px;border-bottom:1px solid #dfe6ef;vertical-align:top}thead th{background:#0b1e3d;color:white;position:sticky;top:0;z-index:2;min-width:120px}tbody th{min-width:210px;position:sticky;left:0;background:#fff;z-index:1}small{display:block;font-weight:normal;font-size:12px}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.best{background:#dcfce7;color:#166534;font-weight:bold}.muted,.empty{color:#64748b}.notice{padding:12px;background:#fff7ed;border-left:3px solid #ea9e26}.stats{display:flex;gap:20px;flex-wrap:wrap}.tag{padding:10px;background:#eefbfc;border-radius:8px}@media(max-width:700px){main{padding:10px}section,header{padding:14px}h1{font-size:23px}}@media print{.scroll{max-height:none;overflow:visible}thead{display:table-header-group}thead th,tbody th{position:static}body{background:white}main{padding:0}section{break-before:page}th,td{padding:5px;font-size:10px}}@page{size:A3 landscape;margin:10mm}</style></head><body><main><header><small>KORA · B2B · Uso interno de Administración</small><h1>Comparativo de proveedores</h1><p>Consultado: '+esc(date(report.generatedAt))+' (Colombia). Valores en pesos colombianos.</p><div class="stats"><span class="tag">'+report.suppliers.length+' proveedores activos</span><span class="tag">'+report.published.length+' referencias publicadas</span><span class="tag">'+report.drafts.length+' referencias comparables en borrador</span><span class="tag">'+report.unresolved.length+' filas pendientes o excluidas</span></div><p>'+esc(D.marginPolicy)+'. Las excepciones requieren un motivo; las ofertas publicadas conservan sus valores registrados.</p><p>Verde = menor costo entre las ofertas comparables de esa sección. Se conserva el precio retail registrado y su margen; no se suma IVA ni se modifica ninguna lista. Los empates se resuelven por precio retail y luego por identificador de proveedor, como en el catálogo.</p><p class="notice">Los borradores NO son precios publicados. Solo se comparan referencias vinculadas al mismo producto de KORA; no se mezclan variantes por similitud de nombre. Las filas sin vincular deben revisarse antes de confirmar que el comparativo está completo. No incluye cambios sin guardar en pantalla.</p></header><section><h2>1. Publicado: lo que ve la tienda</h2><p>Comparación de todas las ofertas vigentes de proveedores activos. La selección publicada se consulta directamente del catálogo.</p>'+table('published')+'</section><section><h2>2. Últimos borradores por proveedor · sin publicar</h2><p class="notice">Vista parcial solo de borradores sin publicar: no mezcla ofertas publicadas ni versiones anteriores. El menor costo aquí es una propuesta, no necesariamente el menor del catálogo completo.</p>'+table('drafts')+'</section><section><h2>3. Pendientes y excluidas · no participan en la elección</h2><div class="scroll"><table><thead><tr><th>Proveedor</th><th>Referencia original</th><th>Costo</th><th>Precio propuesto</th><th>Estado / motivo</th><th>Línea</th></tr></thead><tbody>'+report.unresolved.map(r=>'<tr><td>'+esc(r.provider)+'</td><td>'+esc(r.reference)+'</td><td class="num">'+money(r.cost)+'</td><td class="num">'+money(r.price)+'</td><td>'+esc(r.reason)+'</td><td>'+esc(r.line)+'</td></tr>').join('')+'</tbody></table></div>'+(!report.unresolved.length?'<p class="empty">Sin filas pendientes o excluidas en los borradores consultados.</p>':'')+'</section><section><h2>4. Fuentes utilizadas</h2><p>La fecha corresponde al guardado o publicación en KORA, no garantiza disponibilidad física ni vigencia comercial del proveedor.</p><div class="scroll"><table><thead><tr><th>Proveedor</th><th>Estado</th><th>Fecha en KORA</th><th>Archivo / trazabilidad</th></tr></thead><tbody>'+report.sources.map(s=>'<tr><td>'+esc(s.provider)+'</td><td>'+esc(s.state)+'</td><td>'+esc(date(s.date))+'</td><td>'+esc(s.file||'Lista de WhatsApp')+'<small>'+esc(s.id)+'</small></td></tr>').join('')+'</tbody></table></div></section></main></body></html>';
 }
 async function all(factory){const data=[];for(let start=0;;start+=500){const r=await factory().range(start,start+499);if(r.error)throw r.error;if(!Array.isArray(r.data))throw Error('Respuesta incompleta al consultar el comparativo.');data.push(...r.data);if(r.data.length<500)return data;}}
 async function load(sb,profile){
  if(!profile?.activo||!['gerencia','auditoria'].includes(profile.rol))throw Error('El comparativo de costos es exclusivo de Administración.');
  const [providers,products,offers,winners,metadata]=await Promise.all([
   all(()=>sb.from('proveedores').select('id,nombre').eq('activo',true).order('id')),
   all(()=>sb.from('productos').select('id,codigo,nombre').eq('activo',true).order('id')),
   all(()=>sb.from('b2b_ofertas').select('id,lista_id,producto_id,proveedor_id,costo,precio_tienda,vigente,b2b_listas_precios(creado_at,archivo)').eq('vigente',true).order('id')),
   all(()=>sb.from('b2b_mejor_oferta').select('producto_id,proveedor_id,costo,precio_tienda').order('producto_id')),
   all(()=>sb.from('b2b_catalogo_borradores').select('id,proveedor_id,creado_at,lista_id').order('creado_at',{ascending:false}).order('id'))
  ]);
  const latest=latestDrafts(metadata),drafts=[];
  for(let i=0;i<latest.length;i+=100){const ids=latest.slice(i,i+100).map(d=>d.id);drafts.push(...await all(()=>sb.from('b2b_catalogo_borradores').select('id,proveedor_id,creado_at,lista_id,filas').in('id',ids).order('id')));}
  if(drafts.length!==latest.length)throw Error('Una lista cambió durante la consulta. Reintenta la descarga.');
  return build({providers,products,offers,winners,drafts});
 }
 function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 function mount({sb,profile,container}){
  container.innerHTML='<div class="list-heading"><div><h2>Comparativo de proveedores</h2><p class="sub">Todos los costos, el menor precio y lo que ve la tienda. Incluye borradores y pendientes por separado.</p></div><div class="actions"><button class="btn primary" data-comparison="html">Descargar informe visual</button><button class="btn" data-comparison="csv">Descargar para Excel (CSV)</button></div></div><p data-comparison-status role="status" aria-live="polite"></p>';
  container.querySelectorAll('[data-comparison]').forEach(button=>button.onclick=async()=>{
   const buttons=container.querySelectorAll('button'),status=container.querySelector('[data-comparison-status]');buttons.forEach(b=>b.disabled=true);status.textContent='Consultando todas las listas guardadas…';
   try{const report=await load(sb,profile()),format=button.dataset.comparison;download(format==='csv'?csv(report):html(report),format==='csv'?'text/csv;charset=utf-8':'text/html;charset=utf-8','KORA-Comparativo-proveedores-'+report.generatedAt.slice(0,10)+'.'+format);status.textContent='Informe descargado: '+report.published.length+' referencias publicadas, '+report.drafts.length+' comparables en borrador y '+report.unresolved.length+' filas pendientes o excluidas. No se modificaron precios.';}catch(error){status.textContent='No se pudo descargar: '+error.message;}finally{buttons.forEach(b=>b.disabled=false);}
  });
 }
 const api={latestDrafts,build,rows,csv,html,all,load,mount};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraB2BComparativo=api;
})(typeof globalThis!=='undefined'?globalThis:this);
