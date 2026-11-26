// Offline preparation only. No browser access, messages, credentials or persistence.
// Reading a valid statement does not prove which NOVA case it belongs to.
import {parseYabotStatement,YABOT_PHONE} from '../krediya/automatizacion/krediya-yabot.mjs';
export const channel={origin:'https://web.whatsapp.com',providerPhone:YABOT_PHONE,mode:'supervised_preparation',automaticSending:false,automaticPersistence:false};
const pending=reason=>({platform:'KREDIYA',readiness:'not_ready',reason,canPersist:false,creditDecision:null,observation:null});
export function prepareVisibleStatement({senderPhone,text,receivedAt}={},now=Date.now()){
 if(senderPhone!==YABOT_PHONE)return pending('WRONG_PROVIDER');
 if(typeof text!=='string'||text.length>8192)return pending('INVALID_CAPTURE');
 // Do not reinterpret OTP challenges, an unrecognized status or no-match as a balance.
 if(/\b(otp|contrase[nñ]a|c[oó]digo de verificaci[oó]n|c[oó]digo de seguridad)\b/i.test(text))return pending('HUMAN_VERIFICATION_REQUIRED');
 const value=parseYabotStatement(text,receivedAt,now);
 if(value.availability!=='observed')return pending(value.reason);
 const {paidAmount,nextPaymentAmount,remainingBalance,overdueAmount,overdueInstallments,dueDate,providerContractId,providerStatus,currency,checkedAt}=value;
 return {platform:'KREDIYA',readiness:'requires_case_binding',reason:'VISIBLE_STATEMENT_IS_NOT_CASE_ASSOCIATION',canPersist:false,creditDecision:null,
 observation:{paidAmount,nextPaymentAmount,remainingBalance,overdueAmount,overdueInstallments,dueDate,providerContractId,providerStatus,currency,checkedAt}};
}
