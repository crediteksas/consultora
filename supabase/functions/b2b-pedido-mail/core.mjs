export const RECIPIENTS=['gestion@crediteksas.com','comercial@crediteksas.com'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(n);
const base64=s=>{let out='';for(const b of new TextEncoder().encode(s))out+=String.fromCharCode(b);return btoa(out);};
export function renderReport(r){
 if(r.tipo==='cierre')return renderClosure(r);
 const total=r.items.reduce((s,i)=>s+i.cantidad*i.precio,0);
 return `<html><body style="font-family:Arial,sans-serif;color:#0b1e3d"><h2>KORA · Pedido ${esc(r.numero)}</h2><p><b>Destino: ${esc(r.tienda)}</b> · ${esc(r.ciudad||'Ciudad no registrada')}</p><p>${esc(new Date(r.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'}))}</p><table cellpadding="8" style="border-collapse:collapse" border="1"><thead><tr><th>Referencia</th><th>Cantidad</th><th>Proveedor</th><th>Costo unitario</th><th>Precio retail</th><th>Total retail</th></tr></thead><tbody>${r.items.map(i=>`<tr><td>${esc(i.referencia)}</td><td>${i.cantidad}</td><td>${esc(i.proveedor)}</td><td>${money(i.costo)}</td><td>${money(i.precio)}</td><td>${money(i.cantidad*i.precio)}</td></tr>`).join('')}</tbody></table><p><b>Total del pedido: ${money(total)}</b></p><p>Nota de la tienda: ${esc(r.nota||'Sin nota')}</p><p><a href="https://kora.crediteksas.com/creditek/erp/pedidos-b2b">Abrir pedidos y descargar el detalle</a></p><p>Solicitud de abastecimiento. No es una factura, pago ni movimiento de inventario. Precios y proveedor corresponden al momento del pedido.</p></body></html>`;
}
export function renderClosure(r){
 const providers=new Map();
 for(const i of r.items){const key=i.proveedor||'Proveedor pendiente';if(!providers.has(key))providers.set(key,new Map());const cities=providers.get(key),city=i.ciudad||'Ciudad no registrada';if(!cities.has(city))cities.set(city,[]);cities.get(city).push(i);}
 const total=r.items.reduce((s,i)=>s+i.cantidad*i.costo,0),retail=r.items.reduce((s,i)=>s+i.cantidad*i.precio,0);
 let body='';
 for(const [provider,cities] of [...providers].sort(([a],[b])=>a.localeCompare(b,'es'))){body+=`<h3>${esc(provider)}</h3>`;
  for(const [city,items] of [...cities].sort(([a],[b])=>a.localeCompare(b,'es'))){body+=`<h4>${esc(city)}</h4><table cellpadding="8" border="1" style="border-collapse:collapse;width:100%"><thead><tr><th>Tienda / pedido</th><th>Referencia</th><th>Cantidad</th><th>Costo unitario</th><th>Total proveedor</th><th>Precio retail unitario</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.tienda)}<br>${esc(i.numero)}</td><td>${esc(i.referencia)}</td><td>${i.cantidad}</td><td>${money(i.costo)}</td><td>${money(i.cantidad*i.costo)}</td><td>${money(i.precio)}</td></tr>`).join('')}</tbody></table>`;}
  body+=`<p><b>Total ${esc(provider)}: ${money([...cities.values()].flat().reduce((s,i)=>s+i.cantidad*i.costo,0))}</b></p>`;
 }
 return `<html><body style="font-family:Arial,sans-serif;color:#0b1e3d"><h2>KORA · Cierre de período ${esc(r.numero)}</h2><p>${esc(new Date(r.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'}))} · ${new Set(r.items.map(i=>i.pedido_id)).size} pedidos · ${r.items.reduce((s,i)=>s+i.cantidad,0)} unidades</p>${body}<h3>Total costo proveedor: ${money(total)}</h3><p>Total retail: ${money(retail)} · Margen de estos pedidos: ${money(retail-total)}</p><p>Reporte conservado en el historial de cierres. Cerrar este período no confirma recepción, no crea facturas y no mueve inventario ni cartera.</p><p><a href="https://kora.crediteksas.com/creditek/erp/pedidos-b2b#cierrePedidos">Consultar cierre en KORA</a></p></body></html>`;
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
