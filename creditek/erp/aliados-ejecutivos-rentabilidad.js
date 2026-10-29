(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.KoraExecutiveProfit=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const UNASSIGNED='__unassigned__';
  const cents=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Math.round(Number(v)*100);
  const add=(a,b)=>a==null||b==null?null:a+b;
  const documentKey=v=>/^[0-9.\s-]{5,25}$/.test(String(v||''))?String(v).replace(/\D/g,''):'';
  const inRange=(day,from,to)=>/^\d{4}-\d{2}-\d{2}$/.test(day||'')&&day>=from&&day<=to;
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(+new Date(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  function build({executives,beneficiaries,operations,expenses,from,to,financialReadable}){
    financialReadable=financialReadable===true;
    if(!validDate(from)||!validDate(to)||from>to)throw Error('Selecciona un período válido.');
    const people=new Map(executives.map(e=>[e.id,e])),groups=new Map(),identities=new Map(),details=[];
    const group=id=>{if(!groups.has(id))groups.set(id,{id,name:people.get(id)?.nombre||(id===UNASSIGNED?'Sin ejecutivo · operaciones y gastos generales':'Ejecutivo no registrado'),credits:0,sales:0,margin:0,payroll:0,other:0,expenses:[],operations:[],missing:0});return groups.get(id);};
    for(const e of executives)if(e.activo)group(e.id);
    for(const b of beneficiaries){const doc=documentKey(b.identificacion);if(b.tipo!=='ejecutivo'||!people.has(b.ejecutivo_id)||!doc)continue;if(!identities.has(doc))identities.set(doc,new Set());identities.get(doc).add(b.ejecutivo_id);}
    for(const o of operations){
      if(!inRange(o.day,from,to))continue;
      const g=group(o.ejecutivo_id||UNASSIGNED),amount=cents(o.utilidad_creditek),sales=cents(o.monto_base);
      g.credits+=o.reversion_id?-1:1;g.sales=add(g.sales,sales);g.margin=add(g.margin,amount);if(amount==null||sales==null)g.missing++;
      const row={kind:'operation',executiveId:g.id,executive:g.name,day:o.day,concept:o.reversion_id?'Reversión del crédito':'Crédito',reference:o.reference||'Referencia no informada',store:o.store||'Establecimiento no informado',amount,sales,id:String(o.id),document:o.external_id||'Sin número',href:o.href||'',paidDay:'',status:'Resultado calculado'};g.operations.push(row);details.push(row);
    }
    const seen=new Map();
    if(financialReadable)for(const e of expenses){
      if(!['aprobado','pagado'].includes(e.estado)||!inRange(e.fecha,from,to))continue;
      if(!e.id)throw Error('Hay un gasto sin identificación verificable.');
      const signature=JSON.stringify([e.fecha,e.valor,e.beneficiario_documento,e.estado,e.category]);
      if(seen.has(e.id)){if(seen.get(e.id)!==signature)throw Error('Hay un gasto repetido con datos distintos.');continue;}seen.set(e.id,signature);
      const ids=identities.get(documentKey(e.beneficiario_documento)),id=ids?.size===1?[...ids][0]:UNASSIGNED,g=group(id),amount=cents(e.valor),payroll=e.category==='nomina';
      if(payroll)g.payroll=add(g.payroll,amount);else g.other=add(g.other,amount);if(amount==null)g.missing++;
      const row={kind:payroll?'payroll':'expense',executiveId:g.id,executive:g.name,day:e.fecha,concept:e.concepto||'Gasto autorizado',reference:payroll?'Quincena / nómina':'Gasto identificado',store:'Aliados',amount:amount==null?null:-amount,sales:0,id:String(e.id),document:e.concepto||'Gasto autorizado',href:'',paidDay:e.paidDay||'',dueDay:e.dueDay||'',status:e.estado==='pagado'?'Pagado':'Aprobado · pendiente de pago',identity:id===UNASSIGNED?'No asignado a un ejecutivo por identificación única':'Identificación del beneficiario'};g.expenses.push(row);details.push(row);
    }
    details.sort((a,b)=>a.day.localeCompare(b.day)||a.id.localeCompare(b.id));
    const rows=[...groups.values()].map(g=>{const result=financialReadable?add(add(g.margin,g.payroll==null?null:-g.payroll),g.other==null?null:-g.other):null;return {...g,result,ratio:result!=null&&g.sales>0?result/g.sales:null};});
    rows.sort((a,b)=>a.id===UNASSIGNED?1:b.id===UNASSIGNED?-1:a.name.localeCompare(b.name,'es'));
    const total=rows.reduce((a,g)=>({credits:a.credits+g.credits,sales:add(a.sales,g.sales),margin:add(a.margin,g.margin),payroll:add(a.payroll,g.payroll),other:add(a.other,g.other),result:add(a.result,g.result)}),{credits:0,sales:0,margin:0,payroll:0,other:0,result:financialReadable?0:null});
    total.ratio=total.result!=null&&total.sales>0?total.result/total.sales:null;
    return {from,to,financialReadable:financialReadable===true,rows,details,total,unassignedCost:rows.find(g=>g.id===UNASSIGNED)?.expenses.length||0};
  }
  const exportDate=v=>validDate(v)?new Date(v+'T00:00:00Z'):null;
  const pesos=v=>v==null?null:v/100;
  const ratio=v=>v==null?'No disponible':new Intl.NumberFormat('es-CO',{style:'percent',maximumFractionDigits:2}).format(v);
  const summaryValues=g=>[g.name,g.credits,pesos(g.sales),pesos(g.margin),pesos(g.payroll),pesos(g.other),pesos(g.result),ratio(g.ratio)];
  function report(model,{executive='',mode='summary'}={}){
    if(!model.financialReadable)throw Error('La rentabilidad requiere acceso a los gastos autorizados.');
    const selected=model.rows.filter(g=>!executive||g.id===executive);if(!selected.length)throw Error('No hay un ejecutivo consultado para este informe.');
    const ids=new Set(selected.map(g=>g.id)),details=model.details.filter(r=>ids.has(r.executiveId));
    const total=selected.reduce((a,g)=>({name:'TOTAL',credits:a.credits+g.credits,sales:add(a.sales,g.sales),margin:add(a.margin,g.margin),payroll:add(a.payroll,g.payroll),other:add(a.other,g.other),result:add(a.result,g.result)}),{name:'TOTAL',credits:0,sales:0,margin:0,payroll:0,other:0,result:0});total.ratio=total.result!=null&&total.sales>0?total.result/total.sales:null;
    const tables=[{heading:'Rentabilidad por ejecutivo',kind:'summary',headers:['Ejecutivo','Créditos netos','Valor financiado','Margen después de bonos','Nómina aprobada','Otros gastos identificados','Resultado atribuible','Resultado / financiado'],columnTypes:['text','number','currency','currency','currency','currency','currency','text'],rows:selected.map(summaryValues),totalRows:[summaryValues(total)]}];
    if(mode==='detailed'){
      tables.push({heading:'Operaciones del período',headers:['Ejecutivo','Fecha venta','Tienda / aliado','Referencia','Crédito','Valor financiado','Margen después de bonos','ID registro'],columnTypes:['text','date','text','text','text','currency','currency','text'],rows:details.filter(r=>r.kind==='operation').map(r=>[r.executive,exportDate(r.day),r.store,r.reference,r.document,pesos(r.sales),pesos(r.amount),r.id])});
      tables.push({heading:'Quincenas y gastos del período',headers:['Ejecutivo','Fecha del costo','Concepto','Tipo','Costo aprobado','Estado','Fecha pago','Vencimiento','Asignación','ID registro'],columnTypes:['text','date','text','text','currency','text','date','date','text','text'],rows:details.filter(r=>r.kind!=='operation').map(r=>[r.executive,exportDate(r.day),r.concept,r.reference,r.amount==null?null:-pesos(r.amount),r.status,exportDate(r.paidDay),exportDate(r.dueDay),r.identity,r.id])});
    }
    return {title:'Rentabilidad por ejecutivo · Aliados',mode,route:'aliados-ejecutivos.html#rentabilidad',scope:{label:'Aliados · ejecutivo responsable de cada operación'},filters:[['Desde',model.from],['Hasta',model.to],['Ejecutivo',executive?selected[0].name:'Todos'],['Fecha de costos','Autorización; históricos por su fecha contable registrada'],['Cálculo','Margen después de bonos menos nómina aprobada y otros gastos identificados'],['Gastos sin asignar','Fila propia; no se reparten entre ejecutivos'],['Pago bancario','No vuelve a descontar el gasto autorizado']],tables:tables.filter(t=>t.rows.length),notes:['Resultado atribuible = margen calculado de sus operaciones, después de bonos, menos nómina y otros gastos identificados a ese ejecutivo. Los bonos ya descontados no se restan otra vez.','El gasto se descuenta una vez en su fecha de autorización, aunque se pague después. Los pagos y los retiros de utilidad no crean un gasto adicional.','Los gastos sin una identificación única quedan en «Sin ejecutivo»; no se reparten entre personas. El resultado individual no incluye gastos generales sin asignar ni costos sin registrar.','Los importes no disponibles permanecen vacíos; no representan cero. Los valores calculados no acreditan dinero disponible en Banco.']};
  }
  return {build,report,summaryValues,pesos,ratio,UNASSIGNED};
});
