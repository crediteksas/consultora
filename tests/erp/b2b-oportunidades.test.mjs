import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),C=require('../../creditek/erp/b2b-comparativo.js'),O=require('../../creditek/erp/b2b-oportunidades.js');
const providers=['a','b','c'].map(id=>({id,nombre:id})),products=[{id:'p',nombre:'Equipo',codigo:'P'},{id:'q',nombre:'Otra RAM',codigo:'Q'}];
const offer=(id,cost,extra={})=>({producto_id:'p',proveedor_id:id,costo:cost,precio_tienda:cost+20000,...extra});
const build=extra=>C.build({providers,products,offers:[],winners:[],drafts:[],...extra});
test('Media excluye ganador y conserva precios; diferencia no es incremento automático',()=>{
 const data={offers:[offer('a',200000),offer('b',300000),offer('c',400000)]},before=JSON.stringify(data),report=build(data),[o]=O.find(report);
 assert.equal(o.average,350000);assert.equal(o.difference,150000);assert.equal(o.nextCost,300000);assert.equal(o.best.precio_tienda,220000);assert.equal(o.percent,150000/350000*100);assert.equal(JSON.stringify(data),before);
 assert.match(C.csv(report),/OPORTUNIDADES DE MARGEN/);assert.match(C.html(report),/Oportunidades de margen/);
});
test('Sin dos proveedores o con empate total no hay oportunidad; diferencias pequeñas sí',()=>{
 assert.equal(O.find(build({offers:[offer('a',200000)]})).length,0);
 assert.equal(O.find(build({offers:[offer('a',200000),offer('b',200000)]})).length,0);
 assert.equal(O.find(build({offers:[offer('a',200000),offer('b',200001)]}))[0].difference,1);
});
test('No mezcla variantes, borradores y publicados ni pondera duplicados de un proveedor',()=>{
 const draft={id:'d',proveedor_id:'b',creado_at:'2026-09-18',filas:[offer('b',100000,{precio_tienda:112000,included:true})]};
 assert.equal(O.find(build({offers:[offer('a',200000)],drafts:[draft]})).length,0);
 assert.equal(O.find(build({offers:[offer('a',200000),offer('b',300000,{producto_id:'q'})]})).length,0);
 const [o]=O.find(build({offers:[offer('a',200000),offer('b',300000),offer('b',900000),offer('c',400000)]}));
 assert.equal(o.average,350000);assert.equal(o.others.length,2);
});
test('Borradores pendientes y excluidos no producen oportunidades; enlace va a borrador exacto',()=>{
 const draft=(id,provider,row)=>({id,proveedor_id:provider,creado_at:'2026-09-18',filas:[row]});
 const report=build({drafts:[draft('da','a',offer('a',200000,{included:true})),draft('db','b',offer('b',300000,{included:true})),draft('dc','c',offer('c',800000,{included:false}))]});
 const [o]=O.find(report);assert.equal(o.average,300000);assert.equal(o.best.draftId,'da');
 assert.match(O.html(report,true),/data-opportunity-draft="da"/);assert.doesNotMatch(O.html(report,false),/<button/);
});
test('Empate parcial se muestra y escapes protegen las tarjetas',()=>{
 const report=build({providers:[{id:'a',nombre:'<script>x</script>'},...providers.slice(1)],offers:[offer('a',200000),offer('b',200000),offer('c',400000)]});
 assert.equal(O.find(report)[0].ties,2);assert.match(O.html(report),/hay empate/);assert.doesNotMatch(O.html(report),/<script>/);
});
test('Ruta manual exige confirmación y no guarda ni publica al abrir',()=>{
 const source=readFileSync(new URL('../../creditek/erp/b2b-whatsapp-ui.js',import.meta.url),'utf8');
 const block=source.split('container.openDraft=')[1].split("$('[data-history]').onclick")[0];
 assert.match(block,/confirm\(/);assert.match(block,/data.lista_id/);assert.match(block,/Math.floor\(Math.max\(0,index\)\/20\)/);assert.doesNotMatch(block,/\.rpc\(|save\(\)/);
 const page=readFileSync(new URL('../../creditek/erp/pedidos-b2b.html',import.meta.url),'utf8');
 assert.ok(page.indexOf('b2b-oportunidades.js')<page.indexOf('b2b-comparativo.js'));
});
