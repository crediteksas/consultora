from pathlib import Path
import json,re,shutil,hashlib
r=Path(__file__).resolve().parent
if (r/'candidate').exists():shutil.rmtree(r/'candidate')
shutil.copytree(r/'baseline/nova',r/'candidate/nova')
s=(r/'baseline/nova/index.mjs').read_text();edits=[]
def change(old,new):
 global s
 assert s.count(old)==1,(old[:100],s.count(old));edits.append([old,new]);s=s.replace(old,new)
anchor='function createRetailRuntime({ fetcher = fetch, now = Date.now, makeInvitation } = {}) {'
change("ref?.type==='family'&&ref.responded===true&&ref.knowsCustomer===true&&ref.contactConfirmed===true&&['friend','neighbor','coworker','other'].includes(ref.reportedRelationship)&&[null,undefined,'contradictory_information','relationship_unconfirmed'].includes(ref.reason)",'referenceFamilyMismatch(ref)')
change(anchor,(r/'helpers.js').read_text()+'\n'+anchor)
# Keep recipient failures recoverable, not stuck in sending.
start=s.index('      let recipient = null;',s.index('  async function sendNotices(env)'))
end=s.index('      if (await rpc(env, "nova_retail_consent_current"',start)
block=s[start:end];f=block.index('      const finish =');finish=block[f:];lookups=block[len('      let recipient = null;\n'):f]
replacement='      let recipient = null;\n'+finish+'      try{\n'+lookups+'      }catch{await finish("failed",null,"CONTACT_LOOKUP_UNAVAILABLE");continue;}\n'
change(block,replacement)
old='      const text = n.case_state === "review" ? "Solicitud pendiente de revisi\\xF3n de Andrea" : n.case_state === "authorized" ? "Autorizado para tramitar" : "Rechazado";'
new='''      let text = n.case_state === "review" ? "Solicitud pendiente de revisión de Andrea" : n.case_state === "authorized" ? "Autorizado para tramitar" : "Rechazado";
      let noticeReference="NOVA-"+n.source_id.slice(0,8).toUpperCase();
      if(n.audience==="andrea"){
        try{
          const cases=await db(env,"kora","nova_retail_cases?source_id=eq."+n.source_id+"&revision=eq."+n.revision+"&select=source_id,revision,store_code,state,summary,decision&limit=1");
          const origins=await db(env,"kora","origenes?codigo=eq."+encodeURIComponent(n.store_code)+"&select=codigo,nombre&limit=1");
          const content=andreaNoticeContent(n,cases[0],origins[0]?.nombre);
          noticeReference=content.reference;text=content.text;
          try{await env.NOVA_EVENTS?.put("nova:retail:notice-content:v1:"+n.id+":"+n.attempt_id,JSON.stringify({notice_id:n.id,attempt_id:n.attempt_id,source_id:n.source_id,revision:n.revision,template:"nova_aviso_ejecutivo_v1",body_parameters:[content.reference,content.text],direct_url:content.url}),{expirationTtl:2592000});}catch{console.warn(JSON.stringify({event:"retail_notice_snapshot_unavailable"}));}
        }catch{await finish("failed",null,"NOTICE_DETAILS_UNAVAILABLE");continue;}
      }'''
change(old,new)
old='{ type: "text", text: "NOVA-" + n.source_id.slice(0, 8).toUpperCase() }, { type: "text", text }'
change(old,'{ type: "text", text: noticeReference }, { type: "text", text }')
old='''        const rows2 = await db(env, "kora", "nova_retail_cases?select=source_id,store_code,state,revision,decision,summary,valid_until,updated_at" + (actor.global ? "" : "&store_code=eq." + actor.store) + (actor.allied ? "&state=not.in.(authorized,rejected)&delivered_at=is.null" : "") + "&order=updated_at.desc&limit=100");'''
new='''        const listing=novaCaseListQuery(actor,b,now());
        const pageRows=await db(env,"kora",listing.path),hasMore=pageRows.length>100,rows2=pageRows.slice(0,100);'''
change(old,new)
change('return reply({ registrationUrl:entry?.url||null, proposedPhone:', 'return reply({ listWindow:{period:listing.window.period,day:listing.window.day,offset:listing.window.offset,hasMore},registrationUrl:entry?.url||null, proposedPhone:')
change('updatedAt: c2.updated_at, ...actor.global ?', 'updatedAt: c2.updated_at, submittedAt:c2.source?.submitted_at||null,...actor.global ?')
m=re.search(r'^var retail_portal_default = ("[^\n]*");$',s,re.M);assert m;ui=json.loads(m[1]);uiEdits=[]
def uiChange(old,new):
 global ui
 assert ui.count(old)==1,(old[:100],ui.count(old));uiEdits.append([old,new]);ui=ui.replace(old,new)
