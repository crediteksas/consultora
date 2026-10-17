import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const source=app.slice(app.indexOf('  function renderKrediyaOperations('),app.indexOf('  async function reviewReversal('));
const identities=app.slice(app.indexOf('  function executiveIdentity('),app.indexOf('  function renderStandardOperations('));
assert.match(identities,/function operationIdentity/);
function render(delta,overrides={},contextOverrides={},incidents=[],filterValue=''){
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',classList:{add(){},remove(){}}});return nodes.get(id);};
  const row={id:'one',referencia:'Samsung A17',establishment_name:'Tienda',origen_codigo:'T',reconocida:true,inicial:0,cliente_nombre:'Cliente de prueba',cliente_documento:'12345',imei:'TEST-IMEI',external_id:'CREDITO-1',...overrides};
  const ctx={operation_id:'one',pvp_guardado:850000,pvp_recibido:825000,pagamos_guardado:637000,diferencia_pvp:delta,...contextOverrides};
  const before=JSON.stringify([row,ctx]);
  vm.runInNewContext(identities+'\n'+source+';renderKrediyaOperations(rows,contexts,incidents,null)',{rows:[row],contexts:[ctx],incidents,selected:{},$:node,document:{querySelector:()=>node('root'),querySelectorAll:()=>[]},Review:{filterOperations:r=>r},money:v=>String(v),esc:String});
  if(filterValue)node('operationPriceFilter').onchange({target:{value:filterValue}});
  assert.equal(JSON.stringify([row,ctx]),before);
  return node('detailBody').innerHTML;
}
test('diferencia negativa y positiva visibles sin cambiar valores ni bloquear',()=>{
  for(const [delta,tone,word] of [[-25000,'lower','menor'],[100000,'higher','mayor']]){
    const html=render(delta);
    assert.match(html,new RegExp(`data-pvp-difference="${tone}"`));
    assert.match(html,new RegExp(`Revisar diferencia PVP: ${delta}`));
    assert.match(html,new RegExp(`PVP de Krediya ${word}`));
    assert.match(html,/no bloquea\. Se respeta PAGAMOS/);
    assert.match(html,/637000/);
    assert.match(html,/Comprador del celular: Cliente de prueba/);
    assert.match(html,/Cédula del comprador: 12345/);
    assert.match(html,/IMEI: TEST-IMEI/);
    assert.match(html,/Identificador del crédito: CREDITO-1/);
  }
});
test('cero, dato ausente o inválido y operación excluida no crean falsa alerta',()=>{
  for(const delta of [0,null,undefined,'no-numero',Infinity,-Infinity,NaN]){
    const html=render(delta);
    assert.doesNotMatch(html,/class="pvp-difference-notice"/);
    assert.doesNotMatch(html,/Diferencia PVP:|Infinity|NaN|no-numero/);
  }
  assert.doesNotMatch(render(-25000,{reconocida:false}),/class="pvp-difference-notice"/);
});
test('el filtro de diferencias excluye deltas inválidos y conserva ambos signos válidos',()=>{
  for(const delta of [0,null,undefined,'no-numero',Infinity,-Infinity,NaN]){
    const html=render(delta,{}, {},[],'difference');
    assert.doesNotMatch(html,/<article/);
    assert.match(html,/Sin operaciones/);
  }
  for(const delta of [-25000,100000])assert.match(render(delta,{}, {},[],'difference'),/<article/);
});
test('PVP o PAGAMOS faltante resalta la tarjeta en rosado sin inventar importes',()=>{
  for(const values of [{pvp_guardado:null},{pagamos_guardado:null}]){
    const html=render(null,{},values);
    assert.match(html,/data-krediya-attention="true"/);
    assert.match(html,/class="krediya-attention-notice" role="status"/);
    assert.match(html,/Faltan datos para liquidar/);
    assert.match(html,/Falta completar PVP o PAGAMOS/);
  }
  assert.doesNotMatch(render(null,{},{}),/class="krediya-attention-notice"/);
  assert.doesNotMatch(render(null,{reconocida:false},{pvp_guardado:null}),/class="krediya-attention-notice"/);
});
test('un error bloqueante se destaca sin ocultar una diferencia de PVP',()=>{
  const html=render(-25000,{}, {},[{operation_id:'one',tipo:'krediya_formula_inconsistente',bloquea_aprobacion:true,descripcion:'Revisar fórmula'}]);
  assert.match(html,/Error por revisar/);
  assert.match(html,/Revisar fórmula/);
  assert.match(html,/Revisar diferencia PVP/);
  assert.match(html,/data-krediya-attention="true"/);
});
