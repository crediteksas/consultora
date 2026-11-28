from pathlib import Path
import json,re,shutil,hashlib
r=Path(__file__).resolve().parent
for w in ['clientes','nova']:shutil.copytree(r/'baseline'/w,r/'candidate'/w,dirs_exist_ok=True)
p=r/'baseline/clientes/form.html';s=p.read_text();edits=[]
def edit(old,new):
 global s
 assert s.count(old)==1,old[:100]
 edits.append({'old':old,'new':new});s=s.replace(old,new)
a=s.index('// Bounded receipt refresh only;');b=s.index('\nlet novaReceiptBusy=false;',a)
edit(s[a:b],'''// Live, visible receipt refresh only; never submits registration, OTP or provider queries.
function receiptRetryAfter(value,now=Date.now()) {
 if(typeof value!=='string'||!value.trim())return 0;
 const n=/^\\d+(?:\\.\\d+)?$/.test(value.trim())?Number(value)*1000:Date.parse(value)-now;
 return Number.isFinite(n)&&n>0?Math.min(300000,n):0;
}
function createReceiptPoll({refresh,isVisible,setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now,random=Math.random,delay=5000,slowDelay=30000,idleAfter=600000}) {
 let pending=false,attempts=0,timer=null,stopped=false,final=false,failures=0,notBefore=0,lastActivity=now();
 const clear=()=>{if(timer!==null){clearTimer(timer);timer=null;}};
 function schedule(immediate=false) {
  clear();
  if(stopped||!pending||!isVisible())return;
  const nominal=final||now()-lastActivity>=idleAfter?slowDelay:failures?Math.min(slowDelay,delay*2**(failures-1)):delay;
  const jitter=1+Math.min(1,Math.max(0,Number(random())||0))*.1;
  const wait=Math.max(0,notBefore-now(),immediate?0:Math.round(nominal*jitter));
  timer=setTimer(()=>{timer=null;if(stopped||!pending||!isVisible())return;attempts++;void refresh();},wait);
 }
 return {
  before({manual=false}={}){clear();if(manual){lastActivity=now();stopped=false;}if(now()<notBefore){schedule(true);return false;}return true;},
  after(status,{retryAfterMs=0}={}){final=status==='complete';pending=['pending_sync','temporarily_unavailable','received_by_nova','complete'].includes(status);if(status==='temporarily_unavailable'){failures=Math.min(4,failures+1);notBefore=Math.max(notBefore,now()+Math.min(300000,Math.max(0,Number(retryAfterMs)||0)));}else{failures=0;notBefore=0;}schedule();},
  visibility(){if(isVisible()){lastActivity=now();schedule(true);}else clear();},
  activity(){const idle=now()-lastActivity>=idleAfter;lastActivity=now();if(idle)schedule(true);},
  stop(){stopped=true;pending=false;clear();},
  resume(){stopped=false;lastActivity=now();},
  // attempts/exhausted remain for existing visibility diagnostics; healthy polling has no attempt cap.
  state:()=>({pending,attempts,exhausted:false,scheduled:timer!==null,failures,notBefore})
 };
}
''')
edit("if (event.persisted && documentosSession && document.getElementById('successScreen').classList.contains('show')) void consultarRecepcion();", "if (event.persisted && documentosSession && document.getElementById('successScreen').classList.contains('show')) {novaReceiptPoll.resume();void consultarRecepcion();}")
old="window.addEventListener('online',()=>novaReceiptPoll.visibility());"
edit(old,old+"\nfor(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>novaReceiptPoll.activity(),{passive:true});")
edit("if(novaReceiptBusy)return;novaReceiptBusy=true;\n  novaReceiptPoll.before({manual:options?.automatic!==true});","if(novaReceiptBusy||!novaReceiptPoll.before({manual:options?.automatic!==true}))return;novaReceiptBusy=true;")
edit("button.disabled=true;let receiptStatus='temporarily_unavailable';const priorText", "button.disabled=true;let receiptStatus='temporarily_unavailable',retryAfterMs=0;const priorText")
old="    const data = await r.json();\n    if(!r.ok||data.ok!==true){"
new="""    retryAfterMs=receiptRetryAfter(r.headers.get('Retry-After'));
    if(r.status===401){receiptStatus='auth_required';throw Error('auth_required');}
    if(r.status===403||r.status===404){receiptStatus='access_denied';throw Error('access_denied');}
    if(r.status===408||r.status===429||r.status>=500)throw Error('unavailable');
    if(r.status>=400&&r.status!==400){receiptStatus='request_error';throw Error('request_error');}
    let data;try{data=await r.json();}catch(error){if(r.status===400)receiptStatus='request_error';throw error;}
    if(!r.ok||data.ok!==true){"""
edit(old,new)
edit("      throw Error('unavailable');\n    }\n    receiptStatus=data.nova_status;","      if(r.status>=400||r.ok)receiptStatus='request_error';throw Error('unavailable');\n    }\n    receiptStatus=data.nova_status;")
edit("':'No pudimos actualizar el estado en este momento. Conservamos tu registro y volveremos a comprobarlo automáticamente.';}","':receiptStatus==='request_error'?'No pudimos comprobar esta solicitud. El equipo de Creditek debe revisar el acceso; conservamos tus datos y fotos.':'No pudimos actualizar el estado en este momento. Conservamos tu registro y volveremos a comprobarlo automáticamente.';}")
old="finally {button.disabled=false;button.textContent='Actualizar estado de mi solicitud';novaReceiptBusy=false;novaReceiptPoll.after(receiptStatus);const polling=novaReceiptPoll.state();if(polling.pending&&polling.exhausted){const previous=document.getElementById('novaTracking');if(previous)previous.hidden=true;renderProgressRecovery('temporarily_unavailable');label.textContent='Tu registro sigue guardado. Se pausó la actualización automática de esta pestaña; pulsa Actualizar estado de mi solicitud para ver el resultado actual.';}}"
new="finally {button.disabled=false;button.textContent='Actualizar estado de mi solicitud';novaReceiptBusy=false;novaReceiptPoll.after(receiptStatus,{retryAfterMs});}"
edit(old,new)
(r/'candidate/clientes/form.html').write_text(s)
index=(r/'baseline/clientes/index.mjs').read_text();m=re.search(r'^var pilot_form_default = (".*");$',index,re.M);assert m
index=index[:m.start(1)]+json.dumps(s,ensure_ascii=True)+index[m.end(1):];(r/'candidate/clientes/index.mjs').write_text(index)
(r/'form-edits.json').write_text(json.dumps(edits,ensure_ascii=False,indent=2)+'\n')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();manifest=json.loads((r/'manifest.json').read_text());manifest['candidate']={n:{p.name:sha(p) for p in (r/'candidate'/w).iterdir() if p.is_file()} for n,w in [('creditek-clientes','clientes'),('creditek-nova','nova')]};(r/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Prepared customer-only timer patch; NOVA module unchanged')