uiChange('<div class="card"><div class="row"><label>Buscar tienda o cliente', '<div class="card"><div class="row"><label>Mostrar<select id="period"><option value="today">Solicitudes de hoy</option><option value="archive">Archivo · Días anteriores</option></select></label><label>Buscar tienda o cliente')
uiChange('<p id="empty" hidden>No hay solicitudes para mostrar.</p>', '<p id="empty" hidden>No hay solicitudes para mostrar.</p><p id="listScope" class="muted" role="status"></p><div class="row"><button id="previousPage" class="secondary" disabled>Anterior</button><button id="nextPage" class="secondary" disabled>Siguiente</button></div>')
uiChange("historyMore=false;", "historyMore=false;let listOffset=0,listDay=null,listGeneration=0,lastListPeriod=null,lastListOffset=null;")
uiChange("async function load(){let closedId=null;const previous=rows;const data=await api({action:'list'});actor=data.actor;rows=data.cases;", """async function load(){let closedId=null;const previous=rows,requestedPeriod=$('period').value,requestedOffset=listOffset,generation=++listGeneration;const data=await api({action:'list',period:requestedPeriod,offset:requestedOffset});if(generation!==listGeneration||requestedPeriod!==$('period').value||requestedOffset!==listOffset)return;
 const samePage=lastListPeriod===requestedPeriod&&lastListOffset===requestedOffset&&listDay===data.listWindow.day;
 if(listDay&&listDay!==data.listWindow.day){clearCommercialClosure();clearAlliedDetail();if(listOffset!==0){listOffset=0;listDay=data.listWindow.day;return load();}}
 actor=data.actor;rows=data.cases;listDay=data.listWindow.day;lastListPeriod=requestedPeriod;lastListOffset=requestedOffset;
 $('listScope').textContent=(requestedPeriod==='today'?'Solicitudes ingresadas hoy, '+listDay+' (hora de Colombia).':'Archivo: solicitudes ingresadas antes de '+listDay+'.')+' Mostrando '+rows.length+' en esta página.';
 $('previousPage').disabled=listOffset===0;$('nextPage').disabled=!data.listWindow.hasMore;
""")
uiChange("if(actor.allied && selected && !rows.some(c=>c.id===selected)){", "if(actor.allied && selected && samePage&&previous.some(c=>c.id===selected)&&!rows.some(c=>c.id===selected)){")
# Direct links use server scope checks, not membership in today's page.
uiChange("if(!/^[a-f0-9-]{36}$/i.test(wanted)||!rows.some(r=>r.id===wanted)){", "if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(wanted)){")
uiChange(' await open(wanted);\n}', " try{await open(wanted);}catch{clearAlliedDetail();say('Esta solicitud no está disponible para tu acceso. Los aliados solo pueden ver sus solicitudes en trámite.');}\n}")
uiChange('function clearAlliedSession(){\n', 'function clearAlliedSession(){\n listGeneration++;\n')
# Explicit period/page navigation clears any open data before fetching the new range.
anchor="$('refresh').onclick="
a=ui.index(anchor)
ui=ui[:a]+"""async function changeListWindow(period,offset){if(busy)return;listGeneration++;clearCommercialClosure();clearAlliedDetail();$('period').value=period;listOffset=offset;rows=[];$('cases').replaceChildren();await operate(load);}
$('period').onchange=()=>changeListWindow($('period').value,0);
$('previousPage').onclick=()=>changeListWindow($('period').value,Math.max(0,listOffset-100));
$('nextPage').onclick=()=>changeListWindow($('period').value,listOffset+100);
"""+ui[a:]
uiChange("async function operate(run){if(busy)return;busy=true;", "async function operate(run){if(busy)return;busy=true;$('period').disabled=true;")
uiChange("finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=b.dataset.locked==='true');}","finally{busy=false;$('period').disabled=false;document.querySelectorAll('button').forEach(b=>b.disabled=b.dataset.locked==='true');}")
ui=ui.replace("$('previousPage').disabled=listOffset===0;$('nextPage').disabled=!data.listWindow.hasMore;", "$('previousPage').dataset.locked=String(listOffset===0);$('nextPage').dataset.locked=String(!data.listWindow.hasMore);$('previousPage').disabled=listOffset===0;$('nextPage').disabled=!data.listWindow.hasMore;")
uiChange("$('logout').onclick=()=>{", "$('logout').onclick=()=>{listGeneration++;")
uiChange(" try{\n  if(actor.allied){await load();if(!selected)return;}", " try{\n  const day=new Date(Date.now()-5*3600000).toISOString().slice(0,10);if(listDay&&day!==listDay&&!editingDetail()){listOffset=0;clearCommercialClosure();clearAlliedDetail();rows=[];$('cases').replaceChildren();await load();return;}\n  if(actor.allied){await load();if(!selected)return;}")
# operate toggles all buttons; restore pagination bounds after it completes.
ui=ui.replace('await operate(load);}',"await operate(load);$('previousPage').disabled=listOffset===0;$('nextPage').disabled=!lastListHasMore;}")
ui=ui.replace('lastListOffset=null;','lastListOffset=null,lastListHasMore=false;').replace("actor=data.actor;rows=data.cases;listDay=", "lastListHasMore=data.listWindow.hasMore;actor=data.actor;rows=data.cases;listDay=")
s=s[:m.start(1)]+json.dumps(ui,ensure_ascii=False)+s[m.end(1):]
(r/'candidate/nova/index.mjs').write_text(s);(r/'candidate/ui.html').write_text(ui)
(r/'changes.json').write_text(json.dumps({'server':edits,'ui':uiEdits},ensure_ascii=False,indent=2)+'\n')
(r/'manifest.json').write_text(json.dumps({stage:{'creditek-'+n:{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in (r/(stage if n=='nova' else 'baseline')/n).iterdir()} for n in ['nova','clientes']} for stage in ['baseline','candidate']},indent=2)+'\n')
print('Prepared enriched staff notices and today/archive list; no decision or DB schema changes')
