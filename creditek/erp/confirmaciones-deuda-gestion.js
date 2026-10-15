(async function(){
 'use strict';
 const env=window.__KORA_ENV__,sb=supabase.createClient(env.KORA_ERP_SUPABASE_URL,env.KORA_ERP_SUPABASE_ANON_KEY);
 const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(Number(n));
 const e=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const {data:{session}}=await sb.auth.getSession();if(!session)return;$('app').classList.add('show');
 $('fecha').value=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
 let loading=false;
 async function load(){
 if(loading)return;loading=true;$('actualizar').disabled=true;$('estado').textContent='Consultando…';
 try{
 const {data,error}=await sb.rpc('listar_confirmaciones_deuda',{p_fecha:$('fecha').value});if(error)throw error;
 $('filas').replaceChildren();$('diferencias').replaceChildren();
 for(const row of data.diarias){const c=row.confirmacion,tr=e('tr');for(const text of [row.tienda+' · '+row.administrador,!c?'Pendiente':Number(c.diferencia)!==0?'Diferencia reportada':'Confirmado',c?money(c.saldo_sistema):'—',c?money(c.saldo_declarado):'—',c?new Date(c.confirmado_at).toLocaleTimeString('es-CO',{timeZone:'America/Bogota'}):'—'])tr.append(e('td',text));$('filas').append(tr);}
 for(const c of data.diferencias){
 const card=e('form');card.className='diferencia';card.append(e('h3',c.tienda+' · '+c.administrador),e('small',c.fecha),e('p',`KORA: ${money(c.saldo_sistema)} · Declarado: ${money(c.saldo_declarado)} · Diferencia: ${money(c.diferencia)}`),e('p',c.observacion));
 const label=e('label','Resultado de la revisión'),note=e('textarea');note.required=true;note.minLength=5;note.maxLength=2000;label.append(note);const button=e('button','Guardar revisión');button.type='submit';const status=e('p');status.setAttribute('role','status');card.append(label,button,status);
 card.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;try{const {error}=await sb.rpc('revisar_confirmacion_deuda',{p_id:c.id,p_respuesta:note.value.trim()});if(error)throw error;await load();}catch(err){status.textContent=err.message;button.disabled=false;}});$('diferencias').append(card);
 }
 if(!data.diferencias.length)$('diferencias').append(e('p','No hay diferencias pendientes.'));
 $('estado').textContent=`${data.diarias.filter(r=>r.confirmacion).length} de ${data.diarias.length} administradores confirmaron o reportaron diferencia.`;
 }catch(err){$('filas').replaceChildren();$('diferencias').replaceChildren();$('estado').textContent='No se pudo consultar: '+err.message;}
 finally{loading=false;$('actualizar').disabled=false;}
 }
 $('actualizar').addEventListener('click',load);$('fecha').addEventListener('change',load);await load();
})();
