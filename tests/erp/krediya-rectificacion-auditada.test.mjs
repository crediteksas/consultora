import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
test('rectifica 29 créditos sin borrar pagos ni soportes; ajuste auditable e idempotente',async()=>{
 const db=await PGlite.create();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema kora_private;
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
 const fixture=await read('./fixtures/calculo-antes-tesoreria.sql');
 await db.exec(fixture.slice(0,fixture.indexOf('CREATE OR REPLACE FUNCTION')));
 await db.exec(`alter table liquidations add primary key(id);
 create table treasury_movements(id uuid default gen_random_uuid(),liquidation_id uuid,valor numeric);
 create table liquidation_treasury_destinations(id uuid default gen_random_uuid(),liquidation_id uuid,total_executives numeric);
 create table liquidation_adjustments(id uuid default gen_random_uuid(),liquidation_id uuid,field_name text,old_value jsonb,new_value jsonb,motivo text,estado text,approved_at timestamptz);
 insert into liquidations(plataforma,fecha_corte,total_bonos,total_pago_aliados,estado) values('krediya','2026-08-30',1460000,10028667,'aprobada');
 insert into liquidation_operations(liquidation_id,tipo_establecimiento,reconocida,monto_credito,valor_comercial,pagamos,policy_snapshot)
 select l.id,case when n<=22 then 'aliado' else 'propia' end,true,900000,1000000,750000,
 '{"krediya_v2":{"motor":"krediya_v2","pvp_liquidado":1000000,"pvp_guardado":1000000,"pagamos":750000,"tasa_gasto_financiero":0.004,"provision_porcentaje":0.28}}' from liquidations l cross join generate_series(1,29)n;
 insert into liquidation_calculations(liquidation_id,operation_id) select liquidation_id,id from liquidation_operations;
 insert into liquidation_beneficiaries(nombre,tipo) values('Alexander','ejecutivo'),('Luis','ejecutivo'),('Oscar','ejecutivo'),('Mayte','ejecutivo');
 insert into liquidation_bonuses(liquidation_id,operation_id,beneficiary_id,tipo_bono,valor,estado)
 select o.liquidation_id,o.id,b.id,case b.nombre when 'Luis' then 'automatico_override' when 'Alexander' then 'automatico_ejecutivo' when 'Oscar' then 'krediya_operacion' else 'krediya_gestion' end,
 case b.nombre when 'Luis' then 10000 when 'Alexander' then 30000 when 'Oscar' then 15000 else 5000 end,'aprobado'
 from liquidation_operations o cross join liquidation_beneficiaries b where o.tipo_establecimiento='aliado' or b.nombre in('Oscar','Mayte');
 insert into payment_orders(liquidation_id,beneficiary_id,valor,estado,soporte_path,bank_snapshot)
 select b.liquidation_id,b.beneficiary_id,sum(b.valor),case when p.nombre='Oscar' then 'pendiente' else 'pagado' end,'soporte-original','{"cuenta":"original"}'
 from liquidation_bonuses b join liquidation_beneficiaries p on p.id=b.beneficiary_id group by 1,2,p.nombre;
 insert into payment_items(payment_order_id,operation_id,bonus_id,valor) select p.id,b.operation_id,b.id,b.valor from liquidation_bonuses b join payment_orders p on p.beneficiary_id=b.beneficiary_id;
 insert into treasury_movements(liquidation_id,valor) select id,-1025000 from liquidations;
 insert into liquidation_treasury_destinations(liquidation_id,total_executives) select id,1460000 from liquidations;
 update liquidations set frozen_at=now(),approved_at=now();`);
 await db.exec(await read('./fixtures/bonos-diferidos-guards.sql'));
 const migration=await read('../../supabase/migrations/20260908151037_rectificacion_krediya_bonos_auditada.sql');
 await db.exec(migration);
 const id=(await db.query('select id from liquidations')).rows[0].id;
 const call=async()=>(await db.query('select kora_private.rectificar_krediya_bonos_20260908($1) result',[id])).rows[0].result;
 const result=await call();
 assert.equal(result.bonos_correctos,1100000);
 assert.equal(result.pendiente_pago,330000);
 assert.equal(result.exceso_pagado_por_validar,255000);
 assert.equal(result.total_pagar_correcto,11128667);
 assert.deepEqual(await call(),result);
 assert.equal((await db.query("select count(*)::int n from liquidation_bonuses where estado='aprobado'")).rows[0].n,66);
 assert.equal((await db.query("select sum(valor)::int n from liquidation_bonuses where estado='anulado'")).rows[0].n,360000);
 assert.equal((await db.query('select sum(valor)::int n from treasury_movements')).rows[0].n,-1025000);
 assert.equal((await db.query('select count(*)::int n from liquidation_adjustments')).rows[0].n,1);
 assert.equal((await db.query('select permit_transaction from kora_private.rectificaciones_krediya')).rows[0].permit_transaction,null);
 await assert.rejects(db.exec('update liquidation_operations set pagamos=1'),/inmutable/);
 await assert.rejects(db.exec('update liquidations set total_bonos=1'),/inmutable/);
 assert.equal((await db.query("select has_table_privilege('authenticated','kora_private.rectificaciones_krediya','INSERT') ok")).rows[0].ok,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','kora_private.rectificar_krediya_bonos_20260908(uuid)','EXECUTE') ok")).rows[0].ok,false);
 } finally {await db.close();}
});
