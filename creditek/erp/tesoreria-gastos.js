(function(root){
  'use strict';
  const OSCAR='6de0ad26-64af-4966-8cd9-d468880af627';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canDecide=(profile,row)=>profile?.activo===true&&profile.id===OSCAR&&profile.rol==='gerencia'&&row.status==='pendiente_aprobacion';
  const summarize=rows=>({pending:rows.filter(r=>r.status==='pendiente_aprobacion').length,approved:rows.filter(r=>r.status==='aprobado').length});
  function paintIndicator(button,{pending=0,error=false}){
    button.classList.toggle('expenses-attention',!error&&pending>0);
    const label=error?'No se pudo consultar los pendientes. Pulsa Gastos y retiros para reintentar.':`${pending} por aprobar`;
    button.setAttribute('aria-label',`Gastos y retiros: ${label}`);
    button.title=label;
    button.innerHTML='Gastos y retiros'+(!error&&pending>0?`<span class="expense-counter" aria-hidden="true">${pending>99?'99+':pending}</span>`:'');
  }
  function create({sb,profile,domain,onSummary=()=>{}}){
    let host,rows=[],busy=false,sequence=0,summarySequence=0;
    async function refreshSummary(){
      const current=++summarySequence;
      try{
        const all=[];for(let from=0;;from+=500){const result=await sb.from('financial_entries').select('id,status').in('status',['pendiente_aprobacion','aprobado']).order('id').range(from,from+499);if(result.error)throw result.error;all.push(...result.data);if(result.data.length<500)break;}
        if(current===summarySequence)onSummary(summarize(all));
      }catch(error){if(current===summarySequence)onSummary({error:true});}
    }
    const visible=()=>domain.filterEntries(rows,{business:host.querySelector('[data-business]').value,query:host.querySelector('[data-query]').value});
    const history=()=>domain.filterEntries(visible().filter(r=>r.status!=='pendiente_aprobacion'&&r.status!=='aprobado'),{from:host.querySelector('[data-from]').value,to:host.querySelector('[data-to]').value});
    function card(row){return `<article class="preparation-card"><h3>${esc(row.concept)}</h3><p>${esc(domain.BUSINESS_LABELS[row.business_unit]||row.business_unit)}${row.store_code?' · Tienda '+esc(row.store_code):''} · ${esc(row.due_date)} · ${esc(row.entry_type==='retiro_utilidad'?'Retiro de utilidad':'Gasto')}</p><p>Beneficiario: <strong>${esc(row.beneficiary)}</strong> · ${esc(row.beneficiary_document||'')}</p><p>Cuenta destino: ${esc(row.destination_account||'No informada')}</p><p>Valor: <strong>${row.amount?domain.money(row.amount):'Por confirmar'}</strong> · ${esc(domain.STATUS_LABELS[row.status]||row.status)}</p>${row.note?`<p>${esc(row.note)}</p>`:''}${row.approved_at?`<p>Aprobación / decisión: ${esc(new Date(row.approved_at).toLocaleString('es-CO',{timeZone:'America/Bogota'}))}</p>`:''}${canDecide(profile,row)?`<form data-decision="${esc(row.id)}"><label>Valor confirmado<input class="control" name="amount" type="number" min="1" step="0.01" value="${esc(row.amount||'')}" aria-label="Valor confirmado"></label><label>Nota<input class="control" name="note" aria-label="Nota de decisión"></label><div class="actions"><button class="btn primary" name="decision" value="aprobado" type="submit">Aprobar</button><button class="btn secondary" name="decision" value="rechazado" type="submit">Rechazar</button></div></form>`:''}${row.status==='aprobado'?'<p>Autorización conservada · pendiente de registrar el pago. No requiere otra aprobación.</p>':''}</article>`;}
    function render(){
      const selected=visible(),pending=selected.filter(r=>r.status==='pendiente_aprobacion'),approved=selected.filter(r=>r.status==='aprobado');
      host.querySelector('[data-pending]').innerHTML=`<h3>Pendientes de aprobación (${pending.length})</h3>`+(pending.map(card).join('')||'<p>No hay gastos pendientes de aprobación.</p>');
      host.querySelector('[data-approved]').innerHTML=`<h3>Aprobados, pendientes de pago (${approved.length})</h3>`+(approved.map(card).join('')||'<p>No hay gastos aprobados pendientes de pago.</p>');
      host.querySelector('[data-history]').innerHTML=history().map(card).join('')||'<p>No hay movimientos históricos en este rango.</p>';
    }
    function message(text){host.querySelector('[data-message]').textContent=text;}
    async function load(){const current=++sequence;message('Consultando gastos…');try{
      const all=[];for(let from=0;;from+=500){const result=await sb.from('financial_entries').select('*').order('due_date',{ascending:false}).order('id').range(from,from+499);if(result.error)throw result.error;all.push(...result.data);if(result.data.length<500)break;}
      if(current!==sequence)return;rows=all;++summarySequence;onSummary(summarize(rows));render();message('');
    }catch(error){if(current===sequence)message('No fue posible consultar los gastos: '+(error.message||'Intenta nuevamente.'));}}
    async function submit(event){event.preventDefault();const form=event.target.closest('[data-decision]');if(!form||busy)return;const row=rows.find(r=>r.id===form.dataset.decision);if(!canDecide(profile,row||{}))return;
      const decision=event.submitter?.value;if(!['aprobado','rechazado'].includes(decision))return;
      const amount=Number(form.elements.amount.value);if(decision==='aprobado'&&(!Number.isFinite(amount)||amount<=0)){message('Confirma un valor mayor que cero antes de aprobar.');return;}
      busy=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);message('Guardando decisión…');
      try{const result=await sb.rpc('finanzas_decidir_movimiento',{p_id:row.id,p_decision:decision,p_amount:decision==='aprobado'?amount:null,p_note:form.elements.note.value.trim()||null});if(result.error)throw result.error;await load();message(decision==='aprobado'?'Gasto aprobado. No se ha registrado ningún pago ni reserva bancaria.':'Gasto rechazado.');}
      catch(error){message('No se pudo confirmar la decisión: '+(error.message||'Actualiza antes de reintentar.'));}
      finally{busy=false;host.querySelectorAll('button').forEach(b=>b.disabled=false);}
    }
    async function mount(container){host=container;host.innerHTML=`<section class="card"><h2>Gastos y retiros · Tesorería</h2><p>Maite registra en Gastos; Óscar aprueba o rechaza aquí. Se consulta el mismo movimiento, sin duplicarlo.</p><p>Banco y reservas pendientes de integración: aprobar aquí no descuenta ni reserva dinero.</p><p data-message role="status"></p><div class="actions"><label>Negocio<select class="control" data-business><option value="">Todos los negocios</option><option value="retail">Retail</option><option value="b2b">B2B</option><option value="aliados">Aliados</option></select></label><label>Buscar<input class="control" data-query type="search" placeholder="Concepto, beneficiario o tienda"></label><button class="btn secondary" data-reload>Actualizar gastos</button><a class="btn secondary" href="finanzas-programadas.html?vista=general">Registrar o consultar en Gastos</a></div><div data-pending></div><div data-approved></div><h3>Histórico por fecha del gasto</h3><p>Las fechas solo filtran el histórico; los pendientes permanecen visibles arriba.</p><div class="actions"><label>Desde<input class="control" data-from type="date"></label><label>Hasta<input class="control" data-to type="date"></label><button class="btn secondary" data-export>Descargar informe</button></div><div data-history></div></section>`;
      host.onsubmit=submit;host.querySelectorAll('[data-query],[data-business],[data-from],[data-to]').forEach(input=>input.addEventListener('input',render));host.querySelector('[data-reload]').onclick=load;
      host.querySelector('[data-export]').onclick=()=>{const exportRows=[...visible().filter(r=>['pendiente_aprobacion','aprobado'].includes(r.status)),...history()];const url=URL.createObjectURL(new Blob([domain.csv(exportRows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='tesoreria-gastos.csv';a.click();URL.revokeObjectURL(url);};
      await load();
    }
    return {mount,refreshSummary};
  }
  const api={create,canDecide,summarize,paintIndicator};if(typeof module==='object'&&module.exports)module.exports=api;else root.CreditekTesoreriaGastos=api;
})(typeof window==='undefined'?globalThis:window);
