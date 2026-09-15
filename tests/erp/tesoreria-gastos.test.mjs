import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create,canDecide,summarize,paintIndicator}=require('../../creditek/erp/tesoreria-gastos.js');
require('../../creditek/erp/finanzas-programadas-domain.js');
const domain=globalThis.KoraFinancialDomain;
const oscar={id:'6de0ad26-64af-4966-8cd9-d468880af627',activo:true,rol:'gerencia'};
function fixture(profile=oscar){
  const elements=new Map(),calls=[];
  const host={querySelector(key){if(!elements.has(key))elements.set(key,{value:'',innerHTML:'',textContent:'',disabled:false});return elements.get(key);},querySelectorAll(){return [];}};
  const rows=[{id:'pending',status:'pendiente_aprobacion',amount:100,business_unit:'b2b',concept:'<script>prueba</script>',beneficiary:'Prueba',due_date:'2026-01-01'}, {id:'approved',status:'aprobado',amount:200,business_unit:'b2b',concept:'Ya aprobado',due_date:'2026-01-01'}];
  const sb={from(table){assert.equal(table,'financial_entries');const query={select(){return query;},order(){return query;},range(){return Promise.resolve({data:rows});}};return query;},async rpc(name,args){calls.push({name,args});rows[0]={...rows[0],status:args.p_decision};return {data:rows[0]};}};
  return {host,calls,rows,sb,api:create({sb,profile,domain})};
}
test('solo Oscar activo puede decidir movimientos pendientes',()=>{
  assert.equal(canDecide(oscar,{status:'pendiente_aprobacion'}),true);
  assert.equal(canDecide({...oscar,activo:false},{status:'pendiente_aprobacion'}),false);
  assert.equal(canDecide({...oscar,id:'maite',rol:'auditoria'},{status:'pendiente_aprobacion'}),false);
  assert.equal(canDecide(oscar,{status:'aprobado'}),false);
});
test('consultar no escribe ni crea órdenes; muestra aprobados sin botón y escapa datos',async()=>{
  const f=fixture();await f.api.mount(f.host);assert.equal(f.calls.length,0);
  assert.match(f.host.querySelector('[data-pending]').innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(f.host.querySelector('[data-approved]').innerHTML,/data-decision=/);
  assert.match(f.host.querySelector('[data-approved]').innerHTML,/No requiere otra aprobación/);
});
test('aprobar usa el mismo ID y RPC, y lo retira de pendientes',async()=>{
  const f=fixture();await f.api.mount(f.host);
  const form={dataset:{decision:'pending'},elements:{amount:{value:'100'},note:{value:'Revisado'}}};
  await f.host.onsubmit({preventDefault(){},target:{closest(){return form;}},submitter:{value:'aprobado'}});
  assert.deepEqual(f.calls,[{name:'finanzas_decidir_movimiento',args:{p_id:'pending',p_decision:'aprobado',p_amount:100,p_note:'Revisado'}}]);
  assert.match(f.host.querySelector('[data-pending]').innerHTML,/No hay gastos pendientes/);
  assert.match(f.host.querySelector('[data-approved]').innerHTML,/pendientes de pago \(2\)/);
});
test('doble clic no repite decisión y los errores quedan visibles',async()=>{
  const f=fixture();let release;f.sb.rpc=()=>new Promise(resolve=>{release=resolve;});await f.api.mount(f.host);
  const event={preventDefault(){},target:{closest(){return {dataset:{decision:'pending'},elements:{amount:{value:'100'},note:{value:''}}};}},submitter:{value:'aprobado'}};
  const first=f.host.onsubmit(event);assert.ok(release);const original=release;await f.host.onsubmit(event);assert.equal(release,original);
  release({error:{message:'Ya decidido'}});await first;assert.match(f.host.querySelector('[data-message]').textContent,/Ya decidido/);
});
test('Gastos remite a Tesorería y ya no llama a la API de aprobación',()=>{
  const app=readFileSync(new URL('../../creditek/erp/finanzas-programadas-app.js',import.meta.url),'utf8');
  const treasury=readFileSync(new URL('../../creditek/erp/aliados-tesoreria-app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/sb\.rpc\('finanzas_decidir_movimiento'/);
  assert.match(app,/aliados-tesoreria.html\?vista=gastos/);
  assert.match(treasury,/sb\.rpc\('es_controlador_financiero'\)/);
  assert.match(treasury,/route.get\('vista'\) === 'gastos'/);
});
test('indicador discreto alerta solo aprobaciones, no pagos ya autorizados',()=>{
  assert.deepEqual(summarize(['pendiente_aprobacion','aprobado','aprobado','pagado','rechazado','anulado'].map(status=>({status}))),{pending:1,approved:2});
  const classes=new Set(),attrs={};const button={classList:{toggle(k,v){v?classes.add(k):classes.delete(k);}},setAttribute(k,v){attrs[k]=v;}};
  paintIndicator(button,{pending:1,approved:2});
  assert.ok(classes.has('expenses-attention'));assert.match(button.innerHTML,/aria-hidden="true">1<\/span>/);assert.match(attrs['aria-label'],/1 por aprobar/);assert.doesNotMatch(button.innerHTML,/por aprobar|por pagar/);
  paintIndicator(button,{pending:0,approved:2});assert.equal(classes.size,0);assert.equal(button.innerHTML,'Gastos y retiros');
  paintIndicator(button,{pending:123,approved:2});assert.match(button.innerHTML,/>99\+<\/span>/);assert.match(attrs['aria-label'],/123 por aprobar/);
  paintIndicator(button,{pending:0,approved:0});assert.equal(button.innerHTML,'Gastos y retiros');assert.equal(classes.size,0);
  paintIndicator(button,{pending:2,error:true});assert.match(attrs['aria-label'],/No se pudo consultar/);assert.doesNotMatch(attrs['aria-label'],/0 por aprobar/);assert.equal(classes.size,0);assert.equal(button.innerHTML,'Gastos y retiros');
});
test('indicador carga antes de abrir la pestaña, pagina y no escribe',async()=>{
  const summaries=[],selections=[];let page=0;
  const sb={from(table){assert.equal(table,'financial_entries');const query={select(cols){selections.push(cols);return query;},in(key,values){assert.equal(key,'status');assert.deepEqual(values,['pendiente_aprobacion','aprobado']);return query;},order(){return query;},range(from,to){assert.equal(to-from,499);page++;return Promise.resolve({data:page===1?Array.from({length:500},()=>({status:'pendiente_aprobacion'})):[{status:'aprobado'}]});}};return query;}};
  const api=create({sb,profile:oscar,domain,onSummary:x=>summaries.push(x)});await api.refreshSummary();
  assert.deepEqual(summaries,[{pending:500,approved:1}]);assert.deepEqual(selections,['id,status','id,status']);
});
test('error del indicador no se presenta como cero y una respuesta vieja no pisa la nueva',async()=>{
  const summaries=[],pending=[];
  const sb={from(){const query={select(){return query;},in(){return query;},order(){return query;},range(){return new Promise(resolve=>pending.push(resolve));}};return query;}};
  const api=create({sb,profile:oscar,domain,onSummary:x=>summaries.push(x)});
  const a=api.refreshSummary(),b=api.refreshSummary();pending[1]({data:[{status:'aprobado'}]});await b;pending[0]({data:[{status:'pendiente_aprobacion'}]});await a;
  assert.deepEqual(summaries,[{pending:0,approved:1}]);
  const c=api.refreshSummary();pending[2]({error:{message:'offline'}});await c;assert.deepEqual(summaries.at(-1),{error:true});
});
test('aprobar actualiza el contador global y conserva el total pendiente de pago',async()=>{
  const f=fixture(),summaries=[];f.api=create({sb:f.sb,profile:oscar,domain,onSummary:x=>summaries.push(x)});await f.api.mount(f.host);
  const form={dataset:{decision:'pending'},elements:{amount:{value:'100'},note:{value:''}}};
  await f.host.onsubmit({preventDefault(){},target:{closest(){return form;}},submitter:{value:'aprobado'}});
  assert.deepEqual(summaries,[{pending:1,approved:1},{pending:0,approved:2}]);
});
