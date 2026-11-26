import {createHash} from 'node:crypto'
const normalize=value=>typeof value==='string'?value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[*_]/g,'').replace(/\s+/g,' ').trim().toLowerCase():''
export const HISTORY_VERSION='yabot-payment-history-v1'
export function parsePaymentHistory(text) {
 const value=normalize(text)
 if(!value||value.length>8192)return {status:'unrecognized',paidInstallments:null}
 if(/^(?:aun no ha realizado (?:algun|ningun) pago valido|no tiene pagos validos registrados|no hay pagos validos registrados)\.?$/.test(value))
  return {status:'explicit_no_valid_payments',paidInstallments:0}
 const counts=[...value.matchAll(/(?:total de )?cuotas pagadas\s*:\s*(\d{1,4})(?=$|[\s,.;])/g)]
 if(counts.length===1)return {status:'explicit_installment_count',paidInstallments:Number(counts[0][1])}
 return {status:'requires_review',paidInstallments:null}
}
export function makeHistoryEvidence({text,messageId,receivedAt,document,documentMessageId,statementMessageId,contractId},now=Date.now()){
 if(typeof text!=='string'||text.length<1||text.length>8192)throw Error('INVALID_HISTORY')
 if(!/^\d{6,12}$/.test(document||''))throw Error('HISTORY_IDENTITY_REQUIRED')
 for(const id of [messageId,documentMessageId,statementMessageId])if(!/^[-A-Za-z0-9._=]{1,200}$/.test(id||''))throw Error('HISTORY_MESSAGE_REQUIRED')
 const at=Date.parse(receivedAt)
 if(!Number.isFinite(at)||at>now||at<now-300000)throw Error('STALE_HISTORY')
 if(!/^[A-Za-z0-9-]{3,64}$/.test(contractId||''))throw Error('HISTORY_CONTRACT_REQUIRED')
 return {version:HISTORY_VERSION,text,messageId,documentMessageId,statementMessageId,contractId,
  queriedDocumentHash:createHash('sha256').update(document).digest('hex'),
  capturedAt:new Date(at).toISOString(),...parsePaymentHistory(text)}
}
export function enrichWithPaymentHistory(observation,evidence){
 if(evidence.contractId!==observation.providerContractId)throw Error('HISTORY_CONTRACT_MISMATCH')
 const conflict=evidence.paidInstallments===0&&observation.paidAmount>0
 const historyComplete=evidence.paidInstallments!==null&&!conflict
 const active=!['PAGADO','CERRADO'].includes(observation.providerStatus)||observation.remainingBalance>0
 return {...observation,identityStatus:'verified',paymentHistory:evidence,
  obligationsComplete:historyComplete,
  obligations:historyComplete&&active?[{id:observation.providerContractId,active,
    paidInstallments:evidence.paidInstallments,overdueInstallments:observation.overdueInstallments}]:[]}
}
