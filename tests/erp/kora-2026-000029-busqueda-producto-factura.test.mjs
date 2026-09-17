import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const compra = await readFile(path.join(root, 'creditek/erp/compra-proveedor.html'), 'utf8');

test('auditoria conserva acceso a Crear factura junto con gerencia', () => {
  assert.match(compra, /rolActual !== 'gerencia' && rolActual !== 'auditoria'/);
});

test('la carga de productos incluye código y no filtra por tienda', () => {
  const consulta = compra.match(/SB\.from\('productos'\)[\s\S]*?\.order\('nombre'\)/)?.[0] || '';
  assert.match(consulta, /select\('id, codigo, nombre, categoria, tipo, margen_tipo, margen_valor'\)/);
  assert.match(consulta, /eq\('activo', true\)/);
  assert.doesNotMatch(consulta, /tienda_codigo/);
});

test('el buscador encuentra productos por código, nombre o categoría', () => {
  assert.match(compra, /p\.codigo \+ ' ' \+ p\.nombre \+ ' ' \+ p\.categoria/);
  assert.match(compra, /\$\{esc\(p\.codigo\)\} · \$\{esc\(p\.categoria\)\}/);
  assert.match(compra, /coincidencias\.slice\(inicio, inicio \+ 30\)/);
});

function buscadorFixture(rows, failAt = -1) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, {value:'',textContent:'',innerHTML:'',disabled:false,scrollTop:40});
    return elements.get(id);
  };
  const calls = [];
  let failure = failAt;
  const SB = {from(table) {
    const call = {table,orders:[]};
    calls.push(call);
    return {select(columns){call.columns=columns;return this;},eq(key,value){call.filter=[key,value];return this;},order(key){call.orders.push(key);return this;},
      async range(from,to){call.range=[from,to];if(from===failure)return {data:null,error:new Error('sin conexión')};return {data:rows.slice(from,to+1),error:null};}};
  }};
  const code = compra.slice(compra.indexOf('async function cargarProductos()'),compra.indexOf('async function cargarCatalogos()')) +
    compra.slice(compra.indexOf('function renderBusqueda('),compra.indexOf('function seleccionarProducto('));
  const context = vm.createContext({SB,document:{getElementById:el},esc:v=>String(v)});
  vm.runInContext('let productos=[];let estadoProductos="pendiente";let paginaProductos=0;'+code,context);
  return {context,el,calls,run:code=>vm.runInContext(code,context),recover:()=>{failure=-1;}};
}
const catalogue = Array.from({length:2491},(_,i)=>({id:String(i),codigo:`SKU${i}`,nombre:i===1089?'REDMI 15C 4/128GB':`Producto ${i}`,categoria:'CELULAR',tipo:'serializado'}));

test('recupera 2491 referencias, incluyendo Redmi fuera de las primeras 1000',async()=>{
  const f=buscadorFixture(catalogue);
  await f.run('cargarProductos()');
  assert.equal(f.run('productos.length'),2491);
  assert.deepEqual(f.calls.map(c=>c.range),[[0,499],[500,999],[1000,1499],[1500,1999],[2000,2499]]);
  for(const c of f.calls){assert.deepEqual(c.filter,['activo',true]);assert.deepEqual(c.orders,['categoria','nombre','id']);}
  f.run('renderBusqueda("REDMI 15C")');
  assert.match(f.el('search-results').innerHTML,/REDMI 15C 4\/128GB/);
  assert.equal(f.el('productos-total').textContent,'1–1 de 1 referencias');
  assert.doesNotMatch(f.el('search-results').innerHTML,/btn-crear-referencia/);
});

test('permite recorrer todos los resultados, volver y reiniciar página al buscar',async()=>{
  const f=buscadorFixture(catalogue);await f.run('cargarProductos()');
  assert.equal(f.el('productos-total').textContent,'1–30 de 2491 referencias');
  f.run('renderBusqueda("",1)');assert.equal(f.el('productos-total').textContent,'31–60 de 2491 referencias');
  assert.equal(f.el('productos-anterior').disabled,false);
  f.run('renderBusqueda("",83)');assert.equal(f.el('productos-total').textContent,'2491–2491 de 2491 referencias');
  assert.equal(f.el('productos-siguiente').disabled,true);
  f.run('renderBusqueda("",0)');assert.equal(f.el('productos-anterior').disabled,true);
  f.run('renderBusqueda("REDMI 15C")');assert.equal(f.run('paginaProductos'),0);
  f.run('renderBusqueda("inexistente")');assert.match(f.el('search-results').innerHTML,/btn-crear-referencia/);
});

test('un fallo de página no ofrece catálogo parcial ni crear duplicados; reintentar recupera',async()=>{
  const f=buscadorFixture(catalogue,1000);
  f.run('renderBusqueda("")');assert.doesNotMatch(f.el('search-results').innerHTML,/btn-crear-referencia/);
  const response=await f.run('cargarProductos()');assert.ok(response.error);
  assert.equal(f.run('productos.length'),0);
  assert.match(f.el('search-results').innerHTML,/Reintentar carga/);
  assert.doesNotMatch(f.el('search-results').innerHTML,/btn-crear-referencia/);
  assert.equal(f.el('productos-siguiente').disabled,true);
  f.recover();await f.run('cargarProductos()');assert.equal(f.run('productos.length'),2491);
});

test('el desplegable de resultados conserva el fix de visibilidad', () => {
  assert.match(compra, /\.compra-buscador-modal #search-results\s*\{[^}]*display:\s*block;[^}]*position:\s*static;[^}]*width:\s*100%/s);
});
