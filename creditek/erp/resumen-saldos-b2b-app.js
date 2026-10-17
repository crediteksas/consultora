(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = window.CreditekResumenSaldosB2B;
  const money = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n === 0 ? 0 : n);
  const reportMoney = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:2,maximumFractionDigits:2}).format(n === 0 ? 0 : n);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fecha = s => s ? new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z')) : 'Sin fecha';
  let sb, modelo = null;
  const vaciar = mensaje => {
    modelo=null;
    ['porCobrar','porPagar','diferencia'].forEach(id => {$(id).textContent='—';delete $(id).dataset.koraReportValue;});
    $('tiendasTotales').innerHTML=$('proveedoresTotales').innerHTML='';
    $('carteraNota').textContent='Saldo neto de cargos y abonos aplicados.';
    $('proveedoresNota').textContent='Deuda neta por proveedor; los saldos a favor no se cruzan entre proveedores.';
    $('resumenTiendas').textContent=$('resumenProveedores').textContent=mensaje;
    $('tiendasRows').innerHTML=`<tr><td class="empty" colspan="3">${esc(mensaje)}</td></tr>`;
    $('proveedoresRows').innerHTML=`<tr><td class="empty" colspan="4">${esc(mensaje)}</td></tr>`;
  };
  function render() {
    if (!modelo) return;
    const tiendas=D.filtrar(modelo.cartera,$('buscarTiendas').value), proveedores=D.filtrar(modelo.proveedores,$('buscarProveedores').value);
    $('resumenTiendas').textContent=`${tiendas.length} de ${modelo.cartera.length} tiendas y clientes · Saldo mostrado: ${money(D.sumar(tiendas))}`;
    $('resumenProveedores').textContent=`${proveedores.length} de ${modelo.proveedores.length} proveedores · Saldo mostrado: ${money(D.sumar(proveedores))}`;
    $('tiendasRows').innerHTML=tiendas.map(c=>`<tr><td>${esc(c.nombre)}${!c.activo?'<small>Inactiva · conserva movimientos</small>':''}</td><td data-label="Tipo">${esc(c.canal)}</td><td class="num" data-label="Saldo actual" data-kora-report-value="${esc(reportMoney(c.saldo))}"><span><b>${money(c.saldo)}</b>${c.saldo<0?'<small>A favor del cliente</small>':''}</span></td></tr>`).join('')||'<tr><td colspan="3" class="empty">Sin coincidencias.</td></tr>';
    $('proveedoresRows').innerHTML=proveedores.map(p=>`<tr><td>${esc(p.nombre)}${!p.activo?'<small>Inactivo · conserva saldo</small>':''}</td><td class="num" data-label="Facturas pendientes">${p.facturas}</td><td data-label="Primer vencimiento">${p.facturas?fecha(p.proximo):'—'}</td><td class="num" data-label="Saldo actual" data-kora-report-value="${esc(reportMoney(p.saldo))}"><span><b>${money(Math.abs(p.saldo))}</b>${p.saldo<0?'<small>A favor de Creditek</small>':p.aFavor>0?`<small>Incluye ${money(p.aFavor)} a favor, aún sin cruzar con documentos</small>`:''}${p.vencido>0?`<small>Documentos vencidos antes de cruzar créditos: ${money(p.vencido)}</small>`:''}</span></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Sin coincidencias.</td></tr>';
    const totalCell = valor => `<td class="num" data-label="Saldo actual" data-kora-report-value="${esc(reportMoney(valor))}">${money(valor)}</td>`;
    $('tiendasTotales').innerHTML=`<tr><td>Total por cobrar mostrado (sin compensar clientes)</td><td></td>${totalCell(D.sumar(tiendas.filter(c=>c.saldo>0)))}</tr><tr><td>Saldo a favor de clientes mostrado</td><td></td>${totalCell(-D.sumar(tiendas.filter(c=>c.saldo<0)))}</tr><tr><td>Total saldo neto mostrado</td><td></td>${totalCell(D.sumar(tiendas))}</tr>`;
    for(const canal of [...new Set(tiendas.map(c=>c.canal))])$('tiendasTotales').innerHTML+=`<tr><td>Subtotal neto ${esc(canal)}</td><td></td>${totalCell(D.sumar(tiendas.filter(c=>c.canal===canal)))}</tr>`;
    $('proveedoresTotales').innerHTML=`<tr><td>Total por pagar mostrado</td><td></td><td></td>${totalCell(D.sumar(proveedores.filter(p=>p.saldo>0)))}</tr><tr><td>Saldo a favor de Creditek mostrado</td><td></td><td></td>${totalCell(-D.sumar(proveedores.filter(p=>p.saldo<0)))}</tr><tr><td>Total facturas pendientes</td><td class="num" data-label="Facturas pendientes">${proveedores.reduce((n,p)=>n+p.facturas,0)}</td><td></td><td></td></tr>`;
  }
  async function cargar() {
    $('actualizar').disabled=true;$('error').hidden=true;
    vaciar('Cargando…');$('actualizado').textContent='Consultando ambas carteras…';
    try {
      const hoy=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      modelo=await D.cargar(sb,hoy);
      for(const id of ['porCobrar','porPagar','diferencia']){$(id).textContent=money(modelo[id]);$(id).dataset.koraReportValue=reportMoney(modelo[id]);}
      $('diferencia').dataset.negativo=String(modelo.diferencia<0);
      if(modelo.aFavorClientes>0)$('carteraNota').textContent=`Saldo neto; incluye ${money(modelo.aFavorClientes)} a favor de clientes.`;
      if(modelo.aFavorProveedores>0)$('proveedoresNota').textContent=`Deuda neta por proveedor. Además hay ${money(modelo.aFavorProveedores)} a favor de Creditek, separados de lo que debemos a otros proveedores.`;
      $('actualizado').textContent='Actualizado: '+new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date())+' · Hora de Colombia';
      render();
    } catch(error) {
      vaciar('Información no disponible; no equivale a saldo cero.');
      $('actualizado').textContent='No se completó la actualización.';
      $('error').textContent='No fue posible consultar ambas carteras completas. Pulsa Actualizar para reintentar. '+error.message;
      $('error').hidden=false;
    } finally { $('actualizar').disabled=false; }
  }
  try {
    const env=window.__KORA_ENV__;
    sb=supabase.createClient(env.KORA_ERP_SUPABASE_URL,env.KORA_ERP_SUPABASE_ANON_KEY);
    const {data,error}=await sb.auth.getSession();
    if(error)throw error;
    if(!data.session){$('acceso').textContent='Inicia sesión en KORA para consultar los saldos.';return;}
    const {data:perfil,error:perfilError}=await sb.from('perfiles').select('id,rol,activo').eq('id',data.session.user.id).single();
    if(perfilError)throw perfilError;
    if(!perfil?.activo || !['gerencia','auditoria'].includes(perfil.rol)){$('acceso').textContent='Esta consulta está disponible únicamente para Gerencia y Auditoría.';return;}
    $('acceso').hidden=true;$('app').hidden=false;
    $('actualizar').addEventListener('click',cargar);
    ['buscarTiendas','buscarProveedores'].forEach(id=>$(id).addEventListener('input',render));
    await cargar();
  } catch (_) { $('acceso').textContent='No se pudo validar el acceso. Actualiza la página para reintentar.'; }
})();
