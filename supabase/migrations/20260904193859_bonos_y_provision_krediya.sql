-- Every Krediya credit has two independent bonuses and a 28% provision.
-- The source workbook remains immutable; KORA records the calculated values.
alter table public.krediya_bonus_rules add column if not exists concepto text;
alter table public.krediya_bonus_rules add column if not exists beneficiary_id uuid references public.liquidation_beneficiaries(id);
drop index if exists public.krediya_bonus_rules_active_key;
create unique index if not exists krediya_bonus_rules_active_concept_key
 on public.krediya_bonus_rules(tipo_establecimiento,concepto)
 where activo and vigente_hasta is null;

delete from public.krediya_bonus_rules where concepto is null;

insert into public.liquidation_beneficiaries(tipo,identificacion,nombre,activo)
values('ejecutivo','GERENCIA-OSCAR-PACHECO','Oscar Pacheco',true)
on conflict(tipo,identificacion) do update set nombre=excluded.nombre,activo=true;

insert into public.krediya_bonus_rules(tipo_establecimiento,concepto,beneficiary_id,valor,vigente_desde)
select t.tipo,'gestion_krediya',b.id,5000,'2026-09-01'
from (values('propia'),('aliado')) t(tipo)
cross join lateral (
 select id from public.liquidation_beneficiaries
 where tipo='ejecutivo' and lower(unaccent(nombre)) like 'maythe reyes%' and activo
 order by created_at limit 1
) b
on conflict do nothing;

insert into public.krediya_bonus_rules(tipo_establecimiento,concepto,beneficiary_id,valor,vigente_desde)
select t.tipo,'operacion',b.id,15000,'2026-09-01'
from (values('propia'),('aliado')) t(tipo)
cross join lateral (
 select id from public.liquidation_beneficiaries
 where tipo='ejecutivo' and identificacion='GERENCIA-OSCAR-PACHECO' and activo
 order by created_at limit 1
) b
on conflict do nothing;

alter function public.aliados_calcular_liquidacion_krediya(uuid)
 rename to aliados_calcular_liquidacion_krediya_original_v1;

create or replace function public.aliados_calcular_liquidacion_krediya(p_id uuid)
returns public.liquidations
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 o public.liquidation_operations%rowtype;
 pr public.krediya_price_rules%rowtype;
 br record;
 v_bono numeric;
 v_result public.liquidations%rowtype;
 v_bruta numeric;
 v_provision numeric;
