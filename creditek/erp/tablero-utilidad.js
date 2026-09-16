(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./tablero-ejecutivos.js'));
  else root.CreditekTableroUtilidad=factory(root.CreditekTableroEjecutivos);
})(typeof globalThis!=='undefined'?globalThis:this,function(credits){
  'use strict';
  const names={retail:'Retail',b2b:'B2B',aliados:'Aliados'};
  const descriptions={retail:'Utilidad de ventas de tiendas, antes de gastos.',b2b:'Margen de remisiones: facturado a tiendas menos costo congelado, antes de gastos.',aliados:'Utilidad del negocio Aliados: canales tiendas propias y terceros. Fuente: Liquidaciones de PayJoy, ALO Credit y Krediya; antes de gastos generales.'};
  const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  function series(rows,now=new Date()){
    const today=day(now),period=credits.month(now);
    const count=Math.round((new Date(period.end+'T12:00:00Z')-new Date(period.start+'T12:00:00Z'))/86400000);
    const totals=new Map();let missing=0;
    for(const row of rows){
      const date=day(row.date);if(date<period.start||date>today)continue;
      if(row.value===null||row.value===undefined||row.value===''||!Number.isFinite(Number(row.value))){missing++;continue;}
      totals.set(date,(totals.get(date)||0)+Number(row.value));
    }
    let total=0;const values=Array.from({length:count},(_,i)=>{const date=period.start.slice(0,8)+String(i+1).padStart(2,'0');if(date>today)return null;total+=totals.get(date)||0;return total;});
    return {labels:values.map((_,i)=>i+1),values,total,missing,today,period};
  }
  async function rpcRows(sb,period,today){
    const rows=[];
    for(let from=0;;from+=500){
      const {data,error}=await sb.rpc('consultar_utilidad_creditek_rango',{p_desde:period.start,p_hasta:today}).order('margen_id').range(from,from+499);
      if(error)throw error;if(!Array.isArray(data))throw Error('Respuesta incompleta de Resultado B2B');
      rows.push(...data);if(data.length<500)return rows;
    }
  }
  async function load(sb,business,{now=new Date(),store='',creditData}={}){
    if(!names[business])throw Error('Negocio no permitido');
    const today=day(now),period=credits.month(now);let rows=[],budget=null;
    const dateFilter=q=>q.gte('fecha',period.start).lte('fecha',today);
    if(business==='retail'){
      const sales=await credits.allRows(sb,'ventas','id,fecha','id',q=>{q=dateFilter(q).eq('anulada',false);return store?q.eq('tienda_codigo',store):q;});
      const dates=new Map(sales.map(s=>[s.id,s.fecha]));
      for(let from=0;from<sales.length;from+=400){
        const ids=sales.slice(from,from+400).map(s=>s.id);
        const items=await credits.allRows(sb,'venta_items_lectura','id,venta_id,utilidad','id',q=>q.in('venta_id',ids));
        rows.push(...items.map(i=>({date:dates.get(i.venta_id),value:i.utilidad})));
      }
      const budgets=await credits.allRows(sb,'presupuestos','id,meta_utilidad','id',q=>{q=q.gte('fecha',period.start).lt('fecha',period.end);return store?q.eq('tienda_codigo',store):q;});
      if(budgets.length)budget=budgets.reduce((n,p)=>n+Number(p.meta_utilidad||0),0);
    }else if(business==='b2b'){
      rows=(await rpcRows(sb,period,today)).filter(r=>!store||r.tienda_codigo===store).map(r=>({date:r.fecha,value:r.utilidad}));
    }else{
      const data=await (creditData||credits.loadCreditData(sb));
      // Aliados es el negocio completo: ambos canales aportan la utilidad
      // ya calculada por cada motor. No recalcular ni excluir tiendas propias.
      rows=credits.credits(data,period).map(o=>({date:o.operation_at,value:o.utilidad_creditek}));
    }
    return {...series(rows,now),business,name:names[business],description:descriptions[business],budget};
  }
  function chartConfig(result,{money,shortMoney,color}){
    return {type:'line',data:{labels:result.labels,datasets:[{label:`${result.name} · utilidad acumulada`,data:result.values,borderColor:color('--ctk-color-secondary-500'),backgroundColor:color('--ctk-color-secondary-50'),borderWidth:3,pointRadius:0,pointHoverRadius:4,tension:0,fill:'origin',spanGaps:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>money(ctx.parsed.y)}}},scales:{x:{grid:{display:false},border:{display:false},title:{display:true,text:'Día del mes'},ticks:{maxRotation:0,maxTicksLimit:8}},y:{beginAtZero:true,grace:'15%',grid:{color:color('--ctk-color-neutral-100')},border:{display:false},ticks:{callback:shortMoney,maxTicksLimit:6}}}}};
  }
  return {load,series,chartConfig,rpcRows};
});
