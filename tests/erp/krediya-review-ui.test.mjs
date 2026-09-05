import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const UI=require('../../creditek/erp/krediya-review-ui.js');
const Tariff=require('../../creditek/erp/krediya-tarifario.js');
globalThis.CreditekKrediyaReview=UI;
const ops=Array.from({length:29},(_,i)=>({id:`op-${i}`,reconocida:true,tipo_establecimiento:i<7?'propia':'aliado',origen_codigo:`store-${i%13}`,establishment_name:`Tienda ${i%13}`,referencia:`Referencia ${i}`,imei:`0000000000000${i}`,inicial:20,operation_at:'2026-08-30'}));
const contexts=ops.map(o=>({operation_id:o.id,pvp_guardado:100,pvp_recibido:98,pagamos_guardado:75}));

test('una lectura tardía de operaciones no reemplaza la pestaña más reciente',async()=>{
  const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
  const source=app.slice(app.indexOf('  async function loadOperations('),app.indexOf('  function renderStandardOperations('));
  let resolveRead,current=true,queries=0;
  const read=new Promise(resolve=>{resolveRead=resolve;});
  const query={select(){return this;},eq(){return this;},order(){return this;},then:read.then.bind(read)};
  const context={selected:{id:'batch'},sb:{from(){queries++;return query;}},renderKrediyaOperations(){assert.fail('No debe dibujar una consulta obsoleta');}};
  vm.runInNewContext(source+';this.run=loadOperations;',context);
  const loading=context.run(null,()=>current);current=false;resolveRead({data:ops});await loading;
  assert.equal(queries,1);
});

test('al cambiar de pestaña se descartan también errores de consultas anteriores',async()=>{
  const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
  const source=app.slice(app.indexOf('  async function loadTab('),app.indexOf('  async function savePagamos('));
  const body={innerHTML:'',classList:{add(){}}};let rejectRead;
  const pending=new Promise((_,reject)=>{rejectRead=reject;});
  const context={activeTab:'operations',activeTabRequest:null,document:{querySelector:()=>({classList:{remove(){},toggle(){}}}),querySelectorAll:()=>[]},$:()=>body,esc:String,loadOperations:()=>pending,loadPayments:async()=>{body.innerHTML='PAGOS ACTUALES';}};
  vm.runInNewContext(source+';this.run=loadTab;',context);
  const first=context.run('operations');await context.run('payments');rejectRead(new Error('Error tardío'));await first;
  assert.equal(body.innerHTML,'PAGOS ACTUALES');
});

test('vista previa cruza por operación, excluye anuladas y no inventa utilidad ni plazo',()=>{
  const source=structuredClone(ops);
  const rows=UI.previewDifferences([...ops,{...ops[0],id:'excluded',reconocida:false}],contexts.reverse());
  assert.equal(rows.length,29);assert.equal(rows[0].contexto.impacto_bruto,-2);
  assert.equal(rows[0].contexto.pagamos,75);assert.equal(Tariff.giro(rows[0].contexto),55);
  for(const r of rows){assert.equal(r.preliminar,true);assert.equal(r.contexto.utilidad_neta,undefined);assert.equal(r.contexto.bonos,undefined);assert.equal(r.vence_el,undefined);}
  assert.deepEqual(ops,source);
});
test('precios iguales no requieren confirmación y ausentes nunca se vuelven cero',()=>{
  assert.equal(UI.previewDifferences([ops[0]],[{operation_id:ops[0].id,pvp_guardado:98,pvp_recibido:98}]).length,0);
  const r=UI.previewDifferences([ops[0]],[])[0];
  assert.equal(r.contexto.impacto_bruto,null);assert.equal(r.contexto.pagamos,null);
  assert.equal(Tariff.diferenciasRows([r])[1][11],null);
  assert.equal(Tariff.diferenciasRows([r])[1][14],'Preliminar · sin liquidar');
});
test('titulares pendientes agrupan comercios, excluyen Retail y respetan beneficiarios activos',()=>{
  const groups=UI.missingBeneficiaries(ops,[]);assert.equal(groups.length,13);assert.equal(groups.reduce((n,g)=>n+g.count,0),22);
  const valid=[{tipo:'aliado',origen_codigo:'store-1',activo:true}];
  assert.equal(UI.missingBeneficiaries(ops,valid).length,12);
  for(const b of [{...valid[0],activo:false},{...valid[0],tipo:'ejecutivo'}])assert.equal(UI.missingBeneficiaries(ops,[b]).length,13);
});
test('búsqueda y tienda se combinan y toleran tildes sin modificar registros',()=>{
  const rows=[{...ops[0],referencia:'Móvil Infinix',origen_codigo:'A'},{...ops[1],referencia:'Móvil Infinix',origen_codigo:'B'}];
  assert.equal(UI.filterOperations(rows,{search:'movil',store:'A'}).length,1);
  assert.equal(UI.filterOperations(rows,{search:ops[0].imei}).length,1);
  assert.equal(UI.filterOperations(rows,{search:'inexistente'}).length,0);
  assert.equal(rows.length,2);
});

