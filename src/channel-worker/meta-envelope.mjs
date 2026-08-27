import {normalizeInboundMessage} from './contracts.mjs';

export function readMetaMessages(payload={}){
  const output=[];
  for(const entry of payload.entry||[]){
    for(const change of entry.changes||[]){
      for(const message of change.value?.messages||[]){
        output.push(normalizeInboundMessage({
          message_id:message.id,
          sender:message.from,
          sender_type:'unknown',
          text:message.text?.body||'',
          received_at:message.timestamp?new Date(Number(message.timestamp)*1000).toISOString():undefined
        }));
      }
    }
  }
  return output;
}
