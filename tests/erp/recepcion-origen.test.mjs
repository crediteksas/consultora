import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx = vm.createContext({});
vm.runInContext(readFileSync('creditek/erp/recepcion-origen.js','utf8'),ctx);
const render = ctx.RecepcionOrigen.render;
test('misma referencia en ítems distintos conserva proveedor y factura de cada ítem',()=>{
  const rows=[{remision_item_id:'a',factura_id:'f1',numero:'FE1',proveedor:'MPS'}, {remision_item_id:'b',factura_id:'f2',numero:'FE2',proveedor:'MR MOVIL'}];
  assert.match(render('a',rows),/MPS/); assert.doesNotMatch(render('a',rows),/MR MOVIL|FE2/);
  assert.match(render('b',rows),/MR MOVIL/); assert.doesNotMatch(render('b',rows),/MPS|FE1/);
});
test('muestra cada factura sin duplicados y escapa contenido',()=>{
  const r={remision_item_id:'a',factura_id:'f1',proveedor:'<img>',numero:'"FE1"'};
  const html=render('a',[r,r,{...r,factura_id:'f2',numero:'FE2'}]);
  assert.equal((html.match(/Factura:/g)||[]).length,2);
  assert.match(html,/&lt;img&gt;/); assert.doesNotMatch(html,/<img>/);
});
test('ausencia y error no inventan el origen ni ocultan la advertencia',()=>{
  assert.match(render('a',[]),/pendiente de vincular/);
  assert.match(render('a',[],true),/No se pudo consultar/);
});
for(const file of ['remisiones','documento-remision']) test(`${file}: origen junto a captura y sintaxis válida`,()=>{
  const html=readFileSync(`creditek/erp/${file}.html`,'utf8');
  assert.match(html,/recepcion-origen.js\?v=1/);
  assert.match(html,/RecepcionOrigen.render\(it.id,/);
  assert.match(html,/\$\{origen\}[\s\S]*?\$\{(?:imeis|inputs)\}/);
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(m[1].trim())new vm.Script(m[1]);
});
for(const file of ['remisiones','documento-remision']) test(`${file}: ejecuta recepción con dos ítems iguales de origen diferente`,async()=>{
  const html=readFileSync(`creditek/erp/${file}.html`,'utf8');
  const nodes=new Map();
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',classList:{add(){},remove(){}},querySelectorAll(){return [];}});return nodes.get(id);}};
  const items=['a','b'].map(id=>({id,cantidad:1,productos:{nombre:'MISMO CELULAR',tipo:'serializado',foto_url:'foto.png'}}));
  const rows=[{remision_item_id:'a',factura_id:'f1',numero:'FE1',proveedor:'MPS'}, {remision_item_id:'b',factura_id:'f2',numero:'FE2',proveedor:'MR MOVIL'}];
  const scope={document,RecepcionOrigen:ctx.RecepcionOrigen,items,origenesRecepcion:rows,errorTrazabilidad:false,remision:{estado:'despachada'},puedeAceptar:()=>true,esc:x=>x,escapeHtml:x=>x,window:{},abrirModalAccesible(){},sb:{from:()=>({select:()=>({eq:async()=>({data:items})})}),rpc:async()=>({data:rows})}};
  vm.createContext(scope);
  const start=file==='remisiones'?'async function abrirModalRecepcion(':'function renderPanelAceptacion(';
  const end=file==='remisiones'?'async function registrarFotosFaltantesRecepcion(':'// ============================================================\n//';
  const from=html.indexOf(start),to=html.indexOf(end,from+start.length);
  vm.runInContext(html.slice(from,to),scope);
  if(file==='remisiones')await scope.abrirModalRecepcion({id:'r',consecutivo:1});else scope.renderPanelAceptacion();
  const output=document.getElementById(file==='remisiones'?'recepcionItems':'items-aceptacion').innerHTML;
  assert.equal((output.match(/data-recepcion-origen/g)||[]).length,2);
  assert.match(output,/MPS[\s\S]*?FE1[\s\S]*?<input[\s\S]*?MR MOVIL[\s\S]*?FE2[\s\S]*?<input/);
});
