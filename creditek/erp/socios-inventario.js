(function(){
 'use strict';
 const root=document.getElementById('socios-inventario');if(!root||new URLSearchParams(location.search).get('vista')==='retail')return;
 const D=window.KoraFinancialDomain,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>v==null||!Number.isFinite(Number(v))?'No disponible':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(Number(v));
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}),$=id=>root.querySelector('#'+id);
 let sb,cuts=[],invoices=[],operations=[],busy=false,loaded=false,request=crypto.randomUUID(),prepared=null;
 const files=new WeakMap();
 root.hidden=false;
 root.innerHTML=`<div class="section-head"><div><h2>Liquidación de socios por inventario</h2><p>Registra solo dinero ya entregado o pagado, con soporte. Mayte decide los retiros parciales y los aportes; KORA no realiza transferencias.</p></div></div>
 <div class="socios-body"><div class="socios-toolbar"><label>Mes del inventario<input id="siMes" class="control" type="month" value="${today().slice(0,7)}"></label><button id="siActualizar" class="btn" type="button">Consultar inventarios</button></div>
 <p id="siEstado" role="status" aria-live="polite"></p><div id="siResultados" class="table-wrap"></div>
 <form id="siForm"><h3>Registrar retiro y reparto realizado</h3><div class="form-grid"><div class="field"><label for="siFuente">Inventario de la tienda que entrega el dinero</label><select id="siFuente" class="control" required disabled><option value="">Consulta el mes primero</option></select></div><div class="field"><label for="siFecha">Fecha real de entrega / pago</label><input id="siFecha" type="date" class="control" required value="${today()}" max="${today()}"></div></div>
 <p id="siEfectos">Selecciona la tienda positiva. Su deuda con B2B no disminuye por este retiro.</p>
 <div id="siDestinos"></div><div class="actions"><button id="siAgregar" type="button" class="btn">Agregar destino al reparto</button></div>
 <div class="field"><label for="siMotivo">Explicación del retiro y los aportes</label><textarea id="siMotivo" class="control" minlength="8" required rows="2"></textarea></div>
 <label class="socios-check"><input id="siConfirmar" type="checkbox" required><span>Confirmo que el dinero ya se entregó y que el reparto corresponde a los mismos socios.</span></label>
 <p id="siTotal" class="socios-total">TOTAL A RETIRAR DE CAJA: ${money(0)}</p><button id="siGuardar" class="btn primary" type="submit" disabled>Registrar movimiento realizado</button></form>
 <h3>Liquidaciones registradas del mes</h3><div id="siHistorial"></div></div>`;
 function status(text,error=false){$('siEstado').textContent=text;$('siEstado').className=error?'error':'';}
 function amounts(){return [...root.querySelectorAll('[data-si-destino]')].map(row=>({row,amount:D.parseMoneyInput(row.querySelector('[name=monto]').value)}));}
 function preview(){
  try{const total=amounts().reduce((n,x)=>n+Math.round((x.amount||0)*100),0)/100,source=cuts.find(x=>x.corte_id===$('siFuente').value);
   $('siTotal').textContent='TOTAL A RETIRAR DE CAJA: '+money(total);
   $('siEfectos').textContent=source?`${source.tienda_nombre}: disponible del corte ${money(source.disponible)}. Sale ${money(total)} de su caja; su deuda con B2B no cambia. Los aportes reducen únicamente la deuda de la tienda negativa y la del proveedor indicado.`:'Selecciona la tienda positiva. Su deuda con B2B no disminuye por este retiro.';
   $('siGuardar').disabled=busy||!loaded||!source?.listo||total<=0||total>Number(source.disponible);
  }catch(error){$('siTotal').textContent=error.message;$('siGuardar').disabled=true;}
 }
 function lock(value){root.querySelectorAll('#siForm input,#siForm select,#siForm textarea,#siAgregar,[data-si-quitar]').forEach(e=>e.disabled=value||!loaded);$('siGuardar').disabled=busy||!loaded;$('siMes').disabled=busy||Boolean(prepared);$('siActualizar').disabled=busy;}
 function addDestination(){
  if(root.querySelectorAll('[data-si-destino]').length>=20)return;
  const row=document.createElement('fieldset');row.dataset.siDestino='';row.className='socios-destino';
  row.innerHTML=`<legend>Destino del dinero</legend><div class="form-grid"><div class="field"><label>Destino<select name="tipo" class="control"><option value="socio">Entrega al socio</option><option value="aporte">Aporte de socios a tienda con pérdida · pago directo a proveedor</option></select></label></div><div class="field"><label>Valor en pesos<input name="monto" class="control" inputmode="decimal" placeholder="$ 0" required></label></div><div data-si-detalle class="field full"></div><div class="field full"><label>Soporte de este destino · imagen máx. 2 MB o PDF máx. 10 MB<input name="soporte" type="file" class="control" accept="application/pdf,image/jpeg,image/png" required></label></div></div><button type="button" class="btn" data-si-quitar>Quitar destino</button>`;
  const detail=row.querySelector('[data-si-detalle]');
  const update=()=>{if(row.querySelector('[name=tipo]').value==='socio')detail.innerHTML='<label>Socio que recibió el dinero<input name="beneficiario" class="control" minlength="3" required></label>';
   else detail.innerHTML=`<label>Inventario de la tienda que recibe el aporte<select name="corte" class="control" required><option value="">Selecciona una pérdida pendiente</option>${cuts.filter(x=>x.listo&&Number(x.perdida_pendiente)>0).map(x=>`<option value="${esc(x.corte_id)}">${esc(x.tienda_nombre)} · pérdida pendiente ${esc(money(x.perdida_pendiente))}</option>`).join('')}</select></label><label>Factura del proveedor que recibió el pago<select name="factura" class="control" required><option value="">Selecciona el proveedor y la factura</option>${invoices.map(x=>`<option value="${esc(x.id)}">${esc(x.proveedor)} · ${esc(x.numero)} · saldo ${esc(money(x.saldo))}</option>`).join('')}</select></label><small>El aporte no entra a la caja de la tienda negativa ni a Banco Creditek. El soporte debe corresponder a este proveedor.</small>`;
   preview();};
  row.querySelector('[name=tipo]').onchange=update;row.querySelector('[data-si-quitar]').onclick=()=>{row.remove();preview();};
  row.querySelector('[name=monto]').addEventListener('input',preview);row.querySelector('[name=monto]').addEventListener('blur',event=>{try{event.target.value=D.formatMoneyInput(event.target.value);}catch{};preview();});
  $('siDestinos').append(row);update();
 }
 function results(){
  const columns=[['utilidad_neta','Resultado del inventario'],['retiros_anteriores','Retiros anteriores'],['retirado','Retirado en este flujo'],['disponible','Disponible positivo'],['perdida_cubierta','Pérdida cubierta'],['perdida_pendiente','Pérdida pendiente']];
  const valid=cuts.filter(c=>c.listo),sum=key=>valid.some(c=>c[key]==null||!Number.isFinite(Number(c[key])))?'Incompleto':money(valid.reduce((n,c)=>n+Math.round(Number(c[key])*100),0)/100);
  $('siResultados').innerHTML=cuts.length?`<table class="table socios-table"><thead><tr><th>Tienda y período</th>${columns.map(x=>`<th>${x[1]}</th>`).join('')}<th>Estado</th></tr></thead><tbody>${cuts.map(c=>`<tr><td><strong>${esc(c.tienda_nombre)}</strong><small>${esc((c.inicio_at||'').slice(0,10))} a ${esc((c.fin_at||'').slice(0,10))}</small></td>${columns.map(([key])=>`<td>${!c.listo&&key==='disponible'?'No habilitado':esc(money(c[key]))}</td>`).join('')}<td>${c.listo?'Validado para liquidar':'Por validar'}${c.listo?'':`<small>${esc((c.bloqueos||[]).join(' '))}</small>`}</td></tr>`).join('')}</tbody><tfoot><tr><th>TOTAL VALIDADO</th>${columns.map(([key])=>`<td>${valid.length?sum(key):'No disponible'}</td>`).join('')}<td>Excluye los resultados por validar; no habilita retiros sobre ellos</td></tr></tfoot></table>`:'<p>No hay inventarios físicos cerrados y autorizados en el mes seleccionado.</p>';
  $('siFuente').innerHTML='<option value="">Selecciona la tienda positiva</option>'+cuts.filter(c=>c.listo&&Number(c.disponible)>0).map(c=>`<option value="${esc(c.corte_id)}">${esc(c.tienda_nombre)} · ${esc(money(c.disponible))} disponible</option>`).join('');
  $('siHistorial').innerHTML=operations.length?operations.map(o=>`<details class="socios-history"><summary>${esc(o.fecha)} · ${esc(o.tienda)} · retiro ${esc(money(o.monto))}</summary><p>${esc(o.motivo)}</p><p class="socios-trace">Operación ${esc(o.id)} · corte ${esc(o.corte_id)}</p><ul>${o.destinos.map(x=>`<li>${esc(x.tipo==='socio'?'Entrega al socio: '+x.beneficiario:'Aporte de socios para cubrir pérdida: '+x.tienda_destino+' · '+x.proveedor+' · factura '+x.factura)} · ${esc(money(x.monto))} <button type="button" class="btn" data-si-soporte="${esc(x.soporte_path)}">Ver soporte</button></li>`).join('')}</ul><p><strong>TOTAL RETIRADO: ${esc(money(o.monto))}</strong></p></details>`).join(''):'<p>No hay liquidaciones registradas para estos inventarios.</p>';
 }
 async function all(table,columns){const rows=[];for(let offset=0;;offset+=500){const r=await sb.from(table).select(columns).order('id').range(offset,offset+499);if(r.error)throw r.error;if(!Array.isArray(r.data))throw Error('Respuesta incompleta al consultar '+table);rows.push(...r.data);if(r.data.length<500)return rows;}}
 async function load(){
  if(busy)return;busy=true;loaded=false;lock(true);status('Consultando resultados y movimientos registrados…');
  try{const [r,providers,bills]=await Promise.all([sb.rpc('socios_inventario',{p_accion:'consultar',p_datos:{mes:$('siMes').value}}),all('proveedores','id,nombre,activo'),all('facturas_proveedor','id,proveedor_id,numero,saldo')]);
   if(r.error)throw r.error;if(!Array.isArray(r.data?.cortes)||!Array.isArray(r.data?.operaciones))throw Error('La consulta de inventarios está incompleta.');
   cuts=r.data.cortes;operations=r.data.operaciones;invoices=bills.filter(x=>providers.some(p=>p.id===x.proveedor_id&&p.activo)).map(x=>({...x,proveedor:providers.find(p=>p.id===x.proveedor_id).nombre}));
   loaded=true;results();
   if(prepared&&operations.some(o=>o.id===request)){prepared=null;request=crypto.randomUUID();$('siForm').reset();status('El movimiento ya estaba registrado. Se recuperó su confirmación sin duplicarlo.');}
   else{if(prepared)$('siFuente').value=prepared.corte_id;status(prepared?'Hay un envío pendiente de confirmar. Reintenta la misma solicitud; no la crees otra vez.':`${cuts.length} inventarios consultados. Solo los resultados validados tienen disponible para operar.`);}
   if(!prepared){$('siDestinos').replaceChildren();addDestination();}
  }catch(error){cuts=[];operations=[];status('No se pudo verificar la liquidación. '+error.message,true);$('siResultados').textContent='Consulta incompleta: no equivale a cero.';$('siHistorial').textContent='No se pudo comprobar el historial; vuelve a consultar.';$('siFuente').replaceChildren();}
  finally{busy=false;lock(Boolean(prepared));if(prepared)$('siGuardar').disabled=!loaded;else preview();}
 }
 async function support(file){
  if(!file||!file.size)throw Error('Adjunta el soporte de cada destino.');
  const ext=(file.name.split('.').pop()||'').toLowerCase();if(!['pdf','jpg','jpeg','png'].includes(ext))throw Error('Usa soporte PDF, JPG o PNG.');
  if(file.size>(ext==='pdf'?10:2)*1024*1024)throw Error(ext==='pdf'?'El PDF supera 10 MB.':'La foto supera 2 MB. Baja la resolución o comprímela y vuelve a adjuntarla.');
  let saved=files.get(file);if(saved?.ready)return saved.path;
  if(!saved){saved={path:`finanzas/${crypto.randomUUID()}.${ext}`,ready:false};files.set(file,saved);}
  const r=await sb.storage.from('soportes').upload(saved.path,file,{upsert:false,contentType:ext==='pdf'?'application/pdf':ext==='png'?'image/png':'image/jpeg'});
  if(r.error){
   // Una subida puede haberse guardado aunque se pierda su respuesta. Comprobar
   // exclusivamente esta ruta evita otro archivo y conserva el mismo reintento.
   const check=await sb.storage.from('soportes').createSignedUrl(saved.path,60);
   if(check.error||!check.data?.signedUrl)throw r.error;
  }
  saved.ready=true;return saved.path;
 }
 async function submit(event){
  event.preventDefault();if(busy||!loaded)return;
  busy=true;lock(true);$('siGuardar').disabled=true;let sent=false;
  try{
   if(!prepared){const source=cuts.find(c=>c.corte_id===$('siFuente').value);if(!source?.listo)throw Error('Selecciona un resultado positivo validado.');
    const rows=amounts();if(!rows.length||rows.some(x=>!x.amount||!Number.isSafeInteger(Math.round(x.amount*100))))throw Error('Revisa el valor de cada destino.');
    const total=rows.reduce((n,x)=>n+Math.round(x.amount*100),0)/100;if(total>Number(source.disponible))throw Error('El reparto supera el disponible del inventario.');
    if(!$('siConfirmar').checked)throw Error('Confirma que el dinero se entregó y corresponde a los mismos socios.');
    const list=[];for(const {row,amount} of rows){const type=row.querySelector('[name=tipo]').value,item={tipo:type,monto:amount.toFixed(2)};
     if(type==='socio'){item.beneficiario=row.querySelector('[name=beneficiario]').value.trim();if(item.beneficiario.length<3)throw Error('Identifica al socio que recibió el dinero.');}
     else{const target=cuts.find(c=>c.corte_id===row.querySelector('[name=corte]').value);if(!target?.listo||target.grupo!==source.grupo)throw Error('Selecciona una pérdida validada de los mismos socios.');item.corte_id=target.corte_id;item.huella=target.huella;item.factura_id=row.querySelector('[name=factura]').value;if(!item.factura_id)throw Error('Selecciona la factura del proveedor.');}
     item.soporte_path=await support(row.querySelector('[name=soporte]').files[0]);list.push(item);
    }
    if(!confirm(`¿Confirmas registrar ${money(total)} ya retirados de la caja de ${source.tienda_nombre}? No reduce su deuda con B2B. Los aportes del reparto abonan solo a las tiendas negativas y al proveedor indicado. No se puede registrar dos veces.`))return;
    prepared={corte_id:source.corte_id,huella:source.huella,fecha:$('siFecha').value,motivo:$('siMotivo').value.trim(),socios_comunes:true,destinos:list};
   }
   status('Registrando retiro y reparto en una sola operación…');sent=true;
   const r=await sb.rpc('socios_inventario',{p_accion:'registrar',p_datos:prepared,p_request_id:request});
   if(r.error){if(r.error.code&&/^(P0001|22|23)/.test(r.error.code))prepared=null;throw r.error;}
   if(r.data?.ok!==true)throw Error('No se recibió confirmación. Reintenta la misma solicitud.');
   prepared=null;request=crypto.randomUUID();$('siForm').reset();document.dispatchEvent(new CustomEvent('kora-notifications-refresh'));document.dispatchEvent(new CustomEvent('socios-inventario-registrado'));
   busy=false;await load();status('Movimiento registrado con su inventario, reparto y soportes. El resultado original no se modificó.');
  }catch(error){status((prepared&&sent?'Confirmación pendiente: conserva los datos y reintenta esta misma solicitud. ':'No se registró el movimiento. ')+error.message,true);}
  finally{busy=false;lock(Boolean(prepared));if(prepared){$('siGuardar').textContent='Reintentar la misma solicitud';$('siGuardar').disabled=!loaded;}else{$('siGuardar').textContent='Registrar movimiento realizado';preview();}}
 }
 $('siForm').addEventListener('submit',submit);$('siFuente').addEventListener('change',preview);$('siAgregar').onclick=addDestination;$('siActualizar').onclick=load;
 $('siMes').onchange=()=>{loaded=false;cuts=[];operations=[];$('siFuente').replaceChildren();$('siResultados').textContent='Pulsa Consultar inventarios para cargar el nuevo mes.';$('siHistorial').textContent='Consulta el mes seleccionado para ver su historial.';lock(true);$('siMes').disabled=false;$('siActualizar').disabled=false;$('siGuardar').disabled=true;};
 root.addEventListener('click',async event=>{const button=event.target.closest('[data-si-soporte]');if(!button)return;const popup=window.open('about:blank','_blank');if(!popup){status('Permite ventanas emergentes para abrir el soporte.',true);return;}popup.opener=null;try{const r=await sb.storage.from('soportes').createSignedUrl(button.dataset.siSoporte,60);if(r.error||!r.data?.signedUrl)throw r.error||Error('No se pudo abrir el soporte');popup.location.href=r.data.signedUrl;}catch(error){popup.close();status(error.message,true);}});
 const start=context=>{sb=context.sb;load();};if(window.creditekSidebar?.sb)start(window.creditekSidebar);else document.addEventListener('kora-sidebar-ready',()=>start(window.creditekSidebar),{once:true});
})();
