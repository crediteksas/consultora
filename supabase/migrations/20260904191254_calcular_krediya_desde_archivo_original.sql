-- Krediya exports only the 33 source columns. PAGAMOS, payment, bonus and
-- utility belong to KORA's versioned configuration and are never required
-- from the uploaded workbook.
create table if not exists public.krediya_bonus_rules(
 id uuid primary key default gen_random_uuid(),
 tipo_establecimiento text not null check(tipo_establecimiento in('propia','aliado')),
 valor numeric(16,2) not null check(valor>=0),
 vigente_desde date not null,
 vigente_hasta date,
 activo boolean not null default true,
 creado_por uuid references public.perfiles(id) default auth.uid(),
 actualizado_por uuid references public.perfiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(vigente_hasta is null or vigente_hasta>=vigente_desde)
);

create unique index if not exists krediya_bonus_rules_active_key
 on public.krediya_bonus_rules(tipo_establecimiento)
 where activo and vigente_hasta is null;

alter table public.krediya_bonus_rules enable row level security;
drop policy if exists krediya_bonus_rules_select on public.krediya_bonus_rules;
create policy krediya_bonus_rules_select on public.krediya_bonus_rules for select to authenticated
 using(public.tiene_capacidad_aliados('revisor'));
drop policy if exists krediya_bonus_rules_write on public.krediya_bonus_rules;
create policy krediya_bonus_rules_write on public.krediya_bonus_rules for all to authenticated
 using(public.tiene_capacidad_aliados('revisor'))
 with check(public.tiene_capacidad_aliados('revisor'));
grant select,insert,update on public.krediya_bonus_rules to authenticated;

insert into public.krediya_bonus_rules(tipo_establecimiento,valor,vigente_desde)
values ('aliado',30000,'2026-09-01'),('propia',0,'2026-09-01')
on conflict do nothing;

alter function public.aliados_calcular_liquidacion_krediya(uuid)
 rename to aliados_calcular_liquidacion_krediya_archivo_manual;

create or replace function public.aliados_calcular_liquidacion_krediya(p_id uuid)
returns public.liquidations
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 o public.liquidation_operations%rowtype;
 r public.krediya_price_rules%rowtype;
 br public.krediya_bonus_rules%rowtype;
 v_pagamos numeric;
 v_pago numeric;
 v_bono numeric;
 v_utilidad numeric;
 v_data jsonb;
 v_key text;
begin
 if not public.tiene_capacidad_aliados('revisor') then
  raise exception 'No autorizado para calcular';
 end if;

 for o in
  select * from public.liquidation_operations
  where liquidation_id=p_id and plataforma='krediya'
  order by operation_at,id
  for update
 loop
  v_data:=coalesce(o.normalized_data,'{}'::jsonb);
  if v_data ? 'pagamosArchivo' and nullif(v_data->>'pagamosArchivo','') is not null then
   continue;
  end if;

  v_key:=lower(btrim(coalesce(o.modelo,o.referencia,'')));
  select * into r from public.krediya_price_rules
   where referencia_clave=v_key and activo
    and vigente_desde<=o.operation_at::date
    and (vigente_hasta is null or vigente_hasta>=o.operation_at::date)
   order by vigente_desde desc limit 1;
  if not found then
   continue;
  end if;

  select * into br from public.krediya_bonus_rules
   where tipo_establecimiento=o.tipo_establecimiento and activo
    and vigente_desde<=o.operation_at::date
    and (vigente_hasta is null or vigente_hasta>=o.operation_at::date)
   order by vigente_desde desc limit 1;
  if not found then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
   values(p_id,o.id,'krediya_bono_sin_configurar','Falta configurar el bono Krediya vigente para este tipo de establecimiento')
   on conflict do nothing;
   continue;
  end if;

  v_pagamos:=r.pagamos;
  v_pago:=v_pagamos-coalesce(o.inicial,0);
  v_bono:=br.valor;
  v_utilidad:=coalesce(o.monto_credito,o.monto_base)-v_pago-v_bono;
  if v_pago<0 or v_utilidad<0 then
   insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion)
   values(p_id,o.id,'krediya_formula_inconsistente','El tarifario genera un pago o una utilidad negativa; requiere revisión administrativa')
   on conflict do nothing;
   continue;
  end if;

  update public.liquidation_operations
   set normalized_data=v_data||jsonb_build_object(
    'pagamosArchivo',v_pagamos,
    'pagoNetoArchivo',v_pago,
    'bonoArchivo',v_bono,
    'utilidadArchivo',v_utilidad,
    'origenValoresLiquidacion','tarifario_kora',
    'reglaPrecioId',r.id,
    'reglaBonoId',br.id
   )
   where id=o.id;
 end loop;

 return public.aliados_calcular_liquidacion_krediya_archivo_manual(p_id);
end$$;

revoke all on function public.aliados_calcular_liquidacion_krediya(uuid) from public,anon;
grant execute on function public.aliados_calcular_liquidacion_krediya(uuid) to authenticated;
