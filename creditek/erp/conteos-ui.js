(function (global) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const local = value => new Intl.DateTimeFormat('sv-SE', { timeZone:'America/Bogota', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit' }).format(new Date(value));
  const money = n => n == null ? 'Por confirmar' : new Intl.NumberFormat('es-CO',{ style:'currency',currency:'COP',maximumFractionDigits:0 }).format(n);
  const estados = { abierto:'Pendiente de conteo', pendiente:'Pendiente de Mayte / Óscar', aplicado:'Ajuste aplicado',sin_diferencias:'Revisado sin diferencias',rechazado:'Cerrado sin aplicar' };
  const fechaCorte = c => c.revision_fuente?.fecha_confirmada || local(c.corte_at);
  const estadoCorte = c => c.revision_fuente?.solo_comparativo && c.estado==='pendiente' ? 'Comparativo histórico · pendiente de revisión' : estados[c.estado];
  const soporteArchivo = c => c.archivo_nombre?.trim() && /^[a-f0-9]{64}$/i.test(c.archivo_sha256||'')
    ? `Archivo de conteo: ${c.archivo_nombre} · SHA256: ${c.archivo_sha256}` : '';
  function resumirValores(lineas) {
    const total={faltantes:0,sobrantes:0,unidadesFaltantes:0,unidadesSobrantes:0,sinCosto:0,valorSistema:0,valorReportado:0};
    for (const l of lineas) {
      if (l.cantidad_fisica == null) continue;
      const delta=Number(l.diferencia||0), costo=Number(l.costo_tienda);
      if (!Number.isFinite(costo) || costo<=0) {
        if (delta!==0 || Number(l.cantidad_fisica)>0 || Number(l.cantidad_corte)>0) total.sinCosto++;
        continue;
      }
      total.valorSistema+=Number(l.cantidad_corte||0)*costo;
      total.valorReportado+=Number(l.cantidad_fisica||0)*costo;
      const valor=l.valor_ajuste == null ? delta*costo : Number(l.valor_ajuste);
      if (delta<0) { total.faltantes-=valor; total.unidadesFaltantes-=delta; }
      if (delta>0) { total.sobrantes+=valor; total.unidadesSobrantes+=delta; }
    }
    total.impactoNeto=total.sobrantes-total.faltantes;
    return total;
  }
  function init({ sb, XLSX, tiendaActual, refrescar }) {
    let config, detalle, documento, utilidad, puedeCerrar=false, noConformes=[], tareasFotos=[], cortesPendientes=[], busy=false, ready;
    const el = id => document.getElementById(`conteos-${id}`);
    document.body.insertAdjacentHTML('beforeend', `<div id="conteos-modal" class="modal-bg" style="z-index:10000" role="dialog" aria-modal="true" aria-label="Conteos y ajustes de inventario">
      <style>#conteos-evidencia-form[hidden]{display:none}</style>
      <div class="modal-box" style="max-width:1250px;width:100%">
        <div style="display:flex;justify-content:space-between;gap:16px"><h2>Conteos y ajustes</h2><button id="conteos-cerrar" class="btn-export">Cerrar</button></div>
        <p style="margin:12px 0">Un solo archivo para equipos y accesorios. Subirlo no modifica existencias: Mayte u Óscar revisan y autorizan. Reporta cantidades reconstruidas a la fecha del corte: físico + salidas posteriores − entradas posteriores. El sistema compara solamente contra el corte.</p>
        <div class="inventario-form"><label>Tienda<select id="conteos-tienda"></select></label>
        <div class="form-actions"><button id="conteos-crear" class="primary">Preparar corte y descargar</button><button id="conteos-ciego" class="secondary">Preparar conteo ciego</button></div></div>
        <p style="margin:8px 0">Si ya existe un corte abierto hoy para esta tienda, se reutiliza. La persona autorizada temporalmente puede cargarlo con su propio usuario; solo Mayte u Óscar aprueban diferencias.</p>
        <section id="conteos-tareas-fotos" aria-label="Tareas de fotos pendientes" hidden>
          <h3>Fotos pendientes · tarea de la administradora de cada tienda</h3>
          <p>El ajuste ya está aplicado. Estas fotos pendientes no bloquean la operación ni el cierre de utilidad. Adjuntarlas no vuelve a descontar inventario ni gastos.</p>
          <div id="conteos-tareas-lista"></div>
          <form id="conteos-evidencia-form" class="inventario-form" hidden>
            <input id="conteos-evidencia-id" type="hidden">
            <p id="conteos-evidencia-referencia"></p>
            <label>Foto pendiente del producto<input id="conteos-evidencia-foto" type="file" accept="image/jpeg,image/png,image/webp" required></label>
            <button type="submit" class="secondary">Adjuntar foto y completar tarea</button>
            <p id="conteos-evidencia-mensaje" role="alert" tabindex="-1" style="white-space:pre-wrap" hidden></p>
          </form>
        </section>
        <details id="conteos-fotos-panel"><summary>Adjuntar fotos y registrar productos no conformes</summary>
          <p>Adjunta aquí la foto de cada referencia imperfecta. Si pertenece a un conteo, selecciona ese corte: la foto queda vinculada al ajuste y no genera una segunda salida. Las existencias solo cambian cuando Mayte u Óscar autoricen.</p>
          <form id="conteos-no-conforme-form" class="inventario-form">
            <label>Corte de inventario<select id="conteos-nc-corte"><option value="">Antes de iniciar el corte</option></select></label>
            <label>Código del producto<input id="conteos-nc-codigo" required></label>
            <label>IMEI (solo equipos)<input id="conteos-nc-imei"></label>
            <label>Cantidad<input id="conteos-nc-cantidad" type="number" min="1" step="1" required></label>
            <label>Clasificación del gasto<select id="conteos-nc-categoria" required><option value="">Selecciona</option><option value="producto_deteriorado">Producto deteriorado / baja</option><option value="imperfecto">Imperfecto</option><option value="garantia">Garantía</option></select></label>
            <label>Foto del producto<input id="conteos-nc-foto" type="file" accept="image/jpeg,image/png,image/webp" required></label>
            <label>Motivo<input id="conteos-nc-motivo" minlength="5" required></label>
            <label>Referencia del soporte<input id="conteos-nc-soporte" minlength="5" required placeholder="Archivo del conteo o referencia de la foto"></label>
            <button class="secondary" type="submit">Solicitar salida de no conformes</button>
            <p id="conteos-nc-mensaje" role="alert" tabindex="-1" style="white-space:pre-wrap" hidden></p>
          </form><div id="conteos-no-conformes" style="margin:12px 0"></div>
          <div id="conteos-nc-resumen" style="margin:12px 0"></div>
        </details>
        <p id="conteos-mensaje" role="status" style="margin:12px 0;white-space:pre-wrap"></p>
        <details open><summary>Historial por fecha del corte</summary><div class="inventario-form" style="margin-top:12px">
          <label>Desde<input id="conteos-desde" type="date"></label><label>Hasta<input id="conteos-hasta" type="date"></label>
          <label>Responsable (creó, contó o autorizó)<input id="conteos-responsable" placeholder="Nombre"></label>
          <div class="form-actions"><button id="conteos-buscar" class="secondary">Consultar</button><button id="conteos-informe" class="secondary">Descargar informe completo</button><button id="conteos-ultimos" class="secondary" style="display:none">Descargar último corte de todas las tiendas</button></div>
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
    async function rpcNoConformes(accion,datos={}) {
      const {data,error}=await sb.rpc('inventario_no_conformes',{p_accion:accion,p_datos:datos});
      if(error) throw new Error(error.message);
      if(!data) throw new Error('No se confirmó la salida de no conformes.');
      return data;
    }
    async function rpcDocumento(accion,datos) {
      const {data,error}=await sb.rpc('inventario_ajuste_documento',{p_accion:accion,p_datos:datos});
      if(error)throw new Error(error.message);
      if(!data)throw new Error('No se confirmó el documento de ajuste.');
      return data;
    }
    async function cargarNoConformes() {
      noConformes=(await rpcNoConformes('listar')).registros||[];
      tareasFotos=(await rpcNoConformes('tareas_fotos')).tareas||[];
      const tienda=el('tienda').value;
      const items=noConformes.filter(n=>n.tienda_codigo===tienda);
      const tareas=tareasFotos.filter(n=>!tienda||n.tienda_codigo===tienda);
      el('tareas-fotos').hidden=tareas.length===0;
      el('tareas-lista').innerHTML=tareas.map(n=>`<div class="hist-item"><span>${esc(n.tienda_nombre)} · ${esc(n.producto_nombre)} · ${esc(n.codigo)} ${esc(n.imei)} · ${esc(n.cantidad)} unidad(es)<br>
        Ajuste ${esc(n.documento_numero||'aplicado')} · Responsable: administradora de la tienda · Foto pendiente</span>
        <button type="button" data-nc-completar="${esc(n.id)}">Adjuntar foto pendiente</button></div>`).join('');
      el('tareas-lista').querySelectorAll('[data-nc-completar]').forEach(b=>b.onclick=()=>{
        const tarea=tareasFotos.find(n=>n.id===b.dataset.ncCompletar);
        el('evidencia-form').reset();el('evidencia-id').value=tarea.id;
        el('evidencia-referencia').textContent=`${tarea.tienda_nombre} · ${tarea.codigo} ${tarea.imei} · ${tarea.cantidad} unidad(es) · ${tarea.documento_numero||'Ajuste aplicado'}`;
        el('evidencia-mensaje').hidden=true;el('evidencia-form').hidden=false;
        el('evidencia-form').scrollIntoView({block:'nearest'});
      });
      const year=local(new Date()).slice(0,4);
      const yearly=await rpcNoConformes('resumen',{anio:year,tienda:tienda||null});
      const totals=yearly.filas||[];
      el('nc-resumen').innerHTML=`<strong>Gasto de inventario no monetario ${esc(year)}</strong>: `+
        (totals.length?totals.map(r=>`${esc(config.tiendas.find(t=>t.codigo===r.tienda_codigo)?.nombre||'Tienda sin nombre')} (${esc(r.tienda_codigo)}) · ${esc(r.categoria_gasto)}: ${esc(money(r.gasto_no_monetario))} (${esc(r.unidades)} unidades)`).join(' · '):'Sin bajas autorizadas.');
      el('no-conformes').innerHTML=items.length?items.map(n=>`<div class="hist-item">
        <span>${esc(n.producto_nombre)} · ${esc(n.codigo)} ${esc(n.imei)} · ${esc(n.cantidad)} unidad(es)<br>
        ${esc(n.estado==='solicitado'?(n.corte_id?'Pendiente: Mayte u Óscar autorizan al aplicar el corte':'Pendiente de Mayte / Óscar'):n.estado==='separado_pendiente_destino'?'Fuera del inventario vendible · destino pendiente':'Rechazado')}
        · ${esc(n.categoria_gasto)} · ${esc(n.motivo)} · ${esc(n.soporte)} · ${esc(n.costo_tienda==null?'Sin baja aprobada':money(n.cantidad*n.costo_tienda))}</span>
        <span>${n.foto_path?`<button type="button" data-nc-foto="${esc(n.id)}">Ver foto</button>`:'<strong>Foto pendiente · tarea de la tienda</strong>'}
        ${config.autoriza&&n.estado==='solicitado'&&!n.corte_id?`<button type="button" data-nc-aprobar="${esc(n.id)}">Autorizar salida</button>`:''}
        ${config.autoriza&&n.estado==='solicitado'?`<button type="button" data-nc-rechazar="${esc(n.id)}">Rechazar</button>`:''}</span></div>`).join(''):'No hay salidas de no conformes registradas para esta tienda.';
      el('no-conformes').querySelectorAll('[data-nc-foto]').forEach(b=>b.onclick=()=>{
        const preview=global.open('','_blank');
        run(async()=>{
        const item=noConformes.find(n=>n.id===b.dataset.ncFoto);
        const {data,error}=await sb.storage.from('inventario-no-conformes').createSignedUrl(item.foto_path,60);
        if(error||!data?.signedUrl){preview?.close();throw new Error(error?.message||'No se pudo abrir la foto privada.');}
        if(preview){preview.opener=null;preview.location.replace(data.signedUrl);}
        else throw new Error('Permite las ventanas emergentes para ver la foto.');
        });
      });
      el('no-conformes').querySelectorAll('[data-nc-aprobar]').forEach(b=>b.onclick=()=>run(async()=>{
        if(!global.confirm('¿Autorizar la salida de este producto del inventario vendible? Se conservará su costo y destino pendiente.'))return;
        await rpcNoConformes('autorizar',{id:b.dataset.ncAprobar});await cargarNoConformes();await refrescar();
      }));
      el('no-conformes').querySelectorAll('[data-nc-rechazar]').forEach(b=>b.onclick=()=>run(async()=>{
        const motivo=global.prompt('Motivo del rechazo (mínimo 5 caracteres)');
        if(motivo===null)return;
        await rpcNoConformes('rechazar',{id:b.dataset.ncRechazar,motivo});await cargarNoConformes();
      }));
    }
    async function run(task, feedbackId) {
      if(busy) return;
      const feedback=feedbackId&&el(feedbackId);
      if(feedback){feedback.hidden=false;feedback.textContent='Procesando…';}
      busy=true;el('mensaje').textContent='Procesando…';
      el('modal').setAttribute('aria-busy','true');
      el('modal').querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=true;});
      try {
        const result=await task();
        el('mensaje').textContent=result===false?'Cancelado: no se aplicó ninguna decisión.':'Listo.';
        if(feedback?.isConnected){feedback.textContent=el('mensaje').textContent;}
      }
      catch(e) {
        el('mensaje').textContent=e.message;
        if(feedback?.isConnected){feedback.textContent=e.message;feedback.scrollIntoView({block:'nearest'});feedback.focus();}
      }
      finally { busy=false;el('modal').removeAttribute('aria-busy');el('modal').querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=control.dataset.disabled==='true';}); }
    }
    function guardarLibro(libro,nombre) { XLSX.writeFile(libro,nombre); }
    function hoja(libro,filas,nombre) {
      const sheet=XLSX.utils.json_to_sheet(filas);
      sheet['!cols']=Object.keys(filas[0]||{}).map(k=>({wch:/Referencia|Observación|Motivo|Soporte/.test(k)?40:23}));
      sheet['!autofilter']={ref:sheet['!ref']||'A1:A1'};
      XLSX.utils.book_append_sheet(libro,sheet,nombre);
    }
    const resultadoFilas=u=>[
      ['Ventas',u.ventas_totales],['Costo vendido',-Number(u.costo_vendido)],
      ['Gastos de la tienda',-Number(u.gastos_totales)],['Faltantes y bajas de inventario',-Number(u.perdidas_ajustes)],
      ['Sobrantes de inventario',u.ganancias_ajustes],['Ajustes financieros',u.ajuste_conciliacion],
      ['Utilidad neta del corte',u.utilidad_neta]
    ];
    function documentoHTML() {
      const d=documento,t=d.totales;
      return `<h2>Documento de ajuste ${esc(d.numero)}</h2><p>${esc(d.tienda_nombre)} · ${esc(d.tienda_codigo)}<br>
        Corte: ${esc(local(d.corte_at))}<br>Aplicado por ${esc(d.autorizado_nombre)} · ${esc(local(d.autorizado_at))}<br>
        Motivo: ${esc(d.motivo)}<br>Soporte: ${esc(d.soporte)}</p>
        <p>${esc(t.referencias)} referencias · Faltantes: ${esc(t.unidades_faltantes)} unidades (${esc(money(t.faltantes))}) · Sobrantes: ${esc(t.unidades_sobrantes)} unidades (${esc(money(t.sobrantes))})<br>
        Impacto neto del ajuste: <strong>${esc(money(t.impacto_neto))}</strong>. No mueve caja, banco ni cartera.</p>
        <div style="overflow:auto"><table><thead><tr><th>Referencia / IMEI</th><th>Diferencia</th><th>Antes</th><th>Después</th><th>Costo tienda</th><th>Valor ajuste</th><th>Clasificación / movimiento</th></tr></thead><tbody>
        ${d.lineas.map(l=>`<tr><td>${esc(l.nombre)}<br>${esc(l.codigo)} ${esc(l.imei)}</td><td>${Number(l.diferencia)>0?'+':''}${esc(l.diferencia)}</td><td>${esc(l.anterior)}</td><td>${esc(l.posterior)}</td><td>${esc(money(l.costo_tienda))}</td><td>${esc(money(l.valor_ajuste))}</td><td>${esc(l.clasificacion)}<br>${esc((l.movimientos||[]).join(', '))}</td></tr>`).join('')||'<tr><td colspan="7">Corte revisado sin diferencias; no creó movimientos.</td></tr>'}</tbody></table></div>
        ${utilidad?`<h3>Resultado económico · ${utilidad.cerrado?'Cerrado':'Provisional, no cerrado'}</h3><p>${esc(local(utilidad.inicio_at))} a ${esc(local(utilidad.fin_at))}</p>
          ${resultadoFilas(utilidad).map(([k,v])=>`<p>${esc(k)}: ${esc(money(v))}</p>`).join('')}
          <p>${utilidad.cerrado?`Cierre ${esc(utilidad.cierre_id)} · ${esc(local(utilidad.cerrado_at))}`:esc((utilidad.bloqueos||[]).join(' '))}</p>`:''}`;
    }
    function descargarDocumento() {
      if(!documento)throw new Error('Este corte no tiene documento de ajuste registrado.');
      const d=documento,t=d.totales,libro=XLSX.utils.book_new();
      hoja(libro,[{Documento:d.numero,Tienda:d.tienda_nombre,'Código tienda':d.tienda_codigo,
        Corte:local(d.corte_at),Autorizó:d.autorizado_nombre,'Fecha autorización':local(d.autorizado_at),
        Motivo:d.motivo,Soporte:d.soporte,'Referencias ajustadas':t.referencias,
        'Unidades faltantes':t.unidades_faltantes,'Unidades sobrantes':t.unidades_sobrantes,
        'Valor faltantes':t.faltantes,'Valor sobrantes':t.sobrantes,'Impacto neto':t.impacto_neto,
        'ID corte':d.corte_id,'ID documento':d.documento_id,'Archivo contado':d.archivo_nombre,SHA256:d.archivo_sha256}],'Documento');
      hoja(libro,d.lineas.length?d.lineas.map(l=>({Código:l.codigo,Referencia:l.nombre,IMEI:l.imei,
        'Sistema al corte':l.cantidad_corte,'Reportado al corte':l.cantidad_fisica,Diferencia:l.diferencia,
        'Antes del ajuste':l.anterior,'Después del ajuste':l.posterior,'Costo tienda':l.costo_tienda,
        'Valor ajuste':l.valor_ajuste,Clasificación:l.clasificacion,Observación:l.nota,
        Movimientos:(l.movimientos||[]).join(', ')})):[{Observación:'Sin diferencias, no creó movimientos.'}],'Movimientos');
      if(utilidad)hoja(libro,resultadoFilas(utilidad).map(([Concepto,Valor])=>({Concepto,Valor,
        Estado:utilidad.cerrado?'Cerrada':'Provisional, no cerrada',Inicio:local(utilidad.inicio_at),
        Fin:local(utilidad.fin_at),'ID cierre':utilidad.cierre_id||'',Bloqueos:(utilidad.bloqueos||[]).join(' ')})),'Utilidad neta');
      guardarLibro(libro,`${d.numero}.xlsx`);
    }
    function imprimirDocumento() {
      const frame=document.createElement('iframe');frame.style.display='none';frame.title='Documento de ajuste';
      frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};
      frame.srcdoc=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(documento.numero)}</title><style>body{font:12px Arial;color:#10213e}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;text-align:left}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}</style></head><body>${documentoHTML()}</body></html>`;
      document.body.appendChild(frame);
      frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
    }
    async function cargarCierre() {
      const corte=detalle.corte;
      if(!config.central||!corte.contado_at||corte.base_conteo!=='corte_fijo'||corte.revision_fuente?.solo_comparativo||corte.estado==='rechazado')return;
      el('cierre').innerHTML='<p role="status">Consultando documento y utilidad neta…</p>';
      try {
        const data=await rpcDocumento('ver',{id:corte.id});
        documento=data.documento;puedeCerrar=data.puede_cerrar_utilidad;
        const {data:u,error}=await sb.rpc('cierre_utilidad_retail',{p_accion:'vista',p_corte_id:corte.id});
        if(error)throw new Error(error.message);
        if(!u)throw new Error('No se obtuvo el cálculo de utilidad.');
        utilidad=u;
        el('cierre').innerHTML=`<section aria-label="Cierre de inventario y utilidad" style="padding:14px;border:1px solid #cbd5e1;border-radius:12px;margin:16px 0">
          ${documento?`<details><summary>Documento de ajuste ${esc(documento.numero)} · ${esc(documento.totales.referencias)} referencias</summary>${documentoHTML()}</details>
            <div class="form-actions" style="margin:12px 0"><button id="conteos-documento-excel" type="button" class="secondary">Descargar documento de ajuste</button><button id="conteos-documento-imprimir" type="button" class="secondary">Imprimir / PDF</button></div>`:
            `<p>${corte.estado==='pendiente'?'Al aplicar el ajuste se generará aquí el documento numerado de esta tienda.':'Este corte se aplicó antes de los documentos numerados; no se vuelve a ajustar.'}</p>`}
          <h3>Utilidad neta del corte · ${u.cerrado?'Cerrada':corte.estado==='pendiente'?'Provisional':'Pendiente de cierre'}</h3>
          <p>${esc(local(u.inicio_at))} a ${esc(local(u.fin_at))} · ${esc(u.ventas_count??'—')} ventas</p>
          <dl>${resultadoFilas(u).map(([k,v])=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:6px 0"><dt>${esc(k)}</dt><dd style="margin:0;white-space:nowrap">${esc(money(v))}</dd></div>`).join('')}</dl>
          <p>Inventario físico y deuda B2B se muestran aparte: no se restan otra vez de la utilidad. Este cierre no crea pagos ni mueve efectivo.</p>
          ${(u.bloqueos||[]).length?`<p role="alert">Pendiente para cerrar: ${esc(u.bloqueos.join(' '))}</p>`:''}
          ${u.cerrado?`<p>Cierre ${esc(u.cierre_id)} · ${esc(local(u.cerrado_at))}. Resultado guardado, no se vuelve a cerrar.</p>`:
            puedeCerrar?`<button id="conteos-utilidad-cerrar" type="button" class="primary" data-disabled="${!u.listo}" ${!u.listo?'disabled':''}>Cerrar utilidad del corte</button>`:'<p>Solo Gerencia puede cerrar la utilidad; Mayte puede revisar el resultado.</p>'}
        </section>`;
        if(documento){el('documento-excel').onclick=()=>run(async()=>descargarDocumento());el('documento-imprimir').onclick=imprimirDocumento;}
        if(el('utilidad-cerrar'))el('utilidad-cerrar').onclick=()=>run(async()=>{
          if(!utilidad.listo||!puedeCerrar)throw new Error('Resuelve los pendientes antes de cerrar la utilidad.');
          if(!global.confirm(`¿Cerrar la utilidad neta de ${corte.tienda_nombre} por ${money(utilidad.utilidad_neta)}? El resultado quedará guardado; no mueve caja, banco ni cartera.`))return;
          const {data:closed,error:e}=await sb.rpc('cierre_utilidad_retail',{p_accion:'cerrar',p_corte_id:corte.id,p_huella:utilidad.huella});
          if(e){await cargarCierre();throw new Error(e.message);}
          if(!closed?.cerrado)throw new Error('El servidor no confirmó el cierre.');
          await cargarCierre();document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));
        });
      } catch(e) {
        el('cierre').innerHTML=`${documento?`<details><summary>Documento de ajuste ${esc(documento.numero)}</summary>${documentoHTML()}</details><button id="conteos-documento-excel" class="secondary">Descargar documento de ajuste</button><button id="conteos-documento-imprimir" class="secondary">Imprimir / PDF</button>`:''}<p role="alert">No se pudo consultar el cierre: ${esc(e.message)}. Consultar no aplica nuevos ajustes.</p><button id="conteos-cierre-reintentar" class="secondary">Actualizar utilidad y documento</button>`;
        if(documento){el('documento-excel').onclick=()=>run(async()=>descargarDocumento());el('documento-imprimir').onclick=imprimirDocumento;}
        el('cierre-reintentar').onclick=()=>run(cargarCierre);
      }
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
      const hoy=local(new Date()).slice(0,10);
      const abiertos=(await rpc('informe',{desde:hoy,hasta:hoy,tienda:el('tienda').value,responsable:''})).cortes
        .filter(c=>c.estado==='abierto');
      if(abiertos.length) {
        detalle=await rpc('ver',{id:abiertos.at(-1).id});
        await renderDetalle();descargar(ciego);await historial();
        return;
      }
      detalle=await rpc('crear',{tienda:el('tienda').value});await renderDetalle();descargar(ciego);await historial();
    }
    async function guardarFoto(tienda,foto) {
      if(!foto||!['image/jpeg','image/png','image/webp'].includes(foto.type)||foto.size>10*1024*1024)
        throw new Error('Adjunta una foto JPG, PNG o WebP de máximo 10 MB.');
      const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[foto.type];
      const foto_path=`${tienda}/${crypto.randomUUID()}.${extension}`;
      const {error}=await sb.storage.from('inventario-no-conformes').upload(foto_path,foto,{contentType:foto.type,upsert:false});
      if(error)throw new Error(`No se guardó la foto: ${error.message}`);
      return foto_path;
    }
    async function completarEvidencia() {
      const tarea=tareasFotos.find(n=>n.id===el('evidencia-id').value);
      if(!tarea)throw new Error('Selecciona una tarea de foto pendiente.');
      const foto_path=await guardarFoto(tarea.tienda_codigo,el('evidencia-foto').files[0]);
      await rpcNoConformes('completar_foto',{id:tarea.id,foto_path});
      el('evidencia-form').reset();el('evidencia-form').hidden=true;
      document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));
      await cargarNoConformes();
    }
    async function solicitarNoConforme() {
      const tienda=el('tienda').value;
      if(!tienda)throw new Error('Selecciona la tienda antes de solicitar la salida.');
      const foto_path=await guardarFoto(tienda,el('nc-foto').files[0]);
      await rpcNoConformes('solicitar',{tienda,corte_id:el('nc-corte').value||null,foto_path,
        categoria_gasto:el('nc-categoria').value,codigo:el('nc-codigo').value.trim(),
        imei:el('nc-imei').value.trim(),cantidad:Number(el('nc-cantidad').value),
        motivo:el('nc-motivo').value.trim(),soporte:el('nc-soporte').value.trim()});
      el('no-conforme-form').reset();await cargarNoConformes();
    }
    async function obtenerHistorial(filtros) {
      const datos={...(filtros||{desde:el('desde').value,hasta:el('hasta').value,tienda:el('tienda').value,responsable:el('responsable').value.trim()})};
      const all=[];let page;
      do {
        page=(await rpc('informe',datos)).cortes;all.push(...page);
        const last=page.at(-1);if(last){datos.despues_fecha=last.corte_at;datos.despues_id=last.id;}
      } while(page.length===200);
      return all;
    }
    async function historial() {
      const cortes=await obtenerHistorial();
      cortesPendientes=cortes.filter(c=>c.tienda_codigo===el('tienda').value&&c.estado==='pendiente');
      el('nc-corte').innerHTML='<option value="">Antes de iniciar el corte</option>'+cortesPendientes.map(c=>`<option value="${esc(c.id)}">${esc(fechaCorte(c))} · ${esc(estadoCorte(c))}</option>`).join('');
      if(cortesPendientes.length)el('nc-corte').value=cortesPendientes[0].id;
      cortes.sort((a,b)=>Number(b.estado==='pendiente')-Number(a.estado==='pendiente') || new Date(b.corte_at)-new Date(a.corte_at));
      el('historial').innerHTML=cortes.length?cortes.map(c=>`<div class="hist-item"><span>${esc(c.tienda_nombre)} · ${esc(fechaCorte(c))}<br>${esc(estadoCorte(c))} · ${esc(c.contado_nombre||c.creado_nombre)}</span><button class="btn-export" data-conteo-id="${esc(c.id)}">Ver</button></div>`).join(''):'No hay cortes con estos filtros. Incluye hoy en «Hasta» y deja Responsable vacío si el corte lo creó otra persona.';
      el('historial').querySelectorAll('[data-conteo-id]').forEach(b=>b.onclick=()=>run(async()=>{detalle=await rpc('ver',{id:b.dataset.conteoId});await renderDetalle();}));
    }
    async function renderDetalle() {
      documento=null;utilidad=null;puedeCerrar=false;
      const { corte,lineas }=detalle;
      const pendiente=corte.estado==='pendiente', corteFijo=corte.base_conteo==='corte_fijo';
      const historico=!!corte.revision_fuente?.solo_comparativo;
      const archivoSoporte=soporteArchivo(corte);
      const diferencias=lineas.filter(l=>l.diferencia!==null&&l.diferencia!==0);
      const valores=resumirValores(lineas);
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
        ${corte.contado_at&&!historico?`<section role="group" aria-label="Valoración de diferencias del conteo" style="padding:14px;margin:12px 0;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc">
          <h3>Valoración al costo de tienda · ${diferencias.length} diferencia(s)</h3>
          <p>Sistema al corte: <strong>${money(valores.valorSistema)}</strong> · Reportado al corte: <strong>${money(valores.valorReportado)}</strong></p>
          <p>Faltantes: ${valores.unidadesFaltantes} unidades · <strong>${money(valores.faltantes)}</strong> &nbsp; Sobrantes: ${valores.unidadesSobrantes} unidades · <strong>${money(valores.sobrantes)}</strong></p>
          <p>Impacto neto ${pendiente?'provisional':'registrado'} en la utilidad del corte: <strong>${valores.impactoNeto<0?'-':''}${money(Math.abs(valores.impactoNeto))}</strong>. Abajo puedes revisar la utilidad neta y cerrar este mismo corte, después de aplicar el ajuste.</p>
          ${valores.sinCosto?`<p role="alert">${valores.sinCosto} fila(s) sin costo válido; los totales están incompletos y no se debe aprobar todavía.</p>`:''}
          <p>La aprobación aplica las diferencias a existencias una sola vez y registra quién autorizó. El corte original conserva las diferencias como evidencia; no se borran del historial.</p>
        </section>`:''}
        <label><input type="checkbox" id="conteos-solo-dif" ${pendiente?'checked':''}> Mostrar solo diferencias</label>
        <div class="tabla-wrap" style="overflow:auto;max-height:450px;margin:12px 0"><table><thead><tr><th>Referencia / IMEI</th><th>Sistema al corte</th><th>Reportado al corte</th><th>Diferencia</th><th>Actual</th><th>Propuesto hoy / aplicado</th><th>Costo tienda</th><th>Valor diferencia</th><th>Observación</th><th>Decisión</th></tr></thead><tbody id="conteos-lineas"></tbody></table></div>
        ${config.autoriza&&!historico&&(pendiente||corte.estado==='abierto')?`<form id="conteos-form-decidir" class="inventario-form" novalidate>
          <label>Motivo de la revisión<textarea id="conteos-motivo" minlength="5" required></textarea></label>
          ${archivoSoporte?`<p id="conteos-archivo-soporte" style="overflow-wrap:anywhere"><strong>Soporte del conteo ya registrado:</strong> ${esc(corte.archivo_nombre)}.<br>Este Excel se usará automáticamente como soporte, con su identificador SHA256. No necesitas otra acta ni adjuntarlo de nuevo.</p>`:''}
          <label>${archivoSoporte?'Referencia adicional (opcional)':'Referencia del soporte (obligatoria si no hay Excel registrado)'}<input id="conteos-soporte" placeholder="${archivoSoporte?'Aclaración o referencia adicional, si existe':'Nombre del archivo o referencia documental'}"></label>
          <p>Las fotos de productos «No conforme» pueden adjuntarse después: no bloquean este ajuste ni el cierre de utilidad. Cada foto faltante quedará como tarea de la administradora de la tienda, visible en Inventario y en la campana.</p>
          ${pendiente&&corteFijo?'<button type="button" id="conteos-adjuntar-fotos" class="secondary">Adjuntar fotos de no conformes</button>':''}
          <label>Clasificación general<select id="conteos-clasificacion"><option value="">Selecciona</option><option value="correccion_registro">Corrección de registro / sin diferencias</option><option value="faltante">Faltante identificado</option><option value="no_conforme">No conformes</option><option value="sobrante_por_aclarar">Sobrante por aclarar</option><option value="mixto">Diferencias mixtas</option></select></label>
          ${pendiente&&!corteFijo?'<p>Este conteo usa el método anterior. Ciérralo sin aplicar y registra un nuevo conteo referido al corte.</p>':''}<p>Un sobrante no genera utilidad B2B ni una ganancia ocasional automática. Este registro valora el ajuste de inventario; no crea pagos ni cartera.</p>
          <div class="form-actions">${pendiente&&corteFijo?'<button type="submit" class="primary">Aplicar ajuste de inventario</button>':''}<button type="button" id="conteos-rechazar" class="secondary">Cerrar sin aplicar</button></div>
          <p id="conteos-decision-mensaje" role="alert" tabindex="-1" style="white-space:pre-wrap" hidden></p></form>`:''}<div id="conteos-cierre"></div>`;
      function pintarLineas() {
        const filas=el('solo-dif').checked?lineas.filter(l=>l.diferencia!==null&&l.diferencia!==0):lineas;
        const anteriores=new Map(Array.from(el('lineas').querySelectorAll('[data-decision-codigo]'),i=>[`${i.dataset.decisionCodigo}\u0000${i.dataset.decisionImei}`,i.value]));
        el('lineas').innerHTML=filas.map(l=>`<tr><td>${esc(l.nombre)}<br>${esc(l.codigo)} ${esc(l.imei)}</td><td>${l.cantidad_corte}</td><td>${l.cantidad_fisica??'—'}</td><td>${l.diferencia??'—'}</td><td>${l.actual}</td><td>${historico?'Por validar':l.posterior??(l.diferencia===null?'—':l.actual+l.diferencia)}</td><td>${config.autoriza&&!historico&&pendiente&&l.diferencia!==0&&!(Number(l.costo_tienda)>0)?`<input type="number" min="0.01" step="0.01" style="width:130px" data-costo-codigo="${esc(l.codigo)}" data-costo-imei="${esc(l.imei)}" aria-label="Costo de tienda para ${esc(l.codigo)}">`:esc(money(l.costo_tienda))}</td><td>${l.diferencia==null||!(Number(l.costo_tienda)>0)?'—':esc(money(l.valor_ajuste==null?Number(l.diferencia)*Number(l.costo_tienda):Number(l.valor_ajuste)))}</td><td>${esc(l.nota)}</td><td>${config.autoriza&&!historico&&pendiente&&l.diferencia!==0?`<select data-decision-codigo="${esc(l.codigo)}" data-decision-imei="${esc(l.imei)}" aria-label="Decisión para ${esc(l.codigo)}"><option value="">Clasificar</option>${l.diferencia<0?'<option value="no_conforme">No conforme · salida</option><option value="faltante">Faltante</option><option value="obsequio">Obsequio</option>':'<option value="sobrante">Sobrante</option>'}<option value="correccion_registro">Corrección de registro</option></select>`:'—'}</td></tr>`).join('')||'<tr><td colspan="10">Sin diferencias registradas.</td></tr>';
        el('lineas').querySelectorAll('[data-decision-codigo]').forEach(i=>{i.value=anteriores.get(`${i.dataset.decisionCodigo}\u0000${i.dataset.decisionImei}`)||'';});
      }
      pintarLineas();el('solo-dif').onchange=pintarLineas;
      el('redescargar').onclick=()=>descargar();
      el('form-subir')?.addEventListener('submit',event=>{event.preventDefault();run(subir);});
      el('form-decidir')?.addEventListener('submit',event=>{event.preventDefault();run(()=>decidir('aplicar'),'decision-mensaje');});
      if(el('rechazar')) el('rechazar').onclick=()=>run(()=>decidir('rechazar'),'decision-mensaje');
      if(el('adjuntar-fotos'))el('adjuntar-fotos').onclick=()=>{
        el('tienda').value=corte.tienda_codigo;
        if(!Array.from(el('nc-corte').options).some(o=>o.value===corte.id))el('nc-corte').add(new Option(`${corte.tienda_nombre} · ${fechaCorte(corte)}`,corte.id));
        el('nc-corte').value=corte.id;
        el('nc-soporte').value=archivoSoporte;
        el('fotos-panel').open=true;
        el('no-conforme-form').scrollIntoView({block:'start'});el('nc-codigo').focus();
      };
      await cargarCierre();
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
      document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));
      await renderDetalle();await historial();
    }
    async function decidir(accion) {
      const motivo=el('motivo').value.trim(),referencia=el('soporte').value.trim(),clasificacion=el('clasificacion').value;
      const soporte=[soporteArchivo(detalle.corte),referencia].filter(Boolean).join(' · Referencia adicional: ');
      if(motivo.length<5)throw new Error('Explica el motivo de la revisión.');
      if(accion==='aplicar'&&!clasificacion)throw new Error('Selecciona la clasificación general antes de aplicar.');
      if(accion==='aplicar'&&soporte.length<5)throw new Error('Este corte no tiene un Excel registrado con identificador. Completa la referencia del soporte antes de aplicar.');
      const costos=Array.from(el('lineas').querySelectorAll('[data-costo-codigo]'),i=>({codigo:i.dataset.costoCodigo,imei:i.dataset.costoImei,costo_tienda:Number(i.value)}));
      const decisiones=Array.from(el('lineas').querySelectorAll('[data-decision-codigo]'),i=>({codigo:i.dataset.decisionCodigo,imei:i.dataset.decisionImei,clasificacion:i.value}));
      if(accion==='aplicar'&&decisiones.some(d=>!d.clasificacion))throw new Error('Clasifica cada diferencia. Los imperfectos no son faltantes.');
      const noConformes=decisiones.filter(d=>d.clasificacion==='no_conforme');
      const valorizadas=detalle.lineas.map(l=>{
        const confirmado=costos.find(c=>c.codigo===l.codigo&&c.imei===l.imei);
        return confirmado&&confirmado.costo_tienda>0?{...l,costo_tienda:confirmado.costo_tienda}:l;
      });
      const valoracion=resumirValores(valorizadas);
      if(accion==='aplicar'&&valorizadas.some(l=>l.diferencia!==0&&!(Number(l.costo_tienda)>0)))
        throw new Error('Confirma el costo de todas las diferencias antes de autorizar.');
      const impacto=valoracion.impactoNeto;
      if(!global.confirm(accion==='aplicar'?`¿Autorizar el conteo de ${detalle.corte.tienda_nombre} y aplicar sus diferencias al inventario actual? Impacto neto estimado al costo: ${impacto<0?'-':''}${money(Math.abs(impacto))}. ${noConformes.length} referencia(s) no conforme(s) quedarán fuera del inventario vendible, con gasto de tienda no monetario y destino pendiente. Las fotos faltantes quedan como tarea de la administradora y no bloquean el ajuste ni el cierre. No se puede descontar dos veces.`:'¿Cerrar este corte sin modificar existencias?'))return false;
      const datos={id:detalle.corte.id,base_conteo:'corte_fijo',motivo,soporte,clasificacion,costos,decisiones};
      detalle=accion==='aplicar'?await rpcDocumento('aplicar',datos):await rpc(accion,datos);
      document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));
      await renderDetalle();await historial();if(accion==='aplicar'){await cargarNoConformes();await refrescar();}
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
    async function informeUltimos() {
      if(!config.central)throw new Error('Solo Gestión o Gerencia pueden descargar el último corte de todas las tiendas.');
      // El informe general no depende de los filtros visibles ni de su rango de fechas.
      const hoy=local(new Date()).slice(0,10);
      const cortes=await obtenerHistorial({desde:'2000-01-01',hasta:hoy,tienda:'',responsable:''});
      const ultimos=new Map();
      for(const c of cortes) {
        if(!config.tiendas.some(t=>t.codigo===c.tienda_codigo))continue;
        const anterior=ultimos.get(c.tienda_codigo);
        if(!anterior || new Date(c.corte_at)>new Date(anterior.corte_at) ||
          (c.corte_at===anterior.corte_at&&c.id>anterior.id))ultimos.set(c.tienda_codigo,c);
      }
      const resumen=[],resultadoCortes=[],control=[],detalleFilas=[],diferencias=[],pendientes=[];
      async function saldoB2BAlCorte(tiendaCodigo,corteAt) {
        let saldo=0,desde=0,filas;
        do {
          const {data,error}=await sb.from('cuenta_corriente')
            .select('id,tipo,monto,created_at').eq('tienda_codigo',tiendaCodigo)
            .lt('created_at',corteAt).order('id').range(desde,desde+999);
          if(error)throw new Error(`No se pudo calcular la deuda B2B al corte de ${tiendaCodigo}: ${error.message}`);
          filas=data||[];
          for(const movimiento of filas) {
            const monto=Number(movimiento.monto);
            if(!['cargo','abono'].includes(movimiento.tipo)||!Number.isFinite(monto)||monto<0)
              throw new Error(`La cuenta corriente de ${tiendaCodigo} tiene un movimiento inválido (${movimiento.id}).`);
            saldo+=(movimiento.tipo==='cargo'?monto:-monto);
          }
          desde+=filas.length;
        } while(filas.length===1000);
        return saldo;
      }
      for(const tienda of config.tiendas) {
        const c=ultimos.get(tienda.codigo);
        if(!c) {
          resumen.push({Tienda:tienda.nombre,'Código tienda':tienda.codigo,'Estado del corte':'Sin corte'});
          continue;
        }
        const data=await rpc('ver',{id:c.id});
        const lineas=data.lineas||[],contado=!!c.contado_at,valores=resumirValores(lineas);
        const diferenciasCorte=lineas.filter(l=>l.diferencia!=null&&Number(l.diferencia)!==0);
        const valorCompleto=contado&&valores.sinCosto===0;
        const pasivoSaldo=await saldoB2BAlCorte(tienda.codigo,c.corte_at);
        const {data:liquidacion,error:liquidacionError}=await sb.rpc('cierre_utilidad_retail',{p_accion:'vista',p_corte_id:c.id});
        const camposResultado=['ventas_totales','costo_vendido','gastos_totales','perdidas_ajustes',
          'ganancias_ajustes','ajuste_conciliacion','utilidad_neta'];
        const cifrasCompletas=liquidacion&&camposResultado.every(campo=>
          liquidacion[campo]!=null&&Number.isFinite(Number(liquidacion[campo])));
        const utilidadDisponible=!liquidacionError&&liquidacion&&c.base_conteo!=='observacion_fisica'&&
          !c.revision_fuente?.solo_comparativo&&c.estado!=='rechazado'&&valorCompleto&&cifrasCompletas;
        const utilidad=utilidadDisponible?Number(liquidacion.utilidad_neta):null;
        const resultado=utilidad===null?'':utilidad<0?'Pérdida':utilidad>0?'Utilidad':'Equilibrio';
        const estadoLiquidacion=liquidacionError||!liquidacion?`No disponible: ${liquidacionError?.message||'sin respuesta del cálculo'}`:
          !contado?'Falta subir el conteo':!valorCompleto?'Faltan costos de inventario':
          !cifrasCompletas?'Faltan datos del resultado económico':
          liquidacion.cerrado?'Cerrada':liquidacion.listo?'Calculada, pendiente de cierre':
          `Pendiente: ${(liquidacion.bloqueos||[]).join(' ')}`;
        const estadoCorto=utilidadDisponible?(liquidacion.cerrado?'Confirmada':
          c.estado==='pendiente'?`Provisional · pendiente de autorizar ${diferenciasCorte.length} diferencias`:
          liquidacion.listo?'Calculada, pendiente de cierre':estadoLiquidacion):
          liquidacionError||!liquidacion?'No disponible':'Pendiente de validación';
        resumen.push({Tienda:tienda.nombre,'Código tienda':tienda.codigo,'Fecha del corte':fechaCorte(c),
          'Estado del corte':estadoCorte(c),'Inventario físico al costo':valorCompleto?valores.valorReportado:'',
          'Deuda con B2B al corte':Math.max(pasivoSaldo,0),'Saldo a favor en B2B al corte':Math.max(-pasivoSaldo,0),
          'Ajuste físico neto al costo':valorCompleto?valores.impactoNeto:'',
          'Utilidad o pérdida del corte':utilidad===null?'':utilidad,
          Resultado:resultado,'Estado de utilidad':estadoCorto,'Observaciones de utilidad':estadoLiquidacion});
        resultadoCortes.push({Tienda:tienda.nombre,'Código tienda':tienda.codigo,
          'Inicio del tramo':liquidacion?.inicio_at?local(liquidacion.inicio_at):'',
          'Fin del tramo':fechaCorte(c),
          'Ventas del tramo':utilidadDisponible?Number(liquidacion.ventas_totales):'',
          'Costo vendido':utilidadDisponible?Number(liquidacion.costo_vendido):'',
          'Gastos aprobados':utilidadDisponible?Number(liquidacion.gastos_totales):'',
          'Pérdidas de inventario':utilidadDisponible?Number(liquidacion.perdidas_ajustes):'',
          'Sobrantes de inventario':utilidadDisponible?Number(liquidacion.ganancias_ajustes):'',
          'Ajuste financiero':utilidadDisponible?Number(liquidacion.ajuste_conciliacion):'',
          'Utilidad o pérdida del corte':utilidad===null?'':utilidad,
          Resultado:resultado,'Estado de utilidad':estadoLiquidacion,'ID corte':c.id});
        control.push({Tienda:tienda.nombre,'Código tienda':tienda.codigo,Estado:estadoCorte(c),
          'Fecha del corte':fechaCorte(c),'Fecha de carga':c.recibido_at?local(c.recibido_at):'',
          'Referencias/IMEI':lineas.length,'Referencias con diferencia':contado?diferenciasCorte.length:'',
          'Unidades faltantes':contado?valores.unidadesFaltantes:'','Valor faltantes':valorCompleto?valores.faltantes:'',
          'Unidades sobrantes':contado?valores.unidadesSobrantes:'','Valor sobrantes':valorCompleto?valores.sobrantes:'',
          'Impacto neto al costo':valorCompleto?valores.impactoNeto:'',
          'Inventario sistema al corte':valorCompleto?valores.valorSistema:'',
          'Inventario reportado al corte':valorCompleto?valores.valorReportado:'',
          'Referencias sin costo':contado?valores.sinCosto:'',
          'Creó':c.creado_nombre||'','Contó':c.contado_nombre||'','Autorizó':c.autorizado_nombre||'',
          'Fecha de autorización':c.autorizado_at?local(c.autorizado_at):'',
          'Clasificación general':c.clasificacion||'',Motivo:c.motivo||'',Soporte:c.soporte||'',
          Archivo:c.archivo_nombre||'','ID corte':c.id});
        pendientes.push(...pendientesFuente(c));
        for(const l of lineas) {
          const fila={Tienda:tienda.nombre,'Código tienda':tienda.codigo,'Fecha del corte':fechaCorte(c),
            Estado:estadoCorte(c),Referencia:l.nombre,Código:l.codigo,IMEI:l.imei||'',
            'Sistema al corte':l.cantidad_corte,'Reportado al corte':l.cantidad_fisica??'',
            Diferencia:l.diferencia??'','Actual al consultar':l.actual??'',
            'Posterior al ajuste':l.posterior??'','Costo tienda':l.costo_tienda??'',
            'Valor diferencia':l.diferencia==null||!(Number(l.costo_tienda)>0)?'':
              l.valor_ajuste??Number(l.diferencia)*Number(l.costo_tienda),
            Observación:l.nota||'','ID corte':c.id};
          detalleFilas.push(fila);
          if(l.diferencia!=null&&Number(l.diferencia)!==0)diferencias.push(fila);
        }
      }
      const libro=XLSX.utils.book_new();
      hoja(libro,resumen,'Resumen tiendas');
      if(resultadoCortes.length)hoja(libro,resultadoCortes,'Resultado del corte');
      if(control.length)hoja(libro,control,'Control de cortes');
      if(diferencias.length)hoja(libro,diferencias,'Diferencias');
      if(detalleFilas.length)hoja(libro,detalleFilas,'Detalle inventario');
      if(pendientes.length)hoja(libro,pendientes,'Por aclarar');
      guardarLibro(libro,`ultimos-cortes-tiendas-${hoy}.xlsx`);
    }
    el('cerrar').onclick=()=>{if(!busy)el('modal').classList.remove('show');};
    el('crear').onclick=()=>run(()=>crear(false));el('ciego').onclick=()=>run(()=>crear(true));
    el('buscar').onclick=()=>run(historial);el('informe').onclick=()=>run(informe);
    el('ultimos').onclick=()=>run(informeUltimos);
    el('no-conforme-form').onsubmit=event=>{event.preventDefault();run(solicitarNoConforme,'nc-mensaje');};
    el('evidencia-form').onsubmit=event=>{event.preventDefault();run(completarEvidencia,'evidencia-mensaje');};
    el('tienda').onchange=()=>{detalle=null;el('detalle').innerHTML='';el('evidencia-form').reset();el('evidencia-form').hidden=true;run(async()=>{await historial();await cargarNoConformes();});};
    ready=rpc('config').then(data=>{config=data;el('tienda').innerHTML=(config.central?'<option value="">Todas las tiendas (solo informe)</option>':'')+config.tiendas.map(t=>`<option value="${esc(t.codigo)}">${esc(t.nombre)}</option>`).join('');el('ultimos').style.display=config.central?'':'none';});
    // Mantener rechazo observable, sin promesas rechazadas huérfanas.
    ready.catch(e=>{el('mensaje').textContent=e.message;});
    return { async abrir(){el('modal').classList.add('show');await run(async()=>{await ready;const tienda=tiendaActual();if(tienda&&config.tiendas.some(t=>t.codigo===tienda))el('tienda').value=tienda;await historial();await cargarNoConformes();});} };
  }
  global.KoraConteosUI=Object.freeze({init,resumirValores});
})(window);
