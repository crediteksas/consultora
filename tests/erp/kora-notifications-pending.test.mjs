import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('creditek/erp/kora-notifications.js','utf8');
const context=vm.createContext({window:{},document:{dispatchEvent(){}},CustomEvent:class{}});
vm.runInContext(source,context);
const {pendingSources,pendingCount}=context.window.KoraNotifications;
test('resueltas no cuentan como pendientes para gerencia, Maythe ni tiendas; reabiertas sí',async()=>{
  for(const rol of ['gerencia','auditoria','admin_tienda']){
    const spec=pendingSources({id:'a',rol,tienda_codigo:'CK-02'})[0];
    const statuses=spec.filters[0][2];
    for(const status of ['corregido','cerrado','rechazado','duplicado','no_reproducible'])assert.ok(!statuses.includes(status));
    for(const status of ['nuevo','en_revision','confirmado','en_desarrollo','pendiente_validacion','reabierto'])assert.ok(statuses.includes(status));
    const rows=Array(6).fill('corregido');
    const sb={from(){const q={select(){return q;},in(column,allowed){assert.equal(column,'status');return Promise.resolve({count:rows.filter(s=>allowed.includes(s)).length,error:null});}};return q;}};
    assert.equal((await pendingCount(sb,spec)).count,0);
    rows.push('reabierto');assert.equal((await pendingCount(sb,spec)).count,1);
  }
});
test('tienda solo recibe alertas de traslados destino y gastos propios devueltos',()=>{
  const sources=pendingSources({id:'a',rol:'admin_tienda',tienda_codigo:'CK-02'});
  const transfers=sources.find(s=>s.key==='transfers');
  assert.equal(JSON.stringify(transfers.filters),JSON.stringify([['eq','estado','despachado'],['eq','tienda_destino','CK-02']]));
  assert.equal(sources.find(s=>s.key==='expense-corrections').filters[1][2],'CK-02');
  assert.ok(!sources.some(s=>s.table==='financial_entries'));
  assert.equal(pendingSources({id:'a',rol:'admin_tienda'}).length,1);
  assert.equal(pendingSources({id:'a',rol:'asesor'}).length,1);
  assert.equal(pendingSources({id:'a',activo:false}).length,0);
});
test('Maythe y gerencia ven autorización después de recibir, no antes',()=>{
  for(const rol of ['gerencia','auditoria']){
    const sources=pendingSources({id:'a',rol},true);
    assert.equal(sources.find(s=>s.key==='transfers').filters[0][2],'recibido_pendiente_aprobacion');
    assert.ok(sources.some(s=>s.key==='store-expenses'));
    assert.equal(sources.find(s=>s.key==='store-expenses').path,'/creditek/erp/gastos.html?pendientes=1');
    assert.ok(sources.some(s=>s.key==='financial-payment'));
    assert.match(sources.find(s=>s.key==='financial-payment').hint, /hasta registrar y validar el pago/);
    assert.ok(!pendingSources({id:'a',rol},false).some(s=>s.table==='financial_entries'));
  }
});
test('conteos exactos sin descargar datos ni convertir errores en cero',async()=>{
  let result={count:2048,error:null};const calls=[];
  const sb={from(table){calls.push(table);const q={select(columns,options){assert.equal(columns,'id');assert.equal(options.count,'exact');assert.equal(options.head,true);return q;},in(){return q;},then(ok,bad){return Promise.resolve(result).then(ok,bad);}};return q;}};
  const spec=pendingSources({id:'a'})[0];
  assert.equal((await pendingCount(sb,spec)).count,2048);
  result={count:null,error:{message:'expired'}};
  await assert.rejects(pendingCount(sb,spec),/pendientes/);
  result={count:null,error:null};
  await assert.rejects(pendingCount(sb,spec),/pendientes/);
  assert.ok(calls.every(t=>t==='kora_incidents'));
});

test('ventas excepcionales solo alertan a quien el servidor permite autorizar',()=>{
  for(const rol of ['gerencia','auditoria']){
    assert.ok(!pendingSources({id:'a',rol},true).some(s=>s.key==='sales-approval'));
    const sources=pendingSources({id:'a',rol},false,true);
    const sales=sources.find(s=>s.key==='sales-approval');
    assert.equal(sales.table,'ventas_autorizaciones');
    assert.equal(JSON.stringify(sales.filters),JSON.stringify([['eq','estado','pendiente']]));
    assert.equal(sales.path,'/creditek/erp/ventas.html#tituloAutorizaciones');
    assert.match(readFileSync('creditek/erp/ventas.html','utf8'),/id="tituloAutorizaciones"/);
    assert.match(sales.hint,/aprobar o rechazar, no al leerlas/);
    assert.ok(!sources.some(s=>s.table==='financial_entries'),'no depende del acceso financiero');
  }
  for(const rol of ['admin_tienda','asesor'])assert.ok(!pendingSources({id:'a',rol,tienda_codigo:'CK-02'},true,true).some(s=>s.key==='sales-approval'));
  assert.equal(pendingSources({id:'a',rol:'gerencia',activo:false},true,true).length,0);
});

test('campana cuenta todas las ventas pendientes, no aprobadas/rechazadas ni solo el mes actual',async()=>{
  const rows=[{estado:'pendiente',fecha:'2026-08-01'},{estado:'pendiente',fecha:'2026-09-27'},{estado:'aprobada'},{estado:'rechazada'},{estado:'registrada'}];
  const calls=[];
  const sb={from(table){assert.equal(table,'ventas_autorizaciones');const q={
    select(columns,options){assert.equal(columns,'id');assert.equal(options.count,'exact');assert.equal(options.head,true);return q;},
    eq(column,value){calls.push([column,value]);return Promise.resolve({count:rows.filter(r=>r[column]===value).length,error:null});}
  };return q;}};
  const spec=pendingSources({id:'a',rol:'gerencia'},false,true).find(s=>s.key==='sales-approval');
  assert.equal((await pendingCount(sb,spec)).count,2);
  assert.deepEqual(calls,[['estado','pendiente']]);
});
