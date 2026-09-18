import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../../creditek/erp/b2b-listas-resumen.js';

const row=(changes={})=>({row:1,producto_id:'product',proveedor_id:'supplier',included:true,costo:200000,precio_tienda:220000,motivo:'',...changes});

test('resumen: distingue dudas reales, productos excluidos y texto auxiliar explícito',()=>{
 const result=R.summarize([
  row(),row({row:2,producto_id:''}),row({row:3,producto_id:'low',costo:482,precio_tienda:539.84,priceWarning:'Precio bajo',priceConfirmed:false}),
  row({row:4,included:false,exclusion:'Agotado'}),row({row:5,included:false,exclusion:'Encabezado de marca'}),
  row({row:6,included:false,exclusion:'Separador'}),row({row:7,included:false,exclusion:'Información de contacto'}),
  row({row:8,included:false,exclusion:'',reference:'ENCABEZADO'}),
 ]);
 assert.deepEqual(result,{available:true,total:8,included:3,validIncluded:1,pendingIncluded:2,excluded:2,headers:3,excludedWithoutReason:1});
});

test('resumen: los duplicados incluidos siguen pendientes aunque cada fila sea válida por separado',()=>{
 const result=R.summarize([row(),row({row:2}),row({row:3,producto_id:'other'})]);
 assert.equal(result.validIncluded,1);assert.equal(result.pendingIncluded,2);
 const excludedDuplicate=R.summarize([row(),row({row:2,included:false,exclusion:'Duplicada'})]);
 assert.equal(excludedDuplicate.validIncluded,1);assert.equal(excludedDuplicate.pendingIncluded,0);
});

test('resumen: no inventa ceros cuando faltan filas o no se puede validar',()=>{
 for(const missing of [null,undefined,{},[null],[{}]]){
  const result=R.summarize(missing);assert.equal(result.available,false);assert.equal(result.validIncluded,null);assert.equal(result.pendingIncluded,null);assert.equal(result.excluded,null);
 }
 assert.equal(R.summarize([row()],()=>{throw Error('Sin validación');}).available,false);
 assert.equal(R.summarize([],()=>[]).pendingIncluded,0);
});

test('resumen: elige última lista por proveedor sin mutar historial y resuelve empates de fecha',()=>{
 const drafts=[
  {id:'old',proveedor_id:'a',creado_at:'2026-09-01',lista_id:'published'},
  {id:'new-a',proveedor_id:'a',creado_at:'2026-09-18',lista_id:null},
  {id:'b',proveedor_id:'b',creado_at:'2026-09-17'},
  {id:'new-z',proveedor_id:'a',creado_at:'2026-09-18'},
 ];
 const before=structuredClone(drafts);
 assert.deepEqual(R.latestPerProvider(drafts).map(draft=>draft.id),['new-z','b']);assert.deepEqual(drafts,before);
});

function mockDb({metadata=[],details=[],metadataError,detailError}){
 const calls=[];
 return {calls,from(table){
  assert.equal(table,'b2b_catalogo_borradores');
  let columns,ids;const orders=[];
  const query={
   select(value){columns=value;return query;},order(column,options){orders.push([column,options]);return query;},in(column,value){assert.equal(column,'id');ids=value;return query;},
   async range(from,to){calls.push({columns,orders,from,to});return metadataError?{data:null,error:metadataError}:{data:metadata.slice(from,to+1),error:null};},
   then(resolve,reject){calls.push({columns,ids,orders});return Promise.resolve(detailError?{data:null,error:detailError}:{data:details.filter(draft=>ids.includes(draft.id)),error:null}).then(resolve,reject);},
  };return query;
 }};
}

test('consulta: pagina solo metadatos y recupera filas exclusivamente de la última lista por proveedor',async()=>{
 const metadata=Array.from({length:503},(_,i)=>({id:'draft-'+i,proveedor_id:i===502?'b':'a',creado_at:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),lista_id:null}));
 const sb=mockDb({metadata,details:[{id:'draft-501',filas:[row()],lista_id:'published'},{id:'draft-502',filas:[row({proveedor_id:'b'})],lista_id:null}]});
 const result=await R.loadLatest(sb);
 assert.equal(result.totalDrafts,503);assert.equal(result.drafts.length,2);
 assert.deepEqual(sb.calls.filter(call=>call.from!=null).map(call=>[call.from,call.to]),[[0,499],[500,999]]);
 assert.ok(sb.calls.filter(call=>call.from!=null).every(call=>!call.columns.includes('filas')));
 assert.deepEqual(sb.calls.find(call=>call.ids).ids,['draft-501','draft-502']);
 assert.equal(result.drafts[0].lista_id,'published');assert.equal(R.summarize(result.drafts[0].filas).validIncluded,1);
});

