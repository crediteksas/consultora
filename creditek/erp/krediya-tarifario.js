(function(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function numeric(value) {
    if(value==null || typeof value==='boolean' || String(value).trim()==='') return null;
    const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;
  }
  function giro(context) {
    const pagamos=numeric(context.pagamos),inicial=numeric(context.inicial);
    return pagamos==null||inicial==null?null:Math.round((pagamos-inicial)*100)/100;
  }
  function impacto(rows) {
    const values=rows.map(r=>numeric(r.contexto?.impacto_neto)),known=values.filter(v=>v!=null);
    return {total:known.length?Math.round(known.reduce((sum,value)=>sum+value,0)*100)/100:rows.length?null:0,pendientes:values.length-known.length};
  }
  function tarifaRows(rows) {
    return [['Código','Referencia','PVP configurado','PAGAMOS antes de inicial','Vigente desde','Vigente hasta'],
      ...rows.map(r=>[r.codigo || '',r.referencia,numeric(r.precio_venta),numeric(r.pagamos),r.vigente_desde,r.vigente_hasta || ''])];
  }
  function diferenciasRows(rows) {
    return [['Referencia','Comercio','IMEI','Fecha venta','PVP configurado','PVP Krediya','Diferencia PVP','PAGAMOS pactado','Inicial','Giro al aliado','Bonos','Utilidad neta','Impacto neto','Responsables','Estado','Última gestión','Soporte','Gasto financiero','Provisión'],
      ...rows.map(r=>{const c=r.contexto||{},g=last(r);return [c.referencia,c.tienda,c.imei,c.fecha,numeric(c.pvp_guardado),numeric(c.pvp_liquidado),numeric(c.impacto_bruto),numeric(c.pagamos),numeric(c.inicial),giro(c),numeric(c.bonos),numeric(c.utilidad_neta),numeric(c.impacto_neto),'Oscar y Mayte',r.estado,g?.comentario||'',g?.soporte||'',numeric(c.gasto_financiero),numeric(c.provision)];})];
  }
  function last(row) {return [...(row.krediya_diferencias_gestiones||[])].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];}
  function download(rows,name,sheetName) {
    const book=root.XLSX.utils.book_new(),sheet=root.XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols']=rows[0].map((h,i)=>({wch:i===1?36:Math.min(26,Math.max(18,h.length+2))}));
    sheet['!autofilter']={ref:root.XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:rows[0].length-1}})};
    // Text stays text; no user-supplied Excel formulas are created.
    for(let r=1;r<rows.length;r++) for(let c=0;c<rows[0].length;c++) {
      const cell=sheet[root.XLSX.utils.encode_cell({r,c})]; if(cell?.t==='n') cell.z='"$"#,##0.00';
    }
    root.XLSX.utils.book_append_sheet(book,sheet,sheetName);root.XLSX.writeFile(book,name);
  }
  function create({sb,money}) {
    let modal;
    const amount=v=>numeric(v)==null?'No disponible':money(numeric(v));
    async function all(query) {
      const rows=[];
      for(let offset=0;;offset+=500) {
        const {data,error}=await query().range(offset,offset+499);if(error)throw error;
        if(!Array.isArray(data))throw new Error('La respuesta está incompleta. Vuelve a intentar.');
        rows.push(...data);if(data.length<500)return rows;
      }
    }
    async function openTariff() {
      modal?.remove();modal=document.createElement('dialog');modal.className='krediya-tariff-dialog';
      modal.setAttribute('aria-labelledby','krediya-tariff-title');
      modal.innerHTML='<header><h2 id="krediya-tariff-title">Tarifario Krediya</h2><button class="btn secondary" data-close>Cerrar</button></header><p>PVP configurado y PAGAMOS pactado. Giro al aliado = PAGAMOS − inicial. Editar aquí no cambia precios en la plataforma de Krediya ni liquidaciones aprobadas.</p><div data-content>Cargando…</div>';
      const dialog=modal;
      document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
      const content=modal.querySelector('[data-content]');let rows=[];
      async function load() {
        try {rows=await all(()=>sb.from('krediya_price_rules').select('*').eq('activo',true).order('referencia').order('vigente_desde',{ascending:false}).order('id'));render();}
        catch(e){content.textContent='No se pudo cargar el tarifario: '+e.message;}
      }
      function render(search='') {
        const filtered=rows.filter(r=>`${r.codigo||''} ${r.referencia}`.toLowerCase().includes(search.toLowerCase()));
        content.innerHTML=`<div class="tariff-controls"><label>Buscar código o referencia<input class="control" data-search value="${esc(search)}"></label><button class="btn primary" data-download>Descargar tarifario Excel</button></div><p>${filtered.length} tarifas · Se muestran también vigencias anteriores activas.</p><p data-export-error role="alert"></p><div class="tariff-list">${filtered.map(r=>`<article><div><h3>${esc(r.referencia)}</h3><p>${esc(r.codigo||'Sin código')} · Desde ${esc(r.vigente_desde)}${r.vigente_hasta?' hasta '+esc(r.vigente_hasta):''}</p></div><dl><div><dt>PVP configurado</dt><dd>${amount(r.precio_venta)}</dd></div><div><dt>PAGAMOS pactado</dt><dd>${amount(r.pagamos)}</dd></div></dl>${r.vigente_hasta?'':'<button class="btn secondary" data-edit="'+esc(r.id)+'">Editar precios</button>'}</article>`).join('')||'<p>No hay referencias con ese filtro.</p>'}</div>`;
        const searchInput=content.querySelector('[data-search]');
        searchInput.oninput=()=>{const pos=searchInput.selectionStart;render(searchInput.value);const input=content.querySelector('[data-search]');input.focus();input.setSelectionRange(pos,pos);};
        content.querySelector('[data-download]').onclick=()=>{try{download(tarifaRows(filtered),'Tarifario-Krediya.xlsx','Tarifario');}catch{content.querySelector('[data-export-error]').textContent='No se pudo descargar el Excel. Recarga la página y vuelve a intentar.';}};
        content.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(rows.find(r=>r.id===b.dataset.edit)));
      }
      function edit(r) {
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date()),desde=today<r.vigente_desde?r.vigente_desde:today;
        content.innerHTML=`<h3>${esc(r.referencia)}</h3><p>PVP actual: ${amount(r.precio_venta)} · PAGAMOS actual: ${amount(r.pagamos)}</p><form class="tariff-form"><label>PVP configurado<input class="control" name="pvp" type="number" min="0.01" step="0.01" required value="${esc(numeric(r.precio_venta)??'')}"></label><label>PAGAMOS pactado antes de inicial<input class="control" name="pagamos" type="number" min="0.01" step="0.01" required value="${esc(numeric(r.pagamos)??'')}"></label><label>Aplicar a ventas desde<input class="control" name="desde" type="date" min="${esc(r.vigente_desde)}" value="${esc(desde)}" required></label><label>Motivo del cambio<textarea class="control" name="motivo" minlength="5" maxlength="2000" required></textarea></label><p>Se conservarán los valores anteriores en auditoría. Los lotes ya calculados no se actualizan solos; los aprobados no cambian.</p><p data-error role="alert"></p><div class="tariff-controls"><button class="btn secondary" type="button" data-back>Volver</button><button class="btn primary" type="submit">Guardar nueva vigencia</button></div></form>`;
        content.querySelector('[data-back]').onclick=()=>render();
        content.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,button=f.querySelector('[type=submit]');button.disabled=true;
          try {const pvp=numeric(f.elements.pvp.value),pagamos=numeric(f.elements.pagamos.value);if(pvp==null||pagamos==null||pvp<=0||pagamos<=0)throw new Error('Ingresa PVP y PAGAMOS válidos, mayores que cero.');const {error}=await sb.rpc('krediya_guardar_tarifa',{p_id:r.id,p_version:r.updated_at,p_pvp:pvp,p_pagamos:pagamos,p_desde:f.elements.desde.value,p_motivo:f.elements.motivo.value.trim()});if(error)throw error;await load();}
          catch(error){f.querySelector('[data-error]').textContent=error.message;button.disabled=false;}};
      }
      await load();
    }
    async function report(container,batch) {
      container.textContent='Cargando diferencias de PVP…';
      let rows;
      try {rows=await all(()=>sb.from('krediya_diferencias').select('*,krediya_diferencias_gestiones(*)').eq('liquidation_id',batch.id).order('operation_id'));}
      catch(error){container.textContent='No se pudo cargar el informe: '+error.message;return;}
      const summary=impacto(rows);
      const states={pendiente:'Pendiente',en_gestion:'En gestión',resuelta:'Resuelta'};
      container.innerHTML=`<section class="krediya-differences">
        <header><div><h3>Informe de diferencias de PVP</h3><p>Krediya · Corte ${esc(batch.fecha_corte)} · Responsables: Oscar y Mayte</p></div><button class="btn primary" data-export>Descargar informe Excel</button></header>
        <p>Estas tareas no bloquean la aprobación ni el pago autorizado. Los valores corresponden al cálculo guardado, no al tarifario actual.</p>
        <div class="difference-summary"><strong>${rows.length} diferencias</strong><span>${rows.filter(r=>r.estado!=='resuelta').length} por gestionar</span><span>${summary.pendientes?'Impacto neto parcial':'Impacto neto cuantificado'}: ${amount(summary.total)}</span>${summary.pendientes?`<span>${summary.pendientes} sin impacto cuantificado</span>`:''}</div>
        <p data-export-error role="alert"></p>
        ${rows.length?'':'<p>Sin diferencias registradas. Si el lote está sin calcular, genera la liquidación para obtener el informe.</p>'}
        ${rows.map(r=>{
          const c=r.contexto||{},g=last(r);
          const fields=[['PVP configurado',c.pvp_guardado],['PVP Krediya liquidado',c.pvp_liquidado],['Diferencia PVP',c.impacto_bruto],['PAGAMOS pactado',c.pagamos],['Inicial',c.inicial],['Giro al aliado',giro(c)],['Bonos',c.bonos],['Gasto financiero',c.gasto_financiero],['Provisión',c.provision],['Utilidad neta',c.utilidad_neta],['Impacto neto',c.impacto_neto]];
          return `<article class="difference-card">
            <header><div><h4>${esc(c.referencia||'Referencia no informada')}</h4><p>${esc(c.tienda||'Comercio no informado')} · IMEI ${esc(c.imei||'No informado')} · Venta ${esc(c.fecha||'No informada')}</p></div><span class="difference-status">${esc(states[r.estado]||'Estado no informado')}</span></header>
            <dl>${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${amount(value)}</dd></div>`).join('')}</dl>
            ${numeric(c.pvp_guardado)==null?'<p>Falta PVP de referencia para comparar; el cálculo usa el PVP recibido y respeta PAGAMOS.</p>':''}
            ${g?`<p>Última gestión: ${esc(g.comentario)} · ${esc(g.autor_nombre)}</p>`:''}
            <details><summary>Gestionar / ver historial</summary>
              <p>Deja la instrucción para Oscar y Mayte. Guardarla no modifica el precio en la plataforma de Krediya ni registra un pago.</p>
              ${(r.krediya_diferencias_gestiones||[]).map(g=>`<p>${esc(g.created_at)} · ${esc(g.autor_nombre)} · ${esc(states[g.estado]||g.estado)}<br>${esc(g.comentario)}<br>${esc(g.soporte||'')}</p>`).join('')}
              <form data-followup="${esc(r.operation_id)}" class="tariff-form"><label>Estado<select class="control" name="estado"><option value="en_gestion">En gestión</option><option value="resuelta">Resuelta</option></select></label><label>Instrucción o gestión para Oscar y Mayte<textarea class="control" name="comentario" minlength="5" maxlength="4000" required></textarea></label><label>Soporte (obligatorio al resolver)<input class="control" name="soporte" maxlength="2000"></label><p data-error role="alert"></p><button class="btn primary" type="submit">Guardar seguimiento</button></form>
            </details></article>`;
        }).join('')}</section>`;
      container.querySelector('[data-export]').onclick=()=>{try{download(diferenciasRows(rows),`Diferencias-Krediya-${batch.fecha_corte}.xlsx`,'Diferencias PVP');}catch{container.querySelector('[data-export-error]').textContent='No se pudo descargar el Excel. Recarga la página y vuelve a intentar.';}};
      container.querySelectorAll('[data-followup]').forEach(f=>{
        f.elements.estado.onchange=()=>{f.elements.soporte.required=f.elements.estado.value==='resuelta';};
        f.onsubmit=async e=>{e.preventDefault();const button=f.querySelector('[type=submit]');button.disabled=true;
          try{const {error}=await sb.rpc('krediya_gestionar_diferencia',{p_operation_id:f.dataset.followup,p_estado:f.elements.estado.value,p_comentario:f.elements.comentario.value.trim(),p_soporte:f.elements.soporte.value.trim()||null});if(error)throw error;await report(container,batch);}
          catch(error){f.querySelector('[data-error]').textContent=error.message;button.disabled=false;}};
      });
    }
    return {openTariff,report};
  }
  const api={create,tarifaRows,diferenciasRows,last,numeric,giro,impacto};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CreditekKrediyaTarifario=api;
})(typeof window==='undefined'?globalThis:window);
