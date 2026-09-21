import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');

test('KORA-2026-000052 carga más de 1000 productos y no oculta parlantes', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/traslados.html'), 'utf8');
  const source = html.slice(html.indexOf('async function cargarCatalogoTraslado()'), html.indexOf('async function cargarDatosBase()'));
  const rows = Array.from({length:2904}, (_,i)=>({id:String(i),codigo:`P${i}`,nombre:i===2080?'PARLANTE XIAOMI SOUND OUTDOOR 30W':`Producto ${i}`,tipo:'cantidad'}));
  const calls=[];
  let failure=false;
  const sb={from(table){assert.equal(table,'productos');const query={select(fields){assert.equal(fields,'id,codigo,nombre,tipo');return query;},eq(field,value){assert.equal(field,'activo');assert.equal(value,true);return query;},order(){return query;},range(from,to){calls.push([from,to]);return Promise.resolve(failure&&from===500?{data:null,error:{message:'Sin conexión'}}:{data:rows.slice(from,to+1),error:null});}};return query;}};
  const context=vm.createContext({sb});
  vm.runInContext(source,context);
  const result=await context.cargarCatalogoTraslado();
  assert.equal(result.length,2904);
  assert.equal(result[2080].nombre,'PARLANTE XIAOMI SOUND OUTDOOR 30W');
  assert.deepEqual(calls,[[0,499],[500,999],[1000,1499],[1500,1999],[2000,2499],[2500,2999]]);
  failure=true;
  await assert.rejects(context.cargarCatalogoTraslado(),/catálogo completo/);
  const search=html.slice(html.indexOf('function agregarItemAccesorioTra()'),html.indexOf('async function renderItemsTraslado()'));
  assert.doesNotMatch(search,/\.slice\(0,\s*8\)/);
  assert.match(search,/coincidencias/);
  assert.match(html,/max-height: 180px; overflow-y: auto/);
});

test('Traslados usa el campo productivo despachado_at en carga, filtro y fecha visible', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/traslados.html'), 'utf8');

  assert.match(html, /\.order\('despachado_at',\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(html, /t\.despachado_at\.slice\(0,\s*10\)/);
  assert.match(html, /new Date\(t\.despachado_at\)\.toLocaleDateString\('es-CO'\)/);
  assert.doesNotMatch(html, /traslados[\s\S]{0,800}\.order\('created_at'/);
});

test('un fallo de carga no expone especificaciones técnicas de la base de datos', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/traslados.html'), 'utf8');

  assert.match(html, /No fue posible cargar los traslados\. Intenta nuevamente\./);
  assert.doesNotMatch(html, /Error cargando traslados:\s*['"]?\s*\+\s*error\.message/);
});

test('la confirmación valida cantidades, costos y duplicados antes de invocar el RPC', async () => {
  const html = await readFile(path.join(root, 'creditek/erp/traslados.html'), 'utf8');
  const validation = html.indexOf('resumen.novedades.length');
  const rpc = html.indexOf("sb.rpc('ejecutar_traslado_despacho'");
  assert.ok(validation > 0 && validation < rpc);
  assert.match(html, /resumen\.duplicados\.length/);
  assert.match(html, /Number\(e\.target\.value\)/);
});
