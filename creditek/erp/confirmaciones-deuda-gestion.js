(async function(){
 'use strict';
 const env=window.__KORA_ENV__,sb=supabase.createClient(env.KORA_ERP_SUPABASE_URL,env.KORA_ERP_SUPABASE_ANON_KEY);
 const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(Number(n));
 const e=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
 const {data:{session}}=await sb.auth.getSession();if(!session)return;$('app').classList.add('show');
 $('fecha').value=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
 let loading=false,reloadRequested=false,scrollRequested=true;
 function revealSection(){
  if(!scrollRequested)return;scrollRequested=false;
  if(!['#confirmacionesDelDia','#diferenciasPendientes'].includes(location.hash))return;
  const section=$(location.hash.slice(1));section.scrollIntoView({block:'start'});section.focus({preventScroll:true});
 }
 async function load(){
  if(loading){reloadRequested=true;return;}
  loading=true;$('actualizar').disabled=true;$('estado').textContent='Consultando…';
  const requestedDate=$('fecha').value;
  try{
   if(!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate))throw new Error('Selecciona un día válido.');
   let timer;
   const {data,error}=await Promise.race([
    sb.rpc('listar_confirmaciones_deuda',{p_fecha:requestedDate}),
    new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(new Error('La consulta tardó demasiado. Pulsa Actualizar.')),15000);})
   ]).finally(()=>window.clearTimeout(timer));
   if(requestedDate!==$('fecha').value||reloadRequested)return;
   if(error)throw error;
   if(!Array.isArray(data?.diarias)||!Array.isArray(data?.diferencias))throw new Error('Respuesta de confirmaciones incompleta.');
   $('filas').replaceChildren();$('diferencias').replaceChildren();
   const confirmed=data.diarias.filter(row=>row.confirmacion).length;
   $('resumenDiarias').textContent=confirmed+' de '+data.diarias.length+' confirmaciones recibidas · '+(data.diarias.length-confirmed)+' sin confirmar en el día seleccionado.';
   const stores=new Set(data.diferencias.map(c=>c.tienda));
   $('resumenDiferencias').textContent=data.diferencias.length+' reportes por revisar · '+stores.size+' tiendas · incluye días anteriores, sin depender del día seleccionado.';
   $('estado').textContent='Consulta actualizada · '+requestedDate+' · Hora de Colombia. Confirmaciones diarias y diferencias por revisar son controles distintos.';
   for(const row of data.diarias){
    const c=row.confirmacion,tr=e('tr');
    const status=!c?'Sin confirmar':Number(c.diferencia)===0?'Confirmado · sin diferencia':c.revisado_at?'Diferencia revisada':'Diferencia por revisar';
    for(const value of [row.tienda+' · '+row.administrador,status,c?money(c.saldo_sistema):'—',c?money(c.saldo_declarado):'—',c?new Date(c.confirmado_at).toLocaleTimeString('es-CO',{timeZone:'America/Bogota'}):'—'])tr.append(e('td',value));
    $('filas').append(tr);
   }
   for(const c of data.diferencias){
    const card=e('form');card.className='diferencia';
    card.append(e('h3',c.tienda+' · '+c.administrador),e('small','Reporte del '+c.fecha+' · pendiente de revisión'),e('p','KORA: '+money(c.saldo_sistema)+' · Declarado: '+money(c.saldo_declarado)+' · Diferencia: '+money(c.diferencia)),e('p',c.observacion));
    const label=e('label','Resultado de la revisión'),note=e('textarea');note.required=true;note.minLength=5;note.maxLength=2000;label.append(note);
    const button=e('button','Registrar revisión y retirar aviso');button.type='submit';
    const status=e('p');status.setAttribute('role','status');card.append(label,button,status);
    card.addEventListener('submit',async event=>{
     event.preventDefault();button.disabled=true;
     try{
      const {error}=await sb.rpc('revisar_confirmacion_deuda',{p_id:c.id,p_respuesta:note.value.trim()});if(error)throw error;
      // Avisar tras el guardado, incluso si la recarga de esta pantalla falla.
      document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));
      status.textContent='Revisión guardada. El aviso ya no está pendiente.';
      await load();
     }catch(err){status.textContent=err.message;button.disabled=false;}
    });
    $('diferencias').append(card);
   }
   if(!data.diferencias.length)$('diferencias').append(e('p','No hay diferencias pendientes de revisión, ni de hoy ni de días anteriores.'));
   revealSection();
  }catch(err){
   if(requestedDate!==$('fecha').value)return;
   $('filas').replaceChildren();$('diferencias').replaceChildren();
   $('resumenDiarias').textContent='Confirmaciones sin verificar.';$('resumenDiferencias').textContent='Diferencias sin verificar; no significa que sean cero.';
   $('estado').textContent='No se pudo consultar: '+err.message;
  }finally{
   loading=false;$('actualizar').disabled=false;
   if(reloadRequested){reloadRequested=false;void load();}
  }
 }
 $('actualizar').addEventListener('click',load);$('fecha').addEventListener('change',load);
 window.addEventListener('hashchange',()=>{scrollRequested=true;revealSection();});
 window.addEventListener('focus',load);window.addEventListener('online',load);
 await load();
})();
