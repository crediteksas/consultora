import {createWorkerResult} from './contracts.mjs';
import {readMetaMessages} from './meta-envelope.mjs';

export class AuraChannelWorkerSandbox{
  constructor({router,idempotency,verifySignature=async()=>false}={}){
    this.router=router;
    this.idempotency=idempotency;
    this.verifySignature=verifySignature;
    this.realMessagesEnabled=false;
  }

  verifyWebhook(url,verifyToken){
    const query=new URL(url).searchParams;
    const accepted=query.get('hub.mode')==='subscribe'&&query.get('hub.verify_token')===verifyToken;
    return accepted
      ?createWorkerResult({status:200,body:{challenge:query.get('hub.challenge')||''}})
      :createWorkerResult({status:403,body:{error:'WEBHOOK_VERIFICATION_DENIED'}});
  }

  async receive({rawBody='',signature=''}={}){
    if(!await this.verifySignature({rawBody,signature}))return createWorkerResult({status:401,body:{error:'INVALID_SIGNATURE'}});
    let payload;
    try{payload=JSON.parse(rawBody);}catch{return createWorkerResult({status:400,body:{error:'INVALID_JSON'}});}
    const decisions=[];
    for(const message of readMetaMessages(payload)){
      if(!message.message_id||this.idempotency.has(message.message_id))continue;
      this.idempotency.remember(message.message_id);
      decisions.push(this.router.route(message));
    }
    return createWorkerResult({status:200,body:{accepted:decisions.length,decisions,real_messages_sent:0,outbound_enabled:this.realMessagesEnabled}});
  }
}
