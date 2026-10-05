import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
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
    assert.match(sales.hint,/Mayte y Óscar reciben este mismo pendiente/);
    assert.match(sales.hint,/aprobar o rechazar, no al leerlo/);
    assert.ok(!sources.some(s=>s.table==='financial_entries'),'no depende del acceso financiero');
  }
  for(const rol of ['admin_tienda','asesor'])assert.ok(!pendingSources({id:'a',rol,tienda_codigo:'CK-02'},true,true).some(s=>s.key==='sales-approval'));
  assert.equal(pendingSources({id:'a',rol:'gerencia',activo:false},true,true).length,0);
});

test('conteos cargados aparecen para Gerencia y Maite, no para tiendas',async()=>{
  for(const rol of ['gerencia','auditoria']){
    const spec=pendingSources({id:'a',rol}).find(s=>s.key==='inventory-counts');
    assert.equal(spec.rpc,'conteos_pendientes_cantidad');
    assert.equal(spec.path,'/creditek/erp/inventario.html#conteos');
    assert.match(spec.hint,/antes de autorizar diferencias/);
    const sb={rpc:async name=>{assert.equal(name,spec.rpc);return {data:2,error:null};}};
    assert.equal((await pendingCount(sb,spec)).count,2);
    await assert.rejects(pendingCount({rpc:async()=>({data:null,error:{message:'sin acceso'}})},spec),/pendientes/);
  }
  assert.ok(!pendingSources({id:'a',rol:'admin_tienda',tienda_codigo:'CK-01'}).some(s=>s.key==='inventory-counts'));
  const sql=readFileSync('supabase/migrations/20261005220944_avisar_conteos_inventario_pendientes.sql','utf8');
  assert.match(sql,/c\.estado = 'pendiente'/);
  assert.match(sql,/join inventario_control\.responsables/);
  assert.match(sql,/grant execute on function public\.conteos_pendientes_cantidad\(\) to authenticated/);
  assert.match(readFileSync('creditek/erp/conteos-ui.js','utf8'),/kora-notifications-refresh/);
});

test('RPC de la campana cuenta solo conteos pendientes y restringe a responsables activos',async()=>{
  const db=await PGlite.create();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema inventario_control;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.uid', true),'')::uuid
      $$;
      create table public.perfiles(id uuid primary key, activo boolean, rol text);
      create table inventario_control.responsables(perfil_id uuid primary key);
      create table inventario_control.cortes(id uuid primary key, estado text);
    `);
    await db.exec(readFileSync('supabase/migrations/20261005220944_avisar_conteos_inventario_pendientes.sql','utf8'));
    await db.exec(`insert into public.perfiles values
      ('00000000-0000-0000-0000-000000000001',true,'gerencia'),
      ('00000000-0000-0000-0000-000000000002',true,'auditoria'),
      ('00000000-0000-0000-0000-000000000003',true,'admin_tienda'),
      ('00000000-0000-0000-0000-000000000004',false,'auditoria');
      insert into inventario_control.responsables values
      ('00000000-0000-0000-0000-000000000001'),
      ('00000000-0000-0000-0000-000000000002'),
      ('00000000-0000-0000-0000-000000000004');
      insert into inventario_control.cortes values
      ('10000000-0000-0000-0000-000000000001','abierto'),
      ('10000000-0000-0000-0000-000000000002','pendiente'),
      ('10000000-0000-0000-0000-000000000003','pendiente'),
      ('10000000-0000-0000-0000-000000000004','aplicado');`);
    for(const id of ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002']){
      await db.query("select set_config('app.uid',$1,false)",[id]);
      const result=await db.query('select public.conteos_pendientes_cantidad() as n');
      assert.equal(Number(result.rows[0].n),2);
    }
    for(const id of ['00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004']){
      await db.query("select set_config('app.uid',$1,false)",[id]);
      const result=await db.query('select public.conteos_pendientes_cantidad() as n');
      assert.equal(Number(result.rows[0].n),0);
    }
    await db.query("select set_config('app.uid','',false)");
    assert.equal(Number((await db.query('select public.conteos_pendientes_cantidad() as n')).rows[0].n),0);
  } finally { await db.close(); }
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

test('gastos Retail avisa a la campana solo tras recibir estados vigentes',async()=>{
  const page=readFileSync('creditek/erp/gastos.html','utf8');
  const loader=page.slice(page.indexOf('async function cargarGastos()'),page.indexOf('function renderColaAprobacion()'));
  let result={data:[{id:'g1',estado:'aprobado'}]},renders=0;
  const events=[];
  const q={select(){return q;},order:async()=>result};
  const ctx=vm.createContext({sb:{from(table){assert.equal(table,'gastos');return q;}},
    document:{getElementById(){return {style:{}};},dispatchEvent(e){events.push(e.type);}},
    CustomEvent:class{constructor(type){this.type=type;}},
    renderColaAprobacion(){renders++;},renderTablaGastos(){renders++;}
  });
  vm.runInContext(`let gastosCache=[];${loader}`,ctx);
  await ctx.cargarGastos();
  assert.deepEqual(events,['kora-notifications-refresh']);assert.equal(renders,2);
  result={error:{message:'Sin conexión'}};await ctx.cargarGastos();
  assert.equal(events.length,1,'un error no confirma que haya cambiado el estado');
});

test('finanzas notifica inmediatamente después del guardado, incluso si la recarga falla',async()=>{
  const app=readFileSync('creditek/erp/finanzas-programadas-app.js','utf8');
  const submit=app.slice(app.indexOf('async function submit(event)'),app.indexOf('function download()'));
  const events=[],save={disabled:false},formError={};let failedSave=false;
  const ctx=vm.createContext({
    $:id=>id==='save'?save:formError,personPicker:null,modalAction:'decision',
    FormData:class{},CustomEvent:class{constructor(type){this.type=type;}},
    document:{dispatchEvent(e){events.push(e.type);}},
    saveDecision:async()=>failedSave?{error:{message:'No autorizado'}}:{data:true},
    closeModal(){},load:async()=>{throw new Error('Sin conexión al recargar');},errorText:e=>e.message,
  });
  vm.runInContext(submit,ctx);
  await ctx.submit({preventDefault(){},currentTarget:{}});
  assert.deepEqual(events,['kora-notifications-refresh']);
  assert.equal(save.disabled,false);
  failedSave=true;await ctx.submit({preventDefault(){},currentTarget:{}});
  assert.equal(events.length,1,'una decisión rechazada por el servidor no dispara éxito');
});

test('las fuentes de pendientes solicitan refresco después de leer o guardar',()=>{
  for(const file of ['aliados-tesoreria-app.js','tesoreria-gastos.js','aliados-v1-1-app.js','ventas.html','traslados.html']){
    assert.match(readFileSync(`creditek/erp/${file}`,'utf8'),/document\.dispatchEvent\(new CustomEvent\('kora-notifications-refresh'\)\)/,file);
  }
  const incident=readFileSync('creditek/erp/incidencias-app.js','utf8');
  assert.match(incident.slice(incident.indexOf('async function confirmFixed()'),incident.indexOf('function bind()')),/kora-notifications-refresh/);
});
