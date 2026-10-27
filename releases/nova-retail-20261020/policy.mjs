// Owner-defined policy. Server-only: never accept this evidence from a browser.
export const POLICY_VERSION = 'retail-20261020-v1';
export const RETAIL_STORES = Object.freeze(Array.from({length:9},(_,i)=>`CK-${String(i+1).padStart(2,'0')}`));
export const VALIDITY_MS = 15 * 86400000;
export const REFERENCE_WAIT_MS = 10 * 60000;
const platforms = ['PAYJOY','ALO','KREDIYA'];
const count = n => Number.isSafeInteger(n) && n >= 0;
const timestamp = v => typeof v === 'number' ? v : Date.parse(v);
const fresh = (at, now) => Number.isFinite(timestamp(at)) && timestamp(at) <= now && now-timestamp(at) < 86400000;
const result = (state, reasons, extra={}) => ({policyVersion:POLICY_VERSION,state,canProcess:state==='authorized',requiresAndrea:state==='review',reasons:[...new Set(reasons)],...extra});

// Each observed platform must certify a complete list of active obligations,
// including an explicit empty list when there is no credit. Money amounts,
// payment-event counts and empty/failed searches are not installment counts.
export function evaluatePlatforms(observations, now=Date.now()) {
  if (!Number.isFinite(now) || !Array.isArray(observations) || observations.length>3 ||
      observations.some(o=>!platforms.includes(o?.platform)) || new Set(observations.map(o=>o.platform)).size!==observations.length)
    return result('review',['invalid_platform_evidence']);
  const reasons=[];
  let successful=0,zero=false;
  for(const o of observations){
    if(o.status!=='observed'||o.identityVerified!==true||!fresh(o.checkedAt,now))continue;
    if(!Array.isArray(o.obligations))continue;
    if(o.obligationsComplete===true)successful++;
    for(const c of o.obligations){
      // A confirmed active zero-payment credit wins even if other details or
      // other obligations in that platform response are incomplete.
      if(c?.active===true&&typeof c.id==='string'&&c.id&&c.paidInstallments===0){zero=true;continue;}
      if(c?.active!==true || typeof c.id!=='string'||!c.id || !count(c.paidInstallments)||!count(c.overdueInstallments)){
        reasons.push('incomplete_payment_history');continue;
      }
      if(c.overdueInstallments>2)reasons.push('more_than_two_overdue');
      else if(c.overdueInstallments>0&&c.paidInstallments<4)reasons.push('overdue_with_less_than_four_paid');
    }
  }
  if(zero)return result('rejected',['zero_payments'],{successfulPlatforms:successful,overrideAllowed:false});
  if(successful<2)reasons.push('fewer_than_two_platforms');
  return result(reasons.length?'review':'authorized',reasons,{successfulPlatforms:successful});
}

export function referenceProgress(reference, now=Date.now()) {
  if(reference?.deliveryFailed===true)return {state:'replace',reason:'delivery_failed'};
  if(reference?.contactDeclined===true||reference?.refusedToAnswer===true)
    return {state:'replace',reason:reference.contactDeclined?'contact_declined':'refused_to_answer',mayContactAgain:false};
  if(reference?.knowsCustomer===false||reference?.contradictory===true)
    return {state:'review',reason:reference.knowsCustomer===false?'does_not_know_customer':'contradictory_information',mayContactAgain:false};
  if(reference?.responded===true)
    return reference.knowsCustomer===true&&reference.relationshipConfirmed===true&&reference.contactConfirmed===true?{state:'approved'}:{state:'review',reason:reference.contactConfirmed!==true?'contact_unconfirmed':reference.relationshipConfirmed!==true?'relationship_unconfirmed':'incomplete_response'};
  const delivered=timestamp(reference?.deliveredAt);
  if(!Number.isFinite(delivered)||delivered>now)return {state:'awaiting_delivery',reason:'awaiting_delivery'};
  return now-delivered>=REFERENCE_WAIT_MS?{state:'replace',reason:'response_timeout'}:{state:'waiting',reason:'awaiting_response',remainingMs:REFERENCE_WAIT_MS-(now-delivered)};
}

export function evaluateApplication(evidence, now=Date.now()) {
  const e=evidence||{};
  if(!RETAIL_STORES.includes(e.storeCode))return result('out_of_scope',['store_not_in_pilot']);
  const last=timestamp(e.lastRejectedAt);
  if(Number.isFinite(last)&&last<=now&&now-last<VALIDITY_MS)
    return result('rejected',['rejection_cooldown'],{overrideAllowed:false});
  const financial=evaluatePlatforms(e.platforms,now);
  if(financial.state==='rejected')return financial;
  const photoTypes=['frente','reverso','selfie'];
  const photoPending=photoTypes.filter(t=>!['auto_approved','andrea_approved'].includes(e.photos?.[t]?.status));
  const references=Array.isArray(e.references)?e.references:[];
  const normalized=v=>String(v||'').replace(/[^0-9]/g,'').replace(/^57(?=3\d{9}$)/,'');
  const phones=references.map(r=>normalized(r.phone));
  if(references.length!==2||references.filter(r=>r.type==='family').length!==1||references.filter(r=>r.type==='personal').length!==1||
      phones.some(p=>!/^3\d{9}$/.test(p)||p===normalized(e.customerPhone))||new Set(phones).size!==2)
    return result('correct',['invalid_references']);
  const refStates=references.map(r=>referenceProgress(r,now).state);
  const reviewReasons=[...financial.reasons];
  if(photoPending.some(t=>e.photos?.[t]?.status==='manual_pending'))reviewReasons.push('photo_manual_review');
  if(refStates.includes('review'))reviewReasons.push('reference_observation');
  if(reviewReasons.length)return result('review',reviewReasons);
  if(photoPending.length)return result('correct',['photo_correction']);
  if(refStates.includes('replace'))return result('correct',['replace_reference']);
  if(refStates.some(s=>s!=='approved'))return result('waiting',['waiting_references']);
  if(e.deliveryRequested===true&&e.queriesMadeForDelivery!==true)return result('review',['delivery_requery_required']);
  return result('authorized',[]);
}

// Internal reasons never enter the store/customer result payload.
export function storeResult(decision){
  return {status:decision.state==='authorized'?'Autorizado para tramitar':decision.state==='rejected'?'Rechazado':decision.state==='review'?'En revisión de Andrea':decision.state==='waiting'?'Esperando respuesta de referencias':'Completar registro'};
}
