(function(){
  'use strict';
  const MAITE='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
  const OSCAR='6de0ad26-64af-4966-8cd9-d468880af627';
  const env=window.__KORA_ENV__;
  const sb=supabase.createClient(env.KORA_ERP_SUPABASE_URL,env.KORA_ERP_SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
  let perfil=null,cuenta=null,proveedores=[],facturas=[],solicitudes=[],aplicaciones=[],busy=false,requestId=null;
  function nombre(id){return proveedores.find(p=>p.id===id)?.nombre||id}
  function deuda(id){return facturas.filter(f=>f.proveedor_id===id).reduce((sum,f)=>sum+Number(f.saldo||0),0)}
  function fecha(value){return value?new Date(value).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'—'}
  function aviso(id,message,error=false){const el=$(id);el.textContent=message;el.className=error?'error':'ok'}
  async function obtenerFacturas(){
    const rows=[];
    for(let from=0;;from+=1000){
      const {data,error}=await sb.from('facturas_proveedor').select('id,proveedor_id,numero,fecha,saldo').range(from,from+999);
      if(error)throw error;
      rows.push(...(data||[]));
      if((data||[]).length<1000)return rows;
    }
  }
  function renderCuenta(){
    if(!cuenta){$('cuentaEstado').textContent='No se encontró la cuenta Creditek; no se puede solicitar ni registrar pagos.';return;}
    const sincronizada=cuenta.saldo_actual!==null;
    $('cuentaEstado').innerHTML=`<p><strong>Creditek S.A.S. · •••• 4006</strong><br>${cuenta.banco?esc(cuenta.banco)+' · '+esc(cuenta.tipo_cuenta):'Banco y tipo de cuenta pendientes de confirmar'}</p>
      <p class="${sincronizada?'ok':'error'}">${sincronizada?'Saldo de control: '+money(cuenta.saldo_actual)+' · corte '+esc(cuenta.fecha_corte):'Saldo bancario todavía no sincronizado. Ningún giro a proveedores puede registrarse.'}</p>
      ${!sincronizada&&perfil.id===OSCAR?`<form id="sincronizarForm"><p>Óscar registra una sola apertura con el saldo real y su fecha de corte. Esta acción no crea pagos ni aplica facturas.</p>
        <div class="grid"><label class="field">Saldo real (COP)<input name="saldo" type="number" min="0" step="1" required></label>
        <label class="field">Fecha de corte<input name="fecha" type="date" max="${today()}" required></label>
        <label class="field wide">Motivo y fuente de la cifra<input name="motivo" minlength="10" maxlength="300" required></label></div>
        <button class="btn primary" type="submit">Sincronizar saldo inicial</button><p id="sincronizarEstado" role="status"></p></form>`:''}`;
    if($('sincronizarForm'))$('sincronizarForm').onsubmit=sincronizar;
  }
  function validarSolicitud(){
    const id=$('proveedor').value,monto=Number($('monto').value),concepto=$('concepto').value.trim();
    $('deuda').value=id?money(deuda(id)):'';
    $('solicitar').disabled=busy||!id||!Number.isInteger(monto)||monto<=0||monto>deuda(id)||concepto.length<8;
  }
  function tarjeta(s,acciones){
    const asignaciones=aplicaciones.filter(a=>a.solicitud_id===s.id).sort((a,b)=>a.orden-b.orden);
    const detalle=asignaciones.length?`<details><summary>Aplicación automática a ${asignaciones.length} factura(s)</summary><ol>${asignaciones.map(a=>{
      const f=facturas.find(row=>row.id===a.factura_id);
      return `<li>${esc(f?.numero||a.factura_id)} · ${money(a.monto)}</li>`;
    }).join('')}</ol></details>`:'';
    const control=acciones==='decidir'&&perfil.id===OSCAR?`<div class="actions"><button class="btn primary" data-aprobar="${s.id}">Autorizar</button><button class="btn" data-rechazar="${s.id}">Rechazar</button></div>`:
      acciones==='pagar'&&perfil.id===MAITE?`<form class="pagoForm" data-pago="${s.id}"><div class="grid">
        <label class="field">Fecha real del giro<input name="fecha" type="date" max="${today()}" value="${today()}" required></label>
        <label class="field">Referencia bancaria<input name="referencia" minlength="3" required></label>
        <label class="field wide">Comprobante bancario (PDF, JPG o PNG; máximo 10 MB)<input name="soporte" type="file" accept="application/pdf,image/jpeg,image/png" required></label></div>
        <button class="btn primary" type="submit" ${cuenta?.saldo_actual==null?'disabled':''}>Registrar giro comprobado y aplicar a facturas</button>
        ${cuenta?.saldo_actual==null?'<p class="error">Pendiente de sincronizar Banco. La autorización no permite mover saldos todavía.</p>':''}</form>`:'';
    return `<article class="card"><strong>${esc(nombre(s.proveedor_id))}</strong> <span class="tag ${esc(s.estado)}">${esc(s.estado)}</span>
      <p><strong>${money(s.monto)}</strong> · ${esc(s.concepto)}</p>
      <p class="muted">Solicitó Maite · ${esc(fecha(s.solicitado_at))}${s.autorizado_at?' · Decisión '+esc(fecha(s.autorizado_at)):''}${s.pagado_at?' · Giro '+esc(fecha(s.pagado_at)):''}</p>
      ${s.motivo_rechazo?`<p class="error">Rechazo: ${esc(s.motivo_rechazo)}</p>`:''}
      ${s.estado==='pagado'?`<p>Banco ${money(s.saldo_banco_antes)} → ${money(s.saldo_banco_despues)} · Referencia ${esc(s.referencia_bancaria)}</p>`:''}
      ${detalle}${control}</article>`;
  }
  function renderSolicitudes(){
    $('pendientes').innerHTML=solicitudes.filter(s=>s.estado==='pendiente').map(s=>tarjeta(s,'decidir')).join('')||'<p>No hay solicitudes pendientes.</p>';
    $('autorizados').innerHTML=solicitudes.filter(s=>s.estado==='autorizado').map(s=>tarjeta(s,'pagar')).join('')||'<p>No hay pagos autorizados por girar.</p>';
    $('historial').innerHTML=solicitudes.filter(s=>['pagado','rechazado'].includes(s.estado)).map(s=>tarjeta(s,'')).join('')||'<p>No hay movimientos en este libro.</p>';
    document.querySelectorAll('[data-aprobar]').forEach(b=>b.onclick=()=>decidir(b.dataset.aprobar,true));
    document.querySelectorAll('[data-rechazar]').forEach(b=>b.onclick=()=>decidir(b.dataset.rechazar,false));
    document.querySelectorAll('.pagoForm').forEach(f=>f.onsubmit=registrarGiro);
  }
  async function cargar(){
    const [c,p,s,a]=await Promise.all([
      sb.from('banco_creditek_cuentas').select('*').eq('numero_cuenta','87600004006').maybeSingle(),
      sb.from('proveedores').select('id,nombre').eq('activo',true).order('nombre'),
      sb.from('banco_creditek_pagos_proveedor').select('*').order('solicitado_at',{ascending:false}).limit(200),
      sb.from('banco_creditek_aplicaciones_proveedor').select('solicitud_id,factura_id,monto,orden').limit(500),
    ]);
    for(const result of [c,p,s,a])if(result.error)throw result.error;
    cuenta=c.data;proveedores=p.data||[];solicitudes=s.data||[];aplicaciones=a.data||[];
    facturas=await obtenerFacturas();
    $('proveedor').innerHTML='<option value="">Selecciona</option>'+proveedores.map(x=>`<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
    renderCuenta();renderSolicitudes();validarSolicitud();
  }
  async function solicitar(){
    if(busy||perfil.id!==MAITE)return;
    validarSolicitud();if($('solicitar').disabled)return;
    const proveedor=$('proveedor').value,monto=Number($('monto').value),concepto=$('concepto').value.trim();
    if(!confirm(`¿Solicitar ${money(monto)} para ${nombre(proveedor)}?\n\nNo se escogerá factura ni se descontará dinero hasta el giro comprobado.`))return;
    busy=true;validarSolicitud();requestId||=crypto.randomUUID();
    const {error}=await sb.rpc('banco_creditek_solicitar_pago_proveedor',{
      p_id:requestId,p_proveedor_id:proveedor,p_monto:monto,p_concepto:concepto,
    });
    busy=false;
    if(error){aviso('solicitarEstado','No se registró: '+error.message,true);validarSolicitud();return;}
    requestId=null;$('monto').value='';$('concepto').value='';
    aviso('solicitarEstado','Solicitud enviada a Óscar. Banco y facturas no cambiaron.');await cargar();
  }
  async function decidir(id,aprobar){
    if(busy||perfil.id!==OSCAR)return;
    let motivo=null;
    if(aprobar){if(!confirm('¿Autorizas este pago al proveedor? Todavía no se descontará Banco ni se abonarán facturas.'))return;}
    else{motivo=prompt('Motivo del rechazo (mínimo 10 caracteres):');if(motivo===null)return;if(motivo.trim().length<10){alert('Escribe al menos 10 caracteres.');return;}}
    busy=true;
    const {error}=await sb.rpc('banco_creditek_decidir_pago_proveedor',{
      p_id:id,p_aprobar:aprobar,p_motivo_rechazo:motivo,
    });
    busy=false;
    if(error){alert('No se registró la decisión: '+error.message);return;}
    await cargar();
  }
  async function sincronizar(event){
    event.preventDefault();if(busy||perfil.id!==OSCAR)return;
    const form=event.currentTarget,values=Object.fromEntries(new FormData(form));
    const saldo=Number(values.saldo);
    if(!Number.isInteger(saldo)||saldo<0)return aviso('sincronizarEstado','El saldo debe estar en pesos enteros.',true);
    if(!confirm(`¿Registrar ${money(saldo)} como saldo inicial de ${cuenta.banco} •••• 4006, corte ${values.fecha}?\n\nLa apertura queda auditada y no se puede repetir.`))return;
    busy=true;
    const {error}=await sb.rpc('banco_creditek_sincronizar_saldo',{
      p_saldo:saldo,p_fecha_corte:values.fecha,p_motivo:values.motivo,
    });
    busy=false;
    if(error){aviso('sincronizarEstado','No se sincronizó: '+error.message,true);return;}
    await cargar();
  }
  async function registrarGiro(event){
    event.preventDefault();if(busy||perfil.id!==MAITE||cuenta?.saldo_actual==null)return;
    const form=event.currentTarget,id=form.dataset.pago,s=solicitudes.find(x=>x.id===id);
    if(!s)return;
    const values=Object.fromEntries(new FormData(form)),file=form.elements.soporte.files[0];
    if(!file||!['application/pdf','image/jpeg','image/png'].includes(file.type)||file.size>10*1024*1024){
      alert('Selecciona un PDF, JPG o PNG de máximo 10 MB.');return;
    }
    if(!confirm(`Confirma que el banco YA giró ${money(s.monto)} a ${nombre(s.proveedor_id)} y que el comprobante corresponde a ese pago. KORA descontará Banco y aplicará el monto a las facturas más antiguas.`))return;
    busy=true;form.querySelector('button[type=submit]').disabled=true;
    const ext=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg';
    const path=`aliados/tesoreria/${crypto.randomUUID()}.${ext}`;
    const uploaded=await sb.storage.from('soportes').upload(path,file,{contentType:file.type,upsert:false});
    if(uploaded.error){busy=false;form.querySelector('button[type=submit]').disabled=false;alert('No se cargó el soporte: '+uploaded.error.message);return;}
    const {error}=await sb.rpc('banco_creditek_registrar_giro_proveedor',{
      p_id:id,p_fecha_pago:values.fecha,p_referencia_bancaria:values.referencia,p_soporte_path:path,
    });
    busy=false;
    if(error){form.querySelector('button[type=submit]').disabled=false;alert('No se registró el giro ni se movió ningún saldo: '+error.message);return;}
    await cargar();
  }
  async function iniciar(){
    const {data:{session}}=await sb.auth.getSession();if(!session)return;
    const {data:p,error}=await sb.from('perfiles').select('id,rol,activo').eq('id',session.user.id).single();
    if(error||!p?.activo||!((p.id===MAITE&&p.rol==='auditoria')||(p.id===OSCAR&&p.rol==='gerencia')))return;
    perfil=p;$('app').hidden=false;if(p.id===MAITE)$('solicitarPanel').hidden=false;
    $('proveedor').onchange=validarSolicitud;
    $('monto').oninput=()=>{requestId=null;validarSolicitud()};
    $('concepto').oninput=()=>{requestId=null;validarSolicitud()};
    $('solicitar').onclick=solicitar;
    try{await cargar()}catch(e){$('cuentaEstado').textContent='No fue posible cargar Banco: '+e.message;}
    try {
      if (!window.CreditekCobrosPlataformas) throw new Error('No se cargó el módulo de cobros.');
      const cobros=window.CreditekCobrosPlataformas.create({sb,canEdit:p.id===OSCAR,canVoid:p.id===OSCAR});
      await cobros.mount($('cobrosPlataformas'));
      if (new URLSearchParams(location.search).get('vista') === 'cobros')
        $('cobrosPlataformas').scrollIntoView({block:'start'});
    } catch(e) {$('cobrosPlataformas').textContent='No fue posible consultar cobros de plataformas: '+e.message;}
  }
  iniciar();
})();
