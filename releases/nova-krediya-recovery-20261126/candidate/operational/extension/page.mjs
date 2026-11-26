// Only visible WhatsApp controls. No internal stores, cookies or network APIs.
export function pageOperation(action,value){
 const visible=e=>!!e&&e.getClientRects().length>0;
 const buttons=()=>[...document.querySelectorAll('button,[role="button"]')].filter(visible);
 const click=e=>{if(!visible(e)||e.getAttribute('aria-disabled')==='true'||e.disabled)throw Error('CONTROL_UNAVAILABLE');e.click();return true;};
 const name=e=>e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText?.trim();
 const header=document.querySelector('#main header'),chat=header?.innerText?.trim();
 const selected=chat==='Ya Bot Krediya'||chat==='Ya Bot Krediya\nCuenta de empresa';
 const isPanelHeader=e=>!!e&&/^(?:Perfil(?: Guardar)?|Info\. del contacto)$/.test(e.innerText.trim().replace(/\s+/g,' '));
 const panelsClosed=()=>![...document.querySelectorAll('header')].some(e=>visible(e)&&isPanelHeader(e));
 if(action==='panels-closed')return panelsClosed();
 if(action==='scroll-bottom'){if(!selected||!panelsClosed())throw Error('CHAT_VIEW_REQUIRED');const down=buttons().find(e=>e.closest('#main')&&name(e)==='Desplazar hasta el final');return down?click(down):true;}
 if(action==='at-bottom')return selected&&panelsClosed()&&!buttons().some(e=>e.closest('#main')&&name(e)==='Desplazar hasta el final');
 if(action==='profile-open'){if(!selected)throw Error('WRONG_CHAT');return click(document.querySelector('button[aria-label="Perfil"]'));}
 if(action==='profile-check')return [...document.querySelectorAll('div')].some(e=>visible(e)&&e.innerText?.length<100&&/^Número de teléfono\s*\+57\s*311\s*8657153\s*$/.test(e.innerText.trim()))&&document.body.innerText.includes('Información de contacto');
 if(action==='panel-close'){
  const found=buttons().filter(e=>name(e)==='Cerrar'&&isPanelHeader(e.closest('header')));
  for(const b of found){const h=b.closest('header');if(h.innerText.trim().replace(/\s+/g,' ')==='Perfil Guardar'){
   const saves=[...h.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&name(e)==='Guardar');
   if(saves.length!==1||(!saves[0].disabled&&saves[0].getAttribute('aria-disabled')!=='true'))throw Error('UNSAVED_PROFILE_CHANGES');
  }}
  for(const b of found)click(b);return found.length>0;
 }
 if(action==='contact-open'){if(!selected)throw Error('WRONG_CHAT');return click([...header.querySelectorAll('[role="button"],button')].find(e=>name(e)==='Información de contacto'||e.innerText.trim().startsWith('Ya Bot Krediya')));}
 if(action==='contact-check')return [...document.querySelectorAll('span,div')].some(e=>visible(e)&&e.children.length===0&&e.innerText?.replace(/\D/g,'')==='573155000105')&&document.body.innerText.includes('Info. del contacto');
 if(!selected)throw Error('WRONG_CHAT');
 const main=document.querySelector('#main'),composer=main.querySelector('[contenteditable="true"][role="textbox"]');
 if(action==='compose'){
  const latest=[...main.querySelectorAll('[data-id]')].filter(row=>visible(row)&&row.querySelector('[data-pre-plain-text]')).at(-1);
  const message=latest?.querySelector('[data-testid="selectable-text"]');
  const prompt=message?.innerText?.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[*_]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const authorizedName=typeof value==='string'&&value.length<=120&&/^\p{L}[\p{L} .’'\-]*\p{L}$/u.test(value)&&
   value.trim().split(/\s+/).length>=2&&prompt==='me brinda por favor su nombre y apellido'&&
   !latest.querySelector('[data-testid="tail-out"]');
  if(!['Hola KrediYa','1','4'].includes(value)&&!/^\d{6,12}$/.test(value||'')&&!authorizedName)throw Error('INVALID_COMMAND');
  if(!visible(composer)||composer.innerText.trim())throw Error('DRAFT_OR_COMPOSER_UNAVAILABLE');
  composer.focus();
  if(!composer.isConnected||document.activeElement!==composer)return false;
  document.execCommand('insertText',false,value);
  return true;
 }
 if(action==='send'){if(composer?.innerText?.trim()!==value)throw Error('DRAFT_MISMATCH');return click(buttons().find(e=>e.closest('#main')&&name(e)==='Enviar'));}
 if(action==='continue-request'){const row=[...main.querySelectorAll('[data-id]')].find(e=>e.getAttribute('data-id')===value?.messageId);if(!row)throw Error('PROMPT_NOT_FOUND');const candidates=buttons().filter(e=>row.contains(e)&&/^(?:✅\s*)?SI$/.test(e.innerText.trim())&&e.getAttribute('aria-disabled')!=='true'&&!e.disabled);if(candidates.length!==1)throw Error('NO_UNAMBIGUOUS_CONTINUE');return click(candidates[0]);}
 if(action==='close-request'){const row=value?.messageId?[...main.querySelectorAll('[data-id]')].find(e=>e.getAttribute('data-id')===value.messageId):main;if(!row)throw Error('PROMPT_NOT_FOUND');const candidates=buttons().filter(e=>row.contains(e)&&/^(?:❌\s*)?NO$/.test(e.innerText.trim())&&e.getAttribute('aria-disabled')!=='true'&&!e.disabled);if(candidates.length!==1)throw Error('NO_UNAMBIGUOUS_CLOSE');return click(candidates[0]);}
 if(action!=='snapshot')throw Error('INVALID_ACTION');
 const rich=e=>e.nodeType===3?(e.textContent||''):e.tagName==='IMG'?(e.getAttribute('alt')||''):e.tagName==='BR'?'\n':[...e.childNodes].map(rich).join('');
 const rows=[...main.querySelectorAll('[data-id]')];if(rows.length>100)throw Error('CAPTURE_TOO_LARGE');const seen=new Set(),messages=[];let pendingMessages=0;
 for(const row of rows){const pre=row.querySelector('[data-pre-plain-text]');if(!pre)continue;const id=row.getAttribute('data-id'),text=[...row.querySelectorAll('[data-testid="selectable-text"]')].filter(e=>!e.closest('[data-testid="quoted-message"]')&&!e.parentElement?.closest('[data-testid="selectable-text"]')).map(rich).join('\n').trim(),metadata=pre.getAttribute('data-pre-plain-text');if(!/^[-A-Za-z0-9._=]{1,200}$/.test(id||'')||seen.has(id)||text.length>8192||typeof metadata!=='string'||metadata.length>200)throw Error('INVALID_MESSAGE');if(!text){pendingMessages++;continue;}seen.add(id);messages.push({id,text,metadata,direction:row.querySelector('[data-testid="tail-out"]')?'outgoing':'unverified'});}
 return {chat,messages,pendingMessages,draft:composer?.innerText?.trim()??null};
}
