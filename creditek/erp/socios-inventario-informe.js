(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.KoraSociosInforme=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value:value?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):null;
 const instant=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T00:00:00-05:00':value;
 function sum(rows,key='utilidad_neta'){
  if(rows.some(r=>r[key]==null||r[key]===''||!Number.isFinite(Number(r[key]))))return null;
  return rows.reduce((n,r)=>n+Math.round(Number(r[key])*100),0)/100;
 }
 function totals(cuts){const valid=cuts.filter(c=>c.listo),pending=cuts.filter(c=>!c.listo);return {general:sum(cuts),validated:valid.length?sum(valid):null,pending:sum(pending),validCount:valid.length,pendingCount:pending.length};}
 function sales(cut,rows){
  const start=date(cut.inicio_at),end=date(cut.fin_at);
  return rows.filter(r=>!r.anulada&&r.tienda_codigo===cut.tienda_codigo&&new Date(r.created_at)>=new Date(instant(cut.inicio_at))&&new Date(r.created_at)<new Date(instant(cut.fin_at))&&r.fecha!==date(r.created_at)).map(r=>{
   const blocks=!r.fecha||r.fecha<=start||r.fecha>=end;
   return {...r,blocks,cost:!r.venta_items?.length?null:sum((r.venta_items||[]).map(i=>({amount:i.costo_tienda_congelado==null||i.cantidad==null?null:Number(i.costo_tienda_congelado)*Number(i.cantidad)})),'amount')};
  });
 }
 return {sum,totals,sales,instant};
});
