import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const base='creditek/erp/';
const context={window:{},URLSearchParams,Date};
vm.runInNewContext(readFileSync(base+'documentos-gestion-domain.js','utf8'),context);
vm.runInNewContext(readFileSync(base+'kora-access-control.js','utf8'),context);
const D=context.window.KoraDocuments, access=context.window.KoraAccessControl;
const oscar={id:'6de0ad26-64af-4966-8cd9-d468880af627',rol:'gerencia',activo:true};
const maite={id:'d1782db6-bacc-4caf-af6f-ce1b8d1c0391',rol:'auditoria',activo:true};
const id='fe8e47a4-0df3-4aef-8bd2-0e9c4ce51e74';
function client(results=[{data:[],count:0}]){
  const calls=[];
  return {calls,from(table){calls.push(['from',table]);const result=results.shift();const query={then(ok,bad){return Promise.resolve(result).then(ok,bad);}};
    for(const method of ['select','eq','in','or','gte','lte','lt','order','limit','range'])query[method]=(...args)=>{calls.push([method,...args]);return query;};return query;
  }};
}
const options={type:'traslados',query:'',page:0};

test('la consulta niega acceso antes de leer cualquier tabla a otros usuarios, tiendas e inactivos',async()=>{
  for(const profile of [null,{...oscar,activo:false},{...oscar,rol:'admin_tienda'},{...oscar,id:'other'},{rol:'gerencia',activo:true}]){
    const sb=client();await assert.rejects(D.findDocuments(sb,access,profile,options),/reservado/);assert.equal(sb.calls.length,0);
  }
  for(const profile of [oscar,maite])await D.findDocuments(client(),access,profile,options);
});
test('búsqueda tipada no interpreta filtros SQL, IMEI parcial o texto como un documento',()=>{
  assert.equal(D.searchValue('traslados',' #11 ').kind,'consecutivo');
  assert.equal(D.searchValue('ventas','357113744396318').kind,'imei');
  assert.equal(D.searchValue('gastos',id).kind,'id');
  assert.equal(D.searchValue('gastos','').kind,'all');
  for(const [key,value] of [['traslados','11,estado.eq.cerrado'],['remisiones','357113744396318'],['gastos','11'],['unknown','']])assert.throws(()=>D.searchValue(key,value));
});
test('consulta sin fecha incluye historial completo y pagina estable 20 filas',async()=>{
  const sb=client([{data:[{id}],count:45}]);const result=await D.findDocuments(sb,access,maite,{...options,page:1});
  assert.equal(result.count,45);assert.equal(result.rows[0].id,id);
  assert.ok(sb.calls.some(x=>x[0]==='range'&&x[1]===20&&x[2]===39));
  assert.equal(sb.calls.filter(x=>['gte','lte','lt'].includes(x[0])).length,0);
  assert.equal(sb.calls.filter(x=>x[0]==='order').length,2);
});
test('los filtros por fechas usan corte Colombia y ambos lados de traslado',async()=>{
  const sb=client();await D.findDocuments(sb,access,oscar,{...options,from:'2026-09-01',to:'2026-09-30',store:'CK-03'});
  assert.ok(sb.calls.some(x=>x[0]==='gte'&&x[2]==='2026-09-01T00:00:00-05:00'));
  assert.ok(sb.calls.some(x=>x[0]==='lt'&&x[2]==='2026-10-01T00:00:00-05:00'));
  assert.ok(sb.calls.some(x=>x[0]==='or'&&x[1]==='tienda_origen.eq.CK-03,tienda_destino.eq.CK-03'));
  const dates=client();await D.findDocuments(dates,access,oscar,{type:'ventas',from:'2026-09-01',to:'2026-09-19'});
  assert.ok(dates.calls.some(x=>x[0]==='lte'&&x[2]==='2026-09-19'));
});
test('fechas inválidas, rangos invertidos, tienda manipulada y páginas inválidas no consultan',async()=>{
  for(const invalid of [{from:'2026-02-30'},{from:'2026-09-19',to:'2026-09-01'},{page:-1},{page:1.5},{store:'CK-03,estado.eq.cerrado'}]){
    const sb=client();await assert.rejects(D.findDocuments(sb,access,oscar,{...options,...invalid}));assert.equal(sb.calls.length,0);
  }
});
test('IMEI resuelve unidad e historial de documentos sin depender del listado o mes visible',async()=>{
  for(const key of ['traslados','ventas']){
    const field=key==='traslados'?'traslado_id':'venta_id';
    const sb=client([{data:[{id:'unit'}]},{data:[{[field]:id},{[field]:id}],count:2},{data:[{id}],count:1}]);
    const result=await D.findDocuments(sb,access,maite,{type:key,query:'357113744396318'});
    assert.equal(result.rows.length,1);assert.equal(sb.calls.filter(x=>x[0]==='from').length,3);
    assert.ok(sb.calls.some(x=>x[0]==='eq'&&x[1]==='imei'&&x[2]==='357113744396318'));
    const ids=sb.calls.find(x=>x[0]==='in');assert.equal(ids[1],'id');assert.equal(ids[2].length,1);assert.equal(ids[2][0],id);
  }
});
test('IMEI inexistente no cae al listado general, duplicado y resultados truncados son errores',async()=>{
  const empty=client([{data:[]}]);const result=await D.findDocuments(empty,access,oscar,{...options,query:'357113744396318'});assert.equal(result.count,0);assert.equal(empty.calls.filter(x=>x[0]==='from').length,1);
  await assert.rejects(D.findDocuments(client([{data:[{id:'a'},{id:'b'}]}]),access,oscar,{...options,query:'357113744396318'}),/más de una vez/);
  await assert.rejects(D.findDocuments(client([{data:[{id:'a'}]},{data:[{traslado_id:id}],count:1001}]),access,oscar,{...options,query:'357113744396318'}),/demasiados/);
});
test('errores de lectura nunca se disfrazan como cero documentos',async()=>{
  for(const results of [[{error:new Error('RLS')}],[{data:[{id:'a'}]},{error:new Error('RLS')}],[{data:[{id:'a'}]},{data:[{traslado_id:id}],count:1},{error:new Error('RLS')}]])await assert.rejects(D.findDocuments(client(results),access,oscar,{...options,query:'357113744396318'}),/RLS/);
  await assert.rejects(D.findDocuments(client([{error:new Error('offline')}]),access,oscar,options),/offline/);
});
test('muestra nombre de tiendas, estado y enlace sin acción automática ni UUID enorme',()=>{
  const result=D.documentView('traslados',{id,consecutivo:11,estado:'despachado',origen:{nombre:'Sonivox'},destino:{nombre:'Celfiao'}});
  assert.equal(result.title,'Traslado #11');assert.equal(result.store,'Sonivox → Celfiao');assert.equal(result.status,'Despachado');assert.equal(result.href,`traslados.html?documento=${id}`);
  assert.equal(D.documentView('gastos',{id,estado:'pendiente',correccion_pendiente:true}).status,'Corrección pendiente');
  assert.equal(D.documentView('ventas',{id,consecutivo:4,anulada:true}).status,'Anulada');
});
test('hub restringe acceso y la edición integrada de gastos usa RPC auditada sin DML directo',()=>{
  const app=readFileSync(base+'documentos-gestion-app.js','utf8'), html=readFileSync(base+'documentos-gestion.html','utf8');
  const domain=readFileSync(base+'documentos-gestion-domain.js','utf8');
  assert.doesNotMatch(domain,/\.(rpc|insert|update|delete|upsert)\s*\(/);
  assert.doesNotMatch(app,/\.(insert|update|delete|upsert)\s*\(/);
  assert.match(app,/data-edit-expense/);
  assert.match(app,/data-expense-form/);
  assert.match(app,/rpc\('editar_gasto_administrativo'/);
  assert.match(app,/rpc\('corregir_gasto'/);
  assert.match(app,/authorization\?\.allowed/);assert.match(app,/canManageDocuments/);assert.match(app,/KoraAccessControl.authorize/);
  assert.match(app,/current!==generation/);assert.match(app,/replaceChildren/);
  assert.match(html,/facturas de proveedor no tienen una anulación general/i);
  assert.match(html,/id="docFrom"/);assert.match(html,/id="docTo"/);
  assert.match(html,/docNotice.*role="status"/);assert.match(html,/app" hidden/);
  assert.match(html,/<body data-kora-requires-auth="true">/,'sin sesión se abre el login compartido, no una página vacía');
  new vm.Script(app);new vm.Script(domain);
});
