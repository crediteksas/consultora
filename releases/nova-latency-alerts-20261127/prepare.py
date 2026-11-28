from pathlib import Path
import json,re,hashlib
root=Path(__file__).resolve().parent
base=(root/'baseline/nova/index.mjs').read_text();s=base
s=s.replace('function storeWorkflow(c,now=Date.now()){',(root/'delay-alerts.js').read_text()+'\nfunction storeWorkflow(c,now=Date.now()){',1)
# Validate the exact existing approved staff template (two body params, one authenticated URL button).
helper=r"""function validateStaffTemplate(template){
 const wanted={ name: "nova_aviso_ejecutivo_v1", language: "es_CO", category: "UTILITY", components: [{ type: "BODY", text: "Hay una actualizaci\xF3n en una solicitud de tu tienda en NOVA.\nReferencia: {{1}}\nActualizaci\xF3n: {{2}}\nAbre la ficha para revisar los resultados y continuar la gesti\xF3n.", example: { body_text: [["NOVA-1234ABCD", "Resultados y referencias actualizados"]] } }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver solicitud", url: "https://aura.crediteksas.com/creditek/agentes/nova-supervision.html?solicitud={{1}}", example: ["https://aura.crediteksas.com/creditek/agentes/nova-supervision.html?solicitud=11111111-1111-4111-8111-111111111111"] }] }] };
 if(!template||template.name!==wanted.name||template.language!==wanted.language||template.category!==wanted.category||template.parameter_format!==undefined&&template.parameter_format!=='POSITIONAL'||template.components?.length!==2)return false;
 const body=template.components[0],buttons=template.components[1];
 return body?.type==='BODY'&&body.text===wanted.components[0].text&&buttons?.type==='BUTTONS'&&buttons.buttons?.length===1&&buttons.buttons[0].type==='URL'&&buttons.buttons[0].text===wanted.components[1].buttons[0].text&&buttons.buttons[0].url===wanted.components[1].buttons[0].url;
}
"""
s=s.replace('async function prepareTemplates(env,',helper+'async function prepareTemplates(env,',1)
s=s.replace('const template = matches[0];','const template = matches[0];\n      if(kind===\"staff\")state.staffContentVerified=validateStaffTemplate(template);',1)
s=s.replace('staffDiagnostic: state?.staffDiagnostic || null','staffContentVerified: state?.staffContentVerified===true, staffDiagnostic: state?.staffDiagnostic || null',1)
# Optional abort for isolated operational scan; unchanged defaults elsewhere.
s=s.replace('{ method = "GET", body, prefer } = {}) {\n    const key4', '{ method = "GET", body, prefer, signal } = {}) {\n    const key4',1)
s=s.replace('signal: AbortSignal.timeout(12e3) }));','signal: signal?AbortSignal.any([signal,AbortSignal.timeout(12e3)]):AbortSignal.timeout(12e3) }));',1)
a=s.index('  async function db(',s.index('function createRetailRuntime('));b=s.index('  __name(db,',a)
db=s[a:b].replace('signal: AbortSignal.timeout(1e4) }','signal: signal?AbortSignal.any([signal,AbortSignal.timeout(1e4)]):AbortSignal.timeout(1e4) }')
s=s[:a]+db+s[b:]
s=s.replace('(env, name, args) => db(env, "kora", "rpc/" + name, { method: "POST", body: args })','(env, name, args, options={}) => db(env, "kora", "rpc/" + name, { method: "POST", body: args, ...options })',1)
s=s.replace('async function source(env, id) {','async function source(env, id, {signal}={}) {',1)
s=s.replace('"&select=*&limit=1");\n    if (rows.length !== 1', '"&select=*&limit=1",{signal});\n    if (rows.length !== 1',1)
s=s.replace('"kora_nova_effective_references", { p_source: id });','"kora_nova_effective_references", { p_source: id },{signal});',1)
s=s.replace('"nova_retail_consent_current", { p_source: id });','"nova_retail_consent_current", { p_source: id },{signal});',1)
s=s.replace('checked_at,updated_at,consent,inputs,retail_batch_id','checked_at,created_at,updated_at,consent,inputs,retail_batch_id')
s=s.replace('return { decision, summary, fingerprint, documents, referenceEvidence, jobs };','return { decision, summary, fingerprint, documents, referenceEvidence, jobs, receipt:receipts[0] };',1)
s=s.replace('const fresh2 = withReferenceDiagnostics({ ...official, summary: e.summary }, e.referenceEvidence, now());','const fresh2 = withReferenceDiagnostics({ ...official, summary: e.summary }, e.referenceEvidence, now());\n        fresh2.liveJobs=novaLiveDelays({source:s,caseRow:official,receipt:e.receipt,jobs:e.jobs},now());',1)
# Timing only in read-only presentation.
needle='  let owner=null;'
patch="""  const delayed=(c?.liveJobs||[]).find(j=>j.platform===platform);
  const hour=new Date(now-18000000).getUTCHours();
  if(!['authorized','rejected'].includes(state)&&!c?.delivered_at&&delayed&&hour>=8&&hour<20&&['pending','running','technical'].includes(status)){
   status='delayed';label='Validación demorada';detail='Lleva '+Math.max(2,Math.floor(delayed.elapsedSeconds/60))+' minutos sin respuesta guardada. El equipo NOVA debe revisar conexión y procesamiento del conector. No vuelvas a registrar al cliente.';
  }
  let owner=null;"""
