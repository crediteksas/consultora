import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync('supabase/migrations/20260910202627_payjoy_rectificacion_utilidad_historica.sql','utf8');
test('rectifica histórico sin pagos nuevos, mantiene cierres y restaura guardas',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema kora_private;
 create table liquidations(id uuid primary key default gen_random_uuid(),plataforma text,created_at timestamptz,estado text,frozen_at timestamptz,total_utilidad_creditek numeric,total_utilidad_tiendas numeric);
 create table liquidation_operations(id uuid primary key default gen_random_uuid(),liquidation_id uuid,operation_at timestamptz,tipo_establecimiento text,plataforma text default 'payjoy',monto_credito numeric,monto_base numeric,inicial numeric,utilidad_creditek numeric,utilidad_creditek_tienda numeric,resultado_cerrado numeric default 0,cierre_utilidad_at timestamptz);
 create table liquidation_calculations(id uuid primary key default gen_random_uuid(),liquidation_id uuid,operation_id uuid,pagamos numeric,pago_aliado numeric,total_bonos numeric,utilidad_creditek numeric,explanation jsonb default '{}');
 create table payment_orders(id int,valor numeric,soporte text);insert into payment_orders values(1,496000,'original');
 create table payment_items(id int,valor numeric);insert into payment_items values(1,496000);
 create table liquidation_bonuses(id int,valor numeric);insert into liquidation_bonuses values(1,25000);
 create table audit_log(accion text,tabla text,detalle jsonb);
 create table cuenta_corriente(id int,monto numeric);insert into cuenta_corriente values(1,999);
 create table creditos_historicos_plataforma(id int,valor numeric);insert into creditos_historicos_plataforma values(1,777);
 create table treasury_movements(id uuid default gen_random_uuid(),unit text,direction text,type text,concept text,amount numeric,movement_date date,liquidation_id uuid,balance_before numeric,balance_after numeric,status text,idempotency_key text unique);
 create table liquidation_treasury_destinations(liquidation_id uuid,total_outsourcing_commission numeric);
 create table retail_b2b_compensations(operation_id uuid,outsourcing_commission numeric,compensation_value numeric);
 create table aliados_reversiones(original_operation_id uuid);
 create table treasury_unit_balances(unit text,balance numeric);insert into treasury_unit_balances values('tercerizacion',1000);
 create function tesoreria_aplicar_saldo(text,text,numeric,text) returns jsonb language plpgsql as $$declare old_balance numeric;begin select balance into old_balance from treasury_unit_balances where unit=$1;update treasury_unit_balances set balance=balance+$3 where unit=$1;return jsonb_build_object('before',old_balance,'after',old_balance+$3);end;$$;
 create function aliados_impedir_cambio_operacion_aprobada() returns trigger language plpgsql as $$begin raise exception 'inmutable';end;$$;
 create function aliados_impedir_cambio_aprobado() returns trigger language plpgsql as $$begin raise exception 'inmutable';end;$$;
 create trigger op_guard before update on liquidation_operations for each row execute function aliados_impedir_cambio_operacion_aprobada();
 create trigger lot_guard before update on liquidations for each row execute function aliados_impedir_cambio_aprobado();
 create function kora_private.calcular_liquidacion_sin_datos_pago(uuid) returns text language sql as $$select $s$(o.plataforma='payjoy' and v.created_at >= timestamptz '2026-09-10 00:00:00-05')$s$ $$;
 create function tesoreria_generar_destinos_liquidacion(uuid) returns text language sql as $$select $s$elsif l.plataforma='alo' then commission_value:=o.utilidad_creditek; else$s$ $$;
 create function kora_private.reversion_guardar(uuid) returns text language sql as $$select $s$idempotency_key='commission-operation:'||o.id$s$ $$;
 insert into liquidations(plataforma,created_at,estado,frozen_at,total_utilidad_creditek,total_utilidad_tiendas) values('payjoy',now(),'pagada',now(),57000,0);
 insert into liquidation_operations(liquidation_id,operation_at,tipo_establecimiento,monto_credito,inicial,utilidad_creditek,resultado_cerrado,cierre_utilidad_at)
 select l.id,case when s<=18 then '2026-08-24 10:00-05'::timestamptz else '2026-09-08 10:00-05'::timestamptz end,'aliado',4000000,case when s=57 then 2669440 else 100000 end,1000,case when s<=18 then 1000 else 0 end,case when s<=18 then now() end
 from liquidations l cross join generate_series(1,57) s;
 insert into liquidation_calculations(liquidation_id,operation_id,pagamos,pago_aliado,total_bonos,utilidad_creditek) select liquidation_id,id,3998000,3998000-inicial,1000,1000 from liquidation_operations;
 insert into treasury_movements(unit,direction,type,amount,status,idempotency_key,liquidation_id) select 'tercerizacion','credit','comision_aliado',1000,'pagado','commission-operation:'||id,liquidation_id from liquidation_operations where cierre_utilidad_at is null;
 insert into liquidation_treasury_destinations select id,39000 from liquidations;`);
 const guards=(await db.query("select pg_get_functiondef('aliados_impedir_cambio_operacion_aprobada()'::regprocedure) def")).rows[0].def;
 await db.exec(sql);
 const r=(await db.query('select count(*) n,sum(diferencia) delta,sum(closed_delta) closed,sum(treasury_delta) treasury from kora_private.rectificacion_payjoy_utilidad_20260910')).rows[0];
 assert.equal(Number(r.n),57);assert.equal(Number(r.delta),8269440);assert.equal(Number(r.closed),1800000);assert.equal(Number(r.treasury),6469440);
 assert.equal((await db.query('select count(*) n from liquidation_operations where cierre_utilidad_at is not null and utilidad_creditek<>resultado_cerrado')).rows[0].n,0);
 assert.equal(Number((await db.query('select balance from treasury_unit_balances')).rows[0].balance),6470440);
 assert.equal((await db.query("select pg_get_functiondef('aliados_impedir_cambio_operacion_aprobada()'::regprocedure) def")).rows[0].def,guards);
 await assert.rejects(db.exec('update liquidation_operations set monto_credito=1'),/inmutable/);
 assert.deepEqual((await db.query('select * from payment_orders')).rows,[{id:1,valor:'496000',soporte:'original'}]);
 assert.equal((await db.query("select count(*) n from treasury_movements where idempotency_key like 'commission-operation:%' and amount=1000")).rows[0].n,39);
 assert.match((await db.query("select pg_get_functiondef('kora_private.reversion_guardar(uuid)'::regprocedure) def")).rows[0].def,/payjoy-utility-correction/);
 }finally{await db.close();}
});
