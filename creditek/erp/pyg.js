(function(){
  'use strict';
  const env=window.__KORA_ENV__;
  const sb=supabase.createClient(env.KORA_ERP_SUPABASE_URL,env.KORA_ERP_SUPABASE_ANON_KEY);
  const C=CreditekTableroEjecutivos,U=CreditekTableroUtilidad,D=KoraPyg;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>value==null?'—':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(value===0?0:value);
  function table(rows){
    const columns=[['name','Negocio / tienda'],['income','Ingresos'],['cost','Costo de venta'],['margin','Margen'],['expenses','Gastos'],['losses','Bajas'],['net','Utilidad neta'],['missing','Estado']];
    return '<table><thead><tr>'+columns.map(([,label])=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+
      rows.map(row=>'<tr>'+columns.map(([field,label])=>{
        const value=field==='name'?row.name:field==='missing'?(row.missing?'Parcial · '+row.missing+' datos pendientes':'Completo'):money(row[field]);
        return '<td data-label="'+label+'" class="'+(field==='net'?'net ':'')+(typeof row[field]==='number'&&row[field]<0?'negative':'')+'">'+escape(value)+'</td>';
      }).join('')+'</tr>').join('')+'</tbody></table>';
  }
  async function load(event){
    event?.preventDefault();
    const start=$('from').value,end=$('to').value,today=C.day(new Date());
    if(!start||!end||start>end||end>today){$('status').textContent='Selecciona un rango válido hasta hoy.';return;}
    $('load').disabled=true;
    $('from').disabled=true;$('to').disabled=true;
    $('business').textContent='';$('stores').textContent='';
    $('status').textContent='Consultando ventas, liquidaciones y gastos…';
    try{
      const period={start,end};
      const next=new Date(end+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);period.end=next.toISOString().slice(0,10);
      const [retail,stores,b2b,creditData,addi,b2bExpenses,alliesExpenses]=await Promise.all([
        U.retailData(sb,{start,end}),
        C.allRows(sb,'tiendas_operativas','codigo,nombre','codigo'),
        U.rpcRows(sb,{start},end),
        C.loadCreditData(sb),
        C.allRows(sb,'addi_liquidaciones','id,utilidad_creditek','id',q=>q.eq('estado','aprobada').gte('fecha_venta',start).lte('fecha_venta',end)),
        U.authorizedExpenses(sb,'b2b',start,end),
        U.authorizedExpenses(sb,'aliados',start,end)
      ]);
      if(!retail.generalAvailable)throw Error('Falta acceso a los gastos generales Retail.');
      const r=D.retail(retail,stores),b=D.b2b(b2b,b2bExpenses);
      const a=D.allies([...C.credits(creditData,period),...addi],alliesExpenses);
      $('business').innerHTML=table([r.summary,b,a]);
      $('stores').innerHTML=table(r.stores);
      $('status').textContent='PYG del '+start+' al '+end+' · Valores en pesos colombianos.';
    }catch(error){$('status').textContent='No se pudo completar el PYG. '+error.message;}
    finally{$('load').disabled=false;$('from').disabled=false;$('to').disabled=false;}
  }
  async function init(){
    try{
      const {data:{session},error}=await sb.auth.getSession();if(error)throw error;
      if(!session){location.href='app.html';return;}
      const {data:allowed,error:accessError}=await sb.rpc('es_controlador_financiero');
      if(accessError)throw accessError;
      if(allowed!==true)throw Error('El PYG requiere acceso a los gastos autorizados de los negocios.');
      const today=C.day(new Date());$('from').value=today.slice(0,7)+'-01';$('to').value=today;
      $('app').hidden=false;$('app').classList.add('show');$('filters').onsubmit=load;
      await load();
    }catch(error){$('status').textContent=error.message;}
  }
  init();
})();
