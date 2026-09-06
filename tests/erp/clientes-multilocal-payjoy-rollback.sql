-- Integración del motor diario PayJoy, dos locales y una sola cuenta.
-- Datos sintéticos; no toca lotes reales, no aprueba ni paga. Ejecutar completo.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
set local plpgsql.check_asserts=on;
do $$
declare prefix text:='PJMULTI'||replace(gen_random_uuid()::text,'-','');
 reviewer uuid; executive uuid:=gen_random_uuid(); holder uuid:=gen_random_uuid(); bank_id uuid;
 batch_id uuid:=gen_random_uuid(); v_client uuid; policy_count integer; percentage numeric;
 expected_net numeric; v_batch public.liquidations%rowtype; before_real text; after_real text;
begin
 select p.id into reviewer from public.perfiles p join public.aliados_operadores o on o.perfil_id=p.id
 where p.activo and p.rol='auditoria' and o.activo and o.capacidad='revisor' limit 1;
 assert reviewer is not null,'Falta revisor de prueba';
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);
 select md5(coalesce(jsonb_agg(to_jsonb(l) order by l.id)::text,'')) into before_real from public.liquidations l;
 select count(*),min(porcentaje) into policy_count,percentage from public.settlement_policy_versions
 where plataforma='payjoy' and tipo_establecimiento='aliado' and estado='aprobada'
 and vigente_desde<=date '2026-09-06' and (vigente_hasta is null or vigente_hasta>=date '2026-09-06');
 assert policy_count=1,'Se requiere política PayJoy inequívoca';
 insert into public.ejecutivos(id,nombre,activo,esquema_comision) values(executive,prefix||' EJECUTIVO',true,'{"tipo":"fijo","valor":30000}');
 insert into public.origenes(codigo,nombre,tipo,activo,ejecutivo_id) values
 (prefix||'A',prefix||' LOCAL A','aliado',true,executive),(prefix||'B',prefix||' LOCAL B','aliado',true,executive);
 insert into public.liquidation_beneficiaries(id,tipo,identificacion,nombre,origen_codigo,activo)
 values(holder,'aliado',prefix,prefix||' TITULAR',prefix||'A',true);
 insert into public.beneficiary_bank_accounts(beneficiary_id,banco,tipo_cuenta,numero_cuenta,validada,validada_por,validada_at,activo)
 values(holder,'BANCO SINTETICO','ahorros','0000000000',true,reviewer,now(),true) returning id into bank_id;
 select aliado_id into v_client from public.aliados_sedes where origen_codigo=prefix||'A';
 update public.aliados set payment_beneficiary_id=holder where id=v_client;
 perform public.tesoreria_vincular_local_cliente(prefix||'B',(select aliado_id from public.aliados_sedes where origen_codigo=prefix||'B'),v_client);
 insert into public.liquidations(id,plataforma,fecha_corte,estado,idempotency_key)
 values(batch_id,'payjoy','2026-09-06','validada',gen_random_uuid());
 insert into public.liquidation_operations(liquidation_id,plataforma,source_key,external_id,operation_at,
 establishment_name,origen_codigo,tipo_establecimiento,ejecutivo_id,cliente_nombre,imei,referencia,
 monto_credito,monto_base,inicial,reconocida,normalized_data) values
 (batch_id,'payjoy',gen_random_uuid()::text,prefix||'1','2026-09-06 15:00Z',prefix||' LOCAL A',prefix||'A','aliado',executive,'SINTETICO A','000000000090001','REFERENCIA SINTETICA',800000,800000,100000,true,'{}'),
 (batch_id,'payjoy',gen_random_uuid()::text,prefix||'2','2026-09-06 15:01Z',prefix||' LOCAL B',prefix||'B','aliado',executive,'SINTETICO B','000000000090002','REFERENCIA SINTETICA',800000,800000,100000,true,'{}');
 v_batch:=public.aliados_calcular_liquidacion(batch_id);
 expected_net:=2*(round(800000*percentage,2)-100000);
 assert v_batch.estado='calculada' and v_batch.approved_at is null and v_batch.frozen_at is null,'Calcula sin aprobar';
 assert (select count(*)=2 from public.liquidation_calculations where liquidation_id=batch_id),'Calculó ambos locales';
 assert (select count(*)=1 from public.payment_orders where liquidation_id=batch_id and beneficiary_id=holder and bank_account_id=bank_id and valor=expected_net and estado='pendiente' and authorized_at is null),'Una orden agrupada PayJoy con cuenta compartida y sin autorización';
 assert (select count(*)=2 from public.payment_items where payment_order_id in(select id from public.payment_orders where liquidation_id=batch_id)),'Desglose de dos locales conservado';
 select md5(coalesce(jsonb_agg(to_jsonb(l) order by l.id)::text,'')) into after_real from public.liquidations l where l.id<>batch_id;
 assert before_real=after_real,'Lotes reales intactos';
end $$;
rollback;
select 'PASS: PayJoy diario, 2 locales, 1 cuenta y 1 orden agrupada; lotes reales intactos; ROLLBACK completo' resultado;

