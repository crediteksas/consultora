begin;

-- Addi pasa por revisión y aprobación antes de aparecer en Tesorería.
alter table public.cobros_expected drop constraint if exists cobros_expected_fuente_tipo_check;
alter table public.cobros_expected add constraint cobros_expected_fuente_tipo_check
  check (fuente_tipo in ('neto_confirmado', 'estimacion_venta'));
alter table public.cobros_expected
  add column venta_id uuid references public.ventas(id),
  add column credito_bruto numeric(16,2),
  add column tarifa_addi numeric(16,2),
  add column iva_tarifa numeric(16,2);
create unique index cobros_addi_venta_unica on public.cobros_expected(venta_id)
  where venta_id is not null;

create table public.addi_liquidaciones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null unique references public.ventas(id),
  credito_id uuid not null unique references public.creditos(id),
  fecha_venta date not null,
  tienda_codigo text not null,
  consecutivo bigint not null,
  vendedor uuid not null references public.perfiles(id),
  credito_bruto numeric(16,2) not null check (credito_bruto > 0),
  tarifa_addi numeric(16,2) not null check (tarifa_addi >= 0),
  iva_tarifa numeric(16,2) not null check (iva_tarifa >= 0),
  neto_estimado numeric(16,2) not null check (neto_estimado > 0),
  fecha_esperada date not null,
  estado text not null default 'pendiente_revision'
    check (estado in ('pendiente_revision', 'revisada', 'aprobada', 'anulada')),
  revisada_por uuid references public.perfiles(id),
  revisada_at timestamptz,
  aprobada_por uuid references public.perfiles(id),
  aprobada_at timestamptz,
  cobro_expected_id uuid unique references public.cobros_expected(id),
  updated_at timestamptz not null default now()
);
create index addi_liquidaciones_estado_fecha on public.addi_liquidaciones(estado,fecha_venta);
alter table public.addi_liquidaciones enable row level security;
revoke all on public.addi_liquidaciones from public,anon,authenticated;
grant select on public.addi_liquidaciones to authenticated;
create policy addi_liquidaciones_lectura on public.addi_liquidaciones
  for select to authenticated using ((select cobros_private.autorizado(false)));

create function cobros_private.sincronizar_venta_addi()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v public.ventas%rowtype;
  a public.addi_liquidaciones%rowtype;
  fee numeric(16,2);
  tax numeric(16,2);
  net numeric(16,2);
begin
  select * into v from public.ventas where id = new.venta_id;
  if not found then raise exception 'Venta del crédito no encontrada'; end if;
  select * into a from public.addi_liquidaciones where venta_id = new.venta_id for update;

  if lower(btrim(coalesce(new.financiera,''))) <> 'addi' or v.anulada then
    if a.id is not null and a.estado <> 'anulada' then
      if a.cobro_expected_id is not null then
        if exists (select 1 from public.cobros_allocations ca
                   where ca.expected_id = a.cobro_expected_id and ca.estado = 'activo') then
          raise exception 'La venta Addi tiene abonos aplicados; Gestión debe conciliarla antes de cambiarla';
        end if;
        update public.cobros_expected set estado = 'anulado' where id = a.cobro_expected_id;
      end if;
      update public.addi_liquidaciones set estado = 'anulada', updated_at = now() where id = a.id;
    end if;
    return new;
  end if;

  if new.valor_esperado_financiera is null or new.valor_esperado_financiera <= 0
     or new.cuota_inicial is null or new.cuota_inicial < 0
     or new.cuota_inicial + new.valor_esperado_financiera <> v.total then
    raise exception 'El valor del crédito Addi y la cuota inicial deben sumar el total de la venta';
  end if;
  fee := round(new.valor_esperado_financiera * 0.075, 2);
  tax := round(fee * 0.19, 2);
  net := new.valor_esperado_financiera - fee - tax;

  if a.id is not null then
    if a.estado = 'anulada' then
      raise exception 'La liquidación Addi fue anulada; Gestión debe revisarla antes de reactivarla';
    end if;
    if a.estado = 'aprobada' and
      (a.credito_bruto, a.fecha_venta, a.neto_estimado)
        is distinct from (new.valor_esperado_financiera, v.fecha, net) then
      raise exception 'La liquidación Addi ya fue aprobada; primero concilia o revierte el cobro';
    end if;
    if a.estado = 'aprobada' then return new; end if;
    update public.addi_liquidaciones set
      credito_bruto = new.valor_esperado_financiera, tarifa_addi = fee,
      iva_tarifa = tax, neto_estimado = net, fecha_esperada = v.fecha + 15,
      fecha_venta = v.fecha, tienda_codigo = v.tienda_codigo,
      estado = case when (credito_bruto,fecha_venta,neto_estimado)
                      is distinct from (new.valor_esperado_financiera,v.fecha,net)
                   then 'pendiente_revision' else estado end,
      revisada_por = case when (credito_bruto,fecha_venta,neto_estimado)
                         is distinct from (new.valor_esperado_financiera,v.fecha,net)
                      then null else revisada_por end,
      revisada_at = case when (credito_bruto,fecha_venta,neto_estimado)
                         is distinct from (new.valor_esperado_financiera,v.fecha,net)
                      then null else revisada_at end,
      updated_at = now()
    where id = a.id;
    return new;
  end if;

  insert into public.addi_liquidaciones (
    venta_id,credito_id,fecha_venta,tienda_codigo,consecutivo,vendedor,
    credito_bruto,tarifa_addi,iva_tarifa,neto_estimado,fecha_esperada
  ) values (
    v.id,new.id,v.fecha,v.tienda_codigo,v.consecutivo,v.vendedor,
    new.valor_esperado_financiera,fee,tax,net,v.fecha + 15
  );
  return new;
