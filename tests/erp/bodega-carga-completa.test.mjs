import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const d=require('../../creditek/erp/bodega-domain.js');
test('catálogo de 1648 referencias incluye Redmi después de la fila 1000',async()=>{
 const productos=Array.from({length:1648},(_,i)=>({id:String(i),nombre:i===1600?'REDMI NOTE 15':'Producto '+i}));
 const r=await d.cargarTodasLasPaginas(()=>({range:async(a,b)=>({data:productos.slice(a,b+1),error:null})}));
 assert.equal(r.data.length,1648);
 assert.equal(d.consolidarDisponibilidad({productos:r.data,unidades:[{producto_id:'1600',precio_tienda:100}],lotes:[]})[0].nombre,'REDMI NOTE 15');
});
test('un error de página nunca devuelve un inventario parcial como completo',async()=>{
 const r=await d.cargarTodasLasPaginas(()=>({range:async(a)=>a===0?{data:[1,2],error:null}:{error:{message:'conexión'}}}),2);
 assert.equal(r.data,null); assert.equal(r.error.message,'conexión');
});
test('pendientes excluye las unidades serializadas ya remisionadas',()=>{
 const r=d.pendientesPorRemisionar([{producto_id:'a',tipo:'serializado',stock_actual_central:25},{producto_id:'b',tipo:'cantidad',stock_actual_central:3}],Array.from({length:15},()=>({producto_id:'a'})));
 assert.equal(r[0].stock_actual_central,15); assert.equal(r[1].stock_actual_central,3);
 assert.equal(d.pendientesPorRemisionar([r[0]],[])[0].descuadrado,false);
});
test('buscador legible, búsqueda por código y scripts válidos',()=>{
 const html=readFileSync(new URL('../../creditek/erp/bodega-central.html',import.meta.url),'utf8');
 assert.match(html,/background: #fff !important; color: #0b1e3d !important/);
 assert.match(html,/p\.codigo \|\| ''/);
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(m[1].trim()) new vm.Script(m[1]);
});
