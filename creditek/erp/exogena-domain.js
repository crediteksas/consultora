/* Auxiliar de pagos: no registra movimientos ni determina conceptos fiscales. */
(function(root){
 'use strict';
 const text=v=>String(v??'').trim();
 const key=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
 const documentId=v=>text(v).replace(/[.\s]/g,''); // Conserva DV, guiones y ceros iniciales.
 function amount(v){if(v==null||text(v)===''||!Number.isFinite(Number(v)))return null;const c=Math.round(Number(v)*100);if(!Number.isSafeInteger(c))throw Error('Importe fuera de rango seguro.');return c/100;}
 function sum(rows){let c=0;for(const r of rows){if(r.amount==null)continue;c+=Math.round(r.amount*100);if(!Number.isSafeInteger(c))throw Error('Total fuera de rango seguro.');}return c/100;}
 function date(v){if(!v)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const d=new Date(v);return Number.isNaN(+d)?'':new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
 function build(data,year){
  if(!Number.isInteger(year)||year<2000||year>2100)throw Error('Año inválido.');
  const rows=[],excluded=[],coverage=[],byId=a=>new Map(a.map(r=>[r.id,r]));
  const beneficiaries=byId(data.beneficiaries),providers=byId(data.providers);
  function add(source,r,fields){const item={source,id:r.id,name:'',document:'',amount:null,date:'',category:'',reference:'',support:'No',issue:'',...fields};item.document=documentId(item.document);item.amount=amount(item.amount);item.date=date(item.date);
   if(item.date&&!item.date.startsWith(year+'-'))return;
   if(!item.date)item.issue+='Fecha de pago desconocida; año no confirmado. ';
   if(!item.document)item.issue+='Falta identificación del beneficiario. ';
   if(!item.name)item.issue+='Falta nombre del beneficiario. ';
   if(item.amount==null||item.amount<0)item.issue+='Importe pendiente de validar. ';
   rows.push(item);
  }
  const paidOrders=data.orders.filter(r=>['pagado','conciliado'].includes(r.estado));
  for(const r of paidOrders){const b=beneficiaries.get(r.beneficiary_id)||{};add('Tesorería',r,{name:b.nombre,document:b.identificacion,amount:r.valor,date:r.fecha_pagada,category:r.payment_kind,reference:r.concept,support:r.soporte_path?'Sí':'No',issue:r.historico_inicial?'Histórico: validar fecha real y conciliación. ':''});}
  for(const r of data.entries.filter(r=>r.status==='pagado'))add('Gastos y retiros',r,{name:r.beneficiary,document:r.beneficiary_document,amount:r.amount,date:r.paid_at,category:r.entry_type,reference:r.concept,support:r.support_path?'Sí':'No'});
  const paidProviderIds=new Set(data.bankProviders.filter(r=>r.estado==='pagado').map(r=>r.id));
  const applied=new Set(data.providerApplications.filter(r=>paidProviderIds.has(r.solicitud_id)).map(r=>r.pago_id));
  for(const r of data.bankProviders.filter(r=>r.estado==='pagado')){const p=providers.get(r.proveedor_id)||{};add('Banco · proveedor',r,{name:p.nombre,document:p.nit,amount:r.monto,date:r.fecha_pago||r.pagado_at,category:'proveedor',reference:r.concepto,support:r.soporte_path?'Sí':'No'});}
  for(const r of data.providerPayments){if(applied.has(r.id)){excluded.push(['Pago proveedor',r.id,'Aplicación de un pago de Banco; no se suma otra vez.']);continue;}const p=providers.get(r.proveedor_id)||{};add('Pago proveedor',r,{name:p.nombre,document:p.nit,amount:r.monto,date:r.fecha,category:'proveedor',reference:r.referencia||r.factura_id,support:r.soporte_path?'Sí':'No',issue:r.metodo==='banco_creditek'?'Sin vínculo con pago de Banco; revisar posible duplicado. ':''});}
  // No vincular por nombre de deudor ni de vendedor. Solo origen único y relación explícita al beneficiario.
  function historicalBeneficiary(h){const origins=data.origins.filter(o=>[o.nombre,...(o.aliases||[])].some(n=>key(n)===key(h.establecimiento)));if(origins.length!==1)return {};
   const ids=new Set(data.sites.filter(s=>s.origen_codigo===origins[0].codigo).map(s=>s.aliado_id));const matches=data.allies.filter(a=>ids.has(a.id));
   const bs=[...new Set(matches.map(a=>a.payment_beneficiary_id).filter(Boolean))];return bs.length===1?(beneficiaries.get(bs[0])||{}):{};
  }
  for(const h of data.history){if(!date(h.fecha_credito).startsWith(year+'-'))continue;
   const ev=Array.isArray(h.evidencias)?h.evidencias:[];
   const ops=data.operations.filter(o=>key(o.plataforma)===key(h.plataforma)&&text(o.external_id)===text(h.codigo_credito));
   // Una coincidencia es alerta de solapamiento, nunca prueba de pago a un tercero concreto.
   const overlap=ops.some(o=>paidOrders.some(p=>p.liquidation_id===o.liquidation_id&&p.payment_kind==='aliado'));
   const b=historicalBeneficiary(h),isOwn=h.tipo_establecimiento==='propia';
   const issue=[isOwn?'Tienda propia: no acredita giro a un tercero.':'',overlap?'Posible solapamiento con liquidación pagada; no sumar hasta cruzar beneficiario.':'',ev.some(e=>e.requiere_revision_importe||e.diferencia_con_neto_kora)?'Fuentes con importes por revisar.':'',!ev.some(e=>e.pago_declarado_por_gerencia)?'Sin declaración de pago en evidencia.':'','Fecha real de pago y conciliación pendientes.','Beneficiario según vinculación actual; verificar con giro histórico.'].filter(Boolean).join(' ');
   add('Histórico declarado',h,{name:b.nombre||h.establecimiento,document:b.identificacion,amount:h.pago_neto_historico,date:null,historicalBonus:amount(h.bonos_historicos),category:isOwn?'tienda propia':'aliado histórico',reference:`${h.plataforma} · ${h.codigo_credito} · crédito ${date(h.fecha_credito)}`,issue,evidence:ev.flatMap(e=>(e.fuentes||[]).map(f=>`${f.archivo||''} [${f.gmail_message_id||''}]`)).filter((v,i,a)=>a.indexOf(v)===i).join(' | ')});
  }
  for(const r of data.expenses.filter(r=>r.estado==='aprobado'))add('Gasto de tienda',r,{name:'',document:'',amount:r.monto,date:r.fecha,category:'gasto tienda',reference:`${r.tienda_codigo} · ${r.descripcion||''}`,issue:'Sin beneficiario ni fecha de pago comprobada; revisar devengo y posible cruce con gastos generales. '});
  const confirmed=rows.filter(r=>!r.issue),pending=rows.filter(r=>r.issue),groups=new Map();
  for(const r of confirmed){const k=r.document+'|'+r.category;if(!groups.has(k))groups.set(k,{document:r.document,name:r.name,category:r.category,items:[]});groups.get(k).items.push(r);}
  const summary=[...groups.values()].map(g=>({...g,name:[...new Set(g.items.map(r=>r.name))].join(' / '),amount:sum(g.items),count:g.items.length})).sort((a,b)=>a.name.localeCompare(b.name));
  for(const [name,records] of Object.entries(data))coverage.push([name,records.length]);
  return {year,rows,confirmed,pending,summary,excluded,coverage,total:sum(confirmed)};
 }
 const detailHeaders=['Fuente','ID registro','Beneficiario / establecimiento','Identificación','Categoría','Fecha registrada','Referencia','Importe de referencia COP','Soporte adjunto','Pendiente','Evidencia de correo','Bonos históricos sin asignar COP'];
 const detailTypes=detailHeaders.map((_,i)=>[7,11].includes(i)?'currency':'text');
 const details=rows=>rows.map(r=>[r.source,r.id,r.name,r.document,r.category,r.date,r.reference,r.amount,r.support,r.issue,r.evidence||'',r.historicalBonus??null]);
 function report(model){return {title:`Auxiliar exógena ${model.year}`,scope:{label:'Todas las fuentes consultables por el usuario autorizado'},mode:'complete',filters:[['Año',String(model.year)],['Base','Pagos registrados; históricos por fecha del crédito separados'],['Uso','Auxiliar para revisión contable. No es archivo DIAN ni total fiscal definitivo.']],tables:[
  {heading:'Resumen por tercero',headers:['Identificación','Beneficiario','Categoría','Registros','Pagos con datos completos COP'],columnTypes:['text','text','text','number','currency'],rows:model.summary.map(g=>[g.document,g.name,g.category,g.count,g.amount]),totalRows:[['TOTAL','','',model.confirmed.length,model.total]]},
  {heading:'Pagos registrados',headers:detailHeaders,columnTypes:detailTypes,rows:details(model.confirmed)},
  {heading:'Históricos declarados',headers:detailHeaders,columnTypes:detailTypes,rows:details(model.pending.filter(r=>r.source==='Histórico declarado'))},
  {heading:'Otros pendientes',headers:detailHeaders,columnTypes:detailTypes,rows:details(model.pending.filter(r=>r.source!=='Histórico declarado'))},
  {heading:'Duplicados excluidos',headers:['Fuente','ID','Motivo'],rows:model.excluded},
  {heading:'Cobertura y alcance',headers:['Fuente / condición','Detalle'],rows:[...model.coverage.map(([k,n])=>[k,String(n)+' registros consultados']),['Fecha de consulta',new Date().toISOString()],['Importes pendientes','Se muestran como referencia y NO integran el resumen por tercero. Vacío no significa cero.'],['Históricos','Se seleccionan por año del crédito, no del pago. Validar año fiscal y beneficiario. No suman automáticamente al total.'],['Bonos históricos','Se muestran como referencia sin asignar a un tercero ni sumarlos. Validar importe, destinatario y fecha de giro; el cálculo histórico no acredita ese pago.'],['Terceros','El cliente que tomó el crédito no es necesariamente quien recibió el giro.'],['Fiscal','Faltan clasificación fiscal, conceptos, retenciones, tipo de documento, ubicación y otros datos exigibles. No se presumen ceros.'],['Devengo','Este auxiliar no consolida todas las causaciones, compras, ingresos, activos ni saldos fiscales. Requiere revisión contable antes de presentar exógena.'],['Soporte','Adjunto significa que KORA registra una ruta; no confirma validez bancaria ni conciliación.'],['Retiros','Los retiros de utilidad están separados de los gastos; sin clasificación fiscal automática.'],['Duplicados','Se excluyen aplicaciones de proveedor vinculadas a Banco. Otros posibles solapamientos se dejan pendientes.']]}
 ]};}
 const api={build,report,date,amount,sum,documentId};if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraExogena=api;
})(typeof window==='undefined'?globalThis:window);
