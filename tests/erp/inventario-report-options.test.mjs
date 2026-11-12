import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({window:{},Intl,Date});
vm.runInContext(readFileSync('creditek/erp/inventario-export.js','utf8'),context);
const build=context.window.CreditekInventarioExport.tablaInforme;
const registros=[{tiendaCodigo:'T1',tienda:'Uno',productoId:'P1',productoCodigo:'R1',referencia:'Equipo',estado:'disponible',imei:'001',cantidad:1,costo:100},{tiendaCodigo:'T1',tienda:'Uno',productoId:'P1',productoCodigo:'R1',referencia:'Equipo',estado:'disponible',imei:'002',cantidad:1,costo:200},{tiendaCodigo:'T2',tienda:'Dos',productoId:'P1',productoCodigo:'R1',referencia:'Equipo',estado:'disponible',imei:'003',cantidad:1,costo:300}];
test('agrupa por tienda y referencia sin revelar IMEI ni costos por defecto',()=>{
 const t=build({registros,celulares:true});assert.equal(t.rows.length,2);assert.equal(t.rows[0].at(-1),2);
 assert.ok(!t.headers.some(h=>/costo|IMEI/i.test(h)));assert.ok(!JSON.stringify(t).includes('001'));
});
test('detalle IMEI es independiente de costos y preserva ceros iniciales',()=>{
 const t=build({registros,celulares:true,incluirImei:true});assert.equal(t.rows.length,3);assert.equal(t.rows[0][4],'001');assert.ok(!t.headers.some(h=>/costo/i.test(h)));
});
test('valoración agrupada usa promedio ponderado y suma de valores, no suma de costos unitarios',()=>{
 const t=build({registros,celulares:true,costo:'remision'});assert.equal(t.rows[0].at(-2),150);assert.equal(t.rows[0].at(-1),300);assert.ok(!t.sumColumns.includes(t.headers.length-2));
 const acc=build({registros:[{...registros[0],cantidad:3},{...registros[1],cantidad:1}],celulares:false,incluirImei:true,costo:'interno'});assert.equal(acc.rows[0].at(-2),125);assert.equal(acc.rows[0].at(-1),500);assert.ok(!acc.headers.includes('IMEI'));
});
test('referencias homónimas y estados diferentes no se mezclan; falta de costo queda explícita',()=>{
 const t=build({registros:[...registros,{...registros[0],productoId:'P2'},{...registros[0],estado:'vendido'},{...registros[0],costo:null}],celulares:true,costo:'remision'});
 assert.equal(t.rows.length,4);assert.equal(t.rows[0].at(-1),'Sin costo registrado');
});
test('adaptador respeta datos filtrados, permisos y elimina indicadores generales en exportación',()=>{
 const html=readFileSync('creditek/erp/inventario.html','utf8');assert.match(html,/const registros=datosExportables\(\)/);assert.match(html,/costo === 'interno' && !esCentral\(\)/);assert.match(html,/metrics:\[\],tables:\[tabla\]/);
});
