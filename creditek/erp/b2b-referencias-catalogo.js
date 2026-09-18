(function(root){
 'use strict';
 // Agrupación comercial explícita: nunca se deduce una equivalencia por nombre.
 // Los productos y las ofertas de origen no se modifican.
 function create(rows=[]){
  const byProduct=new Map(),byReference=new Map();
  for(const row of rows){
   if(!row.producto_id||!row.referencia_id||!String(row.nombre_pedido||'').trim())throw Error('Una equivalencia del catálogo está incompleta.');
   const previous=byProduct.get(row.producto_id),family=byReference.get(row.referencia_id);
   if(previous&&(previous.referencia_id!==row.referencia_id||previous.nombre_pedido!==row.nombre_pedido)||family&&family.nombre_pedido!==row.nombre_pedido)throw Error('Hay equivalencias contradictorias en el catálogo.');
   byProduct.set(row.producto_id,{...row});byReference.set(row.referencia_id,{...row});
  }
  for(const row of byProduct.values()){const target=byProduct.get(row.referencia_id);if(target&&target.referencia_id!==row.referencia_id)throw Error('La equivalencia del catálogo no apunta a su referencia final.');}
  const id=productId=>byProduct.get(productId)?.referencia_id||productId;
  const name=(productId,fallback='Referencia no disponible')=>byProduct.get(productId)?.nombre_pedido||byReference.get(productId)?.nombre_pedido||fallback;
  function offer(row){return {...row,producto_id:id(row.producto_id),producto_origen_id:row.producto_origen_id||row.producto_id};}
  function product(row){return {...row,id:id(row.id),nombre:name(row.id,row.nombre)};}
  function unique(products){const result=new Map();for(const original of products){const item=product(original);if(!result.has(item.id)||original.id===item.id)result.set(item.id,item);}return [...result.values()];}
  return {id,name,offer,product,unique};
 }
 async function load(sb){const rows=[];for(let start=0;;start+=500){const result=await sb.from('b2b_referencias_catalogo').select('producto_id,referencia_id,nombre_pedido').order('producto_id').range(start,start+499);if(result.error)throw result.error;if(!Array.isArray(result.data))throw Error('No se pudieron consultar las equivalencias del catálogo.');rows.push(...result.data);if(result.data.length<500)return create(rows);}}
 const api={create,load};if(typeof module==='object'&&module.exports)module.exports=api;else root.KoraB2BReferencias=api;
})(typeof globalThis!=='undefined'?globalThis:this);
