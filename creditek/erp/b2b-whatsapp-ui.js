(function(root){
 'use strict';
 const D=typeof module==='object'&&module.exports?require('./b2b-listas-domain.js'):root.KoraB2BListas;
 const W=typeof module==='object'&&module.exports?require('./b2b-whatsapp-domain.js'):root.KoraB2BWhatsApp;
 const PAGE_SIZE=20;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>n==null?'Pendiente':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(n);
 const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const isAuxiliary=r=>r.included===false&&/\b(encabezados?|separador(?:es)?|contactos?|saludos?|despedida|texto informativo|informacion de contacto|pie de pagina)\b/.test(normalize(r.exclusion));
 function classify(rows){
  const counts=new Map();
  for(const r of rows.filter(r=>r.included&&r.producto_id&&r.proveedor_id)){const key=JSON.stringify([r.producto_id,r.proveedor_id]);counts.set(key,(counts.get(key)||0)+1);}
  return rows.map((r,i)=>({r,i,state:!r.included?(isAuxiliary(r)?'headers':'excluded'):(!r.producto_id||W.validate([r]).length||(counts.get(JSON.stringify([r.producto_id,r.proveedor_id]))||0)>1)?'pending':'ready'}));
 }
 function selectRows(rows,mode='all',search='',products=[]){
  const query=normalize(search),names=new Map(products.map(p=>[p.id,`${p.nombre} ${p.codigo}`]));
  return classify(rows).filter(({r,state})=>(mode==='all'?state!=='headers':state===mode)&&(!query||normalize(`${r.reference} ${r.original} ${names.get(r.producto_id)||''} ${r.exclusion||''}`).includes(query)));
 }
 async function all(query){let result=[];for(let from=0;;from+=500){const {data,error}=await query().range(from,from+499);if(error)throw error;if(!Array.isArray(data))throw Error('No se recibió la información de la consulta.');result.push(...data);if(data.length<500)return result;}}
 function mount(ctx){
  const {container,sb}=ctx;
  if(container.refreshContext){container.refreshContext(ctx);return;}
  let products=ctx.products,providers=ctx.providers,onPublished=ctx.onPublished,onSaved=ctx.onSaved;
  let rows=[],offers=[],page=0,busy=false,draft=null,loadedId=null,historyOffset=0,sourceProvider='',sourceText='',dirty=false,published=false,mode='pending',expanded=null,focusAfter=null;
  container.innerHTML=`<div class="list-heading"><div><h2 data-editor-heading>Revisar lista del proveedor</h2><p class="sub">Abre una referencia para editarla. Guardar conserva el avance; publicar la hace visible para las tiendas.</p></div></div>
   <details class="wa-source-form" data-source><summary>Proveedor y mensaje original</summary><div class="grid"><label>Proveedor<select data-provider><option value="">Selecciona proveedor</option>${providers.map(p=>`<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}</select></label></div><label>Mensaje completo del proveedor<textarea data-text rows="7" maxlength="200000" placeholder="Pega aquí la lista tal como llegó por WhatsApp"></textarea></label><div class="actions"><button type="button" class="btn primary" data-analyze>Analizar lista</button></div><p class="sub">Utilidad: 12% sobre costos menores de $150.000; $20.000 desde ese valor, salvo excepciones confirmadas.</p></details>
   <details class="wa-history"><summary>Consultar versiones anteriores y originales de Aura</summary><button type="button" class="btn" data-history>Cargar historial</button><div data-history-list></div></details>
   <p data-status role="status"></p><section data-review class="hidden"><div data-published class="wa-published-note" hidden><p>Lista publicada · consulta de la versión guardada. Abrirla no modifica el catálogo.</p><button type="button" class="btn" data-update>Preparar actualización</button></div>
   <p data-errors class="list-errors" role="alert"></p><div data-edit-actions><label class="list-confirm"><input type="checkbox" data-confirm> Revisé referencias, costos y exclusiones. Publicar reemplaza la lista vigente de este proveedor, no las de los demás.</label><div class="actions wa-save-actions"><button type="button" class="btn" data-save>Guardar borrador</button><button type="button" class="btn primary" data-publish disabled>Publicar para tiendas</button></div></div>
   <div class="wa-review-toolbar"><label>Buscar en esta lista<input type="search" data-search placeholder="Referencia, código o texto del proveedor"></label><div class="wa-filters actions" role="group" aria-label="Filtrar referencias">${[['pending','Dudas'],['all','Todos los productos'],['ready','Listos'],['excluded','Excluidos'],['headers','Textos auxiliares']].map(([value,title])=>`<button type="button" class="btn" data-mode="${value}" aria-pressed="false">${title} <span data-count="${value}">0</span></button>`).join('')}</div></div>
   <p class="sub" data-filter-help></p><div class="actions wa-pagination"><button type="button" class="btn" data-prev>Anterior</button><span data-page aria-live="polite"></span><button type="button" class="btn" data-next>Siguiente</button></div><div data-rows></div>
   <details class="wa-comparison"><summary>Ver mejor costo entre proveedores</summary><p>Solo administración ve costos y proveedores. No cambia precios al consultarlo.</p><div data-comparison></div></details>
   <div class="actions"><button type="button" class="btn" data-export>Descargar revisión</button></div></section>`;
  const $=s=>container.querySelector(s),status=s=>$('[data-status]').textContent=s;
  const label=id=>{const p=products.find(p=>p.id===id);return p?`${p.codigo} · ${p.nombre}`:'';};
  const filtered=()=>selectRows(rows,mode,$('[data-search]').value,products);
  const notifyOpen=()=>container.dispatchEvent(new CustomEvent('b2b:draft-open',{bubbles:true,detail:{id:loadedId,published}}));
  container.refreshContext=c=>{products=c.products;providers=c.providers;onPublished=c.onPublished;onSaved=c.onSaved;const datalist=$('#wa-products');if(datalist)datalist.innerHTML=products.map(p=>`<option value="${esc(label(p.id))}"></option>`).join('');};
  container.hasUnsavedChanges=()=>dirty;
  function invalidate(){rows=[];draft=null;loadedId=null;dirty=true;published=false;$('[data-review]').classList.add('hidden');status('Texto o proveedor cambiado: analiza la lista antes de continuar.');}
  $('[data-provider]').onchange=invalidate;$('[data-text]').oninput=invalidate;
  async function run(fn){if(busy)return false;busy=true;container.setAttribute('aria-busy','true');controls();try{return await fn();}catch(e){status(e.message||'No se pudo completar la consulta.');return false;}finally{busy=false;container.removeAttribute('aria-busy');controls();focusAfter?.focus({preventScroll:true});focusAfter=null;}}
  function chooseDefault(){mode=classify(rows).some(x=>x.state==='pending')?'pending':'all';page=0;expanded=null;$('[data-search]').value='';}
  $('[data-analyze]').onclick=()=>run(async()=>{
   const provider=$('[data-provider]').value;if(!provider)throw Error('Selecciona el proveedor.');
   if(rows.length&&dirty&&!confirm('¿Volver a analizar el texto y descartar los ajustes de referencias sin guardar?'))return false;
   const [rules,current,archive]=await Promise.all([all(()=>sb.from('b2b_catalogo_reglas').select('*').eq('proveedor_id',provider).order('referencia_key')),all(()=>sb.from('b2b_ofertas').select('producto_id,proveedor_id,costo,precio_tienda,motivo').eq('vigente',true).order('id')),all(()=>sb.from('b2b_aura_memoria').select('datos').eq('tipo','regla').order('clave'))]);
   const text=$('[data-text]').value,legacy=archive.map(x=>x.datos).filter(x=>W.providerKey(x.proveedor)===W.providerKey(providers.find(p=>p.id===provider)?.nombre));
   const parsed=W.parse(text,provider,products,rules,legacy);
   sourceProvider=provider;sourceText=text;offers=current.filter(o=>products.some(p=>p.id===o.producto_id)&&providers.some(p=>p.id===o.proveedor_id));rows=parsed;draft=null;loadedId=null;published=false;dirty=true;chooseDefault();$('[data-source]').open=false;$('[data-review]').classList.remove('hidden');render();return true;
  });
  const stateLabel=state=>({pending:'Por revisar',ready:'Lista',excluded:'Excluida',headers:'Texto auxiliar'})[state];
  function summary(r,state){return `<span class="wa-row-title"><strong>${esc(r.reference||'Referencia pendiente')}</strong><small>Línea ${esc(r.row)}${r.learned?' · Equivalencia recordada':''}</small></span><span class="wa-row-state wa-state-${state}">${stateLabel(state)}</span><span class="wa-row-prices"><span>Costo <strong>${money(r.costo)}</strong></span><span>Retail <strong>${money(r.precio_tienda)}</strong></span></span><span class="wa-row-edit">${published?'Ver detalle':'Revisar / editar'}</span>`;}
  function updateCounts(){const classified=classify(rows);for(const button of container.querySelectorAll('[data-mode]')){const value=button.dataset.mode;button.setAttribute('aria-pressed',String(mode===value));button.querySelector('[data-count]').textContent=value==='all'?classified.filter(x=>x.state!=='headers').length:classified.filter(x=>x.state===value).length;}}
  function render(){
   $('[data-confirm]').checked=false;const selected=filtered();page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(selected.length/PAGE_SIZE)-1)));const visible=selected.slice(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE);
   $('[data-editor-heading]').textContent=`${providers.find(p=>p.id===sourceProvider)?.nombre||'Lista del proveedor'} · ${published?'publicada':'revisión'}`;
   $('[data-published]').hidden=!published;$('[data-edit-actions]').hidden=published;
   $('[data-page]').textContent=`${selected.length?page*PAGE_SIZE+1:0}–${Math.min((page+1)*PAGE_SIZE,selected.length)} de ${selected.length}`;
   $('[data-filter-help]').textContent=mode==='excluded'?'Estas referencias no participan en el catálogo. Abre cada una para ver el motivo o volver a incluirla.':mode==='headers'?'Encabezados y textos informativos separados de los productos; se conserva el texto original.':mode==='pending'?'Revisa solo las dudas. Las referencias ya resueltas están en «Listos» y «Todos los productos».':'Abre una referencia para consultar sus datos y, si es borrador, corregirlos.';
   const doubts=classify(rows).filter(x=>x.state==='pending').length;status(`${rows.length} líneas conservadas · ${doubts} por revisar. ${published?'Versión publicada, solo lectura.':dirty?'Hay cambios sin guardar.':'Revisión guardada, sin cambios.'}`);
   $('[data-rows]').innerHTML=`<datalist id="wa-products">${products.map(p=>`<option value="${esc(label(p.id))}"></option>`).join('')}</datalist><div class="wa-results">${visible.map(({r,i,state})=>`<details class="wa-row" data-row="${i}" ${expanded===i?'open':''}><summary class="wa-row-summary">${summary(r,state)}</summary><div class="wa-row-body"><div class="wa-source"><p>${r.learned?'Equivalencia recordada':r.producto_id?'Referencia vinculada al catálogo':'Vincula una referencia existente; no la dupliques.'}</p>${r.legacyExpected?`<p>Memoria de Aura: <b>${esc(r.legacyExpected)}</b>${r.producto_id?'':' · pendiente de vincular al catálogo actual'}</p>`:''}<label data-price-warning ${r.priceWarning?'':'hidden'}><input type="checkbox" data-field="priceConfirmed" ${r.priceConfirmed?'checked':''}> <span>${esc(r.priceWarning)} Confirmo este valor en pesos.</span></label><details><summary>Texto original</summary><pre>${esc(r.original)}</pre></details></div><div class="grid"><label>Referencia de KORA<input data-field="producto_id" list="wa-products" placeholder="Busca por nombre o código" value="${esc(label(r.producto_id))}"></label><label>Costo del proveedor<input data-field="costo" inputmode="decimal" value="${esc(r.costo??'')}"></label><label>Precio para retail<input data-field="precio_tienda" inputmode="decimal" value="${esc(r.precio_tienda??'')}"></label><label>Motivo del margen especial<input data-field="motivo" value="${esc(r.motivo)}"></label></div><div class="wa-options"><label><input type="checkbox" data-field="included" ${r.included?'checked':''}> Incluir en el catálogo</label><label><input type="checkbox" data-field="remember" ${r.remember?'checked':''}> Recordar esta equivalencia y margen para ${esc(providers.find(p=>p.id===sourceProvider)?.nombre)}</label></div><label>Motivo si se excluye<input data-field="exclusion" value="${esc(r.exclusion)}"></label><p class="sub">Si realmente no existe, revisa el <a href="catalogo.html" target="_blank" rel="noopener">Catálogo de productos</a> antes de crear otra referencia.</p></div></details>`).join('')||'<p class="wa-empty">No hay referencias con este filtro. Prueba «Todos los productos» o borra la búsqueda.</p>'}</div>`;
   updateCounts();controls();comparison();
  }
  function comparison(){
   if(W.validate(rows).length){$('[data-comparison]').textContent='Resuelve las dudas para ver el comparativo completo.';return;}
   const winners=W.compare(rows,offers,sourceProvider).filter(o=>rows.some(r=>r.included&&r.producto_id===o.producto_id));
   $('[data-comparison]').innerHTML='<div class="table-wrap"><table class="list-preview"><thead><tr><th>Referencia</th><th>Proveedor ganador</th><th>Costo</th><th>Precio retail</th></tr></thead><tbody>'+winners.map(o=>`<tr><td data-label="Referencia">${esc(label(o.producto_id))}</td><td data-label="Proveedor">${esc(providers.find(p=>p.id===o.proveedor_id)?.nombre)}</td><td data-label="Costo">${money(o.costo)}</td><td data-label="Precio retail">${money(o.precio_tienda)}</td></tr>`).join('')+'</tbody></table></div>';
  }
  function controls(){
   const errors=rows.length?W.validate(rows):[];$('[data-errors]').textContent=published?'':errors.slice(0,3).join(' ')+(errors.length>3?` Y ${errors.length-3} más. Abre «Dudas» para revisarlas.`:'');
   $('[data-publish]').disabled=busy||published||!rows.length||errors.length>0||!$('[data-confirm]').checked;
   for(const sel of ['[data-provider]','[data-text]','[data-analyze]','[data-save]'])$(sel).disabled=busy||published;
   for(const el of container.querySelectorAll('[data-rows] input,[data-confirm]'))el.disabled=busy||published;
   for(const el of container.querySelectorAll('[data-mode],[data-search],[data-history],[data-update],[data-export]'))el.disabled=busy;
   const count=filtered().length;$('[data-prev]').disabled=busy||page===0;$('[data-next]').disabled=busy||(page+1)*PAGE_SIZE>=count;
   for(const el of container.querySelectorAll('[data-history-list] button')){if(busy){if(!el.hasAttribute('data-before-busy'))el.dataset.beforeBusy=String(el.disabled);el.disabled=true;}else if(el.hasAttribute('data-before-busy')){el.disabled=el.dataset.beforeBusy==='true';delete el.dataset.beforeBusy;}}
  }
  $('[data-rows]').oninput=e=>{
   const tr=e.target.closest('[data-row]'),f=e.target.dataset.field;if(!tr||!f||busy||published)return;
   const r=rows[Number(tr.dataset.row)];draft=null;dirty=true;$('[data-confirm]').checked=false;
   if(f==='producto_id'){const matches=products.filter(p=>label(p.id)===e.target.value);r.producto_id=matches.length===1?matches[0].id:'';r.learned=false;}
   else if(['costo','precio_tienda'].includes(f)){r[f]=D.amount(e.target.value);r.priceConfirmed=false;if(f==='costo'){r.priceWarning=r.costo!=null&&r.costo<10000?'Precio bajo: confirma el valor en pesos.':'';r.precio_tienda=r.costo==null?null:r.costo+D.defaultMargin(r.costo);r.motivo='';tr.querySelector('[data-field="precio_tienda"]').value=r.precio_tienda??'';tr.querySelector('[data-field="motivo"]').value='';}}
   else if(['included','remember','priceConfirmed'].includes(f))r[f]=e.target.checked;else r[f]=e.target.value;
   const warning=tr.querySelector('[data-price-warning]');if(warning){warning.hidden=!r.priceWarning;warning.querySelector('span').textContent=r.priceWarning+' Confirmo este valor en pesos.';warning.querySelector('input').checked=!!r.priceConfirmed;}
   tr.querySelector('.wa-row-summary').innerHTML=summary(r,classify(rows)[Number(tr.dataset.row)].state);updateCounts();controls();comparison();status('Hay cambios sin guardar. Guarda el borrador para conservarlos; publicar es una acción aparte.');
  };
  $('[data-rows]').addEventListener('toggle',e=>{if(e.target.matches?.('details[data-row]')&&e.target.open)expanded=Number(e.target.dataset.row);},true);
  $('[data-confirm]').onchange=controls;$('[data-search]').oninput=()=>{page=0;expanded=null;render();};
  for(const button of container.querySelectorAll('[data-mode]'))button.onclick=()=>{mode=button.dataset.mode;page=0;expanded=null;render();};
  $('[data-prev]').onclick=()=>{page--;expanded=null;render();};$('[data-next]').onclick=()=>{page++;expanded=null;render();};
  async function save(){
   if(published)throw Error('Prepara una actualización antes de editar una lista publicada.');
   if(!rows.length)throw Error('Analiza la lista primero.');
   // Only explicitly checked memories are written, never guessed or incomplete mappings.
   for(const r of rows.filter(r=>r.remember&&r.included)){
    if(W.validate([r]).length)throw Error(`Completa la línea ${r.row} antes de recordarla.`);
    const {error}=await sb.rpc('guardar_regla_catalogo_b2b',{p_proveedor:sourceProvider,p_referencia:r.reference,p_producto:r.producto_id,p_margen:r.precio_tienda-r.costo,p_motivo:r.motivo||D.marginPolicy});if(error)throw error;
   }
   if(!draft){const {data,error}=await sb.rpc('guardar_borrador_catalogo_b2b',{p_proveedor:sourceProvider,p_texto:sourceText,p_filas:rows});if(error)throw error;draft=data;loadedId=data;}
   dirty=false;await onSaved?.();
  }
  $('[data-save]').onclick=()=>run(async()=>{await save();status('Borrador guardado. No se ha publicado para las tiendas.');return true;});
  $('[data-publish]').onclick=()=>{if(published||!rows.length||W.validate(rows).length||!$('[data-confirm]').checked)return;return run(async()=>{await save();const {data,error}=await sb.rpc('publicar_borrador_catalogo_b2b',{p_id:draft});if(error)throw error;published=true;dirty=false;render();status(data.repetida?'La lista ya estaba publicada; no se duplicó.':'Lista publicada. El catálogo usa el mejor costo entre proveedores. No se creó inventario ni deuda.');await onPublished?.();await onSaved?.();return true;});};
  $('[data-update]').onclick=()=>{if(busy)return;published=false;draft=null;dirty=true;$('[data-source]').open=false;render();status('Actualización preparada. La lista publicada permanece igual hasta que revises y publiques esta nueva versión.');};
  $('[data-export]').onclick=()=>root.KoraB2BListsUI.download([['Línea','Original','Referencia KORA','Costo','Precio retail','Margen','Incluida','Motivo'],...rows.map(r=>[r.row,r.original,label(r.producto_id),r.costo,r.precio_tienda,r.precio_tienda-r.costo,r.included?'Sí':'No',r.included?r.motivo:r.exclusion])],'revision-lista-proveedor.csv');
  async function history(){
   const archive=await all(()=>sb.from('b2b_aura_memoria').select('clave,datos').eq('tipo','lista').order('clave'));
   const {data,error}=await sb.from('b2b_catalogo_borradores').select('id,creado_at,proveedor_id,lista_id').order('creado_at',{ascending:false}).order('id').range(historyOffset,historyOffset+19);if(error)throw error;
   $('[data-history-list]').innerHTML=`<h3>Listas anteriores</h3><p>Abrir una versión no la publica ni revierte el catálogo.</p><details><summary>${archive.length} listas originales recuperadas de Aura</summary>${archive.map(x=>`<p>${esc(x.datos.fecha)} · ${esc(x.datos.proveedor)} <button type="button" class="btn" data-legacy="${esc(x.clave)}">Abrir original de Aura</button></p>`).join('')}</details>${data.map(d=>`<p>${esc(new Date(d.creado_at).toLocaleString('es-CO'))} · ${esc(providers.find(p=>p.id===d.proveedor_id)?.nombre)} · ${d.lista_id?'Publicada':'Borrador'} <button type="button" class="btn" data-restore="${esc(d.id)}">Abrir lista</button></p>`).join('')||'<p>No hay listas guardadas todavía.</p>'}<button type="button" class="btn" data-hprev ${historyOffset===0?'disabled':''}>Anteriores</button> <button type="button" class="btn" data-hnext ${data.length<20?'disabled':''}>Más listas</button>`;
  }
  container.newList=()=>run(async()=>{
   if(dirty&&!confirm('¿Crear una lista nueva y descartar los cambios sin guardar?'))return false;
   rows=[];offers=[];draft=null;loadedId=null;dirty=false;published=false;sourceProvider='';sourceText='';page=0;expanded=null;
   $('[data-provider]').value='';$('[data-text]').value='';$('[data-search]').value='';$('[data-source]').open=true;$('[data-review]').classList.add('hidden');$('[data-editor-heading]').textContent='Cargar una nueva lista';status('Selecciona el proveedor y pega su mensaje. Las listas guardadas no se eliminan.');notifyOpen();$('[data-provider]').scrollIntoView({block:'center'});focusAfter=$('[data-provider]');return true;
  });
  container.openDraft=(id,target)=>run(async()=>{
   if(dirty&&!confirm('¿Abrir esta lista y descartar los cambios sin guardar?'))return false;
   const {data,error}=await sb.from('b2b_catalogo_borradores').select('texto_original,proveedor_id,filas,lista_id,id').eq('id',id).single();if(error)throw error;
   if(!Array.isArray(data.filas)||data.filas.some(r=>!r||typeof r!=='object'||typeof r.included!=='boolean'))throw Error('La lista no contiene filas válidas.');
   const current=await all(()=>sb.from('b2b_ofertas').select('producto_id,proveedor_id,costo,precio_tienda,motivo').eq('vigente',true).order('id'));
   $('[data-provider]').value=data.proveedor_id;$('[data-text]').value=data.texto_original;sourceProvider=data.proveedor_id;sourceText=data.texto_original;rows=data.filas.map(r=>({...r}));draft=data.id;loadedId=data.id;offers=current;dirty=false;published=!!data.lista_id;chooseDefault();
   const modes=['pending','all','excluded','ready','headers'],productId=target&&!modes.includes(target)?target:null;if(modes.includes(target))mode=target;
   if(productId){mode='all';const index=filtered().findIndex(({r})=>r.producto_id===productId);page=Math.floor(Math.max(0,index)/20);expanded=index<0?null:filtered()[index].i;}
   $('[data-source]').open=false;$('[data-review]').classList.remove('hidden');render();notifyOpen();
   const field=expanded==null?null:container.querySelector('[data-row="'+expanded+'"] [data-field="precio_tienda"]');(field||$('[data-review]')).scrollIntoView({block:field?'center':'start'});focusAfter=field&&!published?field:$('[data-search]');return true;
  });
  $('[data-history]').onclick=()=>run(async()=>{historyOffset=0;await history();});
  $('[data-history-list]').onclick=e=>{
   if(e.target.dataset.restore)return container.openDraft(e.target.dataset.restore);
   if(e.target.dataset.legacy)return run(async()=>{if(dirty&&!confirm('¿Descartar los cambios sin guardar para abrir esta lista antigua?'))return false;const {data,error}=await sb.from('b2b_aura_memoria').select('datos').eq('tipo','lista').eq('clave',e.target.dataset.legacy).single();if(error)throw error;const matches=providers.filter(p=>W.providerKey(p.nombre)===W.providerKey(data.datos.proveedor));$('[data-provider]').value=matches.length===1?matches[0].id:'';$('[data-text]').value=data.datos.texto;invalidate();dirty=false;$('[data-source]').open=true;notifyOpen();status('Texto original de Aura recuperado. Revisa proveedor y vigencia de precios antes de analizar.');return true;});
   if(e.target.hasAttribute('data-hprev'))return run(async()=>{historyOffset=Math.max(0,historyOffset-20);await history();});if(e.target.hasAttribute('data-hnext'))return run(async()=>{historyOffset+=20;await history();});
  };
  root.addEventListener?.('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  controls();
 }
 const api={mount,classify,selectRows,isAuxiliary,PAGE_SIZE};if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraB2BWhatsAppUI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