function fixture({operations=ops,ctx=contexts,persisted=[],error=null}={}) {
  const calls=[],nodes=new Map();let html='';
  const container={set innerHTML(v){html=v;nodes.clear();},get innerHTML(){return html;},textContent:'',scrollIntoView(){},querySelector(s){if(!nodes.has(s))nodes.set(s,{focus(){},setSelectionRange(){}});return nodes.get(s);},querySelectorAll(){return []}};
  const sb={from(table){calls.push(table);return {select(){return this},eq(){return this},order(){return this},range(start,end){return Promise.resolve({data:(table==='krediya_diferencias'?persisted:operations).slice(start,end+1),error})}};},async rpc(name){calls.push(name);return {data:ctx,error};}};
  return {container,calls,service:Tariff.create({sb,money:v=>`COP ${v}`})};
}
test('informe antes de liquidar muestra datos y paginación, no pantalla vacía ni cero definitivo',async()=>{
  const f=fixture();await f.service.report(f.container,{id:'batch',estado:'con_novedades',fecha_corte:'2026-08-30'});
  assert.match(f.container.innerHTML,/Gestión y Gerencia/);assert.match(f.container.innerHTML,/29 diferencias de PVP/);
  assert.match(f.container.innerHTML,/Vista previa/);assert.match(f.container.innerHTML,/COP -2/);
  assert.equal((f.container.innerHTML.match(/class="difference-card"/g)||[]).length,8);
  f.container.querySelector('[data-next]').onclick();assert.match(f.container.innerHTML,/Página 2 de 4/);
  f.container.querySelector('[data-search]').oninput({target:{value:'Referencia 28'}});
  assert.match(f.container.innerHTML,/1 resultados/);assert.match(f.container.innerHTML,/Página 1 de 1/);
  assert.doesNotMatch(f.container.innerHTML,/data-followup=/);
});
test('informe definitivo usa snapshot aun cuando el tarifario actual haya cambiado',async()=>{
  const f=fixture({persisted:[{operation_id:'op-1',estado:'pendiente',contexto:{referencia:'Guardada',pagamos:42,impacto_neto:-4}}]});
  await f.service.report(f.container,{id:'batch',estado:'aprobada',frozen_at:'yes',fecha_corte:'2026-08-30'});
  assert.deepEqual(f.calls,['krediya_diferencias']);assert.match(f.container.innerHTML,/COP 42/);assert.match(f.container.innerHTML,/COP -4/);assert.doesNotMatch(f.container.innerHTML,/Vista previa/);
});
test('no ofrece exportar datos incompletos ni encubre errores como ausencia de diferencias',async()=>{
  for(const options of [{ctx:[]},{error:{message:'Sin permiso'}}]){
    const f=fixture(options);await f.service.report(f.container,{id:'batch',estado:'con_novedades'});
    assert.match(f.container.textContent,/No se pudo cargar/);assert.doesNotMatch(f.container.innerHTML,/data-export/);
  }
});
test('abrir una operación filtra el informe pero permite recuperar todo el lote',async()=>{
  const f=fixture();await f.service.report(f.container,{id:'batch',estado:'con_novedades'},'op-18');
  assert.match(f.container.innerHTML,/1 resultados/);assert.match(f.container.innerHTML,/Referencia 18/);
  f.container.querySelector('[data-all]').onclick();assert.match(f.container.innerHTML,/29 resultados/);
});
test('integración versionada elimina prompt de novedad y conserva aprobación explícita',()=>{
  const page=fs.readFileSync('creditek/erp/aliados-liquidaciones.html','utf8'),app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
  assert.match(page,/krediya-review-ui\.js\?v=1\.0\.0/);assert.match(page,/Gestión y Gerencia/);
  assert.doesNotMatch(app,/prompt\('Describe la novedad/);assert.match(app,/Liquidar y enviar a aprobación/);
  assert.match(app,/Aprobar y pasar a pagos/);assert.match(app,/if \(confirm\(message\)\) stateRpc\('aprobada'\)/);
  assert.match(app,/selected\?\.plataforma==='krediya' && next==='aprobada'/);
  assert.match(app,/slice\(page\*8,\(page\+1\)\*8\)/);
});
