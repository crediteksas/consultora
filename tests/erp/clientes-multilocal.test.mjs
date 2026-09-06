import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {directory}=require('../../creditek/erp/tesoreria-clientes.js');
const {missingBeneficiaries}=require('../../creditek/erp/krediya-review-ui.js');
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
let db,holder,firstClient;
before(async()=>{
 db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema krediya_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select coalesce(current_setting('test.capability',true),'true')='true'$$;
 create table origenes(codigo text primary key,nombre text,tipo text,ciudad text,activo boolean,ejecutivo_id uuid);
 create table aliados(id uuid primary key default gen_random_uuid(),nombre_comercial text,razon_social text,identificacion text,propietario text,
 ejecutivo_id uuid,ciudad_principal text,estado text default 'activo',estado_asociacion text,created_at timestamptz default now(),updated_at timestamptz,created_by uuid,updated_by uuid);
 create table aliados_sedes(id uuid primary key default gen_random_uuid(),aliado_id uuid references aliados,origen_codigo text unique references origenes,nombre text,ciudad text,direccion text,estado_asociacion text,updated_at timestamptz,updated_by uuid);
 create table aliados_documentos(id uuid default gen_random_uuid(),aliado_id uuid,sede_id uuid);
 create table aliados_plataformas(id uuid default gen_random_uuid(),aliado_id uuid,sede_id uuid);
 create table liquidation_beneficiaries(id uuid primary key default gen_random_uuid(),tipo text,nombre text,identificacion text,origen_codigo text,activo boolean default true,created_at timestamptz default now(),unique(tipo,identificacion));
 create table beneficiary_bank_accounts(id uuid primary key default gen_random_uuid(),beneficiary_id uuid references liquidation_beneficiaries,banco text,tipo_cuenta text,numero_cuenta text,validada boolean,validada_por uuid,validada_at timestamptz,activo boolean,created_at timestamptz default now(),unique(beneficiary_id,numero_cuenta));
 create table liquidations(id uuid primary key default gen_random_uuid(),frozen_at timestamptz);
 create table payment_orders(id uuid primary key default gen_random_uuid(),beneficiary_id uuid,bank_account_id uuid,bank_snapshot jsonb,liquidation_id uuid,estado text,authorized_by uuid);
 create table audit_log(id bigint generated always as identity,usuario text,accion text,tabla text,registro_id text,detalle jsonb);
 insert into origenes select 'local-'||n,'Local '||n,'aliado','Ciudad '||n,true,null from generate_series(1,8) n;
 insert into origenes values('retail','Propia','propia',null,true,null);
 select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
 -- Dobles acotados: verifican la sustitución exacta del lookup de cada motor.
 create function public.aliados_calcular_liquidacion(p_id uuid) returns uuid language plpgsql as $$
 declare b liquidation_beneficiaries%rowtype;o record;begin
 select 'aliado' tipo_establecimiento,'local-2' origen_codigo into o;
 select * into b from public.liquidation_beneficiaries where tipo=case when o.tipo_establecimiento='aliado' then 'aliado' else 'otro' end and origen_codigo=o.origen_codigo and activo limit 1;
 return b.id;end $$;
 create function krediya_private.calcular_y_enviar_aprobacion(p_id uuid) returns uuid language plpgsql as $$
 declare b uuid;o record;begin
 select 'local-7' origen_codigo into o;
 select id into b from public.liquidation_beneficiaries where tipo='aliado' and origen_codigo=o.origen_codigo and activo order by created_at desc limit 1;
 return b;end $$;
 `);
 await db.exec(await read('supabase/migrations/20260906154913_tesoreria_clientes_cuentas.sql'));
 await db.exec(await read('tests/erp/fixtures/completar-pagos-pre-unificacion.sql'));
 await db.exec(await read('supabase/migrations/20260906205155_clientes_unificados_y_pagos_seguros.sql'));
 const r=await db.query("select tesoreria_guardar_cliente_cuenta('local-1',null,'Titular compartido','99912345','Banco prueba','ahorros','001234567',true) r");holder=r.rows[0].r.beneficiary_id;
 await db.exec(await read('supabase/migrations/20260906213857_clientes_multilocal_cuenta_compartida.sql'));
 firstClient=(await db.query("select aliado_id from aliados_sedes where origen_codigo='local-1'")).rows[0].aliado_id;
});
after(async()=>db?.close());
test('siete locales pueden compartir titular sin trasladarlo ni duplicar cuenta',async()=>{
 for(let n=2;n<=7;n++)await db.query('select tesoreria_guardar_cliente_cuenta($1,null,$2,$3,$4,$5,$6,true)',['local-'+n,'Titular compartido','99912345','Banco prueba','ahorros','001234567']);
 assert.equal((await db.query('select count(*)::int n from liquidation_beneficiaries')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from beneficiary_bank_accounts')).rows[0].n,1);
 assert.equal((await db.query('select origen_codigo from liquidation_beneficiaries')).rows[0].origen_codigo,'local-1');
 assert.equal((await db.query("select count(*)::int n from origenes where aliados_beneficiario_de_comercio(codigo)=$1",[holder])).rows[0].n,7);
});
test('relación explícita une locales en un cliente; mantiene ciudades, identidad e historial',async()=>{
 const before=(await db.query('select * from origenes order by codigo')).rows;
 for(let n=2;n<=7;n++){
  const code='local-'+n,old=(await db.query('select aliado_id from aliados_sedes where origen_codigo=$1',[code])).rows[0].aliado_id;
  await db.query('select tesoreria_vincular_local_cliente($1,$2,$3)',[code,old,firstClient]);
 }
 assert.equal((await db.query('select count(*)::int n from aliados_sedes where aliado_id=$1',[firstClient])).rows[0].n,7);
 assert.deepEqual((await db.query('select * from origenes order by codigo')).rows,before);
 assert.equal((await db.query('select count(*)::int n from aliados')).rows[0].n,8,'no borra fichas anteriores');
 assert.equal((await db.query("select count(*)::int n from audit_log where accion='cliente_local_relacionado'")).rows[0].n,6);
 assert.equal((await db.query("select aliados_beneficiario_de_comercio('local-8') h")).rows[0].h,null);
 assert.equal((await db.query("select aliados_beneficiario_de_comercio('retail') h")).rows[0].h,null);
});
test('los lookups de Krediya y demás plataformas resuelven el mismo destinatario',async()=>{
 assert.equal((await db.query('select aliados_calcular_liquidacion(null) h')).rows[0].h,holder);
 assert.equal((await db.query('select krediya_private.calcular_y_enviar_aprobacion(null) h')).rows[0].h,holder);
 const f=(await db.query("select pg_get_functiondef('aliados_completar_pagos_beneficiario(uuid)'::regprocedure) d")).rows[0].d;
 assert.match(f,/aliados_beneficiario_de_comercio\(op.origen_codigo\)=beneficiary.id/);
 assert.match(f,/estado='pendiente' and authorized_by is null/);
});
test('actualizar cuenta compartida no modifica órdenes ya autorizadas',async()=>{
 const bank=(await db.query('select id from beneficiary_bank_accounts')).rows[0].id;
 await db.query("insert into payment_orders(beneficiary_id,bank_account_id,bank_snapshot,estado,authorized_by) values($1,$2,$3,'programado',auth.uid())",[holder,bank,{bank:'Banco prueba',account_number:'001234567'}]);
 const before=(await db.query('select * from payment_orders')).rows;
 await db.query("select tesoreria_guardar_cliente_cuenta('local-7',$1,'Titular compartido','99912345','Otro banco','corriente','007654321',true)",[holder]);
 assert.deepEqual((await db.query('select * from payment_orders')).rows,before);
 assert.equal((await db.query('select count(*)::int n from beneficiary_bank_accounts where activo')).rows[0].n,1);
 await assert.rejects(()=>db.exec("update payment_orders set bank_snapshot='{}'"),/ya fue autorizada/);
});
test('rechaza cambios concurrentes, identidad distinta y traslado con datos propios',async()=>{
 await assert.rejects(()=>db.query("select tesoreria_guardar_cliente_cuenta('local-7',null,'Titular compartido','99912345','Banco','ahorros','123456',true)"),/relación.*cambió/);
 await assert.rejects(()=>db.query("select tesoreria_guardar_cliente_cuenta('local-7',$1,'Persona distinta','99912345','Banco','ahorros','123456',true)",[holder]),/pertenece al titular/);
 const old=(await db.query("select aliado_id from aliados_sedes where origen_codigo='local-8'")).rows[0].aliado_id;
 await db.query("update aliados set telefono='3001234567' where id=$1",[old]);
 await assert.rejects(()=>db.query("select tesoreria_vincular_local_cliente('local-8',$1,$2)",[old,firstClient]),/información propia/);
 assert.equal((await db.query("select aliado_id from aliados_sedes where origen_codigo='local-8'")).rows[0].aliado_id,old);
});
test('sin capacidad ni anónimo pueden relacionar locales o cambiar cuentas',async()=>{
 await db.exec("select set_config('test.capability','false',false)");
 await assert.rejects(()=>db.query("select tesoreria_vincular_local_cliente('local-1',$1,$1)",[firstClient]),/No autorizado/);
 await assert.rejects(()=>db.query("select tesoreria_guardar_cliente_cuenta('local-7',$1,'Titular compartido','99912345','Banco','ahorros','123456',true)",[holder]),/No autorizado/);
 assert.equal((await db.query("select has_function_privilege('anon','tesoreria_vincular_local_cliente(text,uuid,uuid)','execute') p")).rows[0].p,false);
});
test('directorio y validación Krediya reconocen todos los locales e inactivo falla cerrado',()=>{
 const origins=Array.from({length:7},(_,i)=>({codigo:'local-'+i,nombre:'Local '+i,tipo:'aliado',activo:true}));
 const clients=[{id:'c',payment_beneficiary_id:'h'}],sites=origins.map(o=>({origen_codigo:o.codigo,aliado_id:'c'}));
 const holders=[{id:'h',tipo:'aliado',activo:true,origen_codigo:'local-0'}];
 const accounts=[{beneficiary_id:'h',activo:true,validada:true,numero_cuenta:'001234567'}];
 assert.ok(directory(origins,holders,accounts,sites,clients).every(r=>r.status==='completo'));
 const ops=origins.map(o=>({origen_codigo:o.codigo,establishment_name:o.nombre,tipo_establecimiento:'aliado',reconocida:true}));
 assert.equal(missingBeneficiaries(ops,holders,sites,clients).length,0);
  assert.equal(missingBeneficiaries(ops,[{...holders[0],activo:false}],sites,clients).length,7);
  const noHolder=[{id:'c',payment_beneficiary_id:null}];
  assert.equal(missingBeneficiaries(ops,holders,sites,noHolder).length,7,'no vuelve al antiguo titular del local');
  assert.ok(directory(origins,holders,accounts,sites,noHolder).every(r=>r.status==='sin_titular'));
});
