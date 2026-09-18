import test from 'node:test';
import assert from 'node:assert/strict';
import UI from '../../creditek/erp/b2b-whatsapp-ui.js';

const row=(n,extra={})=>({row:n,reference:`Equipo ${n}`,original:`Equipo ${n} $200.000`,producto_id:`p${n}`,proveedor_id:'s',costo:200000,precio_tienda:220000,included:true,...extra});
test('Revisión separa productos excluidos de encabezados explícitos y conserva todos los datos',()=>{
 const rows=[row(1),row(2,{producto_id:''}),row(3,{included:false,exclusion:'Agotado'}),row(4,{included:false,exclusion:'Encabezado de marca'})],before=JSON.stringify(rows);
 assert.deepEqual(UI.classify(rows).map(x=>x.state),['ready','pending','excluded','headers']);
 assert.deepEqual(UI.selectRows(rows,'all').map(x=>x.i),[0,1,2]);assert.equal(UI.selectRows(rows,'excluded').length,1);assert.equal(UI.selectRows(rows,'headers').length,1);assert.equal(JSON.stringify(rows),before);
 assert.equal(UI.isAuxiliary(row(5,{included:false,exclusion:'Precio no confirmado'})),false);
});
test('Duplicados requieren revisión, búsqueda encuentra nombre canónico y código sin cambiar precios',()=>{
 const rows=[row(1),row(2,{producto_id:'p1'}),row(3,{reference:'Modelo Ázul'})];
 assert.deepEqual(UI.classify(rows).map(x=>x.state),['pending','pending','ready']);
 assert.equal(UI.selectRows(rows,'all','azul').length,1);assert.equal(UI.selectRows(rows,'all','X-3',[{id:'p3',codigo:'X-3',nombre:'Nombre canónico'}]).length,1);assert.equal(UI.PAGE_SIZE,20);
});

