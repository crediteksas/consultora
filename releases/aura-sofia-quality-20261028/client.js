(function(){
  'use strict';
  const actions=new Set(['status','preview','propose','approve','reject','revoke','restore','budget']);
  const endpoint='/creditek/agentes/sofia-calidad/api/';
  window.auraSofiaQualityRequest=async function(action,body){
    if(!actions.has(action))throw Error('Acción no disponible.');
    let session=getSession();
    if(!session?.access_token)throw Error('Tu sesión de AURA venció. Vuelve al panel principal.');
    const send=s=>fetch(endpoint+action,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+s.access_token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store'});
    let response=await send(session);
    if(response.status===401){session=await refreshSession();if(!session?.access_token)throw Error('Tu sesión de AURA venció. Vuelve al panel principal.');response=await send(session);}
    const value=await response.json().catch(()=>({}));
    if(!response.ok||value.ok!==true){
      const messages={owner_required:'Solo el propietario puede administrar calidad y consumo.',unauthorized:'Tu sesión de AURA venció.',revision_conflict:'La lista cambió. Actualiza antes de guardar.',validation_required:'Primero revisa la vista previa.',unauthorized_budget_increase:'El máximo autorizado sigue siendo US$15 al mes.'};
      throw Error(messages[value.code]||'No fue posible consultar el panel. Intenta actualizar.');
    }
    return value;
  };
  let modal=null,frame=null,previousFocus=null;
  function close(){if(!modal)return;modal.remove();modal=null;frame=null;previousFocus?.focus?.();}
  window.auraOpenSofiaQuality=function(){
    if(modal)return;
    previousFocus=document.activeElement;
    modal=document.createElement('div');modal.id='auraSofiaQualityDialog';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Sofía · Calidad y consumo');
    const bar=document.createElement('div');bar.className='aura-quality-bar';
    const title=document.createElement('strong');title.textContent='Sofía · Calidad y consumo';
    const button=document.createElement('button');button.type='button';button.textContent='Cerrar';button.setAttribute('aria-label','Cerrar calidad y consumo');button.onclick=close;
    frame=document.createElement('iframe');frame.id='auraSofiaQualityFrame';frame.title='Calidad, consumo y correcciones de Sofía';frame.src='/creditek/agentes/sofia-calidad';
    bar.append(title,button);modal.append(bar,frame);document.body.append(modal);button.focus();
  };
  window.addEventListener('message',event=>{if(event.origin===location.origin&&frame&&event.source===frame.contentWindow&&event.data?.type==='aura-sofia-quality-close')close();});
  document.addEventListener('keydown',event=>{if(modal&&event.key==='Escape')close();});
  const mount=()=>{
    const bar=document.querySelector('.topbar-actions');if(!bar||document.getElementById('auraSofiaQualityOpen'))return;
    const button=document.createElement('button');button.id='auraSofiaQualityOpen';button.type='button';button.className='btn btn-outline';button.textContent='Calidad y consumo';button.onclick=window.auraOpenSofiaQuality;bar.prepend(button);
    const badge=document.getElementById('b-correcciones');if(badge)badge.hidden=true;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
