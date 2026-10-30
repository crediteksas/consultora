import {createReferenceQuickReply} from './reference-quick-reply.mjs';
import {REFERENCE_TEMPLATE_V1,REFERENCE_TEMPLATE,referenceTemplateMessageComponents} from './meta-preflight.mjs';

// Prepare everything before claiming the persistent send slot. A local
// configuration/validation failure must not create an uncertain Meta attempt.
export async function buildReferenceInvitationTemplate({health,name,context,secret,now,makeInvitation}) {
  if(!health?.ready)throw Error('REFERENCE_TEMPLATE_NOT_READY');
  if(health.selectedVersion==='v2'&&health.selectedReference===REFERENCE_TEMPLATE.name) {
    const payloads=await Promise.all(['start','decline'].map(action=>createReferenceQuickReply({context,action,secret,now})));
    return {name:health.selectedReference,language:{code:'es_CO'},components:referenceTemplateMessageComponents(name,payloads,health.headerUrl)};
  }
  if(health.selectedVersion!=='v1'||health.selectedReference!==REFERENCE_TEMPLATE_V1.name||typeof makeInvitation!=='function')throw Error('REFERENCE_TEMPLATE_NOT_READY');
  const invite=await makeInvitation(context,secret,now);
  return {name:REFERENCE_TEMPLATE_V1.name,language:{code:'es_CO'},components:[{type:'body',parameters:[{type:'text',text:name},{type:'text',text:invite.url}]}]};
}
