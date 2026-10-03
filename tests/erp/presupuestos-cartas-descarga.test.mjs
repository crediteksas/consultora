import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const api=require('../../creditek/erp/presupuestos-cartas-descarga.js');
const carta=(nombre='Creditel')=>({completo:true,mes:'2026-10',tienda:{nombre,codigo:nombre},administradores:['Ana Administradora'],totales:{meta_venta_total:15000000,meta_creditos:20,meta_uds_cel:30,meta_uds_acc:250},premio:{activo:true,estrategia:'Octubre ganador',premio_tres:100000,premio_cuatro:200000}});
test('nombres por tienda y mes, seguros y sin sobrescribir homónimos',()=>{
 assert.deepEqual(api.archivos([carta(),carta('Chinucel')]).map(f=>f.nombre),['PPTO Creditel Oct 26.pdf','PPTO Chinucel Oct 26.pdf']);
 const names=api.archivos([carta('A/B'),carta('A:B'),carta('a b')]).map(f=>f.nombre);
 assert.equal(new Set(names.map(n=>n.toLowerCase())).size,3);assert.ok(names.every(n=>!n.includes('/')));
 assert.equal(api.periodo('2027-01'),'Ene 27');assert.equal(api.periodo('2026-12'),'Dic 26');assert.throws(()=>api.periodo('2026-13'));
});
test('bloquea lote vacío, mes mezclado y cualquier carta incompleta o sin accesorios verificados',()=>{
 assert.throws(()=>api.archivos([]));
 assert.throws(()=>api.archivos([carta(),{...carta('Pendiente'),completo:false}]),/Pendiente/);
 assert.throws(()=>api.archivos([{...carta(),accesoriosPendientes:true}]),/verifica/);
 assert.throws(()=>api.archivos([carta(),{...carta(),mes:'2026-11'}]),/mismo mes/);
});
test('PDF exige plantilla compartida y rechaza presupuestos incompletos antes de renderizar',async()=>{
 await assert.rejects(api.pdf(carta(),null,null,{}),/plantilla/);
 await assert.rejects(api.pdf({...carta(),completo:false},null,null),/Completa/);
 const source=readFileSync('creditek/erp/presupuestos-cartas-descarga.js','utf8');
 assert.ok(source.includes('plantilla.cartaHtml(c)'));
 assert.ok(!source.includes('doc.text('),'No existe un segundo diseño manual');
});
