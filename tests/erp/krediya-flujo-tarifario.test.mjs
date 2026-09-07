import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const api=require('../../creditek/erp/krediya-tarifario.js');
const app=fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20260905034907_krediya_flujo_tarifario_y_seguimiento.sql','utf8');
const engine=sql.slice(sql.indexOf('create function krediya_private.calcular_y_enviar_aprobacion'),sql.indexOf('create or replace function public.aliados_cambiar_estado'));
test('tarifario exporta referencia, PVP y Pagamos originales como números',()=>{
 const rows=api.tarifaRows([{codigo:'T0924',referencia:'REDMI 15C 128GB 4RAM',precio_venta:646400,pagamos:484800,vigente_desde:'2026-08-12'}]);
 assert.deepEqual(rows[1],['T0924','REDMI 15C 128GB 4RAM',646400,484800,'2026-08-12','']);
});
test('informe exporta snapshot del cálculo, resta inicial una sola vez y conserva pérdidas',()=>{
 const result=api.diferenciasRows([{estado:'pendiente',contexto:{referencia:'Equipo',tienda:'Comercio',imei:'012345678901234',fecha:'2026-08-12',pvp_guardado:646400,pvp_liquidado:701500,impacto_bruto:55100,pagamos:484800,inicial:70150,bonos:50000,utilidad_neta:-100,impacto_neto:-20}}]);
 assert.equal(result[1][2],'012345678901234');assert.equal(result[1][9],414650);
 assert.equal(result[1][11],-100);assert.equal(result[1][13],'Gestión y Gerencia');
});
test('PVP no configurado permanece ausente, no aparece como cero en la exportación',()=>{
 const rows=api.diferenciasRows([{estado:'pendiente',contexto:{pvp_guardado:null,pvp_liquidado:100,pagamos:80,inicial:20,impacto_neto:null}}]);
 assert.equal(rows[1][4],null);assert.equal(rows[1][12],null);
});
test('giro exportado conserva ausencias y no convierte valores inválidos en dinero',()=>{
 for(const value of [null,undefined,'',false,'sin dato',Infinity]) {
  assert.equal(api.giro({pagamos:value,inicial:20}),null);
  assert.equal(api.giro({pagamos:80,inicial:value}),null);
 }
 assert.equal(api.giro({pagamos:'484800',inicial:'70150'}),414650);
 assert.equal(api.giro({pagamos:80,inicial:0}),80);
 const row=api.diferenciasRows([{contexto:{pagamos:null,inicial:20}}])[1];
 assert.equal(row[9],null);
});
test('impacto total identifica importes no cuantificados y conserva pérdidas reales',()=>{
 assert.deepEqual(api.impacto([{contexto:{impacto_neto:null}}]),{total:null,pendientes:1});
 assert.deepEqual(api.impacto([{contexto:{impacto_neto:-20}},{contexto:{impacto_neto:null}}]),{total:-20,pendientes:1});
 assert.deepEqual(api.impacto([{contexto:{impacto_neto:0}}]),{total:0,pendientes:0});
 assert.deepEqual(api.impacto([]),{total:0,pendientes:0});
});
test('informe conserva gasto financiero y provisión del snapshot sin recalcularlos',()=>{
 const rows=api.diferenciasRows([{contexto:{gasto_financiero:2525.4,provision:42000}}]);
 assert.equal(rows[1][rows[0].indexOf('Gasto financiero')],2525.4);
 assert.equal(rows[1][rows[0].indexOf('Provisión')],42000);
});
test('historial muestra la gestión más reciente sin reordenar los datos de origen',()=>{
 const history=[{created_at:'2026-09-01',comentario:'primero'},{created_at:'2026-09-05',comentario:'último'}];
 assert.equal(api.last({krediya_diferencias_gestiones:history}).comentario,'último');
 assert.equal(history[0].comentario,'primero');
});
test('abrir un detalle ya no sincroniza ni modifica precios',()=>{
 const open=app.slice(app.indexOf('  async function openDetail('),app.indexOf('  async function loadTab('));
 assert.doesNotMatch(open,/rpc\('aliados_sincronizar_precios_krediya'/);
});
test('clic Krediya calcula y muestra las órdenes; no aprueba ni paga automáticamente',async()=>{
 const nodes=new Map();const calls=[];
 const $=id=>{if(!nodes.has(id))nodes.set(id,{classList:{remove(){}},textContent:'',scrollIntoView(){}});return nodes.get(id);};
 const context={$ ,selected:{id:'lote',plataforma:'krediya',estado:'revisada'},sb:{rpc:async(...a)=>{calls.push(a);return {error:null};}},loadBatches:async()=>{},openDetail:async()=>{},loadTab:async name=>calls.push(['tab',name]),updateActions:()=>{}};
 vm.runInNewContext(app.slice(app.indexOf("  $('calculate').onclick"),app.indexOf("  $('review').onclick")),context);
 await $('calculate').onclick();
 assert.equal(calls.length,2);assert.equal(calls[0][0],'krediya_calcular_y_enviar_aprobacion');assert.deepEqual(calls[1],['tab','payments']);
});
test('un error del cálculo no queda oculto por el texto genérico del estado',async()=>{
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{classList:{remove(){}},textContent:''});return nodes.get(id);};
 const context={$ ,selected:{id:'lote',plataforma:'krediya'},sb:{rpc:async()=>({error:{message:'Falta PAGAMOS para referencia concreta'}})},updateActions:()=>{$('workflowError').textContent='Mensaje genérico';}};
 vm.runInNewContext(app.slice(app.indexOf("  $('calculate').onclick"),app.indexOf("  $('review').onclick")),context);
 await $('calculate').onclick();assert.equal($('workflowError').textContent,'Falta PAGAMOS para referencia concreta');
});
test('motor SQL respeta Pagamos, resta inicial una vez y aplica provisión tras bonos',()=>{
 assert.match(engine,/pactado:=\(c->>'pagamos_guardado'\)::numeric; pago:=round\(pactado-o.inicial,2\)/);
 assert.match(engine,/financiero:=round\(o.monto_credito\*0.004,2\)/);
 assert.match(engine,/bruta:=round\(precio-pactado-bonos-financiero,2\); provision:=round\(bruta\*0.28,2\); neta:=bruta-provision/);
 assert.match(engine,/tipo_bono='automatico_universal'/);
 assert.match(engine,/perform public.aliados_calcular_bonos_ejecutivos\(p_id\)/);
 assert.doesNotMatch(engine,/aliados_cambiar_estado\(p_id,'aprobada'|estado='pagado'/);
 assert.match(engine,/aliados_cambiar_estado\(p_id,'revisada'/);
});
test('diferencias son independientes; el preflight mantiene validaciones de datos',()=>{
 assert.match(engine,/insert into public.krediya_diferencias/);
 assert.match(engine,/Falta PAGAMOS pactado/);assert.match(engine,/Hay créditos duplicados/);
 assert.match(engine,/l.frozen_at is not null/);assert.match(engine,/lock table public.krediya_price_rules,public.krediya_bonus_rules in share mode/);
 assert.doesNotMatch(engine,/precio<>.*raise exception/);
});
test('cuenta se exige al pagar y el cálculo Krediya no se cierra por corte histórico',()=>{
 assert.match(sql,/new.estado='pagado'.*new.platform_snapshot='krediya'/);
 assert.match(sql,/create trigger zz_krediya_cuenta_al_pagar/);
 assert.match(sql,/clasificar_pago_historico_por_corte/);
 assert.match(sql,/and c.policy_snapshot->>''motor''=''krediya_v2''/);
 assert.match(sql,/right_value:=\(o.policy_snapshot/);
});
test('tarifas y seguimiento requieren usuario autorizado, RLS y auditoría',()=>{
 assert.match(sql,/krediya_diferencias enable row level security/);
 assert.match(sql,/krediya_diferencias_gestiones enable row level security/);
 assert.match(sql,/r.updated_at is distinct from p_version/);
 assert.match(sql,/krediya_tarifa_editada/);
 assert.match(sql,/auth.uid\(\) is null or not public.tiene_capacidad_aliados\('revisor'\)/);
 assert.match(sql,/revoke insert,update,delete on public.krediya_price_rules from authenticated/);
});
