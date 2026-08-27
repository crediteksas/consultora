export const REVIEW_STATUS=Object.freeze({OPEN:'OPEN',APPROVED:'APPROVED',DENIED:'DENIED',CANCELLED:'CANCELLED'});
export function createAuthorizationReviewCase(value={}){
  return Object.freeze({id:value.id,customer_id:value.customer_id,requester_id:value.requester_id,store_id:value.store_id||null,ally_id:value.ally_id||null,signals:Object.freeze([...(value.signals||[])]),reason_codes:Object.freeze([...(value.reason_codes||[])]),created_at:value.created_at,status:REVIEW_STATUS.OPEN,reviewer:null,decision:null,decision_at:null});
}
