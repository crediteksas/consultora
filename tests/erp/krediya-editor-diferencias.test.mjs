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

test('corregir una venta habilita ambos importes, conserva la corrección previa y admite nota opcional',async()=>{
 const current={...base,pvp_aplicado:1050000,pagamos_aplicado:750000,pvp_guardado:1000000,pvp_recibido:900000,pagamos_guardado:700000,inicial:100000,correccion_venta:{ambito:'venta_v1',precio_venta:1050000,pagamos:750000,motivo:'Revisión ficticia anterior'}};
 const e=editor(current);let destination;e.context.loadTab=async(...args)=>{destination=args};await e.context.open('fixture-credit',{operationOnly:true});
 assert.match(e.$('priceEditorContent').innerHTML,/type="hidden" id="priceDecision" value="editar_operacion"/);assert.doesNotMatch(e.$('priceEditorContent').innerHTML,/Aplicar a ventas desde/);
 assert.match(e.$('priceEditorContent').innerHTML,/min="1" step="1"/);assert.equal(e.$('decisionPvp').value,1050000);assert.equal(e.$('decisionPagamos').value,750000);assert.equal(e.$('decisionPvp').disabled,false);assert.equal(e.$('savePriceDecision').disabled,false);
 e.$('priceReason').value='Corrección confirmada de esta venta';e.$('priceReason').oninput();assert.equal(e.$('savePriceDecision').disabled,false);assert.match(e.$('priceImpact').textContent,/Margen parcial antes de gasto financiero/);assert.doesNotMatch(e.$('priceImpact').textContent,/Utilidad neta estimada/);
 e.$('decisionPvp').value=1050000.5;e.$('decisionPvp').oninput();assert.equal(e.$('savePriceDecision').disabled,true);e.$('decisionPvp').value=1050000;e.$('decisionPvp').oninput();
 await e.$('priceDecisionForm').onsubmit({preventDefault(){}});assert.equal(e.calls.length,2);assert.equal(e.calls[1].name,'aliados_resolver_precio_krediya');assert.equal(e.calls[1].args.p_operation_id,'fixture-credit');assert.equal(e.calls[1].args.p_decision,'editar_operacion');assert.deepEqual(destination,['operations','fixture-credit']);assert.ok(!e.calls.some(c=>/guardar_tarifa|calcular|pagar/.test(c.name)));
});

test('un fallo de conexión mantiene el formulario y pide comprobar la venta antes de reintentar',async()=>{
 const e=editor({...base,inicial:10});await e.context.open('fixture-credit',{operationOnly:true});
 e.$('priceReason').value='Confirmado';e.$('priceReason').oninput();
 e.context.sb.rpc=async()=>{throw Error('offline')};
 await e.$('priceDecisionForm').onsubmit({preventDefault(){}});
 assert.match(e.$('priceSaveError').textContent,/Reabre esta venta para comprobar/);
 assert.equal(e.$('savePriceDecision').disabled,false);
});

test('una venta se guarda sin nota y conserva la auditoría con motivo automático',async()=>{
 for(const reason of ['', '   ', '  Acuerdo confirmado  ']){
  const e=editor({...base,inicial:10});await e.context.open('credit',{operationOnly:true});
  assert.match(e.$('priceEditorContent').innerHTML,/Nota \(opcional\)/);assert.doesNotMatch(e.$('priceEditorContent').innerHTML,/id="priceReason" required/);
  e.$('priceReason').value=reason;e.$('priceReason').oninput();assert.equal(e.$('savePriceDecision').disabled,false);
  await e.$('priceDecisionForm').onsubmit({preventDefault(){}});
  assert.equal(e.calls[1].args.p_justificacion,reason.trim()||'Corrección individual de PVP y PAGAMOS');
 }
});
test('el submit forzado no elude importes inválidos ni el motivo del flujo anterior',async()=>{
 for(const [p,paid] of [[1.5,75],[0,75],[100,9],[1e14,75]]){
  const e=editor({...base,inicial:10});await e.context.open('credit',{operationOnly:true});e.$('decisionPvp').value=p;e.$('decisionPagamos').value=paid;
  await e.$('priceDecisionForm').onsubmit({preventDefault(){}});assert.equal(e.calls.length,1);assert.equal(e.$('savePriceDecision').disabled,true);
 }
 const e=editor({...base,inicial:10});await e.context.open('credit');e.$('priceDecision').value='editar_operacion';e.$('priceDecision').onchange();
 assert.match(e.$('priceEditorContent').innerHTML,/id="priceReason" required/);await e.$('priceDecisionForm').onsubmit({preventDefault(){}});assert.equal(e.calls.length,1);
});
test('un error del servidor se muestra y permite reintentar con valores válidos',async()=>{
 const e=editor({...base,inicial:10});await e.context.open('credit',{operationOnly:true});e.context.sb.rpc=async()=>({error:{message:'Liquidación bloqueada'}});
 await e.$('priceDecisionForm').onsubmit({preventDefault(){}});assert.equal(e.$('priceSaveError').textContent,'Liquidación bloqueada');assert.equal(e.$('savePriceDecision').disabled,false);
});

test('la ventana destaca lo guardado y deja el archivo y la referencia en consulta cerrada',async()=>{
 const e=editor({...base,pvp_guardado:1000000,pagamos_guardado:700000,pvp_recibido:900000,pvp_aplicado:1050000,pagamos_aplicado:750000,correccion_venta:{ambito:'venta_v1',precio_venta:1050000,pagamos:750000,motivo:'Ficticio'}});
 await e.context.open('fixture-credit',{operationOnly:true});const html=e.$('priceEditorContent').innerHTML;
 assert.match(html,/<p id="saleSavedPrices"[^>]*>Corrección guardada: PVP 1050000 · PAGAMOS 750000/);
 const details=html.match(/<details[^>]*id="priceSourceDetails"[\s\S]*?<\/details>/)[0];assert.doesNotMatch(details,/<details[^>]*\bopen\b|<input|<textarea|<select/);assert.match(details,/1000000/);assert.match(details,/900000/);
 assert.equal(e.$('decisionPvp').value,1050000);assert.equal(e.$('decisionPagamos').value,750000);assert.doesNotMatch(html,/Si Krediya reportó un error/);
 const legacy=editor(base);await legacy.context.open('fixture-credit');assert.doesNotMatch(legacy.$('priceEditorContent').innerHTML,/saleSavedPrices|priceSourceDetails/);assert.match(legacy.$('priceEditorContent').innerHTML,/Guardado en KORA/);assert.match(legacy.$('priceEditorContent').innerHTML,/Si Krediya reportó un error/);assert.match(legacy.$('priceEditorContent').innerHTML,/id="priceReason" required/);
 const fresh=editor(base);await fresh.context.open('fixture-credit',{operationOnly:true});assert.match(fresh.$('priceEditorContent').innerHTML,/Valores aplicados actualmente/);assert.doesNotMatch(fresh.$('priceEditorContent').innerHTML,/Corrección guardada/);
});
