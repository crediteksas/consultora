import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const api=require('../../creditek/erp/krediya-tarifario.js');
test('costo B2B usa proveedor vigente más económico y no adivina referencias',()=>{
 const matrix=api.tarifaRows([{referencia:'Equipo 1',precio_venta:1000,pagamos:800},{referencia:'Equipo 2',precio_venta:1000,pagamos:800},{referencia:'Equipo 3',precio_venta:1000,pagamos:800}]);
 api.addB2BCosts(matrix,[{id:'1',nombre:'Modelo 1'},{id:'2',nombre:'Modelo 2'},{id:'3',nombre:'Modelo 2'}],[{id:'b',producto_id:'canonical',proveedor_id:'b',costo:400,precio_tienda:420}],[{id:'a',nombre:'A'},{id:'b',nombre:'B'}],{'Equipo 1':'Modelo 1','Equipo 2':'Modelo 2'},[{producto_id:'1',referencia_id:'canonical'}]);
 assert.equal(matrix[1][5],400);assert.equal(matrix[1][21],420);assert.equal(matrix[1][10],'B');
 assert.equal(matrix[2][5],null);assert.match(matrix[2][9],/Sin oferta/);assert.equal(matrix[3][5],null);
});
test('usa la única oferta vigente entre duplicados y equivalencia revisada, sin escoger entre ofertas distintas',()=>{
 const matrix=api.tarifaRows(['Duplicado','Exacto','Ambiguo'].map(referencia=>({referencia,precio_venta:1000,pagamos:800})));
 const products=[{id:'1',nombre:'Duplicado'},{id:'2',nombre:'Duplicado'},{id:'3',nombre:'Exacto'},{id:'4',nombre:'Alias validado'},{id:'5',nombre:'Ambiguo'},{id:'6',nombre:'Ambiguo'}];
 const offers=[{producto_id:'2',proveedor_id:'p',costo:400,precio_tienda:420},{producto_id:'4',proveedor_id:'p',costo:500,precio_tienda:520},{producto_id:'5',proveedor_id:'p',costo:600},{producto_id:'6',proveedor_id:'p',costo:700}];
 api.addB2BCosts(matrix,products,offers,[{id:'p',nombre:'Proveedor'}],{'Exacto':'Alias validado'});
 assert.equal(matrix[1][21],420);assert.equal(matrix[2][21],520);
 assert.equal(matrix[3][5],null);assert.match(matrix[3][9],/ambigua/);
});
test('códigos Krediya se incluyen únicamente para referencias exactas verificadas',()=>{
 const rows=api.tarifaRows([{referencia:'GALAXY A17 5G 256GB 8RAM GRIS',precio_venta:1,pagamos:1},{referencia:'REDMI A7 PRO 64GB 3RAM',precio_venta:1,pagamos:1}]);
 assert.equal(rows[1][0],'T0985');assert.equal(rows[1][12],'T0985');assert.equal(rows[2][0],'');assert.equal(rows[2][12],null);
});
