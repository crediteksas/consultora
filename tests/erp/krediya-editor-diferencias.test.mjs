import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20260904231510_krediya_editor_diferencias.sql','utf8');
const seed=fs.readFileSync('supabase/migrations/20260904232850_krediya_tarifario_fuente_excel.sql','utf8');
function editor(data) {
 const nodes=new Map(),calls=[];
 const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',classList:{add(){},remove(){}},focus(){}});return nodes.get(id);};
 const context={$ ,sb:{rpc:async(name,args)=>{calls.push({name,args});return name==='aliados_contexto_precio_krediya'?{data}:{error:null};}},esc:String,money:v=>String(v),selected:{id:'batch'},loadBatches:async()=>{},openDetail:async()=>{},loadTab:async()=>{}};
 const fn=app.slice(app.indexOf('  async function openPriceEditor('),app.indexOf('  async function stateRpc('));
 vm.runInNewContext(fn+';this.open=openPriceEditor;',context);
 return {context,$,calls};
}
const base={referencia:'Equipo 128GB',pvp_guardado:100,pvp_recibido:98,pagamos_guardado:75,pagamos_recibido:null,bonos:20};
test('aceptar PVP 98 conserva Pagamos 75 y muestra caída de utilidad bruta de 2',async()=>{
 const e=editor(base);await e.context.open('credit');
 assert.match(e.$('priceEditorContent').innerHTML,/Guardado en KORA/);
 assert.match(e.$('priceEditorContent').innerHTML,/No viene en el archivo/);
 e.$('priceDecision').value='aceptar_krediya';e.$('priceDecision').onchange();
 assert.equal(e.$('decisionPvp').value,98);assert.equal(e.$('decisionPagamos').value,75);
 assert.match(e.$('priceImpact').textContent,/Cambio bruto frente al precio guardado: -2/);
 assert.equal(e.$('savePriceDecision').disabled,true);
 e.$('priceReason').value='Diferencia confirmada';e.$('priceReason').oninput();
 await e.$('priceDecisionForm').onsubmit({preventDefault(){}});
 assert.equal(e.calls[1].args.p_precio_venta,98);assert.equal(e.calls[1].args.p_pagamos,75);
});
test('conservar guardado no adopta el dato diferente de Krediya',async()=>{
 const e=editor(base);await e.context.open('credit');e.$('priceDecision').value='conservar_guardado';e.$('priceDecision').onchange();
 assert.equal(e.$('decisionPvp').value,100);assert.equal(e.$('decisionPagamos').disabled,true);
});
test('precio ausente no se muestra como cero ni permite guardar vacío',async()=>{
 const e=editor({...base,pvp_guardado:null,pagamos_guardado:null});await e.context.open('credit');
 assert.match(e.$('priceEditorContent').innerHTML,/No registrado/);
 e.$('priceDecision').value='editar_operacion';e.$('priceDecision').onchange();
 assert.equal(e.$('savePriceDecision').disabled,true);
});
test('SQL conserva fuente, limita cambios a operación y bloquea liquidaciones aprobadas',()=>{
 assert.match(sql,/krediya_fuente/);assert.match(sql,/decision_precio/);
 assert.match(sql,/l\.frozen_at is not null or l\.estado in/);
 const resolver=sql.slice(sql.indexOf('create or replace function public.aliados_resolver_precio_krediya'),sql.indexOf('create or replace function public.aliados_sincronizar'));
 assert.doesNotMatch(resolver,/update public\.krediya_price_rules|insert into public\.payment_orders/);
 assert.match(sql,/r\.precio_venta=\(c->>'pvp_recibido'\)::numeric/);
 assert.match(sql,/from public,anon/);
});
test('52 filas trazables del Excel, sin fusionar capacidades o precios distintos',()=>{
 assert.equal((seed.match(/^\(\d+,/gm)||[]).length,52);
 assert.match(seed,/SAMSUNG A17 128GB 4 RAM','SM-A175',704000,528000/);
 assert.match(seed,/SAMSUNG GALAXY A17 128GB 4RAM','SM-A175',752000,564000/);
 assert.match(seed,/'pvp_celda','L'\|\|x\.fila/);assert.match(seed,/'pagamos_celda','N'\|\|x\.fila/);
 assert.match(sql,/'ref:'\|\|regexp_replace\(lower\(coalesce\(o\.referencia/);
});
