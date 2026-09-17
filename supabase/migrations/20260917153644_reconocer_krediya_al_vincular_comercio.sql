-- Una venta Krediya firmada no debe permanecer excluida después de que un
-- revisor vincula su comercio. La vinculación no calcula ni autoriza pagos;
-- únicamente corrige la identidad operativa que impedía reconocer la venta.

create or replace function kora_private.reconocer_krediya_al_vincular_comercio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado_contrato text;
begin
  if new.plataforma = 'krediya'
    and not coalesce(new.reconocida, false)
    and new.origen_codigo is not null
    and new.tipo_establecimiento in ('propia', 'aliado')
    and (
      old.origen_codigo is distinct from new.origen_codigo
      or old.tipo_establecimiento is distinct from new.tipo_establecimiento
    ) then
    v_estado_contrato := lower(btrim(coalesce(
      new.normalized_data->>'estadoContrato',
      new.normalized_data#>>'{movimientos,0,original,estado del contrato}',
      new.normalized_data#>>'{movimientos,0,original,__original,Estado del contrato}',
      ''
    )));

    if v_estado_contrato = 'firmado' then
      new.reconocida := true;
      new.normalized_data := coalesce(new.normalized_data, '{}'::jsonb)
        || jsonb_build_object('reconocida', true);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function kora_private.reconocer_krediya_al_vincular_comercio()
  from public, anon, authenticated;

drop trigger if exists reconocer_krediya_al_vincular_comercio
  on public.liquidation_operations;

create trigger reconocer_krediya_al_vincular_comercio
before update of origen_codigo, tipo_establecimiento
on public.liquidation_operations
for each row
execute function kora_private.reconocer_krediya_al_vincular_comercio();

do $$
declare
  v_corregidas integer;
  v_ids uuid[];
begin
  with corregidas as (
    update public.liquidation_operations op
    set reconocida = true,
        normalized_data = coalesce(op.normalized_data, '{}'::jsonb)
          || jsonb_build_object('reconocida', true)
    from public.liquidations l
    where op.liquidation_id = l.id
      and (op.imei, op.establishment_name) in (
        ('867754080301108', 'A WORDCELL COMUNICACIONES'),
        ('351468680022856', 'A ALFER MOVIL AP')
      )
      and op.plataforma = 'krediya'
      and not op.reconocida
      and op.origen_codigo is not null
      and op.tipo_establecimiento in ('propia', 'aliado')
      and lower(btrim(coalesce(
        op.normalized_data->>'estadoContrato',
        op.normalized_data#>>'{movimientos,0,original,estado del contrato}',
        op.normalized_data#>>'{movimientos,0,original,__original,Estado del contrato}',
        ''
      ))) = 'firmado'
      and l.frozen_at is null
      and l.approved_at is null
      and not exists (
        select 1
        from public.liquidation_incidents i
        where i.operation_id = op.id
          and i.estado = 'abierta'
      )
    returning op.id
  )
  select count(*), array_agg(id order by id)
  into v_corregidas, v_ids
  from corregidas;

  if v_corregidas <> 2 then
    raise exception 'Se esperaban 2 operaciones Krediya firmadas para corregir y se corrigieron %', v_corregidas;
  end if;

  insert into public.audit_log(usuario, accion, tabla, detalle)
  values (
    null,
    'reconocer_krediya_firmada_tras_vincular_comercio',
    'liquidation_operations',
    jsonb_build_object(
      'operaciones', to_jsonb(v_ids),
      'cantidad', v_corregidas,
      'sin_calcular', true,
      'sin_aprobar', true,
      'sin_generar_pagos', true,
      'motivo', 'El comercio ya estaba vinculado y la fuente Krediya reportaba contrato firmado'
    )
  );
end;
$$;
