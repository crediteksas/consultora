import {AURA_MODULES} from '../shared/contracts/module-boundary.mjs';
const NOVA_INTENTS=new Set(['AUTHORIZATION','PRE_CREDIT','CUSTOMER_REGISTRATION']);
const CARTERA_INTENTS=new Set(['PAYMENT','DELINQUENCY','PAYMENT_PROMISE','PAYMENT_REPORTED']);
export class AuraChannelRouter{
  route({line,user_type,intent}={}){
    if(line==='SOFIA_CURRENT')return AURA_MODULES.SOFIA;
    if(NOVA_INTENTS.has(intent)&&['RETAIL','ALLY'].includes(user_type))return AURA_MODULES.NOVA;
    if(CARTERA_INTENTS.has(intent))return AURA_MODULES.CARTERA;
    return AURA_MODULES.HUMANO;
  }
}
