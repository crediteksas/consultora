export const CHANNEL_WORKER_MODE=Object.freeze({SANDBOX:'SANDBOX'});

export function normalizeInboundMessage(value={}){
  return Object.freeze({
    channel:'AURA_NOVA_CARTERA_SANDBOX',
    message_id:String(value.message_id||''),
    sender:String(value.sender||''),
    sender_type:value.sender_type||'unknown',
    text:String(value.text||''),
    received_at:value.received_at||new Date().toISOString()
  });
}

export function createWorkerResult({status=200,body={}}={}){
  return Object.freeze({status,body:Object.freeze({...body})});
}
