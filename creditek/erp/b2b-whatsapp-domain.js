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
   // Supplier metadata is useful evidence, not part of the product's display name.
   // Keep it intact on the row while resolving only exact, unambiguous identities.
   const title=r.reference.split(';')[0].trim();
   const usable=p=>p&&p.activo!==false&&p.activo!==0&&D.key(p.activo)!=='FALSE';
   const saved=rules.filter(x=>x.proveedor_id===provider&&x.referencia_key===D.key(r.reference));
   const rule=saved.length===1&&usable(products.find(p=>p.id===saved[0].producto_id))?saved[0]:null;
   const remembered=legacy.filter(x=>legacyKey(x.referencia)===legacyKey(r.reference)&&x.activa==='SI');
   const expected=remembered.length===1?remembered[0].canonica:'';
   const parts=[...new Set(r.reference.split(';').slice(1).map(segment=>D.key(segment).match(/^(?:NUMERO DE PARTE|SKU|PART NUMBER)(?:\s*[:#=]\s*|\s+)([A-Z0-9][A-Z0-9._\/-]*)$/)?.[1]).filter(Boolean))];
   const sku=parts.length===1?products.filter(p=>[p.codigo,p.sku,p.numero_parte,p.part_number].some(v=>D.key(v)===parts[0])):[];
   const exact=products.filter(p=>[p.nombre,p.codigo].some(v=>D.key(v)===D.key(r.reference)||D.key(v)===D.key(title)));
   const legacyMatches=expected?products.filter(p=>[p.nombre,p.codigo].some(v=>legacyKey(v)===legacyKey(expected))):[];
   let productId='',fromLegacy=false;
   if(rule)productId=rule.producto_id;
   else if(saved.length>0){/* Do not replace a conflicting or inactive remembered identity. */}
   else if(parts.length>1){/* Conflicting part numbers require review. */}
   else if(sku.length)productId=sku.length===1&&usable(sku[0])?sku[0].id:'';
   else if(exact.length)productId=exact.length===1&&usable(exact[0])?exact[0].id:'';
   else if(legacyMatches.length===1&&usable(legacyMatches[0])){productId=legacyMatches[0].id;fromLegacy=true;}
   const blocked=/\b(AGOTADO|SIN STOCK|USADO|REACONDICIONADO|REFURBISHED|SOBRE PEDIDO|POR ENCARGO)\b/i.test(r.reference);
   const special=rule&&!D.isDefaultReason(rule.motivo);
   const margin=special?Number(rule.margen):D.defaultMargin(r.costo);
   return {...r,proveedor_id:provider,producto_id:productId,
    precio_tienda:r.costo==null?null:Math.round((r.costo+margin)*100)/100,motivo:special?rule.motivo:'',
    learned:!!rule||fromLegacy,legacyExpected:expected,remember:false,included:!blocked,exclusion:blocked?'No disponible como equipo nuevo para entrega':'',
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
