(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fecha=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',year:'numeric'}):'Fecha no disponible';
 const dinero=v=>v==null?'No disponible':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v));
 function render(offers,providers,products){
  const grupos=new Map(), nombres=new Map(providers.map(p=>[p.id,p.nombre])), referencias=new Map(products.map(p=>[p.id,p.nombre]));
  for(const offer of offers){if(!offer.vigente||!offer.proveedor_id)continue;if(!grupos.has(offer.proveedor_id))grupos.set(offer.proveedor_id,[]);grupos.get(offer.proveedor_id).push(offer);}
  if(!grupos.size)return '<p>No hay ofertas vigentes publicadas.</p>';
  return [...grupos].sort((a,b)=>(nombres.get(a[0])||'').localeCompare(nombres.get(b[0])||'','es')).map(([id,items])=>{
   const fuentes=new Map();for(const item of items){const f=item.b2b_listas_precios;if(item.lista_id)fuentes.set(item.lista_id,f);}
   const fechas=[...fuentes.values()].map(f=>f?.creado_at).filter(Boolean).sort().reverse();
   const name=nombres.get(id)||'Proveedor no disponible';
   return `<details class="card"><summary><strong>${esc(name)}</strong> · ${items.length} ofertas vigentes · última publicación ${esc(fecha(fechas[0]))}</summary><p class="sub">${fuentes.size>1?'Incluye ofertas de varias publicaciones; cada referencia muestra su fecha.':'Fecha de publicación en KORA; consulta vigencia y disponibilidad con el proveedor.'}</p><div class="table-wrap"><table class="list-preview"><thead><tr><th>Referencia</th><th>Costo proveedor</th><th>Precio tienda</th><th>Publicado en KORA</th></tr></thead><tbody>${items.sort((a,b)=>(referencias.get(a.producto_id)||'').localeCompare(referencias.get(b.producto_id)||'','es')).map(o=>`<tr><td>${esc(referencias.get(o.producto_id)||'Referencia no disponible')}</td><td>${esc(dinero(o.costo))}</td><td>${esc(dinero(o.precio_tienda))}</td><td>${esc(fecha(o.b2b_listas_precios?.creado_at))}</td></tr>`).join('')}</tbody></table></div></details>`;
  }).join('');
 }
 async function cargar({sb,container,providers,products,onNewList}){
  container.innerHTML='<h2>Listas vigentes publicadas</h2><p class="sub" role="status">Consultando ofertas vigentes…</p>';
  try{
   const offers=await root.KoraB2BComparativo.all(()=>sb.from('b2b_ofertas').select('id,lista_id,producto_id,proveedor_id,costo,precio_tienda,vigente,b2b_listas_precios(creado_at,archivo)').eq('vigente',true).order('id'));
   container.innerHTML='<div class="list-heading"><h2>Listas vigentes publicadas</h2><div class="actions"><button type="button" class="btn" data-vigentes-refresh>Actualizar</button><button type="button" class="btn primary" data-vigentes-new>Cargar lista</button></div></div><p class="sub">Ofertas activas para pedidos. La fecha corresponde a su publicación en KORA.</p>'+render(offers,providers,products);
  }catch(error){container.innerHTML='<h2>Listas vigentes publicadas</h2><p role="alert">No se pudieron consultar las ofertas vigentes. '+esc(error.message||'Intenta de nuevo.')+'</p><button type="button" class="btn" data-vigentes-refresh>Reintentar</button>';}
  container.querySelector('[data-vigentes-refresh]')?.addEventListener('click',()=>cargar({sb,container,providers,products,onNewList}));
  container.querySelector('[data-vigentes-new]')?.addEventListener('click',()=>onNewList?.());
 }
 const api={render,cargar};if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraB2BListasVigentes=api;
})(typeof globalThis!=='undefined'?globalThis:this);
