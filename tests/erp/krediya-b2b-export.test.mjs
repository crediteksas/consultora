import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const api=require('../../creditek/erp/krediya-tarifario.js');
test('costo B2B usa proveedor vigente más económico y no adivina referencias',()=>{
 const matrix=api.tarifaRows([{referencia:'Equipo 1',precio_venta:1000,pagamos:800},{referencia:'Equipo 2',precio_venta:1000,pagamos:800},{referencia:'Equipo 3',precio_venta:1000,pagamos:800}]);
 api.addB2BCosts(matrix,[{id:'1',nombre:'Modelo 1'},{id:'2',nombre:'Modelo 2'},{id:'3',nombre:'Modelo 2'}],[{id:'a',producto_id:'1',proveedor_id:'a',costo:500},{id:'b',producto_id:'1',proveedor_id:'b',costo:400},{id:'c',producto_id:'1',proveedor_id:'inactive',costo:200}],[{id:'a',nombre:'A'},{id:'b',nombre:'B'}],{'Equipo 1':'Modelo 1','Equipo 2':'Modelo 2'});
 assert.equal(matrix[1][5],400);assert.equal(matrix[1][10],'B');assert.equal(matrix[1][6],400);
 assert.equal(matrix[2][5],null);assert.match(matrix[2][9],/ambiguo/);assert.equal(matrix[3][5],null);
});
