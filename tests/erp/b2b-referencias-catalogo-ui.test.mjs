import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import R from '../../creditek/erp/b2b-referencias-catalogo.js';
import C from '../../creditek/erp/b2b-comparativo.js';
import O from '../../creditek/erp/b2b-oportunidades.js';
import WUI from '../../creditek/erp/b2b-whatsapp-ui.js';
const mappings=[
 {producto_id:'red',referencia_id:'model',nombre_pedido:'Auriculares modelo 8'},
 {producto_id:'blue',referencia_id:'model',nombre_pedido:'Auriculares modelo 8'},
 {producto_id:'model',referencia_id:'model',nombre_pedido:'Auriculares modelo 8'}
];
const products=[{id:'model',nombre:'Auriculares modelo 8',codigo:'GEN'},{id:'red',nombre:'Auriculares modelo 8 Red',codigo:'RED'},{id:'blue',nombre:'Auriculares modelo 8 Blue',codigo:'BLUE'},{id:'edition',nombre:'Auriculares modelo 8 Ceramic Edition',codigo:'CER'}];
const providers=[{id:'a',nombre:'Proveedor A'},{id:'b',nombre:'Proveedor B'}];
const offer=(id,product,provider,cost)=>({id,producto_id:product,proveedor_id:provider,costo:cost,precio_tienda:cost+20000,vigente:true});
test('Equivalencias explícitas: un producto para pedir; fuentes y ediciones intactas',()=>{
 const original=structuredClone(products),map=R.create(mappings);
 assert.equal(map.name('red'),'Auriculares modelo 8');
 assert.equal(map.name('model'),'Auriculares modelo 8');
 assert.equal(map.name('unknown','Nombre original'),'Nombre original');
 assert.deepEqual(map.unique(products).map(p=>p.id),['model','edition']);
 assert.equal(map.unique(products)[0].codigo,'GEN');
 const source=offer('source','red','a',150000),mapped=map.offer(source);
 assert.equal(mapped.producto_id,'model');assert.equal(mapped.producto_origen_id,'red');assert.equal(mapped.id,'source');
 assert.equal(source.producto_id,'red');assert.deepEqual(products,original);
 assert.equal(map.id('edition'),'edition');
 assert.equal(R.create().product(products[1]).nombre,'Auriculares modelo 8 Red');
});
test('No acepta equivalencias incompletas, contradictorias ni cadenas',()=>{
 assert.throws(()=>R.create([{producto_id:'red'}]),/incompleta/);
 assert.throws(()=>R.create([...mappings,{producto_id:'red',referencia_id:'edition',nombre_pedido:'Otro'}]),/contradictorias/);
 assert.throws(()=>R.create([...mappings,{producto_id:'green',referencia_id:'model',nombre_pedido:'Otro'}]),/contradictorias/);
 assert.throws(()=>R.create([{producto_id:'red',referencia_id:'blue',nombre_pedido:'Modelo'},{producto_id:'blue',referencia_id:'model',nombre_pedido:'Modelo'}]),/referencia final/);
});
test('Comparativo agrupa colores y toma un costo por proveedor, sin perder oferta original',()=>{
 const offers=[offer('a2','red','a',160000),offer('a1','blue','a',150000),offer('b1','model','b',155000),offer('a3','edition','a',200000)];
 const original=structuredClone(offers),winners=[{...offers[1],producto_id:'model'},offers[3]];
 const report=C.build({providers,products,offers,winners,drafts:[],references:mappings});
 const row=report.published.find(r=>r.product.id==='model');
 assert.equal(report.published.length,2);assert.equal(row.product.nombre,'Auriculares modelo 8');
 assert.deepEqual(row.cells.map(c=>c.map(o=>o.costo)),[[150000],[155000]]);
 assert.equal(row.sourceOffers.length,3);assert.equal(row.best.id,'a1');assert.equal(row.best.producto_origen_id,'blue');
 assert.match(row.status,/Coincide/);assert.deepEqual(offers,original);
 assert.equal(O.find(report)[0].average,155000);
 assert.doesNotMatch(C.html(report),/modelo 8 (Red|Blue)/);
 assert.match(C.html(report),/Ceramic Edition/);
});
test('Empates preservan la misma oferta ganadora que SQL y no cuentan colores como proveedores',()=>{
 const offers=[offer('a2','red','a',150000),offer('a1','blue','a',150000),offer('b1','model','b',150000)];
 const build=id=>C.build({providers,products,offers,winners:[{...offers.find(o=>o.id===id),producto_id:'model'}],drafts:[],references:mappings});
 const row=build('a1').published[0];assert.equal(row.best.id,'a1');assert.equal(row.ties,2);assert.match(row.status,/Coincide/);
 assert.match(build('a2').published[0].status,/REVISAR/);
});
test('Borradores de colores se comparan sin cambiar filas ni enlace de edición',()=>{
 const rows=[{...offer('a1','red','a',160000),included:true,reference:'Red',row:1},{...offer('a2','blue','a',150000),included:true,reference:'Blue',row:2}];
 const drafts=[{id:'draft-a',proveedor_id:'a',creado_at:'2026-09-18',filas:rows},{id:'draft-b',proveedor_id:'b',creado_at:'2026-09-18',filas:[{...offer('b1','model','b',190000),included:true,row:1}]}];
 const original=structuredClone(drafts),report=C.build({providers,products,offers:[],winners:[],drafts,references:mappings});
 assert.equal(report.drafts.length,1);assert.equal(report.unresolved.length,0);
 assert.equal(report.drafts[0].best.producto_origen_id,'blue');assert.deepEqual(drafts,original);
 assert.match(O.html(report,true),/data-opportunity-product="blue"/);
});
test('Comparación dentro del editor reemplaza solo el proveedor abierto y no cambia identidades fuente',()=>{
 const rows=[{...offer('a1','red','a',150000),included:true,row:1},{...offer('a2','blue','a',160000),included:true,row:2}];
 const offers=[offer('old-a','model','a',140000),offer('b1','model','b',145000),offer('other','edition','b',220000)];
 const before=structuredClone({rows,offers});
 const result=WUI.comparisonRows(rows,offers,'a',R.create(mappings));
 assert.equal(result.length,1);assert.equal(result[0].id,'b1');assert.equal(result[0].producto_id,'model');
 assert.deepEqual({rows,offers},before);
 const changed=WUI.comparisonRows([{...rows[0],costo:130000,precio_tienda:150000}],offers,'a',R.create(mappings));
 assert.equal(changed[0].producto_origen_id,'red');assert.equal(changed[0].id,'a1');
});
test('Mapa paginado, fallo explícito y consulta de solo lectura',async()=>{
 const data=Array.from({length:1101},(_,i)=>({producto_id:'p'+i,referencia_id:'p'+i,nombre_pedido:'P'+i})),ranges=[],queries=[];
 const sb={from(table){queries.push(table);const q={select(value){assert.equal(value,'producto_id,referencia_id,nombre_pedido');return q;},order(value){assert.equal(value,'producto_id');return q;},range:async(a,b)=>{ranges.push([a,b]);return {data:data.slice(a,b+1)};}};return q;}};
 const map=await R.load(sb);assert.equal(map.name('p1100'),'P1100');assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);assert.deepEqual(new Set(queries),new Set(['b2b_referencias_catalogo']));
 for(const response of [{error:Error('Sin conexión')},{data:null}]){const q={select(){return q;},order(){return q;},range:async()=>response};await assert.rejects(R.load({from:()=>q}));}
});

