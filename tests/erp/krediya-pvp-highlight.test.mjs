import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const source=app.slice(app.indexOf('  function renderKrediyaOperations('),app.indexOf('  async function reviewReversal('));
function render(delta,overrides={}){
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',classList:{add(){},remove(){}}});return nodes.get(id);};
  const row={id:'one',referencia:'Samsung A17',establishment_name:'Tienda',origen_codigo:'T',reconocida:true,inicial:0,...overrides};
  const ctx={operation_id:'one',pvp_guardado:850000,pvp_recibido:825000,pagamos_guardado:637000,diferencia_pvp:delta};
  const before=JSON.stringify([row,ctx]);
  vm.runInNewContext(source+';renderKrediyaOperations(rows,contexts,[],null)',{rows:[row],contexts:[ctx],selected:{},$:node,document:{querySelector:()=>node('root'),querySelectorAll:()=>[]},Review:{filterOperations:r=>r},money:v=>String(v),esc:String,executiveIdentity:()=>''});
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
  }
});
test('cero, dato ausente o inválido y operación excluida no crean falsa alerta',()=>{
  for(const delta of [0,null,undefined,'no-numero',Infinity])assert.doesNotMatch(render(delta),/class="pvp-difference-notice"/);
  assert.doesNotMatch(render(-25000,{reconocida:false}),/class="pvp-difference-notice"/);
});
