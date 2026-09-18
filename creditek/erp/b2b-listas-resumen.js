(function(root){
 'use strict';
 const W=typeof module==='object'&&module.exports?require('./b2b-whatsapp-domain.js'):root.KoraB2BWhatsApp;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const META='id,proveedor_id,creado_at,lista_id';
 const PAGE_SIZE=500;

 function latestPerProvider(drafts){
  const latest=new Map();
  const timestamp=draft=>Number.isFinite(Date.parse(draft.creado_at))?Date.parse(draft.creado_at):-Infinity;
  for(const draft of drafts){
   if(!draft?.id||!draft.proveedor_id)continue;
   const previous=latest.get(draft.proveedor_id);
   if(!previous||timestamp(draft)>timestamp(previous)||(timestamp(draft)===timestamp(previous)&&String(draft.id)>String(previous.id)))latest.set(draft.proveedor_id,draft);
  }
  return [...latest.values()];
 }

 function isAuxiliary(row){
  // Only an explicit exclusion reason can classify a row as auxiliary text.
  return row.included===false&&/\b(encabezados?|separador(?:es)?|contactos?|saludos?|despedida|texto informativo|informacion de contacto|pie de pagina)\b/.test(normalize(row.exclusion));
 }

 function summarize(rows,validate=W?.validate){
  const unavailable={available:false,total:null,included:null,validIncluded:null,pendingIncluded:null,excluded:null,headers:null,excludedWithoutReason:null};
  if(!Array.isArray(rows)||typeof validate!=='function'||rows.some(row=>!row||typeof row!=='object'||typeof row.included!=='boolean'))return unavailable;
  const result={available:true,total:rows.length,included:0,validIncluded:0,pendingIncluded:0,excluded:0,headers:0,excludedWithoutReason:0};
  const duplicates=new Map();
  for(const row of rows.filter(row=>row.included&&row.producto_id&&row.proveedor_id)){
   const key=JSON.stringify([row.producto_id,row.proveedor_id]);duplicates.set(key,(duplicates.get(key)||0)+1);
  }
  try{
   for(const row of rows){
    if(row.included){
     result.included++;
     const errors=validate([row]);
     if(!Array.isArray(errors))return unavailable;
     if(!row.producto_id||errors.length||(duplicates.get(JSON.stringify([row.producto_id,row.proveedor_id]))||0)>1)result.pendingIncluded++;
     else result.validIncluded++;
    }else if(isAuxiliary(row))result.headers++;
    else{result.excluded++;if(!String(row.exclusion??'').trim())result.excludedWithoutReason++;}
   }
  }catch{return unavailable;}
  return result;
 }

 async function loadLatest(sb){
  const metadata=[];
  for(let from=0;;from+=PAGE_SIZE){
   const {data,error}=await sb.from('b2b_catalogo_borradores').select(META).order('creado_at',{ascending:false}).order('id',{ascending:false}).range(from,from+PAGE_SIZE-1);
   if(error)throw error;
   if(!Array.isArray(data))throw Error('No se recibió el historial de listas guardadas.');
   metadata.push(...data);
   if(data.length<PAGE_SIZE)break;
  }
  const latest=latestPerProvider(metadata),details=new Map();
  // Historical rows can be large: fetch content only for the latest saved list of each supplier.
  for(let start=0;start<latest.length;start+=50){
   const ids=latest.slice(start,start+50).map(draft=>draft.id);
   try{
    const {data,error}=await sb.from('b2b_catalogo_borradores').select('id,filas,lista_id').in('id',ids).order('id');
    if(error)throw error;
    if(!Array.isArray(data))throw Error('No se recibieron las filas guardadas.');
    for(const draft of data)details.set(draft.id,draft);
   }catch(error){for(const id of ids)details.set(id,{loadError:error.message||'No se pudo leer esta lista.'});}
  }
  return {totalDrafts:new Set(metadata.map(draft=>draft.id)).size,drafts:latest.map(draft=>{
   const detail=details.get(draft.id);
   return {...draft,...detail,loadError:detail?.loadError||(!detail?'La lista no está disponible. Actualiza para volver a consultarla.':null)};
  })};
 }

 function mount(ctx){
  const {container}=ctx;
  let entries=[],inflight=null,totalDrafts=null;
  container.innerHTML='<div class="list-heading"><div><h2>Listas guardadas</h2><p class="sub">Continúa con la última lista de cada proveedor.</p></div><div class="actions"><button type="button" class="btn" data-summary-refresh>Actualizar</button><button type="button" class="btn primary" data-summary-new>Cargar lista</button></div></div><div class="grid"><label>Buscar proveedor<input type="search" data-summary-search placeholder="Nombre del proveedor"></label><label>Mostrar<select data-summary-filter><option value="all">Todas las listas</option><option value="pending">Con dudas</option><option value="draft">Borradores</option><option value="published">Publicadas</option></select></label></div><p class="sub" data-summary-status role="status"></p><div data-summary-results></div>';
  const $=selector=>container.querySelector(selector);
  const providerName=id=>ctx.providers?.find(provider=>provider.id===id)?.nombre||'Proveedor sin nombre disponible';
  const dateLabel=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'}):'Fecha no disponible';
  function render(){
   const search=normalize($('[data-summary-search]').value),filter=$('[data-summary-filter]').value;
   const shown=entries.filter(entry=>normalize(providerName(entry.proveedor_id)).includes(search)&&
    (filter==='all'||filter==='pending'&&entry.summary.pendingIncluded>0||filter==='draft'&&!entry.lista_id||filter==='published'&&entry.lista_id));
   if(!entries.length){$('[data-summary-results]').innerHTML=totalDrafts===0?'<p>No hay listas guardadas todavía. Usa «Cargar lista» para cargar la primera.</p>':'';return;}
   if(!shown.length){$('[data-summary-results]').innerHTML='<p>No hay listas que coincidan con estos filtros.</p>';return;}
   const count=value=>value==null?'No disponible':String(value);
   $('[data-summary-results]').innerHTML='<div class="table-wrap"><table class="list-preview saved-lists-table"><thead><tr><th>Proveedor</th><th>Sin dudas</th><th>Dudas</th><th>Productos excluidos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+shown.map(entry=>{
    const s=entry.summary,id=esc(entry.id);
    return `<tr><td data-label="Proveedor"><strong>${esc(providerName(entry.proveedor_id))}</strong><small>${esc(dateLabel(entry.creado_at))}</small></td><td data-label="Sin dudas">${count(s.validIncluded)}</td><td data-label="Dudas">${count(s.pendingIncluded)}</td><td data-label="Productos excluidos">${count(s.excluded)}${s.headers?`<small>${s.headers} textos auxiliares aparte</small>`:''}${s.excludedWithoutReason?`<small>${s.excludedWithoutReason} sin motivo de exclusión</small>`:''}</td><td data-label="Estado"><span class="badge${entry.lista_id?'':' warn'}">${entry.lista_id?'Publicada':'Borrador'}</span>${!s.available?`<small>${esc(entry.loadError||'No se pudieron calcular los conteos de esta lista.')}</small>`:''}</td><td data-label="Acciones"><div class="actions">${s.pendingIncluded>0?`<button type="button" class="btn primary" data-summary-open="${id}" data-summary-mode="pending">Revisar dudas</button>`:''}<button type="button" class="btn" data-summary-open="${id}" data-summary-mode="all">Ver lista</button>${s.excluded>0?`<button type="button" class="btn" data-summary-open="${id}" data-summary-mode="excluded">Ver excluidos</button>`:''}</div></td></tr>`;
   }).join('')+'</tbody></table></div>';
  }
  function refresh(){
   if(inflight)return inflight;
   inflight=(async()=>{
    container.setAttribute('aria-busy','true');$('[data-summary-refresh]').disabled=true;
    $('[data-summary-status]').textContent='Consultando listas guardadas…';
    try{
     const loaded=await loadLatest(ctx.sb);totalDrafts=loaded.totalDrafts;
     entries=loaded.drafts.map(draft=>({...draft,summary:summarize(draft.filas)})).sort((a,b)=>providerName(a.proveedor_id).localeCompare(providerName(b.proveedor_id),'es'));
     const complete=entries.every(entry=>entry.summary.available),sum=field=>complete?entries.reduce((total,entry)=>total+entry.summary[field],0):null;
     render();
     $('[data-summary-status]').textContent=complete?`${entries.length} proveedores con lista guardada. Puedes abrirlas sin volver a cargarlas.`:'Algunas listas no pudieron consultarse por completo. Sus conteos aparecen como no disponibles; usa «Actualizar» para reintentar.';
     const summary={available:complete,totalDrafts,latestDrafts:entries.length,providersWithLists:entries.length,pendingIncluded:sum('pendingIncluded'),validIncluded:sum('validIncluded'),excluded:sum('excluded'),headers:sum('headers')};
     ctx.onLoaded?.(summary);return summary;
    }catch(error){
     entries=[];totalDrafts=null;render();
     $('[data-summary-status]').textContent='No se pudieron consultar las listas guardadas. '+(error.message||'Usa «Actualizar» para reintentar.');
     const summary={available:false,totalDrafts:null,latestDrafts:null,providersWithLists:null,pendingIncluded:null,validIncluded:null,excluded:null,headers:null};
     ctx.onLoaded?.(summary);return summary;
    }finally{container.removeAttribute('aria-busy');$('[data-summary-refresh]').disabled=false;inflight=null;}
   })();
   return inflight;
  }
  $('[data-summary-search]').oninput=render;$('[data-summary-filter]').onchange=render;
  $('[data-summary-refresh]').onclick=refresh;
  $('[data-summary-new]').onclick=()=>ctx.onNewList?.();
  $('[data-summary-results]').onclick=event=>{const button=event.target.closest('[data-summary-open]');if(button&&container.contains(button))ctx.onOpenDraft?.(button.dataset.summaryOpen,button.dataset.summaryMode);};
  const ready=refresh();return {refresh,ready};
 }
 const api={mount,summarize,latestPerProvider,isAuxiliary,loadLatest};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraB2BListasResumen=api;
})(typeof globalThis!=='undefined'?globalThis:this);
