import{createChromeDriver}from'./driver.mjs';
import{createWorkspaceRecovery}from'./workspace.mjs';
const ensureWorkspace=createWorkspaceRecovery(chrome);
const HOST='com.creditek.nova_krediya';let port=null,busy=false;const pending=new Map(),driver=createChromeDriver({chrome});
const status=state=>chrome.storage.local.set({status:{at:new Date().toISOString(),...state}});
function connect(){if(port)return port;port=chrome.runtime.connectNative(HOST);port.onMessage.addListener(m=>{if(m?.type==='browser_call'){if(!['verifyView','baseline','sendText','readIncoming','requestClose','requestMenu','recoverGreeting','recoverName','recoverHistory'].includes(m.op))return;void driver[m.op](m.arg).then(result=>port?.postMessage({type:'browser_reply',id:m.id,ok:true,result}),error=>port?.postMessage({type:'browser_reply',id:m.id,ok:false,reason:/^BROWSER_(SNAPSHOT|COMPOSE|COMPOSE_CONFIRM|SEND_CLICK|SEND_CONFIRM|READ_INCOMING)_FAILED$/.test(error?.message||'')?error.message:'BROWSER_FAILED'}));return;}const p=pending.get(m?.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.ok?p.resolve(m.result):p.reject(Error('NATIVE_FAILURE'));});port.onDisconnect.addListener(()=>{port=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('NATIVE_DISCONNECTED'));}pending.clear();void status({state:'disconnected'});});return port;}
function call(action){return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('NATIVE_TIMEOUT'));},360000);pending.set(id,{resolve,reject,timer});try{connect().postMessage({id,action});}catch{clearTimeout(timer);pending.delete(id);reject(Error('NATIVE_UNAVAILABLE'));}});}
async function tick(){
 if(busy)return;
 const s=await chrome.storage.local.get(['enabled','requiresReview']);if(!s.enabled)return;
 busy=true;
 try{
  // Restore the work page even outside service hours or during manual review.
  // This does not resume a reserved case, authenticate, or send a message.
  await ensureWorkspace();
  if(s.requiresReview){
   const health=await call('status');
   // Native recovery refuses any reserved/uncertain case and checks the journal lock.
   if(health.automaticRecoveryAllowed!==true){await status({state:'review'});return;}
   const recovery=await call('resume');
   if(recovery.state!=='ready'){await status(recovery);return;}
   await chrome.storage.local.set({requiresReview:false});
  }
  await chrome.storage.local.set({inFlight:true});await status({state:'checking'});
  const result=await call('tick');
  if(result.state==='review')await chrome.storage.local.set({requiresReview:true});
  await status(result);
 }catch{
  // A reconnect alone cannot establish whether the previous send completed.
  // Next tick must ask the durable native ledger before automatic recovery.
  await chrome.storage.local.set({requiresReview:true});
  await status({state:'review',reason:'CONNECTION_OR_OUTCOME_UNCERTAIN'});
 }finally{busy=false;await chrome.storage.local.set({inFlight:false});}
}
const alarm=()=>chrome.alarms.create('nova-krediya',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='nova-krediya')void tick();});
chrome.runtime.onInstalled.addListener(d=>{if(d.reason==='install')void chrome.storage.local.set({enabled:false,requiresReview:false,inFlight:false});void alarm();});
chrome.runtime.onStartup.addListener(()=>{void alarm();void tick();});
chrome.runtime.onMessage.addListener((m,sender,reply)=>{if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html')||!['status','probe','enable','disable','resume'].includes(m?.action))return;void(async()=>{if(m.action==='probe')await status({state:(await call('status')).operationalEnabled?'connected':'server_disabled'});if(m.action==='enable'){await chrome.storage.local.set({enabled:true});void tick();}if(m.action==='disable')await chrome.storage.local.set({enabled:false});if(m.action==='resume'){const r=await call('resume');if(r.state==='ready'){await chrome.storage.local.set({requiresReview:false});void tick();}await status(r);}reply(await chrome.storage.local.get(['enabled','requiresReview','status']));})().catch(()=>reply({error:'CONNECTION_NOT_CONFIRMED'}));return true;});
void(async()=>{const s=await chrome.storage.local.get('inFlight');if(s.inFlight)await chrome.storage.local.set({requiresReview:true,inFlight:false});await alarm();void tick();})();
