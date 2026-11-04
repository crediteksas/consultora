import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),domain=require('../../creditek/erp/aliados-liquidaciones-domain.js');
const sql=readFileSync('supabase/migrations/20261104174100_alo_total_accesorios_rectificacion.sql','utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('Aló incluye accesorios una sola vez en base, inicial separada y utilidad',()=>{
 const op={plataforma:'alo',montoCredito:100000,montoTotal:110000,montoBase:110000,accesorios:10000,inicial:20000,tipoEstablecimiento:'aliado',reconocida:true,incidencias:[],fecha:'2026-10-01',ejecutivo:{id:'x'}};
 const result=domain.calcularOperaciones([op],[{plataforma:'alo',tipoEstablecimiento:'aliado',estado:'aprobada',vigenteDesde:'2026-01-01',porcentaje:.77}])[0];
 assert.equal(result.valorComercial,130000);assert.equal(result.pagoNeto,80100);assert.equal(result.utilidadCreditek,29900);
 const payjoy=domain.normalizarOperacion({...op,plataforma:'payjoy',valorCredito:100000});assert.equal(payjoy.valorComercial,100000);
});
async function fixture(){const db=await PGlite.create();await db.exec(`
create role anon;create role authenticated;create role service_role;create schema kora_private;create schema liquidaciones_api_private;
create table perfiles(id uuid primary key,rol text);
create table liquidations(id uuid primary key,plataforma text,estado text,frozen_at timestamptz,total_operaciones numeric,total_pago_aliados numeric,total_pagar numeric,total_utilidad_creditek numeric,updated_at timestamptz);
create table liquidation_operations(id uuid primary key,liquidation_id uuid,plataforma text,tipo_establecimiento text,reconocida boolean,monto_credito numeric,monto_base numeric,accesorios numeric,inicial numeric,valor_comercial numeric,porcentaje_politica numeric,pagamos numeric,pago_neto_beneficiario numeric,bonos_aplicados numeric,utilidad_creditek numeric,origen_codigo text,external_id text);
create table liquidation_calculations(id uuid primary key,operation_id uuid,pagamos numeric,pago_aliado numeric,total_bonos numeric,utilidad_creditek numeric,explanation jsonb);
create table payment_orders(id uuid primary key default gen_random_uuid(),liquidation_id uuid,beneficiary_id uuid,bank_account_id uuid,valor numeric,estado text,fecha_pagada timestamptz,soporte_path text,secuencia_beneficiario int default 0,idempotency_key uuid,created_by uuid,origen_operacion text,concept text,commercial_value numeric,unique(liquidation_id,beneficiary_id,secuencia_beneficiario));
create table payment_items(id uuid default gen_random_uuid(),payment_order_id uuid,operation_id uuid,concepto text,valor numeric);
create table liquidation_adjustments(liquidation_id uuid,operation_id uuid,field_name text,old_value jsonb,new_value jsonb,motivo text,estado text,created_by uuid,approved_by uuid,approved_at timestamptz);
create table liquidation_treasury_destinations(liquidation_id uuid,total_allies numeric,total_outsourcing_commission numeric,received_from_platform numeric);
create table treasury_movements(unit text,direction text,type text,concept text,amount numeric,movement_date date,liquidation_id uuid,balance_before numeric,balance_after numeric,status text,requested_by uuid,idempotency_key text unique);
create function public.tesoreria_aplicar_saldo(text,text,numeric,text) returns jsonb language sql as $$select jsonb_build_object('before',0,'after',$3)$$;
create function public.tesoreria_generar_destinos_liquidacion(p_id uuid) returns numeric language plpgsql as $$declare received numeric:=0;o public.liquidation_operations;l public.liquidations;begin select * into o from liquidation_operations where id=p_id;select * into l from liquidations where id=o.liquidation_id;received:=received+coalesce(o.monto_credito,o.monto_base);return received;end$$;
create table audit_log(usuario uuid,accion text,tabla text,registro_id uuid,detalle jsonb);
create function public.aliados_impedir_cambio_aprobado() returns trigger language plpgsql as $$begin raise exception 'inmutable';end$$;
create function public.aliados_impedir_cambio_operacion_aprobada() returns trigger language plpgsql as $$begin raise exception 'inmutable';end$$;
create trigger guard before update on liquidations for each row execute function aliados_impedir_cambio_aprobado();
create trigger guard before update on liquidation_operations for each row execute function aliados_impedir_cambio_operacion_aprobada();
create function liquidaciones_api_private.calcular_liquidacion_sin_datos_pago(p_id uuid) returns jsonb language plpgsql as $$declare o public.liquidation_operations;v_comercial numeric;v_util numeric;v_pago numeric;v_bonus numeric;begin
select * into o from liquidation_operations where id=p_id;
v_comercial:=coalesce(o.monto_credito,o.monto_base)+case when o.plataforma='payjoy' then 0 else o.inicial end;
v_pago:=round(v_comercial*o.porcentaje_politica,2)-o.inicial;v_bonus:=o.bonos_aplicados;
v_util:=case when o.plataforma='alo' then coalesce(o.monto_credito,o.monto_base)-v_pago-v_bonus else 0 end;
return jsonb_build_object('commercial',v_comercial,'net',v_pago,'profit',v_util);
end$$;
insert into perfiles values('${id(1)}','gerencia');
insert into liquidations values('${id(2)}','alo','conciliada',now(),120000,72400,72400,27600,now());
insert into liquidation_operations values('${id(3)}','${id(2)}','alo','aliado',true,100000,110000,10000,20000,120000,.77,92400,72400,0,27600,'EXAMPLE','EXAMPLE');
insert into liquidation_calculations values('${id(4)}','${id(3)}',92400,72400,0,27600,'{}');
insert into payment_orders(id,liquidation_id,beneficiary_id,bank_account_id,valor,estado,fecha_pagada,soporte_path) values('${id(5)}','${id(2)}','${id(6)}','${id(7)}',72400,'conciliado',now(),'fictional.pdf');
insert into payment_items(payment_order_id,operation_id,concepto,valor) values('${id(5)}','${id(3)}','pago_aliado',72400);
insert into liquidation_treasury_destinations values('${id(2)}',72400,27600,100000);
`);await db.exec(sql);return db;}
test('rectifica solo diferencia, conserva pago, reintento idempotente y guardas cerradas',async()=>{const db=await fixture();try{
 const before=(await db.query('select * from payment_orders')).rows;
 const run=()=>db.query('select kora_private.rectificar_alo_accesorios($1,$2,100000,10000,7700) as result',[id(3),id(1)]);
 await assert.rejects(db.query('select kora_private.rectificar_alo_accesorios($1,$2,100000,10000,999)',[id(3),id(1)]),/Diferencia/);
 assert.equal((await db.query('select count(*) from kora_private.rectificaciones_alo_accesorios')).rows[0].count,0);
 const a=await run(),b=await run();assert.deepEqual(a.rows,b.rows);
 assert.equal((await db.query('select count(*) from treasury_movements')).rows[0].count,1);assert.equal(a.rows[0].result.diferencia,7700);assert.equal(a.rows[0].result.utilidad_corregida,29900);
 assert.deepEqual((await db.query('select * from payment_orders where id=$1',[id(5)])).rows,before);
 assert.equal((await db.query("select valor from payment_orders where estado='pendiente'")).rows[0].valor,'7700.00');
 await assert.rejects(db.exec('update liquidation_operations set monto_credito=1'),/inmutable/);
 await assert.rejects(db.exec('update liquidations set total_pagar=1'),/inmutable/);
 assert.equal((await db.query("select has_function_privilege('authenticated','kora_private.rectificar_alo_accesorios(uuid,uuid,numeric,numeric,numeric)','execute') as ok")).rows[0].ok,false);
}finally{await db.close();}});

test('motor SQL y destinos futuros incluyen total con accesorios una sola vez',async()=>{const db=await fixture();try{
 const result=(await db.query('select liquidaciones_api_private.calcular_liquidacion_sin_datos_pago($1) as value',[id(3)])).rows[0].value;
 assert.deepEqual(result,{commercial:130000,net:80100,profit:29900});
 assert.equal((await db.query('select public.tesoreria_generar_destinos_liquidacion($1) as value',[id(3)])).rows[0].value,'110000');
}finally{await db.close();}});

test('importador exclusivo Aló toma columna Monto Total y conserva principal',()=>{
 const headers=['Contrato','Tienda','Imei','CC','Estado del Contrato','Monto Total','Monto Credito','Valor Cuota Inicial','Suma Precios Accesorios'];
 const op=domain.importarAlo([headers,['TEST','Tienda ficticia','000','000','Activo',110000,100000,20000,10000]],[{nombre:'Tienda ficticia',tipo:'aliado'}]).operaciones[0];
 assert.equal(op.plataforma,'alo');assert.equal(op.montoCredito,100000);assert.equal(op.valorCredito,110000);assert.equal(op.valorComercial,130000);
});
