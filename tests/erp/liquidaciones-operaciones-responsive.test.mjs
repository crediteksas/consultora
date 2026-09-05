import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const css=fs.readFileSync('creditek/erp/liquidaciones-layout.css','utf8');
function render(row, issues=[], capability='revisor') {
  const nodes={detailHead:{innerHTML:''},detailBody:{innerHTML:''}};
  const buttons=[], calls=[];
  const context={ $:id=>nodes[id], money:v=>`$ ${Number(v).toLocaleString('es-CO')}`, esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'), state:v=>`<span class="badge">${v}</span>`, operator:{capacidad:capability}, selected:{estado:'programada',frozen_at:null}, loadTab:(...args)=>calls.push(args), savePagamos:()=>{}, document:{querySelector:()=>({classList:{add(){}}}),querySelectorAll:selector=>selector==='[data-manage-issue]'?buttons:[]} };
  buttons.push({dataset:{manageIssue:row.id}});
  vm.runInNewContext(app.slice(app.indexOf('  function renderStandardOperations('),app.indexOf('  function renderKrediyaOperations(')),context);
  context.renderStandardOperations([row],issues);
  return {html:nodes.detailBody.innerHTML,head:nodes.detailHead.innerHTML,buttons,calls};
}
const row={id:'op',establishment_name:'CREDITEK COROZAL 01',tipo_establecimiento:'propia',referencia:'Equipo de prueba',imei:'350901801498184',reconocida:true,operation_at:'2026-09-01',monto_credito:773500,inicial:100000,valor_comercial:873500,pagamos:587860,pago_neto_beneficiario:487860,bonos_aplicados:0,utilidad_creditek:185640,porcentaje_politica:0.76};
test('PayJoy y ALO muestran una tarjeta, sin las once columnas que parten palabras',()=>{
  for(const plataforma of ['payjoy','alo']){
    const result=render({...row,plataforma});
    assert.equal(result.head,''); assert.match(result.html,/<article/); assert.doesNotMatch(result.html,/<th[ >]/);
    for(const value of ['773.500','100.000','873.500','587.860','487.860','185.640','76 %']) assert.ok(result.html.includes(value));
    assert.match(result.html,/Equipo de prueba/); assert.match(result.html,/350901801498184/);
  }
});
test('el aviso de inventario es independiente y conserva el acceso a la novedad',()=>{
  const result=render(row,[{operation_id:'op',tipo:'imei_no_resuelto',descripcion:'IMEI no encontrado'}]);
  assert.match(result.html,/Equipo pendiente de registro en inventario/); assert.match(result.html,/no bloquea el pago/); assert.match(result.html,/Revisar inventario/);
  assert.match(result.html,/<aside/); result.buttons[0].onclick(); assert.deepEqual(result.calls,[['incidents','op']]);
});
test('una novedad mixta o diferencia no se anuncia como no bloqueante',()=>{
  for(const actual of [row,{...row,diferencia_inicial:20}]){
    const issues=[{operation_id:'op',tipo:'imei_no_resuelto'},{operation_id:'op',tipo:'otra',descripcion:'Revisar dato'}];
    assert.doesNotMatch(render(actual,issues).html,/no bloquea el pago/);
  }
});
test('cero se conserva y un dato ausente no se inventa',()=>{
  const result=render({...row,bonos_aplicados:0,utilidad_creditek:null});
  assert.match(result.html,/Bonos<\/dt><dd><strong[^>]*>\$ 0/); assert.match(result.html,/Utilidad<\/dt><dd><span[^>]*>No informado/);
});
test('solo conserva la edición histórica de Pagamos para aprobador',()=>{
  assert.doesNotMatch(render(row).html,/data-save-pagamos/);
  assert.match(render({...row,operation_at:'2026-08-01'},[],'aprobador').html,/data-save-pagamos/);
  assert.doesNotMatch(render({...row,establishment_name:'<img src=x>'}).html,/<img/);
});
test('reflow usa ancho de contenido y protege importes, títulos y controles',()=>{
  assert.match(css,/container:liquidaciones \/ inline-size/); assert.match(css,/@container liquidaciones/);
  assert.match(css,/auto-fit,minmax\(min\(100%,160px\),1fr\)/);
  assert.match(css,/\.operation-amount\{white-space:nowrap!important/);
  assert.match(css,/min-height:44px/); assert.match(css,/\.kora-topbar__context\{flex:1 0 160px/);
});
