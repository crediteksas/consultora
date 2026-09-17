export const RECIPIENTS=['gestion@crediteksas.com','comercial@crediteksas.com'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(n);
const base64=s=>{let out='';for(const b of new TextEncoder().encode(s))out+=String.fromCharCode(b);return btoa(out);};
export function renderReport(r){
 const total=r.items.reduce((s,i)=>s+i.cantidad*i.precio,0);
 return `<html><body style="font-family:Arial,sans-serif;color:#0b1e3d"><h2>KORA · Pedido ${esc(r.numero)}</h2><p><b>Destino: ${esc(r.tienda)}</b> · ${esc(r.ciudad||'Ciudad no registrada')}</p><p>${esc(new Date(r.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'}))}</p><table cellpadding="8" style="border-collapse:collapse" border="1"><thead><tr><th>Referencia</th><th>Cantidad</th><th>Proveedor</th><th>Costo unitario</th><th>Precio retail</th><th>Total retail</th></tr></thead><tbody>${r.items.map(i=>`<tr><td>${esc(i.referencia)}</td><td>${i.cantidad}</td><td>${esc(i.proveedor)}</td><td>${money(i.costo)}</td><td>${money(i.precio)}</td><td>${money(i.cantidad*i.precio)}</td></tr>`).join('')}</tbody></table><p><b>Total del pedido: ${money(total)}</b></p><p>Nota de la tienda: ${esc(r.nota||'Sin nota')}</p><p><a href="https://kora.crediteksas.com/creditek/erp/pedidos-b2b">Abrir pedidos y descargar el detalle</a></p><p>Solicitud de abastecimiento. No es una factura, pago ni movimiento de inventario. Precios y proveedor corresponden al momento del pedido.</p></body></html>`;
}
export function buildRaw(r){const body=base64(renderReport(r)).match(/.{1,76}/g).join('\r\n');return base64(['From: KORA <comercial@crediteksas.com>','To: '+RECIPIENTS.join(', '),'Subject: =?UTF-8?B?'+base64('KORA · '+r.numero+' · '+r.tienda)+'?=','Message-ID: <b2b-pedido-'+r.id+'@crediteksas.com>','MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',body].join('\r\n')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export async function deliver(report,env,request=fetch){
 if(!report.id||!report.tienda||!Array.isArray(report.items)||!report.items.length||report.items.some(i=>!Number.isFinite(Number(i.precio))||!Number.isFinite(Number(i.costo))||!(i.cantidad>0)))return {outcome:'failed'};
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
