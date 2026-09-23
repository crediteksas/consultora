(function () {
  'use strict';
  const D=window.KoraDocuments, $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let context, key='traslados', page=0, generation=0, activeExpense=null, expenseConcepts=null;
  const money=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value));
  function dateText(row) { if(!row.date)return 'Fecha no registrada'; const d=new Date(row.dateOnly?`${row.date}T12:00:00-05:00`:row.date); return Number.isNaN(d.getTime())?'Fecha no disponible':d.toLocaleDateString('es-CO',{timeZone:'America/Bogota'}); }
  function notice(message,error=false){$('docNotice').hidden=!message;$('docNotice').textContent=message;$('docNotice').classList.toggle('error',error);}
  function configure(){const config=D.type(key);$('docTypes').innerHTML=Object.entries(D.TYPES).map(([id,t])=>`<button type="button" data-type="${id}" aria-pressed="${id===key}">${esc(t.label)}</button>`).join('');$('docHelp').textContent=config.help;$('docQueryLabel').textContent=key==='gastos'?'ID del gasto (opcional)':config.imei?'Número o IMEI':'Número de remisión';$('docQuery').placeholder=key==='gastos'?'ID completo, o filtra por tienda y fechas':config.imei?'Ej.: 11 o IMEI de 15 dígitos':'Ej.: 28';}
  async function load(){const current=++generation;activeExpense=null;$('docResults').setAttribute('aria-busy','true');$('docRows').replaceChildren();$('docPagination').hidden=true;$('docCount').textContent='';notice('Consultando documentos…');
    try{const result=await D.findDocuments(context.sb,window.KoraAccessControl,context.perfil,{type:key,query:$('docQuery').value,store:$('docStore').value,from:$('docFrom').value,to:$('docTo').value,page});if(current!==generation)return;
      $('docRows').innerHTML=result.rows.length?result.rows.map(row=>{const v=D.documentView(key,row);const action=key==='gastos'?`<button type="button" class="doc-button doc-primary" data-edit-expense="${esc(row.id)}" aria-label="Editar ${esc(v.title)} aquí">Revisar y editar aquí</button>`:`<a class="doc-button doc-primary" href="${esc(v.href)}" aria-label="Abrir ${esc(v.title)} para revisar sus opciones">Abrir documento</a>`;return `<article class="doc-row" data-expense-row="${key==='gastos'?esc(row.id):''}"><div><h3>${esc(v.title)}</h3><p>${esc(v.store)}</p>${v.description?`<small>${esc(v.description)}</small>`:''}</div><div class="doc-row-meta"><span class="doc-state">${esc(v.status)}</span><small>${esc(dateText(v))}</small>${v.amount!=null?`<p class="doc-row-amount">${esc(money(v.amount))}</p>`:''}</div><div class="doc-row-action">${action}</div>${key==='gastos'?'<div class="doc-expense-slot" hidden></div>':''}</article>`;}).join(''):'<p class="doc-empty">No hay documentos con estos filtros. Puedes limpiar las fechas o cambiar la tienda y volver a buscar.</p>';
      const start=page*D.PAGE_SIZE, count=result.count;$('docCount').textContent=result.rows.length?`${start+1}–${start+result.rows.length}${count!=null?` de ${count}`:''}`:'0 resultados';$('docPrevious').disabled=page===0;$('docNext').disabled=count!=null?start+result.rows.length>=count:result.rows.length<D.PAGE_SIZE;$('docPagination').hidden=page===0&&$('docNext').disabled;$('docPage').textContent=`Página ${page+1}`;notice('');
    }catch(error){if(current!==generation)return;notice(error?.message||'No se pudieron consultar los documentos. Vuelve a intentar.',true);$('docRows').innerHTML='<p class="doc-empty">La consulta no se completó. No se modificó ningún documento.</p>';}
    finally{if(current===generation)$('docResults').setAttribute('aria-busy','false');}
  }
  async function openExpense(id) {
    if (key!=='gastos' || !window.KoraAccessControl.canManageDocuments(context?.perfil)) return;
    const row=$('docRows').querySelector(`[data-expense-row="${id}"]`);
    if (!row) return;
    $('docRows').querySelectorAll('.doc-expense-slot').forEach(slot=>{slot.hidden=true;slot.replaceChildren();});
    const slot=row.querySelector('.doc-expense-slot');
    slot.hidden=false;slot.textContent='Consultando el gasto…';activeExpense=null;
    let expenseResult,conceptResult;
    try {
      [expenseResult,conceptResult]=await Promise.all([
        context.sb.from('gastos').select('id,revision,fecha,tienda_codigo,concepto_id,monto,descripcion,estado,correccion_pendiente,nota_rechazo,origenes:tienda_codigo(nombre)').eq('id',id).maybeSingle(),
        expenseConcepts ? Promise.resolve({data:expenseConcepts}) : context.sb.from('conceptos_gasto').select('id,nombre,preautorizado').eq('activo',true).order('nombre'),
      ]);
    } catch (_) { if (slot.isConnected && !slot.hidden) slot.textContent='No fue posible consultar este gasto. Intenta de nuevo.';return; }
    if (!slot.isConnected || slot.hidden || key!=='gastos') return;
    if (expenseResult.error || !expenseResult.data || conceptResult.error) {
      slot.textContent='No fue posible consultar este gasto o sus conceptos. No se modificó ningún dato.';return;
    }
    expenseConcepts=conceptResult.data||[];
    const g=expenseResult.data;
    if (g.id!==id) {slot.textContent='La respuesta no corresponde al gasto seleccionado.';return;}
    activeExpense=g;
    const editable=(g.estado==='registrado'||g.estado==='aprobado'||(g.estado==='rechazado'&&g.correccion_pendiente));
    const options=expenseConcepts.map(c=>`<option value="${esc(c.id)}" ${c.id===g.concepto_id?'selected':''}>${esc(c.nombre)}</option>`).join('');
    const state=g.correccion_pendiente?'Devuelto para corrección':D.status('gastos',g);
    slot.innerHTML=`<div class="doc-expense-heading"><h4>Gasto de ${esc(g.origenes?.nombre||g.tienda_codigo)}</h4><button type="button" class="doc-button" data-close-expense>Cerrar</button></div>
      <p>Estado: <strong>${esc(state)}</strong>. ID: ${esc(g.id)}</p>
      ${g.nota_rechazo?`<p>Motivo de devolución/rechazo: ${esc(g.nota_rechazo)}</p>`:''}
      ${editable?`<form class="doc-expense-form" data-expense-form>
        <div class="doc-field"><label for="docExpenseDate">Fecha</label><input id="docExpenseDate" name="fecha" type="date" value="${esc(g.fecha)}" required></div>
        <div class="doc-field"><label for="docExpenseConcept">Concepto</label><select id="docExpenseConcept" name="concepto_id" required>${options}</select></div>
        <div class="doc-field"><label for="docExpenseAmount">Monto</label><input id="docExpenseAmount" name="monto" type="number" min="1" step="1" value="${esc(g.monto)}" required></div>
        <div class="doc-field doc-wide"><label for="docExpenseDescription">Descripción</label><textarea id="docExpenseDescription" name="descripcion" rows="2">${esc(g.descripcion||'')}</textarea></div>
        <div class="doc-field doc-wide"><label for="docExpenseReason">Motivo de la corrección</label><textarea id="docExpenseReason" name="motivo" rows="2" required placeholder="Explica qué dato corriges y por qué"></textarea></div>
        <p class="doc-wide doc-expense-warning">El cambio queda en el historial y vuelve a aprobación. No se cambia la tienda ni se duplica el gasto.</p>
        <div class="doc-wide doc-expense-actions"><button class="doc-button doc-primary" type="submit">Guardar corrección</button><span role="status" aria-live="polite" data-expense-message></span></div>
      </form>`:'<p>Este gasto no admite edición en su estado actual. Consulta su historial en Gastos si necesitas revisar cambios anteriores.</p>'}`;
    slot.scrollIntoView({block:'nearest'});
  }
  async function saveExpense(form) {
    const g=activeExpense, message=form.querySelector('[data-expense-message]');
    if (!g || !window.KoraAccessControl.canManageDocuments(context?.perfil)) return;
    const fields=form.elements;
    const fecha=fields.namedItem('fecha').value;
    const concepto_id=fields.namedItem('concepto_id').value;
    const monto=Number(fields.namedItem('monto').value);
    const descripcion=fields.namedItem('descripcion').value.trim();
    const motivo=fields.namedItem('motivo').value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||!expenseConcepts.some(c=>c.id===concepto_id)||!Number.isFinite(monto)||monto<=0||!motivo) {
      message.textContent='Completa una fecha, concepto, monto positivo y motivo válidos.';return;
    }
    const button=form.querySelector('[type="submit"]');button.disabled=true;message.textContent='Guardando…';
    const returned=g.estado==='rechazado'&&g.correccion_pendiente;
    let result;
    try {
      result=returned
        ?await context.sb.rpc('corregir_gasto',{p_id:g.id,p_revision:g.revision,p_accion:'reenviar',p_datos:{fecha,concepto_id,monto,descripcion:`${descripcion||''}\nMotivo de corrección: ${motivo}`.trim()}})
        :await context.sb.rpc('editar_gasto_administrativo',{p_id:g.id,p_revision:g.revision,p_datos:{fecha,concepto_id,monto,descripcion,motivo}});
    } catch (_) { message.textContent='No se pudo guardar. Comprueba la conexión e intenta de nuevo.';return; }
    finally { button.disabled=false; }
    if (result.error) {message.textContent=`No se guardó: ${result.error.message}`;return;}
    activeExpense=null;await load();notice('Gasto corregido con trazabilidad. Quedó pendiente de aprobación.');
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
  $('docRows').addEventListener('click',event=>{const open=event.target.closest('[data-edit-expense]');if(open){openExpense(open.dataset.editExpense);return;}const close=event.target.closest('[data-close-expense]');if(close){const slot=close.closest('.doc-expense-slot');slot.hidden=true;slot.replaceChildren();activeExpense=null;}});
  $('docRows').addEventListener('submit',event=>{const form=event.target.closest('[data-expense-form]');if(!form)return;event.preventDefault();saveExpense(form);});
  document.addEventListener('kora-sidebar-ready',()=>start(window.creditekSidebar),{once:true});
  if($('app').dataset.koraMounted==='true' && window.creditekSidebar?.authorization?.allowed)start(window.creditekSidebar);
})();
