(function (global) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const local = value => new Intl.DateTimeFormat('sv-SE', { timeZone:'America/Bogota', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit' }).format(new Date(value));
  const money = n => n == null ? 'Por confirmar' : new Intl.NumberFormat('es-CO',{ style:'currency',currency:'COP',maximumFractionDigits:0 }).format(n);
  const estados = { abierto:'Pendiente de conteo', pendiente:'Pendiente de Mayte / Óscar', aplicado:'Ajuste aplicado',sin_diferencias:'Revisado sin diferencias',rechazado:'Cerrado sin aplicar' };
  const fechaCorte = c => c.revision_fuente?.fecha_confirmada || local(c.corte_at);
  const estadoCorte = c => c.revision_fuente?.solo_comparativo && c.estado==='pendiente' ? 'Comparativo histórico · pendiente de revisión' : estados[c.estado];
  function init({ sb, XLSX, tiendaActual, refrescar }) {
    let config, detalle, busy=false, ready;
    const el = id => document.getElementById(`conteos-${id}`);
    document.body.insertAdjacentHTML('beforeend', `<div id="conteos-modal" class="modal-bg" style="z-index:10000" role="dialog" aria-modal="true" aria-label="Conteos y ajustes de inventario">
      <div class="modal-box" style="max-width:1250px;width:100%">
        <div style="display:flex;justify-content:space-between;gap:16px"><h2>Conteos y ajustes</h2><button id="conteos-cerrar" class="btn-export">Cerrar</button></div>
        <p style="margin:12px 0">Un solo archivo para equipos y accesorios. Subirlo no modifica existencias: Mayte u Óscar revisan y autorizan. Reporta cantidades reconstruidas a la fecha del corte: físico + salidas posteriores − entradas posteriores. El sistema compara solamente contra el corte.</p>
        <div class="inventario-form"><label>Tienda<select id="conteos-tienda"></select></label>
        <div class="form-actions"><button id="conteos-crear" class="primary">Crear corte y descargar</button><button id="conteos-ciego" class="secondary">Crear conteo ciego</button></div></div>
        <p id="conteos-mensaje" role="status" style="margin:12px 0;white-space:pre-wrap"></p>
        <details open><summary>Historial por fecha del corte</summary><div class="inventario-form" style="margin-top:12px">
          <label>Desde<input id="conteos-desde" type="date"></label><label>Hasta<input id="conteos-hasta" type="date"></label>
          <label>Responsable (creó, contó o autorizó)<input id="conteos-responsable" placeholder="Nombre"></label>
          <div class="form-actions"><button id="conteos-buscar" class="secondary">Consultar</button><button id="conteos-informe" class="secondary">Descargar informe completo</button></div>
        </div><div id="conteos-historial" style="margin:14px 0"></div></details>
        <section id="conteos-detalle" style="margin-top:20px"></section>
      </div></div>`);
    el('desde').value=`${local(new Date()).slice(0,4)}-01-01`;
    el('hasta').value=local(new Date()).slice(0,10);
    async function rpc(accion,datos={}) {
      const { data,error }=await sb.rpc('inventario_conteos',{ p_accion:accion,p_datos:datos });
      if(error) throw new Error(error.message);
      if(!data) throw new Error('El servidor no devolvió confirmación.');
      return data;
    }
    async function run(task) {
      if(busy) return;
      busy=true;el('mensaje').textContent='Procesando…';
      el('modal').setAttribute('aria-busy','true');
      el('modal').querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=true;});
      try { await task(); el('mensaje').textContent='Listo.'; }
      catch(e) { el('mensaje').textContent=e.message; }
      finally { busy=false;el('modal').removeAttribute('aria-busy');el('modal').querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=false;}); }
    }
    function guardarLibro(libro,nombre) { XLSX.writeFile(libro,nombre); }
    function hoja(libro,filas,nombre) {
      const sheet=XLSX.utils.json_to_sheet(filas);
      sheet['!cols']=Object.keys(filas[0]||{}).map(k=>({wch:/Referencia|Observación|Motivo|Soporte/.test(k)?40:23}));
      sheet['!autofilter']={ref:sheet['!ref']||'A1:A1'};
      XLSX.utils.book_append_sheet(libro,sheet,nombre);
    }
    function descargar(ciego=false) {
      const { corte,lineas }=detalle;
      if(corte.revision_fuente?.solo_comparativo) return descargarComparativo();
      const libro=XLSX.utils.book_new();
      hoja(libro,lineas.map(l=>({
        'Código producto':l.codigo,'Referencia':l.nombre,'Tipo':l.tipo==='cantidad'?'Accesorio / cantidad':'Equipo individual',
        'IMEI / serial':l.imei,...(ciego?{}:{'Cantidad sistema al corte':l.cantidad_corte,'Costo de la tienda':l.costo_tienda}),
        'Cantidad reportada al corte':'','Observación':''
      })),'Conteo');
      if (!lineas.length) libro.Sheets.Conteo=XLSX.utils.aoa_to_sheet([['Código producto','Referencia','Tipo','IMEI / serial','Cantidad reportada al corte','Observación']]);
      const resumen=XLSX.utils.aoa_to_sheet([
        ['Formato','KORA-CONTEO-2'],['Identificador del corte',corte.id],['Tienda',corte.tienda_nombre],['Fecha del corte (Colombia)',local(corte.corte_at)],
        ['Instrucciones','Completa Cantidad reportada al corte en TODAS las filas; cero es distinto de vacío. No borres ni repitas filas.'],
        ['Equipos','Una fila por IMEI/serial, cantidad 0 o 1. Accesorios sin IMEI.'],
        ['Sobrantes','Añade código de producto y serial si corresponde. Mayte debe identificar códigos desconocidos antes de subir.'],
        ['Regla del corte','Reportado al corte = físico contado + ventas y otras salidas posteriores al corte − compras, devoluciones y otras entradas posteriores al corte. La tienda hace esta conciliación manual; el sistema no la calcula.'],
        ['Ejemplo','Corte 100; físico 90 y 10 vendidos después: reporta 100. Diferencia cero; no se modifica el saldo actual de 90. Registra la explicación en Observación.'],
        ['Inventario incluido','Disponible de toda la tienda, sin los filtros de pantalla. No incluye equipos vendidos, en traslado o en garantía.'],
        ['Aprobación','Subir no aplica cambios. Mayte u Óscar revisan motivo, evidencia y valoración.']
      ]);
      resumen['!cols']=[{wch:31},{wch:110}];XLSX.utils.book_append_sheet(libro,resumen,'Resumen');
      guardarLibro(libro,`conteo-${corte.tienda_nombre}-${corte.id.slice(0,8)}${ciego?'-ciego':''}.xlsx`);
    }
    function pendientesFuente(c) {
      return (c.revision_fuente?.pendientes || []).map(p=>({Tienda:c.tienda_nombre,Corte:fechaCorte(c),Archivo:p.archivo,Fila:p.fila,Código:p.codigo||'',Referencia:p.nombre,'Base escrita en archivo':p.base,'Conteo escrito':p.conteo,Observación:p.motivo}));
    }
    function descargarComparativo() {
      const {corte:c,lineas}=detalle, libro=XLSX.utils.book_new();
      hoja(libro,lineas.map(l=>({Tienda:c.tienda_nombre,Corte:fechaCorte(c),Referencia:l.nombre,Código:l.codigo,IMEI:l.imei,'Base del archivo':l.cantidad_corte,'Reportado al corte':l.cantidad_fisica,Diferencia:l.diferencia,'Actual (consulta)':l.actual,'Costo tienda del archivo':l.costo_tienda,Observación:l.nota||''})),'Comparativo');
      const pendientes=pendientesFuente(c);if(pendientes.length)hoja(libro,pendientes,'Por aclarar');
      hoja(libro,(c.revision_fuente.fuentes||[]).map(f=>({Archivo:f.nombre,SHA256:f.sha256,'Fecha impresa':f.fecha_impresa,'Fecha confirmada por Óscar':fechaCorte(c),Alcance:'Solo comparación. No se aplicaron ajustes.'})),'Fuentes');
      guardarLibro(libro,`comparativo-${c.tienda_nombre}-${fechaCorte(c)}.xlsx`);
    }
    async function crear(ciego) {
      if(!el('tienda').value) throw new Error('Selecciona una tienda; el corte no mezcla tiendas.');
      detalle=await rpc('crear',{tienda:el('tienda').value});renderDetalle();descargar(ciego);await historial();
    }
    async function obtenerHistorial() {
      const datos={desde:el('desde').value,hasta:el('hasta').value,tienda:el('tienda').value,responsable:el('responsable').value.trim()};
      const all=[];let page;
      do {
        page=(await rpc('informe',datos)).cortes;all.push(...page);
        const last=page.at(-1);if(last){datos.despues_fecha=last.corte_at;datos.despues_id=last.id;}
      } while(page.length===200);
      return all;
    }
    async function historial() {
      const cortes=await obtenerHistorial();
      el('historial').innerHTML=cortes.length?cortes.map(c=>`<div class="hist-item"><span>${esc(c.tienda_nombre)} · ${esc(fechaCorte(c))}<br>${esc(estadoCorte(c))} · ${esc(c.contado_nombre||c.creado_nombre)}</span><button class="btn-export" data-conteo-id="${esc(c.id)}">Ver</button></div>`).join(''):'Sin cortes en este rango. Los conteos anteriores al nuevo flujo no se inventan ni se importan automáticamente.';
      el('historial').querySelectorAll('[data-conteo-id]').forEach(b=>b.onclick=()=>run(async()=>{detalle=await rpc('ver',{id:b.dataset.conteoId});renderDetalle();}));
    }
    function renderDetalle() {
      const { corte,lineas }=detalle;
      const pendiente=corte.estado==='pendiente', corteFijo=corte.base_conteo==='corte_fijo';
      const historico=!!corte.revision_fuente?.solo_comparativo;
      const diferencias=lineas.filter(l=>l.diferencia!==null&&l.diferencia!==0);
      el('detalle').innerHTML=`<h2>${esc(corte.tienda_nombre)} · ${esc(estadoCorte(corte))}</h2>
        <p style="margin:12px 0">Corte: ${esc(fechaCorte(corte))} · ${lineas.length} referencias/equipos identificados.<br>
        ${corte.contado_at?`${corteFijo?'Conteo referido al corte':'Conteo del método anterior'}: ${esc(historico?fechaCorte(corte):local(corte.contado_at))} · Registrado por ${esc(corte.contado_nombre)}${corte.recibido_at?' el '+esc(local(corte.recibido_at)):''} · ${diferencias.length} diferencias.`:'Pendiente de subir cantidades reconstruidas al corte.'}</p>
        ${historico?`<div style="margin:12px 0;padding:12px;border:1px solid #b7791f"><strong>Solo comparativo: no modifica inventario.</strong><p>${esc(corte.revision_fuente.nota)}</p><h3>Filas por aclarar</h3>${(corte.revision_fuente.pendientes||[]).map(p=>`<p>${esc(p.nombre)} · ${esc(p.codigo||'Sin código')} · fila ${esc(p.fila)} · base escrita: ${esc(p.base)} · conteo: ${esc(p.conteo)}.<br>${esc(p.motivo)}</p>`).join('')}</div>`:''}
        ${corte.autorizado_at?`<p>Revisión: ${esc(corte.autorizado_nombre)} · ${esc(local(corte.autorizado_at))}<br>Motivo: ${esc(corte.motivo)}<br>Soporte: ${esc(corte.soporte||'—')}</p>`:''}
        <button id="conteos-redescargar" class="btn-export">${historico?'Descargar comparativo':'Descargar este corte'}</button>
        ${corte.estado==='abierto'?`<form id="conteos-form-subir" class="inventario-form" style="margin:16px 0">
          <label>Archivo único contado<input id="conteos-archivo" type="file" accept=".xlsx" required></label>
          <label><input id="conteos-confirmar-corte" type="checkbox" required> Confirmo que la tienda sumó las salidas y restó las entradas posteriores al corte. El Excel reporta lo que había al corte, no el físico de hoy.</label>
          <button class="btn-export" type="submit">Registrar conteo sin aplicar ajustes</button></form>`:''}
        <p style="margin:12px 0">${historico?'Diferencia = conteo del archivo − base del archivo. Actual es solo consulta, no una nueva base. Las filas por aclarar no están sumadas a las diferencias.':'Diferencia = cantidad reportada al corte − cantidad del sistema al corte. Propuesto hoy = inventario actual + diferencia. No se descuentan ventas otra vez. Si el resultado es negativo o el IMEI ya cambió de situación, debe conciliarse antes de aplicar.'}</p>
        <label><input type="checkbox" id="conteos-solo-dif" ${pendiente?'checked':''}> Mostrar solo diferencias</label>
        <div class="tabla-wrap" style="overflow:auto;max-height:450px;margin:12px 0"><table><thead><tr><th>Referencia / IMEI</th><th>Sistema al corte</th><th>Reportado al corte</th><th>Diferencia</th><th>Actual</th><th>Propuesto hoy / aplicado</th><th>Costo tienda</th><th>Observación</th></tr></thead><tbody id="conteos-lineas"></tbody></table></div>
        ${config.autoriza&&!historico&&(pendiente||corte.estado==='abierto')?`<form id="conteos-form-decidir" class="inventario-form">
          <label>Motivo de la revisión<textarea id="conteos-motivo" minlength="5" required></textarea></label>
          <label>Soporte o referencia documental<input id="conteos-soporte" placeholder="Número/enlace de acta o evidencia"></label>
          <label>Clasificación<select id="conteos-clasificacion"><option value="">Selecciona</option><option value="correccion_registro">Corrección de registro / sin diferencias</option><option value="faltante">Faltante identificado</option><option value="sobrante_por_aclarar">Sobrante por aclarar</option><option value="mixto">Diferencias mixtas</option></select></label>
          ${pendiente&&!corteFijo?'<p>Este conteo usa el método anterior. Ciérralo sin aplicar y registra un nuevo conteo referido al corte.</p>':''}<p>Un sobrante no genera utilidad B2B ni una ganancia ocasional automática. Este registro valora el ajuste de inventario; no crea pagos ni cartera.</p>
          <div class="form-actions">${pendiente&&corteFijo?'<button type="submit" class="primary">Autorizar y aplicar una sola vez</button>':''}<button type="button" id="conteos-rechazar" class="secondary">Cerrar sin aplicar</button></div></form>`:''}`;
      function pintarLineas() {
        const filas=el('solo-dif').checked?lineas.filter(l=>l.diferencia!==null&&l.diferencia!==0):lineas;
        el('lineas').innerHTML=filas.map(l=>`<tr><td>${esc(l.nombre)}<br>${esc(l.codigo)} ${esc(l.imei)}</td><td>${l.cantidad_corte}</td><td>${l.cantidad_fisica??'—'}</td><td>${l.diferencia??'—'}</td><td>${l.actual}</td><td>${historico?'Por validar':l.posterior??(l.diferencia===null?'—':l.actual+l.diferencia)}</td><td>${config.autoriza&&!historico&&pendiente&&l.diferencia!==0&&!(Number(l.costo_tienda)>0)?`<input type="number" min="0.01" step="0.01" style="width:130px" data-costo-codigo="${esc(l.codigo)}" data-costo-imei="${esc(l.imei)}" aria-label="Costo de tienda para ${esc(l.codigo)}">`:esc(money(l.costo_tienda))}</td><td>${esc(l.nota)}</td></tr>`).join('')||'<tr><td colspan="8">Sin diferencias registradas.</td></tr>';
      }
      pintarLineas();el('solo-dif').onchange=pintarLineas;
      el('redescargar').onclick=()=>descargar();
      el('form-subir')?.addEventListener('submit',event=>{event.preventDefault();run(subir);});
      el('form-decidir')?.addEventListener('submit',event=>{event.preventDefault();run(()=>decidir('aplicar'));});
      if(el('rechazar')) el('rechazar').onclick=()=>run(()=>decidir('rechazar'));
    }
    async function subir() {
      const file=el('archivo').files[0];if(!file)throw new Error('Selecciona el Excel contado.');
      if(file.size>10*1024*1024)throw new Error('El archivo supera 10 MB.');
      const buffer=await file.arrayBuffer();
      const parsed=global.KoraConteos.leerLibro(XLSX,XLSX.read(buffer,{type:'array'}));
      if(parsed.corte!==detalle.corte.id)throw new Error('Este archivo corresponde a otro corte. Ábrelo desde el historial.');
      if(!el('confirmar-corte').checked)throw new Error('Confirma que la tienda reconstruyó las cantidades a la fecha del corte.');
      const contado_at=detalle.corte.corte_at;
      const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
      detalle=await rpc('subir',{id:parsed.corte,base_conteo:'corte_fijo',contado_at,filas:parsed.filas,archivo:file.name,sha256});
      renderDetalle();await historial();
    }
    async function decidir(accion) {
      const motivo=el('motivo').value.trim(),soporte=el('soporte').value.trim(),clasificacion=el('clasificacion').value;
      if(motivo.length<5)throw new Error('Explica el motivo de la revisión.');
      if(accion==='aplicar'&&(!clasificacion||soporte.length<5))throw new Error('Completa clasificación y soporte antes de aplicar.');
      const costos=Array.from(el('lineas').querySelectorAll('[data-costo-codigo]'),i=>({codigo:i.dataset.costoCodigo,imei:i.dataset.costoImei,costo_tienda:Number(i.value)}));
      if(!global.confirm(accion==='aplicar'?`¿Autorizar el conteo de ${detalle.corte.tienda_nombre} y aplicar sus diferencias al inventario actual?`:'¿Cerrar este corte sin modificar existencias?'))return;
      detalle=await rpc(accion,{id:detalle.corte.id,base_conteo:'corte_fijo',motivo,soporte,clasificacion,costos});
      renderDetalle();await historial();if(accion==='aplicar')await refrescar();
    }
    async function informe() {
      const cortes=await obtenerHistorial(), rows=[], pendientes=[];
      for(const c of cortes) {
        const data=await rpc('ver',{id:c.id});
        pendientes.push(...pendientesFuente(c));
        for(const l of data.lineas.length?data.lineas:[{}])rows.push({
          Tienda:c.tienda_nombre,Corte:fechaCorte(c),Estado:estadoCorte(c),
          'Método del conteo':c.base_conteo==='corte_fijo'?'Referido al corte':'Método anterior','Fecha base del conteo':c.contado_at?(c.revision_fuente?fechaCorte(c):local(c.contado_at)):'',Creó:c.creado_nombre,Contó:c.contado_nombre||'',Autorizó:c.autorizado_nombre||'',
          'Fecha de subida':c.recibido_at?local(c.recibido_at):'','Fecha autorización':c.autorizado_at?local(c.autorizado_at):'',Referencia:l.nombre||'',Código:l.codigo||'',IMEI:l.imei||'',
          'Cantidad corte':l.cantidad_corte,'Base usada para comparar':l.esperado_conteo,'Cantidad entregada (según método)':l.cantidad_fisica,
          Diferencia:l.diferencia,'Antes del ajuste':l.anterior,'Después del ajuste':l.posterior,'Costo tienda':l.costo_tienda,'Valor ajuste':l.valor_ajuste,
          Clasificación:c.clasificacion||'',Motivo:c.motivo||'',Soporte:c.soporte||'',Observación:l.nota||'',Archivo:c.archivo_nombre||'',SHA256:c.archivo_sha256||'','ID corte':c.id
        });
      }
      if(!rows.length)throw new Error('No hay cortes para este rango.');
      const libro=XLSX.utils.book_new();hoja(libro,rows,'Conteos y ajustes');if(pendientes.length)hoja(libro,pendientes,'Por aclarar');guardarLibro(libro,`informe-inventarios-${el('desde').value}-${el('hasta').value}.xlsx`);
    }
    el('cerrar').onclick=()=>{if(!busy)el('modal').classList.remove('show');};
    el('crear').onclick=()=>run(()=>crear(false));el('ciego').onclick=()=>run(()=>crear(true));
    el('buscar').onclick=()=>run(historial);el('informe').onclick=()=>run(informe);
    el('tienda').onchange=()=>{detalle=null;el('detalle').innerHTML='';run(historial);};
    ready=rpc('config').then(data=>{config=data;el('tienda').innerHTML=(config.central?'<option value="">Todas las tiendas (solo informe)</option>':'')+config.tiendas.map(t=>`<option value="${esc(t.codigo)}">${esc(t.nombre)}</option>`).join('');});
    // Mantener rechazo observable, sin promesas rechazadas huérfanas.
    ready.catch(e=>{el('mensaje').textContent=e.message;});
    return { async abrir(){el('modal').classList.add('show');await run(async()=>{await ready;const tienda=tiendaActual();if(tienda&&config.tiendas.some(t=>t.codigo===tienda))el('tienda').value=tienda;await historial();});} };
  }
  global.KoraConteosUI=Object.freeze({init});
})(window);
