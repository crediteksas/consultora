(function () {
  'use strict';
  const D=window.KoraDocuments, $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let context, key='traslados', page=0, generation=0;
  const money=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value));
  function dateText(row) { if(!row.date)return 'Fecha no registrada'; const d=new Date(row.dateOnly?`${row.date}T12:00:00-05:00`:row.date); return Number.isNaN(d.getTime())?'Fecha no disponible':d.toLocaleDateString('es-CO',{timeZone:'America/Bogota'}); }
  function notice(message,error=false){$('docNotice').hidden=!message;$('docNotice').textContent=message;$('docNotice').classList.toggle('error',error);}
  function configure(){const config=D.type(key);$('docTypes').innerHTML=Object.entries(D.TYPES).map(([id,t])=>`<button type="button" data-type="${id}" aria-pressed="${id===key}">${esc(t.label)}</button>`).join('');$('docHelp').textContent=config.help;$('docQueryLabel').textContent=key==='gastos'?'ID del gasto (opcional)':config.imei?'Número o IMEI':'Número de remisión';$('docQuery').placeholder=key==='gastos'?'ID completo, o filtra por tienda y fechas':config.imei?'Ej.: 11 o IMEI de 15 dígitos':'Ej.: 28';}
  async function load(){const current=++generation;$('docResults').setAttribute('aria-busy','true');$('docRows').replaceChildren();$('docPagination').hidden=true;$('docCount').textContent='';notice('Consultando documentos…');
    try{const result=await D.findDocuments(context.sb,window.KoraAccessControl,context.perfil,{type:key,query:$('docQuery').value,store:$('docStore').value,from:$('docFrom').value,to:$('docTo').value,page});if(current!==generation)return;
      $('docRows').innerHTML=result.rows.length?result.rows.map(row=>{const v=D.documentView(key,row);return `<article class="doc-row"><div><h3>${esc(v.title)}</h3><p>${esc(v.store)}</p>${v.description?`<small>${esc(v.description)}</small>`:''}</div><div class="doc-row-meta"><span class="doc-state">${esc(v.status)}</span><small>${esc(dateText(v))}</small>${v.amount!=null?`<p class="doc-row-amount">${esc(money(v.amount))}</p>`:''}</div><div class="doc-row-action"><a class="doc-button doc-primary" href="${esc(v.href)}" aria-label="Abrir ${esc(v.title)} para revisar sus opciones">Abrir documento</a></div></article>`;}).join(''):'<p class="doc-empty">No hay documentos con estos filtros. Puedes limpiar las fechas o cambiar la tienda y volver a buscar.</p>';
      const start=page*D.PAGE_SIZE, count=result.count;$('docCount').textContent=result.rows.length?`${start+1}–${start+result.rows.length}${count!=null?` de ${count}`:''}`:'0 resultados';$('docPrevious').disabled=page===0;$('docNext').disabled=count!=null?start+result.rows.length>=count:result.rows.length<D.PAGE_SIZE;$('docPagination').hidden=page===0&&$('docNext').disabled;$('docPage').textContent=`Página ${page+1}`;notice('');
    }catch(error){if(current!==generation)return;notice(error?.message||'No se pudieron consultar los documentos. Vuelve a intentar.',true);$('docRows').innerHTML='<p class="doc-empty">La consulta no se completó. No se modificó ningún documento.</p>';}
    finally{if(current===generation)$('docResults').setAttribute('aria-busy','false');}
  }
  function start(shell){if(context)return;if(!shell?.authorization?.allowed || !window.KoraAccessControl?.canManageDocuments(shell.perfil))return;context=shell;$('app').hidden=false;$('app').classList.add('show');configure();
    $('docStore').innerHTML='<option value="">Todas las tiendas</option>'+(shell.tiendas||[]).map(t=>`<option value="${esc(t.codigo)}">${esc(t.nombre)}</option>`).join('');
    const capabilities={b2b:!!shell.perfil.es_admin_b2b,aliados:!!shell.perfil.es_operador_aliados};
    $('docOtherLinks').innerHTML=[['Facturas de proveedor','compra-proveedor.html'],['Liquidaciones','aliados-liquidaciones.html'],['Tesorería','aliados-tesoreria.html'],['Consignaciones','cuenta-corriente.html#consignaciones']].filter(([,href])=>window.KoraAccessControl.authorize(shell.perfil,href,capabilities).allowed).map(([label,href])=>`<a class="doc-button" href="${href}">${label}</a>`).join('');
    load();
  }
  $('docFilters').addEventListener('submit',event=>{event.preventDefault();page=0;load();});
  $('docTypes').addEventListener('click',event=>{const button=event.target.closest('[data-type]');if(!button||button.dataset.type===key)return;key=button.dataset.type;page=0;$('docQuery').value='';configure();load();});
  $('docClear').addEventListener('click',()=>{$('docFilters').reset();page=0;load();});
  $('docPrevious').addEventListener('click',()=>{if(page>0){page--;load();}});$('docNext').addEventListener('click',()=>{page++;load();});
  document.addEventListener('kora-sidebar-ready',()=>start(window.creditekSidebar),{once:true});
  if($('app').dataset.koraMounted==='true' && window.creditekSidebar?.authorization?.allowed)start(window.creditekSidebar);
})();
