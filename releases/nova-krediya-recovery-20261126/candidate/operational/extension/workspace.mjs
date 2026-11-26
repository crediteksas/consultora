// Opening this URL selects the official chat; it contains no draft or send action.
const CHAT='https://web.whatsapp.com/send?phone=573155000105';
export function createWorkspaceRecovery(chrome){
 let pending=null;
 return function ensureWorkspace(){
  if(pending)return pending;
  pending=(async()=>{
   const tabs=await chrome.tabs.query({url:'https://web.whatsapp.com/*'});
   // Never replace an existing user's tab or create a second WhatsApp session.
   if(tabs.length)return{created:false};
   await chrome.tabs.create({url:CHAT,active:false});
   return{created:true};
  })().finally(()=>{pending=null;});
  return pending;
 };
}
