import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),R=require('../../creditek/erp/presupuestos-retail-ranking.js');
function row(code,name,meta,real,id='ventas'){return{tienda:{codigo:code,nombre:name},categorias:[{id,presupuesto:meta,realizado:real,cumplimiento:meta>0&&real!=null?real/meta:null,estado:meta==null?'Presupuesto incompleto':meta===0?'Sin meta asignada':real==null?'Resultado por validar':'Meta alcanzada'}]};}
test('ordena por cumplimiento, no por tamaño de ventas; empate comparte posición',()=>{
 const r=R.ordenar([row('a','Alfa',100,120),row('b','Beta',1000,1000),row('c','Gamma',10,12),row('d','Delta',100,90)],'ventas');
 assert.deepEqual(r.map(x=>[x.tienda.codigo,x.posicion]),[['a',1],['c',1],['b',3],['d',4]]);
});
test('ninguna meta incompleta/cero o resultado desconocido recibe posición',()=>{
 const input=[row('a','Sin presupuesto',null,500),row('b','Cero',0,100),row('c','Pendiente',100,null),row('d','Con datos',100,0)];
 const r=R.ordenar(input,'ventas');assert.equal(r[0].tienda.codigo,'d');assert.equal(r[0].posicion,1);assert.ok(r.slice(1).every(x=>x.posicion===null));assert.equal(input[0].categorias[0].presupuesto,null);
});
test('cuatro categorías, empates al porcentaje visible y orden determinista',()=>{
 for(const id of ['ventas','creditos','celulares','accesorios']){
  const r=R.ordenar([row('b','Beta',100000,100001,id),row('a','Alfa',100000,100000,id)],id);
  assert.deepEqual(r.map(x=>[x.tienda.codigo,x.posicion]),[['a',1],['b',1]]);
 }
});
test('rechaza categoría desconocida, faltante y tiendas repetidas',()=>{
 assert.throws(()=>R.ordenar([],'utilidad'));assert.throws(()=>R.ordenar([row('a','Alfa',1,1)],'creditos'));
 assert.throws(()=>R.ordenar([row('a','Alfa',1,1),row('a','Alfa',2,2)],'ventas'));
});
