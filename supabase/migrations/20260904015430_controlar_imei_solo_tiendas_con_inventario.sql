alter table public.origenes
  add column if not exists inventario_control_activo boolean not null default false,
  add column if not exists inventario_control_desde timestamptz;

comment on column public.origenes.inventario_control_activo is
  'Activa la conciliación obligatoria por IMEI únicamente después de cargar el inventario completo de la tienda.';
comment on column public.origenes.inventario_control_desde is
  'Fecha desde la cual las operaciones de la tienda deben existir en Inventario, Ventas y Créditos de KORA.';

update public.origenes o
set inventario_control_activo = true,
    inventario_control_desde = coalesce(
      o.inventario_control_desde,
      (select min(u.created_at) from public.unidades u where u.tienda_actual = o.codigo),
      now()
    )
where o.codigo = 'CK-02';

update public.liquidation_incidents i
set bloquea_aprobacion = false,
    descripcion = case
      when i.tipo = 'imei_no_existe'
        then 'La tienda todavía no tiene su inventario completo cargado en KORA. El IMEI queda informativo y no bloquea esta liquidación.'
      else i.descripcion
    end
from public.liquidation_operations op
left join public.origenes o on o.codigo = op.origen_codigo
where i.operation_id = op.id
  and i.estado = 'abierta'
  and i.tipo in ('imei_no_existe','imei_duplicado','imei_otra_tienda','diferencia_inicial_sin_revisar')
  and not coalesce(
    o.inventario_control_activo
    and (o.inventario_control_desde is null or op.operation_at >= o.inventario_control_desde),
    false
  );

create or replace function public.aliados_resolver_operaciones_propias(p_liquidation_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  o public.liquidation_operations%rowtype;
  v_count integer;
  v_venta uuid;
  v_credito uuid;
  v_unidad uuid;
  v_inicial numeric;
  v_costo numeric;
  v_resueltas integer := 0;
  v_control_inventario boolean;
begin
  if not public.tiene_capacidad_aliados('revisor') then
    raise exception 'No autorizado para revisar Operaciones Retail';
  end if;
  if exists(select 1 from public.liquidations where id=p_liquidation_id and frozen_at is not null) then
    raise exception 'Liquidación aprobada inmutable';
  end if;

  for o in
    select * from public.liquidation_operations
    where liquidation_id=p_liquidation_id and tipo_establecimiento='propia'
  loop
    select coalesce(
      origen.inventario_control_activo
      and (origen.inventario_control_desde is null or o.operation_at >= origen.inventario_control_desde),
      false
    )
    into v_control_inventario
    from public.origenes origen
    where origen.codigo=o.origen_codigo;

    v_control_inventario := coalesce(v_control_inventario,false);

    if not v_control_inventario then
      update public.liquidation_incidents
      set bloquea_aprobacion=false,
          descripcion=case
            when tipo='imei_no_existe'
              then 'La tienda todavía no tiene su inventario completo cargado en KORA. El IMEI queda informativo y no bloquea esta liquidación.'
            else descripcion
          end
      where liquidation_id=p_liquidation_id
        and operation_id=o.id
        and estado='abierta'
        and tipo in ('imei_no_existe','imei_duplicado','imei_otra_tienda','diferencia_inicial_sin_revisar');

      insert into public.liquidation_incidents(
        liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion
      ) values (
        p_liquidation_id,o.id,'imei_no_resuelto',
        'La tienda todavía no tiene su inventario completo cargado en KORA. La conciliación por IMEI se activará cuando finalice la carga inicial.',
        false
      )
      on conflict(liquidation_id,operation_id,tipo) do update
      set descripcion=excluded.descripcion,
          bloquea_aprobacion=false;
      continue;
    end if;

    select count(*),min(v.id::text)::uuid,min(c.id::text)::uuid,min(u.id::text)::uuid,
      min(c.cuota_inicial),min(coalesce(u.costo_remision,u.precio_tienda))
    into v_count,v_venta,v_credito,v_unidad,v_inicial,v_costo
    from public.venta_items vi
    join public.ventas v on v.id=vi.venta_id
    join public.creditos c on c.venta_id=v.id
    join public.unidades u on u.id=vi.unidad_id
    where regexp_replace(coalesce(u.imei,''),'[^0-9A-Za-z]','','g')=regexp_replace(coalesce(o.imei,''),'[^0-9A-Za-z]','','g')
      and v.tienda_codigo=o.origen_codigo
      and not coalesce(v.anulada,false);

    delete from public.liquidation_incidents
    where liquidation_id=p_liquidation_id
      and operation_id=o.id
      and tipo in('imei_no_existe','imei_duplicado','imei_otra_tienda','diferencia_inicial_sin_revisar');

    if v_count=0 then
      if exists(
        select 1 from public.unidades u
        where regexp_replace(coalesce(u.imei,''),'[^0-9A-Za-z]','','g')=regexp_replace(coalesce(o.imei,''),'[^0-9A-Za-z]','','g')
      ) then
        insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
        values(p_liquidation_id,o.id,'imei_otra_tienda','El IMEI existe en KORA, pero no pertenece a la tienda reportada',true)
        on conflict do nothing;
      else
        insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
        values(p_liquidation_id,o.id,'imei_no_existe','El IMEI no tiene una venta o crédito válido en KORA',true)
        on conflict do nothing;
      end if;
      continue;
    elsif v_count>1 then
      insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
      values(p_liquidation_id,o.id,'imei_duplicado','El IMEI está asociado a más de una venta o crédito',true)
      on conflict do nothing;
      continue;
    end if;

    update public.liquidation_operations
    set venta_id=v_venta,
        credito_id=v_credito,
        unidad_id=v_unidad,
        inicial_kora=v_inicial,
        diferencia_inicial=case when plataforma='payjoy' then v_inicial-inicial else inicial-v_inicial end,
        costo_equipo=v_costo,
        snapshot_tienda_at=now()
    where id=o.id;

    if v_inicial is distinct from o.inicial then
      insert into public.liquidation_incidents(liquidation_id,operation_id,tipo,descripcion,bloquea_aprobacion)
      values(p_liquidation_id,o.id,'diferencia_inicial_sin_revisar','La inicial registrada en KORA difiere de la reportada por la plataforma',true)
      on conflict do nothing;
    end if;
    v_resueltas := v_resueltas+1;
  end loop;

  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(
    auth.uid(),'aliados_tiendas_resueltas','liquidations',p_liquidation_id,
    jsonb_build_object('operaciones_con_inventario_conciliadas',v_resueltas)
  );
  return v_resueltas;
end;
$$;

revoke all on function public.aliados_resolver_operaciones_propias(uuid) from public,anon;
grant execute on function public.aliados_resolver_operaciones_propias(uuid) to authenticated;