test('consulta: errores de metadatos se propagan y filas ausentes o fallidas permanecen desconocidas',async()=>{
 await assert.rejects(()=>R.loadLatest(mockDb({metadataError:Error('No autorizado')})),/No autorizado/);
 const metadata=[{id:'draft',proveedor_id:'a',creado_at:'2026-09-18'}];
 for(const sb of [mockDb({metadata}),mockDb({metadata,detailError:Error('Red no disponible')})]){
  const result=await R.loadLatest(sb);assert.equal(result.totalDrafts,1);assert.ok(result.drafts[0].loadError);assert.equal(R.summarize(result.drafts[0].filas).pendingIncluded,null);
 }
});

function mockContainer(){
 const elements=new Map(),attributes=new Map();
 return {innerHTML:'',contains:()=>true,setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name),
  querySelector(selector){if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',disabled:false,value:selector==='[data-summary-filter]'?'all':''});return elements.get(selector);},
 };
}

test('vista: escapa proveedores, muestra estado y abre las listas guardadas con el filtro elegido',async()=>{
 const id='draft"><img src=x onerror=alert(1)>',metadata=[{id,proveedor_id:'a',creado_at:'2026-09-18',lista_id:'published'}];
 const container=mockContainer(),opened=[],loaded=[];let newLists=0;
 const control=R.mount({container,sb:mockDb({metadata,details:[{id,filas:[row(),row({producto_id:'',row:2}),row({included:false,exclusion:'Usado',row:3})],lista_id:'published'}]}),
  providers:[{id:'a',nombre:'<img src=x onerror=alert(1)>'}],onOpenDraft:(...args)=>opened.push(args),onNewList:()=>newLists++,onLoaded:summary=>loaded.push(summary)});
 assert.equal(control.refresh(),control.ready,'No se duplican consultas mientras la lectura está en curso');
 await control.ready;
 const html=container.querySelector('[data-summary-results]').innerHTML;
 assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/<span class="badge">Publicada<\/span>/);assert.match(html,/Revisar dudas/);assert.match(html,/Ver lista/);assert.match(html,/Ver excluidos/);
 assert.match(html,/<th>Sin dudas<\/th>/);assert.match(html,/data-label="Sin dudas">1/);assert.match(container.innerHTML,/>Cargar lista<\/button>/);
 assert.equal(loaded[0].pendingIncluded,1);assert.equal(loaded[0].excluded,1);assert.equal(loaded[0].totalDrafts,1);
 for(const mode of ['pending','all','excluded'])container.querySelector('[data-summary-results]').onclick({target:{closest:()=>({dataset:{summaryOpen:id,summaryMode:mode}})}});
 assert.deepEqual(opened,[[id,'pending'],[id,'all'],[id,'excluded']]);
 container.querySelector('[data-summary-new]').onclick();assert.equal(newLists,1);
 container.querySelector('[data-summary-search]').value='Otro proveedor';container.querySelector('[data-summary-search]').oninput();
 assert.match(container.querySelector('[data-summary-results]').innerHTML,/No hay listas que coincidan/);
});

test('vista: un fallo de lectura informa el error y emite conteos desconocidos',async()=>{
 const container=mockContainer();let loaded;
 const control=R.mount({container,sb:mockDb({metadataError:Error('Sin conexión')}),providers:[],onLoaded:summary=>loaded=summary});
 await control.ready;
 assert.equal(loaded.available,false);assert.equal(loaded.totalDrafts,null);assert.equal(loaded.pendingIncluded,null);assert.equal(loaded.excluded,null);
 assert.match(container.querySelector('[data-summary-status]').textContent,/Sin conexión/);
 assert.doesNotMatch(container.querySelector('[data-summary-results]').innerHTML,/No hay listas guardadas/);
 assert.equal(container.querySelector('[data-summary-refresh]').disabled,false);
});
