import test from 'node:test';
import assert from 'node:assert/strict';
import V from '../../creditek/erp/b2b-listas-vigentes.js';

test('muestra ofertas vigentes por proveedor y conserva la fecha de cada publicación',()=>{
 const offers=[{id:'a',proveedor_id:'p',producto_id:'x',lista_id:'l1',costo:355000,precio_tienda:405000,vigente:true,b2b_listas_precios:{creado_at:'2026-11-03T19:41:22Z'}},{id:'b',proveedor_id:'p',producto_id:'y',lista_id:'l2',costo:100000,precio_tienda:120000,vigente:true,b2b_listas_precios:{creado_at:'2026-11-02T19:41:22Z'}},{id:'old',proveedor_id:'p',producto_id:'z',lista_id:'l0',costo:1,precio_tienda:2,vigente:false,b2b_listas_precios:{creado_at:'2026-09-18T18:00:00Z'}}];
 const before=structuredClone(offers),html=V.render(offers,[{id:'p',nombre:'Proveedor <X>'}],[{id:'x',nombre:'Equipo A'},{id:'y',nombre:'Equipo B'},{id:'z',nombre:'Desactualizado'}]);
 assert.match(html,/Proveedor &lt;X&gt;/);assert.match(html,/2 ofertas vigentes/);assert.match(html,/3 de nov/);assert.match(html,/2 de nov/);assert.match(html,/varias publicaciones/);assert.match(html,/Equipo A/);assert.match(html,/355\.000/);assert.doesNotMatch(html,/Desactualizado/);assert.deepEqual(offers,before);
});
test('no muestra ofertas desactivadas ni inventa fechas faltantes',()=>{
 assert.match(V.render([],[],[]),/No hay ofertas vigentes/);
 const html=V.render([{id:'a',proveedor_id:'p',producto_id:'x',vigente:true,costo:null}],[],[]);assert.match(html,/Fecha no disponible/);assert.match(html,/Referencia no disponible/);assert.match(html,/No disponible/);
});
