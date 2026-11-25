from pathlib import Path
import re,json,hashlib,shutil
root=Path(__file__).resolve().parent
release=root
for name in ['nova','clientes']:
 shutil.copytree(root/'baseline'/name,root/'candidate'/name,dirs_exist_ok=True)
def replace(s,a,b):
 assert s.count(a)==1,(a[:100],s.count(a));return s.replace(a,b)
p=release/'candidate/nova/index.mjs';s=p.read_text()
start=s.index('function commercialStoreWorkflow(');end=s.index('// Minimal short-lived closing receipt.',start)
s=s[:start]+'''// Commercial alerts are a safe projection; they never alter the lending decision.
function commercialStoreWorkflow(workflow,state,references=[],verification=[]){
 const closed=['authorized','rejected'].includes(state)||workflow.nextAction?.title==='Entrega registrada';
 const pending=closed?[]:(workflow.pending||[]).filter(p=>['reference','photo'].includes(p.kind)).map(p=>({...p}));
 const internalReview=!closed&&(workflow.pending||[]).some(p=>p.kind==='platform');
 if(internalReview)pending.push({kind:'validation',label:'Validación pendiente de Creditek',owner:'Creditek',action:null,detail:verification.some(p=>p.historyRequired===true)?'El equipo de Creditek debe completar la validación del historial recibido. La tienda no debe registrar al cliente de nuevo.':'El equipo de Creditek debe completar las validaciones pendientes. La tienda no debe registrar al cliente de nuevo.'});
 if(!closed)for(const p of pending){if(p.kind==='reference'&&p.owner==='Andrea'){p.owner='Creditek';p.detail='El equipo de Creditek debe revisar la respuesta de esta referencia y confirmar que corresponde al tipo solicitado. Conservamos la respuesta recibida.';}}
 const action=state==='authorized'?{owner:'Tienda',title:'Puedes continuar',detail:'¡Sigue vendiendo y ganando!'}:
  state==='rejected'?{owner:'Creditek',title:'No puedes continuar',detail:'Esta solicitud no permite continuar. Consulta con el equipo de Creditek si necesitas ayuda.'}:
  {owner:state==='correct'?'Tienda':'Creditek',title:'No puedes continuar por ahora',detail:'Revisa los pendientes y el responsable indicado abajo. Espera a que NOVA muestre «Puedes continuar»; no registres al cliente de nuevo.'};
 if(workflow.nextAction?.title==='Entrega registrada')Object.assign(action,{title:'Entrega registrada',detail:'La entrega ya quedó registrada.'});
 const waiting=!closed?referenceWaitingNotice(references):null;
 if(waiting){action.detail=waiting.title+'. '+waiting.detail;if(!internalReview&&!pending.some(p=>p.owner==='Tienda'||p.owner==='Creditek'))action.owner='Referencias';}
 if(!closed&&!pending.length&&!waiting)pending.push({kind:'validation',label:'Validación pendiente de Creditek',owner:'Creditek',action:null,detail:'Creditek debe completar la revisión de esta solicitud. Espera el resultado en esta misma pantalla.'});
 const attention=!closed;
 return {...workflow,checks:[],received:0,total:0,pending,nextAction:action,notice:{attention,title:action.title,detail:action.detail}};
}

''' +s[end:]
s=replace(s,'commercialStoreWorkflow(storeWorkflow(decision,at),decision.state,decision.summary?.references)','commercialStoreWorkflow(storeWorkflow(decision,at),decision.state,decision.summary?.references,decision.decision?.platformVerification)')
# Check decision shape: storeResult receives case (state, decision, summary).
s=replace(s,'        const reviewed = await rpc(env, "nova_retail_review",','        if (b.decision === "approve" && (current.decision?.reasons || []).some(r => ["zero_payments", "more_than_two_overdue", "overdue_with_less_than_four_paid"].includes(r)))\n          throw Error("RESTRICTED_CONDITIONS");\n        const reviewed = await rpc(env, "nova_retail_review",')
s=replace(s,'["CONSENT_REVOKED", "THREE_PLATFORM_RESULTS_REQUIRED"].includes(d.message)','["CONSENT_REVOKED", "THREE_PLATFORM_RESULTS_REQUIRED", "RESTRICTED_CONDITIONS"].includes(d.message)')
s=replace(s,'"QUERY_INPUT_CONFLICT", "THREE_PLATFORM_RESULTS_REQUIRED"].includes(e.message)','"QUERY_INPUT_CONFLICT", "THREE_PLATFORM_RESULTS_REQUIRED", "RESTRICTED_CONDITIONS"].includes(e.message)')
pattern=r'var retail_portal_default = ("(?:[^"\\]|\\.)*");'
m=re.search(pattern,s);html=json.loads(m[1]);(release/'portal.before.html').write_text(html)
a=html.index('function renderCaseNotice(');b=html.index('function renderList()',a)
html=html[:a]+'''function renderCaseNotice(previous,current){const notice=$('caseNotice');const changed=current.filter(c=>previous.some(p=>p.id===c.id&&p.revision!==c.revision)).length;const tasks=current.filter(c=>c.workflow?.notice?.attention).length;notice.hidden=!tasks&&!changed;if(!notice.hidden)notice.textContent=(changed?'NOVA actualizó '+changed+' solicitud'+(changed===1?'':'es')+'. ':'')+(tasks?'No puedes continuar con '+tasks+' solicitud'+(tasks===1?'':'es')+' por ahora. Pulsa «Abrir» para ver qué falta y si debe resolverlo tu tienda o Creditek. El estado se actualiza automáticamente.':'Abre la solicitud para consultar el resultado y el siguiente paso.');}
''' +html[b:]
html=replace(html,"section.id='liveWorkflow';","section.id='liveWorkflow';if(w.notice?.attention){section.setAttribute('role','alert');section.setAttribute('aria-live','polite');section.classList.add('needs-attention');}")
html=replace(html,'</style>','.workflow.needs-attention{border:2px solid #9a6700;border-radius:12px;background:#fff8e6;padding:16px}.workflow.needs-attention>strong{display:block;font-size:22px;color:#714600}</style>')
html=replace(html,'THREE_PLATFORM_RESULTS_REQUIRED:\'Faltan resultados válidos','RESTRICTED_CONDITIONS:\'No se puede aprobar: la solicitud tiene condiciones restrictivas vigentes. Revisa las observaciones.\',THREE_PLATFORM_RESULTS_REQUIRED:\'Faltan resultados válidos')
html=replace(html,"const ready=platformsReady&&c.summary?","const restrictive=(c.decision?.reasons||[]).some(r=>['zero_payments','more_than_two_overdue','overdue_with_less_than_four_paid'].includes(r));\n   const ready=!restrictive&&platformsReady&&c.summary?")
html=replace(html,"if(!ready)form.append(node('p',platformsReady?","if(!ready)form.append(node('p',restrictive?'No se puede aprobar mientras existan condiciones restrictivas. Revisa las observaciones.':platformsReady?")
s=s[:m.start(1)]+json.dumps(html,ensure_ascii=False)+s[m.end(1):];p.write_text(s);(release/'portal.html').write_text(html)
p=release/'candidate/clientes/index.mjs';s=p.read_text();a=s.index('function commercialRegistrationProgress(');b=s.index('// Read-only projection',a)
s=s[:a]+'''function commercialRegistrationProgress(progress,references=[]){
 const closed=progress.terminal===true;
 const pending=closed?[]:(progress.pending||[]).filter(p=>p.kind!=='platform');
 if(!closed&&(progress.pending||[]).some(p=>p.kind==='platform'))pending.push({kind:'validation',label:'Validación pendiente de Creditek',action:'wait',detail:'El equipo de Creditek debe completar la revisión de esta solicitud. Espera el resultado en esta misma pantalla.'});
 const waiting=!closed?referenceWaitingNotice(references):null;
 return {...progress,checks:[],pending,...(!closed?{title:'No puedes continuar por ahora',detail:(waiting?waiting.title+'. ':'')+'Revisa los pendientes. Espera a que NOVA muestre «Puedes continuar»; no registres al cliente de nuevo.'}:{}),...(progress.state==='authorized'?{title:'Puedes continuar',detail:'¡Sigue vendiendo y ganando!'}:{})};
}

''' +s[b:]
s=replace(s,"pending.push({label,action:replace?","pending.push({kind:'reference',label,action:replace?")
s=replace(s,"pending.push({label:{frente:","pending.push({kind:'photo',label:{frente:")
s=replace(s,"pending.push({label:check.name,action:'review'","pending.push({kind:'platform',label:check.name,action:'review'")
p.write_text(s)
sql=(root/'review-before.sql').read_text();needle=" if r.state<>'review' or r.decision->'reasons' ?| array['zero_payments','rejection_cooldown','consent_revoked','renewal_required','delivery_requery_required'] or s.revoked_at is not null then raise exception 'REVIEW_NOT_ALLOWED';end if;"
sql=replace(sql,needle,needle+"\n if p_action='approve' and coalesce(r.decision->'reasons','[]'::jsonb) ?| array['zero_payments','more_than_two_overdue','overdue_with_less_than_four_paid'] then raise exception 'RESTRICTED_CONDITIONS';end if;")
(release/'review-after.sql').write_text(sql)
manifest={}
for stage in ['baseline','candidate']:
 manifest[stage]={}
 for name in ['nova','clientes']:
  manifest[stage]['creditek-'+name]={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in (release/stage/name).iterdir()}
(release/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Candidate built:',release)
