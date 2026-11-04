import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),R=require('../../creditek/erp/presupuestos-retail-ranking.js');
function row(code,name,meta,real,id='ventas'){return{tienda:{codigo:code,nombre:name},categorias:[{id,presupuesto:meta,presupuestoCorte:meta,realizado:real,cumplimientoCorte:meta>0&&real!=null?real/meta:null,estado:meta==null?'Presupuesto incompleto':meta===0?'Sin meta asignada':real==null?'Resultado por validar':'Meta alcanzada'}]};}
test('ordena por cumplimiento, no por tamaño de ventas; empate comparte posición',()=>{
 const r=R.ordenar([row('a','Alfa',100,120),row('b','Beta',1000,1000),row('c','Gamma',10,12),row('d','Delta',100,90)],'ventas');
 assert.deepEqual(r.map(x=>[x.tienda.codigo,x.posicion]),[['a',1],['c',1],['b',3],['d',4]]);
});
test('el ranking usa la meta acumulada al corte, no la mensual',()=>{
 const a=row('a','Alfa',1000,200),b=row('b','Beta',1000,300);
 a.categorias[0].presupuestoCorte=100;a.categorias[0].cumplimientoCorte=2;
 b.categorias[0].presupuestoCorte=300;b.categorias[0].cumplimientoCorte=1;
 assert.deepEqual(R.ordenar([b,a],'ventas').map(r=>[r.tienda.codigo,r.posicion]),[['a',1],['b',2]]);
});
test('estima únicamente noviembre y diciembre de 2025, conserva el total y no inventa datos',()=>{
 const informe={tienda:{codigo:'a',nombre:'Alfa'},periodo:{mes:'2026-11',corte:'2026-11-03',cerrado:false},categorias:[
  {id:'ventas',valorAnterior:10000000,realizado:1500000,estadoCrecimiento:'Sin comparativo al corte'},
  {id:'creditos',valorAnterior:30,realizado:6,estadoCrecimiento:'Sin comparativo al corte'},
  {id:'accesorios',valorAnterior:null,realizado:5,estadoCrecimiento:'Histórico por validar'}]};
 const before=JSON.stringify(informe),[r]=R.estimarComparativo([informe]);
 assert.equal(JSON.stringify(informe),before);assert.equal(r.categorias[0].valorAnterior,10000000);assert.equal(r.categorias[0].valorAnteriorCorte,1000000);assert.equal(r.categorias[0].variacionAnual,500000);assert.equal(r.categorias[0].crecimientoAnual,.5);
 assert.equal(r.categorias[1].valorAnteriorCorte,3);assert.equal(r.categorias[1].variacionAnual,3);assert.equal(r.categorias[1].crecimientoAnual,1);
 assert.equal(r.categorias[2].valorAnteriorCorte,undefined);assert.equal(r.categorias[2].estadoCrecimiento,'Histórico por validar');
 const december={...informe,periodo:{mes:'2026-12',corte:'2026-12-03',cerrado:false},categorias:[{id:'creditos',valorAnterior:31,realizado:6,estadoCrecimiento:'Sin comparativo al corte'}]};
 assert.equal(R.estimarComparativo([december])[0].categorias[0].valorAnteriorCorte,3);
 assert.equal(R.estimarComparativo([{...informe,periodo:{mes:'2026-10',corte:'2026-10-03',cerrado:false}}])[0].categorias[0].variacionAnual,undefined);
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

test('crecimiento ordena por aumento porcentual con bases válidas, incluso sin presupuesto asignado',()=>{
 const r=(c,prior,current)=>{const x=row(c,c,null,current);x.categorias[0].crecimientoAnual=prior>0?(current-prior)/prior:null;return x;};
 const ranked=R.ordenar([r('A',100,90),r('B',1000,1200),r('C',10,15),r('D',0,100),r('E',100,100)],'ventas','crecimiento');assert.deepEqual(ranked.map(x=>[x.tienda.codigo,x.posicion]),[['C',1],['B',2],['E',3],['A',4],['D',null]]);assert.throws(()=>R.ordenar([],'ventas','otro'));
});
