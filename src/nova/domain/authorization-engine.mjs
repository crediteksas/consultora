export const AUTH_RECOMMENDATION=Object.freeze({CONTINUE:'CONTINUE',MANUAL_REVIEW:'MANUAL_REVIEW',DO_NOT_AUTHORIZE_WITHOUT_REVIEW:'DO_NOT_AUTHORIZE_WITHOUT_REVIEW'});

export class AuthorizationEngine{
  evaluate({creditek_history={},platform_checks=[],collections_status={}}={}){
    const reasons=[];
    const red=platform_checks.filter(check=>check.signal==='RED');
    const unavailable=platform_checks.filter(check=>check.availability==='UNAVAILABLE');
    if(collections_status.has_active_issue)reasons.push('ACTIVE_COLLECTIONS_ISSUE');
    if(red.length)reasons.push(...red.map(check=>`${check.platform}_HIGH_SIGNAL`));
    if(collections_status.has_active_issue||red.length)return Object.freeze({recommendation:AUTH_RECOMMENDATION.DO_NOT_AUTHORIZE_WITHOUT_REVIEW,reason_codes:Object.freeze(reasons),final_decision:null});
    if(creditek_history.status==='REVIEW')reasons.push('CREDITEK_HISTORY_REVIEW');
    if(platform_checks.some(check=>check.signal==='YELLOW'&&check.availability!=='PENDING_ADAPTER'))reasons.push('PLATFORM_EVIDENCE_INCOMPLETE');
    if(unavailable.length)reasons.push('PLATFORM_UNAVAILABLE');
    if(reasons.length)return Object.freeze({recommendation:AUTH_RECOMMENDATION.MANUAL_REVIEW,reason_codes:Object.freeze(reasons),final_decision:null});
    return Object.freeze({recommendation:AUTH_RECOMMENDATION.CONTINUE,reason_codes:Object.freeze(['NO_HIGH_SIGNAL_OBSERVED']),final_decision:null});
  }
}
