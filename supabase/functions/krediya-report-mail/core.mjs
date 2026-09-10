export const RECIPIENTS=['gestion@crediteksas.com','comercial@crediteksas.com'];
export const SENDER='comercial@crediteksas.com';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(n);
const price=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function renderReport(report){
 const groups=new Map();let missing=0,compared=0,affected=0;
 for(const c of report.contexts){
  const k=price(c.pvp_guardado),r=price(c.pvp_recibido);
  if(k===null||r===null){missing++;continue;}
  compared++; if(Math.abs(k-r)<0.005)continue;
  affected++;
  const ref=String(c.referencia||c.modelo||'Referencia pendiente');
  const key=JSON.stringify([ref,k,r]);
  const g=groups.get(key)||{ref,k,r,n:0};g.n++;groups.set(key,g);
 }
 const rows=[...groups.values()].sort((a,b)=>a.ref.localeCompare(b.ref));
 const head='<tr><th>Equipo</th><th>Créditos</th><th>PVP KORA</th><th>PVP archivo</th><th>Diferencia por crédito</th><th>Diferencia total</th></tr>';
 const table=rows.map(g=>`<tr><td>${escape(g.ref)}</td><td>${g.n}</td><td>${money(g.k)}</td><td>${money(g.r)}</td><td>${money(g.r-g.k)}</td><td>${money((g.r-g.k)*g.n)}</td></tr>`).join('');
 return `<html><body style="font-family:Arial,sans-serif;color:#10213e"><h2>Krediya · Revisión de PVP</h2><p>Lote: ${escape(report.liquidation_id)}</p><p>${report.operation_count} créditos importados · ${compared} comparados · ${affected} con diferencias · ${missing} sin comparación completa.</p>${rows.length?'<p>Favor revisar estos PVP y su configuración en la plataforma Krediya.</p><table cellpadding="8" border="1" style="border-collapse:collapse">'+head+table+'</table>':'<p>No se encontraron diferencias en los PVP que pudieron compararse.</p>'}${missing?'<p>Hay '+missing+' créditos sin datos completos para comparar; no se consideran diferencias de cero.</p>':''}<p>Diferencia = PVP del archivo menos PVP de KORA vigente en la fecha de venta. La última columna suma las diferencias de todos los créditos de esa fila.</p><p><strong>La liquidación continúa. PAGAMOS se mantiene: es la promesa al aliado.</strong> Estas diferencias no son una pérdida o ganancia bancaria confirmada ni autorizan pagos.</p></body></html>`;
}
function base64(s){const bytes=new TextEncoder().encode(s);let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);}
export function buildRaw(report){
 const body=base64(renderReport(report)).match(/.{1,76}/g).join('\r\n');
 const mime=['From: KORA <'+SENDER+'>','To: '+RECIPIENTS.join(', '),'Subject: =?UTF-8?B?'+base64('Krediya · Revisión de PVP · '+report.liquidation_id)+'?=',
 'Message-ID: <krediya-'+report.liquidation_id+'@crediteksas.com>','MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',body].join('\r\n');
 return base64(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function deliver(report,env,request=fetch){
 if(report.report_status!=='preparado'||!Array.isArray(report.contexts)||report.contexts.length!==report.operation_count)return {outcome:'failed'};
 let raw;try{raw=buildRaw(report);}catch{return {outcome:'failed'};}
 let token;
 try{
  const r=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.KORA_GMAIL_CLIENT_ID,client_secret:env.KORA_GMAIL_CLIENT_SECRET,refresh_token:env.KORA_GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)return {outcome:r.status>=500||r.status===429?'retry':'failed'};
  token=(await r.json()).access_token;if(!token)return {outcome:'failed'};
 }catch{return {outcome:'retry'};}
 try{
  const r=await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({raw}),signal:AbortSignal.timeout(25000)});
  if(!r.ok)return {outcome:r.status===429?'retry':r.status>=500?'ambiguous':'failed'};
  const {id}=await r.json();return /^[a-zA-Z0-9_-]{1,200}$/.test(id||'')?{outcome:'sent',messageId:id}:{outcome:'ambiguous'};
 }catch{return {outcome:'ambiguous'};}
}
