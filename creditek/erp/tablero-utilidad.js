(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./tablero-ejecutivos.js'));
  else root.CreditekTableroUtilidad=factory(root.CreditekTableroEjecutivos);
})(typeof globalThis!=='undefined'?globalThis:this,function(credits){
  'use strict';
  const names={retail:'Retail',b2b:'B2B',aliados:'Aliados'};
  const descriptions={retail:'Resultado Retail: margen de ventas menos gastos aprobados de cada tienda y, solo en el consolidado, gastos CENTRAL aprobados y obligaciones generales Retail pagadas. Los retiros de utilidad no son gastos.',b2b:'Margen de remisiones: facturado a tiendas menos costo congelado, antes de gastos.',aliados:'Utilidad del negocio Aliados: canales tiendas propias y terceros. Fuente: Liquidaciones de PayJoy, ALO Credit y Krediya; antes de gastos generales.'};
  const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const shiftDay=(value,days)=>{const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
  function series(rows,now=new Date(),period=credits.month(now)){
    const today=[day(now),shiftDay(period.end,-1)].sort()[0];
    const count=Math.round((new Date(period.end+'T12:00:00Z')-new Date(period.start+'T12:00:00Z'))/86400000);
    const totals=new Map();let missing=0;
    for(const row of rows){
      const date=day(row.date);if(date<period.start||date>today)continue;
      if(row.value===null||row.value===undefined||row.value===''||!Number.isFinite(Number(row.value))){missing++;continue;}
      totals.set(date,(totals.get(date)||0)+Number(row.value));
    }
    const dates=Array.from({length:count},(_,i)=>shiftDay(period.start,i));
    let total=0;const values=dates.map(date=>{if(date>today)return null;total+=totals.get(date)||0;return total;});
    return {labels:dates.map(date=>date.slice(8)+'/'+date.slice(5,7)),values,total,missing,today,period};
  }
  async function retailData(sb,{start,end,store=''}={}){
    if(!start||!end||start>end)throw Error('Rango Retail inválido');
    const filter=q=>{q=q.gte('fecha',start).lte('fecha',end);return store?q.eq('tienda_codigo',store):q;};
    const sales=await credits.allRows(sb,'ventas','id,fecha,tienda_codigo,tipo,total','id',q=>filter(q.eq('anulada',false)));
    const bySale=new Map(sales.map(s=>[s.id,s]));
    const seenSales=new Set();
    const itemRows=[];
    // Mantener el filtro IN por debajo del límite de URL de PostgREST.
    for(let from=0;from<sales.length;from+=200){
      const ids=sales.slice(from,from+200).map(s=>s.id);
      const items=await credits.allRows(sb,'venta_items_lectura','id,venta_id,utilidad','id',q=>q.in('venta_id',ids));
      for(const item of items){
        const sale=bySale.get(item.venta_id);
        if(!sale)continue;
        seenSales.add(item.venta_id);
        itemRows.push({date:sale.fecha,store:sale.tienda_codigo,value:item.utilidad});
      }
    }
    for(const sale of sales)if(!seenSales.has(sale.id))itemRows.push({date:sale.fecha,store:sale.tienda_codigo,value:null});
    const expenseRows=await credits.allRows(sb,'gastos','id,fecha,tienda_codigo,monto','id',q=>filter(q.eq('estado','aprobado')));
    const expenses=expenseRows.filter(expense=>expense.tienda_codigo!=='CENTRAL');
    const generalExpenses=store?[]:expenseRows.filter(expense=>expense.tienda_codigo==='CENTRAL').map(expense=>({id:expense.id,date:expense.fecha,amount:Number(expense.monto),source:'gastos'}));
    let generalAvailable=true;
    if(!store){
      // RLS de financial_entries permite leer estos pagos solo a sus controladores.
      // Una respuesta vacía para otros perfiles no significa que el gasto sea cero.
      const {data:controller,error:accessError}=await sb.rpc('es_controlador_financiero');
      if(accessError)throw accessError;
      generalAvailable=controller===true;
      if(generalAvailable){
        // Bogotá es UTC-05 todo el año: incluir el día final completo sin usar
        // due_date, que es la fecha prevista y no la fecha del pago con soporte.
        const from=`${start}T05:00:00.000Z`,until=`${shiftDay(end,1)}T05:00:00.000Z`;
        const paid=await credits.allRows(sb,'financial_entries','id,amount,paid_at','id',q=>q.eq('entry_type','gasto').eq('scope','business_general').eq('business_unit','retail').eq('status','pagado').gte('paid_at',from).lt('paid_at',until));
        for(const entry of paid)generalExpenses.push({id:entry.id,date:day(entry.paid_at),amount:Number(entry.amount),source:'financial_entries'});
      }
    }
    const rows=itemRows.slice();
    for(const expense of expenses)rows.push({date:expense.fecha,store:expense.tienda_codigo,value:-Number(expense.monto)});
    for(const expense of generalExpenses)rows.push({date:expense.date,store:'CENTRAL',value:-expense.amount});
    const missing=rows.filter(row=>row.value===null||row.value===undefined||!Number.isFinite(Number(row.value))).length;
    return {sales,expenses,generalExpenses,generalAvailable,itemRows,rows,missing};
  }
  async function rpcRows(sb,period,today){
    const rows=[];
    for(let from=0;;from+=500){
      const {data,error}=await sb.rpc('consultar_utilidad_creditek_rango',{p_desde:period.start,p_hasta:today}).order('margen_id').range(from,from+499);
      if(error)throw error;if(!Array.isArray(data))throw Error('Respuesta incompleta de Resultado B2B');
      rows.push(...data);if(data.length<500)return rows;
    }
  }
  async function load(sb,business,{now=new Date(),store='',creditData,range}={}){
    if(!names[business])throw Error('Negocio no permitido');
    const month=credits.month(now);
    const period=range?{start:range.desde,end:shiftDay(range.hasta,1)}:month;
    if(period.start>=period.end)throw Error('Rango inválido');
    if(period.start>day(now))throw Error('El período aún no tiene datos');
    const today=[day(now),shiftDay(period.end,-1)].sort()[0];let rows=[],budget=null;
    if(business==='retail'){
      if(today>=period.start){
        const retail=await retailData(sb,{start:period.start,end:today,store});
        if(!retail.generalAvailable)throw Error('No se puede mostrar el consolidado sin acceso a los gastos generales Retail');
        rows=retail.rows;
      }
      if(period.start===month.start&&period.end===month.end){
        const budgets=await credits.allRows(sb,'presupuestos','id,meta_utilidad','id',q=>{q=q.gte('fecha',period.start).lt('fecha',period.end);return store?q.eq('tienda_codigo',store):q;});
        if(budgets.length)budget=budgets.reduce((n,p)=>n+Number(p.meta_utilidad||0),0);
      }
    }else if(business==='b2b'){
      rows=(await rpcRows(sb,period,today)).filter(r=>!store||r.tienda_codigo===store).map(r=>({date:r.fecha,value:r.utilidad}));
    }else{
      const data=await (creditData||credits.loadCreditData(sb));
      // Aliados es el negocio completo: ambos canales aportan la utilidad
      // ya calculada por cada motor. No recalcular ni excluir tiendas propias.
      rows=credits.credits(data,period).map(o=>({date:o.operation_at,value:o.utilidad_creditek}));
    }
    return {...series(rows,now,period),business,name:names[business],description:descriptions[business],budget};
  }
  function chartConfig(result,{money,shortMoney,color}){
    return {type:'line',data:{labels:result.labels,datasets:[{label:`${result.name} · ${result.business==='retail'?'resultado operativo':'utilidad'} acumulada`,data:result.values,borderColor:color('--ctk-color-secondary-500'),backgroundColor:color('--ctk-color-secondary-50'),borderWidth:3,pointRadius:0,pointHoverRadius:4,tension:0,fill:'origin',spanGaps:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>money(ctx.parsed.y)}}},scales:{x:{grid:{display:false},border:{display:false},title:{display:true,text:'Fecha'},ticks:{maxRotation:0,maxTicksLimit:8}},y:{beginAtZero:true,grace:'15%',grid:{color:color('--ctk-color-neutral-100')},border:{display:false},ticks:{callback:shortMoney,maxTicksLimit:6}}}}};
  }
  return {load,retailData,series,chartConfig,rpcRows};
});
