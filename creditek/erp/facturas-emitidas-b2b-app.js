(function(){
 'use strict';
 const $=id=>document.getElementById(id),D=window.KoraFacturasEmitidas;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0}).format(value);
 const env=window.__KORA_ENV__,sb=supabase.createClient(env.KORA_ERP_SUPABASE_URL,env.KORA_ERP_SUPABASE_ANON_KEY);
 let data={invoices:[],certificates:[],retentions:[]},names=new Map(),view=null,page=0,profile=null,loading=false;
 const date=s=>s?s.split('-').reverse().join('/'):'—',name=code=>names.get(code)||code;
 const cell=(label,content)=>'<td data-label="'+esc(label)+'">'+content+'</td>';
 const source=id=>{const href=D.emailLink(id);return href?'<a class="source-link" target="_blank" rel="noopener noreferrer" href="'+href+'">Ver correo original</a>':'';};
 function render(){
  if(loading)return;
  try{view=D.select(data,{year:$('year').value,client:$('client').value,search:$('search').value,review:$('onlyReview').checked});}
  catch(e){fail(e);return;}
  $('base').textContent=money(view.totals.subtotal);$('vat').textContent=money(view.totals.iva);$('gross').textContent=money(view.totals.total);$('reviewAmount').textContent=money(view.totals.por_revisar);
  $('invoiceCount').textContent=view.totals.count+' facturas en la consulta. '+view.totals.confirmadas+' confirmadas, '+view.totals.pendientes+' con anulación por verificar y '+view.totals.anuladas+' anuladas. La retención impresa y la certificada se presentan por separado.';
  const pages=Math.max(1,Math.ceil(view.invoices.length/25));page=Math.min(page,pages-1);
  $('invoices').innerHTML=view.invoices.slice(page*25,(page+1)*25).map(f=>{
   const rs=view.byInvoice.get(f.id)||[];const certified=type=>{const rows=rs.filter(r=>view.certificates.find(c=>c.id===r.certificado_id)?.tipo===type);if(!rows.length)return '—';return money(D.sum(rows,'valor'))+(rows.some(r=>!D.matched(r))?'<small>Por revisar</small>':'');};
   return '<tr>'+cell('Factura','<b>'+esc(f.numero)+'</b><small>'+date(f.fecha)+' · '+esc(name(f.cliente_codigo))+'</small>'+(f.estado_documento!=='emitida'?'<small class="warning">'+(f.estado_documento==='anulada'?'Anulada':'Anulación por verificar')+'</small>':''))+cell('Base',money(Number(f.subtotal)))+cell('IVA',money(Number(f.iva)))+cell('Total',money(Number(f.total)))+cell('Retención impresa',money(Number(f.retencion_impresa)))+cell('ReteICA certificada',certified('ICA'))+cell('ReteIVA certificada',certified('IVA'))+cell('ReteRenta certificada',certified('Renta'))+cell('Detalle','<button class="fiscal-button" data-invoice="'+esc(f.id)+'">Ver factura</button>')+'</tr>';
  }).join('')||'<tr><td colspan="9" class="empty">No hay facturas para estos filtros.</td></tr>';
  $('previous').disabled=page===0;$('next').disabled=page+1>=pages;$('pageNumber').textContent=(page+1)+' / '+pages;
  $('months').innerHTML=view.months.filter(m=>m.count||m.pendingCount).map(m=>'<tr>'+cell('Mes',esc(m.month))+cell('Confirmadas',m.count)+cell('Base confirmada',money(m.subtotal))+cell('IVA confirmado',money(m.iva))+cell('Total confirmado',money(m.total))+cell('Por verificar',money(m.por_revisar))+'</tr>').join('')||'<tr><td colspan="6" class="empty">Sin facturas del año seleccionado.</td></tr>';
  $('certificates').innerHTML=view.certificates.map(c=>'<article class="certificate"><h3>'+esc(name(c.cliente_codigo))+' · Rete'+esc(c.tipo)+'</h3><p>'+date(c.desde)+' a '+date(c.hasta)+'</p><strong>'+money(Number(c.valor_certificado))+'</strong><p>'+c.lineas+' líneas del certificado. Detalle: '+money(c.detalle_total)+'. Diferencia con el total: '+(typeof D.difference(c.diferencia_total)==='string'?D.difference(c.diferencia_total):money(c.diferencia_total))+'.</p><p class="'+(c.pendientes||c.diferencia_total?'warning':'ok')+'">'+(c.diferencia_total?'El detalle no cuadra con el total del certificado. ':'' )+(c.pendientes?c.pendientes+' líneas por revisar.':c.diferencia_total?'Revisar la integridad del certificado.':'Cruce sin diferencias.')+'</p>'+source(c.fuente_correo_id)+'</article>').join('')||'<p>No hay certificados cargados para el año y cliente seleccionados. Esto no confirma que la retención sea cero.</p>';
  $('reviewSummary').textContent=view.pendingRetentions.length+' líneas del certificado por revisar';
  $('retentionReview').innerHTML=view.pendingRetentions.map(r=>{const c=view.certificates.find(c=>c.id===r.certificado_id),f=data.invoices.find(f=>f.id===r.factura_id);return '<tr>'+cell('Impuesto y fecha','Rete'+esc(c.tipo)+'<small>'+date(r.fecha)+'</small>')+cell('Referencia',esc(r.referencia))+cell('Retenido',money(Number(r.valor)))+cell('Factura relacionada',esc(f?.numero||r.candidatas?.join(', ')||'No localizada'))+cell('Qué revisar','<b>'+esc(D.labels[r.estado])+'</b><small>'+esc(r.nota)+'</small>')+'</tr>';}).join('')||'<tr><td colspan="5" class="empty">No hay diferencias de cruce en los certificados consultados.</td></tr>';
  $('export').disabled=!view.invoices.length&&!view.certificates.length;$('error').hidden=true;
 }
 function detail(id){
  const f=data.invoices.find(f=>f.id===id);if(!f)return;
  $('detailTitle').textContent=f.numero+' · '+name(f.cliente_codigo);
  const values=[['Fecha',date(f.fecha)],['Base antes de IVA',money(Number(f.subtotal))],['IVA',money(Number(f.iva))],['Total factura',money(Number(f.total))],['Retención impresa',money(Number(f.retencion_impresa))],['Neto impreso',money(Number(f.neto_impreso))]];
  const rs=data.retentions.filter(r=>r.factura_id===f.id);
  $('detailBody').innerHTML='<div class="invoice-values">'+values.map(([label,v])=>'<div><span>'+esc(label)+'</span><b>'+esc(v)+'</b></div>').join('')+'</div><p class="fiscal-note">El neto impreso es el valor del documento. No confirma pago recibido ni saldo pendiente.</p>'+(f.motivo_revision?'<p class="warning">'+esc(f.motivo_revision)+'</p>':'')+'<h3>Producto y solicitud</h3><div class="fiscal-detail-text">'+esc(f.detalle)+'\n'+esc(f.observacion)+'</div><p>'+source(f.fuente_correo_id)+'</p><h3>Retenciones certificadas relacionadas</h3>'+(rs.map(r=>{const c=data.certificates.find(c=>c.id===r.certificado_id);return '<div class="detail-retention"><b>Rete'+esc(c.tipo)+': '+money(Number(r.valor))+'</b><p>'+esc(D.labels[r.estado])+' · '+date(r.fecha)+'</p><p>'+esc(r.referencia)+'</p><p>'+esc(r.nota)+'</p>'+source(c.fuente_correo_id)+'</div>';}).join('')||'<p>No hay una línea del certificado vinculada a esta factura. Las referencias por revisar aparecen en la conciliación.</p>')+'<p class="fiscal-note">Documento: '+esc(f.fuente_archivo)+'</p>';
  $('detail').showModal();
 }
 function fail(e){view=null;$('export').disabled=true;$('error').hidden=false;$('error').textContent='No fue posible cargar la información completa: '+(e.message||e)+'. Pulsa Actualizar para reintentar.';$('status').textContent='Consulta incompleta. No equivale a valores cero.';['base','vat','gross','reviewAmount'].forEach(id=>$(id).textContent='—');$('invoices').innerHTML='';$('months').innerHTML='';$('certificates').innerHTML='';$('retentionReview').innerHTML='';$('invoiceCount').textContent='';$('reviewSummary').textContent='Conciliación no disponible';$('detail').close();}
 async function load(){
  if(loading)return;loading=true;$('refresh').disabled=true;$('export').disabled=true;$('status').textContent='Cargando todas las facturas y certificados…';$('error').hidden=true;$('detail').close();
  try{
   const [invoices,certificates,retentions,clients]=await Promise.all([
    D.readAll(()=>sb.from('b2b_facturas_emitidas').select('*').order('id')),
    D.readAll(()=>sb.from('b2b_certificados_cliente').select('*').order('id')),
    D.readAll(()=>sb.from('b2b_retenciones_cliente').select('*').order('id')),
    D.readAll(()=>sb.from('origenes').select('codigo,nombre').eq('tipo','cliente_b2b').order('codigo'))
   ]);
   data={invoices,certificates,retentions};names=new Map(clients.map(c=>[c.codigo,c.nombre]));
   const previous=$('year').value,yr=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}).slice(0,4);
   const years=[...new Set([yr,...invoices.map(f=>f.fecha.slice(0,4)),...certificates.map(c=>c.hasta.slice(0,4))])].sort().reverse();
   $('year').innerHTML=years.map(y=>'<option>'+y+'</option>').join('');$('year').value=years.includes(previous)?previous:yr;
   const client=$('client').value;$('client').innerHTML='<option value="">Todos los clientes</option>'+clients.map(c=>'<option value="'+esc(c.codigo)+'">'+esc(c.nombre)+'</option>').join('');$('client').value=clients.some(c=>c.codigo===client)?client:'';
   page=0;loading=false;render();if(view)$('status').textContent='Documentos actualizados. Los totales corresponden a las facturas del filtro.';
  }catch(e){fail(e);}finally{loading=false;$('refresh').disabled=false;}
 }
 async function start(){
  try{
   const {data:{session},error}=await sb.auth.getSession();if(error)throw error;if(!session){location.href='app.html';return;}
   const p=await sb.from('perfiles').select('id,rol,activo,nombre').eq('id',session.user.id).single();if(p.error)throw p.error;profile=p.data?{...p.data,email:session.user.email}:null;
   if(!profile?.activo||!['gerencia','auditoria'].includes(profile.rol)){location.href='app.html';return;}
   $('app').hidden=false;$('app').classList.add('show');await load();
  }catch(e){$('app').hidden=false;fail(e);}
 }
 ['year','client','onlyReview'].forEach(id=>$(id).onchange=()=>{page=0;render();});$('search').oninput=()=>{page=0;render();};$('refresh').onclick=load;$('previous').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('invoices').onclick=e=>{const button=e.target.closest('[data-invoice]');if(button)detail(button.dataset.invoice);};$('closeDetail').onclick=()=>$('detail').close();
 $('export').onclick=async()=>{if(!view||loading)return;$('export').disabled=true;try{await window.KoraReportExport.exportData(D.report(view,names,$('year').value,$('client').value),{format:'xlsx',sb,profile});$('status').textContent='Excel generado con facturas y conciliación del certificado.';}catch(e){$('status').textContent='No fue posible descargar el Excel: '+e.message;}finally{$('export').disabled=loading||!view||(!view.invoices.length&&!view.certificates.length);}};
 start();
})();