begin
 if not public.tiene_capacidad_aliados('revisor') then
  raise exception 'No autorizado para calcular';
 end if;

 delete from public.liquidation_bonuses
 where liquidation_id=p_id and tipo_bono in('krediya_gestion','krediya_operacion');

 for o in
  select * from public.liquidation_operations
  where liquidation_id=p_id and plataforma='krediya' and reconocida
  order by operation_at,id
  for update
 loop
  select coalesce(sum(valor),0) into v_bono
  from public.krediya_bonus_rules
  where tipo_establecimiento=o.tipo_establecimiento and activo
   and vigente_desde<=o.operation_at::date
   and (vigente_hasta is null or vigente_hasta>=o.operation_at::date);

  if v_bono<>20000 then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
   values(p_id,o.id,'krediya_bono_sin_configurar','Krediya requiere bonos vigentes por $20.000: $5.000 para Mayte y $15.000 por Operación para Oscar Pacheco')
   on conflict do nothing;
   continue;
  end if;

  select * into pr from public.krediya_price_rules
  where referencia_clave=lower(btrim(coalesce(o.modelo,o.referencia,''))) and activo
   and vigente_desde<=o.operation_at::date
   and (vigente_hasta is null or vigente_hasta>=o.operation_at::date)
  order by vigente_desde desc limit 1;
  if not found then
   continue;
  end if;

  for br in
   select * from public.krediya_bonus_rules
   where tipo_establecimiento=o.tipo_establecimiento and activo
    and vigente_desde<=o.operation_at::date
    and (vigente_hasta is null or vigente_hasta>=o.operation_at::date)
  loop
   insert into public.liquidation_bonuses(
    liquidation_id,operation_id,beneficiary_id,tipo_bono,rule_snapshot,valor,motivo,estado,idempotency_key
   ) values(
    p_id,o.id,br.beneficiary_id,
    case when br.concepto='operacion' then 'krediya_operacion' else 'krediya_gestion' end,
    jsonb_build_object('regla_id',br.id,'concepto',br.concepto,'vigente_desde',br.vigente_desde),
    br.valor,
    case when br.concepto='operacion' then 'Bono Operación Krediya — Oscar Pacheco' else 'Gestión de crédito Krediya — Mayte Reyes' end,
    'aprobado',gen_random_uuid()
   );
  end loop;

  update public.liquidation_operations
  set normalized_data=coalesce(normalized_data,'{}'::jsonb)||jsonb_build_object(
   'pagamosArchivo',pr.pagamos,
   'pagoNetoArchivo',pr.pagamos-coalesce(o.inicial,0),
   'bonoArchivo',v_bono,
   'utilidadArchivo',coalesce(o.monto_credito,o.monto_base)-(pr.pagamos-coalesce(o.inicial,0))-v_bono,
   'origenValoresLiquidacion','tarifario_kora'
  )
  where id=o.id;
 end loop;

 v_result:=public.aliados_calcular_liquidacion_krediya_original_v1(p_id);
 if v_result.estado<>'calculada' then return v_result; end if;

 for o in select * from public.liquidation_operations where liquidation_id=p_id and plataforma='krediya' and reconocida for update loop
  v_bruta:=coalesce(o.utilidad_creditek,0);
  v_provision:=round(v_bruta*0.28,2);
  update public.liquidation_operations
   set utilidad_creditek=round(v_bruta-v_provision,2),
       utilidad_creditek_tienda=case when tipo_establecimiento='propia' then round(v_bruta-v_provision,2) else utilidad_creditek_tienda end,
       policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('utilidad_bruta',v_bruta,'provision_porcentaje',0.28,'provision',v_provision,'utilidad_neta',round(v_bruta-v_provision,2))
   where id=o.id;
  update public.liquidation_calculations
   set utilidad_creditek=round(v_bruta-v_provision,2),
       policy_snapshot=coalesce(policy_snapshot,'{}'::jsonb)||jsonb_build_object('utilidad_bruta',v_bruta,'provision_porcentaje',0.28,'provision',v_provision),
       explanation=coalesce(explanation,'{}'::jsonb)||jsonb_build_object('bono_mayte',5000,'bono_operacion_oscar',15000,'utilidad_bruta',v_bruta,'provision',v_provision,'utilidad_neta',round(v_bruta-v_provision,2))
   where liquidation_id=p_id and operation_id=o.id;
 end loop;

 update public.liquidations l set
  total_bonos=(select coalesce(sum(valor),0) from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado'),
  total_utilidad_creditek=(select coalesce(sum(utilidad_creditek),0) from public.liquidation_operations where liquidation_id=p_id and reconocida),
  total_utilidad_tiendas=(select coalesce(sum(utilidad_creditek),0) from public.liquidation_operations where liquidation_id=p_id and reconocida and tipo_establecimiento='propia'),
  total_pagar=coalesce(total_pago_aliados,0)+(select coalesce(sum(valor),0) from public.liquidation_bonuses where liquidation_id=p_id and estado='aprobado'),
  updated_at=now()
 where l.id=p_id returning * into v_result;

 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
 values(auth.uid(),'krediya_bonos_y_provision_calculados','liquidations',p_id,jsonb_build_object('bono_mayte_por_credito',5000,'bono_operacion_oscar_por_credito',15000,'provision_porcentaje',0.28));
 return v_result;
end$$;

revoke all on function public.aliados_calcular_liquidacion_krediya(uuid) from public,anon;
grant execute on function public.aliados_calcular_liquidacion_krediya(uuid) to authenticated;
