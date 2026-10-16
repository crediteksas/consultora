import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {TEMPLATE_BASE64} from './workbook-template.mjs';

export const XLSX_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const col=n=>String.fromCharCode(65+n);
const xml=s=>String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const text=s=>String(s??'');
const compare=(a,b)=>a.localeCompare(b,'es');
function moneyCents(value){
 if(value==null||String(value).trim()==='')throw Error('Falta costo o precio');
 const n=Number(value),c=Math.round(n*100);
 if(!Number.isFinite(n)||n<=0||!Number.isSafeInteger(c)||Math.abs(c/100-n)>0.000001)throw Error('Costo o precio no válido');
 return c;
}
const sum=(rows,key)=>rows.reduce((total,r)=>{const n=total+r[key];if(!Number.isSafeInteger(n))throw Error('Importe fuera de rango');return n;},0);
export function closureWorkbookModel(report){
 if(report.tipo!=='cierre'||!/^CIE-\d{1,20}$/.test(report.numero)||!Number.isFinite(Date.parse(report.fecha))||!Array.isArray(report.items)||!report.items.length||report.items.length>20000)throw Error('Cierre no válido');
 const seen=new Set();
 const details=report.items.map(i=>{
  const quantity=Number(i.cantidad),cost=moneyCents(i.costo),price=moneyCents(i.precio);
  if(!Number.isSafeInteger(quantity)||quantity<=0||!text(i.referencia).trim()||!text(i.proveedor).trim())throw Error('Línea incompleta');
  const itemId=text(i.item_id).trim();
  if(!itemId)throw Error('Falta identificador de línea');
  if(seen.has(itemId))throw Error('Línea duplicada');seen.add(itemId);
  if(!Number.isSafeInteger(cost*quantity)||!Number.isSafeInteger(price*quantity))throw Error('Importe fuera de rango');
  return {pedido:text(i.numero||i.pedido_id),ciudad:text(i.ciudad||'Ciudad no registrada'),tienda:text(i.tienda||i.tienda_codigo||'Tienda no registrada'),proveedor:text(i.proveedor),referencia:text(i.referencia),producto:text(i.producto_id||i.referencia),quantity,cost,price,totalCost:cost*quantity,totalPrice:price*quantity};
 }).sort((a,b)=>compare(a.ciudad,b.ciudad)||compare(a.tienda,b.tienda)||compare(a.proveedor,b.proveedor)||compare(a.referencia,b.referencia)||compare(a.pedido,b.pedido));
 const providers=new Map(),purchases=new Map();
 for(const r of details){
  if(!providers.has(r.proveedor))providers.set(r.proveedor,[]);providers.get(r.proveedor).push(r);
  const key=JSON.stringify([r.proveedor,r.ciudad,r.producto,r.cost]);
  if(!purchases.has(key))purchases.set(key,{...r,quantity:0,totalCost:0});
  const p=purchases.get(key);p.quantity+=r.quantity;p.totalCost+=r.totalCost;
 }
 const summary=[...providers].sort(([a],[b])=>compare(a,b)).map(([name,rows])=>[name,sum(rows,'quantity'),sum(rows,'totalCost')/100,sum(rows,'totalPrice')/100,(sum(rows,'totalPrice')-sum(rows,'totalCost'))/100]);
 const buying=[...purchases.values()].sort((a,b)=>compare(a.proveedor,b.proveedor)||compare(a.ciudad,b.ciudad)||compare(a.referencia,b.referencia)||a.cost-b.cost);
 return {numero:report.numero,fecha:report.fecha,pedidos:new Set(details.map(r=>r.pedido)).size,unidades:sum(details,'quantity'),costo:sum(details,'totalCost')/100,retail:sum(details,'totalPrice')/100,
  sheets:[
   {name:'Resumen',headers:['Proveedor','Unidades','Costo proveedor (COP)','Valor a tiendas (COP)','Margen (COP)'],rows:summary,totals:[1,2,3,4]},
   {name:'Compra por ciudad',headers:['Proveedor','Ciudad','Referencia','Unidades','Costo unitario (COP)','Total costo (COP)'],rows:buying.map(r=>[r.proveedor,r.ciudad,r.referencia,r.quantity,r.cost/100,r.totalCost/100]),totals:[3,5]},
   {name:'Detalle tiendas',headers:['Pedido','Ciudad','Tienda','Proveedor','Referencia','Unidades','Costo unitario (COP)','Precio tienda (COP)','Total costo (COP)','Total tienda (COP)'],rows:details.map(r=>[r.pedido,r.ciudad,r.tienda,r.proveedor,r.referencia,r.quantity,r.cost/100,r.price/100,r.totalCost/100,r.totalPrice/100]),totals:[5,8,9]}
  ]};
}
function styleAt(source,address){const match=source.match(new RegExp('<(?:x:)?c\\b[^>]*\\br="'+address+'"[^>]*\\bs="(\\d+)"'));if(!match)throw Error('Plantilla inválida: '+address);return match[1];}
function cell(address,value,style,formula){
 const start='<x:c r="'+address+'" s="'+style+'"';
 if(formula)return start+'><x:f>'+xml(formula)+'</x:f><x:v>'+value+'</x:v></x:c>';
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Número no válido');return start+'><x:v>'+value+'</x:v></x:c>';}
 // Literal inline text, never an Excel formula, even if it begins with =, +, - or @.
 return start+' t="inlineStr"><x:is><x:t xml:space="preserve">'+xml(value)+'</x:t></x:is></x:c>';
}
export function setWorksheetDimension(source,reference){
 // OOXML permits one dimension only, whether the template already contains it or not.
 return source.replace(/<x:dimension\b[^>]*\/>/g,'').replace('<x:sheetViews>','<x:dimension ref="'+reference+'"/><x:sheetViews>');
}
export function buildClosureWorkbook(report){
 const model=closureWorkbookModel(report),files=unzipSync(Uint8Array.from(atob(TEMPLATE_BASE64),c=>c.charCodeAt(0)));
 for(let s=0;s<model.sheets.length;s++){
  const def=model.sheets[s],path='xl/worksheets/sheet'+(s+1)+'.xml',source=strFromU8(files[path]);
  const last=col(def.headers.length-1),end=10+def.rows.length,total=end+1;
  const row=(r,body,height=25)=>'<x:row r="'+r+'" ht="'+height+'" customHeight="1">'+body+'</x:row>';
  const top=source.match(/<x:sheetData>([\s\S]*?)<\/x:sheetData>/)?.[1];if(!top)throw Error('Plantilla sin filas');
  const topRows=[...top.matchAll(/<x:row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/x:row>/g)].filter(m=>Number(m[1])<=3).map(m=>m[0]).join('');
  let data=topRows+row(4,cell('A4','KORA · '+def.name+' · '+model.numero,styleAt(source,'A4')));
  data+=row(5,cell('A5','Cierre',styleAt(source,'A5'))+cell('B5',model.numero,styleAt(source,'B5')));
  const localDate=(Date.parse(model.fecha)-5*3600000)/86400000+25569;
  data+=row(6,cell('A6','Corte (Colombia)',styleAt(source,'A6'))+cell('B6',localDate,styleAt(source,'B6')));
  data+=row(7,cell('A7',model.pedidos+' pedidos · '+model.unidades+' unidades · Valores en COP',styleAt(source,'A7')));
  data+=row(8,cell('A8',s===2?'Fuente: KORA, copia del cierre confirmado '+model.numero:'Precios y proveedores conservados al confirmar el cierre',styleAt(source,'A8')));
  data+=row(10,def.headers.map((v,c)=>cell(col(c)+'10',v,styleAt(source,col(c)+'10'))).join(''),36);
  for(let i=0;i<def.rows.length;i++){
   const r=i+11,values=def.rows[i];
   data+=row(r,values.map((v,c)=>{
    let formula;
    if(s===2&&c>=8)formula='F'+r+'*'+(c===8?'G':'H')+r;
    if(s===1&&c===5)formula='D'+r+'*E'+r;
    if(s===0&&c>=1){const detailEnd=10+model.sheets[2].rows.length;formula=c===4?'D'+r+'-C'+r:'SUMIFS(\'Detalle tiendas\'!'+(['','F','I','J'][c])+'$11:'+(['','F','I','J'][c])+'$'+detailEnd+',\'Detalle tiendas\'!D$11:D$'+detailEnd+',A'+r+')';}
    return cell(col(c)+r,v,styleAt(source,col(c)+'11'),formula);
   }).join(''),32);
  }
  data+=row(total,def.headers.map((_,c)=>{
   if(c===0)return cell('A'+total,'TOTAL GENERAL',styleAt(source,'A12'));
   if(!def.totals.includes(c))return cell(col(c)+total,'',styleAt(source,col(c)+'12'));
   const value=def.rows.reduce((n,r)=>n+Number(r[c]),0);
   return cell(col(c)+total,Math.round(value*100)/100,styleAt(source,col(c)+'12'),'SUM('+col(c)+'11:'+col(c)+end+')');
  }).join(''),30);
  let result=source.replace(/<x:sheetData>[\s\S]*?<\/x:sheetData>/,'<x:sheetData>'+data+'</x:sheetData><x:autoFilter ref="A10:'+last+end+'"/>');
  result=setWorksheetDimension(result,'A1:'+last+total);
  files[path]=strToU8(result);
 }
 return {filename:'KORA-'+model.numero+'-pedidos-B2B.xlsx',mimeType:XLSX_TYPE,bytes:zipSync(files,{level:1}),model};
}
