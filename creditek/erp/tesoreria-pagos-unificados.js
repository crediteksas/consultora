(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const business={retail:'Retail',b2b:'B2B',aliados:'Aliados',tercerizacion:'Aliados'};
  const approved=row=>row.status==='aprobado'&&!!row.approved_by&&!!row.approved_at&&!row.paid_at&&!row.support_path;
  function account(value){const parts=String(value||'').split(' · ').map(s=>s.trim());return {bank:parts.length===3?parts[0]:'',account_type:parts.length===3?parts[1]:'',account_number:parts.length===3&&/^\d{6,20}$/.test(parts[2])?parts[2]:''};}
  function reportRows(payments,entries,movements,ready){
    const result=payments.filter(p=>p.estado==='programado'&&ready(p).ready).map(p=>({...p,report_ref:`PO-${p.id}`,report_kind:'Liquidación'}));
    for(const row of entries.filter(approved)) result.push({
      id:row.id,report_ref:`FIN-${row.id}`,report_kind:row.category==='nomina'?'Nómina':row.entry_type==='retiro_utilidad'?'Retiro':'Gasto',
      report_business:business[row.business_unit]||row.business_unit,report_date:row.due_date,
      beneficiary_name:row.beneficiary,beneficiary_identification:row.beneficiary_document,bank_snapshot:account(row.destination_account),valor:row.amount,concept:row.concept,
    });
    for(const row of movements.filter(r=>r.direction==='debit'&&r.status==='programado'&&r.authorized_by&&!r.paid_at&&!r.support_path)) result.push({
      id:row.id,report_ref:`TM-${row.id}`,report_kind:'Gasto de Tesorería',report_business:business[row.unit]||row.unit,report_date:row.movement_date,
      beneficiary_name:row.beneficiary,beneficiary_identification:row.beneficiary_document,bank_snapshot:account(row.destination_account),valor:row.amount,concept:row.concept,
    });
    const seen=new Set();return result.filter(row=>{if(seen.has(row.report_ref))return false;seen.add(row.report_ref);return true;});
  }
  function cards(entries,money){return entries.filter(approved).map(row=>`<article class="preparation-card"><h3>${esc(row.concept)}</h3><p>${esc(business[row.business_unit]||row.business_unit)} · ${esc(row.due_date)} · ${esc(row.category==='nomina'?'Nómina':'Gasto / retiro')}</p><p><strong>${esc(row.beneficiary)}</strong> · ${esc(row.beneficiary_document)}</p><p>Cuenta destino: ${esc(row.destination_account||'No informada')}</p><p>Valor: <strong>${esc(money(row.amount))}</strong></p><p class="approval-ok">Autorizado · pendiente de pago y soporte. No requiere otra aprobación.</p><div class="actions"><button class="btn primary" data-financial-support="${esc(row.id)}">Adjuntar soporte y registrar pago</button></div></article>`).join('');}
  function createRecorder(sb){
    const busy=new Set(),attempts=new Map();
    const read=async id=>{const r=await sb.from('financial_entries').select('*').eq('id',id).single();if(r.error)throw r.error;return r.data;};
    async function record(id,file){
      if(busy.has(id))throw new Error('El soporte ya se está procesando.');
      busy.add(id);
      try{
        const row=await read(id),previous=attempts.get(id);
        if(row.status==='pagado'&&previous&&row.support_path===previous)return row;
        if(!approved(row))throw new Error('El gasto ya fue pagado o no está aprobado. Actualiza Tesorería.');
        const mime={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'};
        if(!file||!mime[file.type]||!file.size||file.size>10*1024*1024)throw new Error('Selecciona un PDF, JPG o PNG de hasta 10 MB.');
        // Keep an uncertain attempt's support. Never delete evidence after a lost RPC response.
        let path=previous;
        if(!path){path=`finanzas/${root.crypto.randomUUID()}.${mime[file.type]}`;const upload=await sb.storage.from('soportes').upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;attempts.set(id,path);}
        const result=await sb.rpc('finanzas_registrar_pago',{p_id:id,p_support_path:path});
        if(!result.error&&result.data?.status==='pagado'&&result.data?.support_path===path)return result.data;
        const confirmed=await read(id);
        if(confirmed.status==='pagado'&&confirmed.support_path===path)return confirmed;
        throw result.error||new Error('No se confirmó el pago. Conservamos el soporte; actualiza antes de reintentar.');
      }catch(error){
        // A network exception may happen after the server committed the payment.
        if(attempts.has(id)){try{const confirmed=await read(id);if(confirmed.status==='pagado'&&confirmed.support_path===attempts.get(id))return confirmed;}catch{}}
        throw error;
      }finally{busy.delete(id);}
    }
    return {record};
  }
  const api={approved,account,reportRows,cards,createRecorder};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CreditekPagosUnificados=api;
})(typeof window==='undefined'?globalThis:window);