end;
$$;
revoke all on function cobros_private.sincronizar_venta_addi()
  from public,anon,authenticated;
create trigger cobros_venta_addi
  after insert or update of financiera,valor_esperado_financiera,cuota_inicial
  on public.creditos for each row
  execute function cobros_private.sincronizar_venta_addi();

create function cobros_private.anular_venta_addi()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.addi_liquidaciones%rowtype;
begin
  if new.anulada and not old.anulada then
    select * into a from public.addi_liquidaciones where venta_id = new.id for update;
    if found and a.estado <> 'anulada' then
      if a.cobro_expected_id is not null then
        if exists (select 1 from public.cobros_allocations ca
                   where ca.expected_id = a.cobro_expected_id and ca.estado = 'activo') then
          raise exception 'La venta Addi tiene un abono aplicado; Gestión debe conciliarlo antes de anular';
        end if;
        update public.cobros_expected set estado = 'anulado' where id = a.cobro_expected_id;
      end if;
      update public.addi_liquidaciones set estado = 'anulada', updated_at = now() where id = a.id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function cobros_private.anular_venta_addi()
  from public,anon,authenticated;
create trigger cobros_anular_venta_addi after update of anulada on public.ventas
  for each row execute function cobros_private.anular_venta_addi();

create function cobros_private.addi_liquidaciones_listar()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not cobros_private.autorizado(false) then raise exception 'Acceso a Addi no autorizado'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.fecha_venta desc,a.consecutivo desc)
                   from public.addi_liquidaciones a),'[]'::jsonb);
end;
$$;
revoke all on function cobros_private.addi_liquidaciones_listar() from public,anon;
grant execute on function cobros_private.addi_liquidaciones_listar() to authenticated;
create function public.addi_liquidaciones_listar()
returns jsonb language sql stable security invoker set search_path = '' as
$$select cobros_private.addi_liquidaciones_listar()$$;
revoke all on function public.addi_liquidaciones_listar() from public,anon;
grant execute on function public.addi_liquidaciones_listar() to authenticated;

create function cobros_private.addi_liquidacion_revisar(p_venta_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.addi_liquidaciones%rowtype;
begin
  if not cobros_private.autorizado(false) then raise exception 'Solo Auditoría o Gerencia pueden revisar Addi'; end if;
  update public.addi_liquidaciones set estado = 'revisada',
    revisada_por = auth.uid(), revisada_at = now(), updated_at = now()
  where venta_id = p_venta_id and estado = 'pendiente_revision'
  returning * into a;
  if not found then raise exception 'La venta no está pendiente de revisión'; end if;
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'addi_liquidacion_revisada','addi_liquidaciones',a.id,
           jsonb_build_object('venta_id',a.venta_id,'neto_estimado',a.neto_estimado));
  return to_jsonb(a);
