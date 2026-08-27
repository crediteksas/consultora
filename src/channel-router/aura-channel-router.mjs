import {CHANNEL_DESTINATION,CHANNEL_INTENT,createChannelMessage,createRouteDecision} from './contracts.mjs';
import {INTERNAL_NOVA_ROLES} from './identity-directory.mjs';
import {classifyChannelIntent} from './intent-classifier.mjs';
const NOVA_INTENTS=new Set([CHANNEL_INTENT.REQUEST_AUTHORIZATION,CHANNEL_INTENT.CONSULT_CUSTOMER,CHANNEL_INTENT.VALIDATE_CREDIT,CHANNEL_INTENT.AUTHORIZATION_STATUS]);
const CARTERA_INTENTS=new Set([CHANNEL_INTENT.CONSULT_INSTALLMENT,CHANNEL_INTENT.PAYMENT_REPORTED,CHANNEL_INTENT.PAYMENT_METHODS,CHANNEL_INTENT.PAYMENT_DIFFICULTY]);
export class AuraChannelRouter{
  constructor({identities,classifier=classifyChannelIntent,newLine='AURA_NOVA_CARTERA_SANDBOX'}={}){this.identities=identities;this.classifier=classifier;this.newLine=newLine;}
  route(input={}){
    const message=createChannelMessage(input);
    if(message.channel==='SOFIA_CURRENT')return createRouteDecision({destination:CHANNEL_DESTINATION.UNKNOWN,reason_code:'SOFIA_OUT_OF_SCOPE'});
    if(message.channel!==this.newLine)return createRouteDecision({destination:CHANNEL_DESTINATION.UNKNOWN,reason_code:'CHANNEL_NOT_RECOGNIZED'});
    const identity=this.identities?.resolve(message)||{sender_type:'unknown',role:'unknown',authorized:false};
    const classified=this.classifier(message);
    if(classified.intent===CHANNEL_INTENT.TALK_TO_ADVISOR)return createRouteDecision({destination:CHANNEL_DESTINATION.HUMAN,reason_code:'HUMAN_REQUESTED',confidence:classified.confidence,intent:classified.intent});
    if(NOVA_INTENTS.has(classified.intent)){
      if(identity.authorized&&INTERNAL_NOVA_ROLES.includes(identity.role))return createRouteDecision({destination:CHANNEL_DESTINATION.NOVA,reason_code:'AUTHORIZED_INTERNAL_NOVA_INTENT',confidence:classified.confidence,intent:classified.intent});
      return createRouteDecision({destination:CHANNEL_DESTINATION.HUMAN,reason_code:'NOVA_IDENTITY_DENIED',confidence:classified.confidence,intent:classified.intent});
    }
    if(CARTERA_INTENTS.has(classified.intent)){
      if(identity.sender_type==='external_customer')return createRouteDecision({destination:CHANNEL_DESTINATION.CARTERA,reason_code:'EXTERNAL_CUSTOMER_CARTERA_INTENT',confidence:classified.confidence,intent:classified.intent});
      return createRouteDecision({destination:CHANNEL_DESTINATION.HUMAN,reason_code:'CARTERA_IDENTITY_REVIEW',confidence:classified.confidence,intent:classified.intent});
    }
    return createRouteDecision({destination:CHANNEL_DESTINATION.UNKNOWN,reason_code:'INTENT_NOT_RECOGNIZED',confidence:classified.confidence,intent:classified.intent});
  }
}