function ui(){
 const page=readFileSync(new URL('../../creditek/erp/pedidos-b2b.html',import.meta.url),'utf8');
 const script=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n').replace('boot().catch(e=>{console.error(e);showLoadError(e);});','');
 const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){}},addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];}});return elements.get(id);};
 const ctx=createContext({window:{SB:{},print(){}},document:{getElementById:element,querySelectorAll:()=>[]},KoraB2BReferencias:R,KoraB2BComparativo:{mount(){}},KoraB2BCierres:{brand:()=>''},KoraB2BListsUI:{download(rows){ctx.downloaded=rows;}},Intl,Map,Date,Number,String,setTimeout(){},console});
 runInContext(script,ctx);ctx.mappings=mappings;ctx.fixtureProducts=products;ctx.fixtureProviders=providers;
 runInContext('referenceMap=KoraB2BReferencias.create(mappings);products=fixtureProducts;providers=fixtureProviders;',ctx);
 return {ctx,elements,run:code=>runInContext(code,ctx)};
}
test('Administrador, pedidos históricos, compra, recepción y CSV no muestran color',()=>{
 const {run,ctx,elements}=ui();
 ctx.line={id:'line',productos:products[1],cantidad_solicitada:2,cantidad_ordenada:0,precio_catalogo:170000,pedidos_b2b:{consecutivo:1,origenes:{nombre:'Chinucell'}}};
 ctx.order={id:'oc',consecutivo:1,created_at:'2026-09-18',proveedores:{nombre:'Proveedor A'},orden_compra_items:[{id:'item',producto_id:'red',productos:products[1],cantidad_ordenada:2,costo_cotizado:150000,precio_tienda_cotizado:170000}]};
 run("pending=[line];orders=[order];sources=new Map([['line',{proveedor_id:'a',costo:150000,proveedores:{nombre:'Proveedor A'}}]]);renderPending();printOrder('oc');receiveOrder('oc');renderMyOrders([{consecutivo:1,solicitado_at:'2026-09-18',estado:'solicitado',pedido_b2b_items:[{productos:fixtureProducts[1],cantidad_solicitada:2,precio_catalogo:170000}]}]);renderPublished([{producto_id:'model',proveedor_id:'a',costo:150000,precio_tienda:170000,motivo:'[BAJO PEDIDO]'}]);$('downloadRequests').onclick();");
 for(const id of ['pendingLines','docCompra','receiveLines','myOrders','publishedCatalog']){assert.match(elements.get(id).innerHTML,/Auriculares modelo 8/);assert.doesNotMatch(elements.get(id).innerHTML,/modelo 8 (Red|Blue)/);}
 assert.match(elements.get('publishedCatalog').innerHTML,/Bajo pedido/);
 assert.equal(ctx.downloaded[1][2],'Auriculares modelo 8');
 assert.equal((elements.get('extraProduct').innerHTML.match(/value="model"/g)||[]).length,1);
 assert.doesNotMatch(elements.get('extraProduct').innerHTML,/value="(red|blue)"/);
 assert.equal(ctx.line.productos.id,'red');assert.equal(ctx.order.orden_compra_items[0].producto_id,'red');
});
