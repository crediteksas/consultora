(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(v);
 const note='Revisión manual, sin aumento automático. Se muestran diferencias positivas, sin umbral mínimo, de mayor a menor en pesos. Promedio de los otros proveedores: un costo por proveedor para la misma referencia. Borradores y publicados se analizan por separado; las listas pueden tener distintas fechas y disponibilidad. La diferencia no es utilidad garantizada.';
 function find(report){
  const result=[];
  for(const kind of ['published','drafts'])for(const row of report[kind]){
   // Una sola oferta por proveedor evita que duplicados alteren la media.
   const values=row.cells.filter(c=>c.length).map(c=>[...c].sort((a,b)=>a.costo-b.costo)[0]);
   const best=row.best,others=values.filter(v=>v.proveedor_id!==best.proveedor_id);
   if(!others.length)continue;
   const average=others.reduce((s,v)=>s+v.costo,0)/others.length,difference=average-best.costo;
   if(difference<=0)continue;
   result.push({kind,product:row.product,best,others,average,difference,percent:difference/average*100,
    nextCost:Math.min(...others.map(v=>v.costo)),ties:values.filter(v=>v.costo===best.costo).length,
    provider:report.suppliers.find(p=>p.id===best.proveedor_id)?.nombre||'',
    costs:values.map(v=>({provider:report.suppliers.find(p=>p.id===v.proveedor_id)?.nombre||'',cost:v.costo})),
    state:kind==='drafts'?'Borrador · comparación parcial':'Ofertas publicadas'});
  }
  return result.sort((a,b)=>b.difference-a.difference||a.product.nombre.localeCompare(b.product.nombre,'es'));
 }
 function rows(report){return [['OPORTUNIDADES DE MARGEN · DECISIÓN MANUAL'],[note],['Estado','Referencia','Código','Proveedor menor costo','Costo menor','Promedio otros proveedores','Diferencia COP','Diferencia %','Siguiente costo','Precio retail registrado del proveedor','Margen registrado','Proveedores comparados','Costos comparados'],...find(report).map(o=>[o.state,o.product.nombre,o.product.codigo,o.provider,o.best.costo,Math.round(o.average*100)/100,Math.round(o.difference*100)/100,Math.round(o.percent*100)/100,o.nextCost,o.best.precio_tienda,o.best.precio_tienda-o.best.costo,o.costs.length,o.costs.map(c=>c.provider+': '+c.cost).join(' | ')])];}
 function html(report,interactive=false){
  const items=find(report);
  return '<h3>Oportunidades de margen · revisión de Óscar o Mayte</h3><p class="sub">'+note+'</p><p>'+items.length+' casos para evaluar. El precio solo cambia al editar, guardar y publicar la lista expresamente.</p><div class="b2b-opportunities">'+items.map(o=>'<article class="b2b-opportunity"><p><strong>'+esc(o.product.nombre)+'</strong><br><small>'+esc(o.product.codigo)+' · '+esc(o.state)+'</small></p><dl><div><dt>Proveedor / costo menor</dt><dd>'+esc(o.provider)+' · '+money(o.best.costo)+'</dd></div><div><dt>Promedio de los otros '+o.others.length+' proveedores</dt><dd>'+money(o.average)+'</dd></div><div><dt>Diferencia frente al promedio</dt><dd>'+money(o.difference)+' · '+o.percent.toFixed(1)+'%</dd></div><div><dt>Siguiente costo más bajo</dt><dd>'+money(o.nextCost)+(o.ties>1?' · hay empate en el menor costo':'')+'</dd></div><div><dt>Precio retail registrado de este proveedor</dt><dd>'+money(o.best.precio_tienda)+'</dd></div><div><dt>Margen registrado</dt><dd>'+money(o.best.precio_tienda-o.best.costo)+'</dd></div></dl><details><summary>Ver todos los costos comparados</summary><ul>'+o.costs.map(c=>'<li>'+esc(c.provider)+': '+money(c.cost)+'</li>').join('')+'</ul></details>'+(interactive?(o.best.draftId?'<button class="btn" data-opportunity-draft="'+esc(o.best.draftId)+'" data-opportunity-product="'+esc(o.best.producto_origen_id||o.product.id)+'">Revisar precio en la lista</button>':'<p class="sub">Consulta la lista vigente en «Consultar listas anteriores» para preparar una revisión. No se modifica la oferta publicada desde este informe.</p>'):'')+'</article>').join('')+'</div>'+(!items.length?'<p>No hay diferencias comparables: se necesitan al menos dos proveedores de la misma referencia con costos distintos. Revisa las filas pendientes del comparativo.</p>':'');
 }
 const api={find,rows,html,note};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraB2BOportunidades=api;
})(typeof globalThis!=='undefined'?globalThis:this);
