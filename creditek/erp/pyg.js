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
  let report=null,profile=null;
  function detailTable(headers,rows) {
    return '<table><thead><tr>'+headers.map(label=>'<th>'+escape(label)+'</th>').join('')+'</tr></thead><tbody>'+
      rows.map(row=>'<tr>'+row.map((value,index)=>'<td data-label="'+escape(headers[index])+'" class="'+
        (typeof value==='number'&&value<0?'negative':'')+'">'+escape(typeof value==='number'?money(value):value??'Sin desglose')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  }
  async function expenseDetails(expenses) {
    const labels=new Map();
    for(const source of ['financial_entries','aliados_gastos_operativos']) {
      const ids=expenses.filter(row=>row.source===source).map(row=>row.id);
      for(let offset=0;offset<ids.length;offset+=200) {
        const columns=source==='financial_entries'?'id,concept':'id,concepto';
        try {
          const records=await C.allRows(sb,source,columns,'id',q=>q.in('id',ids.slice(offset,offset+200)));
          for(const row of records)labels.set(source+'|'+row.id,row.concept||row.concepto);
        } catch(error) {
          console.warn('PYG: conceptos pendientes de '+source,error.message);
        }
      }
    }
    return D.describeExpenses(expenses,labels);
  }
  async function exportAllies() {
    if(!report || report.start!==$('from').value || report.end!==$('to').value) {
      $('status').textContent='Consulta de nuevo el período antes de descargar.';return;
    }
    const current=report;
    $('exportAllies').disabled=true;
    try {
      const id=await KoraReportExport.exportData({
        title:'PYG Aliados',mode:'detailed',orientation:'portrait',logoCompleto:true,
        route:location.pathname,scope:{label:'Negocio Aliados',code:'aliados'},
        filters:[['Desde',current.start],['Hasta',current.end],['Moneda','COP sin centavos']],
        tables:[
          {heading:'Conciliación del resultado',headers:['Concepto','Valor COP'],columnTypes:['text','currency'],rows:current.breakdown.bridge},
          {heading:'Cargos incluidos por plataforma',headers:['Plataforma','Gastos financieros','Provisiones','Estado'],columnTypes:['text','currency','currency','text'],rows:current.breakdown.platforms.map(row=>[row.platform,row.financial,row.provision,row.status])},
          {heading:'Gastos operativos y generales',headers:['Fecha','Concepto','Valor COP','Fuente','ID'],columnTypes:['text','text','currency','text','text'],rows:current.expenses}
        ],
        notes:['Los gastos financieros y provisiones desglosados ya están descontados del margen de liquidaciones.',
          'El resultado antes de cargos desglosados se reconstruye añadiendo esos cargos al margen, y la conciliación los descuenta una sola vez.',
          'Las plataformas sin desglose registrado conservan sus cargos dentro del margen. La provisión es una reserva calculada.',
          current.breakdown.missing?'Desglose parcial: '+current.breakdown.missing+' importes o componentes pendientes.':'Componentes disponibles conciliados.',
          current.expenseMissing?'Detalle parcial: '+current.expenseMissing+' conceptos de gasto no disponibles; se conservan sus importes, fuente e ID.':'Conceptos de gasto disponibles.',
          'Los gastos se muestran negativos en la conciliación y positivos en el detalle.']
      },{sb,profile});
      $('status').textContent='Excel de Aliados descargado. Código '+id+'.';
    }catch(error){$('status').textContent='No se pudo descargar el PYG. '+error.message;}
    finally{$('exportAllies').disabled=false;}
  }
  async function load(event){
    event?.preventDefault();
    const start=$('from').value,end=$('to').value,today=C.day(new Date());
    if(!start||!end||start>end||end>today){$('status').textContent='Selecciona un rango válido hasta hoy.';return;}
    report=null;$('alliesPanel').hidden=true;
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
        C.loadCreditData(sb,{breakdown:true}),
        C.allRows(sb,'addi_liquidaciones','id,utilidad_creditek,tarifa_addi,iva_tarifa','id',q=>q.eq('estado','aprobada').gte('fecha_venta',start).lte('fecha_venta',end)),
        U.authorizedExpenses(sb,'b2b',start,end),
        U.authorizedExpenses(sb,'aliados',start,end)
      ]);
      if(!retail.generalAvailable)throw Error('Falta acceso a los gastos generales Retail.');
      const r=D.retail(retail,stores),b=D.b2b(b2b,b2bExpenses);
      const operations=[...C.credits(creditData,period),...addi.map(row=>({...row,plataforma:'addi'}))];
      const breakdown=D.alliesBreakdown(operations,alliesExpenses);
      const a=breakdown.summary;
      const expenseDetail=await expenseDetails(alliesExpenses);
      const expenses=expenseDetail.rows;
      $('business').innerHTML=table([r.summary,b,a]);
      $('stores').innerHTML=table(r.stores);
      $('alliesBridge').innerHTML=detailTable(['Concepto','Valor COP'],breakdown.bridge);
      $('alliesCharges').innerHTML=detailTable(['Plataforma','Gastos financieros','Provisiones','Estado'],
        breakdown.platforms.map(row=>[row.platform,row.financial,row.provision,row.status]));
      $('alliesExpenses').innerHTML=expenses.length?detailTable(['Fecha','Concepto','Valor COP'],expenses.map(row=>row.slice(0,3))):'<p>Sin gastos operativos autorizados en el período.</p>';
      $('alliesCoverage').textContent=breakdown.missing?'Desglose parcial: '+breakdown.missing+' importes o componentes pendientes.':'Componentes disponibles conciliados con el margen.';
      if(expenseDetail.missing)$('alliesCoverage').textContent+=' Detalle parcial: '+expenseDetail.missing+' conceptos pendientes; sus importes se mantienen en el cálculo.';
      report={start,end,breakdown,expenses,expenseMissing:expenseDetail.missing};
      $('alliesPanel').hidden=false;
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
      const response=await sb.from('perfiles').select('id,nombre,rol,activo').eq('id',session.user.id).single();
      if(response.error)throw response.error;
      profile=response.data;
      if(!profile?.activo)throw Error('El perfil del responsable está inactivo.');
      $('exportAllies').onclick=exportAllies;
      const today=C.day(new Date());$('from').value=today.slice(0,7)+'-01';$('to').value=today;
      $('app').hidden=false;$('app').classList.add('show');$('filters').onsubmit=load;
      await load();
    }catch(error){$('status').textContent=error.message;}
  }
  init();
})();
