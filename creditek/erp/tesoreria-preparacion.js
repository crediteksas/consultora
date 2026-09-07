(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v==null?'Pendiente de cálculo':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v);
  function incidentAction(incident){
    if(incident.tipo==='aliado_sin_ejecutivo')return {kind:'executive',label:'Asignar ejecutivo'};
    if(['beneficiario_sin_identificacion','cuenta_bancaria_no_validada'].includes(incident.tipo)){
      const origin=incident.liquidation_operations?.origen_codigo;
      return {kind:'account',label:'Completar cliente y cuenta',href:origin?'aliados-tesoreria.html?vista=clientes&origen='+encodeURIComponent(origin):'aliados-tesoreria.html?vista=preparacion&lote='+encodeURIComponent(incident.liquidation_id)};
    }
    if(incident.tipo==='bono_beneficiario_sin_cuenta')return {kind:'account',label:'Completar cuenta del bono',href:'aliados-tesoreria.html?vista=clientes'};
    return null;
  }
  function create({sb,dialog,onRecalculate,onRetailSaved}){
    let container,rows=[],executives=[],revision=0;
    const route=new URLSearchParams(location.search),lot=route.get('lote')||null;
    async function saveExecutive(origin,previous,executive){
      const response=await sb.rpc('tesoreria_asignar_ejecutivo',{p_origen:origin,p_anterior:previous||null,p_ejecutivo:executive});
      if(response.error)throw response.error;
      if(response.data?.ok!==true)throw Error('No se confirmó el cambio. Actualiza antes de reintentar.');
    }
    async function openExecutive({lotId,operationId}){
      const modal=dialog('Asignar ejecutivo o Retail','<div data-executive-content><p role="status">Consultando el comercio y los ejecutivos activos…</p></div>');
      const content=modal.querySelector('[data-executive-content]');
      let saving=false;
      modal.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
      const showSaved=(row,name,alreadyAssigned=false)=>{
        content.innerHTML=`<h3>${esc(row.comercio)}</h3><p role="status">${alreadyAssigned?'Ejecutivo ya registrado':'Ejecutivo guardado'}: <strong>${esc(name)}</strong>.</p><p>Actualiza el cálculo del lote para incorporar su bono y comprobar los pendientes. Guardar el ejecutivo no cierra novedades por justificación ni aprueba o registra pagos.</p><div class="operation-actions"><button class="btn primary" type="button" data-recalculate>Actualizar cálculo del lote</button><a class="btn secondary" href="${esc(incidentAction({tipo:'beneficiario_sin_identificacion',liquidation_operations:{origen_codigo:row.origen_codigo}}).href)}">Completar cliente y cuenta</a></div>`;
        content.querySelector('[data-recalculate]').onclick=()=>{modal.close();onRecalculate(lotId);};
      };
      try{
        const [pending,execs,retail]=await Promise.all([sb.rpc('tesoreria_pendientes_liquidacion',{p_lote:lotId}),sb.from('ejecutivos').select('id,nombre').eq('activo',true).order('nombre'),sb.from('origenes').select('codigo,nombre').eq('activo',true).eq('tipo','propia').order('nombre')]);
        if(!modal.isConnected)return;
        if(pending.error||execs.error||retail.error)throw pending.error||execs.error||retail.error;
        const row=(pending.data||[]).find(r=>r.id===operationId&&r.liquidation_id===lotId);
        if(!row)throw Error('Este pendiente ya cambió o el lote dejó de ser editable. Cierra y actualiza el lote.');
        if(!row.origen_codigo)throw Error('Primero vincula el comercio a su local en el directorio.');
        const choices=execs.data||[],current=choices.find(e=>e.id===row.ejecutivo_actual);
        if(current&&!row.falta_ejecutivo){showSaved(row,current.nombre,true);return;}
        content.innerHTML=`<h3>${esc(row.comercio)}</h3><p>Para un aliado, selecciona su ejecutivo real: se guarda en la ficha única del local. Si esta venta es de una tienda propia, elige Retail y vincúlala a su tienda existente.</p><form><label>Ejecutivo o Retail<select class="control" name="executive" required><option value="">Selecciona el responsable o Retail</option><optgroup label="Tiendas propias"><option value="retail">Retail · tienda propia</option></optgroup><optgroup label="Ejecutivos activos">${choices.map(e=>`<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</optgroup></select></label><fieldset data-retail hidden disabled><legend>Tienda propia registrada en Retail</legend><label>Tienda propia<select class="control" name="retail" required><option value="">Selecciona la tienda correcta</option>${(retail.data||[]).map(r=>`<option value="${esc(r.codigo)}">${esc(r.nombre)} · ${esc(r.codigo)}</option>`).join('')}</select></label><p>Aplica a esta operación y recalcula el lote con la regla Retail. No traslada ni fusiona clientes o cuentas.</p><label><span><input name="verified" type="checkbox" required> Verifiqué que esta venta pertenece a la tienda propia seleccionada.</span></label></fieldset><p role="alert"></p><button class="btn primary" type="submit">Guardar ejecutivo</button></form><p>No aprueba ni paga el lote. Los lotes aprobados están protegidos.</p>`;
        const form=content.querySelector('form');
        form.elements.executive.setAttribute('aria-label','Ejecutivo o Retail');
        form.elements.retail.setAttribute('aria-label','Tienda propia');
        const retailFields=form.querySelector('[data-retail]');
        form.elements.executive.onchange=()=>{const own=form.elements.executive.value==='retail';retailFields.hidden=!own;retailFields.disabled=!own;form.elements.verified.checked=false;form.querySelector('button').textContent=own?'Guardar Retail y recalcular lote':'Guardar ejecutivo';form.querySelector('[role=alert]').textContent='';};
        form.elements.retail.onchange=()=>{form.elements.verified.checked=false;};
        form.onsubmit=async event=>{
          event.preventDefault();if(saving||!form.reportValidity())return;
          const own=form.elements.executive.value==='retail',chosen=choices.find(e=>e.id===form.elements.executive.value);if(!own&&!chosen)return;
          saving=true;form.querySelector('button').disabled=true;form.elements.executive.disabled=true;modal.querySelector('[data-close]').disabled=true;form.querySelector('[role=alert]').textContent='';
          try{
            if(own){
              const result=await sb.rpc('tesoreria_vincular_operacion_retail',{p_operation_id:operationId,p_origen_anterior:row.origen_codigo,p_retail:form.elements.retail.value});
              if(result.error)throw result.error;
              if(!result.data?.ok||result.data.tipo!=='propia')throw Error('No se confirmó el cambio a Retail. Actualiza el lote antes de reintentar.');
              content.innerHTML=`<p role="status">Operación vinculada a <strong>${esc(result.data.nombre)}</strong> como tienda propia. Cálculo del lote actualizado.</p><p>No se aprobó ni pagó el lote. Los pendientes que sigan vigentes aparecerán en Novedades.</p>`;
              try{await onRetailSaved(lotId);}catch{content.insertAdjacentHTML('beforeend','<p>La vinculación está guardada. Recarga para ver el cálculo actualizado.</p>');}
            }else{await saveExecutive(row.origen_codigo,row.ejecutivo_actual,chosen.id);showSaved(row,chosen.nombre);}
          }
          catch(error){form.querySelector('[role=alert]').textContent=error.message||'No se pudo guardar el ejecutivo.';form.querySelector('button').disabled=false;form.elements.executive.disabled=false;}
          finally{saving=false;modal.querySelector('[data-close]').disabled=false;}
        };
      }catch(error){if(modal.isConnected)content.innerHTML='<p role="alert">'+esc(error.message||'No se pudo consultar el pendiente.')+'</p>';}
    }
    async function mount(node){
      container=node;const request=++revision;
      container.innerHTML='<section class="card"><p role="status">Consultando preparación de pagos…</p></section>';
      try{
        const [pending,execs]=await Promise.all([sb.rpc('tesoreria_pendientes_liquidacion',{p_lote:lot}),sb.from('ejecutivos').select('id,nombre').eq('activo',true).order('nombre')]);
        if(request!==revision)return;if(pending.error||execs.error)throw pending.error||execs.error;
        rows=pending.data||[];executives=execs.data||[];
        container.innerHTML='<section class="card"><h2>Preparación de pagos</h2><p>Completa ejecutivo y cuenta. Se actualizan los bonos pendientes sin cambiar el principal ni exigir otra aprobación del lote.</p><label>Buscar comercio, referencia, plataforma o corte<input class="control" type="search" data-search></label><p role="status" data-status></p><div data-rows></div></section>';
        container.querySelector('[data-search]').oninput=render;render();
      }catch(error){if(request===revision)container.innerHTML='<section class="card"><p role="alert">'+esc(error.message||'No se pudieron consultar los pendientes.')+'</p></section>';}
    }
    function render(){
      const q=container.querySelector('[data-search]').value.toLocaleLowerCase('es').trim();
      const list=rows.filter(r=>[r.comercio,r.referencia,r.plataforma,r.corte].join(' ').toLocaleLowerCase('es').includes(q));
      container.querySelector('[data-status]').textContent=`${list.length} ${list.length===1?'operación':'operaciones'} por preparar`;
      container.querySelector('[data-rows]').innerHTML=list.map(r=>{
        const approved=['aprobada','programada'].includes(r.estado);
        const missing=[r.falta_comercio?'Local en directorio':null,r.falta_ejecutivo?'Ejecutivo y bono pendiente':null,r.falta_titular?'Titular':null,r.falta_cuenta?'Cuenta verificada':null].filter(Boolean);
        return `<article class="preparation-card" data-operation="${esc(r.id)}"><h3>${esc(r.comercio)}</h3><p>${esc(r.plataforma==='alo'?'ALO Credit':r.plataforma)} · Corte ${esc(r.corte)} · ${esc(r.referencia)}</p><p>Porcentaje: <strong>${r.porcentaje==null?'No aplica / sin regla':esc(Number(r.porcentaje)*100)+' %'}</strong> · Neto al aliado: <strong>${money(r.neto)}</strong></p><p>${missing.length?'Falta: '+esc(missing.join(' · ')):'Datos completos; actualiza el cálculo del lote.'}</p>
          ${r.falta_ejecutivo&&r.origen_codigo?`<form data-origin="${esc(r.origen_codigo)}" data-previous="${esc(r.ejecutivo_actual)}"><label>Ejecutivo responsable<select class="control" name="executive" required><option value="">Selecciona el ejecutivo real</option>${executives.map(e=>`<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</select></label><button class="btn secondary" type="submit">Guardar ejecutivo</button><p role="alert"></p></form>`:''}
          <div class="actions">${r.origen_codigo?`<a class="btn secondary" href="aliados-tesoreria.html?vista=clientes&amp;origen=${encodeURIComponent(r.origen_codigo)}">Cliente y cuenta</a>`:''}${approved?`<button class="btn primary" data-prepare-approved="${esc(r.liquidation_id)}">Preparar órdenes aprobadas</button><p role="alert"></p>`:`<a class="btn secondary" href="aliados-liquidaciones.html?lote=${encodeURIComponent(r.liquidation_id)}">${r.neto==null?'Liquidar lote':'Volver al lote / actualizar cálculo'}</a>`}</div></article>`;
      }).join('')||'<p>Sin pendientes para esta consulta.</p>';
      container.querySelectorAll('[data-prepare-approved]').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        try {const result=await sb.rpc('tesoreria_completar_ordenes_aprobadas',{p_lote:button.dataset.prepareApproved});if(result.error)throw result.error;await mount(container);}
        catch(error){button.parentElement.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}
      });
      container.querySelectorAll('form').forEach(form=>form.onsubmit=async event=>{
        event.preventDefault();if(!form.reportValidity())return;
        const button=form.querySelector('button');button.disabled=true;
        try{await saveExecutive(form.dataset.origin,form.dataset.previous,form.elements.executive.value);
          const lots=[...new Set(rows.filter(r=>r.origen_codigo===form.dataset.origin&&['aprobada','programada'].includes(r.estado)).map(r=>r.liquidation_id))];
          for(const id of lots){const result=await sb.rpc('tesoreria_completar_ordenes_aprobadas',{p_lote:id});if(result.error)throw result.error;}
          await mount(container);}
        catch(error){form.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}
      });
    }
    return {mount,openExecutive};
  }
  root.CreditekTesoreriaPreparacion={create,incidentAction};
})(window);
