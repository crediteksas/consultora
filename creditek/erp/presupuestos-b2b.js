(function (global) {
  'use strict';
  const money = n => new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mesActual(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit'}).formatToParts(now);
    return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}`;
  }
  function validar({mes,ventas,unidades,notas,revision}) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw Error('Selecciona un mes válido.');
    function entero(value, nombre, min, max) {
      if (String(value ?? '').trim()==='' || !Number.isSafeInteger(Number(value)) || Number(value)<min || Number(value)>max)
        throw Error(`${nombre}: escribe un número entero válido.`);
      return Number(value);
    }
    if (String(notas ?? '').length>1000) throw Error('La nota no debe superar 1.000 caracteres.');
    return {p_mes:`${mes}-01`,p_meta_ventas:entero(ventas,'Ventas',0,999999999999999),
      p_meta_unidades:String(unidades ?? '').trim()===''?null:entero(unidades,'Unidades',0,2147483647),
      p_notas:String(notas ?? '').trim(),p_revision:entero(revision,'Revisión',0,2147483646)};
  }
  async function montar(container, {sb,perfil}) {
    if (!perfil?.activo || !['gerencia','auditoria'].includes(perfil.rol)) {
      container.textContent='No tienes permiso para consultar presupuestos B2B.';return;
    }
    const editable=perfil.rol==='gerencia';
    container.className='presupuesto-b2b';
    container.innerHTML=`<div class="page-top"><h1>Presupuesto de B2B</h1></div>
      <div class="card"><h2>Programación mensual</h2><p class="sub">Metas propias de B2B. No se suman ni reemplazan los presupuestos de Retail o Aliados. Programar una meta no registra ingresos, gastos ni movimientos de dinero.</p>
      <div class="form-inline"><label class="campo">Mes a programar<input id="b2bMes" type="month" required></label>
      <button type="button" id="b2bActualizar" class="btn-secundario">Actualizar</button></div>
      <p id="b2bEstado" role="status" aria-live="polite">Consultando…</p><div id="b2bResumen" class="resultado"></div>
      <form id="b2bForm"><fieldset id="b2bCampos" style="border:0;padding:0" disabled>
      <div class="form-inline"><label class="campo">Meta de ventas (COP)<input id="b2bVentas" type="number" min="0" max="999999999999999" step="1" required></label>
      <label class="campo">Meta de unidades (opcional)<input id="b2bUnidades" type="number" min="0" max="2147483647" step="1"></label></div>
      <p class="sub">La utilidad neta se consulta como resultado real en el Dashboard B2B; no se presupuesta. Deja unidades vacío si no deseas programar esa meta.</p>
      <label class="campo">Notas de la programación<textarea id="b2bNotas" maxlength="1000"></textarea></label>
      <button class="btn-primary" type="submit" id="b2bGuardar"${editable?'':' hidden'}>Guardar presupuesto B2B</button>
      </fieldset></form>${editable?'':'<p class="sub">Solo Gerencia puede guardar las metas. Auditoría puede consultarlas.</p>'}</div>`;
    const $=id=>container.querySelector(`#${id}`);
    let actual=null,disponible=false,busy=false,dirty=false,secuencia=0,mesConsultado='';
    const estado=(mensaje,error=false)=>{$('b2bEstado').textContent=mensaje;$('b2bEstado').className=error?'error':'';};
    function controles() {
      $('b2bCampos').disabled=!editable||!disponible||busy;
      $('b2bMes').disabled=busy;$('b2bActualizar').disabled=busy;
    }
    function pintar(data) {
      actual=data;dirty=false;
      $('b2bVentas').value=data?.meta_ventas??'';
      $('b2bUnidades').value=data?.meta_unidades??'';$('b2bNotas').value=data?.notas??'';
      $('b2bResumen').innerHTML=data?`<p>Ventas<strong>${esc(money(data.meta_ventas))}</strong></p>
        <p>Unidades<strong>${data.meta_unidades===null?'Sin programar':esc(data.meta_unidades)}</strong></p>`:'';
    }
    async function cargar() {
      const mes=$('b2bMes').value,turno=++secuencia;
      disponible=false;controles();pintar(null);
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)){estado('Selecciona un mes válido.',true);return;}
      estado('Consultando presupuesto B2B…');
      try{
        const {data,error}=await sb.from('b2b_presupuestos').select('mes,meta_ventas,meta_unidades,notas,revision,actualizado_at').eq('mes',`${mes}-01`).maybeSingle();
        if(turno!==secuencia)return;
        if(error)throw error;
        pintar(data);mesConsultado=mes;disponible=true;controles();
        estado(data?`Presupuesto guardado · ${mes} · revisión ${data.revision}.`:`No hay presupuesto B2B programado para ${mes}. No se interpreta como una meta de cero.`);
      }catch(error){if(turno===secuencia){estado('No se pudo consultar el presupuesto: '+error.message,true);controles();}}
    }
    $('b2bForm').addEventListener('input',()=>{dirty=true;});
    $('b2bMes').addEventListener('change',()=>{
      if(dirty&&!global.confirm('Tienes cambios sin guardar. ¿Descartarlos y cambiar de mes?')){$('b2bMes').value=mesConsultado;return;}
      cargar();
    });
    $('b2bActualizar').onclick=()=>{if(!dirty||global.confirm('¿Descartar los cambios sin guardar y volver a consultar?'))cargar();};
    $('b2bForm').onsubmit=async event=>{
      event.preventDefault();if(!editable||!disponible||busy)return;
      let payload;
      try{payload=validar({mes:mesConsultado,ventas:$('b2bVentas').value,
        unidades:$('b2bUnidades').value,notas:$('b2bNotas').value,revision:actual?.revision??0});}
      catch(error){estado(error.message,true);return;}
      if(!global.confirm(`¿Guardar presupuesto B2B de ${mesConsultado}?\nVentas: ${money(payload.p_meta_ventas)}\nNo modifica saldos ni otros negocios.`))return;
      busy=true;controles();estado('Guardando metas B2B…');
      try{
        const {data,error}=await sb.rpc('guardar_presupuesto_b2b_operativo',payload);
        if(error)throw error;
        if(!data||data.mes!==payload.p_mes)throw Error('No se recibió confirmación del presupuesto. Actualiza para verificar.');
        pintar(data);estado(`Presupuesto B2B guardado para ${mesConsultado} · revisión ${data.revision}.`);
      }catch(error){estado('No se confirmó el guardado: '+error.message,true);}
      finally{busy=false;controles();}
    };
    $('b2bMes').value=mesActual();await cargar();
  }
  global.KoraPresupuestoB2B=Object.freeze({montar,validar,mesActual});
})(window);
