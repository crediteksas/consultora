import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('creditek/erp/confirmaciones-deuda-gestion.js','utf8');
const start=source.indexOf(' function sumarSaldos(diarias)');
const end=source.indexOf(' const {data:{session}}',start);
assert.ok(start>=0&&end>start);
const sum=vm.runInNewContext(source.slice(start,end)+'\nsumarSaldos');
const row=(sistema,declarado=sistema)=>({confirmacion:{saldo_sistema:sistema,saldo_declarado:declarado}});
const total=rows=>JSON.parse(JSON.stringify(sum(rows)));

test('totales independientes suman centavos, valores de texto y saldos a favor sin perder el signo',()=>{
 assert.deepEqual(total([row('100.20','99.10'),row(20.60,20.60),row(-5.15,-3.25)]),{sistema:115.65,declarado:116.45,confirmadas:3});
 assert.equal(total([row(0.1),row(0.2)]).sistema,0.3);
});
test('sin confirmar no inventa saldos ni cambia los datos de las filas',()=>{
 const rows=[row(10),{confirmacion:null},{tienda:'Pendiente'}];const before=structuredClone(rows);
 assert.deepEqual(total(rows),{sistema:10,declarado:10,confirmadas:1});assert.deepEqual(rows,before);
 assert.deepEqual(total([{confirmacion:null}]),{sistema:0,declarado:0,confirmadas:0});
 assert.deepEqual(total([]),{sistema:0,declarado:0,confirmadas:0});
});
test('el redondeo de cada saldo coincide con los centavos visibles, también negativos',()=>{
 assert.equal(total([row(1.005)]).sistema,1.01);
 assert.equal(total([row(-1.005)]).sistema,-1.01);
 assert.equal(total([row(1.005),row(-1.005)]).sistema,0);
});
test('saldos ausentes o inválidos no se convierten en un total cero',()=>{
 for(const value of [null,undefined,'',' ',false,true,NaN,Infinity,-Infinity,{},'no-numérico']){
  assert.throws(()=>sum([row(value)]),/saldos incompletos/);
  assert.throws(()=>sum([{confirmacion:{saldo_sistema:1,saldo_declarado:value}}]),/saldos incompletos/);
 }
});
test('rechaza importes o acumulados que exceden la precisión segura en centavos',()=>{
 assert.throws(()=>sum([row(Number.MAX_SAFE_INTEGER)]),/rango de cálculo seguro/);
 assert.throws(()=>sum([row(60000000000000),row(60000000000000)]),/rango de cálculo seguro/);
});
test('el pie tiene cinco columnas, etiqueta accesible y versión nueva del script',()=>{
 const html=readFileSync('creditek/erp/confirmaciones-deuda.html','utf8');
 assert.match(html,/<tfoot id="totales" hidden>/);
 assert.match(html,/<th scope="row" colspan="2" id="totalEtiqueta">TOTAL<\/th>/);
 for(const id of ['totalSistema','totalDeclarado','totalAlcance'])assert.match(html,new RegExp('<td id="'+id+'">'));
 assert.match(html,/confirmaciones-deuda-gestion\.js\?v=1\.2\.0/);
});
