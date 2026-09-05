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
test('Pagamos menos inicial determina el giro sin descontar inicial dos veces de utilidad',async()=>{
 for(const inicial of [100000,200000]){
  const e=editor({...base,pvp_guardado:1000000,pagamos_guardado:750000,bonos:20000,inicial});
  await e.context.open('credit');
  e.$('priceDecision').value='conservar_guardado';e.$('priceDecision').onchange();
  assert.match(e.$('pricePayout').textContent,new RegExp(`= ${750000-inicial}\\.`));
  assert.match(e.$('priceImpact').textContent,/bonos\): 230000/);
  assert.match(e.$('priceImpact').textContent,/Provisión 28 %: 64400/);
  assert.match(e.$('priceImpact').textContent,/neta estimada: 165600/);
 }
});
test('Redmi usa PVP 646400 y Pagamos 484800; no adopta Precio Sug 701500',async()=>{
 const e=editor({...base,pvp_guardado:646400,pagamos_guardado:484800,pvp_recibido:701500,bonos:20000,inicial:140300});
 await e.context.open('credit');
 assert.match(e.$('priceEditorContent').innerHTML,/No se usa Precio sugerido/);
 e.$('priceDecision').value='conservar_guardado';e.$('priceDecision').onchange();
 assert.equal(e.$('decisionPvp').value,646400);
 assert.equal(e.$('decisionPagamos').value,484800);
 assert.match(e.$('pricePayout').textContent,/= 344500/);
 assert.match(e.$('priceImpact').textContent,/bonos\): 141600/);
});
test('vigencia se corrige solo sobre tarifas trazadas y no genera pagos',()=>{
 const repair=fs.readFileSync('supabase/migrations/20260905000628_krediya_tarifario_vigencia_y_pago_neto.sql','utf8');
 assert.match(repair,/tarifario_importado_fuente_autorizada/);
 assert.match(repair,/p\.precio_venta=\(a\.detalle->>'pvp'\)::numeric/);
 assert.match(repair,/l\.frozen_at is null/);
 assert.match(repair,/'anterior',anterior/);
 assert.doesNotMatch(repair,/update public\.(liquidations|liquidation_operations)|insert into public\.payment_orders/);
 const bonus=fs.readFileSync('supabase/migrations/20260904235121_krediya_bonos_vigencia_lote_pendiente.sql','utf8');
 assert.match(bonus,/gestion_krediya' and valor=5000/);
 assert.match(bonus,/operacion' and valor=15000/);
 assert.match(bonus,/krediya_bono_sin_configurar/);
 assert.doesNotMatch(bonus,/insert into public\.payment_orders/);
});
test('novedades no usan pastillas rosadas para explicaciones largas',()=>{
 const html=fs.readFileSync('creditek/erp/aliados-liquidaciones.html','utf8');
 assert.match(html,/#liquidationsContent \.badge\.con_novedades\{background:#F1F5F9!important/);
 assert.match(app,/class="issue-summary"/);
 assert.doesNotMatch(app,/class="badge con_novedades">\$\{issueLabel\}/);
 assert.match(html,/#priceImpact\{white-space:pre-line/);
});
