import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const U=createRequire(import.meta.url)('../../creditek/erp/tesoreria-pagos-unificados.js');
const migration=read('supabase/migrations/20260923215357_retiros_retail_desde_cajas.sql');
const oscar='6de0ad26-64af-4966-8cd9-d468880af627',maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391',storeA='00000000-0000-4000-8000-000000000001',storeB='00000000-0000-4000-8000-000000000002';
let db,date;
const sql=async(s,p=[])=>db.query(s,p);
async function user(id){await db.exec('reset role');await sql("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
const data=()=>({stores:[{store:'A',amount:'60'},{store:'B',amount:'40'}],amount:'100',bank:'Banco de prueba',account_type:'Ahorros',account:'1234567890',date,from:date,to:date,beneficiary:'Socio de prueba',document:'TEST-001',concept:'Retiro de prueba',note:'Solo local'});
const create=async(d=data(),key=randomUUID())=>(await sql('select * from public.finanzas_preparar_retiro_retail($1,$2)',[d,key])).rows[0];
const approve=async(id,amount=null)=>sql("select public.finanzas_decidir_movimiento($1,'aprobado',$2)",[id,amount]);
async function instructions(id){return (await sql('select * from public.listar_instrucciones_consignacion() x')).rows.map(r=>r.x).filter(x=>x.financial_entry_id===id);}
async function support(i,who,amount=i.valor_esperado,exists=true,paymentDate=date){
  const key=randomUUID(),path=`${i.tienda_codigo}/consignaciones/${i.id}/${key}.jpg`;
  if(exists){await db.exec('reset role');await sql("insert into storage.objects values ('soportes',$1)",[path]);}
  await user(who);return sql('select public.enviar_comprobante_retiro_retail($1,$2,$3,$4,$5)',[i.id,amount,path,paymentDate,key]);
}
const validate=(id,key=randomUUID(),decision='validado')=>sql('select public.decidir_instruccion_consignacion($1,$2,$3,$4)',[id,decision,decision==='rechazado'?'Soporte ilegible':null,key]);
async function counts(){await db.exec('reset role');return (await sql(`select (select count(*)::int from movimientos_caja_tienda) cash,(select count(*)::int from abonos) abonos,(select count(*)::int from movimientos_tesoreria_central) b2b`)).rows[0];}
before(async()=>{
 db=await PGlite.create();await db.exec(`
 create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema cron;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean,rol text,tienda_codigo text);
 insert into perfiles values('${maite}',true,'auditoria',null),('${oscar}',true,'gerencia',null),('${storeA}',true,'admin_tienda','A'),('${storeB}',true,'admin_tienda','B');
 create function public.rol_actual() returns text language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid()$$;
 create table origenes(codigo text primary key,tipo text,activo boolean);
 insert into origenes values('A','propia',true),('B','propia',true),('ALIADO','aliada',true),('OFF','propia',false);
 alter table origenes add column nombre text;
 create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
 create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
 create table cron.job(jobid bigint,jobname text,schedule text,command text);
 create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
 create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job values(1,$1,$2,$3) returning jobid$$;
 create table proveedores(id uuid primary key,nombre text,activo boolean);
 create table movimientos_caja_tienda(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,tipo text,monto numeric,soporte_path text,observacion text,autorizado_por uuid,creado_por uuid,idempotency_key uuid unique);
 create table abonos(id uuid);create table movimientos_tesoreria_central(id uuid);create table facturas_proveedor(id uuid);
 create table caja_diaria(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,estado text default 'abierta',
 apertura numeric default 0,contado_ventas numeric default 0,financiado_ventas numeric default 0,iniciales numeric default 0,
 otros_ingresos numeric default 0,gastos_efectivo numeric default 0,salidas_explicitas numeric default 0,
 efectivo_esperado numeric,efectivo_contado numeric,diferencia numeric,cerrada_por uuid,cerrada_at timestamptz,
 nota text,cierre_idempotency_key uuid,unique(tienda_codigo,fecha));
 create table ventas(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,tipo text,total numeric,anulada boolean default false);
 create table creditos(id uuid primary key default gen_random_uuid(),venta_id uuid,cuota_inicial numeric,valor_esperado_financiera numeric);
 create table venta_items(id uuid primary key default gen_random_uuid(),venta_id uuid,precio_venta numeric,cantidad numeric);
 create table conceptos_gasto(id uuid primary key,preautorizado boolean);
 create table gastos(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,monto numeric,concepto_id uuid,estado text);
 grant usage on schema public,auth,storage to authenticated;
 `);
 await db.exec(read('supabase/migrations/20260914200633_obligaciones_recurrentes_y_retiros_por_negocio.sql').replace('create extension if not exists pg_cron;',''));
 const legacy=read('creditek/erp/migrations/20260731_kora_2026_000014_destinos_consignacion.sql');
 await db.exec(legacy.slice(legacy.indexOf('create table if not exists public.instrucciones_consignacion'),legacy.indexOf('create table if not exists public.aplicaciones_consignacion_proveedor')));
 await db.exec(read('tests/fixtures/retiros-retail-production-functions.sql'));
 await db.exec('create trigger instrucciones_consignacion_snapshot_inmutable before update on instrucciones_consignacion for each row execute function proteger_snapshot_instruccion_consignacion()');
 await db.exec(read('tests/fixtures/retiros-retail-cash-cycle.sql'));
 await db.exec(migration);
 date=(await sql("select to_char(now() at time zone 'America/Bogota','YYYY-MM-DD') d")).rows[0].d;
});
beforeEach(async()=>{
 await db.exec('reset role;truncate financial_entries,instrucciones_consignacion,comprobantes_consignacion,movimientos_caja_tienda,audit_log,storage.objects,caja_arqueo_intentos,caja_cortes,caja_diaria,creditos,venta_items,ventas,gastos cascade');
 await sql('update caja_ciclo_config set fecha_inicio=$1',[date]);
 await user(oscar);await db.exec('reset role');await sql("insert into ventas(tienda_codigo,fecha,tipo,total) values('A',$1,'contado',1000),('B',$1,'contado',1000)",[date]);
 await user(maite);
});
after(async()=>db?.close());
test('flujo dos tiendas: creación/aprobación no descuentan; dos soportes descuentan exactamente 100 sin gasto ni B2B',async()=>{
 const e=await create();assert.equal(e.status,'pendiente_aprobacion');assert.equal((await instructions(e.id)).length,0);
 await user(oscar);await approve(e.id);const ins=await instructions(e.id);assert.equal(ins.length,2);assert.equal((await counts()).cash,0);
 const a=ins.find(i=>i.tienda_codigo==='A'),b=ins.find(i=>i.tienda_codigo==='B');
 await support(a,storeA);await user(maite);const key=randomUUID();await validate(a.id,key);await validate(a.id,key);
 assert.equal((await sql('select status from financial_entries where id=$1',[e.id])).rows[0].status,'aprobado');
 await support(b,storeB);await user(maite);await validate(b.id);
 assert.equal((await sql('select status from financial_entries where id=$1',[e.id])).rows[0].status,'pagado');
 assert.deepEqual(await counts(),{cash:2,abonos:0,b2b:0});assert.equal(Number((await sql('select sum(monto) n from movimientos_caja_tienda')).rows[0].n),100);
 assert.ok((await sql('select tipo,autorizado_por from movimientos_caja_tienda')).rows.every(r=>r.tipo==='retiro'&&r.autorizado_por===oscar));
});
test('reintento de creación es idempotente; reutilizar clave con otra solicitud se rechaza',async()=>{
 const d=data(),key=randomUUID(),e=await create(d,key);assert.equal((await create(d,key)).id,e.id);await assert.rejects(create({...d,beneficiary:'Otro socio'},key),/otros datos/);
});
test('Maite no aprueba; tienda no crea ni valida ni ve otra tienda',async()=>{
 const e=await create();await assert.rejects(approve(e.id),/Solo Oscar/);await user(oscar);await approve(e.id);
 await user(storeA);await assert.rejects(create(),/Solo Maite/);const ins=await instructions(e.id);assert.equal(ins.length,1);assert.equal(ins[0].tienda_codigo,'A');await assert.rejects(validate(ins[0].id),/Solo Oscar o Maythe/);
});
test('rechaza sumas inconsistentes, tiendas repetidas, inactivas y aliadas',async()=>{
 await assert.rejects(create({...data(),amount:'101'}),/suma/);
 await assert.rejects(create({...data(),stores:[{store:'A',amount:'50'},{store:'A',amount:'50'}]}),/repitas/);
 for(const store of ['OFF','ALIADO'])await assert.rejects(create({...data(),stores:[{store,amount:'100'}]}),/propia y activa/);
});
test('aprobar exige efectivo para todas las tiendas y revierte atómicamente si una no alcanza',async()=>{
 const e=await create({...data(),amount:'1060',stores:[{store:'A',amount:'60'},{store:'B',amount:'1000'}]});
 await db.exec('reset role');await sql("insert into movimientos_caja_tienda(tienda_codigo,fecha,tipo,monto) values('B',$1,'retiro',1)",[date]);await user(oscar);
 await assert.rejects(approve(e.id),/Efectivo insuficiente/);assert.equal((await instructions(e.id)).length,0);
 assert.equal((await sql('select status from financial_entries where id=$1',[e.id])).rows[0].status,'pendiente_aprobacion');
});
test('no puede cambiarse importe aprobado ni cerrarse por la API genérica de pagos',async()=>{
 const e=await create();await user(oscar);await assert.rejects(approve(e.id,99),/inmutables/);await approve(e.id);
 const path='finanzas/00000000-0000-0000-0000-000000000010.pdf';await db.exec('reset role');await sql("insert into storage.objects values('soportes',$1)",[path]);await user(maite);
 await assert.rejects(sql('select public.finanzas_registrar_pago($1,$2)',[e.id,path]),/únicamente validando/);
});
test('soporte inexistente o monto distinto no descuenta caja',async()=>{
 const e=await create();await user(oscar);await approve(e.id);const ins=await instructions(e.id);
 await assert.rejects(support(ins[0],ins[0].tienda_codigo==='A'?storeA:storeB,ins[0].valor_esperado,false),/soporte no está cargado/);
 await support(ins[1],ins[1].tienda_codigo==='A'?storeA:storeB,1);await user(maite);await assert.rejects(validate(ins[1].id),/no coincide/);assert.equal((await counts()).cash,0);
});
test('rechazo permite reenviar soporte sin duplicar ni perder la reserva del socio',async()=>{
 const e=await create();await user(oscar);await approve(e.id);const ins=await instructions(e.id),a=ins.find(i=>i.tienda_codigo==='A');
 await support(a,storeA);await user(maite);await validate(a.id,randomUUID(),'rechazado');
 const e2=await create({...data(),amount:'950',stores:[{store:'A',amount:'950'}]});await user(oscar);await assert.rejects(approve(e2.id),/Efectivo insuficiente/);
 await support(a,storeA);await user(maite);await validate(a.id);assert.equal((await counts()).cash,1);
});
test('anónimo sin acceso; no edición directa; nuevas funciones públicas son invoker',async()=>{
 await user(storeA);await assert.rejects(sql("update financial_entries set status='pagado'"),/permission denied/);
 await db.exec('reset role');assert.equal((await sql("select has_function_privilege('anon','public.finanzas_preparar_retiro_retail(jsonb,uuid)','execute') x")).rows[0].x,false);
 assert.equal((await sql("select prosecdef from pg_proc where oid='public.finanzas_preparar_retiro_retail(jsonb,uuid)'::regprocedure")).rows[0].prosecdef,false);
 await user('');await assert.rejects(create(),/Solo Maite/);
});
test('instrucciones tradicionales respetan reservas de socios, incluso con soporte rechazado',async()=>{
 const e=await create();await user(oscar);await approve(e.id);const a=(await instructions(e.id)).find(i=>i.tienda_codigo==='A');
 await support(a,storeA);await user(maite);await validate(a.id,randomUUID(),'rechazado');
 await assert.rejects(sql("select crear_instruccion_consignacion('A',$1,'Banco prueba','1234567890',950,'OSCAR')",[date]),/supera el efectivo/);
 const r=await sql("select crear_instruccion_consignacion('A',$1,'Banco prueba','1234567890',900,'OSCAR') x",[date]);assert.equal(r.rows[0].x.ok,true);
});
test('retiro antiguo sin distribución no se aprueba y un duplicado con otra clave no descuenta dos veces',async()=>{
 const old=(await sql("select * from finanzas_registrar_movimiento('retiro_utilidad','retail',$1,'retiro','Prueba antigua','Socio prueba',null,null,10,$1,$1,null)",[date])).rows[0];
 await user(oscar);await assert.rejects(approve(old.id),/Falta distribuir/);
 await user(maite);const e=await create();await user(oscar);await approve(e.id);const a=(await instructions(e.id)).find(i=>i.tienda_codigo==='A');
 await support(a,storeA);await user(maite);await validate(a.id);await assert.rejects(validate(a.id),/no está pendiente/);assert.equal((await counts()).cash,1);
});
test('una tienda no puede presentar soporte por otra, y el destino del socio es inmutable',async()=>{
 const e=await create();await user(oscar);await approve(e.id);const a=(await instructions(e.id)).find(i=>i.tienda_codigo==='A');
 await assert.rejects(support(a,storeB),/No autorizado/);
 await db.exec('reset role');await assert.rejects(sql("update instrucciones_consignacion set beneficiario_socio='Otro socio' where id=$1",[a.id]),/inmutable/);
});
test('ninguna instrucción de socio carece de beneficiario y enlace de retiro',async()=>{
 await db.exec('reset role');await assert.rejects(sql("insert into instrucciones_consignacion(tienda_codigo,fecha,banco,numero_cuenta,valor_esperado,tipo_destino,creada_por) values('A',$1,'Banco','123456',10,'SOCIO',$2)",[date,oscar]),/check constraint/);
});
test('el formulario conecta Retail a la API protegida y no muestra pago genérico para retiros Retail',()=>{
 const app=read('creditek/erp/finanzas-programadas-app.js');assert.match(app,/finanzas_preparar_retiro_retail/);assert.match(app,/data-retail-store/);assert.match(app,/retailWithdrawal\(row\)/);
 assert.match(read('creditek/erp/cuenta-corriente.html'),/beneficiario_socio/);
 assert.match(read('creditek/erp/tesoreria-pagos-unificados.js'),/Validar soportes de tiendas/);
});
test('caja real integra el retiro una sola vez y conserva un cierre consistente',async()=>{
 const e=await create();await user(oscar);await approve(e.id);const a=(await instructions(e.id)).find(i=>i.tienda_codigo==='A');
 await support(a,storeA);await user(maite);const key=randomUUID();await validate(a.id,key);await validate(a.id,key);
 const balance=(await sql("select calcular_efectivo_esperado_tienda('A',$1) b",[date])).rows[0].b;
 assert.equal(balance.esperado,940);
 await user(storeA);const closure=(await sql("select validar_arqueo_caja('A',$1,940,$2,null,false) c",[date,randomUUID()])).rows[0].c;
 assert.equal(closure.ok,true);await db.exec('reset role');
 assert.equal(Number((await sql("select efectivo_contado from caja_diaria where tienda_codigo='A' and fecha=$1",[date])).rows[0].efectivo_contado),940);
});
test('el cierre exige validar el soporte pendiente; una caja ya cerrada no admite salidas retroactivas',async()=>{
 const e=await create();await user(oscar);await approve(e.id);const a=(await instructions(e.id)).find(i=>i.tienda_codigo==='A');
 await support(a,storeA);
 await assert.rejects(sql("select validar_arqueo_caja('A',$1,1000,$2,null,false)",[date,randomUUID()]),/soporte pendiente/);
 await user(maite);await validate(a.id,randomUUID(),'rechazado');
 await user(storeA);await assert.rejects(sql("select validar_arqueo_caja('A',$1,1000,$2,null,false)",[date,randomUUID()]),/soporte pendiente/);
 await user(maite);const b=(await instructions(e.id)).find(i=>i.tienda_codigo==='B');
 await user(storeB);await sql("select validar_arqueo_caja('B',$1,1000,$2,null,false)",[date,randomUUID()]);
 await assert.rejects(support(b,storeB),/arqueo validado/);
 await user(maite);
 assert.equal((await instructions(e.id)).find(i=>i.id===a.id).estado,'rechazado');
 assert.equal((await counts()).cash,0);
});
test('pago hoy de instrucción de ayer deja intacto el arqueo de ayer y descuenta hoy',async()=>{
 const e=await create();await user(oscar);await approve(e.id);let a=(await instructions(e.id)).find(i=>i.tienda_codigo==='A');
 // Fixture histórico aislado: no modifica ni reescribe datos de producción.
 await db.exec('reset role;alter table instrucciones_consignacion disable trigger instrucciones_consignacion_snapshot_inmutable');
 await sql("update instrucciones_consignacion set fecha=$1::date-1 where id=$2",[date,a.id]);
 await db.exec('alter table instrucciones_consignacion enable trigger instrucciones_consignacion_snapshot_inmutable');
 await sql('update caja_ciclo_config set fecha_inicio=$1::date-1',[date]);
 await user(storeA);await sql("select validar_arqueo_caja('A',$1::date-1,0,$2,null,false)",[date,randomUUID()]);
 await support(a,storeA);await user(maite);await validate(a.id);
 await db.exec('reset role');
 assert.equal((await sql('select fecha::text from movimientos_caja_tienda')).rows[0].fecha,date);
 assert.equal(Number((await sql("select efectivo_contado from caja_diaria where tienda_codigo='A' and fecha=$1::date-1",[date])).rows[0].efectivo_contado),0);
 await user(storeA);assert.equal((await sql("select calcular_efectivo_esperado_tienda('A',$1) b",[date])).rows[0].b.esperado,940);
});
test('fecha futura o anterior a instrucción no genera comprobante ni movimiento',async()=>{
 const e=await create();await user(oscar);await approve(e.id);const a=(await instructions(e.id)).find(i=>i.tienda_codigo==='A');
 const bounds=(await sql("select ($1::date-1)::text ayer,($1::date+1)::text manana",[date])).rows[0];
 for(const invalid of [null,bounds.ayer,bounds.manana])await assert.rejects(support(a,storeA,a.valor_esperado,true,invalid),/fecha real/);
 await user(maite);
 assert.equal((await instructions(e.id)).find(i=>i.id===a.id).estado,'pendiente');
 assert.equal((await counts()).cash,0);
});
test('Tesorería excluye retiros Retail del giro central y rechaza subir otro soporte',async()=>{
 const retail={id:'retail',entry_type:'retiro_utilidad',business_unit:'retail',status:'aprobado',approved_by:oscar,approved_at:'2026-09-23T12:00:00Z'};
 const other={...retail,id:'b2b',business_unit:'b2b'};
 assert.deepEqual(U.reportRows([],[retail,other],[],()=>({ready:true})).map(r=>r.id),['b2b']);
 let writes=0;const sb={from:()=>({select:()=>({eq:()=>({single:async()=>({data:retail})})})}),rpc:()=>{writes++;},storage:{from:()=>{writes++;}}};
 await assert.rejects(U.createRecorder(sb).record('retail',{}),/desde las tiendas/);assert.equal(writes,0);
});
