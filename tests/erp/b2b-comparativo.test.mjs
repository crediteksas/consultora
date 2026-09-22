import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),C=require('../../creditek/erp/b2b-comparativo.js');
const providers=[{id:'b',nombre:'Proveedor B'},{id:'a',nombre:'Proveedor A'},{id:'c',nombre:'Sin lista'}];
const products=[{id:'p',nombre:'Equipo 4/128',codigo:'REF-1'},{id:'q',nombre:'Equipo 8/128',codigo:'REF-2'}];
const offer=(id,cost=400000,price=cost+20000)=>({producto_id:'p',proveedor_id:id,costo:cost,precio_tienda:price,vigente:true});
const draftRow=(extra={})=>({...offer('a',350000),row:1,reference:'Equipo 4/128',included:true,...extra});
const draft=(id,provider,rows,created='2026-09-18T10:00:00Z')=>({id,proveedor_id:provider,creado_at:created,lista_id:null,filas:rows});
const build=extra=>C.build({providers,products,offers:[offer('a'),offer('b',420000)],winners:[offer('a')],drafts:[],generatedAt:'2026-09-18T12:00:00Z',...extra});
test('Todos los proveedores en columnas, menor costo y precio realmente publicado',()=>{
 const report=build(),r=report.published[0];
 assert.equal(report.suppliers.length,3);assert.equal(r.cells[2].length,0);
 assert.equal(r.best.proveedor_id,'a');assert.equal(r.actual.precio_tienda,420000);
 assert.match(r.status,/Coincide/);assert.match(C.html(report),/Sin oferta/);
 assert.match(C.html(report),/class="num best"/);assert.equal(C.rows(report,'published')[1][9],20000);
});
test('Excel de listas guardadas cruza referencias en filas y solo proveedores con precios en columnas',()=>{
 const report=build(),tables=C.excelTables(report),matrix=tables.find(table=>table.heading==='Comparativo vigente');
 assert.deepEqual(matrix.headers,['Referencia','Código','Costo · Proveedor A','Costo · Proveedor B','Menor costo','Proveedor menor costo','Precio retail vigente','Ahorro vs retail','Estado']);
 assert.equal(matrix.rows.length,1);assert.equal(matrix.rows[0][0],'Equipo 4/128');assert.equal(matrix.rows[0][2],400000);assert.equal(matrix.rows[0][3],420000);
 assert.ok(!matrix.headers.some(header=>header.includes('Sin lista')));assert.equal(matrix.rows[0][4],400000);assert.equal(matrix.rows[0][5],'Proveedor A');
 assert.equal(matrix.rows[0][7],20000);assert.deepEqual(matrix.sumColumns,[2,3,4,6,7]);
});
test('El Excel comparativo siempre declara alcance global y elimina la tienda heredada',()=>{
 const base={title:'Pedidos',scope:{label:'Sonivox',code:'CK-07'},filters:[['Alcance del informe','Sonivox · CK-07'],['Tienda','Sonivox'],['Estado','Activas']]};
 const result=C.excelReport(base,build());
 assert.deepEqual(result.scope,{label:'Global — todas las tiendas',code:'',restricted:false});
 assert.deepEqual(result.filters,[['Alcance del informe','Global — todas las tiendas'],['Estado','Activas']]);
 assert.doesNotMatch(JSON.stringify(result),/Sonivox|CK-07/);
});
test('Fuentes publicadas no se duplican como borradores cerrados',()=>{
 const published={...offer('a'),lista_id:'lista-a',b2b_listas_precios:{creado_at:'2026-09-18T10:00:00Z',archivo:'proveedor-a.xlsx'}};
 const closed={...draft('cerrado','a',[draftRow()]),lista_id:'lista-a',id:'lista-a'};
 const report=build({offers:[published],winners:[offer('a')],drafts:[closed]});
 assert.equal(report.sources.length,1);assert.equal(report.sources[0].state,'Oferta vigente publicada');assert.equal(report.sources[0].file,'proveedor-a.xlsx');
});
test('Excel separa borradores y conserva pendientes sin convertir datos faltantes en cero',()=>{
 const report=build({drafts:[draft('d','a',[draftRow({producto_id:'q'}),draftRow({producto_id:'',reference:'Pendiente',costo:null,precio_tienda:null,row:2})])]});
 const tables=C.excelTables(report),draftTable=tables.find(table=>table.heading==='Borradores por revisar'),pending=tables.find(table=>table.heading==='Pendientes y excluidas');
 assert.equal(draftTable.rows[0][0],'Equipo 8/128');assert.equal(draftTable.rows[0][2],350000);
 assert.equal(pending.rows[0][0],'Proveedor A');assert.equal(pending.rows[0][2],'');assert.equal(pending.rows[0][3],'');
});
test('No sustituye la selección publicada por una propuesta más barata',()=>{
 const report=build({drafts:[draft('d','a',[draftRow()])]});
 assert.equal(report.published[0].chosen.costo,400000);
 assert.equal(report.drafts[0].chosen.costo,350000);
 assert.equal(report.drafts[0].actual.precio_tienda,420000);
 assert.match(report.drafts[0].status,/no publicada/);
});
test('Con solo borradores no inventa catálogo publicado',()=>{
 const report=build({offers:[],winners:[],drafts:[draft('d','a',[draftRow()])]});
 assert.equal(report.published.length,0);assert.equal(report.drafts.length,1);
 assert.match(C.html(report),/No hay ofertas publicadas/);
 assert.equal(report.drafts[0].actual,undefined);
});
test('Último borrador por proveedor, no el menor precio histórico',()=>{
 const report=build({drafts:[draft('old','a',[draftRow({costo:100000,precio_tienda:120000})],'2026-09-01T00:00:00Z'),draft('new','a',[draftRow()])]});
 assert.equal(report.drafts[0].best.costo,350000);assert.equal(report.sources.filter(s=>s.id==='old').length,0);
 const closed=build({drafts:[{...draft('new','a',[draftRow()]),lista_id:'list'},draft('old','a',[draftRow()],'2026-09-01T00:00:00Z')]});
 assert.equal(closed.drafts.length,0);
});
test('Empates respetan costo, precio retail e identificador, sin cambiar márgenes',()=>{
 const a=offer('a',400000,425000),b=offer('b',400000,420000);
 const r=build({offers:[a,b],winners:[b]}).published[0];
 assert.equal(r.best.proveedor_id,'b');assert.equal(r.ties,2);assert.match(r.status,/Coincide/);
 assert.equal(build({offers:[offer('b'),offer('a')]}).published[0].best.proveedor_id,'a');
});
test('Detecta selección publicada que no corresponde al comparativo',()=>{
 assert.match(build({winners:[offer('b',420000)]}).published[0].status,/REVISAR/);
 assert.match(build({winners:[]}).published[0].status,/REVISAR/);
});
test('No agrupa variantes por nombre; pendientes, exclusiones y duplicados no ganan',()=>{
 const rows=[draftRow({producto_id:'',reference:'desconocido',costo:1}),draftRow({producto_id:'q',reference:'Equipo 8/128'}),draftRow({included:false,exclusion:'Agotado'}),draftRow(),draftRow({row:5})];
 const report=build({drafts:[draft('d','a',rows)]});
 assert.equal(report.drafts.length,1);assert.equal(report.drafts[0].product.id,'q');
 assert.equal(report.unresolved.length,4);assert.match(report.unresolved[0].reason,/vincular/);
 assert.match(report.unresolved[1].reason,/Agotado/);assert.match(report.unresolved[2].reason,/repetida/);
});
test('No interpreta datos faltantes como cero ni aprueba anomalías',()=>{
 const report=build({drafts:[draft('d','a',[draftRow({producto_id:'',costo:null}),draftRow({producto_id:'q',priceWarning:true,priceConfirmed:false})])]});
 assert.equal(report.unresolved[0].cost,null);assert.equal(report.drafts.length,0);
 assert.match(report.unresolved[1].reason,/confirmar/);
 assert.throws(()=>build({offers:[offer('a',null)]}),/inválidos/);
});
test('Escape HTML y protección contra fórmulas en Excel',()=>{
 const report=build({drafts:[draft('d','a',[draftRow({producto_id:'',reference:'=HYPERLINK("evil") <script>alert(1)</script>'})])]});
 assert.doesNotMatch(C.html(report),/<script>/);assert.match(C.html(report),/&lt;script&gt;/);
 assert.match(C.csv(report),/'=HYPERLINK/);assert.match(C.csv(report),/PENDIENTES Y EXCLUIDAS/);
});
test('La consulta pagina más de 1000 filas y propaga errores',async()=>{
 const data=Array.from({length:1201},(_,i)=>({id:i})),ranges=[];
 const result=await C.all(()=>({range:async(a,b)=>{ranges.push([a,b]);return {data:data.slice(a,b+1)}}}));
 assert.equal(result.length,1201);assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
 await assert.rejects(C.all(()=>({range:async()=>({error:Error('Sin conexión')})})),/Sin conexión/);
 await assert.rejects(C.all(()=>({range:async()=>({data:null})})),/incompleta/);
});
test('Retail no puede ejecutar la consulta interna',async()=>{
 let queried=false;const sb={from(){queried=true;throw Error('No consultar')}};
 for(const profile of [{activo:true,rol:'asesor'},{activo:false,rol:'gerencia'},null])await assert.rejects(C.load(sb,profile),/Administración/);
 assert.equal(queried,false);
});
test('Botón en Administración; descarga sin mutaciones ni publicación',()=>{
 const page=readFileSync(new URL('../../creditek/erp/pedidos-b2b.html',import.meta.url),'utf8');
 assert.ok(page.indexOf('id="comparativoProveedores"')>page.indexOf('id="managementView"'));
 assert.match(page,/profile:\(\)=>profile/);
 const source=readFileSync(new URL('../../creditek/erp/b2b-comparativo.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.rpc\(|\.insert\(|\.update\(|\.delete\(|service_role/);
 assert.match(source,/title:'Comparativo de listas de proveedores'/);assert.match(source,/workspace-listas/);
});
test('Listas y precios conserva descargas visibles dentro de su propia vista',()=>{
 const page=readFileSync(new URL('../../creditek/erp/pedidos-b2b.html',import.meta.url),'utf8');
 assert.match(page,/data-workspace="listas">Listas y precios<\/button>/);
 assert.match(page,/KoraB2BWorkspace.mount/);
 assert.ok(page.indexOf('id="workspace-listas"')<page.indexOf('id="comparativoProveedores"'));
 assert.ok(page.indexOf('id="comparativoProveedores"')<page.indexOf('id="listasWhatsApp"'));
});
