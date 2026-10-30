(async function(){
 'use strict';
 const $=id=>document.getElementById(id),node=(tag,value)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;return n;};
 const money=v=>v==null?'Pendiente':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(v);
 let model=null,busy=false,sb,profile;
 const schemas={
  orders:['payment_orders','id,liquidation_id,beneficiary_id,valor,estado,fecha_pagada,payment_kind,concept,soporte_path,historico_inicial'],
  beneficiaries:['liquidation_beneficiaries','id,nombre,identificacion'],
  entries:['financial_entries','id,status,beneficiary,beneficiary_document,amount,paid_at,entry_type,concept,support_path'],
  bankProviders:['banco_creditek_pagos_proveedor','id,proveedor_id,monto,concepto,estado,pagado_at,fecha_pago,soporte_path'],
  providerPayments:['pagos_proveedor','id,proveedor_id,monto,fecha,referencia,factura_id,soporte_path,metodo'],
  providerApplications:['banco_creditek_aplicaciones_proveedor','solicitud_id,pago_id','pago_id'],
  providers:['proveedores','id,nombre,nit'],
  history:['creditos_historicos_plataforma','id,plataforma,codigo_credito,fecha_credito,establecimiento,tipo_establecimiento,pago_neto_historico,bonos_historicos,evidencias:datos_origen->reconstrucciones_correo_2026'],
  operations:['liquidation_operations','id,liquidation_id,plataforma,external_id'],
  origins:['origenes','codigo,nombre,aliases','codigo'],
  allies:['aliados','id,payment_beneficiary_id'],
  sites:['aliados_sedes','id,aliado_id,origen_codigo'],
  expenses:['gastos','id,fecha,estado,tienda_codigo,monto,descripcion']
 };
 async function allRows([table,columns,order='id']){
  const result=[];let expected;
  for(let offset=0;;offset+=500){const {data,error,count}=await sb.from(table).select(columns,{count:'exact'}).order(order).range(offset,offset+499);
   if(error)throw Error(`No se pudo consultar ${table}: ${error.message}`);
   if(!Array.isArray(data)||!Number.isInteger(count))throw Error(`Respuesta incompleta de ${table}.`);
   if(expected==null)expected=count;if(count!==expected)throw Error(`Los datos de ${table} cambiaron durante la consulta. Actualiza nuevamente.`);
   result.push(...data);if(result.length===expected)return result;
   if(!data.length||result.length>expected)throw Error(`Consulta incompleta de ${table}.`);
  }
 }
 function clear(){model=null;$('exo-result').replaceChildren();$('exo-export').disabled=true;}
 function render(m){
  const root=$('exo-result');root.replaceChildren();
  const cards=node('div');cards.className='exo-cards';
  for(const [label,value] of [['Pagos con datos completos',money(m.total)],['Registros en resumen',m.confirmed.length],['Registros por revisar',m.pending.length]]){const c=node('section');c.append(node('h2',label),node('strong',value));cards.append(c);}root.append(cards);
  const intro=node('p','El total solo incluye pagos con fecha, beneficiario e importe completos. Los históricos declarados y demás pendientes están separados en el Excel. Tener datos completos no equivale a validación fiscal.');root.append(intro);
  const wrap=node('div');wrap.className='exo-table';const table=node('table'),head=node('thead'),tr=node('tr');for(const h of ['Beneficiario','Identificación','Categoría','Registros','Total COP'])tr.append(node('th',h));head.append(tr);table.append(head);const body=node('tbody');
  for(const g of m.summary){const r=node('tr');for(const v of [g.name,g.document,g.category,g.count,money(g.amount)])r.append(node('td',v));body.append(r);}table.append(body);wrap.append(table);root.append(wrap);
  const details=node('details');details.append(node('summary',`Pendientes de revisión (${m.pending.length})`));
  // La vista resume; el Excel conserva todos los registros y sus motivos.
  for(const r of m.pending.slice(0,30)){const p=node('p',`${r.name||'Beneficiario sin identificar'} · ${r.reference||r.id} · ${money(r.amount)} — ${r.issue}`);details.append(p);}
  if(m.pending.length>30)details.append(node('p','Mostrando los primeros 30. El Excel contiene todos los pendientes.'));root.append(details);
 }
 async function load(){if(busy)return;busy=true;clear();$('exo-load').disabled=true;$('exo-year').disabled=true;$('exo-status').textContent='Consultando todas las páginas de cada fuente…';
  try{const year=Number($('exo-year').value);if(!Number.isInteger(year)||year<2000||year>2100)throw Error('Selecciona un año válido.');
   const data={};for(const [name,schema] of Object.entries(schemas)){data[name]=await allRows(schema);}
   model=KoraExogena.build(data,year);render(model);$('exo-status').textContent=`Consulta completa · año ${year}. Descarga disponible con cobertura y pendientes.`;$('exo-export').disabled=false;
  }catch(e){clear();$('exo-status').textContent=e.message||'No fue posible completar la consulta. No se habilitó una descarga parcial.';}
  finally{busy=false;$('exo-load').disabled=false;$('exo-year').disabled=false;}
 }
 $('exo-year').value=new Date().getFullYear();$('exo-year').addEventListener('change',()=>{clear();$('exo-status').textContent='Pulsa Consultar para actualizar el año.';});
 try{const env=window.__KORA_ENV__;sb=supabase.createClient(env.KORA_ERP_SUPABASE_URL,env.KORA_ERP_SUPABASE_ANON_KEY);
  const {data,error}=await sb.auth.getUser();if(error||!data.user)throw Error('Inicia sesión para consultar el informe.');
  const p=await sb.from('perfiles').select('id,nombre,rol,activo,tienda_codigo').eq('id',data.user.id).single();if(p.error)throw p.error;profile=p.data;
  if(!window.KoraAccessControl?.authorize(profile,'exogena.html').allowed)throw Error('Este informe está habilitado para Óscar y Mayte.');
  $('exo-load').disabled=false;$('exo-load').addEventListener('click',load);
  $('exo-export').addEventListener('click',async()=>{if(!model||busy)return;const current=model;busy=true;$('exo-export').disabled=true;$('exo-load').disabled=true;$('exo-year').disabled=true;try{
   if(!window.KoraReportExport)throw Error('El exportador todavía está cargando. Intenta nuevamente.');
   await window.KoraReportExport.exportData(KoraExogena.report(current),{format:'xlsx',sb,profile});$('exo-status').textContent='Excel generado. Revisa las hojas de históricos, pendientes y cobertura antes de usarlo para la presentación.';
  }catch(e){$('exo-status').textContent=e.message;}finally{busy=false;$('exo-export').disabled=!model;$('exo-load').disabled=false;$('exo-year').disabled=false;}});
  $('exo-status').textContent='Selecciona el año y pulsa Consultar. La consulta no modifica saldos ni registra pagos.';
 }catch(e){$('exo-status').textContent=e.message;$('exo-load').disabled=true;}
})();
