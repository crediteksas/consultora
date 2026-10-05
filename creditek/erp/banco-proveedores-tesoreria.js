(function(){
  'use strict';
  const OSCAR='6de0ad26-64af-4966-8cd9-d468880af627';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cop=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n));
  let sb=null,profile=null,busy=false,initialized=false;
  async function load(){
    if(!sb||!$('supplierBankApprovals'))return;
    const {data:rows,error}=await sb.from('banco_creditek_pagos_proveedor')
      .select('id,proveedor_id,monto,concepto,solicitado_at').eq('estado','pendiente').order('solicitado_at',{ascending:true}).limit(100);
    if(error){$('supplierBankApprovals').textContent='No se pudieron consultar las solicitudes de Banco: '+error.message;return;}
    const {data:suppliers,error:supplierError}=await sb.from('proveedores').select('id,nombre')
      .in('id',(rows||[]).map(r=>r.proveedor_id).length?(rows||[]).map(r=>r.proveedor_id):['00000000-0000-0000-0000-000000000000']);
    if(supplierError){$('supplierBankApprovals').textContent='No se pudieron consultar los proveedores: '+supplierError.message;return;}
    const names=new Map((suppliers||[]).map(s=>[s.id,s.nombre]));
    $('supplierBankApprovalCount').textContent=String((rows||[]).length);
    $('supplierBankApprovals').innerHTML=(rows||[]).map(r=>`<div class="card" style="margin:10px 0;padding:14px">
      <strong>${esc(names.get(r.proveedor_id)||r.proveedor_id)}</strong> · ${cop(r.monto)}
      <p>${esc(r.concepto)}</p>
      <small>Solicitado por Maite · ${esc(new Date(r.solicitado_at).toLocaleString('es-CO',{timeZone:'America/Bogota'}))}</small>
      ${profile?.id===OSCAR?`<div class="actions"><button class="btn primary" data-banco-aprobar="${r.id}">Autorizar pago</button>
      <button class="btn secondary" data-banco-rechazar="${r.id}">Rechazar</button></div>`:''}</div>`).join('')||'<p>No hay abonos a proveedores pendientes de autorización.</p>';
    document.querySelectorAll('[data-banco-aprobar]').forEach(b=>b.onclick=()=>decidir(b.dataset.bancoAprobar,true));
    document.querySelectorAll('[data-banco-rechazar]').forEach(b=>b.onclick=()=>decidir(b.dataset.bancoRechazar,false));
  }
  async function decidir(id,aprobar){
    if(busy||profile?.id!==OSCAR)return;
    let motivo=null;
    if(aprobar){if(!confirm('¿Autorizar este abono a proveedor? Aún no se descontará Banco ni se aplicarán facturas hasta registrar el giro real con soporte.'))return;}
    else{motivo=prompt('Motivo del rechazo (mínimo 10 caracteres):');if(motivo===null)return;if(motivo.trim().length<10){alert('Escribe un motivo de al menos 10 caracteres.');return;}}
    busy=true;
    const {error}=await sb.rpc('banco_creditek_decidir_pago_proveedor',{
      p_id:id,p_aprobar:aprobar,p_motivo_rechazo:motivo,
    });
    busy=false;
    if(error){alert('No se registró la decisión: '+error.message);return;}
    await load();
    document.dispatchEvent(new CustomEvent('kora-supplier-payment-changed'));
  }
  function init(){
    if(initialized||!window.creditekSidebar?.sb)return;
    initialized=true;sb=window.creditekSidebar.sb;profile=window.creditekSidebar.perfil;
    if(!profile?.activo||!['gerencia','auditoria'].includes(profile.rol))return;
    load();window.addEventListener('focus',load);
  }
  document.addEventListener('kora-sidebar-ready',init,{once:true});
  if(window.creditekSidebar?.sb)init();
})();
