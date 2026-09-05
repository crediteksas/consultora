-- El pago pactado de Krediya y el seguimiento de diferencias son procesos
-- independientes. Solo la falta de datos indispensables puede detener el lote.
alter table public.krediya_diferencias
  add column if not exists vence_el date;

update public.krediya_diferencias
set vence_el = coalesce(
  vence_el,
  ((contexto->>'calculado_at')::timestamptz at time zone 'America/Bogota')::date + 7,
  (updated_at at time zone 'America/Bogota')::date + 7
)
where vence_el is null;

alter table public.krediya_diferencias
  alter column vence_el set default ((now() at time zone 'America/Bogota')::date + 7),
  alter column vence_el set not null;

create index if not exists krediya_diferencias_vencimiento_idx
  on public.krediya_diferencias(estado, vence_el)
  where estado <> 'resuelta';

-- Normaliza las alertas antiguas. Se conservan abiertas y auditables para el
-- informe, pero no obligan a Gerencia a aprobar crédito por crédito.
update public.liquidation_incidents i
set bloquea_aprobacion = false
from public.liquidations l
where l.id = i.liquidation_id
  and l.plataforma = 'krediya'
  and i.estado = 'abierta'
  and i.tipo in (
    'krediya_regla_precio_ausente',
    'krediya_precio_venta_diferente',
    'krediya_pagamos_diferente',
    'novedad_administrativa'
  );

-- Una anotación administrativa de Krediya alimenta el informe posterior. No
-- cambia el estado del lote ni detiene el pago basado en PAGAMOS.
create or replace function public.aliados_reportar_novedad(
  p_id uuid,
  p_operation_id uuid,
  p_descripcion text
)
returns public.liquidation_incidents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i public.liquidation_incidents%rowtype;
  v_plataforma text;
  v_seguimiento boolean;
begin
  if auth.uid() is null or not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado para reportar novedades';
  end if;
  if nullif(btrim(p_descripcion),'') is null then
    raise exception 'La descripción es obligatoria';
  end if;

  select plataforma into v_plataforma
  from public.liquidations
  where id = p_id and frozen_at is null
  for update;
  if not found then raise exception 'Liquidación no encontrada o aprobada'; end if;

  v_seguimiento := v_plataforma = 'krediya';
  insert into public.liquidation_incidents(
    liquidation_id, operation_id, tipo, descripcion, bloquea_aprobacion
  ) values (
    p_id, p_operation_id, 'novedad_administrativa', btrim(p_descripcion), not v_seguimiento
  ) returning * into i;

  if not v_seguimiento then
    update public.liquidations
    set estado = 'con_novedades', updated_at = now()
    where id = p_id and estado <> 'con_novedades';
  end if;

  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(
    auth.uid(), 'aliados_novedad_reportada', 'liquidations', p_id,
    jsonb_build_object(
      'descripcion', btrim(p_descripcion),
      'bloquea_aprobacion', not v_seguimiento,
      'seguimiento_dias', case when v_seguimiento then 7 else null end
    )
  );
  return i;
end;
$$;

revoke all on function public.aliados_reportar_novedad(uuid,uuid,text) from public, anon;
grant execute on function public.aliados_reportar_novedad(uuid,uuid,text) to authenticated;
