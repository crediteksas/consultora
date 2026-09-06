import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {paymentReadiness, paymentGroupKey}=require('../../creditek/erp/aliados-tesoreria-domain.js');
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
const user='00000000-0000-4000-8000-000000000001';
const holder='00000000-0000-4000-8000-000000000002';
const batch='00000000-0000-4000-8000-000000000003';
const bank={bank:'Banco prueba',account_type:'ahorros',account_number:'00123456',holder:'Titular prueba',holder_identification:'123456'};
const ready={id:'1',beneficiary_id:holder,valor:50000,estado:'programado',authorized_by:user,authorized_at:'2026-09-05',platform_snapshot:'PayJoy',cutoff_snapshot:'2026-09-04',bank_snapshot:bank,liquidations:{frozen_at:'2026-09-05',approved_at:'2026-09-05'}};
let db;
before(async()=>{
 db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function tiene_capacidad_aliados(text default 'revisor') returns boolean language sql as $$select coalesce(current_setting('test.capability',true),'true')='true'$$;
 create table origenes(codigo text primary key,nombre text,tipo text,ciudad text,activo boolean,ejecutivo_id uuid);
 create table aliados(id uuid primary key default gen_random_uuid(),nombre_comercial text,razon_social text,identificacion text,propietario text,
 ejecutivo_id uuid,ciudad_principal text,estado text default 'activo',estado_asociacion text,fecha_vinculacion date default current_date,
 created_at timestamptz default now(),updated_at timestamptz default now(),created_by uuid,updated_by uuid);
 create table aliados_sedes(id uuid primary key default gen_random_uuid(),aliado_id uuid references aliados,origen_codigo text unique references origenes,
 nombre text,ciudad text,direccion text,estado_asociacion text,activa boolean default true,created_at timestamptz default now(),updated_at timestamptz default now(),created_by uuid,updated_by uuid);
 create table liquidation_beneficiaries(id uuid primary key default gen_random_uuid(),tipo text,nombre text,identificacion text,origen_codigo text,activo boolean default true);
 create table beneficiary_bank_accounts(id uuid primary key default gen_random_uuid(),beneficiary_id uuid references liquidation_beneficiaries,banco text,tipo_cuenta text,numero_cuenta text,
 validada boolean,validada_por uuid,validada_at timestamptz,activo boolean,created_at timestamptz default now(),unique(beneficiary_id,numero_cuenta));
 create table liquidations(id uuid primary key,estado text,frozen_at timestamptz,approved_at timestamptz);
 create table payment_orders(id uuid primary key default gen_random_uuid(),beneficiary_id uuid,liquidation_id uuid,bank_account_id uuid,bank_snapshot jsonb,
 valor numeric,estado text default 'pendiente',authorized_by uuid,authorized_at timestamptz,soporte_path text,historico_inicial boolean default false,platform_snapshot text,cutoff_snapshot date,
 payment_kind text,updated_at timestamptz default now());
 create table audit_log(id bigint generated always as identity,usuario text,accion text,tabla text,registro_id text,detalle jsonb);
 create table storage.objects(bucket_id text,name text,metadata jsonb);
 create table test_debits(payment_id uuid primary key,valor numeric);
 -- Doble de la transición contable: prueba atomicidad/idempotencia del nuevo
 -- orquestador. Las pruebas existentes cubren los asientos del motor real.
 create function aliados_cambiar_estado_pago(p_id uuid,p_estado text,p_soporte_path text) returns payment_orders language plpgsql set search_path='public' as $$
 declare v payment_orders%rowtype;begin
 select * into v from payment_orders where id=p_id for update;
 if v.valor>999999 then raise exception 'Saldo insuficiente'; end if;
 insert into test_debits values(v.id,v.valor);
 update payment_orders set estado=p_estado,soporte_path=p_soporte_path where id=p_id returning * into v;return v;end $$;
 insert into origenes values('tech','A TECH MOVIL','aliado','Montería',true,null),('tecno','A TECNO MOVIL','aliado',null,true,null),('retail','TIENDA PROPIA','propia',null,true,null);
 insert into aliados_sedes(origen_codigo,nombre,ciudad,direccion,estado_asociacion) values('tech','A TECH MOVIL','Montería','Dirección existente','pendiente_asociacion');
 select set_config('request.jwt.claim.sub','${user}',false);`);
 await db.exec(await read('supabase/migrations/20260906154913_tesoreria_clientes_cuentas.sql'));
 await db.exec(await read('tests/erp/fixtures/completar-pagos-pre-unificacion.sql'));
 await db.exec(await read('supabase/migrations/20260906205155_clientes_unificados_y_pagos_seguros.sql'));
});
after(async()=>db?.close());
test('grupos: Luis 110.000 listo; 80.000 de PayJoy 1/9 separado, no desbloqueado',()=>{
 const orders=[ready,{...ready,id:'2',valor:60000,cutoff_snapshot:'2026-09-03'},{...ready,id:'3',valor:80000,cutoff_snapshot:'2026-09-01',liquidations:{frozen_at:null,approved_at:null}}];
 assert.equal(paymentGroupKey(orders[0]),paymentGroupKey(orders[1]));
 assert.notEqual(paymentGroupKey(orders[0]),paymentGroupKey(orders[2]));
 assert.match(paymentReadiness(orders[2]).reason,/PayJoy.*2026-09-01/);
 assert.equal(orders.filter(p=>paymentReadiness(p).ready).reduce((sum,p)=>sum+p.valor,0),110000);
 for(const key of Object.keys(bank))assert.notEqual(paymentGroupKey(ready),paymentGroupKey({...ready,bank_snapshot:{...bank,[key]:'otra'}}));
 assert.equal(paymentReadiness({...ready,authorized_at:null}).ready,false);
 assert.equal(paymentReadiness({...ready,bank_snapshot:{...bank,holder_identification:''}}).ready,false);
 assert.equal(paymentReadiness({...ready,estado:'pagado',soporte_path:null}).supportOnly,true);
});
test('unifica por sede/código conservando dirección; no fusiona comercios similares ni toca Retail',async()=>{
 const rows=(await db.query('select o.codigo,s.aliado_id,s.direccion from origenes o left join aliados_sedes s on s.origen_codigo=o.codigo order by codigo')).rows;
 assert.equal(rows[0].aliado_id,null);assert.ok(rows[1].aliado_id);assert.ok(rows[2].aliado_id);
 assert.notEqual(rows[1].aliado_id,rows[2].aliado_id);
 assert.equal(rows.find(r=>r.codigo==='tech').direccion,'Dirección existente');
 assert.equal((await db.query('select count(*)::int n from payment_orders')).rows[0].n,0);
});
test('ficha comparte datos, controla concurrencia y rechaza campos financieros y usuarios sin permiso',async()=>{
 const id=(await db.query("select aliado_id from aliados_sedes where origen_codigo='tech'")).rows[0].aliado_id;
 const params=['tech',id,0,{nombre:'A TECH MOVIL',ciudad:'Sincelejo',contacto:'Contacto prueba',telefono:'3001234567'}];
 await db.query('select tesoreria_guardar_ficha_cliente($1,$2,$3,$4)',params);
 assert.equal((await db.query("select ciudad from origenes where codigo='tech'")).rows[0].ciudad,'Sincelejo');
 await assert.rejects(()=>db.query('select tesoreria_guardar_ficha_cliente($1,$2,$3,$4)',params),/Otra persona/);
 await assert.rejects(()=>db.query('select tesoreria_guardar_ficha_cliente($1,$2,1,$3)',['tech',id,{nombre:'Prueba',saldo:5}]),/no permitidos/);
 await db.exec("select set_config('test.capability','false',false)");
 await assert.rejects(()=>db.query('select tesoreria_guardar_ficha_cliente($1,$2,1,$3)',['tech',id,{nombre:'Prueba'}]),/No autorizado/);
 await db.exec("select set_config('test.capability','true',false)");
});
test('un comercio nuevo queda vinculado una sola vez; reactivarlo no duplica su ficha',async()=>{
 await db.exec("insert into origenes values('nuevo','Comercio nuevo','aliado','Montería',true,null)");
 const first=(await db.query("select aliado_id from aliados_sedes where origen_codigo='nuevo'")).rows;
 assert.equal(first.length,1);assert.ok(first[0].aliado_id);
 await db.exec("update origenes set activo=false where codigo='nuevo';update origenes set activo=true where codigo='nuevo'");
 assert.deepEqual((await db.query("select aliado_id from aliados_sedes where origen_codigo='nuevo'")).rows,first);
});
test('mismo escritor de cuentas: repetir no duplica, una activa, no modifica destinos de pagos',async()=>{
 const params=['tech',null,'Titular prueba','123456','Banco prueba','ahorros','00123456',true];
 const result=(await db.query('select tesoreria_guardar_cliente_cuenta($1,$2,$3,$4,$5,$6,$7,$8) r',params)).rows[0].r;
 params[1]=result.beneficiary_id;
 await db.query('select tesoreria_guardar_cliente_cuenta($1,$2,$3,$4,$5,$6,$7,$8)',params);
 assert.equal((await db.query('select count(*)::int n from beneficiary_bank_accounts')).rows[0].n,1);
 await db.query("insert into liquidations values($1,'aprobada',now(),now())",[batch]);
 await db.query("insert into payment_orders(beneficiary_id,liquidation_id,bank_account_id,bank_snapshot,valor,estado,authorized_by) values($1,$2,$3,$4,50000,'programado',$5)",[result.beneficiary_id,batch,result.bank_account_id,bank,user]);
 await assert.rejects(()=>db.query('select aliados_guardar_cuenta_bancaria($1,$2,$3,$4,true)',[result.beneficiary_id,'Otro banco','ahorros','00123456']),/órdenes existentes/);
 const before=(await db.query('select bank_snapshot from payment_orders')).rows;
 await db.query('select aliados_guardar_cuenta_bancaria($1,$2,$3,$4,true)',[result.beneficiary_id,'Nuevo banco','corriente','00123457']);
 assert.deepEqual((await db.query('select bank_snapshot from payment_orders')).rows,before);
 assert.equal((await db.query('select count(*)::int n from beneficiary_bank_accounts where activo')).rows[0].n,1);
 await assert.rejects(()=>db.query("update payment_orders set bank_snapshot='{}'"),/ya fue autorizada/);
});
async function payment({amount=50000,state='programado',approved=true}={}){
 const b=(await db.query('insert into liquidations(id,estado,frozen_at,approved_at) values(gen_random_uuid(),$1,$2,$2) returning id',[approved?'aprobada':'programada',approved?'2026-09-05':null])).rows[0].id;
 return (await db.query('insert into payment_orders(beneficiary_id,liquidation_id,bank_snapshot,valor,estado,authorized_by,authorized_at,platform_snapshot,cutoff_snapshot) values($1,$2,$3,$4,$5,$6,now(),$7,$8) returning id',[holder,b,bank,amount,state,user,'payjoy','2026-09-01'])).rows[0].id;
}
async function support(name){const path='aliados/pagos/'+name+'.pdf';await db.query('insert into storage.objects values($1,$2,$3)',['soportes',path,{mimetype:'application/pdf',size:80000}]);return path;}
const close=(ids,path)=>db.query('select tesoreria_cerrar_pagos_con_soporte($1,$2)',[ids,path]);
test('soporte cargado cierra todo el grupo; reintentar no repite débitos',async()=>{
 const ids=[await payment(),await payment({amount:60000})],path=await support('grupo');
 await close(ids,path);await close(ids.slice().reverse(),path);
 assert.equal((await db.query('select sum(valor)::int total from test_debits')).rows[0].total,110000);
 assert.equal((await db.query("select count(*)::int n from payment_orders where id=any($1) and estado='pagado' and soporte_path=$2",[ids,path])).rows[0].n,2);
});
test('adjuntar soporte a pago ya registrado no debita; no sobrescribe soporte previo',async()=>{
 const id=await payment({state:'pagado'}),path=await support('anterior');const before=(await db.query('select count(*) n from test_debits')).rows;
 await close([id],path);await close([id],path);
 assert.deepEqual((await db.query('select count(*) n from test_debits')).rows,before);
 await assert.rejects(()=>close([id],'aliados/pagos/grupo.pdf'),/ya tiene un soporte/);
});
test('rechaza lote sin aprobar antes de cargar débitos; lote mixto es atómico',async()=>{
 const ids=[await payment(),await payment({approved:false})],path=await support('bloqueado');
 await assert.rejects(()=>close(ids,path),/Falta aprobar el lote payjoy/);
 assert.equal((await db.query('select count(*)::int n from test_debits where payment_id=any($1)',[ids])).rows[0].n,0);
});
test('error financiero del motor revierte todas las órdenes, no salta el control de saldo',async()=>{
 const ids=[await payment(),await payment({amount:1000000})],path=await support('saldo');
 await assert.rejects(()=>close(ids,path),/Saldo insuficiente/);
 assert.equal((await db.query('select count(*)::int n from test_debits where payment_id=any($1)',[ids])).rows[0].n,0);
});
test('rechaza soporte inexistente, IDs repetidos y usuario sin capacidad',async()=>{
 const id=await payment();
 await assert.rejects(()=>close([id],'aliados/pagos/no.pdf'),/no se ha cargado/);
 await assert.rejects(()=>close([id,id],'aliados/pagos/grupo.pdf'),/órdenes diferentes/);
 await db.exec("select set_config('test.capability','false',false)");
 await assert.rejects(()=>close([id],'aliados/pagos/grupo.pdf'),/No autorizado/);
 await db.exec("select set_config('test.capability','true',false)");
});
test('instalador consulta versión real sin caché; fallo no muestra una versión inventada',async()=>{
 const code=await read('creditek/erp/kora-release-label.js');let called;
 for(const valid of [true,false]){
  const label={textContent:''};await vm.runInNewContext(code,{document:{querySelectorAll:()=>[label]},AbortSignal,Date,
   fetch:async(url,options)=>{called={url,options};return {ok:valid,json:async()=>({version:'3.3.0',runtimeMatchesRelease:true,deployedAt:'2026-09-06T19:38:00Z'})};}});
  assert.equal(called.options.cache,'no-store');assert.equal(called.url,'/kora-build-manifest.json');
  assert.match(label.textContent,valid?/KORA 3.3.0/:/No fue posible comprobar/);
 }
});
