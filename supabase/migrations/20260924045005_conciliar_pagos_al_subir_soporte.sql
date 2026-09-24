-- El comprobante del giro es el cierre bancario operativo: no requiere un clic adicional.
-- Se conserva la función anterior como núcleo de validación/pago, inaccesible al cliente.
alter function public.tesoreria_cerrar_pagos_con_soporte(uuid[],text)
  rename to tesoreria_cerrar_pagos_con_soporte_base;
revoke all on function public.tesoreria_cerrar_pagos_con_soporte_base(uuid[],text)
  from public,anon,authenticated;

create function kora_private.conciliar_pago_con_soporte(p_id uuid,p_origen text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v public.payment_orders%rowtype;
  v_metadata jsonb;
begin
  select * into v from public.payment_orders where id=p_id for update;
  if not found then raise exception 'Orden de pago no encontrada'; end if;
  if v.estado='conciliado' then return false; end if;
  if v.estado<>'pagado' or v.historico_inicial
    or v.authorized_by is null or v.authorized_at is null
    or v.fecha_pagada is null or nullif(v.soporte_path,'') is null then
    raise exception 'Solo se concilian pagos autorizados y registrados con soporte';
  end if;
  select o.metadata into v_metadata from storage.objects o
    where o.bucket_id='soportes' and o.name=v.soporte_path;
  if not found or coalesce(v_metadata->>'mimetype','') not in
      ('application/pdf','image/jpeg','image/png')
    or coalesce((v_metadata->>'size')::bigint,0) not between 1 and 10485760 then
    raise exception 'El soporte del pago no está disponible o no es válido';
  end if;
  update public.payment_orders set estado='conciliado',updated_at=now()
    where id=v.id and estado='pagado';
  insert into public.liquidation_domain_events(
    event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('payment.completed','payment',v.id,
    case when v.payment_kind='ejecutivo' then
      jsonb_build_object('payment_id',v.id,'liquidation_id',v.liquidation_id,
        'period',v.cutoff_snapshot,'bonuses',v.own_bonuses,
        'amount_paid',v.valor,'support',v.soporte_path,
        'authorized_by',v.authorized_by)
    else jsonb_build_object('payment_id',v.id,'liquidation_id',v.liquidation_id,
        'platform',v.platform_snapshot,'cutoff',v.cutoff_snapshot,
        'operations',v.operations_count,'amount_paid',v.valor,
        'support',v.soporte_path,'authorized_by',v.authorized_by) end,
    v.id||':conciliado')
  on conflict(idempotency_key) do nothing;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
  values(case when p_origen='migracion' then null else auth.uid()::text end,
    'aliados_pago_conciliado_por_soporte','payment_orders',v.id::text,
    jsonb_build_object('origen',p_origen,'soporte_path',v.soporte_path,
      'estado_anterior','pagado','estado_nuevo','conciliado',
      'sin_nuevo_debito',true));
  if v.liquidation_id is not null and not exists(
    select 1 from public.payment_orders p
    where p.liquidation_id=v.liquidation_id and p.estado<>'conciliado'
  ) then
    update public.liquidations set estado='conciliada',updated_at=now()
      where id=v.liquidation_id and estado in
        ('aprobada','programada','pagada','conciliada');
  end if;
  return true;
end $$;
revoke all on function kora_private.conciliar_pago_con_soporte(uuid,text)
  from public,anon,authenticated;

create function public.tesoreria_cerrar_pagos_con_soporte(p_ids uuid[],p_soporte_path text)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer; v_id uuid;
begin
  -- La función original verifica rol, autorización, lote, cuenta, importe y archivo;
  -- registra el pago y el débito exactamente una vez.
  v_count:=public.tesoreria_cerrar_pagos_con_soporte_base(p_ids,p_soporte_path);
  for v_id in select id from public.payment_orders where id=any(p_ids) order by id loop
    perform kora_private.conciliar_pago_con_soporte(v_id,'soporte_registrado');
  end loop;
  return v_count;
end $$;
revoke all on function public.tesoreria_cerrar_pagos_con_soporte(uuid[],text)
  from public,anon;
grant execute on function public.tesoreria_cerrar_pagos_con_soporte(uuid[],text)
  to authenticated;

-- Cierre del rezago existente: solo órdenes no históricas, autorizadas,
-- con fecha de pago y soporte real válido. No se genera ningún débito nuevo.
do $$
declare v_id uuid;
begin
  for v_id in
    select p.id from public.payment_orders p
    join storage.objects o on o.bucket_id='soportes' and o.name=p.soporte_path
    where p.estado='pagado' and not p.historico_inicial
      and p.authorized_by is not null and p.authorized_at is not null
      and p.fecha_pagada is not null
      and coalesce(o.metadata->>'mimetype','') in
        ('application/pdf','image/jpeg','image/png')
      and coalesce((o.metadata->>'size')::bigint,0) between 1 and 10485760
    order by p.id
  loop
    perform kora_private.conciliar_pago_con_soporte(v_id,'migracion');
  end loop;
end $$;
