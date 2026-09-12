import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../../creditek/erp/compra-proveedor.html',import.meta.url),'utf8');
const body=html.match(/async function guardarCrearReferencia\(\) \{([\s\S]*?)\n\/\/ ===/)[0];
test('crear referencia permite cantidad y serializado sin valor preseleccionado',()=>{
  assert.match(html, /id="referencia-tipo"[\s\S]*?value=""[\s\S]*?value="cantidad"[\s\S]*?value="serializado"/);
  assert.doesNotMatch(body,/tipo:\s*'serializado'/);
  assert.match(body,/\['cantidad', 'serializado'\]\.includes\(tipo\)/);
});
for(const tipo of ['cantidad','serializado','']) test(`guarda selección ${tipo||'vacía rechazada'}`,async()=>{
  const fields={};
  for(const [key,value] of Object.entries({nombre:'Parlante',codigo:'TEST',categoria:'PARLANTES',precio:'294000',tipo,error:''}))fields['referencia-'+key]={value,classList:{add(){},remove(){}}};
  fields['guardar-crear-referencia']={};fields['modal-crear-referencia']={classList:{add(){}}};
  let payload;
  const ctx={document:{getElementById:id=>fields[id]},rolActual:'auditoria',categorias:[{codigo:'PARLANTES'}],productoFoto:{buscarProductoPorCodigo:async()=>null},SB:{from:()=>({insert:p=>{payload=p;return {select:()=>({maybeSingle:async()=>({data:{id:'test',...p}})})};}})},productos:[],seleccionarProducto(){},toast(){},Number};
  vm.createContext(ctx);vm.runInContext(body,ctx);await ctx.guardarCrearReferencia();
  if(tipo)assert.equal(payload.tipo,tipo);else assert.equal(payload,undefined);
});
