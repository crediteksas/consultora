(function(){
  'use strict';
  const MAITE='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
  const OSCAR='6de0ad26-64af-4966-8cd9-d468880af627';
  const env=window.__KORA_ENV__;
  const sb=supabase.createClient(env.KORA_ERP_SUPABASE_URL,env.KORA_ERP_SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n));
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={caja_retail:'Caja Retail',cartera_retail:'Cartera Retail',cartera_b2b:'Cartera cliente B2B',proveedor:'Deuda con proveedor'};
  let perfil=null,origenes=[],proveedores=[],base=null,requestId=null,busy=false;
  const tiposSolicitud=new Map();
  function nombre(codigo){return origenes.find(o=>o.codigo===codigo)?.nombre||proveedores.find(p=>p.id===codigo)?.nombre||codigo}
  async function leerTodas(consulta){
    const filas=[];
    for(let inicio=0;;inicio+=500){
      const {data,error}=await consulta().range(inicio,inicio+499);
      if(error)throw error;
      filas.push(...(data||[]));
      if((data||[]).length<500)return filas;
    }
  }
  function preview(){
    const nuevo=$('objetivo').value.trim()===''?null:Number($('objetivo').value);
    const valido=base&&nuevo!==null&&Number.isInteger(nuevo)&&nuevo>=0&&nuevo!==base.saldo&&$('motivo').value.trim().length>=20;
    $('preparar').disabled=busy||!valido;
    $('vistaPrevia').textContent=!base?'Selecciona el tipo y la cuenta para consultar su saldo.':
      nuevo===null?`Saldo actual: ${money(base.saldo)}. Escribe el nuevo saldo.`:
      Number.isInteger(nuevo)&&nuevo>=0?
        `${money(base.saldo)} → ${money(nuevo)} · Diferencia ${money(nuevo-base.saldo)}. Maite solo prepara; ningún saldo cambia hasta que Óscar autorice.`:
        'El nuevo saldo debe ser un número no negativo de pesos enteros.';
  }
  function cambiarTipo(){
    requestId=null;base=null;$('actual').value='';$('objetivo').value='';
    const tipo=$('tipo').value;
    $('avisoProveedor').hidden=tipo!=='proveedor';
    const cuentas=tipo==='proveedor'?proveedores.filter(p=>p.activo).map(p=>({codigo:p.id,nombre:p.nombre})):
      origenes.filter(o=>o.activo&&(tipo==='cartera_b2b'?o.tipo==='cliente_b2b':o.tipo==='propia'));
    $('codigo').innerHTML='<option value="">Selecciona</option>'+cuentas.map(o=>`<option value="${escapeHtml(o.codigo)}">${escapeHtml(o.nombre)}${tipo==='proveedor'?'':' · '+escapeHtml(o.codigo)}</option>`).join('');
    preview();
  }
  async function saldoActual(){
    requestId=null;base=null;$('actual').value='';$('prepararEstado').textContent='';preview();
    const tipo=$('tipo').value,codigo=$('codigo').value;
    if(!tipo||!codigo)return;
    $('actual').value='Consultando…';
    let data,error;
    if(tipo==='proveedor'){
      try{
        const facturas=await leerTodas(()=>sb.from('facturas_proveedor').select('id,saldo').eq('proveedor_id',codigo).order('id'));
        if(facturas.some(f=>f.saldo==null||!Number.isFinite(Number(f.saldo))||Number(f.saldo)<0))throw new Error('Hay facturas con saldo inválido');
        data={saldo:Math.round(facturas.reduce((s,f)=>s+Number(f.saldo),0)*100)/100};
      }catch(e){error=e;}
    }else if(tipo==='caja_retail'){
      ({data,error}=await sb.rpc('calcular_efectivo_esperado_tienda',{
        p_tienda_codigo:codigo,p_fecha:new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}),
      }));
    }else if(tipo==='cartera_retail'){
      ({data,error}=await sb.from('v_cartera_retail_oficial').select('saldo').eq('tienda_codigo',codigo).single());
    }else{
      ({data,error}=await sb.from('v_cartera_clientes_b2b').select('saldo').eq('cliente_codigo',codigo).single());
    }
    if($('tipo').value!==tipo||$('codigo').value!==codigo)return;
    const saldo=Number(tipo==='caja_retail'?data?.esperado:data?.saldo);
    if(error||!Number.isFinite(saldo)||(tipo!=='proveedor'&&!Number.isInteger(saldo))||saldo<0){
      $('actual').value='No disponible';$('prepararEstado').textContent='No se pudo verificar el saldo. Actualiza la página antes de solicitar el ajuste.';
      return;
    }
    base={tipo,codigo,saldo};$('actual').value=money(saldo);preview();
  }
  async function preparar(){
    if(perfil?.id!==MAITE||!base||busy)return;
    preview();if($('preparar').disabled)return;
    const objetivo=Number($('objetivo').value),motivo=$('motivo').value.trim();
    if(!confirm(`¿Enviar a Óscar esta solicitud?\n\n${labels[base.tipo]} · ${nombre(base.codigo)}\n${money(base.saldo)} → ${money(objetivo)}\nDiferencia: ${money(objetivo-base.saldo)}\n\nNo cambiará el saldo todavía.`))return;
    busy=true;preview();$('prepararEstado').textContent='Registrando solicitud sin mover saldos…';
    requestId||=crypto.randomUUID();
    let error;
    try{
      const destino=base.tipo==='proveedor'?{p_proveedor_id:base.codigo}:{p_tipo:base.tipo,p_codigo:base.codigo};
      ({error}=await sb.rpc(base.tipo==='proveedor'?'preparar_ajuste_proveedor':'preparar_ajuste_gerencia',{
        p_id:requestId,...destino,p_saldo_base:base.saldo,p_saldo_objetivo:objetivo,p_motivo:motivo,
      }));
    }catch(e){error=e;}finally{busy=false;}
    if(error){$('prepararEstado').textContent='No se registró: '+error.message;preview();return;}
    requestId=null;$('objetivo').value='';$('motivo').value='';
    $('prepararEstado').textContent='Solicitud pendiente de autorización de Óscar. Ningún saldo cambió.';
    await saldoActual();await cargar();
  }
  function tarjeta(s,permitirDecision){
    const estado=escapeHtml(s.estado),fecha=new Date(s.preparado_at).toLocaleString('es-CO',{timeZone:'America/Bogota'});
    return `<article class="card"><div><strong>${escapeHtml(labels[s.tipo])} · ${escapeHtml(nombre(s.codigo))}</strong> <span class="tag ${estado}">${estado}</span></div>
      <p>${money(s.saldo_base)} → ${money(s.saldo_objetivo)} · Diferencia ${money(Number(s.saldo_objetivo)-Number(s.saldo_base))}</p>
      <p>${escapeHtml(s.motivo)}</p><p class="muted">Preparó Maite · ${escapeHtml(fecha)}${s.decidido_at?' · Decisión '+escapeHtml(new Date(s.decidido_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})):''}</p>
      ${s.tipo==='proveedor'?`<p class="muted">Corrección de deuda; no es pago ni salida de Banco. No vuelve a descontar retenciones.</p><details><summary>Ver documentos del ajuste antes de autorizar</summary>${(s.plan||[]).map(f=>`<p>${escapeHtml(f.numero||'Sin número')} · ${money(f.saldo_anterior)} → ${money(f.saldo_nuevo)} · Ajuste ${money(f.diferencia)}</p>`).join('')}</details>`:''}
      ${s.motivo_rechazo?`<p class="error">Rechazo: ${escapeHtml(s.motivo_rechazo)}</p>`:''}
      ${permitirDecision?`<div class="actions"><button class="btn primary" data-aprobar="${s.id}">Autorizar ajuste</button><button class="btn" data-rechazar="${s.id}">Rechazar</button></div>`:''}</article>`;
  }
  async function cargar(){
    let data;
    try{
      const [generales,porProveedor]=await Promise.all([
        leerTodas(()=>sb.from('ajustes_gerencia_solicitudes').select('*').order('preparado_at',{ascending:false}).order('id')),
        leerTodas(()=>sb.from('proveedores_ajustes_solicitudes').select('*').order('preparado_at',{ascending:false}).order('id')),
      ]);
      data=[...generales,...porProveedor.map(s=>({...s,tipo:'proveedor',codigo:s.proveedor_id}))]
        .sort((a,b)=>b.preparado_at.localeCompare(a.preparado_at));
    }catch(error){$('pendientes').textContent='No se pudieron cargar las solicitudes: '+error.message;$('historial').textContent='Información no disponible.';return;}
    tiposSolicitud.clear();data.forEach(s=>tiposSolicitud.set(s.id,s.tipo));
    const pendientes=(data||[]).filter(s=>s.estado==='pendiente');
    const historial=(data||[]).filter(s=>s.estado!=='pendiente');
    $('pendientes').innerHTML=pendientes.map(s=>tarjeta(s,perfil.id===OSCAR)).join('')||'<p>No hay solicitudes pendientes.</p>';
    $('historial').innerHTML=historial.map(s=>tarjeta(s,false)).join('')||'<p>No hay decisiones recientes.</p>';
    document.querySelectorAll('[data-aprobar]').forEach(b=>b.onclick=()=>decidir(b.dataset.aprobar,true));
    document.querySelectorAll('[data-rechazar]').forEach(b=>b.onclick=()=>decidir(b.dataset.rechazar,false));
  }
  async function decidir(id,aprobar){
    if(perfil?.id!==OSCAR||busy)return;
    let motivo=null;
    if(aprobar){if(!confirm('¿Autorizas este ajuste? KORA volverá a comprobar el saldo y, si coincide, aplicará el movimiento auditado.'))return;}
    else{motivo=prompt('Motivo del rechazo (mínimo 10 caracteres):');if(motivo===null)return;if(motivo.trim().length<10){alert('Escribe un motivo de al menos 10 caracteres.');return;}}
    busy=true;document.querySelectorAll('[data-aprobar],[data-rechazar]').forEach(b=>b.disabled=true);
    let error;
    try{
      ({error}=await sb.rpc(tiposSolicitud.get(id)==='proveedor'?'decidir_ajuste_proveedor':'decidir_ajuste_gerencia',
        {p_id:id,p_aprobar:aprobar,p_motivo_rechazo:motivo}));
    }catch(e){error=e;}finally{busy=false;}
    if(error){alert('No se aplicó ninguna decisión: '+error.message);await cargar();return;}
    await cargar();
  }
  async function iniciar(){
    const {data:{session}}=await sb.auth.getSession();if(!session)return;
    const {data:p,error}=await sb.from('perfiles').select('id,rol,activo').eq('id',session.user.id).single();
    if(error||!p?.activo||!((p.id===MAITE&&p.rol==='auditoria')||(p.id===OSCAR&&p.rol==='gerencia')))return;
    perfil=p;
    const origen=await sb.from('origenes').select('codigo,nombre,tipo,activo').in('tipo',['propia','cliente_b2b']).order('nombre');
    if(origen.error){$('pendientes').textContent='No se pudieron consultar tiendas y clientes: '+origen.error.message;return;}
    try{proveedores=await leerTodas(()=>sb.from('proveedores').select('id,nombre,activo').order('nombre').order('id'));}
    catch(error){$('app').hidden=false;$('pendientes').textContent='No se pudieron consultar los proveedores: '+error.message;return;}
    origenes=origen.data||[];if(p.id===MAITE)$('prepararPanel').hidden=false;
    $('app').hidden=false;
    window.CreditekCajaLibroUI.montar({sb,perfil:p,contenedor:$('libroCajaGerencia'),tiendas:origenes.filter(o=>o.tipo==='propia')});
    $('tipo').onchange=cambiarTipo;$('codigo').onchange=saldoActual;
    $('objetivo').oninput=()=>{requestId=null;preview()};$('motivo').oninput=()=>{requestId=null;preview()};
    $('preparar').onclick=preparar;
    await cargar();
  }
  iniciar();
})();
