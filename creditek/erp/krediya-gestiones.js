(function (root) {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = { pendiente:'Pendiente de Maythe', en_gestion:'En gestión', realizada:'Realizada según responsable', no_aplicada:'No aplicada / requiere respuesta' };
  const events = (row) => [...(row.krediya_gestiones || [])].sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id), undefined, { numeric:true }));
  const latest = (row) => events(row).at(-1);
  const status = (row) => latest(row)?.estado || 'pendiente';
  const csvCell = (value) => {
    let v = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(v)) v = "'" + v;
    return '"' + v.replaceAll('"','""') + '"';
  };
  function reportCsv(rows) {
    const matrix = [['Referencia','Comercio','IMEI','Fecha venta','Plataforma de gestión','PVP guardado al instruir','PVP recibido al instruir','PVP objetivo en Krediya','Instrucción de Gerencia','Autor','Responsable','Estado','Creada','Último comentario','Evidencia / referencia']];
    rows.forEach(row => {
      const c = row.contexto || {}, e = latest(row);
      matrix.push([c.referencia,c.tienda,c.imei,c.fecha,'Krediya',c.pvp_guardado,c.pvp_recibido,row.pvp_objetivo,row.instruccion,row.autor_nombre,row.responsable_nombre,labels[status(row)],row.created_at,e?.comentario,e?.evidencia]);
    });
    return '\uFEFF' + matrix.map(line => line.map(csvCell).join(';')).join('\r\n');
  }
  function create({ sb, userId, capability, money, onReport }) {
    const $ = id => document.getElementById(id);
    const date = value => value ? new Intl.DateTimeFormat('es-CO', {dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : '—';
    let returnFocus;
    let reportRequest = 0;
    const close = () => { $('instructionEditor').classList.remove('show'); returnFocus?.focus(); };
    $('closeInstructionEditor').onclick = close;
    $('instructionEditor').addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const inputs = [...$('instructionEditor').querySelectorAll('button:not(:disabled), input:not(:disabled), textarea, select')];
      const first = inputs[0], last = inputs.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    async function open(operationId) {
      if (capability !== 'aprobador') throw new Error('Solo Gerencia puede dejar instrucciones.');
      returnFocus = document.activeElement;
      $('instructionEditor').classList.add('show');
      $('instructionContent').textContent = 'Cargando referencia y responsable…';
      $('closeInstructionEditor').focus();
      try {
        const [{data:c,error}, {data:operators,error:operatorError}] = await Promise.all([
          sb.rpc('aliados_contexto_precio_krediya',{p_operation_id:operationId}),
          sb.from('aliados_operadores').select('perfil_id').eq('capacidad','revisor').eq('activo',true)
        ]);
        if (error || operatorError) throw error || operatorError;
        if (!operators?.length) throw new Error('No hay un responsable de revisión activo.');
        const {data:reviewers,error:reviewerError} = await sb.from('perfiles').select('id,nombre').in('id',operators.map(o=>o.perfil_id)).eq('activo',true);
        if (reviewerError) throw reviewerError;
        if (!reviewers?.length) throw new Error('No se pudo identificar al responsable.');
        $('instructionContent').innerHTML = `<p><strong>${esc(c.referencia)}</strong><br>${esc(c.tienda)} · IMEI ${esc(c.imei)}</p>
          <div class="instruction-context"><span>PVP guardado: <strong>${c.pvp_guardado == null ? 'No registrado' : money(c.pvp_guardado)}</strong></span><span>Recibido de Krediya: <strong>${c.pvp_recibido == null ? 'No informado' : money(c.pvp_recibido)}</strong></span></div>
          <p class="instruction-boundary">Esta es una instrucción para actuar en la plataforma de <strong>Krediya</strong>. No cambia precios en KORA, no resuelve diferencias de la liquidación y no autoriza pagos.</p>
          <form id="instructionForm"><label>Responsable<select class="control" id="instructionAssignee" required>${reviewers.map(p=>`<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}</select></label>
          <label>PVP objetivo en Krediya (COP, opcional)<input class="control" id="instructionTarget" type="number" min="1" step="1" placeholder="Ejemplo: 880000"></label>
          <label>Tu instrucción para Maythe<textarea class="control" id="instructionText" required minlength="5" maxlength="4000" rows="4" placeholder="Indica qué debe hacer en Krediya y por qué."></textarea></label>
          <p id="instructionPreview" aria-live="polite">El cambio quedará pendiente de gestión.</p>
          <p class="error" id="instructionError" role="alert"></p><button class="btn primary" type="submit" id="saveInstruction">Guardar en informe de Maythe</button></form>`;
        $('instructionTarget').oninput = () => {
          const value = Number($('instructionTarget').value);
          $('instructionPreview').textContent = value > 0 ? `PVP solicitado en Krediya: ${money(value)}. Pendiente de que Maythe lo gestione; aún no aplicado.` : 'El cambio quedará pendiente de gestión.';
        };
        $('instructionForm').onsubmit = async event => {
          event.preventDefault();
          const target = $('instructionTarget').value.trim();
          const text = $('instructionText').value.trim();
          if (text.length < 5 || (target && (!Number.isFinite(Number(target)) || Number(target) <= 0))) return;
          $('saveInstruction').disabled = true; $('instructionError').textContent = '';
          try {
            const {error:saveError} = await sb.from('krediya_instrucciones').insert({operation_id:operationId,responsable_id:$('instructionAssignee').value,instruccion:text,pvp_objetivo:target ? Number(target) : null});
            if (saveError) throw saveError;
          } catch (saveError) { $('instructionError').textContent = saveError.message; $('saveInstruction').disabled = false; return; }
          $('instructionPreview').textContent = 'Instrucción guardada. Pendiente de gestión en Krediya.';
          try { await onReport(); close(); }
          catch (reportError) { $('instructionError').textContent = 'La instrucción ya quedó guardada. No la repitas. Abre Gestión Maythe para consultarla. ' + reportError.message; }
        };
        $('instructionText').focus();
      } catch (error) { $('instructionContent').textContent = 'No se pudo abrir la instrucción: ' + error.message; }
    }
    async function renderReport(container, liquidationId) {
      const request = ++reportRequest;
      let allBatches = false, filter = '', page = 0, rows = [], loadRequest = 0;
      async function load() {
        const loadId = ++loadRequest, scopeAll = allBatches, loaded = [];
        container.textContent = 'Cargando informe de gestión…';
        try {
          // Read all pages: no silent truncation at PostgREST's default row limit.
          for (let offset=0;;offset+=500) {
            let query = sb.from('krediya_instrucciones').select('*,krediya_gestiones(*)').order('created_at',{ascending:false}).order('id').range(offset,offset+499);
            if (!scopeAll) query = query.eq('liquidation_id',liquidationId);
            const {data,error} = await query;
            if (error) throw error;
            loaded.push(...(data || []));
            if ((data || []).length < 500) break;
          }
          if (request === reportRequest && loadId === loadRequest) { rows = loaded; render(); }
        } catch (error) { if (request === reportRequest && loadId === loadRequest) container.textContent = 'No se pudo cargar el informe: ' + error.message; }
      }
      function render() {
        const visible = rows.filter(row => !filter || status(row) === filter);
        const pages = Math.max(1,Math.ceil(visible.length/8)); page = Math.min(page,pages-1);
        container.innerHTML = `<section class="management-report"><header class="management-header"><div><h3>Informe de gestión para Maythe</h3><p>Instrucciones de Gerencia para actuar en Krediya. ${rows.length} registradas · ${rows.filter(r=>!['realizada','no_aplicada'].includes(status(r))).length} pendientes o en gestión.</p></div><button class="btn secondary" id="exportInstructions">Descargar informe CSV</button></header>
          <p class="instruction-boundary">Registrar una gestión no confirma que Krediya haya cambiado automáticamente. Tampoco modifica tarifas, cálculos, bonos ni autoriza pagos en KORA.</p>
          <div class="management-controls"><label>Alcance<select id="instructionScope" class="control"><option value="batch">Este lote</option><option value="all" ${allBatches?'selected':''}>Todos los lotes</option></select></label><label>Estado<select id="instructionFilter" class="control"><option value="">Todos los estados</option>${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${filter===key?'selected':''}>${label}</option>`).join('')}</select></label></div>
          <div>${visible.slice(page*8,(page+1)*8).map(row => {
            const c = row.contexto || {}, e = latest(row);
            const canManage = capability === 'aprobador' || row.responsable_id === userId;
            return `<article class="management-card"><header><div><h4>${esc(c.referencia || 'Referencia no informada')}</h4><p>${esc(c.tienda)} · IMEI ${esc(c.imei)}</p></div><span class="management-state">${labels[status(row)]}</span></header>
              <p class="management-instruction">${esc(row.instruccion)}</p>
              ${row.pvp_objetivo == null ? '' : `<p class="management-target">PVP solicitado <strong>en Krediya: ${money(row.pvp_objetivo)}</strong></p>`}
              <p class="management-meta">${esc(row.autor_nombre)} · ${esc(date(row.created_at))}<br>Responsable: ${esc(row.responsable_nombre)} · Venta: ${esc(c.fecha)}</p>
              ${e ? `<p><strong>Última gestión:</strong> ${esc(e.comentario)}<br><span class="management-meta">${esc(e.autor_nombre)} · ${esc(date(e.created_at))}</span></p>${e.evidencia ? `<p>Soporte o referencia: ${esc(e.evidencia)}</p>`:''}` : '<p class="management-meta">Maythe aún no ha registrado una gestión.</p>'}
              <details><summary>Ver historial (${events(row).length})</summary>${events(row).map(item=>`<p><strong>${labels[item.estado]}</strong> · ${esc(date(item.created_at))} · ${esc(item.autor_nombre)}<br>${esc(item.comentario)}${item.evidencia?`<br>Soporte: ${esc(item.evidencia)}`:''}</p>`).join('') || '<p>Instrucción pendiente, sin gestiones.</p>'}</details>
              ${canManage ? `<details class="management-editor"><summary>Registrar gestión o respuesta</summary><form data-management-form="${esc(row.id)}"><label>Resultado<select class="control" name="estado" required><option value="">Selecciona un estado</option><option value="en_gestion">En gestión en Krediya</option><option value="realizada">Cambio realizado en Krediya</option><option value="no_aplicada">No se pudo aplicar / requiere respuesta</option></select></label><label>Qué se hizo o qué falta<textarea class="control" name="comentario" rows="3" minlength="5" maxlength="4000" required></textarea></label><label>Soporte o referencia de la gestión (obligatorio si se realizó)<input class="control" name="evidencia" maxlength="2000" placeholder="Enlace al soporte, ticket o referencia verificable en Krediya"></label><p class="error" role="alert" data-management-error></p><button class="btn primary" type="submit">Guardar seguimiento</button></form></details>`:''}
            </article>`;
          }).join('') || '<p class="management-empty">No hay instrucciones para estos filtros. Gerencia puede crearlas desde cada operación de Krediya.</p>'}</div>
          <div class="management-controls"><button class="btn secondary" id="instructionsPrevious" ${page===0?'disabled':''}>Anterior</button><span>Página ${page+1} de ${pages} · ${visible.length} instrucciones</span><button class="btn secondary" id="instructionsNext" ${page+1>=pages?'disabled':''}>Siguiente</button></div></section>`;
        $('instructionScope').onchange = async () => { allBatches = $('instructionScope').value === 'all'; page=0; await load(); };
        $('instructionFilter').onchange = () => { filter=$('instructionFilter').value; page=0; render(); };
        $('instructionsPrevious').onclick = () => { page--;render(); };
        $('instructionsNext').onclick = () => { page++;render(); };
        $('exportInstructions').onclick = () => {
          const url = URL.createObjectURL(new Blob([reportCsv(visible)],{type:'text/csv;charset=utf-8'}));
          const link = document.createElement('a'); link.href=url;link.download='Informe-gestion-Krediya.csv';link.click();
          setTimeout(()=>URL.revokeObjectURL(url),1000);
        };
        container.querySelectorAll('[data-management-form]').forEach(form => {
          const stateSelect = form.elements.namedItem('estado'), evidence = form.elements.namedItem('evidencia');
          stateSelect.onchange = () => { evidence.required = stateSelect.value === 'realizada'; };
          form.onsubmit = async event => {
            event.preventDefault();
            const comment = form.elements.namedItem('comentario').value.trim();
            if (comment.length<5 || !stateSelect.value || (stateSelect.value==='realizada'&&!evidence.value.trim())) return;
            const button=form.querySelector('button[type="submit"]'), errorNode=form.querySelector('[data-management-error]');
            button.disabled=true;errorNode.textContent='';
            try {
              const {error} = await sb.from('krediya_gestiones').insert({instruccion_id:form.dataset.managementForm,estado:stateSelect.value,comentario:comment,evidencia:evidence.value.trim()||null});
              if (error) throw error;
              await load();
            } catch(error) {errorNode.textContent=error.message;button.disabled=false;}
          };
        });
      }
      await load();
    }
    return {open,renderReport,cancelReport:()=>{reportRequest++;}};
  }
  const api = { create, status, latest, reportCsv };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreditekKrediyaGestiones = api;
})(typeof window === 'undefined' ? globalThis : window);