s=s.replace(needle,patch,1).replace("['technical','unavailable','stale'].includes(status)","['technical','delayed','unavailable','stale'].includes(status)",1)
s=s.replace(" const technical=!closed&&(workflow.checks||[]).some(p=>p.status==='technical');", " const delayed=!closed&&(workflow.checks||[]).some(p=>p.status==='delayed');\n const technical=!closed&&(workflow.checks||[]).some(p=>p.status==='technical');\n if(delayed)pending.push({kind:'validation',label:'Validación demorada',owner:'Creditek',action:null,detail:'La validación está tardando más de dos minutos. El equipo de Creditek debe revisar el procesamiento. Conservamos los resultados recibidos; no vuelvas a registrar al cliente.'});",1)
s=s.replace(" if(workflow.nextAction?.title==='Entrega registrada')", " if(delayed&&!technical)Object.assign(action,{owner:'Creditek',title:'Validación demorada',detail:'La validación está tardando más de dos minutos. Conservamos tu solicitud. Creditek debe revisar el procesamiento; no tienes que registrarla de nuevo.'});\n if(workflow.nextAction?.title==='Entrega registrada')",1)
# Expose operational scanner only inside existing runtime, independently scheduled.
s=s.replace('  return { api, phoneLogin, reconcile, reconcileOne, authenticate, evidence, db, rpc, sendReferences, sendNotices, statuses, repairReplacements };',"  const sendDelayAlerts=env=>novaScanDelayAlerts(env,{db,rpc,source,fetcher,now,templateHealth,bounded:bounded2});\n  return { api, phoneLogin, reconcile, reconcileOne, authenticate, evidence, db, rpc, sendReferences, sendNotices, statuses, repairReplacements, sendDelayAlerts };",1)
s=s.replace('}, async scheduled(event, env, ctx) {\n  await prepareTemplates(env);','}, async scheduled(event, env, ctx) {\n  ctx.waitUntil(retail.sendDelayAlerts(env));\n  await prepareTemplates(env);',1)
# New private receipt update stays inside existing signed webhook guard.
needle='          const notices = await db(env, "kora", "nova_retail_notifications?provider_message_id=eq."'
pos=s.index(needle,s.index('  async function statuses(request, env)',s.index('function createRetailRuntime(')))
a=s.index('  async function statuses(request, env) {',s.index('function createRetailRuntime('))
s=s[:a]+s[a:].replace('  async function statuses(request, env) {','  async function statuses(request, env, ctx) {',1)
pos=s.index(needle,s.index('  async function statuses(request, env, ctx)',s.index('function createRetailRuntime(')))
s=s[:pos]+"          const delayReceipt=db(env,'aura','rpc/nova_platform_delay_status',{method:'POST',body:{p_message:s.id,p_recipient:s.recipient_id,p_status:s.status,p_at:new Date(at).toISOString(),p_error:s.errors?.[0]?.code?String(s.errors[0].code):null}}).catch(()=>console.warn(JSON.stringify({event:'platform_delay_receipt_unavailable'})));if(ctx?.waitUntil)ctx.waitUntil(delayReceipt);else await delayReceipt;\n"+s[pos:]
s=s.replace('await retail.statuses(copy, this.env);','await retail.statuses(copy, this.env, this.ctx);').replace('await retail.statuses(copy, env);','await retail.statuses(copy, env, ctx);')
(root/'candidate/nova/index.mjs').write_text(s)
# Existing registration Worker and photo form are deliberately byte-identical.
for part in ['index.mjs','form.html']:(root/'candidate/clientes'/part).write_bytes((root/'baseline/clientes'/part).read_bytes())
m=json.loads((root/'manifest.json').read_text());m['candidate']={name:{part:hashlib.sha256((root/'candidate'/folder/part).read_bytes()).hexdigest() for part in entry} for name,entry,folder in [('creditek-clientes',m['baseline']['creditek-clientes'],'clientes'),('creditek-nova',m['baseline']['creditek-nova'],'nova')]};(root/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
changes=[]
import difflib
for line in difflib.unified_diff(base.splitlines(),s.splitlines(),n=2):changes.append(line)
(root/'nova.diff').write_text('\n'.join(changes)+'\n')
