(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CreditekReversiones=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const negative=v=>v==null||v===''?null:-Number(v);
  const key=o=>o.reversion_id?`reversion|${o.reversion_id}`:o.external_id?`${o.plataforma}|${String(o.external_id).trim().toLowerCase()}`:`operation|${o.id}`;
  function entries(reversions){
    return (reversions||[]).filter(r=>r.tipo==='reversion_liquidada').map(r=>{
      const original=r.snapshot.original,c=r.snapshot.calculo;
      if(!original||!c)throw new Error('Reversión sin cálculo original: no se presenta un informe parcial.');
      return {...original,id:`reversion|${r.id}`,reversion_id:r.id,original_operation_id:original.id,
        liquidation_id:r.liquidation_id,operation_at:`${r.fecha}T12:00:00-05:00`,resultado_cerrado:0,reconocida:true,
        monto_base:negative(original.monto_base),monto_credito:negative(original.monto_credito),
        valor_comercial:negative(original.valor_comercial),inicial:negative(original.inicial),
        pagamos:negative(c.pagamos),pago_aliado:negative(c.pago_aliado),pago_neto_beneficiario:negative(c.pago_aliado),
        bonos_aplicados:negative(c.total_bonos),utilidad_creditek:negative(c.utilidad_creditek),
        policy_snapshot:{krediya_v2:{...c.policy_snapshot,
          provision:negative(c.policy_snapshot.provision),gasto_financiero:negative(c.policy_snapshot.gasto_financiero)}},
      };
    });
  }
  function reportingOperations(operations,reversions){
    const voided=new Set((reversions||[]).filter(r=>r.tipo==='sin_desembolso').flatMap(r=>[r.original_operation_id,r.cancellation_operation_id]));
    const records=new Map();
    // A follow-up import must never replace a previously calculated sale.
    const score=o=>(o.utilidad_creditek!=null?4:0)+(o.reconocida?2:0)+(o.normalized_data?.seguimientoPagoKrediya?0:1);
    for(const o of operations||[]){
      if(voided.has(o.id))continue;
      const k=key(o),prev=records.get(k);
      if(!prev||score(o)>score(prev))records.set(k,o);
    }
    // Tracking records have no accrued amount and are shown in Novedades,
    // not as credits with missing profitability in the financial statement.
    return [...records.values()].filter(o=>!o.normalized_data?.seguimientoPagoKrediya||o.utilidad_creditek!=null).concat(entries(reversions));
  }
  function bonusEntries(reversions){
    return (reversions||[]).filter(r=>r.tipo==='reversion_liquidada').flatMap(r=>(r.snapshot.bonos||[])
      .filter(b=>!['anulado','rechazado'].includes(b.estado)).map(b=>({...b,
        id:`reversion|${r.id}|${b.id}`,operation_id:`reversion|${r.id}`,liquidation_id:r.liquidation_id,
        valor:negative(b.valor),estado:'aprobado',reversion_id:r.id,motivo:'Reversión de bono por anulación; no es un nuevo pago',
      })));
  }
  const creditCount=ops=>(ops||[]).reduce((n,o)=>n+(o.reversion_id?-1:1),0);
  return {entries,reportingOperations,bonusEntries,creditCount,key};
});
