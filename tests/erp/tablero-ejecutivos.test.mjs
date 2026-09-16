import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import domain from '../../creditek/erp/tablero-ejecutivos.js';
const period={start:'2026-09-01',end:'2026-10-01'};
const op=(id,extra={})=>({id,external_id:id,plataforma:'payjoy',operation_at:'2026-09-05T12:00:00-05:00',ejecutivo_id:'luis',tipo_establecimiento:'aliado',...extra});
const data=()=>({executives:[{id:'luis',nombre:'Luis',activo:true},{id:'mayte',nombre:'Mayte',activo:true}],origins:[{codigo:'a',ejecutivo_id:'luis',activo:true,tipo:'aliado'},{codigo:'b',ejecutivo_id:'luis',activo:false,tipo:'aliado'}],operations:[],historical:[],bonuses:[],beneficiaries:[{id:'b',ejecutivo_id:'luis'},{id:'m',ejecutivo_id:'mayte'}],reversions:[]});

test('créditos de Aliados: todas las plataformas, mes Bogotá, duplicados, históricos y pendientes de asignación',()=>{
 const d=data(); d.operations=[op('p'),op('a',{plataforma:'alo'}),op('k',{plataforma:'krediya'}),op('copy',{external_id:'p'}),op('retail',{tipo_establecimiento:'propia'}),op('aug',{operation_at:'2026-09-01T04:59:00Z'}),op('oct',{operation_at:'2026-10-01T05:00:00Z'}),op('unassigned',{ejecutivo_id:null}),op('tracking',{normalized_data:{seguimientoPagoKrediya:true}})];
 d.historical=[{id:'h1',codigo_credito:'p',plataforma:'payjoy',fecha_credito:'2026-09-05',ejecutivo_historico_id:'luis',tipo_establecimiento:'aliado'},{id:'h2',codigo_credito:'other',plataforma:'alo',fecha_credito:'2026-09-02',ejecutivo_historico_id:'luis',tipo_establecimiento:'aliado'}];
 const result=domain.summarize(d,period); assert.equal(result.list[0].credits,4);assert.equal(result.list[0].activeAllies,1);assert.equal(result.unassigned,1);
 assert.deepEqual(domain.month(new Date('2026-10-01T04:59:00Z')),period);
});
test('comisión por operación y beneficiario, sin mezclar meses ni confundir gestión con créditos propios',()=>{
 const d=data();d.operations=[op('p'),op('retail',{tipo_establecimiento:'propia',ejecutivo_id:null}),op('old',{operation_at:'2026-08-31T12:00:00Z'})];
 d.bonuses=[{id:'1',operation_id:'p',beneficiary_id:'b',estado:'aprobado',valor:20000},{id:'2',operation_id:'p',beneficiary_id:'b',estado:'anulado',valor:5000},{id:'3',operation_id:'old',beneficiary_id:'b',estado:'aprobado',valor:90000},{id:'4',operation_id:'retail',beneficiary_id:'m',estado:'aprobado',valor:5000}];
 const {list}=domain.summarize(d,period);assert.equal(list[0].commission,20000);assert.equal(list[1].commission,5000);assert.equal(list[1].credits,0);
});
test('anulaciones sin desembolso no reaparecen por copia histórica',()=>{
 const d=data();d.operations=[op('p')];d.reversions=[{tipo:'sin_desembolso',original_operation_id:'p',cancellation_operation_id:'c'}];d.historical=[{id:'h',codigo_credito:'p',plataforma:'payjoy',fecha_credito:'2026-09-05',ejecutivo_historico_id:'luis',tipo_establecimiento:'aliado'}];assert.equal(domain.summarize(d,period).list[0].credits,0);
});
test('reversión liquidada resta crédito y comisión sin generar pago ni recalcular reglas',()=>{
 const d=data();const original=op('p');d.operations=[original];d.bonuses=[{id:'b1',operation_id:'p',beneficiary_id:'b',estado:'aprobado',valor:20000}];d.reversions=[{id:'r',tipo:'reversion_liquidada',fecha:'2026-09-10',snapshot:{original,calculo:{policy_snapshot:{}},bonos:d.bonuses}}];const result=domain.summarize(d,period);assert.equal(result.list[0].credits,0);assert.equal(result.list[0].commission,0);
});
test('lectura paginada completa y errores no convertidos a ceros',async()=>{
 const calls=[];const sb={from:()=>({select:()=>({order:()=>({range:async(a,b)=>{calls.push([a,b]);return {data:Array.from({length:a===0?500:3},(_,i)=>({id:a+i}))};}})})})};
 assert.equal((await domain.allRows(sb,'x','id')).length,503);assert.deepEqual(calls,[[0,499],[500,999]]);
 const bad={from:()=>({select:()=>({order:()=>({range:async()=>({error:new Error('denegado')})})})})};await assert.rejects(domain.allRows(bad,'x','id'),/denegado/);
});
test('UI consulta el dominio correcto, alinea encabezados y valores, y muestra error de lectura',async()=>{
 const html=fs.readFileSync('creditek/erp/tablero.html','utf8');const source=html.slice(html.indexOf('async function cargarEjecutivos()'),html.lastIndexOf('</script>'));
 const nodes=Object.fromEntries(['tbodyEjecutivos','emptyEjecutivos','ejecutivosNota'].map(id=>[id,{style:{}}]));
 const ctx={document:{getElementById:id=>nodes[id]},sb:{},CreditekTableroEjecutivos:{load:async()=>({list:[{name:'Luis',credits:26,activeAllies:16,commission:550000}],unassigned:0})},fmtCOP:n=>'$ '+n,escapeHtml:String,console:{error(){}}};vm.runInNewContext(source,ctx);await ctx.cargarEjecutivos();assert.match(nodes.tbodyEjecutivos.innerHTML,/<td class="centro">26<\/td>/);assert.match(nodes.tbodyEjecutivos.innerHTML,/550000/);
 ctx.CreditekTableroEjecutivos.load=async()=>{throw Error('no disponible');};await ctx.cargarEjecutivos();assert.equal(nodes.tbodyEjecutivos.innerHTML,'');assert.match(nodes.emptyEjecutivos.textContent,/No fue posible/);
 assert.match(html,/<th class="centro">Aliadas activas<\/th><th class="centro">Créditos del mes<\/th><th class="num">Comisión registrada/);
});
