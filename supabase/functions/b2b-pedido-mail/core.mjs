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
  for(const [city,items] of [...cities].sort(([a],[b])=>a.localeCompare(b,'es'))){
   body+=`<h4>${esc(city)} · Un solo pedido para esta ciudad</h4><table cellpadding="8" border="1" style="border-collapse:collapse;width:100%"><thead><tr><th>Referencia</th><th>Cantidad total</th><th>Costos cotizados</th><th>Total proveedor</th></tr></thead><tbody>${summarizeReferences(items).map(i=>`<tr><td>${esc(i.referencia)}</td><td>${i.cantidad}</td><td>${i.costos.map(c=>`${c.cantidad} × ${money(c.costo)}`).join('<br>')}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody></table><p>El proveedor organiza el despacho de esta ciudad. No se asigna una tienda receptora.</p>`;
  }
  body+=`<p><b>Total ${esc(provider)}: ${money([...cities.values()].flat().reduce((s,i)=>s+i.cantidad*i.costo,0))}</b></p>`;
 }
 const stores=new Map();
 for(const i of r.items){const key=`${i.ciudad||''}|${i.tienda_codigo||i.tienda||''}`;if(!stores.has(key))stores.set(key,{city:i.ciudad||'Ciudad no registrada',name:i.tienda||'Tienda no registrada',items:[]});stores.get(key).items.push(i);}
 const detail=[...stores.values()].sort((a,b)=>a.city.localeCompare(b.city,'es')||a.name.localeCompare(b.name,'es')).map(store=>{
  const rows=store.items.sort((a,b)=>String(a.proveedor).localeCompare(String(b.proveedor),'es')||String(a.referencia).localeCompare(String(b.referencia),'es'));
  const cost=rows.reduce((s,i)=>s+Number(i.cantidad)*Number(i.costo),0),sale=rows.reduce((s,i)=>s+Number(i.cantidad)*Number(i.precio),0);
  return `<h3>${esc(store.name)} · ${esc(store.city)}</h3><p>${new Set(rows.map(i=>i.pedido_id)).size} pedido(s) · ${rows.reduce((s,i)=>s+Number(i.cantidad),0)} unidades · Costo estimado ${money(cost)} · Valor a tienda ${money(sale)}</p><table cellpadding="8" border="1" style="border-collapse:collapse;width:100%"><thead><tr><th>Pedido</th><th>Proveedor</th><th>Referencia</th><th>Cantidad</th><th>Costo unitario</th><th>Precio a tienda</th></tr></thead><tbody>${rows.map(i=>`<tr><td>${esc(i.numero)}</td><td>${esc(i.proveedor)}</td><td>${esc(i.referencia)}</td><td>${Number(i.cantidad)}</td><td>${money(i.costo)}</td><td>${money(i.precio)}</td></tr>`).join('')}</tbody></table>`;
 }).join('');
 return `<html><body style="font-family:Arial,sans-serif;color:#0b1e3d"><h2>KORA · Cierre de período ${esc(r.numero)}</h2><p>${esc(new Date(r.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'}))} · ${new Set(r.items.map(i=>i.pedido_id)).size} pedidos · ${r.items.reduce((s,i)=>s+i.cantidad,0)} unidades</p>${body}<h3>Total costo proveedor: ${money(total)}</h3><p>Total retail: ${money(retail)} · Margen de estos pedidos: ${money(retail-total)}</p><h2>Distribución interna por tienda · no son despachos separados</h2><p>El reparto solicitado queda guardado por pedido y tienda. En KORA, abre este cierre y usa «Preparar compra» para cargar sus líneas en Compras y recepción; Maite revisa las cantidades y precios antes de crear cada orden. Las remisiones en borrador se generan solo al confirmar la recepción de mercancía y factura.</p>${detail}<p>Reporte conservado en el historial de cierres. Cerrar este período no confirma recepción, no crea facturas y no mueve inventario ni cartera.</p><p><a href="https://kora.crediteksas.com/creditek/erp/pedidos-b2b#cierrePedidos">Consultar cierre en KORA</a></p></body></html>`;
}
export function summarizeReferences(items){
 const refs=new Map();
 for(const i of items){
  const key=i.producto_id||i.referencia;
  if(!refs.has(key))refs.set(key,{referencia:i.referencia,cantidad:0,total:0,costs:new Map()});
  const row=refs.get(key),quantity=Number(i.cantidad),cost=Number(i.costo);
  row.cantidad+=quantity;row.total+=quantity*cost;
  row.costs.set(cost,(row.costs.get(cost)||0)+quantity);
 }
 return [...refs.values()].sort((a,b)=>String(a.referencia).localeCompare(String(b.referencia),'es')).map(({costs,...r})=>({...r,costos:[...costs].map(([costo,cantidad])=>({costo,cantidad}))}));
}
export function buildRaw(r){const body=base64(renderReport(r)).match(/.{1,76}/g).join('\r\n');return base64(['From: KORA <comercial@crediteksas.com>','To: '+RECIPIENTS.join(', '),'Subject: =?UTF-8?B?'+base64('KORA · '+r.numero+' · '+r.tienda)+'?=','Message-ID: <b2b-pedido-'+r.id+'@crediteksas.com>','MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',body].join('\r\n')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export async function deliver(report,env,request=fetch){
 if(report.tipo!=='cierre')return {outcome:'failed'};
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
