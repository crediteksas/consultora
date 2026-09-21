import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const api=require('../../creditek/erp/alertas-celulares.js');
const range={start:'2026-09-02',end:'2026-09-21'};
const fixture=()=>({products:[{id:'p',nombre:'Samsung A07',categoria:'CELULAR',tipo:'serializado',activo:true}],stores:[{codigo:'A',nombre:'Chinucell',tipo:'propia',activo:true}],sales:[{fecha:'2026-09-20',tienda_codigo:'A',anulada:false,items:[{producto_id:'p',cantidad:4}]}],units:[],stock:[],pending:[]});
test('ventana Bogotá, no inventa histórico y avanza a 30 días',()=>{
  assert.deepEqual(api.period(new Date('2026-09-22T03:00:00Z')),range);
  assert.deepEqual(api.period(new Date('2026-11-01T15:00:00Z')),{start:'2026-10-03',end:'2026-11-01'});
});
test('suma cantidades vendidas y alerta sin inventario disponible',()=>{
  const row=api.summarize(fixture(),range)[0];
  assert.equal(row.sold,4); assert.equal(row.recent,4); assert.equal(row.status,'Sin stock');
});
test('solo celulares; ignora anulaciones, futuro, históricos ajenos y tiendas inactivas',()=>{
  const data=fixture(); data.sales.push({...data.sales[0],anulada:true},{...data.sales[0],fecha:'2026-09-22'},{...data.sales[0],fecha:'2025-09-20'},{...data.sales[0],tienda_codigo:'B'});
  data.products.push({id:'q',categoria:'ACC_CELULAR',tipo:'serializado'});
  data.sales[0].items.push({producto_id:'q',cantidad:90});
  assert.equal(api.summarize(data,range)[0].sold,4); assert.equal(api.summarize(data,range).length,1);
});
test('IMEI disponible no cuenta vendido ni duplica con stock cantidad',()=>{
  const data=fixture(); data.units=[{producto_id:'p',tienda_actual:'A',estado:'disponible'},{producto_id:'p',tienda_actual:'A',estado:'vendida'},{producto_id:'p',tienda_actual:'B',estado:'disponible'}];
  data.stock=[{producto_id:'p',tienda_codigo:'A',cantidad:99}];
  const row=api.summarize(data,range)[0]; assert.equal(row.stock,1); assert.equal(row.status,'Stock bajo');
});
test('celulares por cantidad e inactivos también se distinguen',()=>{
  const data=fixture(); data.products[0].tipo='cantidad'; data.stock=[{producto_id:'p',tienda_codigo:'A',cantidad:5}];
  assert.equal(api.summarize(data,range)[0].status,'Con stock');
  data.products[0].activo=false; assert.equal(api.summarize(data,range)[0].status,'Referencia inactiva');
});
test('pedido/remisión misma referencia no suma recepción ni compra duplicada',()=>{
  const data=fixture(); data.pending=[{store:'A',product:'p'},{store:'A',product:'p'}];
  const row=api.summarize(data,range)[0]; assert.equal(row.status,'Reposición en gestión'); assert.equal(row.stock,0);
});
test('sin ventas no inventa recomendación, escapa nombres y muestra metodología',()=>{
  assert.match(api.html({range,central:false,rows:[]}),/No hay ventas/);
  const data=fixture(); data.products[0].nombre='<img onerror=alert(1)>';
  const html=api.html({range,central:true,rows:api.summarize(data,range)});
  assert.ok(!html.includes('<img')); assert.match(html,/&lt;img/); assert.match(html,/menos de 7 días/);
});
test('paginación no trunca mil filas y error de fuente no significa cero',async()=>{
  let calls=0; const sb={from:()=>({select(){return this;},order(){return this;},async range(){calls++;return{data:calls<=2?Array(500).fill({}):[],error:null};}})};
  assert.equal((await api.all(sb,'t','id')).length,1000); assert.equal(calls,3);
  sb.from=()=>({select(){return this;},order(){return this;},range:async()=>({error:new Error('red')})});
  await assert.rejects(api.all(sb,'t','id'),/red/);
});
test('perfil no activo/sin tienda no consulta; tienda no consulta OC privadas',async()=>{
  await assert.rejects(api.load({}, {activo:false,rol:'gerencia'}),/autorizado/);
  await assert.rejects(api.load({}, {activo:true,rol:'admin_tienda'}),/asignada/);
  const queries=[];
  const sb={from(table){const query={table,filters:[],select(columns){this.columns=columns;return this;},eq(...args){this.filters.push(args);return this;},gte(){return this;},lte(){return this;},in(){return this;},order(){return this;},range:async()=>({data:[]})};queries.push(query);return query;}};
  await api.load(sb,{activo:true,rol:'admin_tienda',tienda_codigo:'A'},new Date('2026-09-21T15:00:00Z'));
  assert.ok(!queries.some(q=>q.table==='ordenes_compra'));
  for(const query of queries.filter(q=>q.table!=='productos')) assert.ok(query.filters.some(f=>f[1]==='A'),query.table);
  assert.ok(queries.every(q=>!/(costo|imei)/.test(q.columns)));
});
test('montado en dashboard central y dashboard de tiendas',()=>{
  for(const file of ['tablero','reportes']){
    const html=readFileSync(new URL(`../../creditek/erp/${file}.html`,import.meta.url),'utf8');
    assert.match(html,/id="alertasCelulares"/);assert.match(html,/KoraAlertasCelulares.mount/);
  }
  const central=readFileSync(new URL('../../creditek/erp/tablero.html',import.meta.url),'utf8');
  assert.ok(central.indexOf('KoraAlertasCelulares.mount')>central.indexOf("cont.appendChild(document.getElementById('tplTablero')"));
});
