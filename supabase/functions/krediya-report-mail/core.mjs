export const RECIPIENTS=['gestion@crediteksas.com','comercial@crediteksas.com'];
export const SENDER='comercial@crediteksas.com';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(n);
const price=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function profitSummary(contexts){
 const groups=new Map(),pending=[];let totalCents=0,calculated=0,excluded=0;
 for(const c of contexts){
  const u=c.automatica,net=price(u?.utilidad_neta);
  if(c.reconocida===false||u?.motivo==='Operación excluida'){excluded++;continue;}
  if(u?.disponible!==true||net===null){pending.push({ref:c.referencia||c.modelo||'Referencia pendiente',credit:c.credito||c.operation_id||'',reason:u?.motivo||'Estimación no disponible'});continue;}
  const cents=Math.round(net*100),ref=String(c.referencia||c.modelo||'Referencia pendiente');
  // Sum actual estimates; keep different price/PAGAMOS bases separate, never average.
  const key=JSON.stringify([ref,u.pvp,u.pagamos]);
  const g=groups.get(key)||{ref,pvp:price(u.pvp),pagamos:price(u.pagamos),n:0,totalCents:0};
  g.n++;g.totalCents+=cents;groups.set(key,g);totalCents+=cents;calculated++;
 }
 return {groups:[...groups.values()].sort((a,b)=>a.ref.localeCompare(b.ref)),pending,excluded,calculated,total:totalCents/100};
}
export function reportRows(contexts){
 const groups=new Map();
 for(const c of contexts){
  const ref=String(c.referencia||c.modelo||'Referencia pendiente'),k=price(c.pvp_guardado),r=price(c.pvp_recibido);
  const key=JSON.stringify([ref,k,r]),g=groups.get(key)||{ref,k,r,n:0,contexts:[]};
  g.n++;g.contexts.push(c);groups.set(key,g);
 }
 return [...groups.values()].sort((a,b)=>a.ref.localeCompare(b.ref));
}
function profitCell(contexts){
 const s=profitSummary(contexts);
 const value=s.calculated?(s.pending.length?'Subtotal: ':'')+money(s.total):(s.excluded===contexts.length?'Excluidos':'No disponible');
 const status=s.pending.length||s.excluded?`<br><small>${s.calculated} calculados · ${s.pending.length} pendientes · ${s.excluded} excluidos</small>`:'';
 const reasons=s.pending.map(p=>`<br><small>Crédito ${escape(p.credit)}: ${escape(p.reason)}</small>`).join('');
 return value+status+reasons;
}
export function renderReport(report){
 const rows=reportRows(report.contexts),s=profitSummary(report.contexts);
 let missing=0,compared=0,affected=0;
 for(const c of report.contexts){
  const k=price(c.pvp_guardado),r=price(c.pvp_recibido);
  if(k===null||r===null){missing++;continue;}
  compared++;if(Math.abs(k-r)>=0.005)affected++;
 }
 const date=new Date(report.created_at);
 const asOf=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'}).format(date):'fecha de preparación no disponible';
 const amount=n=>n===null?'No disponible':money(n);
 const head='<tr><th>Equipo</th><th>Créditos</th><th>PVP KORA</th><th>PVP archivo</th><th>Diferencia por crédito</th><th>Diferencia total</th><th>Utilidad neta estimada (total)</th></tr>';
 const table=rows.map(g=>{
  const delta=g.k===null||g.r===null?null:g.r-g.k;
  return `<tr><td>${escape(g.ref)}</td><td>${g.n}</td><td>${amount(g.k)}</td><td>${amount(g.r)}</td><td>${amount(delta)}</td><td>${amount(delta===null?null:delta*g.n)}</td><td>${profitCell(g.contexts)}</td></tr>`;
 }).join('');
 const total=s.calculated?`${s.pending.length?'Subtotal estimado (parcial)':'Total estimado'}: ${money(s.total)}`:'Utilidad no disponible: no hay créditos calculables.';
 return `<html><body style="font-family:Arial,sans-serif;color:#10213e"><h2>Krediya · Revisión de PVP y utilidad</h2><p>Lote: ${escape(report.liquidation_id)}</p><p>Consulta al ${escape(asOf)} (Colombia).</p><p>${report.operation_count} créditos importados · ${compared} comparados · ${affected} con diferencias · ${missing} sin comparación completa.</p><p>El mismo detalle de PVP, con la utilidad neta estimada en la última columna. Se incluyen también los créditos sin diferencias para mostrar el lote completo.</p><div style="max-width:100%;overflow-x:auto"><table cellpadding="8" border="1" style="border-collapse:collapse">${head}${table}</table></div><p><strong>${total}</strong><br>${s.calculated} créditos calculados · ${s.pending.length} sin estimación · ${s.excluded} excluidos de liquidación.</p>${s.pending.length?'<p>El subtotal es parcial: los pendientes se identifican en su fila y no se consideran utilidad cero.</p>':''}<p>Diferencia = PVP del archivo menos PVP KORA vigente en la fecha de venta. La diferencia total y la utilidad total corresponden a los créditos de cada fila, sin promediar.</p><p>La utilidad usa el PVP del archivo y el PAGAMOS aplicable a cada venta, descontando los bonos, el gasto financiero y la provisión del motor Krediya. Es una estimación al preparar el informe, no una liquidación aprobada ni dinero recibido. <strong>PAGAMOS se mantiene y este informe no autoriza pagos.</strong></p></body></html>`;
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
