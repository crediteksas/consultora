import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create,canDecide}=require('../../creditek/erp/tesoreria-gastos.js');
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
