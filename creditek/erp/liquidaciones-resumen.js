(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CreditekLiquidacionesResumen=api;
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  function periodos(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const value=type=>parts.find(p=>p.type===type).value;
    const hoy=`${value('year')}-${value('month')}-${value('day')}`;
    const monday=new Date(hoy+'T12:00:00Z');
    monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
    const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6);
    return {hoy,mesDesde:hoy.slice(0,7)+'-01',semanaDesde:monday.toISOString().slice(0,10),semanaHasta:sunday.toISOString().slice(0,10),mesEtiqueta:new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',month:'long',year:'numeric'}).format(now)};
  }
  const cerrada=b=>Boolean(b.approved_at)||['aprobada','programada','pagada','conciliada','cerrada'].includes(b.estado);
  function utilidadMes(batches,periodo){
    const rows=batches.filter(b=>cerrada(b)&&b.estado!=='anulada'&&b.fecha_corte>=periodo.mesDesde&&b.fecha_corte<=periodo.hoy);
    const faltantes=rows.filter(b=>b.total_utilidad_creditek==null||!Number.isFinite(Number(b.total_utilidad_creditek))).length;
    return {cantidad:rows.length,faltantes,total:faltantes?null:rows.reduce((n,b)=>n+Number(b.total_utilidad_creditek),0)};
  }
  function deSemana(batch,periodo){return batch.fecha_corte>=periodo.semanaDesde&&batch.fecha_corte<=periodo.semanaHasta;}
  return {periodos,utilidadMes,deSemana};
});
