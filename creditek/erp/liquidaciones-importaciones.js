(function(root){
  'use strict';
  const pending = ['importada','validada','con_novedades','calculada','revisada'];
  const canRemove = batch => !!batch && pending.includes(batch.estado) && !batch.frozen_at && !batch.approved_at && !batch.approved_by;
  function create({sb, dialog, esc, platformName, onRemoved}) {
    const button=document.createElement('button');
    button.type='button';button.id='removeImport';button.className='btn secondary hidden';
    button.textContent='Eliminar importación';
    document.getElementById('approve').parentElement.append(button);
    let selected;
    button.onclick=async()=>{
      if(!canRemove(selected))return;
      const id=selected.id;
      const modal=dialog('Eliminar importación','<p role="status">Consultando el archivo y su estado…</p>');
      try {
        const {data:batch,error}=await sb.from('liquidations').select('*,liquidation_imported_files(original_name)').eq('id',id).maybeSingle();
        if(error)throw error;
        if(!modal.isConnected)return;
        if(!canRemove(batch))throw new Error('El lote ya no está disponible para eliminar. Actualiza la lista; puede haber sido aprobado.');
        const content=document.createElement('div');
        content.innerHTML=`<p><strong>${esc(platformName(batch.plataforma))}</strong> · Corte ${esc(batch.fecha_corte || 'sin informar')}</p>
          <ul>${(batch.liquidation_imported_files||[]).map(f=>`<li style="overflow-wrap:anywhere">${esc(f.original_name)}</li>`).join('') || '<li>Nombre de archivo no disponible</li>'}</ul>
          <p>Se retirará todo este lote y sus cálculos provisionales. El original y un respaldo quedan en auditoría. Podrás cargar el archivo corregido.</p>
          <p>No se eliminan lotes aprobados, pagos autorizados ni movimientos financieros.</p>
          <form><label>Motivo<textarea class="control" name="reason" required minlength="5" maxlength="1000" placeholder="Ejemplo: el archivo de ALO Credit contiene valores incorrectos."></textarea></label>
          <p role="alert"></p><button class="btn danger" type="submit">Eliminar este lote</button></form>`;
        modal.querySelector('[role=status]').replaceWith(content);
        content.querySelector('form').onsubmit=async event=>{
          event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');
          const reason=form.elements.reason.value.trim();
          if(reason.length<5){form.querySelector('[role=alert]').textContent='Indica el motivo (mínimo 5 caracteres).';return;}
          submit.disabled=true;form.querySelector('[role=alert]').textContent='';
          try{
            const result=await sb.rpc('aliados_eliminar_importacion',{p_id:id,p_motivo:reason});
            if(result.error)throw result.error;
            if(!result.data?.retirada)throw new Error('No se confirmó la eliminación. Actualiza la lista antes de reintentar.');
            modal.close();await onRemoved(id);
          }catch(error){form.querySelector('[role=alert]').textContent=error.message;submit.disabled=false;}
        };
      }catch(error){if(modal.isConnected){const status=modal.querySelector('[role=status]');status.setAttribute('role','alert');status.textContent=error.message;}}
    };
    return {setBatch(batch){selected=batch;button.classList.toggle('hidden',!canRemove(batch));}};
  }
  const api={canRemove,create};
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.CreditekLiquidacionesImportaciones=api;
})(typeof window==='undefined'?globalThis:window);