function harness(saved){
 const elements=new Map(),sequence=[],writes=[],reads=[],buttons=[];let confirmations=0,allowDiscard=true,savedCallbacks=0;
 function element(key){if(elements.has(key))return elements.get(key);const el={value:'',checked:false,disabled:false,hidden:false,open:false,textContent:'',innerHTML:'',dataset:{},attrs:new Map(),classList:{add(){},remove(){}},setAttribute(k,v){this.attrs.set(k,v);},removeAttribute(k){this.attrs.delete(k);},hasAttribute(k){return this.attrs.has(k);},addEventListener(){},querySelector(k){return element(key+' '+k);},scrollIntoView(){sequence.push('scroll');},focus(){assert.equal(this.disabled,false,'Focus happens after controls are enabled');sequence.push('focus');}};elements.set(key,el);return el;}
 for(const mode of ['pending','all','ready','excluded','headers']){const b=element('button-'+mode);b.dataset.mode=mode;buttons.push(b);}
 const container={innerHTML:'',setAttribute(){},removeAttribute(){},querySelector:element,querySelectorAll(selector){if(selector==='[data-mode]')return buttons;if(selector==='[data-mode],[data-search],[data-history],[data-update],[data-export]')return [...buttons,...['search','history','update','export'].map(x=>element(`[data-${x}]`))];if(selector==='[data-rows] input,[data-confirm]')return [element('[data-confirm]')];return [];},dispatchEvent(e){sequence.push(e.type);}};
 const sb={from(table){reads.push(table);return {select(){return this;},eq(){return this;},order(){return this;},single:async()=>({data:saved,error:null}),range:async()=>({data:[],error:null})};},async rpc(name,args){writes.push({name,args});return {data:'new-draft',error:null};}};
 const oldConfirm=globalThis.confirm,oldEvent=globalThis.CustomEvent;globalThis.confirm=()=>{confirmations++;return allowDiscard;};globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
 UI.mount({container,sb,products:Array.from({length:40},(_,i)=>({id:`p${i+1}`,codigo:`P${i+1}`,nombre:`Equipo ${i+1}`})),providers:[{id:'s',nombre:'Proveedor'}],onSaved:()=>savedCallbacks++});
 return {container,el:element,sequence,writes,reads,buttons,setDiscard:value=>allowDiscard=value,get confirmations(){return confirmations;},get savedCallbacks(){return savedCallbacks;},cleanup(){globalThis.confirm=oldConfirm;globalThis.CustomEvent=oldEvent;}};
}
test('Abrir borrador es solo lectura, muestra 20 filas plegadas y devuelve Promise antes de navegar',async()=>{
 const h=harness({id:'d',proveedor_id:'s',texto_original:'original',filas:Array.from({length:35},(_,i)=>row(i+1)),lista_id:null});try{
  assert.equal(await h.container.openDraft('d','all'),true);assert.equal(h.writes.length,0);assert.equal(h.confirmations,0);assert.equal(h.container.hasUnsavedChanges(),false);
  assert.equal((h.el('[data-rows]').innerHTML.match(/class="wa-row"/g)||[]).length,20);assert.doesNotMatch(h.el('[data-rows]').innerHTML,/data-row="\d+" open/);assert.equal(h.el('[data-page]').textContent,'1–20 de 35');
  assert.ok(h.sequence.indexOf('b2b:draft-open')<h.sequence.indexOf('scroll'));assert.equal(h.el('[data-source]').open,false);
  assert.ok(h.container.innerHTML.indexOf('data-edit-actions')<h.container.innerHTML.indexOf('class="wa-review-toolbar"'));assert.equal((h.container.innerHTML.match(/data-save>/g)||[]).length,1);assert.equal(h.sequence.at(-1),'focus');
  await h.container.openDraft('d','p27');assert.match(h.el('[data-rows]').innerHTML,/data-row="26" open/);assert.equal(h.el('[data-page]').textContent,'21–35 de 35');assert.equal(h.writes.length,0);
 }finally{h.cleanup();}
});
test('Solo los cambios reales requieren confirmación y cancelar conserva la edición',async()=>{
 const h=harness({id:'d',proveedor_id:'s',texto_original:'original',filas:[row(1)],lista_id:null});try{
  await h.container.openDraft('d');h.el('[data-text]').value='texto cambiado';h.el('[data-text]').oninput();assert.equal(h.container.hasUnsavedChanges(),true);
  h.setDiscard(false);assert.equal(await h.container.newList(),false);assert.equal(h.el('[data-text]').value,'texto cambiado');assert.equal(h.container.hasUnsavedChanges(),true);assert.equal(h.writes.length,0);
  h.setDiscard(true);assert.equal(await h.container.newList(),true);assert.equal(h.el('[data-text]').value,'');assert.equal(h.container.hasUnsavedChanges(),false);assert.equal(h.el('[data-source]').open,true);
 }finally{h.cleanup();}
});
test('Lista publicada se consulta bloqueada; preparar actualización no guarda ni republica',async()=>{
 const h=harness({id:'d',proveedor_id:'s',texto_original:'original',filas:[row(1)],lista_id:'live'});try{
  await h.container.openDraft('d','all');assert.equal(h.el('[data-published]').hidden,false);assert.equal(h.el('[data-edit-actions]').hidden,true);assert.equal(h.el('[data-save]').disabled,true);assert.equal(h.el('[data-publish]').disabled,true);assert.equal(h.writes.length,0);
  h.el('[data-update]').onclick();assert.equal(h.el('[data-save]').disabled,false);assert.equal(h.container.hasUnsavedChanges(),true);assert.equal(h.writes.length,0);
  await h.el('[data-save]').onclick();assert.equal(h.writes.length,1);assert.equal(h.writes[0].name,'guardar_borrador_catalogo_b2b');assert.equal(h.savedCallbacks,1);assert.equal(h.container.hasUnsavedChanges(),false);
 }finally{h.cleanup();}
});
test('Datos incompletos no se convierten en una lista vacía y no provocan guardados',async()=>{
 const h=harness({id:'d',proveedor_id:'s',texto_original:'original',filas:[null],lista_id:null});try{
  assert.equal(await h.container.openDraft('d'),false);assert.match(h.el('[data-status]').textContent,/no contiene filas válidas/);assert.equal(h.writes.length,0);assert.equal(h.container.hasUnsavedChanges(),false);
 }finally{h.cleanup();}
});
