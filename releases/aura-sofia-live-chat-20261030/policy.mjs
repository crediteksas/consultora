import {readFile} from 'node:fs/promises';
export const OLD_LOAD='async function loadAll(){hideSofiaServiceUnavailable();await loadTiendas();await Promise.all([loadStats(),loadConvs(),loadClients()]);recomputeInterventions();applyFilters()}';
export const NEW_LOAD=OLD_LOAD.replace('applyFilters()}','applyFilters();refreshOpenChat()}');
export const OPEN_ANCHOR='function openChat(tel){';
export const SCROLL_ANCHOR="  setTimeout(()=>{const cm=document.getElementById('chat-msgs-inner');if(cm)cm.scrollTop=cm.scrollHeight;},50);";
export const HELPER=await readFile(new URL('./helpers.js.txt',import.meta.url),'utf8');
export const OLD_RENDER=await readFile(new URL('./render-previous.txt',import.meta.url),'utf8');
export function patchLiveChat(html){
  for(const anchor of [OLD_LOAD,OPEN_ANCHOR,OLD_RENDER,SCROLL_ANCHOR])if(html.split(anchor).length!==2)return null;
  return html.replace(OLD_LOAD,NEW_LOAD).replace(OPEN_ANCHOR,HELPER+'\n'+OPEN_ANCHOR).replace(OLD_RENDER,'  const msgsHtml=chatMessagesHtml(msgs);').replace(SCROLL_ANCHOR,"  rememberChatMessages(document.getElementById('chat-msgs-inner'),msgsHtml);\n"+SCROLL_ANCHOR);
}
