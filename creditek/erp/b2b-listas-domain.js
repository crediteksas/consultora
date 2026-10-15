(function(root){
 'use strict';
 const key=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
 const legacyMarginPolicy='Política retail: costo menor de $150.000 + 12%; desde $150.000 + $20.000';
 const marginPolicy=legacyMarginPolicy+'; teléfonos: costo mayor de $800.000 + $30.000; mayor de $1.300.000 + $50.000';
 const defaultMargin=(cost,categoria='')=>String(categoria??'').trim().toUpperCase()==='CELULAR'&&cost>1300000?50000:String(categoria??'').trim().toUpperCase()==='CELULAR'&&cost>800000?30000:Number.isFinite(cost)&&cost>0&&cost<150000?Math.round(cost*12)/100:20000;
 const isDefaultReason=reason=>!String(reason??'').trim()||reason===marginPolicy||reason===legacyMarginPolicy;
 function repriceStandard(row,product){
  const wasStandard=isDefaultReason(row.motivo)||/^\[BAJO PEDIDO\]/.test(String(row.motivo||''));
  const oldMargin=Math.round((row.precio_tienda-row.costo)*100);
  const canReprice=wasStandard&&(oldMargin===defaultMargin(row.costo,row.categoria)*100||oldMargin===defaultMargin(row.costo)*100);
  const next={...row,categoria:product?.categoria||''};
  if(canReprice&&Number.isFinite(row.costo)&&row.costo>0)next.precio_tienda=Math.round((row.costo+defaultMargin(row.costo,next.categoria))*100)/100;
  return next;
 }
 function amount(v){
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  let s=String(v??'').trim().replace(/^(?:COP|\$)\s*/i,'').replace(/\s/g,'');
  if(!s)return null;
  if(/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else if(/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s))s=s.replace(/,/g,'');
  else if(/^-?\d+(,\d{1,2})$/.test(s))s=s.replace(',','.');
  return /^-?\d+(\.\d{1,2})?$/.test(s)&&Number.isFinite(Number(s))?Number(s):null;
 }
 function exact(list,value,fields){const matches=list.filter(x=>fields.some(f=>key(x[f])===key(value)));return key(value)&&matches.length===1?matches[0].id:'';}
 function prepare(rows,map,products,providers,fixedProvider=''){
  const out=[];
  for(let i=map.header+1;i<rows.length;i++){
   const r=rows[i];if(!r||r.every(v=>v===''||v==null))continue;
   const reference=String(r[map.reference]??'').trim(),supplier=String(r[map.provider]??'').trim();
   // No se ocultan filas parciales: deben corregirse o excluirse explícitamente.
   const cost=amount(r[map.cost]),rawPrice=map.price<0?null:r[map.price],rawMargin=map.margin<0?null:r[map.margin];
   const hasPrice=rawPrice!=null&&String(rawPrice).trim()!=='',hasMargin=rawMargin!=null&&String(rawMargin).trim()!=='';
   const producto_id=exact(products,reference,['codigo','nombre']),categoria=products.find(p=>p.id===producto_id)?.categoria||'';
   const margin=hasMargin?amount(rawMargin):defaultMargin(cost,categoria);
   const price=hasPrice?amount(rawPrice):(cost!=null&&margin!=null?Math.round((cost+margin)*100)/100:null);
   out.push({row:i+1,reference,supplier,producto_id,categoria,proveedor_id:fixedProvider||exact(providers,supplier,['nombre','nit']),costo:cost,precio_tienda:price,motivo:hasPrice?'Precio final del archivo':hasMargin?'Margen indicado en el archivo':'',included:true});
  }
  return out;
 }
 function validate(rows){
  const errors=[],seen=new Set(),selected=rows.filter(r=>r.included);
  if(!selected.length)errors.push('No hay filas seleccionadas.');
  for(const r of selected){
   const prefix=`Fila ${r.row}: `;
   if(!r.producto_id||!r.proveedor_id)errors.push(prefix+'vincula la referencia y el proveedor.');
   if(!(r.costo>0)||!(r.precio_tienda>0)||!Number.isFinite(r.costo)||!Number.isFinite(r.precio_tienda)||Math.abs(r.costo*100-Math.round(r.costo*100))>1e-5||Math.abs(r.precio_tienda*100-Math.round(r.precio_tienda*100))>1e-5)errors.push(prefix+'falta un costo real o precio válido (hasta dos decimales).');
   if(Math.round((r.precio_tienda-r.costo)*100)!==defaultMargin(r.costo,r.categoria)*100&&isDefaultReason(r.motivo))errors.push(prefix+'indica el motivo del margen especial.');
   if(r.producto_id&&r.proveedor_id){const id=r.producto_id+'|'+r.proveedor_id;if(seen.has(id))errors.push(prefix+'referencia y proveedor duplicados.');seen.add(id);}
  }
  return errors;
 }
 function winners(rows){const result=new Map();for(const r of rows.filter(x=>x.included)){const old=result.get(r.producto_id);if(!old||r.costo<old.costo||(r.costo===old.costo&&r.precio_tienda<old.precio_tienda))result.set(r.producto_id,r);}return [...result.values()];}
 function csv(rows){return '\ufeff'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');}
 const api={key,amount,prepare,validate,winners,csv,defaultMargin,marginPolicy,isDefaultReason,repriceStandard};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraB2BListas=api;
})(typeof globalThis!=='undefined'?globalThis:this);
