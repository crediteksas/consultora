(function(root){
 'use strict';
 const D=typeof module==='object'&&module.exports?require('./b2b-listas-domain.js'):root.KoraB2BListas;
 const clean=s=>String(s??'').replace(/[*_~\u2060\u200b]/g,'').replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F/gu,'').trim();
 const legacyKey=s=>D.key(clean(s)).replace(/\bPRECIO\b/g,'').replace(/[^A-Z0-9]+/g,' ').trim();
 function providerKey(s){const k=D.key(s).replace(/[.]/g,'');return ({'MPS COL':'MPS','INITY COLOMBIA':'INITY','TEKMOBILE SAS':'TEKMOBILE'})[k]||k;}
 function parse(text,provider,products,rules=[],legacy=[]){
  if(!text.trim()||text.length>200000)throw Error('Pega una lista de hasta 200.000 caracteres.');
  const lines=text.split(/\r?\n/),out=[];
  const price=/(?:\bPRECIO\s*:?\s*|\bCOP\s*|\$\s*)(\d[\d.,]*)(?:\s*(?:COP|PESOS|INCLUIDO\s+IVA|IVA\s+INCLUIDO))*\s*$/i;
  const tail=/\s+(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{5,})(?:\s*(?:COP|PESOS|INCLUIDO\s+IVA|IVA\s+INCLUIDO))*\s*$/i;
  for(let i=0;i<lines.length;i++){
   if(!lines[i].trim())continue;
   const raw=lines[i],line=clean(raw),m=line.match(price)||line.match(tail);
   let reference=m?line.slice(0,m.index).replace(/[\s:→—\-]+$/,'').replace(/\bPRECIO\s*$/i,'').trim():line;
   const cost=m?D.amount(m[1]):null;
   // A price on the immediately following line belongs to the preceding reference.
   if(m&&!reference&&out.length&&out.at(-1).costo===null&&out.at(-1).end===i){
    const previous=out.pop();reference=previous.reference;
    out.push(make({...previous,reference,costo:cost,original:previous.original+'\n'+raw,end:i+1}));
   }else out.push(make({row:i+1,end:i+1,reference,costo:cost,original:raw}));
  }
  if(out.length>5000)throw Error('La lista supera 5000 líneas. Divídela; no se publicará truncada.');
  return out;
  function make(r){
   const rule=rules.find(x=>x.proveedor_id===provider&&x.referencia_key===D.key(r.reference)&&products.some(p=>p.id===x.producto_id));
   const remembered=legacy.filter(x=>legacyKey(x.referencia)===legacyKey(r.reference)&&x.activa==='SI');
   const expected=remembered.length===1?remembered[0].canonica:'';
   const exact=products.filter(p=>[p.nombre,p.codigo].some(v=>D.key(v)===D.key(r.reference)||(expected&&legacyKey(v)===legacyKey(expected))));
   const blocked=/\b(AGOTADO|SIN STOCK|USADO|REACONDICIONADO|REFURBISHED|SOBRE PEDIDO|POR ENCARGO)\b/i.test(r.reference);
   const margin=rule?Number(rule.margen):20000;
   return {...r,proveedor_id:provider,producto_id:rule?.producto_id||(exact.length===1?exact[0].id:''),
    precio_tienda:r.costo==null?null:Math.round((r.costo+margin)*100)/100,motivo:rule?.motivo||'',
    learned:!!rule||(!!expected&&exact.length===1),legacyExpected:expected,remember:false,included:!blocked,exclusion:blocked?'No disponible como equipo nuevo para entrega':'',
    priceWarning:r.costo!==null&&r.costo<10000?'Precio bajo: confirma si el proveedor lo expresó en miles. No se multiplica automáticamente.':''};
  }
 }
 function validate(rows){return [...D.validate(rows),...rows.filter(r=>r.included&&r.priceWarning&&!r.priceConfirmed).map(r=>`Línea ${r.row}: confirma el precio bajo o corrígelo.`),...rows.filter(r=>!r.included&&!r.exclusion?.trim()).map(r=>`Línea ${r.row}: indica por qué se excluye.`)];}
 function compare(rows,offers,provider){
  // Publishing a full supplier list replaces that supplier only, retaining its competitors.
  return D.winners([...offers.filter(o=>o.proveedor_id!==provider).map(o=>({...o,included:true})),...rows.filter(r=>r.included)]);
 }
 const api={parse,validate,compare,legacyKey,providerKey};if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraB2BWhatsApp=api;
})(typeof globalThis!=='undefined'?globalThis:this);
