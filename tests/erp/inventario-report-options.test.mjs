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
 const html=readFileSync('creditek/erp/inventario.html','utf8');assert.match(html,/const registros=datosExportables\(\)/);assert.match(html,/costo === 'interno' && !esCentral\(\)/);assert.match(html,/metrics:\[\],tables,pdfTables/);
});

test('matriz cruza tiendas con referencias y conserva totales por ambos ejes',()=>{
 const tables=context.window.CreditekInventarioExport.matrizInforme({registros:[...registros,{...registros[0],productoId:'P2',productoCodigo:'R2',cantidad:3}],costo:'remision'});
 assert.equal(tables[0].headers.length,4);assert.deepEqual(Array.from(tables[0].rows[0]),['Uno',2,3,5]);assert.deepEqual(Array.from(tables[0].rows[1]),['Dos',1,0,1]);assert.deepEqual(Array.from(tables[0].totalRows[0]),['Total general',3,3,6]);assert.equal(tables[1].totalRows[0].at(-1),'$ 900,00');
});
test('Excel recibe valores monetarios numéricos y cantidades sin formato de pesos',()=>{
 const exportContext=vm.createContext({window:{},document:{dispatchEvent(){}},CustomEvent:function(){}});
 vm.runInContext(readFileSync('creditek/erp/kora-report-export.js','utf8'),exportContext);
 const tables=context.window.CreditekInventarioExport.matrizInforme({registros,costo:'remision'});
 const typed=exportContext.window.KoraReportExport.typedCell;
 const amount=typed(tables[1].rows[0][1],tables[1].headers[1]);assert.equal(amount.value,300);assert.equal(amount.kind,'currency');
 const quantity=typed(tables[0].rows[0].at(-1),tables[0].headers.at(-1));assert.equal(quantity.value,2);assert.equal(quantity.kind,'number');
});
test('consulta agrupa referencias, abre solo su detalle y gestión permite ver todas las filas',()=>{
 const source=readFileSync('creditek/erp/inventario.html','utf8');
 const fn=source.slice(source.indexOf('function prepararVistaInventario('),source.indexOf('function renderCelulares()'));
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{hidden:false,style:{},innerHTML:'',querySelectorAll(){return [];}});return elements.get(id);};
 const c=vm.createContext({document:{getElementById:el},gestionCostos:false,detalleSeleccionado:{celulares:null,accesorios:null},escapeHtml:x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;')});vm.runInContext(fn,c);
 const rows=[{tienda_actual:'T1',producto_id:'P1',productos:{nombre:'<Referencia>'}},{tienda_actual:'T1',producto_id:'P1',productos:{nombre:'<Referencia>'}},{tienda_actual:'T2',producto_id:'P1',productos:{nombre:'<Referencia>'}}];
 c.prepararVistaInventario(rows,'celulares');assert.equal(el('detalleCelulares').hidden,true);assert.match(el('referenciasCelulares').innerHTML,/2 <small>unidades/);assert.match(el('referenciasCelulares').innerHTML,/&lt;Referencia&gt;/);
 c.detalleSeleccionado.celulares=JSON.stringify(['T1','P1']);assert.equal(c.prepararVistaInventario(rows,'celulares').length,2);assert.equal(el('referenciasCelulares').hidden,true);assert.equal(el('detalleCelulares').hidden,false);
 c.gestionCostos=true;assert.equal(c.prepararVistaInventario(rows,'celulares').length,3);assert.equal(el('volverCelulares').hidden,true);
 c.gestionCostos=false;c.prepararVistaInventario(rows.slice(2),'celulares');assert.equal(c.detalleSeleccionado.celulares,null);assert.equal(el('detalleCelulares').hidden,true);
});
