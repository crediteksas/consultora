import {NOVA_MENU,UNAUTHORIZED_MESSAGE} from '../conversation/menu.mjs';
import {AuthorizationEngine,AUTH_RECOMMENDATION} from '../domain/authorization-engine.mjs';
import {createAuthorizationReviewCase} from '../domain/authorization-review-case.mjs';
import {createPlatformAuthorizationCheck,pendingPlatformChecks,PLATFORM_AVAILABILITY} from '../platform-checks/platform-authorization-check.mjs';

const statusLabel=status=>({OPEN:'PENDIENTE',APPROVED:'APROBADA',DENIED:'NO APROBADA',CANCELLED:'CANCELADA'}[status]||'PENDIENTE');

export class NovaAuthorizationConversation{
  constructor({identities,searchCustomer,createCustomer,listSales,runPayJoy,collectionsReader,authorizations,audit,engine=new AuthorizationEngine(),clock=()=>new Date(),idFactory=()=>`AUTH-${Date.now()}`}={}){
    Object.assign(this,{identities,searchCustomer,createCustomer,listSales,runPayJoy,collectionsReader,authorizations,audit,engine,clock,idFactory});
  }

  identify(input){return this.identities.resolve(input);}
  start(input){const identity=this.identify(input);return identity.authorized?{authorized:true,identity,menu:NOVA_MENU}:{authorized:false,destination:'HUMAN',action:'DENY',message:UNAUTHORIZED_MESSAGE};}

  async requestAuthorization({sender,internal_user_id,customer_query,new_customer}={}){
    const started=this.start({phone:sender,internal_user_id});
    if(!started.authorized)return started;
    const requester=started.identity,now=this.clock().toISOString(),authorizationId=this.idFactory();
    this.audit.record('AUTH_REQUEST_CREATED',authorizationId);
    let customer=await this.searchCustomer(customer_query);
    let customerState='FOUND';
    if(customer)this.audit.record('CUSTOMER_FOUND',customer.id);
    else{
      if(!new_customer?.consent_status||new_customer.consent_status!=='GRANTED')return{authorized:true,status:'CONSENT_REQUIRED',message:'Se requiere autorización de tratamiento y consulta.'};
      customer=await this.createCustomer({...new_customer,store:new_customer.store||requester.store_id,ally_id:new_customer.ally_id||requester.ally_id,consent_timestamp:new_customer.consent_timestamp||now,consent_source:new_customer.consent_source||'NOVA_SANDBOX'});
      customerState='NEW';this.audit.record('CUSTOMER_CREATED',customer.id);
    }
    const sales=await this.listSales(customer.id);
    this.audit.record('PLATFORM_CHECK_STARTED',customer.id);
    let payjoyRaw;
    try{payjoyRaw=await this.runPayJoy(customer.id);}catch{payjoyRaw={available:false,match:false,signal:'YELLOW',reason_code:'PAYJOY_UNAVAILABLE',checked_at:now};}
    const payjoy=createPlatformAuthorizationCheck({platform:'PAYJOY',match:payjoyRaw.match,contract_status:payjoyRaw.contract_present?'ACTIVE':'UNKNOWN',balance:payjoyRaw.remaining_balance,payment_history:payjoyRaw.payment_history_available?{count:payjoyRaw.payment_count,last_payment_at:payjoyRaw.last_payment_at}:null,signal:payjoyRaw.signal||'YELLOW',reason_codes:[payjoyRaw.reason_code||'PAYJOY_UNAVAILABLE'],checked_at:payjoyRaw.checked_at||now,availability:payjoyRaw.available===false?PLATFORM_AVAILABILITY.UNAVAILABLE:PLATFORM_AVAILABILITY.REAL});
    this.audit.record('PLATFORM_CHECK_COMPLETED',customer.id);
    const platformChecks=[payjoy,...pendingPlatformChecks()];
    const collections=await this.collectionsReader.read(customer.id);
    const evaluation=this.engine.evaluate({customer_profile:customer,creditek_history:{status:sales.some(sale=>sale.status==='REVIEW')?'REVIEW':'OK',retail:sales.filter(sale=>sale.channel==='RETAIL').length,allies:sales.filter(sale=>sale.channel==='ALLY').length},platform_checks:platformChecks,collections_status:collections,request_context:{requester}});
    this.audit.record('AUTH_SIGNAL_CREATED',customer.id);this.audit.record('AUTH_RECOMMENDATION_CREATED',authorizationId);
    const request={id:authorizationId,customer_id:customer.id,requester_id:internal_user_id||sender,requester_role:requester.role,store_id:requester.store_id,ally_id:requester.ally_id,customer_state:customerState,sales_count:sales.length,platforms:[...new Set(sales.map(s=>s.platform))],collections,platform_checks:platformChecks,recommendation:evaluation.recommendation,reason_codes:evaluation.reason_codes,status:'OPEN',created_at:now,final_decision:null};
    this.authorizations.save(request);
    if(evaluation.recommendation!==AUTH_RECOMMENDATION.CONTINUE){const review=createAuthorizationReviewCase({id:`REV-${authorizationId}`,customer_id:customer.id,requester_id:request.requester_id,store_id:request.store_id,ally_id:request.ally_id,signals:platformChecks.map(check=>`${check.platform}:${check.signal}`),reason_codes:evaluation.reason_codes,created_at:now});this.authorizations.saveReview(review);this.audit.record('MANUAL_REVIEW_CREATED',review.id);}
    return this.present(request);
  }

  present(request){return{authorization_id:request.id,customer:request.customer_state,previous_sales:request.sales_count,platforms:request.platforms,creditek_history:request.reason_codes.includes('CREDITEK_HISTORY_REVIEW')?'REVISAR':'OK',collections:request.collections.has_active_issue?'REVISAR':request.collections.updated_at?'SIN NOVEDAD':'NO DISPONIBLE',checks:Object.fromEntries(request.platform_checks.map(check=>[check.platform,check.availability==='PENDING_ADAPTER'?'NO DISPONIBLE':check.signal==='RED'?'SEÑAL ALTA':check.signal==='GREEN'?'OK':'REVISAR'])),recommendation:request.recommendation,reason_codes:request.reason_codes,final_decision:null};}
  consultAuthorization(query){const request=this.authorizations.find(query);return request?{found:true,authorization_id:request.id,status:statusLabel(request.status),recommendation:request.recommendation}:{found:false,status:'NO ENCONTRADA'};}
}
