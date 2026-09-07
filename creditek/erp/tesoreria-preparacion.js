(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v==null?'Pendiente de cálculo':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v);
  function create({sb}){
    let container,rows=[],executives=[],revision=0;
    const route=new URLSearchParams(location.search),lot=route.get('lote')||null;
    async function mount(node){
      container=node;const request=++revision;
      container.innerHTML='<section class="card"><p role="status">Consultando preparación de pagos…</p></section>';
      try{
        const [pending,execs]=await Promise.all([sb.rpc('tesoreria_pendientes_liquidacion',{p_lote:lot}),sb.from('ejecutivos').select('id,nombre').eq('activo',true).order('nombre')]);
        if(request!==revision)return;if(pending.error||execs.error)throw pending.error||execs.error;
        rows=pending.data||[];executives=execs.data||[];
        container.innerHTML='<section class="card"><h2>Preparación de pagos</h2><p>Completa los datos pendientes y actualiza el cálculo del lote. No autoriza pagos ni cambia lotes aprobados.</p><label>Buscar comercio, referencia, plataforma o corte<input class="control" type="search" data-search></label><p role="status" data-status></p><div data-rows></div></section>';
        container.querySelector('[data-search]').oninput=render;render();
      }catch(error){if(request===revision)container.innerHTML='<section class="card"><p role="alert">'+esc(error.message||'No se pudieron consultar los pendientes.')+'</p></section>';}
    }
    function render(){
      const q=container.querySelector('[data-search]').value.toLocaleLowerCase('es').trim();
      const list=rows.filter(r=>[r.comercio,r.referencia,r.plataforma,r.corte].join(' ').toLocaleLowerCase('es').includes(q));
      container.querySelector('[data-status]').textContent=`${list.length} ${list.length===1?'operación':'operaciones'} por preparar`;
      container.querySelector('[data-rows]').innerHTML=list.map(r=>{
        const missing=[r.falta_comercio?'Local en directorio':null,r.falta_ejecutivo?'Ejecutivo y bono pendiente':null,r.falta_titular?'Titular':null,r.falta_cuenta?'Cuenta verificada':null].filter(Boolean);
        return `<article class="preparation-card" data-operation="${esc(r.id)}"><h3>${esc(r.comercio)}</h3><p>${esc(r.plataforma==='alo'?'ALO Credit':r.plataforma)} · Corte ${esc(r.corte)} · ${esc(r.referencia)}</p><p>Porcentaje: <strong>${r.porcentaje==null?'No aplica / sin regla':esc(Number(r.porcentaje)*100)+' %'}</strong> · Neto al aliado: <strong>${money(r.neto)}</strong></p><p>${missing.length?'Falta: '+esc(missing.join(' · ')):'Datos completos; actualiza el cálculo del lote.'}</p>
          ${r.falta_ejecutivo&&r.origen_codigo?`<form data-origin="${esc(r.origen_codigo)}" data-previous="${esc(r.ejecutivo_actual)}"><label>Ejecutivo responsable<select class="control" name="executive" required><option value="">Selecciona el ejecutivo real</option>${executives.map(e=>`<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</select></label><button class="btn secondary" type="submit">Guardar ejecutivo</button><p role="alert"></p></form>`:''}
          <div class="actions">${r.origen_codigo?`<a class="btn secondary" href="aliados-tesoreria.html?vista=clientes&amp;origen=${encodeURIComponent(r.origen_codigo)}">Cliente y cuenta</a>`:''}<a class="btn secondary" href="aliados-liquidaciones.html?lote=${encodeURIComponent(r.liquidation_id)}">${r.neto==null?'Liquidar lote':'Volver al lote / actualizar cálculo'}</a></div></article>`;
      }).join('')||'<p>Sin pendientes para esta consulta.</p>';
      container.querySelectorAll('form').forEach(form=>form.onsubmit=async event=>{
        event.preventDefault();if(!form.reportValidity())return;
        const button=form.querySelector('button');button.disabled=true;
        try{const response=await sb.rpc('tesoreria_asignar_ejecutivo',{p_origen:form.dataset.origin,p_anterior:form.dataset.previous||null,p_ejecutivo:form.elements.executive.value});if(response.error)throw response.error;if(response.data?.ok!==true)throw Error('No se confirmó el cambio. Actualiza antes de reintentar.');await mount(container);}
        catch(error){form.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}
      });
    }
    return {mount};
  }
  root.CreditekTesoreriaPreparacion={create};
})(window);
