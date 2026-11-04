// Server-only transport. Importing this module performs no network operations.
export const EXPRESS_SMS_ENDPOINT = 'https://api.inalambria.express/v1/messages/send';
export const EXPRESS_SMS_ESTIMATED_COST_COP = 39;
const expressSmsPreparedRequests = new WeakMap();
const EXPRESS_SMS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPRESS_SMS_JOB_ID = /^job_[A-Za-z0-9_-]{6,120}$/;

function expressSmsResult(status,reason,extra={}) {
  return Object.freeze({provider:'inalambria_express',status,reason,acceptance:null,providerMessageId:null,estimatedCostCOP:EXPRESS_SMS_ESTIMATED_COST_COP,reportedCostCOP:null,reportedCredits:null,costObservation:'not_reported',httpStatus:null,...extra});
}

export function prepareExpressSms(env,{phone,code}={}) {
  const apiKey=env?.INALAMBRIA_SMS_API_KEY;
  if(typeof apiKey!=='string'||apiKey.length<16||apiKey.length>1024||!/^sk_(?:live|test)_[A-Za-z0-9_-]+$/.test(apiKey))throw Error('EXPRESS_SMS_CONFIG_INVALID');
  if(typeof phone!=='string'||!/^\+573\d{9}$/.test(phone))throw Error('EXPRESS_SMS_PHONE_INVALID');
  if(typeof code!=='string'||!/^\d{6}$/.test(code))throw Error('EXPRESS_SMS_CODE_INVALID');
  const content='Creditek: tu codigo es '+code+'. Vence en 5 minutos. No lo compartas.';
  if(!/^[\x20-\x7e]+$/.test(content)||new TextEncoder().encode(content).byteLength>160)throw Error('EXPRESS_SMS_TEXT_INVALID');
  const body=JSON.stringify({recipients:[phone],content,async:false});
  if(new TextEncoder().encode(body).byteLength>512)throw Error('EXPRESS_SMS_REQUEST_INVALID');
  const prepared=Object.freeze({provider:'inalambria_express',estimatedCostCOP:EXPRESS_SMS_ESTIMATED_COST_COP,segments:1});
  // Keep destination, OTP and key out of serialized plans and normalized results.
  // The caller reserves its durable send/budget record after prepare succeeds.
  expressSmsPreparedRequests.set(prepared,{apiKey,body});
  return prepared;
}

async function expressSmsBoundedJson(response) {
  if(Number(response.headers.get('content-length'))>16384)throw Error('PROVIDER_RESPONSE_TOO_LARGE');
  if(!response.body)throw Error('PROVIDER_RESPONSE_INVALID');
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>16384)throw Error('PROVIDER_RESPONSE_TOO_LARGE');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

function expressSmsFinancialObservation(body) {
  const hasAmount=Object.prototype.hasOwnProperty.call(body,'amount');
  const amount=hasAmount&&typeof body.amount==='number'&&Number.isFinite(body.amount)&&body.amount>=0&&body.amount<=Number.MAX_SAFE_INTEGER&&(body.currency===undefined||body.currency==='COP')?body.amount:null;
  return {reportedCostCOP:amount,reportedCredits:Number.isSafeInteger(body.credits)&&body.credits>=0?body.credits:null,costObservation:!hasAmount?'not_reported':amount===null?'uninterpretable':amount>EXPRESS_SMS_ESTIMATED_COST_COP?'above_estimate':'within_estimate'};
}

export async function sendPreparedExpressSms(prepared,{fetcher=fetch}={}) {
  const request=prepared&&typeof prepared==='object'?expressSmsPreparedRequests.get(prepared):null;
  if(!request)return expressSmsResult('uncertain','PREPARED_REQUEST_INVALID_OR_CONSUMED');
  // Consume before networking. A second call cannot accidentally resend this plan.
  // This is not provider/distributed idempotency; durable reservation is upstream.
  expressSmsPreparedRequests.delete(prepared);
  let response;
  try{
    response=await fetcher(EXPRESS_SMS_ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+request.apiKey,'content-type':'application/json',accept:'application/json'},body:request.body,redirect:'manual',signal:AbortSignal.timeout(8000)});
  }catch(error){return expressSmsResult('uncertain',['TimeoutError','AbortError'].includes(error?.name)?'PROVIDER_TIMEOUT':'PROVIDER_NETWORK_UNCONFIRMED');}
  const httpStatus=response.status;
  if(httpStatus>=400&&httpStatus<500){await response.body?.cancel().catch(()=>{});return expressSmsResult('failed',[401,403].includes(httpStatus)?'PROVIDER_AUTH_REJECTED':httpStatus===429?'PROVIDER_RATE_REJECTED':'PROVIDER_REQUEST_REJECTED',{httpStatus});}
  if(httpStatus>=300&&httpStatus<400){await response.body?.cancel().catch(()=>{});return expressSmsResult('uncertain','PROVIDER_REDIRECT_REFUSED',{httpStatus});}
  if(httpStatus>=500){await response.body?.cancel().catch(()=>{});return expressSmsResult('uncertain','PROVIDER_SERVER_UNCONFIRMED',{httpStatus});}
  if(httpStatus!==200&&httpStatus!==202){await response.body?.cancel().catch(()=>{});return expressSmsResult('uncertain','PROVIDER_RESPONSE_STATUS_UNCONFIRMED',{httpStatus});}
  let body;
  try{body=await expressSmsBoundedJson(response);}catch(error){return expressSmsResult('uncertain',error?.message==='PROVIDER_RESPONSE_TOO_LARGE'?'PROVIDER_RESPONSE_TOO_LARGE':['TimeoutError','AbortError'].includes(error?.name)?'PROVIDER_TIMEOUT':'PROVIDER_RESPONSE_INVALID',{httpStatus});}
  if(!body||typeof body!=='object'||Array.isArray(body))return expressSmsResult('uncertain','PROVIDER_RESPONSE_INVALID',{httpStatus});
  const finance=expressSmsFinancialObservation(body);
  if(httpStatus===200&&body.ok===true&&EXPRESS_SMS_UUID.test(body.consumptionId||'')&&body.messages===1&&Number.isSafeInteger(body.credits)&&body.credits>=0)return expressSmsResult('accepted','PROVIDER_ACCEPTED',{...finance,httpStatus,acceptance:'processed',providerMessageId:body.consumptionId});
  // 202 confirms admission to a job, not processing, delivery or OTP verification.
  if(httpStatus===202&&body.ok===true&&typeof body.jobId==='string'&&EXPRESS_SMS_JOB_ID.test(body.jobId)&&(body.messages===undefined||body.messages===1))return expressSmsResult('accepted','PROVIDER_QUEUED',{...finance,httpStatus,acceptance:'queued',providerMessageId:body.jobId});
  const providerMessageId=typeof body.consumptionId==='string'&&EXPRESS_SMS_UUID.test(body.consumptionId)?body.consumptionId:typeof body.jobId==='string'&&EXPRESS_SMS_JOB_ID.test(body.jobId)?body.jobId:null;
  return expressSmsResult('uncertain','PROVIDER_ACCEPTANCE_UNCONFIRMED',{...finance,httpStatus,providerMessageId});
}
