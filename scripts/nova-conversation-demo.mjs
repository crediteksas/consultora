import {NovaAuthorizationConversation} from '../src/nova/application/authorization-conversation.mjs';
import {createNovaSandboxIdentityResolver} from '../src/nova/identity/identity-resolver.mjs';
import {MemoryAuthorizationRepository} from '../src/nova/repositories/memory-authorization-repository.mjs';
import {MemoryAudit} from '../src/nova/audit/memory-audit.mjs';

const fixtures=new Map([['CLEAN',{id:'C_CLEAN'}],['YELLOW',{id:'C_YELLOW'}],['RED',{id:'C_RED'}],['OFFLINE',{id:'C_OFFLINE'}]]);
let sequence=0;
const conversation=new NovaAuthorizationConversation({
  identities:createNovaSandboxIdentityResolver(),
  searchCustomer:async query=>fixtures.get(query)||null,
  createCustomer:async()=>({id:'C_NEW'}),
  listSales:async()=>[{platform:'PayJoy',channel:'RETAIL',status:'OK'}],
  runPayJoy:async id=>id==='C_RED'?{available:true,match:true,contract_present:true,remaining_balance:1,payment_history_available:true,payment_count:0,signal:'RED',reason_code:'ACTIVE_BALANCE_WITHOUT_OBSERVED_PAYMENTS'}:id==='C_YELLOW'?{available:true,match:true,contract_present:true,remaining_balance:1,payment_history_available:false,payment_count:0,signal:'YELLOW',reason_code:'INCOMPLETE_EVIDENCE'}:id==='C_OFFLINE'?{available:false,match:false,signal:'YELLOW',reason_code:'PAYJOY_UNAVAILABLE'}:{available:true,match:true,contract_present:true,remaining_balance:0,payment_history_available:true,payment_count:3,last_payment_at:'SANDBOX',signal:'GREEN',reason_code:'PAYMENT_HISTORY_OBSERVED'},
  collectionsReader:{read:async()=>({has_active_issue:false,collections_signal:'CLEAR',updated_at:'SANDBOX'})},
  authorizations:new MemoryAuthorizationRepository(),audit:new MemoryAudit(),clock:()=>new Date('2026-08-27T12:00:00Z'),idFactory:()=>`AUTH-SANDBOX-${++sequence}`
});

const cases=[
  ['Retail autorizado + cliente limpio',{sender:'SANDBOX_RETAIL_01',customer_query:'CLEAN'}],
  ['Retail autorizado + PayJoy yellow',{sender:'SANDBOX_RETAIL_01',customer_query:'YELLOW'}],
  ['Retail autorizado + PayJoy red signal',{sender:'SANDBOX_RETAIL_01',customer_query:'RED'}],
  ['Aliado autorizado',{sender:'SANDBOX_ALLY_01',customer_query:'CLEAN'}],
  ['Usuario no autorizado',{sender:'SANDBOX_UNKNOWN',customer_query:'CLEAN'}],
  ['Cliente nuevo',{sender:'SANDBOX_RETAIL_01',customer_query:'NEW',new_customer:{consent_status:'GRANTED'}}],
  ['PayJoy no disponible',{sender:'SANDBOX_RETAIL_01',customer_query:'OFFLINE'}],
  ['Revisión humana',{sender:'SANDBOX_RETAIL_01',customer_query:'YELLOW'}]
];

console.log('NOVA AUTHORIZATION CONVERSATION — SANDBOX · SIN PII · SIN ENVÍOS');
for(const[label,input]of cases){const result=await conversation.requestAuthorization(input);console.log(`${label}: ${result.recommendation||result.action||result.status}`);}
console.log('REAL WHATSAPP MESSAGES: 0 · FINAL AUTOMATIC DECISIONS: 0');
