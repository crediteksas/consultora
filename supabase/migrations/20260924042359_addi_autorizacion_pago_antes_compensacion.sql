-- La aprobación de la liquidación no autoriza el abono a la tienda.
alter table public.addi_liquidaciones
  add column pago_autorizado_por uuid references public.perfiles(id),
  add column pago_autorizado_at timestamptz,
  add column pago_autorizado_valor numeric(16,2),
  add constraint addi_pago_autorizacion_completa check (
    (pago_autorizado_por is null and pago_autorizado_at is null and pago_autorizado_valor is null)
    or (pago_autorizado_por is not null and pago_autorizado_at is not null
      and pago_autorizado_valor is not null and pago_autorizado_valor > 0)
  );

create function cobros_private.addi_pago_autorizar(p_addi_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.addi_liquidaciones%rowtype;
  e public.cobros_expected%rowtype;
  v_recibido numeric;
  v_compensacion uuid;
begin
  if not public.es_autorizador_pagos() then
    raise exception 'Solo Oscar Pacheco puede autorizar el abono Addi a la tienda';
  end if;
  select * into a from public.addi_liquidaciones where id=p_addi_id for update;
  if not found or a.estado <> 'aprobada' then
    raise exception 'La liquidación Addi debe estar aprobada';
  end if;
  if a.pago_autorizado_at is not null then
    raise exception 'Este abono Addi ya fue autorizado; actualiza Tesorería';
  end if;
  if a.pago_tienda is null or a.pago_tienda <= 0 or a.neto_estimado is null then
    raise exception 'Faltan los valores pactados de la liquidación Addi';
  end if;
  if not exists(select 1 from public.origenes o
    where o.codigo=a.tienda_codigo and o.activo and o.tipo='propia') then
    raise exception 'Esta autorización corresponde solo a tiendas propias';
  end if;
  if exists(select 1 from public.ventas v where v.id=a.venta_id and v.anulada) then
    raise exception 'No se puede autorizar una venta anulada';
  end if;
  select * into e from public.cobros_expected where id=a.cobro_expected_id for update;
  if not found or e.estado<>'activo' or e.importe<>a.neto_estimado then
    raise exception 'El cobro esperado no coincide con la liquidación Addi';
  end if;
  select coalesce(sum(ca.importe),0) into v_recibido
    from public.cobros_allocations ca
    join public.cobros_deposits d on d.id=ca.deposit_id and d.estado='activo'
    where ca.expected_id=e.id and ca.estado='activo';
  if v_recibido<>e.importe then
    raise exception 'Primero concilia el ingreso bancario completo de Addi';
  end if;
  update public.addi_liquidaciones set
    pago_autorizado_por=auth.uid(),pago_autorizado_at=now(),
    pago_autorizado_valor=a.pago_tienda,updated_at=now()
    where id=a.id;
  -- La compensación queda solo preparada, nunca aplicada por esta autorización.
  v_compensacion:=cobros_private.addi_preparar_compensacion(a.id);
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'addi_pago_tienda_autorizado','addi_liquidaciones',a.id,
      jsonb_build_object('venta',a.consecutivo,'tienda',a.tienda_codigo,
        'valor',a.pago_tienda,'cobro_expected_id',e.id,'compensacion_id',v_compensacion));
  return jsonb_build_object('addi_id',a.id,'compensacion_id',v_compensacion,
    'pago_tienda',a.pago_tienda,'autorizado_por',auth.uid());
end $$;
revoke all on function cobros_private.addi_pago_autorizar(uuid) from public,anon;
grant execute on function cobros_private.addi_pago_autorizar(uuid) to authenticated;
create function public.addi_pago_autorizar(p_addi_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select cobros_private.addi_pago_autorizar(p_addi_id) $$;
revoke all on function public.addi_pago_autorizar(uuid) from public,anon;
grant execute on function public.addi_pago_autorizar(uuid) to authenticated;

-- Bloquea incluso llamadas directas a la preparación o aplicación anteriores.
create function cobros_private.addi_compensacion_exige_autorizacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare a public.addi_liquidaciones%rowtype;
begin
  if new.addi_liquidacion_id is null then return new; end if;
  if tg_op='INSERT' or (new.applied_at is distinct from old.applied_at and new.applied_at is not null) then
    select * into a from public.addi_liquidaciones where id=new.addi_liquidacion_id;
    if a.pago_autorizado_at is null or a.pago_autorizado_por is null
      or a.pago_autorizado_valor is distinct from new.compensation_value
      or a.pago_tienda is distinct from new.compensation_value then
      raise exception 'El abono Addi requiere autorización individual de Oscar por el valor pactado';
    end if;
  end if;
  return new;
end $$;
create trigger addi_compensacion_autorizacion_guard
  before insert or update of applied_at on public.retail_b2b_compensations
  for each row execute function cobros_private.addi_compensacion_exige_autorizacion();
revoke all on function cobros_private.addi_compensacion_exige_autorizacion() from public,anon,authenticated;

create function cobros_private.addi_pago_autorizado_inmutable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.pago_autorizado_at is not null and (
    new.pago_tienda is distinct from old.pago_tienda
    or new.pago_autorizado_valor is distinct from old.pago_autorizado_valor
    or new.pago_autorizado_por is distinct from old.pago_autorizado_por
    or new.pago_autorizado_at is distinct from old.pago_autorizado_at
  ) then raise exception 'El pago Addi autorizado es inmutable; requiere rectificación auditada'; end if;
  return new;
end $$;
create trigger addi_pago_autorizado_inmutable_guard
  before update on public.addi_liquidaciones
  for each row execute function cobros_private.addi_pago_autorizado_inmutable();
revoke all on function cobros_private.addi_pago_autorizado_inmutable() from public,anon,authenticated;

create or replace function cobros_private.addi_tesoreria_listar()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not cobros_private.autorizado(false) then raise exception 'Acceso a Addi no autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'venta_id',a.venta_id,'consecutivo',a.consecutivo,
      'tienda_codigo',a.tienda_codigo,'tienda',o.nombre,'tipo_tienda',o.tipo,
      'fecha_venta',a.fecha_venta,'fecha_esperada',a.fecha_esperada,
      'credito_bruto',a.credito_bruto,'tarifa_addi',a.tarifa_addi,
      'iva_tarifa',a.iva_tarifa,'neto_estimado',a.neto_estimado,
      'pago_tienda',a.pago_tienda,'utilidad_creditek',a.utilidad_creditek,
      'pago_autorizado_por',a.pago_autorizado_por,
      'pago_autorizado_at',a.pago_autorizado_at,
      'pago_autorizado_valor',a.pago_autorizado_valor,
      'recibido',coalesce(rec.valor,0),'cobro_estado',e.estado,
      'compensacion_id',comp.id,'compensacion_aplicada',comp.applied_at
    ) order by a.fecha_venta desc,a.consecutivo desc)
    from public.addi_liquidaciones a
    join public.origenes o on o.codigo=a.tienda_codigo
    join public.cobros_expected e on e.id=a.cobro_expected_id
    left join lateral (
      select sum(ca.importe) valor from public.cobros_allocations ca
      join public.cobros_deposits d on d.id=ca.deposit_id and d.estado='activo'
      where ca.expected_id=e.id and ca.estado='activo'
    ) rec on true
    left join lateral (
      select c.id,c.applied_at from public.retail_b2b_compensations c
      where c.addi_liquidacion_id=a.id and c.reversed_at is null limit 1
    ) comp on true
    where a.estado='aprobada'
  ),'[]'::jsonb);
end $$;