end;
$$;
revoke all on function cobros_private.addi_liquidacion_revisar(uuid) from public,anon;
grant execute on function cobros_private.addi_liquidacion_revisar(uuid) to authenticated;
create function public.addi_liquidacion_revisar(p_venta_id uuid)
returns jsonb language sql security invoker set search_path = '' as
$$select cobros_private.addi_liquidacion_revisar(p_venta_id)$$;
revoke all on function public.addi_liquidacion_revisar(uuid) from public,anon;
grant execute on function public.addi_liquidacion_revisar(uuid) to authenticated;

create function cobros_private.addi_liquidacion_aprobar(p_venta_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.addi_liquidaciones%rowtype;
declare e_id uuid;
begin
  if not cobros_private.autorizado(true) then raise exception 'Solo Gerencia puede aprobar Addi'; end if;
  select * into a from public.addi_liquidaciones
    where venta_id = p_venta_id for update;
  if not found or a.estado <> 'revisada' then
    raise exception 'La venta Addi debe estar revisada antes de aprobarse';
  end if;
  if exists (select 1 from public.ventas v where v.id = a.venta_id and v.anulada) then
    raise exception 'No se puede aprobar una venta anulada';
  end if;
  insert into public.cobros_expected (
    plataforma,corte,fecha_esperada,concepto,importe,soporte,
    fuente_tipo,venta_id,credito_bruto,tarifa_addi,iva_tarifa,
    idempotency_key,created_by
  ) values (
    'addi',a.fecha_venta,a.fecha_esperada,
    'Venta Addi #' || a.consecutivo || ' · ' || a.tienda_codigo,
    a.neto_estimado,'Venta KORA ' || a.venta_id,
    'estimacion_venta',a.venta_id,a.credito_bruto,a.tarifa_addi,a.iva_tarifa,
    gen_random_uuid(),auth.uid()
  ) returning id into e_id;
  update public.addi_liquidaciones set estado = 'aprobada',
    aprobada_por = auth.uid(), aprobada_at = now(), cobro_expected_id = e_id,
    updated_at = now() where id = a.id returning * into a;
  perform cobros_private.evento('expected_creado',e_id,
    jsonb_build_object('origen','venta_addi','venta_id',a.venta_id,'neto_estimado',a.neto_estimado));
  insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
    values(auth.uid(),'addi_liquidacion_aprobada','addi_liquidaciones',a.id,
           jsonb_build_object('venta_id',a.venta_id,'cobro_expected_id',e_id));
  return to_jsonb(a);
end;
$$;
revoke all on function cobros_private.addi_liquidacion_aprobar(uuid) from public,anon;
grant execute on function cobros_private.addi_liquidacion_aprobar(uuid) to authenticated;
create function public.addi_liquidacion_aprobar(p_venta_id uuid)
returns jsonb language sql security invoker set search_path = '' as
$$select cobros_private.addi_liquidacion_aprobar(p_venta_id)$$;
revoke all on function public.addi_liquidacion_aprobar(uuid) from public,anon;
grant execute on function public.addi_liquidacion_aprobar(uuid) to authenticated;

-- Cola histórica: ventas reales de septiembre de 2026, sin crear cobros ni pagos.
insert into public.addi_liquidaciones (
  venta_id,credito_id,fecha_venta,tienda_codigo,consecutivo,vendedor,
  credito_bruto,tarifa_addi,iva_tarifa,neto_estimado,fecha_esperada
)
select v.id,c.id,v.fecha,v.tienda_codigo,v.consecutivo,v.vendedor,
  c.valor_esperado_financiera,
  round(c.valor_esperado_financiera * 0.075,2),
  round(round(c.valor_esperado_financiera * 0.075,2) * 0.19,2),
  c.valor_esperado_financiera - round(c.valor_esperado_financiera * 0.075,2)
    - round(round(c.valor_esperado_financiera * 0.075,2) * 0.19,2),
  v.fecha + 15
from public.creditos c join public.ventas v on v.id = c.venta_id
where lower(btrim(coalesce(c.financiera,''))) = 'addi'
  and v.fecha >= date '2026-09-01' and not v.anulada
  and c.valor_esperado_financiera > 0 and v.vendedor is not null
on conflict (venta_id) do nothing;

commit;
