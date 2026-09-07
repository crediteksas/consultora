(function(root){
  'use strict';
  const types=new Set(['comercio_no_reconocido','comercio_ambiguo']);
  const missing=o=>!o.origen_codigo || !['propia','aliado'].includes(o.tipo_establecimiento);
  function pending(incidents,operations){
    const result=incidents.filter(i=>i.estado==='abierta');
    for(const op of operations.filter(missing))if(!result.some(i=>i.operation_id===op.id&&types.has(i.tipo)))
      result.push({id:'commerce-'+op.id,operation_id:op.id,tipo:'comercio_no_reconocido',estado:'abierta',bloquea_aprobacion:true,
        descripcion:'Falta vincular el comercio. Una observación no crea su ficha.',liquidation_operations:op});
    return result;
  }
  const key=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function create({sb,dialog,esc,onSaved}){
    async function all(table,fields){
      const rows=[];
      for(let from=0;;from+=500){
        const r=await sb.from(table).select(fields).eq('activo',true).order(table==='origenes'?'codigo':'id').range(from,from+499);
        if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;
      }
    }
    async function open(operationId){
      const modal=dialog('Vincular comercio','<p role="status">Consultando el comercio del archivo…</p>');
      try{
        const [result,origins,executives]=await Promise.all([
          sb.from('liquidation_operations').select('id,liquidation_id,establishment_name,referencia,origen_codigo,tipo_establecimiento').eq('id',operationId).maybeSingle(),
          all('origenes','codigo,nombre,ciudad,tipo'),all('ejecutivos','id,nombre')]);
        if(!modal.isConnected)return;
        if(result.error)throw result.error;
        const op=result.data;if(!op)throw Error('Operación no encontrada. Actualiza el lote.');
        if(!missing(op))throw Error('El comercio ya está vinculado. Actualiza el lote para ver su cuenta.');
        const options=origins.filter(o=>['propia','aliado'].includes(o.tipo)).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
        const content=document.createElement('section');content.className='commerce-editor';
        content.innerHTML=`<p><strong>${esc(op.establishment_name)}</strong><br>${esc(op.referencia)}</p>
          <p>Elige el comercio al que pertenece esta venta. Si es nuevo, registra el local para que aparezca en Clientes y cuentas.</p>
          <form><label>Qué necesitas hacer<select class="control" name="mode"><option value="existing">Vincular comercio existente</option><option value="new">Registrar nuevo local aliado</option></select></label>
          <fieldset data-existing><legend>Comercio registrado en KORA</legend>
            <label>Buscar por nombre, código o ciudad<input class="control" type="search" name="search" placeholder="Ejemplo: Coveñas"></label>
            <label>Selecciona el comercio<select class="control" name="origin" required></select></label><p data-kind></p></fieldset>
          <fieldset data-new hidden disabled><legend>Nuevo local aliado</legend>
            <label>Nombre del local<input class="control" name="name" required minlength="3" maxlength="180" value="${esc(op.establishment_name)}"></label>
            <label>Ciudad<input class="control" name="city" required minlength="2" maxlength="120" autocomplete="address-level2"></label>
            <label>Ejecutivo responsable de Creditek<select class="control" name="executive" required><option value="">Selecciona el ejecutivo</option>${executives.map(e=>`<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</select></label>
            <p>No es el vendedor reportado por la financiera. Si el local pertenece a un cliente existente, podrás relacionarlo en su ficha sin duplicar su cuenta.</p></fieldset>
          <label class="commerce-confirm"><input type="checkbox" name="verified" required><span>Verifiqué que esta venta pertenece al comercio seleccionado o al nuevo local.</span></label>
          <p>No cambia importes ni aprueba o registra pagos. El nombre del archivo quedará vinculado para futuras importaciones.</p>
          <p role="alert"></p><button class="btn primary" type="submit">Guardar vinculación</button></form>`;
        modal.querySelector('[role=status]').replaceWith(content);
        const form=content.querySelector('form'),f=form.elements,existing=content.querySelector('[data-existing]'),newFields=content.querySelector('[data-new]');
        const hint=()=>{const o=options.find(o=>o.codigo===f.origin.value);content.querySelector('[data-kind]').textContent=o?(o.tipo==='propia'?'Tienda propia: conserva su flujo Retail; no requiere crear una cuenta de aliado.':'Aliado: podrás completar el titular y la cuenta en la ficha única del cliente.'):'No se selecciona ningún comercio automáticamente.';};
        const filter=()=>{const chosen=f.origin.value,q=key(f.search.value.trim());
          const matches=options.filter(o=>!q||key([o.nombre,o.codigo,o.ciudad].join(' ')).includes(q));
          f.origin.innerHTML='<option value="">Selecciona el comercio correcto</option>'+matches.map(o=>`<option value="${esc(o.codigo)}">${esc(o.nombre)} · ${o.tipo==='propia'?'Tienda propia':'Aliado'} · ${esc(o.ciudad||'Ciudad sin informar')} · ${esc(o.codigo)}</option>`).join('');
          f.origin.value=matches.some(o=>o.codigo===chosen)?chosen:'';hint();
        };
        f.search.oninput=()=>{f.verified.checked=false;filter();};f.origin.onchange=()=>{f.verified.checked=false;hint();};
        f.mode.onchange=()=>{const isNew=f.mode.value==='new';existing.hidden=isNew;existing.disabled=isNew;newFields.hidden=!isNew;newFields.disabled=!isNew;f.verified.checked=false;};
        filter();
        form.onsubmit=async event=>{
          event.preventDefault();if(!form.reportValidity())return;
          const submit=form.querySelector('[type=submit]'),close=modal.querySelector('[data-close]');
          submit.disabled=true;close.disabled=true;modal.oncancel=e=>e.preventDefault();
          const isNew=f.mode.value==='new',params={p_operation_id:op.id,p_origen_codigo:isNew?null:f.origin.value,
            p_nuevo:isNew?{nombre:f.name.value.trim(),ciudad:f.city.value.trim(),ejecutivo_id:f.executive.value}:null};
          try{
            const r=await sb.rpc('aliados_vincular_comercio',params);if(r.error)throw r.error;
            if(!r.data?.ok||!r.data.origen_codigo)throw Error('No se confirmó la vinculación. Actualiza antes de reintentar.');
            content.innerHTML=`<p role="status"><strong>Comercio vinculado correctamente.</strong></p><p>${esc(r.data.nombre||op.establishment_name)}</p>`+
              (r.data.tipo==='aliado'?`<p>Ya aparece en la ficha única del cliente. Completa allí sus datos y cuenta; si comparte titular con otros locales, relaciónalo con ese cliente.</p><a class="btn primary" href="aliados-tesoreria.html?vista=clientes&amp;origen=${encodeURIComponent(r.data.origen_codigo)}">Completar cliente y cuenta</a>`:'<p>Se conserva como tienda propia. No se creó una cuenta de aliado.</p>');
            try{await onSaved(op.liquidation_id);}catch{content.insertAdjacentHTML('beforeend','<p>La vinculación está guardada. Actualiza el lote para refrescar el resumen.</p>');}
          }catch(error){form.querySelector('[role=alert]').textContent=error.message;submit.disabled=false;}
          finally{close.disabled=false;modal.oncancel=null;}
        };
      }catch(error){if(modal.isConnected){const status=modal.querySelector('[role=status]');status.setAttribute('role','alert');status.textContent=error.message;}}
    }
    return {open};
  }
  const api={types,missing,pending,create};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CreditekLiquidacionesComercios=api;
})(typeof window==='undefined'?globalThis:window);
